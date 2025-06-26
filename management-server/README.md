checking for CET support... yes
configure: updating cache ./config.cache
configure: creating ./config.status
config.status: creating Makefile
config.status: creating config.h
config.status: executing depdir commands
mkdir -p -- .deps
make[1]: *** [package/pkg-generic.mk:293: /home/rustin/Developing_Apps/kiosk_management_system/kiosk-os/buildroot-2023.08.1/output/build/host-gcc-initial-11.4.0/.stamp_built] Error 2
make: *** [Makefile:82: _all] Error 2
[ERROR] Build failed
# Management Server

A comprehensive web-based management system for kiosk devices, inspired by FydeOS Management.

## Features

- **Device Management**: Register, monitor, and control kiosk devices
- **Application Deployment**: Deploy and manage applications on kiosk devices
- **Real-time Monitoring**: Live status updates and system metrics
- **User Management**: Multi-user support with role-based access control
- **Configuration Management**: Centralized configuration for all devices
- **Analytics & Reporting**: Device usage statistics and reports
- **Secure Communication**: Encrypted communication with devices
- **WebSocket Support**: Real-time bidirectional communication
- **RESTful API**: Complete API for integration with other systems

## Architecture

```
┌─────────────────────────────────────────┐
│            Web Dashboard                │
├─────────────────────────────────────────┤
│              REST API                   │
├─────────────────────────────────────────┤
│          WebSocket Server               │
├─────────────────────────────────────────┤
│        Business Logic Layer            │
├─────────────────────────────────────────┤
│         Database Layer                  │
├─────────────────────────────────────────┤
│      PostgreSQL + Redis                 │
└─────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+
- 2GB RAM minimum
- 10GB storage

### Installation

1. **Clone and install dependencies**:
```bash
cd management-server
npm install
```

2. **Setup environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Setup database**:
```bash
# Create PostgreSQL database
createdb kiosk_management

# Run migrations
npm run migrate

# Optional: Seed sample data
npm run seed
```

4. **Start Redis**:
```bash
redis-server
```

5. **Start the server**:
```bash
# Development
npm run dev

# Production
npm start
```

### Docker Setup

```bash
# Using Docker Compose
docker-compose up -d

# Or build manually
docker build -t kiosk-management-server .
docker run -p 3000:3000 kiosk-management-server
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 3000 |
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | 5432 |
| `DB_NAME` | Database name | kiosk_management |
| `JWT_SECRET` | JWT signing secret | (required) |
| `REDIS_HOST` | Redis host | localhost |

### Database Configuration

The server uses PostgreSQL for persistent data storage and Redis for caching and session management.

### SSL/TLS Configuration

For production deployments, configure SSL certificates:

```bash
# Using Let's Encrypt
certbot certonly --standalone -d your-domain.com

# Update environment variables
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
```

## API Documentation

### Authentication

All API endpoints require authentication using JWT tokens:

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'

# Use token in subsequent requests
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/devices
```

### Device Management

#### List Devices
```bash
GET /api/devices
```

#### Get Device Details
```bash
GET /api/devices/:id
```

#### Update Device
```bash
PUT /api/devices/:id
```

#### Device Heartbeat (from kiosk)
```bash
POST /api/devices/:device_id/heartbeat
```

### Application Management

#### List Applications
```bash
GET /api/applications
```

#### Deploy Application
```bash
POST /api/applications/:id/deploy
```

#### Undeploy Application
```bash
POST /api/applications/:id/undeploy
```

### User Management

#### List Users
```bash
GET /api/users
```

#### Create User
```bash
POST /api/users
```

### Analytics

#### Device Statistics
```bash
GET /api/analytics/devices
```

#### System Health
```bash
GET /api/analytics/health
```

## WebSocket API

Real-time communication uses WebSocket connections:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// Send command to device
ws.send(JSON.stringify({
  type: 'device_command',
  device_id: 'device-123',
  command: 'restart'
}));
```

## Development

### Project Structure

```
src/
├── server.js           # Main server entry point
├── database/           # Database connection and migrations
├── routes/             # API route handlers
├── middleware/         # Express middleware
├── services/           # Business logic services
├── utils/              # Utility functions
└── models/             # Data models
```

### Adding New Features

1. **Create API route**:
```javascript
// src/routes/newfeature.js
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  // Implementation
});

module.exports = router;
```

2. **Register route**:
```javascript
// src/server.js
const newFeatureRoutes = require('./routes/newfeature');
app.use('/api/newfeature', newFeatureRoutes);
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --grep "device management"
```

### Code Style

The project uses ESLint and Prettier for code formatting:

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Development Workflow (Recommended)

For local development, it's recommended to run the Node.js server locally while using containerized PostgreSQL and Redis:

```bash
# 1. Start database containers
npm run db:up

# 2. Start the development server with auto-reload
npm run dev

# Or combine both steps
npm run dev:full
```

**Development Commands:**
- `npm run db:up` - Start PostgreSQL and Redis containers
- `npm run db:down` - Stop database containers  
- `npm run db:logs` - View database container logs
- `npm run dev` - Start server with nodemon (auto-reload)
- `npm run dev:full` - Start databases + development server

This approach provides:
- Fast iteration and debugging
- Easy access to server logs
- Hot reloading with nodemon
- Containerized databases for consistency

## Deployment

### Production Setup

1. **Environment Configuration**:
```bash
export NODE_ENV=production
export DB_PASSWORD=secure_password
export JWT_SECRET=very_secure_secret
```

2. **Database Setup**:
```bash
# Create production database
createdb kiosk_management_prod

# Run migrations
NODE_ENV=production npm run migrate
```

3. **Process Management**:
```bash
# Using PM2
npm install -g pm2
pm2 start ecosystem.config.js

# Using systemd
sudo cp kiosk-management.service /etc/systemd/system/
sudo systemctl enable kiosk-management
sudo systemctl start kiosk-management
```

### Docker Deployment

```bash
# Build production image
docker build -t kiosk-management:latest .

# Run with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Monitoring

### Health Checks

The server provides health check endpoints:

```bash
# Basic health check
curl http://localhost:3000/api/health

# Detailed system status
curl http://localhost:3000/api/health/detailed
```

### Logging

Logs are written to:
- Console (development)
- Files (production): `/var/log/kiosk-management/`
- Syslog (production)

### Metrics

Integration with monitoring systems:

```bash
# Prometheus metrics
curl http://localhost:3000/metrics

# Custom metrics endpoint
curl http://localhost:3000/api/metrics
```

## Security

### Authentication & Authorization

- JWT-based authentication
- Role-based access control (RBAC)
- Session management with Redis
- Password hashing with bcrypt

### Communication Security

- HTTPS enforcement in production
- API rate limiting
- Request validation with Joi
- SQL injection prevention
- XSS protection

### Device Security

- Device authentication with API keys
- Encrypted communication channels
- Command signing and verification
- Secure boot verification

## Troubleshooting

### Common Issues

1. **Database Connection Failed**:
   - Check PostgreSQL is running
   - Verify connection parameters
   - Check firewall settings

2. **Redis Connection Failed**:
   - Ensure Redis is running
   - Check Redis configuration
   - Verify connection parameters

3. **WebSocket Connection Issues**:
   - Check proxy configuration
   - Verify WebSocket support
   - Check firewall rules

4. **High Memory Usage**:
   - Monitor with `htop` or `ps`
   - Check for memory leaks
   - Review connection pooling

### Debug Mode

Enable debug logging:

```bash
DEBUG=kiosk:* npm run dev
```

### Log Files

Check application logs:

```bash
# Application logs
tail -f /var/log/kiosk-management/app.log

# Error logs
tail -f /var/log/kiosk-management/error.log

# Access logs
tail -f /var/log/kiosk-management/access.log
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit pull request

## License

MIT License - see LICENSE file for details
