AdminPass123


tried to build the arm64 and it was running for a few minutes and just stopped 
ytesleft);

# FydeOS Management Kiosk System

A comprehensive kiosk management system inspired by FydeOS Management, consisting of a web-based management server and a lightweight Linux-based kiosk OS.

## Architecture

### Management Server
- **Location**: `./management-server/`
- **Technology**: Node.js + Express + React + PostgreSQL
- **Purpose**: Web-based management interface for controlling and monitoring kiosks
- **Features**:
  - Device management and monitoring
  - Remote configuration and updates
  - Application deployment
  - Real-time status monitoring
  - User management and authentication
  - Analytics and reporting

### Kiosk OS
- **Location**: `./kiosk-os/`
- **Technology**: Custom Linux distribution (Buildroot-based)
- **Architecture Support**: ARM64 and x86_64
- **Purpose**: Lightweight OS that runs on kiosk devices
- **Features**:
  - Minimal Linux kernel with kiosk-specific components
  - Auto-connects to management server
  - Secure boot and update mechanism
  - Application container runtime
  - Hardware abstraction layer

## Quick Start

### Management Server
```bash
cd management-server
npm install
npm run dev
```

### Kiosk OS
```bash
cd kiosk-os
./build.sh
```

## System Requirements

### Management Server
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- 2GB RAM minimum
- 10GB storage

### Kiosk OS
- Target device with ARM64 or x86_64 architecture
- 1GB RAM minimum
- 4GB storage minimum
- Network connectivity

## Documentation

- [Management Server Documentation](./management-server/README.md)
- [Kiosk OS Documentation](./kiosk-os/README.md)
- [API Documentation](./docs/api.md)
- [Deployment Guide](./docs/deployment.md)

## License

MIT License
