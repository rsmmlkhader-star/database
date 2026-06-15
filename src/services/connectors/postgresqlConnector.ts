import { DatabaseConfig } from '../../types';
import logger from '../../utils/logger';
import pg from 'pg';
import { BaseConnector, ColumnInfo } from './mysqlConnector';

export class PostgreSQLConnector extends BaseConnector {
  private pool: pg.Pool | null = null;

  async connect(config: DatabaseConfig): Promise<void> {
    try {
      this.pool = new pg.Pool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database
      });

      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('PostgreSQL connection successful');
    } catch (error) {
      logger.error('PostgreSQL connection failed', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('PostgreSQL connection closed');
    }
  }

  async getTable(tableName: string): Promise<any[]> {
    if (!this.pool) throw new Error('Database not connected');

    const result = await this.pool.query(
      `SELECT * FROM ${this.escapeIdentifier(tableName)}`
    );
    return result.rows;
  }

  async getTableSchema(tableName: string): Promise<ColumnInfo[]> {
    if (!this.pool) throw new Error('Database not connected');

    const result = await this.pool.query(
      `SELECT column_name, data_type, is_nullable, 
              (SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints tc 
                             WHERE tc.table_name = t.table_name 
                             AND tc.constraint_type = 'PRIMARY KEY')) AS primary_key
       FROM information_schema.columns t
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );

    return result.rows.map((row: any) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      primaryKey: row.primary_key
    }));
  }

  async insertRow(tableName: string, data: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    const columns = Object.keys(data);
    const placeholders = columns
      .map((_, i) => `$${i + 1}`)
      .join(',');
    const values = Object.values(data);

    const result = await this.pool.query(
      `INSERT INTO ${this.escapeIdentifier(tableName)} (${columns
        .map((c) => this.escapeIdentifier(c))
        .join(',')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async updateRow(tableName: string, id: any, data: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    const columns = Object.keys(data);
    const sets = columns
      .map((c, i) => `${this.escapeIdentifier(c)} = $${i + 1}`)
      .join(',');
    const values = [...Object.values(data), id];

    const result = await this.pool.query(
      `UPDATE ${this.escapeIdentifier(tableName)} SET ${sets} WHERE id = $${columns.length + 1} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async deleteRow(tableName: string, id: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    const result = await this.pool.query(
      `DELETE FROM ${this.escapeIdentifier(tableName)} WHERE id = $1`,
      [id]
    );

    return result.rowCount;
  }

  async executeTransaction(operations: any[]): Promise<void> {
    if (!this.pool) throw new Error('Database not connected');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const op of operations) {
        await client.query(op.sql, op.params);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private escapeIdentifier(identifier: string): string {
    return '"' + identifier.replace(/"/g, '""') + '"';
  }
}
