import { DatabaseConfig } from '../../types';
import logger from '../../utils/logger';
import mysql from 'mysql2/promise';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
}

export abstract class BaseConnector {
  abstract connect(config: DatabaseConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract getTable(tableName: string): Promise<any[]>;
  abstract getTableSchema(tableName: string): Promise<ColumnInfo[]>;
  abstract insertRow(tableName: string, data: any): Promise<any>;
  abstract updateRow(tableName: string, id: any, data: any): Promise<any>;
  abstract deleteRow(tableName: string, id: any): Promise<any>;
  abstract executeTransaction(operations: any[]): Promise<void>;
}

export class MySQLConnector extends BaseConnector {
  private pool: mysql.Pool | null = null;

  async connect(config: DatabaseConfig): Promise<void> {
    try {
      this.pool = await mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      logger.info('MySQL connection successful');
    } catch (error) {
      logger.error('MySQL connection failed', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('MySQL connection closed');
    }
  }

  async getTable(tableName: string): Promise<any[]> {
    if (!this.pool) throw new Error('Database not connected');

    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(
        `SELECT * FROM ${this.escapeIdentifier(tableName)}`
      );
      return rows as any[];
    } finally {
      connection.release();
    }
  }

  async getTableSchema(tableName: string): Promise<ColumnInfo[]> {
    if (!this.pool) throw new Error('Database not connected');

    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
         ORDER BY ORDINAL_POSITION`,
        [tableName]
      );

      return (rows as any[]).map((row) => ({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE,
        nullable: row.IS_NULLABLE === 'YES',
        primaryKey: row.COLUMN_KEY === 'PRI'
      }));
    } finally {
      connection.release();
    }
  }

  async insertRow(tableName: string, data: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    const connection = await this.pool.getConnection();
    try {
      const columns = Object.keys(data).map((k) => this.escapeIdentifier(k));
      const placeholders = columns.map(() => '?').join(',');
      const values = Object.values(data);

      const result = await connection.query(
        `INSERT INTO ${this.escapeIdentifier(tableName)} (${columns.join(',')}) VALUES (${placeholders})`,
        values
      );

      return result[0];
    } finally {
      connection.release();
    }
  }

  async updateRow(tableName: string, id: any, data: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    const connection = await this.pool.getConnection();
    try {
      const sets = Object.keys(data)
        .map((k) => `${this.escapeIdentifier(k)} = ?`)
        .join(',');
      const values = [...Object.values(data), id];

      const result = await connection.query(
        `UPDATE ${this.escapeIdentifier(tableName)} SET ${sets} WHERE id = ?`,
        values
      );

      return result[0];
    } finally {
      connection.release();
    }
  }

  async deleteRow(tableName: string, id: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    const connection = await this.pool.getConnection();
    try {
      const result = await connection.query(
        `DELETE FROM ${this.escapeIdentifier(tableName)} WHERE id = ?`,
        [id]
      );

      return result[0];
    } finally {
      connection.release();
    }
  }

  async executeTransaction(operations: any[]): Promise<void> {
    if (!this.pool) throw new Error('Database not connected');

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const op of operations) {
        await connection.query(op.sql, op.params);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private escapeIdentifier(identifier: string): string {
    return '`' + identifier.replace(/`/g, '``') + '`';
  }
}
