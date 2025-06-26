# API Documentation

## Overview

The Kiosk Management System provides a comprehensive RESTful API for managing kiosk devices, applications, users, and system configurations. All API endpoints require authentication unless otherwise specified.

## Base URL

```
https://your-management-server.com/api
```

## Authentication

The API uses JWT (JSON Web Token) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Obtaining a Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}
```

Response:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

## Rate Limiting

API requests are rate-limited to prevent abuse:
- 100 requests per 15-minute window per IP address
- Authentication endpoints: 5 requests per 15-minute window

## Error Handling

The API returns standard HTTP status codes and error messages in JSON format:

```json
{
  "error": "Error message",
  "details": "Additional error details (development only)"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Too Many Requests
- `500` - Internal Server Error

## Endpoints

### Authentication

#### Login
```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

#### Verify Token
```http
GET /api/auth/verify
Authorization: Bearer <token>
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

### Devices

#### List Devices
```http
GET /api/devices
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 20)
- `status` (string) - Filter by status (online, offline, error, updating)
- `group_id` (uuid) - Filter by device group
- `search` (string) - Search in name, device_id, or description
- `sort_by` (string) - Sort field (name, status, last_seen, created_at)
- `sort_order` (string) - Sort order (ASC, DESC)

**Response:**
```json
{
  "devices": [
    {
      "id": "uuid",
      "device_id": "kiosk-device-001",
      "name": "Lobby Kiosk",
      "description": "Main lobby information kiosk",
      "group_id": "uuid",
      "group_name": "Lobby Group",
      "status": "online",
      "last_seen": "2023-06-26T10:30:00Z",
      "hardware_info": {},
      "system_info": {},
      "network_info": {},
      "location": {}
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "pages": 3
  }
}
```

#### Get Device
```http
GET /api/devices/:id
Authorization: Bearer <token>
```

#### Create Device
```http
POST /api/devices
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "device_id": "kiosk-device-001",
  "name": "Lobby Kiosk",
  "description": "Main lobby information kiosk",
  "group_id": "uuid (optional)",
  "location": {
    "building": "Main Building",
    "floor": "1",
    "room": "Lobby"
  }
}
```

#### Update Device
```http
PUT /api/devices/:id
Authorization: Bearer <token>
Content-Type: application/json
```

#### Delete Device
```http
DELETE /api/devices/:id
Authorization: Bearer <token>
```

#### Device Heartbeat (Kiosk OS)
```http
POST /api/devices/:device_id/heartbeat
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "online",
  "hardware_info": {
    "cpu_model": "Intel Core i5",
    "memory_total": 8589934592,
    "memory_available": 4294967296,
    "disk_total": 107374182400,
    "disk_free": 53687091200,
    "temperature": 45.5
  },
  "system_info": {
    "hostname": "kiosk-device-001",
    "kernel": "5.15.0",
    "architecture": "x86_64",
    "load_average": {
      "1min": 0.5,
      "5min": 0.3,
      "15min": 0.2
    }
  },
  "network_info": {
    "interfaces": [
      {
        "name": "eth0",
        "state": "UP",
        "addresses": [
          {
            "type": "ipv4",
            "address": "192.168.1.100/24"
          }
        ]
      }
    ]
  }
}
```

#### Get Device Logs
```http
GET /api/devices/:id/logs
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (number) - Page number
- `limit` (number) - Items per page
- `level` (string) - Log level filter
- `since` (datetime) - Show logs since timestamp

### Applications

#### List Applications
```http
GET /api/applications
Authorization: Bearer <token>
```

#### Get Application
```http
GET /api/applications/:id
Authorization: Bearer <token>
```

#### Create Application
```http
POST /api/applications
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Digital Signage",
  "version": "1.0.0",
  "description": "Digital signage application",
  "package_url": "https://example.com/app.tar.gz",
  "config_schema": {
    "type": "object",
    "properties": {
      "display_duration": {
        "type": "number",
        "default": 10
      }
    }
  }
}
```

#### Deploy Application
```http
POST /api/applications/:id/deploy
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "device_ids": ["uuid1", "uuid2"],
  "config": {
    "display_duration": 15
  }
}
```

### Users

#### List Users
```http
GET /api/users
Authorization: Bearer <token>
```

#### Create User
```http
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "securepassword",
  "role": "user"
}
```

### Analytics

#### Device Statistics
```http
GET /api/analytics/devices
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total_devices": 100,
  "online_devices": 85,
  "offline_devices": 10,
  "error_devices": 5,
  "status_distribution": {
    "online": 85,
    "offline": 10,
    "error": 5
  },
  "architecture_distribution": {
    "x86_64": 60,
    "arm64": 40
  }
}
```

#### System Health
```http
GET /api/analytics/health
Authorization: Bearer <token>
```

### Configuration

#### Get System Configuration
```http
GET /api/config
Authorization: Bearer <token>
```

#### Update System Configuration
```http
PUT /api/config
Authorization: Bearer <token>
Content-Type: application/json
```

### Health Check

#### Basic Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2023-06-26T10:30:00Z",
  "uptime": 86400,
  "version": "1.0.0"
}
```

## WebSocket API

The system provides real-time communication via WebSocket connections.

### Connection

```javascript
const ws = new WebSocket('wss://your-server.com/ws');
```

### Authentication

Send authentication message after connection:

```javascript
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-token'
}));
```

### Message Types

#### Device Status Update
```json
{
  "type": "device_status_update",
  "data": {
    "device_id": "uuid",
    "device_id_string": "kiosk-device-001",
    "status": "online",
    "last_seen": "2023-06-26T10:30:00Z"
  }
}
```

#### Device Command
```json
{
  "type": "device_command",
  "data": {
    "device_id": "uuid",
    "command": "restart",
    "parameters": {}
  }
}
```

#### System Event
```json
{
  "type": "system_event",
  "data": {
    "event_type": "device_registered",
    "device_id": "uuid",
    "timestamp": "2023-06-26T10:30:00Z"
  }
}
```

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

class KioskManagementAPI {
  constructor(baseURL, token) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getDevices(params = {}) {
    const response = await this.client.get('/devices', { params });
    return response.data;
  }

  async getDevice(id) {
    const response = await this.client.get(`/devices/${id}`);
    return response.data;
  }

  async deployApplication(appId, devices, config = {}) {
    const response = await this.client.post(`/applications/${appId}/deploy`, {
      device_ids: devices,
      config
    });
    return response.data;
  }
}

// Usage
const api = new KioskManagementAPI('https://your-server.com/api', 'your-token');
const devices = await api.getDevices({ status: 'online' });
```

### Python

```python
import requests

class KioskManagementAPI:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def get_devices(self, **params):
        response = requests.get(
            f'{self.base_url}/devices',
            headers=self.headers,
            params=params
        )
        return response.json()

    def deploy_application(self, app_id, device_ids, config=None):
        data = {
            'device_ids': device_ids,
            'config': config or {}
        }
        response = requests.post(
            f'{self.base_url}/applications/{app_id}/deploy',
            headers=self.headers,
            json=data
        )
        return response.json()

# Usage
api = KioskManagementAPI('https://your-server.com/api', 'your-token')
devices = api.get_devices(status='online')
```

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_001` | Invalid credentials |
| `AUTH_002` | Token expired |
| `AUTH_003` | Account disabled |
| `DEV_001` | Device not found |
| `DEV_002` | Device ID already exists |
| `DEV_003` | Invalid device status |
| `APP_001` | Application not found |
| `APP_002` | Application deployment failed |
| `USER_001` | User not found |
| `USER_002` | Username already exists |
| `SYS_001` | System maintenance mode |

## Versioning

The API uses semantic versioning. The current version is included in response headers:

```
X-API-Version: 1.0.0
```

## Support

For API support and questions:
- Documentation: https://docs.example.com
- Support: support@example.com
- GitHub Issues: https://github.com/your-org/kiosk-management-system/issues
