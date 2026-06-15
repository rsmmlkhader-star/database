# SaveMyDB: Spreadsheet-to-Database Synchronization Platform

A modern platform that connects databases with spreadsheet interfaces, allowing users to view, edit, and synchronize data seamlessly.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Redis 6+

### Installation

```bash
# Clone the repository
git clone https://github.com/rsmmlkhader-star/database.git
cd database

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

## Project Structure

```
src/
├── index.ts              # Main application entry
├── types/                # TypeScript type definitions
├── routes/               # API route handlers
├── middleware/           # Express middleware
├── database/             # Database connection
├── cache/                # Redis cache
├── services/             # Business logic
│   ├── sync/             # Synchronization engine
│   ├── connectors/       # Database connectors
│   └── validators/       # Data validators
└── utils/                # Utilities

docs/
├── RESEARCH.md           # Competitive analysis
└── ARCHITECTURE.md       # Technical design
```

## Documentation

- **[RESEARCH.md](docs/RESEARCH.md)** - Competitive analysis and market positioning
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Technical design and system architecture

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration

### Connections
- `POST /api/connections` - Create database connection
- `GET /api/connections/:id` - Get connection details
- `DELETE /api/connections/:id` - Delete connection

### Synchronization
- `POST /api/sync/start` - Start sync process
- `GET /api/sync/:syncId` - Get sync status
- `GET /api/sync/:syncId/changes` - Get sync changes

### Audit
- `GET /api/audit/logs` - Retrieve audit trail
- `GET /api/audit/logs/:rowId/history` - Get row change history

## Features

- ✅ Multiple database support (MySQL, PostgreSQL, SQL Server)
- ✅ Google Sheets integration
- ✅ Real-time synchronization
- ✅ Conflict resolution strategies
- ✅ Data validation
- ✅ Comprehensive audit logging
- ✅ Role-based access control
- ✅ Encryption for sensitive data

## Development

```bash
# Run tests
npm test

# Run linter
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For support, email support@savemydb.com or open an issue on GitHub.
