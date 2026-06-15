import { DatabaseConfig, Change, RowMapping, AuditEntry } from '../types';
import logger from '../utils/logger';
import { query } from '../database/connection';

export class ChangeDetector {
  /**
   * Detects differences between database state and sheet state
   */
  async detectChanges(
    tableName: string,
    dbState: any[],
    sheetState: any[],
    rowMappings: Map<string, RowMapping>
  ): Promise<Change[]> {
    const changes: Change[] = [];
    const dbMap = new Map(dbState.map((row) => [this.getRowId(row), row]));
    const sheetMap = new Map(sheetState.map((row) => [row._rowId || row.id, row]));

    // Detect deletions (in DB but not in Sheet)
    for (const [rowId, dbRow] of dbMap.entries()) {
      if (!sheetMap.has(rowId)) {
        changes.push({
          type: 'DELETE',
          source: 'SHEET',
          rowId,
          oldValues: dbRow,
          timestamp: new Date()
        });
      }
    }

    // Detect inserts and updates (in Sheet)
    for (const [rowId, sheetRow] of sheetMap.entries()) {
      if (!dbMap.has(rowId)) {
        // New row
        changes.push({
          type: 'INSERT',
          source: 'SHEET',
          rowId,
          newValues: sheetRow,
          timestamp: new Date()
        });
      } else {
        // Check if values changed
        const dbRow = dbMap.get(rowId)!;
        if (!this.areRowsEqual(dbRow, sheetRow)) {
          changes.push({
            type: 'UPDATE',
            source: 'SHEET',
            rowId,
            oldValues: dbRow,
            newValues: sheetRow,
            timestamp: new Date()
          });
        }
      }
    }

    logger.info(`Detected ${changes.length} changes in ${tableName}`);
    return changes;
  }

  /**
   * Extracts row ID from a database row
   */
  private getRowId(row: any): string {
    // Prefer _rowId metadata column, fallback to id
    return row._rowId || row.id || JSON.stringify(row);
  }

  /**
   * Compares two rows for equality (ignoring metadata columns)
   */
  private areRowsEqual(row1: any, row2: any): boolean {
    const keys1 = Object.keys(row1).filter((k) => !k.startsWith('_'));
    const keys2 = Object.keys(row2).filter((k) => !k.startsWith('_'));

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (row1[key] !== row2[key]) {
        return false;
      }
    }

    return true;
  }
}
