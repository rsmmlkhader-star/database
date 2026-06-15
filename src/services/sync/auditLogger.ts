import { AuditEntry } from '../types';
import logger from '../utils/logger';
import { query } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';

export class AuditLogger {
  /**
   * Logs an audit entry to the database
   */
  async log(entry: Partial<AuditEntry>): Promise<string> {
    const id = uuidv4();

    try {
      await query(
        `INSERT INTO audit_logs (
          id, connection_id, user_id, user_name, user_email,
          timestamp, sync_id, operation, table_name, row_id,
          source, before_values, after_values, changed_fields,
          conflict_resolved, conflict_strategy, sync_status,
          error_message, duration_ms
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19
        )`,
        [
          id,
          entry.connectionId,
          entry.userId,
          entry.userName,
          entry.userEmail,
          entry.timestamp || new Date(),
          entry.syncId,
          entry.operation,
          entry.tableName,
          Array.isArray(entry.rowId) ? JSON.stringify(entry.rowId) : entry.rowId,
          entry.source,
          JSON.stringify(entry.beforeValues || {}),
          JSON.stringify(entry.afterValues || {}),
          JSON.stringify(entry.changedFields || []),
          entry.conflictResolved || false,
          entry.conflictStrategy,
          entry.syncStatus,
          entry.errorMessage,
          entry.durationMs || 0
        ]
      );

      logger.info(`Audit log created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Failed to log audit entry', error);
      throw error;
    }
  }

  /**
   * Retrieves audit logs with filters
   */
  async getLogs(
    connectionId?: string,
    userId?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<AuditEntry[]> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (connectionId) {
      whereClause += ` AND connection_id = $${params.length + 1}`;
      params.push(connectionId);
    }

    if (userId) {
      whereClause += ` AND user_id = $${params.length + 1}`;
      params.push(userId);
    }

    if (startDate) {
      whereClause += ` AND timestamp >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND timestamp <= $${params.length + 1}`;
      params.push(endDate);
    }

    whereClause += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    try {
      const result = await query(
        `SELECT * FROM audit_logs ${whereClause}`,
        params
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        connectionId: row.connection_id,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        timestamp: row.timestamp,
        syncId: row.sync_id,
        operation: row.operation,
        tableName: row.table_name,
        rowId: row.row_id,
        source: row.source,
        beforeValues: JSON.parse(row.before_values),
        afterValues: JSON.parse(row.after_values),
        changedFields: JSON.parse(row.changed_fields),
        conflictResolved: row.conflict_resolved,
        conflictStrategy: row.conflict_strategy,
        syncStatus: row.sync_status,
        errorMessage: row.error_message,
        durationMs: row.duration_ms
      }));
    } catch (error) {
      logger.error('Failed to retrieve audit logs', error);
      throw error;
    }
  }

  /**
   * Retrieves change history for a specific row
   */
  async getRowHistory(rowId: string, tableName: string): Promise<AuditEntry[]> {
    try {
      const result = await query(
        `SELECT * FROM audit_logs 
         WHERE row_id = $1 AND table_name = $2
         ORDER BY timestamp ASC`,
        [rowId, tableName]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        connectionId: row.connection_id,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        timestamp: row.timestamp,
        syncId: row.sync_id,
        operation: row.operation,
        tableName: row.table_name,
        rowId: row.row_id,
        source: row.source,
        beforeValues: JSON.parse(row.before_values),
        afterValues: JSON.parse(row.after_values),
        changedFields: JSON.parse(row.changed_fields),
        conflictResolved: row.conflict_resolved,
        conflictStrategy: row.conflict_strategy,
        syncStatus: row.sync_status,
        errorMessage: row.error_message,
        durationMs: row.duration_ms
      }));
    } catch (error) {
      logger.error('Failed to retrieve row history', error);
      throw error;
    }
  }
}
