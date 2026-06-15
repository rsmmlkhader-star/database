import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { verifyToken } from './auth.routes';
import { query } from '../database/connection';
import { EncryptionService } from '../services/encryption/encryptionService';
import { ConnectorFactory } from '../services/connectors/connectorFactory';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const encryptionService = new EncryptionService();

router.post(
  '/',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, type, host, port, user, password, database } = req.body;

      if (!name || !type || !host || !port || !user || !password || !database) {
        throw new AppError(400, 'Missing required connection parameters');
      }

      // Test connection
      try {
        const connector = ConnectorFactory.create(type);
        await connector.connect({ type, host, port, user, password, database });
        await connector.disconnect();
      } catch (error) {
        throw new AppError(400, `Failed to connect to ${type} database: ${(error as Error).message}`);
      }

      // Encrypt credentials
      const configJson = JSON.stringify({ host, port, user, password, database });
      const encryptedConfig = encryptionService.encrypt(configJson);

      // Store connection
      const connectionId = uuidv4();
      await query(
        `INSERT INTO connections (id, user_id, name, type, host, port, database, config_encrypted, is_encrypted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          connectionId,
          (req as any).userId,
          name,
          type,
          host,
          port,
          database,
          encryptedConfig,
          true
        ]
      );

      logger.info(`Connection created: ${connectionId}`);
      res.status(201).json({
        message: 'Connection created successfully',
        connectionId,
        name,
        type
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await query(
        'SELECT id, user_id, name, type, host, port, database, last_synced_at, created_at FROM connections WHERE id = $1 AND user_id = $2',
        [id, (req as any).userId]
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Connection not found');
      }

      const connection = result.rows[0];

      // Get tables from database
      try {
        const connector = ConnectorFactory.create(connection.type);
        const configResult = await query(
          'SELECT config_encrypted FROM connections WHERE id = $1',
          [id]
        );
        const decryptedConfig = JSON.parse(
          encryptionService.decrypt(configResult.rows[0].config_encrypted)
        );

        await connector.connect(decryptedConfig);
        // Get all tables
        const tables = await query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
        );
        await connector.disconnect();

        res.json({
          ...connection,
          tables: tables.rows.map((t: any) => t.table_name)
        });
      } catch (error) {
        res.json(connection);
      }
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await query(
        'DELETE FROM connections WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, (req as any).userId]
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Connection not found');
      }

      logger.info(`Connection deleted: ${id}`);
      res.json({ message: 'Connection deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export const connectionRoutes = router;
