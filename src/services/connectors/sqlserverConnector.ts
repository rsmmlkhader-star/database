import { DatabaseConfig } from '../../types';
import logger from '../../utils/logger';
import { BaseConnector, ColumnInfo } from './mysqlConnector';
import { ConnectionPool, config as TediousConfig } from 'tedious';
import { TYPES } from 'tedious';

export class SQLServerConnector extends BaseConnector {
  private pool: ConnectionPool | null = null;

  async connect(config: DatabaseConfig): Promise<void> {
    try {
      const tediosConfig: TediousConfig = {
        server: config.host,
        port: config.port,
        authentication: {
          type: 'default',
          options: {
            userName: config.user,
            password: config.password
          }
        },
        options: {
          database: config.database,
          trustServerCertificate: true,
          encrypt: true
        }
      };

      this.pool = new ConnectionPool(tediosConfig);

      await new Promise((resolve, reject) => {
        this.pool!.on('connect', (err: any) => {
          if (err) reject(err);
          else resolve(null);
        });
        this.pool!.connect();
      });

      logger.info('SQL Server connection successful');
    } catch (error) {
      logger.error('SQL Server connection failed', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await new Promise((resolve) => {
        this.pool!.close();
        resolve(null);
      });
      this.pool = null;
      logger.info('SQL Server connection closed');
    }
  }

  async getTable(tableName: string): Promise<any[]> {
    if (!this.pool) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      const rows: any[] = [];
      const request = this.pool!.request();

      request.query(`SELECT * FROM ${this.escapeIdentifier(tableName)}`, (err) => {
        if (err) reject(err);
      });

      request.on('row', (columns) => {
        const row: any = {};
        columns.forEach((col) => {
          row[col.metadata.colName] = col.value;
        });
        rows.push(row);
      });

      request.on('done', () => {
        resolve(rows);
      });
    });
  }

  async getTableSchema(tableName: string): Promise<ColumnInfo[]> {
    if (!this.pool) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      const columns: ColumnInfo[] = [];
      const request = this.pool!.request();

      const query = `
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, 
               COLUMNPROPERTY(OBJECT_ID(?), COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `;

      request.input('tableName1', TYPES.NVarChar, tableName);
      request.input('tableName2', TYPES.NVarChar, tableName);
      request.query(query, (err) => {
        if (err) reject(err);
      });

      request.on('row', (cols) => {
        const row: any = {};
        cols.forEach((col) => {
          row[col.metadata.colName] = col.value;
        });
        columns.push({
          name: row.COLUMN_NAME,
          type: row.DATA_TYPE,
          nullable: row.IS_NULLABLE === 'YES',
          primaryKey: row.IS_IDENTITY === 1
        });
      });

      request.on('done', () => {
        resolve(columns);
      });
    });
  }

  async insertRow(tableName: string, data: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map((_, i) => `@p${i + 1}`).join(',');

      let query = `INSERT INTO ${this.escapeIdentifier(tableName)} (${columns
        .map((c) => this.escapeIdentifier(c))
        .join(',')}) VALUES (${placeholders})`;

      const request = this.pool!.request();
      columns.forEach((col, i) => {
        request.input(`p${i + 1}`, values[i]);
      });

      request.query(query, (err) => {
        if (err) reject(err);
        else resolve({ insertId: 1 });
      });
    });
  }

  async updateRow(tableName: string, id: any, data: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      const columns = Object.keys(data);
      const sets = columns
        .map((c, i) => `${this.escapeIdentifier(c)} = @p${i + 1}`)
        .join(',');

      const query = `UPDATE ${this.escapeIdentifier(tableName)} SET ${sets} WHERE id = @id`;

      const request = this.pool!.request();
      columns.forEach((col, i) => {
        request.input(`p${i + 1}`, data[col]);
      });
      request.input('id', id);

      request.query(query, (err) => {
        if (err) reject(err);
        else resolve({ affectedRows: 1 });
      });
    });
  }

  async deleteRow(tableName: string, id: any): Promise<any> {
    if (!this.pool) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      const query = `DELETE FROM ${this.escapeIdentifier(tableName)} WHERE id = @id`;
      const request = this.pool!.request();
      request.input('id', id);

      request.query(query, (err) => {
        if (err) reject(err);
        else resolve({ affectedRows: 1 });
      });
    });
  }

  async executeTransaction(operations: any[]): Promise<void> {
    if (!this.pool) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      const request = this.pool!.request();

      request.query('BEGIN TRANSACTION', async (err) => {
        if (err) return reject(err);

        try {
          for (const op of operations) {
            await new Promise((res, rej) => {
              const r = this.pool!.request();
              r.query(op.sql, (e) => (e ? rej(e) : res(null)));
            });
          }

          request.query('COMMIT TRANSACTION', (err) => {
            if (err) reject(err);
            else resolve();
          });
        } catch (error) {
          request.query('ROLLBACK TRANSACTION', () => {
            reject(error);
          });
        }
      });
    });
  }

  private escapeIdentifier(identifier: string): string {
    return '[' + identifier.replace(/]/g, ']]') + ']';
  }
}
