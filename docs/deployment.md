# Deployment Guide

This guide covers how to deploy the Kiosk Management System in production environments.

## Overview

The Kiosk Management System consists of two main components:
1. **Management Server** - Web-based management interface
2. **Kiosk OS** - Lightweight Linux distribution for kiosk devices

## Prerequisites

### Hardware Requirements

#### Management Server
- **CPU**: 2+ cores, 2.0 GHz or higher
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 50GB minimum, SSD recommended
- **Network**: Gigabit Ethernet

#### Kiosk Devices
- **x86_64**: Intel/AMD 64-bit processor, 2GB RAM, 8GB storage
- **ARM64**: ARM Cortex-A53 or higher, 1GB RAM, 4GB storage
- **Network**: Ethernet or WiFi connectivity

### Software Requirements

#### Management Server
- Ubuntu 20.04 LTS or newer
- Docker and Docker Compose (recommended)
- Or: Node.js 18+, PostgreSQL 14+, Redis 6+

#### Network Infrastructure
- DHCP server for device provisioning
- DNS resolution
- Internet connectivity (for updates)
- Optional: PXE server for network boot

## Management Server Deployment

### Option 1: Docker Compose (Recommended)

1. **Prepare the environment**:
```bash
# Create deployment directory
mkdir -p /opt/kiosk-management
cd /opt/kiosk-management

# Clone the repository
git clone https://github.com/your-org/kiosk-management-system.git .
cd management-server
```

2. **Configure environment**:
```bash
# Copy and edit environment file
cp .env.example .env
nano .env
```

Key configuration:
```bash
NODE_ENV=production
JWT_SECRET=your_very_secure_secret_key_here
DB_PASSWORD=your_secure_database_password
REDIS_PASSWORD=your_redis_password
```

3. **Generate SSL certificates**:
```bash
# Using Let's Encrypt
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# Update docker-compose.yml with certificate paths
```

4. **Deploy with Docker Compose**:
```bash
# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f management-server
```

5. **Initialize database**:
```bash
# Run database migrations
docker-compose exec management-server npm run migrate

# Create admin user
docker-compose exec management-server npm run seed
```

### Option 2: Manual Installation

1. **Install dependencies**:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Redis
sudo apt install -y redis-server

# Install Nginx
sudo apt install -y nginx
```

2. **Setup PostgreSQL**:
```bash
# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE kiosk_management;
CREATE USER kiosk_admin WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE kiosk_management TO kiosk_admin;
\q
EOF
```

3. **Setup application**:
```bash
# Create application user
sudo useradd -r -s /bin/false kiosk

# Create directories
sudo mkdir -p /opt/kiosk-management
sudo mkdir -p /var/log/kiosk-management
sudo chown kiosk:kiosk /opt/kiosk-management /var/log/kiosk-management

# Clone and setup application
cd /opt/kiosk-management
sudo -u kiosk git clone https://github.com/your-org/kiosk-management-system.git .
cd management-server
sudo -u kiosk npm install --production
```

4. **Configure environment**:
```bash
sudo -u kiosk cp .env.example .env
sudo nano .env
```

5. **Setup systemd service**:
```bash
sudo tee /etc/systemd/system/kiosk-management.service << EOF
[Unit]
Description=Kiosk Management Server
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=kiosk
WorkingDirectory=/opt/kiosk-management/management-server
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable kiosk-management
sudo systemctl start kiosk-management
```

6. **Configure Nginx**:
```bash
sudo tee /etc/nginx/sites-available/kiosk-management << EOF
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/kiosk-management /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Kiosk OS Deployment

### Building Kiosk OS

1. **Setup build environment**:
```bash
# On Ubuntu 20.04 LTS
sudo apt update
sudo apt install -y build-essential git wget unzip bc python3 python3-dev \
    python3-distutils python3-setuptools rsync cpio file

# Clone repository
git clone https://github.com/your-org/kiosk-management-system.git
cd kiosk-management-system/kiosk-os
```

2. **Configure management server connection**:
```bash
# Edit configuration
nano configs/management.conf

# Set server URL and API key
[server]
url = https://your-management-server.com
api_key = your_device_api_key
```

3. **Build OS images**:
```bash
# Build for x86_64
./build.sh --arch x86_64

# Build for ARM64
./build.sh --arch arm64

# Images will be in output/ directory
```

### Deployment Methods

#### Method 1: USB Installation

1. **Create bootable USB**:
```bash
# Use the generated installer script
cd output
sudo ./install-usb.sh /dev/sdX  # Replace with your USB device
```

2. **Boot target device**:
- Insert USB drive into kiosk device
- Boot from USB
- Follow installation prompts

#### Method 2: Network Boot (PXE)

1. **Setup PXE server**:
```bash
# Install TFTP and DHCP server
sudo apt install -y tftpd-hpa isc-dhcp-server

# Configure DHCP
sudo tee -a /etc/dhcp/dhcpd.conf << EOF
subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.100 192.168.1.200;
    option routers 192.168.1.1;
    option domain-name-servers 8.8.8.8;
    
    # PXE boot configuration
    filename "pxelinux.0";
    next-server 192.168.1.10;  # PXE server IP
}
EOF
```

2. **Copy boot files**:
```bash
# Copy kernel and initrd
sudo cp output/netboot/* /var/lib/tftpboot/

# Setup PXE configuration
sudo mkdir -p /var/lib/tftpboot/pxelinux.cfg
sudo tee /var/lib/tftpboot/pxelinux.cfg/default << EOF
DEFAULT kiosk
LABEL kiosk
    KERNEL bzImage
    INITRD rootfs.cpio.gz
    APPEND console=tty0 console=ttyS0,115200n8
EOF
```

#### Method 3: SD Card (ARM devices)

```bash
# Flash to SD card
sudo dd if=output/kiosk-os-arm64.img of=/dev/mmcblk0 bs=4M status=progress
sync
```

### Device Registration

After first boot, devices will automatically register with the management server if configured correctly.

1. **Verify device registration**:
   - Check management server dashboard
   - Look for new device in device list

2. **Manual registration** (if automatic fails):
```bash
# On kiosk device
sudo systemctl status kiosk-agent
sudo journalctl -u kiosk-agent -f
```

## High Availability Setup

### Database Clustering

1. **PostgreSQL Master-Slave Setup**:
```bash
# On master server
sudo tee -a /etc/postgresql/14/main/postgresql.conf << EOF
wal_level = replica
max_wal_senders = 3
wal_keep_segments = 8
EOF

# Create replication user
sudo -u postgres psql << EOF
CREATE USER replica REPLICATION LOGIN CONNECTION LIMIT 1 ENCRYPTED PASSWORD 'replica_password';
EOF
```

2. **Setup slave server**:
```bash
# Stop PostgreSQL
sudo systemctl stop postgresql

# Take base backup
sudo -u postgres pg_basebackup -h master_ip -D /var/lib/postgresql/14/main -U replica -v -P -W

# Configure recovery
sudo -u postgres tee /var/lib/postgresql/14/main/recovery.conf << EOF
standby_mode = 'on'
primary_conninfo = 'host=master_ip port=5432 user=replica password=replica_password'
EOF
```

### Load Balancing

1. **Setup HAProxy**:
```bash
sudo apt install -y haproxy

sudo tee /etc/haproxy/haproxy.cfg << EOF
global
    daemon

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

frontend kiosk_frontend
    bind *:80
    bind *:443 ssl crt /etc/ssl/certs/your-domain.pem
    redirect scheme https if !{ ssl_fc }
    default_backend kiosk_backend

backend kiosk_backend
    balance roundrobin
    server app1 10.0.1.10:3000 check
    server app2 10.0.1.11:3000 check
EOF

sudo systemctl enable haproxy
sudo systemctl start haproxy
```

### Redis Clustering

1. **Setup Redis Sentinel**:
```bash
# On each Redis server
sudo tee /etc/redis/sentinel.conf << EOF
port 26379
sentinel monitor mymaster 10.0.1.10 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
sentinel parallel-syncs mymaster 1
EOF

sudo systemctl enable redis-sentinel
sudo systemctl start redis-sentinel
```

## Monitoring and Maintenance

### Monitoring Setup

1. **Install monitoring tools**:
```bash
# Prometheus
sudo apt install -y prometheus

# Grafana
sudo apt install -y grafana

# Node Exporter
sudo apt install -y prometheus-node-exporter
```

2. **Configure Prometheus**:
```yaml
# /etc/prometheus/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'kiosk-management'
    static_configs:
      - targets: ['localhost:3000']
  
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
```

### Backup Strategy

1. **Database backups**:
```bash
#!/bin/bash
# /usr/local/bin/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/kiosk-management"
DB_NAME="kiosk_management"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete
```

2. **Setup cron job**:
```bash
# Add to crontab
0 2 * * * /usr/local/bin/backup-db.sh
```

### Log Management

1. **Setup log rotation**:
```bash
sudo tee /etc/logrotate.d/kiosk-management << EOF
/var/log/kiosk-management/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 kiosk kiosk
    postrotate
        systemctl reload kiosk-management
    endscript
}
EOF
```

## Security Hardening

### Server Security

1. **Firewall configuration**:
```bash
# UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw deny 3000  # Only allow through reverse proxy
```

2. **SSL/TLS hardening**:
```nginx
# Add to Nginx SSL configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
add_header Strict-Transport-Security "max-age=63072000" always;
```

### Database Security

1. **PostgreSQL hardening**:
```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/14/main/postgresql.conf

# Set these values:
ssl = on
password_encryption = scram-sha-256
log_connections = on
log_disconnections = on
```

### Application Security

1. **Environment security**:
```bash
# Restrict file permissions
sudo chmod 600 /opt/kiosk-management/management-server/.env
sudo chown kiosk:kiosk /opt/kiosk-management/management-server/.env
```

## Troubleshooting

### Common Issues

1. **Management server won't start**:
```bash
# Check logs
sudo journalctl -u kiosk-management -f

# Check database connection
sudo -u kiosk psql -h localhost -U kiosk_admin -d kiosk_management
```

2. **Devices can't connect**:
```bash
# Check network connectivity
ping your-management-server.com

# Check SSL certificates
openssl s_client -connect your-management-server.com:443

# Check device logs
sudo journalctl -u kiosk-agent -f
```

3. **High memory usage**:
```bash
# Monitor memory usage
htop

# Check for memory leaks
sudo systemctl restart kiosk-management
```

### Performance Tuning

1. **PostgreSQL tuning**:
```bash
# Edit postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
```

2. **Node.js tuning**:
```bash
# Set Node.js memory limit
export NODE_OPTIONS="--max_old_space_size=2048"
```

## Support

For deployment support:
- Documentation: https://docs.example.com
- Community: https://community.example.com
- Professional Support: support@example.com
