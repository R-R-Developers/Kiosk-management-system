# Kiosk Management System

A comprehensive web-based management system for IoT kiosks with a modern React frontend and robust Node.js backend.

## Overview

This system provides:
- **Device Management**: Monitor and control kiosk devices
- **Application Management**: Deploy and manage applications on kiosks
- **User Authentication**: Secure login and role-based access
- **Real-time Monitoring**: Live device status and health monitoring
- **Analytics Dashboard**: System metrics and reporting

## Architecture

- **Frontend**: React 19 with TypeScript and Tailwind-like CSS
- **Backend**: Node.js with Express and Socket.IO
- **Database**: PostgreSQL with migrations
- **Cache**: Redis for sessions and caching
- **Authentication**: JWT-based with bcrypt password hashing
- **Containerization**: Docker and Docker Compose

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kiosk_management_system/management-server
   ```

2. **Install dependencies**
   ```bash
   # Backend dependencies
   npm install
   
   # Frontend dependencies
   cd client && npm install && cd ..
   ```

3. **Start services with Docker**
   ```bash
   # Start database and Redis
   docker compose up -d postgres redis
   
   # Run database migrations
   npm run migrate
   
   # Seed the database with sample data
   npm run seed
   ```

4. **Start the application**
   ```bash
   # Start backend server
   npm start
   
   # Or start in development mode
   npm run dev
   ```

5. **Access the application**
   - Web Interface: http://localhost:3000
   - API Health Check: http://localhost:3000/api/health

### Default Login Credentials

- **Username**: `admin`
- **Password**: `AdminPass123`

## Development

### Backend Development

```bash
# Start with auto-reload
npm run dev

# Run migrations
npm run migrate

# Seed database
npm run seed

# Start database only
npm run db:up

# Stop database
npm run db:down
```

### Frontend Development

```bash
cd client

# Start React dev server
npm start

# Build for production
npm run build

# Run tests
npm test
```

### Full Development Stack

```bash
# Start everything (database + backend + frontend)
npm run dev:full
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/refresh` - Refresh JWT token

### Devices
- `GET /api/devices` - List all devices
- `POST /api/devices` - Create new device
- `GET /api/devices/:id` - Get device details
- `PUT /api/devices/:id` - Update device
- `DELETE /api/devices/:id` - Delete device
- `POST /api/devices/:id/reboot` - Reboot device
- `GET /api/devices/:id/logs` - Get device logs

### Applications
- `GET /api/applications` - List all applications
- `POST /api/applications` - Create new application
- `GET /api/applications/:id` - Get application details
- `PUT /api/applications/:id` - Update application
- `DELETE /api/applications/:id` - Delete application

### Device Groups
- `GET /api/device-groups` - List all device groups
- `POST /api/device-groups` - Create new device group
- `PUT /api/device-groups/:id` - Update device group
- `DELETE /api/device-groups/:id` - Delete device group

## Database Schema

### Key Tables

- **users** - System users with authentication
- **devices** - Kiosk devices and their status
- **device_groups** - Logical grouping of devices
- **applications** - Deployable applications
- **device_logs** - Device activity and error logs
- **config_profiles** - Configuration templates

## Configuration

### Environment Variables

Create a `.env` file with:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kiosk_management
DB_USER=kiosk_user
DB_PASSWORD=kiosk_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# Server
PORT=3000
NODE_ENV=development

# Email (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

## Docker Deployment

### Full Stack with Docker

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

### Production Deployment

```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Deploy to production
docker compose -f docker-compose.prod.yml up -d
```

## Features

### ✅ Completed Features

- **Authentication System**
  - User registration and login
  - JWT-based authentication
  - Password hashing with bcrypt
  - Role-based access control

- **Device Management**
  - CRUD operations for devices
  - Device status monitoring
  - Device grouping
  - Remote device control (reboot)
  - Device log viewing

- **Application Management**
  - Application CRUD operations
  - Version management
  - Application deployment tracking

- **Modern UI**
  - Responsive React interface
  - Dashboard with system metrics
  - Real-time status updates
  - Mobile-friendly design

- **Database & Infrastructure**
  - PostgreSQL with migrations
  - Redis for caching
  - Docker containerization
  - Health monitoring endpoints

### 🚧 Planned Features

- Real-time device communication via WebSocket
- File upload for application packages
- Advanced analytics and reporting
- User management interface
- Device configuration management
- Automated alerts and notifications
- API documentation with Swagger

## Testing

### API Testing

Use the included test script:

```bash
# Test all API endpoints
./test_api.sh
```

### Manual Testing

```bash
# Health check
curl http://localhost:3000/api/health

# Login (get token)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "AdminPass123"}'

# Get devices (with token)
curl -X GET http://localhost:3000/api/devices \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check if PostgreSQL is running
   docker compose ps
   
   # Restart database
   docker compose restart postgres
   ```

2. **Redis Connection Failed**
   ```bash
   # Restart Redis
   docker compose restart redis
   ```

3. **Port Already in Use**
   ```bash
   # Find and kill process using port 3000
   lsof -ti:3000 | xargs kill -9
   ```

4. **Migration Errors**
   ```bash
   # Reset database
   docker compose down postgres
   docker volume rm management-server_postgres_data
   docker compose up -d postgres
   npm run migrate
   npm run seed
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Check the troubleshooting section
- Review the API documentation
- Check Docker logs: `docker compose logs`
- Open an issue on GitHub
