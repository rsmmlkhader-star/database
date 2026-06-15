import { Change, SyncResult, AuditEntry } from '../../types';
import logger from '../../utils/logger';
import { ChangeDetector } from './changeDetector';
import { ConflictResolver, ConflictStrategy } from './conflictResolver';
import { DataValidator } from './dataValidator';
import { AuditLogger } from './auditLogger';
import { BaseConnector } from '../connectors/mysqlConnector';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../database/connection';

export class SyncOrchestrator {
  private changeDetector: ChangeDetector;
  private conflictResolver: ConflictResolver;
  private dataValidator: DataValidator;
  private auditLogger: AuditLogger;

  constructor() {
    this.changeDetector = new ChangeDetector();
    this.conflictResolver = new ConflictResolver();
    this.dataValidator = new DataValidator();
    this.auditLogger = new AuditLogger();
  }

  /**
   * Execute a full synchronization operation
   */
  async sync(
    connectionId: string,
    connector: BaseConnector,
    tableName: string,
    sheetData: any[],
    userId: string,
    conflictStrategy: ConflictStrategy = 'LWW'
  ): Promise<SyncResult> {
    const syncId = uuidv4();
    const startTime = Date.now();
    const changes: Change[] = [];
    const errors: string[] = [];

    try {
      // 1. Log sync start
      await query(
        `INSERT INTO sync_history (id, connection_id, user_id, table_name, status, started_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [syncId, connectionId, userId, tableName, 'IN_PROGRESS']
      );

      // 2. Fetch current DB state
      logger.info(`Fetching DB state for ${tableName}`);
      const dbState = await connector.getTable(tableName);

      // 3. Fetch row mappings
      const mappingResult = await query(
        `SELECT * FROM row_mappings WHERE connection_id = $1 AND table_name = $2`,
        [connectionId, tableName]
      );
      const rowMappings = new Map(
        mappingResult.rows.map((row: any) => [
          row.row_id,
          {
            rowId: row.row_id,
            sheetRowNumber: row.sheet_row_number,
            dbPrimaryKey: row.db_primary_key,
            metadata: row.metadata
          }
        ])
      );

      // 4. Detect changes
      logger.info(`Detecting changes in ${tableName}`);
      const detectedChanges = await this.changeDetector.detectChanges(
        tableName,
        dbState,
        sheetData,
        rowMappings
      );
      changes.push(...detectedChanges);

      if (changes.length === 0) {
        logger.info('No changes detected');
        await this.updateSyncStatus(syncId, 'SUCCESS', 0, 0);
        return {
          syncId,
          status: 'SUCCESS',
          changes: [],
          conflicts: [],
          duration: Date.now() - startTime
        };
      }

      // 5. Fetch validation rules
      const rulesResult = await query(
        `SELECT * FROM validation_rules WHERE connection_id = $1 AND table_name = $2 AND active = true`,
        [connectionId, tableName]
      );
      const validationRules = rulesResult.rows.map((row: any) => ({
        fieldName: row.field_name,
        dataType: row.data_type,
        required: row.required,
        minLength: row.min_length,
        maxLength: row.max_length,
        pattern: row.pattern ? new RegExp(row.pattern) : undefined,
        allowedValues: row.allowed_values,
        errorMessage: row.error_message
      }));

      // 6. Validate all changes
      logger.info(`Validating ${changes.length} changes`);
      for (const change of changes) {
        if (change.newValues) {
          const validationResult = this.dataValidator.validateRow(
            change.newValues,
            validationRules
          );
          if (!validationResult.isValid) {
            errors.push(
              `Row ${change.rowId}: ${validationResult.errors.map((e) => e.message).join(', ')}`
            );
          }
        }
      }

      if (errors.length > 0) {
        logger.error(`Validation failed: ${errors.join('; ')}`);
        await this.updateSyncStatus(
          syncId,
          'FAILURE',
          0,
          0,
          errors.join('; ')
        );
        return {
          syncId,
          status: 'FAILURE',
          changes: [],
          conflicts: [],
          duration: Date.now() - startTime,
          errorMessage: `Validation failed: ${errors.join('; ')}`
        };
      }

      // 7. Resolve conflicts
      logger.info(`Resolving conflicts with strategy: ${conflictStrategy}`);
      const { resolved, conflicts } = await this.conflictResolver.resolveConflicts(
        changes,
        conflictStrategy
      );

      // 8. Begin transaction
      const client = await query('BEGIN', []);

      try {
        // 9. Apply changes to database
        let successCount = 0;
        for (const change of resolved) {
          try {
            if (change.type === 'INSERT' && change.newValues) {
              await connector.insertRow(tableName, change.newValues);
            } else if (change.type === 'UPDATE' && change.newValues) {
              await connector.updateRow(tableName, change.rowId, change.newValues);
            } else if (change.type === 'DELETE') {
              await connector.deleteRow(tableName, change.rowId);
            }

            // 10. Log audit entry
            await this.auditLogger.log({
              connectionId,
              userId,
              syncId,
              operation: change.type,
              tableName,
              rowId: change.rowId,
              source: change.source,
              beforeValues: change.oldValues,
              afterValues: change.newValues,
              changedFields: change.newValues
                ? Object.keys(change.newValues).filter(
                    (k) => change.oldValues?.[k] !== change.newValues[k]
                  )
                : [],
              syncStatus: 'SUCCESS',
              durationMs: 0
            });

            // 11. Update row mapping
            await query(
              `INSERT INTO row_mappings (connection_id, table_name, row_id, last_synced_at, sync_status, version)
               VALUES ($1, $2, $3, NOW(), $4, 1)
               ON CONFLICT (connection_id, table_name, row_id)
               DO UPDATE SET last_synced_at = NOW(), sync_status = $4, version = row_mappings.version + 1`,
              [connectionId, tableName, change.rowId, 'synced']
            );

            successCount++;
          } catch (changeError) {
            logger.error(`Failed to apply change for row ${change.rowId}`, changeError);
            await this.auditLogger.log({
              connectionId,
              userId,
              syncId,
              operation: change.type,
              tableName,
              rowId: change.rowId,
              source: change.source,
              beforeValues: change.oldValues,
              afterValues: change.newValues,
              syncStatus: 'FAILURE',
              errorMessage: (changeError as Error).message,
              durationMs: 0
            });
          }
        }

        // 12. Commit transaction
        await query('COMMIT', []);

        // 13. Update sync history
        await this.updateSyncStatus(
          syncId,
          successCount === resolved.length ? 'SUCCESS' : 'PARTIAL',
          successCount,
          resolved.length - successCount,
          conflicts.length > 0
            ? `${conflicts.length} conflicts resolved using ${conflictStrategy}`
            : undefined
        );

        logger.info(
          `Sync completed: ${successCount}/${resolved.length} changes applied`
        );

        return {
          syncId,
          status: successCount === resolved.length ? 'SUCCESS' : 'PARTIAL',
          changes: resolved,
          conflicts,
          duration: Date.now() - startTime
        };
      } catch (txError) {
        await query('ROLLBACK', []);
        throw txError;
      }
    } catch (error) {
      logger.error('Sync failed', error);

      await this.updateSyncStatus(
        syncId,
        'FAILURE',
        0,
        changes.length,
        (error as Error).message
      );

      return {
        syncId,
        status: 'FAILURE',
        changes: [],
        conflicts: [],
        duration: Date.now() - startTime,
        errorMessage: (error as Error).message
      };
    }
  }

  /**
   * Update sync history status
   */
  private async updateSyncStatus(
    syncId: string,
    status: string,
    successfulChanges: number,
    failedChanges: number,
    errorMessage?: string
  ): Promise<void> {
    await query(
      `UPDATE sync_history 
       SET status = $1, successful_changes = $2, failed_changes = $3, 
           error_message = $4, completed_at = NOW()
       WHERE id = $5`,
      [status, successfulChanges, failedChanges, errorMessage || null, syncId]
    );
  }
}
