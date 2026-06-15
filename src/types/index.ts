export interface DatabaseConfig {
  type: 'mysql' | 'postgresql' | 'sqlserver';
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface RowMapping {
  rowId: string;
  sheetRowNumber: number;
  dbPrimaryKey: string | string[];
  metadata: {
    lastSyncedAt: Date;
    syncStatus: 'synced' | 'pending' | 'error';
    version: number;
    lastModifiedBy: string;
  };
}

export interface Change {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  source: 'SHEET' | 'DB';
  rowId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  timestamp: Date;
}

export interface SyncResult {
  syncId: string;
  status: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  changes: Change[];
  conflicts: Conflict[];
  duration: number;
  errorMessage?: string;
}

export interface Conflict {
  rowId: string;
  dbValue: any;
  sheetValue: any;
  resolvedValue?: any;
  resolution?: 'LWW' | 'SHEET_WINS' | 'DB_WINS' | 'MANUAL' | 'MERGE';
}

export interface AuditEntry {
  id: string;
  connectionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  timestamp: Date;
  syncId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  tableName: string;
  rowId: string | string[];
  source: 'SHEET' | 'DB';
  beforeValues: Record<string, any>;
  afterValues: Record<string, any>;
  changedFields: string[];
  conflictResolved: boolean;
  conflictStrategy?: string;
  syncStatus: 'SUCCESS' | 'FAILURE' | 'ROLLBACK';
  errorMessage?: string;
  durationMs: number;
}

export interface ValidationRule {
  fieldName: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowedValues?: any[];
  customValidator?: (value: any) => boolean;
  errorMessage: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Connection {
  id: string;
  userId: string;
  name: string;
  type: 'mysql' | 'postgresql' | 'sqlserver';
  config: DatabaseConfig;
  isEncrypted: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}
