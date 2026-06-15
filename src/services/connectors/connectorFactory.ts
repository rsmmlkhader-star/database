import { DatabaseConfig } from '../../types';
import logger from '../../utils/logger';
import { MySQLConnector } from './mysqlConnector';
import { PostgreSQLConnector } from './postgresqlConnector';
import { SQLServerConnector } from './sqlserverConnector';

export class ConnectorFactory {
  static create(type: string) {
    switch (type.toLowerCase()) {
      case 'mysql':
        return new MySQLConnector();
      case 'postgresql':
        return new PostgreSQLConnector();
      case 'sqlserver':
        return new SQLServerConnector();
      default:
        throw new Error(`Unknown database type: ${type}`);
    }
  }
}
