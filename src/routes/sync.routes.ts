import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { verifyToken } from './auth.routes';
import { SyncOrchestrator } from '../services/sync/syncOrchestrator';
import { ConnectorFactory } from '../services/connectors/connectorFactory';
import { EncryptionService } from '../services/encryption/encryptionService';
import { query } from '../database/connection';
import logger from '../utils/logger';
import { getIO } from '../index';

const router = Router();
const syncOrchestrator = new SyncOrchestrator();
const encryptionService = new EncryptionService();

router.post(
  '/start',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { connectionId, tableName, sheetData, conflictStrategy = 'LWW' } = req.body;
      const userId = (req as any).userId;

      if (!connectionId || !tableName || !sheetData) {
        throw new AppError(400, 'connectionId, tableName, and sheetData are required');
      }

      // Verify connection ownership
      const connResult = await query(
        'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
        [connectionId, userId]
      );

      if (connResult.rows.length === 0) {
        throw new AppError(403, 'Connection not found or not authorized');
      }

      const connection = connResult.rows[0];
      const decryptedConfig = JSON.parse(
        encryptionService.decrypt(connection.config_encrypted)
      );

      // Create connector
      const connector = ConnectorFactory.create(connection.type);
      await connector.connect(decryptedConfig);

      // Initiate sync (async)
      const syncPromise = syncOrchestrator.sync(
        connectionId,
        connector,
        tableName,
        sheetData,
        userId,
        conflictStrategy as any
      );

      // Emit event via WebSocket
      const io = getIO();
      io.emit(`sync-started:${connectionId}`, { tableName });

      // Wait for sync to complete and update sheet
      syncPromise.then((result) => {
        io.emit(`sync-completed:${connectionId}`, result);
        connector.disconnect();
      });

      res.json({
        syncId: 'generating',
        status: 'PENDING',
        message: 'Sync initiated'
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:syncId',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { syncId } = req.params;

      const result = await query(
        'SELECT * FROM sync_history WHERE id = $1',
        [syncId]
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Sync not found');
      }

      const syncHistory = result.rows[0];

      res.json({
        syncId: syncHistory.id,
        status: syncHistory.status,
        progress: syncHistory.status === 'IN_PROGRESS' ? 50 : 100,
        totalChanges: syncHistory.total_changes,
        successfulChanges: syncHistory.successful_changes,
        failedChanges: syncHistory.failed_changes,
        conflictsDetected: syncHistory.conflicts_detected,
        duration: syncHistory.duration_ms,
        errorMessage: syncHistory.error_message,
        startedAt: syncHistory.started_at,
        completedAt: syncHistory.completed_at
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:syncId/changes',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { syncId } = req.params;

      const result = await query(
        'SELECT * FROM audit_logs WHERE sync_id = $1 ORDER BY timestamp DESC',
        [syncId]
      );

      res.json({
        syncId,
        changes: result.rows.map((row: any) => ({
          id: row.id,
          operation: row.operation,
          rowId: row.row_id,
          source: row.source,
          before: JSON.parse(row.before_values),
          after: JSON.parse(row.after_values),
          timestamp: row.timestamp
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

export const syncRoutes = router;
