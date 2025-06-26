#!/bin/bash

# Post-build script for Kiosk OS
# This script runs after the root filesystem is built but before the final image is created

set -e

TARGET_DIR="$1"

if [ -z "$TARGET_DIR" ]; then
    echo "Usage: $0 <target_dir>"
    exit 1
fi

echo "Running post-build script for Kiosk OS..."

# Create necessary directories
mkdir -p "$TARGET_DIR/etc/kiosk"
mkdir -p "$TARGET_DIR/var/lib/kiosk"
mkdir -p "$TARGET_DIR/var/log/kiosk"
mkdir -p "$TARGET_DIR/opt/kiosk"

# Copy configuration files
cp "$BR2_EXTERNAL_KIOSK_PATH/configs/management.conf" "$TARGET_DIR/etc/kiosk/"

# Copy kiosk services
cp "$BR2_EXTERNAL_KIOSK_PATH/services/kiosk-agent.py" "$TARGET_DIR/usr/bin/kiosk-agent"
cp "$BR2_EXTERNAL_KIOSK_PATH/services/kiosk-agent.service" "$TARGET_DIR/etc/systemd/system/"

# Make kiosk-agent executable
chmod +x "$TARGET_DIR/usr/bin/kiosk-agent"

# Create kiosk user
if ! grep -q "^kiosk:" "$TARGET_DIR/etc/passwd"; then
    echo "kiosk:x:1000:1000:Kiosk User:/var/lib/kiosk:/bin/bash" >> "$TARGET_DIR/etc/passwd"
    echo "kiosk:x:1000:" >> "$TARGET_DIR/etc/group"
fi

# Set ownership
chown -R 1000:1000 "$TARGET_DIR/var/lib/kiosk"
chown -R 1000:1000 "$TARGET_DIR/var/log/kiosk"

# Enable kiosk-agent service
ln -sf "/etc/systemd/system/kiosk-agent.service" "$TARGET_DIR/etc/systemd/system/multi-user.target.wants/kiosk-agent.service"

# Create default network configuration
mkdir -p "$TARGET_DIR/etc/systemd/network"
cat > "$TARGET_DIR/etc/systemd/network/eth0.network" << EOF
[Match]
Name=eth0

[Network]
DHCP=yes
EOF

# Set hostname
echo "kiosk-device" > "$TARGET_DIR/etc/hostname"

# Create hosts file
cat > "$TARGET_DIR/etc/hosts" << EOF
127.0.0.1       localhost
127.0.1.1       kiosk-device
::1             localhost ip6-localhost ip6-loopback
ff02::1         ip6-allnodes
ff02::2         ip6-allrouters
EOF

# Set timezone
ln -sf /usr/share/zoneinfo/UTC "$TARGET_DIR/etc/localtime"

# Configure SSH (if enabled)
if [ -d "$TARGET_DIR/etc/ssh" ]; then
    # Generate SSH host keys will be done on first boot
    rm -f "$TARGET_DIR/etc/ssh/ssh_host_*"
    
    # Configure SSH daemon
    cat > "$TARGET_DIR/etc/ssh/sshd_config" << EOF
Port 22
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
X11Forwarding no
UseDNS no
EOF
fi

# Configure automatic login for kiosk user (if no SSH)
if [ -d "$TARGET_DIR/etc/systemd/system/getty@tty1.service.d" ]; then
    mkdir -p "$TARGET_DIR/etc/systemd/system/getty@tty1.service.d"
    cat > "$TARGET_DIR/etc/systemd/system/getty@tty1.service.d/override.conf" << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin kiosk --noclear %I $TERM
EOF
fi

# Create boot script for first-time setup
cat > "$TARGET_DIR/usr/bin/kiosk-firstboot" << 'EOF'
#!/bin/bash

# First boot setup script for Kiosk OS

FIRSTBOOT_FLAG="/var/lib/kiosk/.firstboot"

if [ -f "$FIRSTBOOT_FLAG" ]; then
    exit 0
fi

echo "Running first boot setup..."

# Generate SSH host keys if SSH is enabled
if [ -d "/etc/ssh" ] && [ ! -f "/etc/ssh/ssh_host_rsa_key" ]; then
    ssh-keygen -A
fi

# Generate device-specific configuration
if [ -f "/etc/kiosk/management.conf" ]; then
    # Generate unique device ID based on hardware
    DEVICE_ID=$(cat /proc/cpuinfo /proc/meminfo | sha256sum | cut -c1-16)
    sed -i "s/device_id = /device_id = kiosk-$DEVICE_ID/" /etc/kiosk/management.conf
fi

# Set up log rotation
cat > /etc/logrotate.d/kiosk << 'LOGROTATE'
/var/log/kiosk/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0644 kiosk kiosk
}
LOGROTATE

# Create firstboot flag
touch "$FIRSTBOOT_FLAG"

echo "First boot setup completed"
EOF

chmod +x "$TARGET_DIR/usr/bin/kiosk-firstboot"

# Create systemd service for first boot
cat > "$TARGET_DIR/etc/systemd/system/kiosk-firstboot.service" << EOF
[Unit]
Description=Kiosk First Boot Setup
After=local-fs.target
Before=multi-user.target

[Service]
Type=oneshot
ExecStart=/usr/bin/kiosk-firstboot
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Enable first boot service
ln -sf "/etc/systemd/system/kiosk-firstboot.service" "$TARGET_DIR/etc/systemd/system/multi-user.target.wants/kiosk-firstboot.service"

# Create version file
echo "Kiosk OS $(date +%Y.%m.%d)" > "$TARGET_DIR/etc/kiosk-version"

echo "Post-build script completed successfully"
