import pg from 'pg';
import logger from '../utils/logger';

let pool: pg.Pool;

export async function initializeDatabase(): Promise<void> {
  try {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connection successful');
  } catch (error) {
    logger.error('Database connection failed', error);
    throw error;
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
}

export async function query(text: string, params?: any[]): Promise<pg.QueryResult> {
  const result = await pool.query(text, params);
  return result;
}
