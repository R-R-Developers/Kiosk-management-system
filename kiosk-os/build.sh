#!/bin/bash

# Kiosk OS Build Script
# Builds a custom Linux distribution for kiosk devices

set -e

# Default configuration
ARCH=""
CONFIG=""
CLEAN=false
DEBUG=false
VERBOSE=false
JOBS=$(nproc)
OUTPUT_DIR="output"
BUILDROOT_VERSION="2023.08.1"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    if [ "$DEBUG" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

# Show usage information
show_usage() {
    cat << EOF
Kiosk OS Build Script

Usage: $0 [OPTIONS]

Options:
    --arch ARCH         Target architecture (x86_64, arm64)
    --config CONFIG     Configuration file (default: auto-detect)
    --clean             Clean build (remove output directory)
    --debug             Enable debug build
    --verbose           Verbose output
    --jobs N            Number of parallel jobs (default: $(nproc))
    --output DIR        Output directory (default: output)
    --help              Show this help message

Examples:
    $0 --arch x86_64
    $0 --arch arm64 --clean
    $0 --arch x86_64 --config custom_defconfig --debug

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --arch)
                ARCH="$2"
                shift 2
                ;;
            --config)
                CONFIG="$2"
                shift 2
                ;;
            --clean)
                CLEAN=true
                shift
                ;;
            --debug)
                DEBUG=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --jobs)
                JOBS="$2"
                shift 2
                ;;
            --output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Validate arguments
validate_args() {
    if [ -z "$ARCH" ]; then
        log_error "Architecture must be specified with --arch"
        show_usage
        exit 1
    fi

    case "$ARCH" in
        x86_64|arm64)
            ;;
        *)
            log_error "Unsupported architecture: $ARCH"
            log_error "Supported architectures: x86_64, arm64"
            exit 1
            ;;
    esac

    if [ -z "$CONFIG" ]; then
        CONFIG="kiosk_${ARCH}_defconfig"
        log_info "Using default config: $CONFIG"
    fi
}

# Check system dependencies
check_dependencies() {
    log_info "Checking system dependencies..."
    
    # Commands that should be available
    local cmd_deps=(
        "gcc" "g++" "make" "git" "wget" "unzip" "bc" "python3" 
        "rsync" "cpio" "file" "patch" "perl"
    )
    
    # Packages that should be installed (Ubuntu/Debian)
    local pkg_deps=(
        "python3-dev" "build-essential"
    )
    
    local missing_deps=()
    
    # Check command dependencies
    for dep in "${cmd_deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    # Check package dependencies (on Ubuntu/Debian systems)
    if command -v dpkg &> /dev/null; then
        for pkg in "${pkg_deps[@]}"; do
            if ! dpkg -l | grep -q "^ii  $pkg "; then
                missing_deps+=("$pkg")
            fi
        done
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        log_error "Please install missing dependencies:"
        log_error "  Ubuntu/Debian: sudo apt-get install ${missing_deps[*]}"
        log_error "  RHEL/CentOS: sudo yum install ${missing_deps[*]}"
        exit 1
    fi
    
    log_info "All dependencies satisfied"
}

# Setup build environment
setup_environment() {
    log_info "Setting up build environment..."
    
    # Create output directory
    if [ "$CLEAN" = true ] && [ -d "$OUTPUT_DIR" ]; then
        log_info "Cleaning output directory..."
        rm -rf "$OUTPUT_DIR"
    fi
    
    mkdir -p "$OUTPUT_DIR"
    
    # Download and extract Buildroot if not present
    if [ ! -d "buildroot-$BUILDROOT_VERSION" ]; then
        log_info "Downloading Buildroot $BUILDROOT_VERSION..."
        wget -q "https://buildroot.org/downloads/buildroot-$BUILDROOT_VERSION.tar.gz"
        tar -xzf "buildroot-$BUILDROOT_VERSION.tar.gz"
        rm "buildroot-$BUILDROOT_VERSION.tar.gz"
    fi
    
    # Create symlink for convenience
    if [ ! -L "buildroot" ]; then
        ln -sf "buildroot-$BUILDROOT_VERSION" buildroot
    fi
    
    # Set environment variables
    export BR2_EXTERNAL="$(pwd)/buildroot-external"
    export BR2_DL_DIR="$(pwd)/dl"
    
    log_debug "BR2_EXTERNAL set to: $BR2_EXTERNAL"
    log_debug "BR2_DL_DIR set to: $BR2_DL_DIR"
    
    # Create download directory
    mkdir -p "$BR2_DL_DIR"
    
    log_info "Build environment ready"
}

# Configure buildroot
configure_buildroot() {
    log_info "Configuring Buildroot for $ARCH..."
    
    # Ensure buildroot is available
    if [ ! -d "buildroot" ]; then
        log_error "Buildroot directory not found. Run setup_environment first."
        exit 1
    fi
    
    cd buildroot
    
    # Copy configuration
    if [ -f "../configs/$CONFIG" ]; then
        cp "../configs/$CONFIG" .config
        log_info "Using configuration: $CONFIG"
    else
        log_error "Configuration file not found: configs/$CONFIG"
        exit 1
    fi
    
    # Apply architecture-specific settings
    case "$ARCH" in
        x86_64)
            # Intel/AMD 64-bit configuration
            utils/config --set-str BR2_ARCH "x86_64"
            utils/config --set-str BR2_GCC_TARGET_ARCH "x86-64"
            utils/config --enable BR2_x86_64
            ;;
        arm64)
            # ARM 64-bit configuration
            utils/config --set-str BR2_ARCH "aarch64"
            utils/config --enable BR2_aarch64
            utils/config --enable BR2_ARM_FPU_VFPV3
            ;;
    esac
    
    # Debug configuration
    if [ "$DEBUG" = true ]; then
        log_info "Enabling debug configuration..."
        utils/config --enable BR2_ENABLE_DEBUG
        utils/config --set-str BR2_OPTIMIZE_2 ""
        utils/config --set-str BR2_OPTIMIZE_G "y"
        utils/config --enable BR2_PACKAGE_GDB
        utils/config --enable BR2_PACKAGE_STRACE
    fi
    
    # Apply configuration
    make olddefconfig
    
    cd ..
    
    log_info "Buildroot configured"
}

# Build the system
build_system() {
    log_info "Building Kiosk OS for $ARCH..."
    log_info "This may take a while (30-60 minutes)..."
    
    cd buildroot
    
    # Build options
    local make_opts=""
    if [ "$VERBOSE" = true ]; then
        make_opts="V=1"
    fi
    
    # Start build
    local start_time=$(date +%s)
    
    if make -j"$JOBS" $make_opts; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_info "Build completed successfully in ${duration}s"
    else
        log_error "Build failed"
        exit 1
    fi
    
    cd ..
}

# Post-build processing
post_build() {
    log_info "Post-build processing..."
    
    # Copy output files
    local br_output="buildroot/output"
    
    if [ -d "$br_output/images" ]; then
        log_info "Copying build artifacts..."
        cp -r "$br_output/images"/* "$OUTPUT_DIR/"
        
        # Rename files for clarity
        if [ -f "$OUTPUT_DIR/rootfs.ext4" ]; then
            mv "$OUTPUT_DIR/rootfs.ext4" "$OUTPUT_DIR/kiosk-os-$ARCH.img"
        fi
        
        if [ -f "$OUTPUT_DIR/bzImage" ]; then
            mv "$OUTPUT_DIR/bzImage" "$OUTPUT_DIR/kiosk-kernel-$ARCH"
        fi
        
        # Create checksums
        cd "$OUTPUT_DIR"
        sha256sum * > checksums.txt
        cd ..
        
        log_info "Build artifacts saved to: $OUTPUT_DIR/"
        log_info "Files created:"
        ls -la "$OUTPUT_DIR/"
    else
        log_error "Build output not found"
        exit 1
    fi
}

# Create installation media
create_media() {
    log_info "Creating installation media..."
    
    # Create USB installer script
    cat > "$OUTPUT_DIR/install-usb.sh" << 'EOF'
#!/bin/bash
# USB Installation Script for Kiosk OS

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <device>"
    echo "Example: $0 /dev/sdb"
    echo ""
    echo "WARNING: This will completely erase the target device!"
    echo ""
    echo "Available devices:"
    lsblk -d -o NAME,SIZE,MODEL | grep -v loop
    exit 1
fi

DEVICE=$1
IMAGE=$(dirname $0)/kiosk-os-*.img

if [ ! -f $IMAGE ]; then
    echo "Error: Kiosk OS image not found"
    exit 1
fi

echo "WARNING: This will erase all data on $DEVICE"
echo "Image: $IMAGE"
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 1
fi

echo "Writing image to $DEVICE..."
sudo dd if=$IMAGE of=$DEVICE bs=4M status=progress
sync

echo "Installation complete!"
echo "You can now boot from $DEVICE"
EOF
    
    chmod +x "$OUTPUT_DIR/install-usb.sh"
    
    # Create network boot files
    mkdir -p "$OUTPUT_DIR/netboot"
    if [ -f "$OUTPUT_DIR/kiosk-kernel-$ARCH" ]; then
        cp "$OUTPUT_DIR/kiosk-kernel-$ARCH" "$OUTPUT_DIR/netboot/bzImage"
    fi
    if [ -f "buildroot/output/images/rootfs.cpio.gz" ]; then
        cp "buildroot/output/images/rootfs.cpio.gz" "$OUTPUT_DIR/netboot/"
    fi
    
    log_info "Installation media created"
}

# Generate documentation
generate_docs() {
    log_info "Generating documentation..."
    
    cat > "$OUTPUT_DIR/README.txt" << EOF
Kiosk OS Build - $ARCH
=====================

Build Date: $(date)
Architecture: $ARCH
Configuration: $CONFIG
Buildroot Version: $BUILDROOT_VERSION

Files:
- kiosk-os-$ARCH.img: Main system image
- kiosk-kernel-$ARCH: Linux kernel
- rootfs.cpio.gz: Root filesystem (for netboot)
- checksums.txt: File checksums
- install-usb.sh: USB installation script

Installation:
1. USB Flash Drive:
   ./install-usb.sh /dev/sdX

2. Network Boot:
   Copy netboot/* to your PXE server

3. SD Card (ARM):
   dd if=kiosk-os-$ARCH.img of=/dev/mmcblk0 bs=4M

For more information, see the main README.md file.
EOF
    
    log_info "Documentation generated"
}

# Main build function
main() {
    log_info "Starting Kiosk OS build..."
    log_info "Target Architecture: $ARCH"
    log_info "Build Configuration: $CONFIG"
    log_info "Parallel Jobs: $JOBS"
    
    check_dependencies
    setup_environment
    configure_buildroot
    build_system
    post_build
    create_media
    generate_docs
    
    log_info "Build completed successfully!"
    log_info "Output directory: $OUTPUT_DIR"
    log_info ""
    log_info "Next steps:"
    log_info "1. Flash to USB: cd $OUTPUT_DIR && ./install-usb.sh /dev/sdX"
    log_info "2. Configure management server in configs/management.conf"
    log_info "3. Boot target device"
}

# Script entry point
parse_args "$@"
validate_args
main
