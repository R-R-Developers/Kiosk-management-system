#!/bin/bash

# Post-image script for Kiosk OS
# This script runs after the filesystem image is created

set -e

IMAGES_DIR="$1"

if [ -z "$IMAGES_DIR" ]; then
    echo "Usage: $0 <images_dir>"
    exit 1
fi

echo "Running post-image script for Kiosk OS..."

# Create final image name based on architecture
if [ -f "$IMAGES_DIR/bzImage" ]; then
    # x86_64 system
    ARCH="x86_64"
    KERNEL="bzImage"
elif [ -f "$IMAGES_DIR/Image" ]; then
    # ARM64 system
    ARCH="arm64"
    KERNEL="Image"
else
    echo "Warning: No kernel image found"
    ARCH="unknown"
fi

# Rename rootfs image with architecture
if [ -f "$IMAGES_DIR/rootfs.ext4" ]; then
    cp "$IMAGES_DIR/rootfs.ext4" "$IMAGES_DIR/kiosk-os-$ARCH.img"
    echo "Created: kiosk-os-$ARCH.img"
fi

# Create version file
echo "Kiosk OS $ARCH $(date +%Y.%m.%d)" > "$IMAGES_DIR/version.txt"

# Create checksums
cd "$IMAGES_DIR"
sha256sum * > checksums.txt 2>/dev/null || true

echo "Post-image script completed successfully"
