# SaveMyDB Project Structure & Implementation Guide

## Directory Structure

```
.
├── src/
│   ├── index.ts                     # Application entry point
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── routes/
│   │   ├── auth.routes.ts          # Authentication endpoints
│   │   ├── connection.routes.ts    # Connection management endpoints
│   │   ├── sync.routes.ts          # Synchronization endpoints
│   │   └── audit.routes.ts         # Audit logging endpoints
│   ├── middleware/
│   │   └── errorHandler.ts         # Error handling middleware
│   ├── services/
│   │   ├── sync/
│   │   │   ├── changeDetector.ts   # Change detection logic
│   │   │   ├── conflictResolver.ts # Conflict resolution strategies
│   │   │   ├── dataValidator.ts    # Data validation rules
│   │   │   └── auditLogger.ts      # Audit logging service
│   │   ├── connectors/
│   │   │   ├── mysqlConnector.ts   # MySQL database connector
│   │   │   ├── postgresqlConnector.ts # PostgreSQL connector
│   │   │   ├── sqlserverConnector.ts  # SQL Server connector
│   │   │   └── connectorFactory.ts    # Factory for creating connectors
│   ├── database/
│   │   └── connection.ts           # Database pool management
│   ├── cache/
│   │   └── redis.ts                # Redis client and cache utilities
│   └── utils/
│       └── logger.ts               # Logging utilities
├── migrations/
│   ├── 001_create_users_table.js
│   ├── 002_create_connections_table.js
│   ├── 003_create_sync_history_table.js
│   ├── 004_create_audit_logs_table.js
│   ├── 005_create_row_mappings_table.js
│   ├── 006_create_validation_rules_table.js
│   ├── 007_create_sync_markers_table.js
│   └── 008_create_conflicts_table.js
├── docs/
│   ├── RESEARCH.md                 # Competitive analysis
│   └── ARCHITECTURE.md             # Technical design
├── tests/                          # Unit tests (TODO)
├── .env.example                    # Environment variables template
├── .gitignore                      # Git ignore rules
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript configuration
├── knexfile.js                     # Database migration config
└── README.md                       # Project documentation
```

## Database Schema

### Users Table
Stores user account information
- `id` (UUID, PK)
- `email` (unique)
- `name`
- `password_hash`
- `created_at`, `updated_at`

### Connections Table
Stores database connection configurations
- `id` (UUID, PK)
- `user_id` (FK to users)
- `name`
- `type` (mysql, postgresql, sqlserver)
- `host`, `port`, `database`
- `config_encrypted` (encrypted credentials)
- `is_encrypted`
- `last_synced_at`
- `created_at`, `updated_at`

### Sync History Table
Tracks synchronization operations
- `id` (UUID, PK)
- `connection_id` (FK)
- `user_id` (FK)
- `table_name`
- `sheet_id`
- `status` (PENDING, IN_PROGRESS, SUCCESS, FAILURE, PARTIAL)
- `total_changes`, `successful_changes`, `failed_changes`
- `conflicts_detected`
- `duration_ms`
- `error_message`
- `summary` (JSONB: {inserts, updates, deletes, conflicts})
- `started_at`, `completed_at`

### Audit Logs Table
Detailed change tracking
- `id` (UUID, PK)
- `connection_id` (FK)
- `user_id` (FK)
- `user_name`, `user_email`
- `sync_id` (FK)
- `table_name`, `row_id`
- `operation` (INSERT, UPDATE, DELETE)
- `source` (SHEET, DB)
- `before_values`, `after_values` (JSONB)
- `changed_fields` (JSONB array)
- `conflict_resolved`
- `conflict_strategy`
- `sync_status` (SUCCESS, FAILURE, ROLLBACK)
- `error_message`
- `duration_ms`
- `timestamp`

### Row Mappings Table
Maintains bidirectional row-to-row mapping
- `id` (UUID, PK)
- `connection_id` (FK)
- `table_name`
- `row_id`
- `sheet_row_number`
- `db_primary_key` (JSONB)
- `last_synced_at`
- `sync_status` (synced, pending, error)
- `version`
- `last_modified_by`
- `metadata` (JSONB)

### Validation Rules Table
Data validation configuration
- `id` (UUID, PK)
- `connection_id` (FK)
- `table_name`, `field_name`
- `data_type` (string, number, date, boolean, enum)
- `required`
- `min_length`, `max_length`
- `pattern` (regex)
- `allowed_values` (JSONB)
- `error_message`
- `active`

### Sync Markers Table
Tracks incremental sync state
- `id` (UUID, PK)
- `connection_id` (FK)
- `table_name`
- `last_synced_at`
- `last_synced_row_count`
- `last_sync_id`
- `metadata` (JSONB)

### Conflicts Table
Centralized conflict tracking and resolution
- `id` (UUID, PK)
- `sync_id` (FK)
- `connection_id` (FK)
- `table_name`, `row_id`
- `db_value`, `sheet_value` (JSONB)
- `resolved_value` (JSONB)
- `resolution_strategy`
- `resolution_status` (PENDING, RESOLVED, IGNORED)
- `resolution_notes`
- `resolved_at`

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database and service credentials
```

### 3. Create Database
```bash
createdb savemydb_dev
```

### 4. Run Migrations
```bash
npm run migrate
```

### 5. Start Development Server
```bash
npm run dev
```

## Service Implementation Checklist

### Phase 1 - Core Infrastructure
- [x] Database connectors (MySQL, PostgreSQL, SQL Server)
- [x] Change detection engine
- [x] Data validation framework
- [x] Audit logging system
- [ ] Sync orchestration service
- [ ] Google Sheets API integration
- [ ] WebSocket real-time updates

### Phase 2 - API Implementation
- [ ] Authentication service
- [ ] Connection management API
- [ ] Sync control API
- [ ] Audit/history API
- [ ] Validation rules API

### Phase 3 - Google Sheets Integration
- [ ] Google Sheets add-on development
- [ ] Real-time sheet listening
- [ ] Data push/pull logic
- [ ] Metadata column management

### Phase 4 - Advanced Features
- [ ] Advanced conflict resolution
- [ ] Custom transformations
- [ ] Batch operations
- [ ] Rate limiting & throttling
- [ ] Performance monitoring

## Next Steps

1. **Implement Sync Service** - Orchestrate change detection, validation, and DB updates
2. **Complete Route Handlers** - Implement all API endpoints with actual business logic
3. **Google Sheets Integration** - Build Google Apps Script add-on
4. **Unit Tests** - Create comprehensive test coverage
5. **Error Handling** - Enhance error messages and recovery
6. **Documentation** - API docs, deployment guides, user guides

## Key Files to Complete

- `src/services/sync/syncOrchestrator.ts` - Main sync execution logic
- `src/services/googleSheets/sheetsClient.ts` - Google Sheets API wrapper
- `src/services/auth/authService.ts` - User authentication
- `src/routes/connection.routes.ts` - Connection CRUD operations (currently stubbed)
- `src/routes/sync.routes.ts` - Sync control endpoints (currently stubbed)

## Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## Building for Production

```bash
npm run build
```

The compiled output will be in the `dist/` directory.
