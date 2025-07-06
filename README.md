# SocialSpace Backend API

A modern, type-safe Node.js backend application built with Express.js, TypeScript, and PostgreSQL.

## 🚀 Features

- **TypeScript**: Full type safety and modern JavaScript features
- **Express.js**: Fast, unopinionated web framework
- **PostgreSQL**: Robust database with connection pooling
- **Structured Logging**: Professional logging system with metadata
- **Error Handling**: Comprehensive error handling with custom error classes
- **Health Checks**: Detailed health monitoring endpoints
- **Graceful Shutdown**: Proper cleanup of resources on termination
- **Security**: Built-in security headers and CORS support
- **Modular Architecture**: Clean separation of concerns

## 📁 Project Structure

```
socialspace-be/
├── src/
│   ├── config/
│   │   ├── database.ts      # Database configuration and management
│   │   └── environment.ts   # Environment variables and validation
│   ├── middleware/
│   │   ├── index.ts         # Common middleware exports
│   │   └── errorHandler.ts  # Error handling middleware
│   ├── routes/
│   │   ├── api.ts          # API routes
│   │   └── health.ts       # Health check routes
│   ├── types/
│   │   └── index.ts        # TypeScript type definitions
│   ├── utils/
│   │   └── logger.ts       # Structured logging utility
│   └── app.ts              # Express app configuration
├── server.ts               # Main server entry point
├── package.json
├── tsconfig.json
└── README.md
```

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (with pg driver)
- **Environment Management**: dotenv

## 📋 Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database (local or cloud)
- npm or yarn

## ⚙️ Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd socialspace-be
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:
   Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://username:password@host:port/database
NODE_ENV=development
PORT=3000
```

4. Start the development server:

```bash
npm run dev
```

## 🔧 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the TypeScript project
- `npm start` - Start production server
- `npm test` - Run tests (not implemented yet)

## 🌐 API Endpoints

### Health Checks

- `GET /` - API welcome message
- `GET /health` - Comprehensive health check
- `GET /health/db` - Database-specific health check

### API Routes

- `GET /api/status` - API status and information
- `GET /api/test-db` - Database connectivity test
- `POST /api/example` - Example endpoint with validation

## 📊 API Response Format

All API responses follow a consistent structure:

```typescript
{
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  timestamp: string;
}
```

## 🔒 Security Features

- Security headers (XSS, CSRF protection)
- CORS configuration
- Request size limiting
- Structured error handling (no sensitive data leakage)

## 📝 Logging

The application uses a structured logging system that includes:

- Timestamp
- Log level (INFO, ERROR, WARN, DEBUG)
- Request metadata (method, URL, IP, user agent)
- Performance metrics
- Error stack traces

## 🚦 Environment Configuration

The application validates required environment variables on startup:

- `DATABASE_URL` (required): PostgreSQL connection string
- `NODE_ENV` (optional): Environment mode (development/production)
- `PORT` (optional): Server port (default: 3000)

## 🔄 Database Connection

- Connection pooling with pg
- SSL support for cloud databases
- Automatic reconnection handling
- Health check monitoring

## 🛡️ Error Handling

- Custom `AppError` class for operational errors
- Async error handling wrapper
- Structured error responses
- Development vs production error details

## 🏥 Health Monitoring

The health endpoints provide detailed system information:

- Database connectivity status
- Application uptime
- Response time metrics
- Version information

## 🚀 Deployment

For production deployment:

1. Set environment variables:

```env
NODE_ENV=production
DATABASE_URL=<production-database-url>
PORT=<production-port>
```

2. Build and start:

```bash
npm run build
npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests (when available)
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.
