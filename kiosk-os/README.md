# Kiosk OS

A lightweight Linux-based operating system designed for kiosk devices, built with Buildroot and supporting both ARM64 and x86_64 architectures.

## Features

- **Minimal Linux Kernel**: Optimized for kiosk use cases
- **Multi-Architecture Support**: ARM64 and x86_64
- **Management Server Integration**: Auto-connects to management server
- **Secure Boot**: Verified boot process
- **OTA Updates**: Over-the-air update capability
- **Container Runtime**: Support for containerized applications
- **Hardware Abstraction**: Consistent API across different hardware
- **Remote Configuration**: Centralized configuration management

## Architecture

```
┌─────────────────────────────────────────┐
│              Applications               │
├─────────────────────────────────────────┤
│          Application Runtime            │
├─────────────────────────────────────────┤
│         Kiosk OS Services               │
├─────────────────────────────────────────┤
│      Hardware Abstraction Layer         │
├─────────────────────────────────────────┤
│           Linux Kernel                  │
├─────────────────────────────────────────┤
│            Hardware                     │
└─────────────────────────────────────────┘
```

## Directory Structure

```
kiosk-os/
├── buildroot/          # Buildroot configuration and customizations
├── kernel/             # Linux kernel configuration
├── rootfs-overlay/     # Root filesystem overlays
├── board/              # Board-specific configurations
├── services/           # Kiosk OS system services
├── apps/               # Built-in applications
├── tools/              # Build and development tools
├── scripts/            # Build and deployment scripts
└── configs/            # Configuration files
```

## Building

### Prerequisites

- Ubuntu 20.04 LTS or newer
- At least 4GB RAM
- 20GB free disk space
- Internet connection

### Quick Start

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y build-essential git wget unzip bc python3 python3-dev \
    python3-distutils python3-setuptools rsync cpio file

# Clone and build
git clone <repository-url>
cd kiosk-os
./build.sh --arch x86_64  # or arm64
```

### Build Options

```bash
# Build for specific architecture
./build.sh --arch x86_64     # Intel/AMD 64-bit
./build.sh --arch arm64      # ARM 64-bit

# Clean build
./build.sh --clean --arch x86_64

# Build with custom configuration
./build.sh --config custom_defconfig --arch x86_64

# Development build with debugging
./build.sh --debug --arch x86_64
```

## Configuration

### Management Server Connection

Edit `configs/management.conf`:

```ini
[server]
url = https://your-management-server.com
api_key = your-api-key
device_id = auto  # or specify custom device ID

[network]
wifi_ssid = YourWiFiNetwork
wifi_password = YourPassword
use_ethernet = true

[security]
enable_secure_boot = true
auto_update = true
update_channel = stable
```

### Hardware Configuration

The OS automatically detects and configures common hardware. For custom hardware, edit `configs/hardware.conf`.

## Deployment

### USB Flash Drive

```bash
# Create bootable USB
sudo dd if=output/images/kiosk-os-x86_64.img of=/dev/sdX bs=4M status=progress
sync
```

### Network Boot (PXE)

```bash
# Setup PXE server
./scripts/setup-pxe.sh

# Copy images to PXE server
cp output/images/bzImage /tftpboot/
cp output/images/rootfs.cpio.gz /tftpboot/
```

### SD Card (ARM devices)

```bash
# Flash to SD card
sudo dd if=output/images/kiosk-os-arm64.img of=/dev/mmcblk0 bs=4M status=progress
sync
```

## Services

### Core Services

- **kiosk-agent**: Main communication agent with management server
- **app-runtime**: Application container runtime
- **hw-monitor**: Hardware monitoring and reporting
- **config-sync**: Configuration synchronization
- **update-manager**: OTA update management

### Service Management

```bash
# Check service status
systemctl status kiosk-agent

# View logs
journalctl -u kiosk-agent -f

# Restart service
systemctl restart kiosk-agent
```

## Development

### Custom Applications

Applications can be deployed as:
1. **Container Images**: Docker-compatible containers
2. **Native Applications**: Compiled binaries
3. **Web Applications**: Progressive Web Apps

### SDK

```bash
# Install development SDK
./scripts/install-sdk.sh

# Cross-compile application
source environment-setup-x86_64-kioskos-linux
$CC -o myapp myapp.c
```

## API Reference

### Device Agent API

The kiosk OS provides a local API for applications:

```bash
# Get device info
curl http://localhost:8080/api/device/info

# Get configuration
curl http://localhost:8080/api/config

# Send logs
curl -X POST http://localhost:8080/api/logs \
  -H "Content-Type: application/json" \
  -d '{"level": "info", "message": "Application started"}'
```

## Troubleshooting

### Common Issues

1. **Boot fails**: Check console logs, verify image integrity
2. **Network issues**: Check cable connections, WiFi credentials
3. **Service failures**: Check systemd logs with `journalctl`
4. **Update failures**: Verify management server connectivity

### Debug Mode

Boot with debug parameters:
```
console=ttyS0,115200 debug loglevel=7
```

### Recovery Mode

Access recovery shell:
```
systemctl rescue
```

## Security

- Secure boot with verified signatures
- Read-only root filesystem
- Encrypted configuration storage
- Network traffic encryption
- Regular security updates

## License

MIT License - see LICENSE file for details
