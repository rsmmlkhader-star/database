# SaveMyDB: Technical Design & Architecture

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  Web Dashboard   │  │  Google Sheets   │  │ Mobile App │ │
│  │  (React/Next.js) │  │   Add-on (GAS)   │  │(React Native)│ │
│  └──────────────────┘  └──────────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway Layer                          │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  REST API (Express.js) | Authentication & Rate Limiting  ││
│  │  WebSockets (Socket.io) | Real-time Updates             ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                 Synchronization Engine                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  Row Mapper      │  │ Conflict         │  │ Validator  │ │
│  │  (PK Tracking)   │  │ Resolver         │  │(Type/Rules)│ │
│  └──────────────────┘  └──────────────────┘  └────────────┘ │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  Change         │  │ Audit Logger     │  │ Transformer│ │
│  │  Detector       │  │(Who/What/When)   │  │(Custom TX) │ │
│  └──────────────────┘  └──────────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Database Connectors Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   MySQL      │  │ PostgreSQL   │  │ SQL Server   │      │
│  │  Connector   │  │  Connector   │  │  Connector   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              External Services Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Google Sheets │  │ Internal DB  │  │ Queue System │      │
│  │    API       │  │ (Metadata)   │  │  (Bullmq)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 API Gateway
**Technology:** Express.js with TypeScript

**Responsibilities:**
- Route requests to appropriate handlers
- Authentication (JWT tokens, OAuth2)
- Rate limiting (Redis-based)
- Request validation & sanitization
- Error handling & logging
- CORS management

**Endpoints:**
```
POST   /auth/login              - User authentication
POST   /auth/register           - User registration
POST   /connections             - Create DB connection
GET    /connections/:id         - Get connection details
DELETE /connections/:id         - Delete connection
POST   /sync/start              - Initiate sync
GET    /sync/status/:id         - Get sync status
GET    /audit-logs              - Retrieve audit trail
POST   /validation-rules        - Define validation rules
```

### 2.2 Row Mapper
**Purpose:** Establish bidirectional mapping between DB rows and spreadsheet rows

**Key Functions:**
```typescript
interface RowMapping {
  rowId: string;                    // Unique identifier
  sheetRowNumber: number;           // Current position in sheet
  dbPrimaryKey: string | string[];  // DB primary key value(s)
  metadata: {
    lastSyncedAt: timestamp;
    syncStatus: 'synced' | 'pending' | 'error';
    version: number;
    lastModifiedBy: string;
  }
}
```

**Implementation Strategy:**
1. **Hidden Column Approach:** Add metadata column to Sheets with row IDs
2. **Hash-Based Matching:** Use content hash for conflict detection
3. **Primary Key Tracking:** Map and store DB primary keys
4. **Version Control:** Track row versions for change detection

**Storage:** Metadata stored in:
- Internal database (PostgreSQL)
- Hidden columns in Google Sheets (encrypted)
- Cache layer (Redis)

### 2.3 Change Detector
**Purpose:** Identify insertions, updates, and deletions

**Algorithm:**
```
1. Fetch current state from DB
2. Fetch current state from Sheets
3. Create hash map of each state
4. Compare hashes:
   - Missing in Sheet → DELETE
   - Missing in DB → INSERT
   - Hash mismatch → UPDATE (compare field-by-field)
5. Generate change log with:
   - Operation type (INSERT/UPDATE/DELETE)
   - Row ID
   - Old values
   - New values
   - Timestamp
   - Source (SHEET or DB)
```

**Pseudo-code:**
```python
def detect_changes(db_state, sheet_state, row_mappings):
    changes = []
    db_rows_map = {row['id']: row for row in db_state}
    sheet_rows_map = {row['_rowId']: row for row in sheet_state}
    
    # Detect deletions
    for row_id in db_rows_map:
        if row_id not in sheet_rows_map:
            changes.append({
                'type': 'DELETE',
                'source': 'SHEET',
                'rowId': row_id,
                'oldValues': db_rows_map[row_id]
            })
    
    # Detect inserts and updates
    for row_id, sheet_row in sheet_rows_map.items():
        if row_id not in db_rows_map:
            changes.append({
                'type': 'INSERT',
                'source': 'SHEET',
                'rowId': row_id,
                'newValues': sheet_row
            })
        elif hash(sheet_row) != hash(db_rows_map[row_id]):
            changes.append({
                'type': 'UPDATE',
                'source': 'SHEET',
                'rowId': row_id,
                'oldValues': db_rows_map[row_id],
                'newValues': sheet_row
            })
    
    return changes
```

### 2.4 Conflict Resolver
**Purpose:** Handle concurrent edits with intelligent resolution strategies

**Conflict Scenarios:**
1. **Edit-Edit Conflict:** Both DB and Sheet edited same row
2. **Delete-Edit Conflict:** One deleted, other edited
3. **Type Conflict:** Invalid data type in Sheet
4. **FK Constraint Violation:** Reference integrity broken

**Resolution Strategies:**

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| **Last-Write-Wins (LWW)** | Timestamp-based winner | Default, simple workflows |
| **Sheet-Wins** | Always favor Sheet changes | Trusted data entry source |
| **DB-Wins** | Always favor DB changes | Authoritative data source |
| **Manual Merge** | User intervention required | Critical data, compliance |
| **Three-Way Merge** | Use base version + both sides | Complex updates |

**Implementation:**
```typescript
interface ConflictResolution {
  strategy: 'LWW' | 'SHEET_WINS' | 'DB_WINS' | 'MANUAL' | 'MERGE';
  result: {
    rowId: string;
    resolvedValues: Record<string, any>;
    conflictedFields: string[];
    resolution: string; // explanation
  }
}

async function resolveConflict(
  dbRow: any,
  sheetRow: any,
  strategy: string,
  conflictLog: any
): Promise<ConflictResolution> {
  switch(strategy) {
    case 'LWW':
      return {
        strategy: 'LWW',
        result: {
          rowId: dbRow.id,
          resolvedValues: dbRow.updated_at > sheetRow.updated_at ? dbRow : sheetRow,
          conflictedFields: getConflictedFields(dbRow, sheetRow),
          resolution: 'Resolved using timestamp'
        }
      };
    
    case 'MANUAL':
      // Notify user, wait for input
      return await waitForUserResolution(dbRow, sheetRow);
    
    case 'MERGE':
      // Three-way merge using base version
      return mergeRows(baseRow, dbRow, sheetRow);
  }
}
```

### 2.5 Data Validator
**Purpose:** Ensure data integrity before syncing

**Validation Rules:**
```typescript
interface ValidationRule {
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

// Example validations
const rules: ValidationRule[] = [
  {
    fieldName: 'email',
    dataType: 'string',
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    errorMessage: 'Invalid email format'
  },
  {
    fieldName: 'age',
    dataType: 'number',
    required: true,
    minLength: 0,
    maxLength: 150,
    errorMessage: 'Age must be between 0 and 150'
  },
  {
    fieldName: 'status',
    dataType: 'enum',
    allowedValues: ['active', 'inactive', 'pending'],
    errorMessage: 'Status must be one of: active, inactive, pending'
  }
];
```

**Validation Flow:**
```
1. Schema Inference: Auto-detect data types from DB
2. Rule Application: Apply defined validation rules
3. Error Collection: Gather all validation errors
4. User Notification: Report errors to user
5. Rejection/Correction: Prevent sync or request fixes
```

### 2.6 Audit Logger
**Purpose:** Maintain comprehensive change history

**Audit Entry Schema:**
```typescript
interface AuditEntry {
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
```

**Storage:**
- Primary: PostgreSQL (audit_logs table)
- Index on: timestamp, userId, connectionId, tableName
- Archive: Export old logs to S3 after 90 days

**Queries:**
```sql
-- Get user activity
SELECT * FROM audit_logs 
WHERE userId = $1 AND timestamp > now() - INTERVAL '7 days'
ORDER BY timestamp DESC;

-- Find conflicted syncs
SELECT * FROM audit_logs 
WHERE conflictResolved = true 
AND connectionId = $1 
ORDER BY timestamp DESC;

-- Data lineage for a row
SELECT * FROM audit_logs 
WHERE tableName = $1 AND rowId = $2 
ORDER BY timestamp ASC;
```

---

## 3. Database Connectors

### 3.1 MySQL Connector
```typescript
class MySQLConnector {
  private pool: mysql2.Pool;
  
  async connect(config: MySQLConfig): Promise<void> {
    this.pool = createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  
  async getTable(tableName: string): Promise<any[]> {
    const [rows] = await this.pool.execute(`SELECT * FROM ${tableName}`);
    return rows;
  }
  
  async getTableSchema(tableName: string): Promise<ColumnInfo[]> {
    const [rows] = await this.pool.execute(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()`
    );
    return rows;
  }
  
  async insertRow(tableName: string, data: any): Promise<InsertResult> {
    // Prepare and execute INSERT
  }
  
  async updateRow(tableName: string, id: any, data: any): Promise<UpdateResult> {
    // Prepare and execute UPDATE with WHERE clause
  }
  
  async deleteRow(tableName: string, id: any): Promise<DeleteResult> {
    // Prepare and execute DELETE
  }
  
  async executeTransaction(operations: Operation[]): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const op of operations) {
        await connection.execute(op.sql, op.params);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
}
```

### 3.2 PostgreSQL Connector
```typescript
class PostgreSQLConnector {
  private pool: pg.Pool;
  
  async connect(config: PostgreSQLConfig): Promise<void> {
    this.pool = new pg.Pool({
      host: config.host,
      port: config.port || 5432,
      user: config.user,
      password: config.password,
      database: config.database
    });
  }
  
  async getTable(tableName: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.escapeIdentifier(tableName)}`
    );
    return result.rows;
  }
  
  async getTableSchema(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.pool.query(
      `SELECT column_name, data_type, is_nullable, column_key
       FROM information_schema.columns 
       WHERE table_name = $1`,
      [tableName]
    );
    return result.rows;
  }
  
  // Similar methods for insert, update, delete
  // PostgreSQL-specific: RETURNING clause, type casting, JSONB support
}
```

### 3.3 SQL Server Connector
```typescript
class SQLServerConnector {
  private pool: ConnectionPool;
  
  async connect(config: SQLServerConfig): Promise<void> {
    this.pool = new ConnectionPool({
      server: config.server,
      authentication: {
        type: 'default',
        options: {
          userName: config.user,
          password: config.password
        }
      },
      options: {
        database: config.database,
        trustServerCertificate: true
      }
    });
  }
  
  // SQL Server-specific implementation
  // Features: IDENTITY columns, transactions, XML support
}
```

---

## 4. Google Sheets Integration

### 4.1 Google Sheets Add-on (Google Apps Script)
```javascript
// sidebar.html - UI for users
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('SaveMyDB')
    .addItem('Connect Database', 'showConnectDialog')
    .addItem('Sync Data', 'syncData')
    .addItem('View Audit Log', 'showAuditLog')
    .addSeparator()
    .addItem('Settings', 'showSettings')
    .addToUi();
}

// core.js - Sync logic
async function syncData() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const metadata = PropertiesService.getUserProperties().getProperty('sync_metadata');
  
  // Call SaveMyDB API to trigger sync
  const response = await UrlFetchApp.fetch('https://api.savemydb.com/sync/start', {
    method: 'post',
    payload: JSON.stringify({
      connectionId: metadata.connectionId,
      sheetId: sheet.getSheetId(),
      data: data
    }),
    headers: {
      'Authorization': `Bearer ${metadata.token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = JSON.parse(response.getContentText());
  showNotification(`Sync completed: ${result.changes.length} changes applied`);
}
```

### 4.2 Real-time Updates via WebSockets
```typescript
// Server side - Socket.io
io.on('connection', (socket: Socket) => {
  socket.on('subscribe-sheet', (sheetId: string, connectionId: string) => {
    socket.join(`sheet:${sheetId}:${connectionId}`);
    
    // Listen for sync events
    eventEmitter.on(`sync-complete:${connectionId}`, (syncResult) => {
      io.to(`sheet:${sheetId}:${connectionId}`).emit('sync-update', syncResult);
    });
  });
  
  socket.on('cell-change', (data: CellChange) => {
    // Broadcast cell changes to all users viewing this sheet
    socket.broadcast.emit('cell-updated', data);
  });
});
```

---

## 5. Synchronization Flow

### 5.1 Sync Sequence Diagram
```
User Request
    ↓
[1] Fetch DB State (with transaction lock)
    ↓
[2] Fetch Sheet State (via Google Sheets API)
    ↓
[3] Detect Changes (INSERT/UPDATE/DELETE)
    ↓
[4] Validate Data (type checking, constraints)
    ↓
[5] Detect Conflicts (edit-edit, delete-edit)
    ↓
[6] Resolve Conflicts (LWW or user input)
    ↓
[7] Apply Transformations (custom rules)
    ↓
[8] Begin Transaction
    ↓
[9] Apply DB Changes (INSERT/UPDATE/DELETE)
    ↓
[10] Update Metadata (row mappings, versions)
    ↓
[11] Log Audit Events (all changes)
    ↓
[12] Commit Transaction
    ↓
[13] Update Sheet (refresh data, show status)
    ↓
[14] Emit Events (WebSocket notifications)
    ↓
Complete
```

### 5.2 Error Handling & Rollback
```typescript
async function performSync(connectionId: string): Promise<SyncResult> {
  const client = await db.getClient();
  const syncId = generateId();
  
  try {
    // 1. Lock DB table to prevent concurrent modifications
    await client.query(`BEGIN ISOLATION LEVEL SERIALIZABLE`);
    
    // 2. Fetch both sources
    const dbState = await connector.getTable(tableName);
    const sheetState = await googleSheets.getValues(sheetId, range);
    
    // 3. Detect & resolve conflicts
    const changes = await detectChanges(dbState, sheetState);
    const resolvedChanges = await resolveConflicts(changes, strategy);
    
    // 4. Validate all changes
    for (const change of resolvedChanges) {
      const validationResult = await validator.validate(change);
      if (!validationResult.isValid) {
        throw new ValidationError(validationResult.errors);
      }
    }
    
    // 5. Apply changes in DB
    for (const change of resolvedChanges) {
      if (change.type === 'INSERT') {
        await connector.insertRow(tableName, change.newValues);
      } else if (change.type === 'UPDATE') {
        await connector.updateRow(tableName, change.rowId, change.newValues);
      } else if (change.type === 'DELETE') {
        await connector.deleteRow(tableName, change.rowId);
      }
      
      // Log each change
      await auditLogger.log({
        syncId,
        connectionId,
        operation: change.type,
        ...change
      });
    }
    
    // 6. Commit
    await client.query(`COMMIT`);
    
    return {
      syncId,
      status: 'SUCCESS',
      changes: resolvedChanges.length,
      duration: Date.now() - startTime
    };
    
  } catch (error) {
    // Rollback on any error
    await client.query(`ROLLBACK`);
    
    await auditLogger.log({
      syncId,
      connectionId,
      status: 'FAILURE',
      errorMessage: error.message
    });
    
    throw error;
  } finally {
    client.release();
  }
}
```

---

## 6. Performance Optimization

### 6.1 Incremental Sync
Instead of fetching entire table, track only changes:

```typescript
interface IncrementalSyncMarker {
  tableName: string;
  lastSyncedAt: timestamp;
  lastSyncedRowCount: number;
}

// On subsequent syncs, only fetch rows modified after lastSyncedAt
async function incrementalSync(connectionId: string) {
  const marker = await db.query(
    `SELECT last_synced_at FROM sync_markers WHERE connection_id = $1`,
    [connectionId]
  );
  
  const changes = await connector.query(
    `SELECT * FROM ${tableName} 
     WHERE updated_at > $1 
     OR id NOT IN (SELECT row_id FROM row_mappings)`,
    [marker.last_synced_at]
  );
  
  // Process only changed rows
  return await applyChanges(changes);
}
```

### 6.2 Batching & Chunking
```typescript
async function syncLargeDataset(rows: any[], batchSize = 1000) {
  const batches = chunk(rows, batchSize);
  
  for (const batch of batches) {
    await performSync(batch);
    
    // Add delay between batches to avoid overwhelming DB
    await sleep(100);
  }
}
```

### 6.3 Caching Strategy
```typescript
// Redis cache for:
// - Table schemas (TTL: 24h)
// - Row mappings (TTL: 1h, invalidate on sync)
// - Validation rules (TTL: 12h)
// - Connection configs (TTL: 1h)

const cache = new Redis({
  host: 'localhost',
  port: 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

async function getCachedSchema(connectionId: string, tableName: string) {
  const key = `schema:${connectionId}:${tableName}`;
  
  let schema = await cache.get(key);
  if (!schema) {
    schema = await connector.getTableSchema(tableName);
    await cache.setex(key, 86400, JSON.stringify(schema)); // 24h TTL
  }
  
  return JSON.parse(schema);
}
```

---

## 7. Data Privacy & Security

### 7.1 Encryption
```typescript
// Encrypt sensitive credentials at rest
const encryptedPassword = await crypto.encrypt(
  config.password,
  process.env.ENCRYPTION_KEY
);

// Encrypt data in transit (TLS 1.3)
const httpsServer = https.createServer({
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem')
}, app);
```

### 7.2 Access Control
```typescript
// Role-based access control (RBAC)
interface Permission {
  resource: string;     // e.g., 'connection:123'
  action: string;       // e.g., 'read', 'write', 'delete'
  conditions?: Record<string, any>;
}

async function checkPermission(userId: string, permission: Permission) {
  const user = await db.query(`
    SELECT r.permissions FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = $1
  `, [userId]);
  
  return user.permissions.includes(permission.action);
}
```

### 7.3 Audit Trail for Compliance
All changes logged with:
- User identity (no anonymous actions)
- Timestamp
- Old & new values
- IP address
- Retention: 2+ years

---

## 8. Deployment Architecture

### 8.1 Infrastructure Setup
```yaml
# Docker Compose for development
version: '3.8'
services:
  backend:
    image: savemydb-backend:latest
    ports: ['3000:3000']
    environment:
      DATABASE_URL: postgres://user:pass@postgres:5432/savemydb
      REDIS_URL: redis://redis:6379
    depends_on: [postgres, redis]
  
  postgres:
    image: postgres:14
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: savemydb
    volumes: [pgdata:/var/lib/postgresql/data]
  
  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

### 8.2 Production Deployment (AWS)
- **Backend:** ECS/Fargate with ALB
- **Database:** RDS PostgreSQL with Multi-AZ
- **Cache:** ElastiCache Redis
- **Job Queue:** SQS + Lambda workers
- **Storage:** S3 for audit logs
- **CDN:** CloudFront for static assets

---

## 9. Monitoring & Observability

### 9.1 Logging
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

logger.info('Sync started', { syncId, connectionId, rowCount });
logger.error('Sync failed', { syncId, error: error.message });
```

### 9.2 Metrics
```typescript
// Prometheus metrics
const syncCounter = new Counter({
  name: 'savemydb_syncs_total',
  help: 'Total number of syncs',
  labelNames: ['status', 'database_type']
});

const syncDuration = new Histogram({
  name: 'savemydb_sync_duration_seconds',
  help: 'Sync duration in seconds',
  buckets: [1, 5, 10, 30, 60]
});
```

### 9.3 Alerts
- High error rate (>5% failed syncs)
- Sync latency spike (>60s)
- DB connection failures
- API rate limit warnings

---

## 10. API Specification

### 10.1 REST Endpoints

#### Connection Management
```
POST /api/connections
  Request: { name, type, host, port, user, password, database }
  Response: { id, status, testResult }

GET /api/connections/:id
  Response: { id, name, type, tables, lastSync, status }

DELETE /api/connections/:id
  Response: { success }
```

#### Synchronization
```
POST /api/sync/start
  Request: { connectionId, tableName, strategy }
  Response: { syncId, status }

GET /api/sync/:syncId
  Response: { syncId, status, progress, changes, conflicts, errors }

GET /api/sync/:syncId/changes
  Response: { changes: [{ type, rowId, before, after }] }
```

#### Audit & History
```
GET /api/audit-logs
  Query: { connectionId, userId, startDate, endDate, limit }
  Response: { logs: [AuditEntry] }

GET /api/audit-logs/:rowId/history
  Response: { history: [{ timestamp, operation, oldValues, newValues }] }
```

---

## Summary

This architecture provides:
- ✅ **Scalability** — Handles 1k–100k rows efficiently
- ✅ **Reliability** — Transaction support, rollback, error handling
- ✅ **Security** — Encryption, access control, audit trails
- ✅ **Flexibility** — Multiple DBs, conflict strategies, validation rules
- ✅ **Observability** — Comprehensive logging and monitoring
- ✅ **User Experience** — Real-time updates, conflict resolution, notifications
