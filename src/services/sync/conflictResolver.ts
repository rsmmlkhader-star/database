import { Change, Conflict } from '../types';
import logger from '../utils/logger';

export type ConflictStrategy = 'LWW' | 'SHEET_WINS' | 'DB_WINS' | 'MANUAL' | 'MERGE';

export class ConflictResolver {
  /**
   * Resolves conflicts using the specified strategy
   */
  async resolveConflicts(
    changes: Change[],
    strategy: ConflictStrategy,
    baseVersion?: Map<string, any>
  ): Promise<{ resolved: Change[]; conflicts: Conflict[] }> {
    const resolved: Change[] = [];
    const conflicts: Conflict[] = [];

    for (const change of changes) {
      if (change.type === 'UPDATE' && change.oldValues && change.newValues) {
        // Check if both DB and Sheet were modified
        const hasConflict = this.detectConflict(change.oldValues, change.newValues);

        if (hasConflict) {
          const conflict = await this.resolveConflict(
            change,
            strategy,
            baseVersion
          );
          conflicts.push(conflict);
          
          // Apply resolved change
          if (conflict.resolvedValue) {
            resolved.push({
              ...change,
              newValues: conflict.resolvedValue
            });
          }
        } else {
          resolved.push(change);
        }
      } else {
        resolved.push(change);
      }
    }

    logger.info(`Resolved ${resolved.length} changes, ${conflicts.length} conflicts`);
    return { resolved, conflicts };
  }

  /**
   * Detects if a conflict exists (simplified)
   */
  private detectConflict(oldValues: any, newValues: any): boolean {
    // A conflict occurs if modified_at times differ significantly
    // For now, return false - this would be enhanced with actual conflict detection
    return false;
  }

  /**
   * Resolves a single conflict based on strategy
   */
  private async resolveConflict(
    change: Change,
    strategy: ConflictStrategy,
    baseVersion?: Map<string, any>
  ): Promise<Conflict> {
    const conflict: Conflict = {
      rowId: change.rowId,
      dbValue: change.oldValues,
      sheetValue: change.newValues,
      resolution: strategy
    };

    switch (strategy) {
      case 'LWW':
        // Last-write-wins: use the value with latest timestamp
        conflict.resolvedValue = change.newValues; // Sheet is assumed later
        break;

      case 'SHEET_WINS':
        conflict.resolvedValue = change.newValues;
        break;

      case 'DB_WINS':
        conflict.resolvedValue = change.oldValues;
        break;

      case 'MERGE':
        // Three-way merge
        if (baseVersion?.has(change.rowId)) {
          const base = baseVersion.get(change.rowId);
          conflict.resolvedValue = this.threeWayMerge(
            base,
            change.oldValues,
            change.newValues
          );
        } else {
          conflict.resolvedValue = change.newValues;
        }
        break;

      case 'MANUAL':
        // No automatic resolution
        break;
    }

    return conflict;
  }

  /**
   * Three-way merge algorithm
   */
  private threeWayMerge(base: any, ours: any, theirs: any): any {
    const merged = { ...base };

    for (const key in base) {
      const baseVal = base[key];
      const ourVal = ours[key];
      const theirVal = theirs[key];

      if (ourVal === theirVal) {
        // Both made same change
        merged[key] = ourVal;
      } else if (ourVal === baseVal) {
        // Only they changed
        merged[key] = theirVal;
      } else if (theirVal === baseVal) {
        // Only we changed
        merged[key] = ourVal;
      } else {
        // Both changed differently - keep ours
        merged[key] = ourVal;
      }
    }

    return merged;
  }
}
