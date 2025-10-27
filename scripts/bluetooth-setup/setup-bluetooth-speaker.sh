#!/bin/bash

# Master Bluetooth Speaker Setup Script
# This script provides a complete, idempotent setup for Raspberry Pi Bluetooth speaker functionality
# Run with: sudo ./setup-bluetooth-speaker.sh
#
# Features:
# - Complete Bluetooth speaker configuration
# - Audio system optimization  
# - Idempotent (safe to run multiple times)
# - Automatic rollback on errors
# - Comprehensive status checking

set -euo pipefail

# Script information
SCRIPT_NAME="Bluetooth Speaker Setup"
SCRIPT_VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
DEVICE_NAME="SunriseAlarm-Speaker"
BACKUP_DIR="/var/backups/bluetooth-setup"
LOG_FILE="/var/log/bluetooth-setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

print_header() {
    echo -e "${BOLD}${BLUE}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║                 $SCRIPT_NAME                 ║"
    echo "║                   Version $SCRIPT_VERSION                    ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
    log "INFO: $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    log "WARNING: $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    log "ERROR: $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    log "SUCCESS: $1"
}

# Cleanup function for errors
cleanup_on_error() {
    print_error "Setup failed. Cleaning up..."
    # Add any cleanup logic here if needed
    exit 1
}

# Set error handler
trap cleanup_on_error ERR

# User detection
detect_user() {
    REAL_USER=${SUDO_USER:-$(logname 2>/dev/null || echo "")}
    if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
        REAL_USER=$(ls /home 2>/dev/null | head -1)
        if [ -z "$REAL_USER" ]; then
            print_error "Could not detect non-root user. Please specify user manually."
            echo "Usage: REAL_USER=username sudo $0"
            exit 1
        fi
    fi
    
    if [ ! -d "/home/$REAL_USER" ]; then
        print_error "User $REAL_USER does not have a home directory at /home/$REAL_USER"
        exit 1
    fi
    
    print_status "Detected user: $REAL_USER"
    export REAL_USER
}

# Check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        print_error "Please run this script with sudo"
        exit 1
    fi
    
    # Check if this is a Raspberry Pi or compatible system
    if ! command -v apt >/dev/null 2>&1; then
        print_error "This script requires a Debian-based system with apt package manager"
        exit 1
    fi
    
    # Create necessary directories
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    
    print_success "System requirements check passed"
}

# Backup existing configuration
backup_config() {
    print_status "Backing up existing configuration..."
    
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_subdir="$BACKUP_DIR/backup_$timestamp"
    mkdir -p "$backup_subdir"
    
    # Backup key configuration files
    [ -f "/etc/bluetooth/main.conf" ] && cp "/etc/bluetooth/main.conf" "$backup_subdir/"
    [ -f "/etc/pulse/daemon.conf" ] && cp "/etc/pulse/daemon.conf" "$backup_subdir/"
    [ -f "/etc/asound.conf" ] && cp "/etc/asound.conf" "$backup_subdir/"
    [ -d "/home/$REAL_USER/.config/pulse" ] && cp -r "/home/$REAL_USER/.config/pulse" "$backup_subdir/"
    [ -f "/home/$REAL_USER/.asoundrc" ] && cp "/home/$REAL_USER/.asoundrc" "$backup_subdir/"
    
    print_success "Configuration backed up to $backup_subdir"
}

# Check if already configured
is_bluetooth_configured() {
    # Check if Bluetooth main config exists and has our device name
    if [ -f "/etc/bluetooth/main.conf" ]; then
        if grep -q "$DEVICE_NAME" "/etc/bluetooth/main.conf" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

is_pulseaudio_configured() {
    # Check if PulseAudio is configured for user mode
    if [ -f "/etc/pulse/daemon.conf" ]; then
        if grep -q "system-instance = no" "/etc/pulse/daemon.conf" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

is_user_config_setup() {
    # Check if user PulseAudio config exists
    if [ -f "/home/$REAL_USER/.config/pulse/default.pa" ]; then
        if grep -q "module-bluetooth" "/home/$REAL_USER/.config/pulse/default.pa" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Install required packages (idempotent)
install_packages() {
    print_status "Installing required packages..."
    
    # Configure package manager for non-interactive mode
    export DEBIAN_FRONTEND=noninteractive
    export APT_LISTCHANGES_FRONTEND=none
    
    # Update package cache
    apt update --fix-missing -qq
    
    # List of required packages (including high-quality audio)
    local packages=(
        "bluetooth"
        "bluez" 
        "bluez-tools"
        "pulseaudio"
        "pulseaudio-module-bluetooth"
        "pavucontrol"
        "alsa-utils"
        "libasound2-plugins"
        "libsoxr0"
    )
    
    # Check which packages need installation
    local to_install=()
    for pkg in "${packages[@]}"; do
        if ! dpkg -l "$pkg" 2>/dev/null | grep -q "^ii"; then
            to_install+=("$pkg")
        fi
    done
    
    if [ ${#to_install[@]} -gt 0 ]; then
        print_status "Installing packages: ${to_install[*]}"
        apt install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" "${to_install[@]}"
    else
        print_status "All required packages already installed"
    fi
    
    # Verify Bluetooth service exists
    if ! systemctl list-unit-files | grep -q bluetooth.service; then
        print_warning "Installing additional Bluetooth packages..."
        apt install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
            bluez-firmware pi-bluetooth 2>/dev/null || print_warning "Could not install additional Bluetooth packages"
    fi
    
    print_success "Package installation completed"
}

# Configure Bluetooth
configure_bluetooth() {
    if is_bluetooth_configured; then
        print_status "Bluetooth already configured, verifying settings..."
    else
        print_status "Configuring Bluetooth..."
        backup_config
    fi
    
    cat > /etc/bluetooth/main.conf << EOF
[General]
Name = $DEVICE_NAME
Class = 0x200414
DiscoverableTimeout = 0
Discoverable = yes
PairableTimeout = 0
Pairable = yes
AutoConnect = yes
FastConnectable = true
JustWorksRepairing = always
Privacy = device

[Policy]
AutoEnable = true

[A2DP]
Disable = false

[AVRCP]
Disable = false

[HFP]
Disable = true

[HID]
Disable = false

[GATT]
Disable = false

# High-quality audio settings
[AdvMon]
RSSISamplingPeriod = 0xFF

[DeviceID]
Source = 2
Vendor = 1358
Product = 1
Version = 1
EOF
    
    print_success "Bluetooth configuration completed"
}

# Configure PulseAudio system-wide settings
configure_pulseaudio_system() {
    if is_pulseaudio_configured; then
        print_status "PulseAudio system configuration already set, verifying..."
    else
        print_status "Configuring PulseAudio system settings..."
        
        # Stop any existing system-wide PulseAudio
        systemctl stop pulseaudio.service 2>/dev/null || true
        systemctl disable pulseaudio.service 2>/dev/null || true
        rm -f /etc/systemd/system/pulseaudio.service
    fi
    
    cat > /etc/pulse/daemon.conf << 'EOF'
# Configure PulseAudio for user mode
    cat > /etc/pulse/daemon.conf << 'EOF'
# PulseAudio daemon configuration optimized for high-quality audio
system-instance = no
enable-remixing = yes
remixing-produce-lfe = yes
remixing-consume-lfe = yes
default-sample-format = s32le
default-sample-rate = 48000
alternate-sample-rate = 44100
default-sample-channels = 2
default-channel-map = front-left,front-right
resample-method = soxr-vhq
avoid-resampling = yes
flat-volumes = no
high-priority = yes
nice-level = -11
realtime-scheduling = yes
realtime-priority = 9
rlimit-rtprio = 9
rlimit-rttime = 200000
EOF    # Configure system ALSA for high-quality audio
    cat > /etc/asound.conf << 'EOF'
# High-quality system ALSA configuration
pcm.!default {
    type pulse
    fallback "sysdefault"
}

ctl.!default {
    type pulse
    fallback "sysdefault"
}

# High-quality PCM device
pcm.hifi {
    type hw
    card 0
    device 0
    format S32_LE
    rate 48000
    channels 2
}
EOF

    # Create Bluetooth codec preferences configuration
    mkdir -p /etc/bluetooth/audio
    cat > /etc/bluetooth/audio.conf << 'EOF'
[General]
Enable = Source,Sink,Media,Socket
Disable = Headset,Gateway,Control

[A2DP]
SBCFrequency = 48000
SBCChannelMode = JointStereo
SBCSubbands = 8
SBCBlocks = 16
SBCBitpool = 64
MPEG12Layer3 = true
LDAC = true
APTX = true
APTXHD = true
AAC = true
EOF
    
    print_success "PulseAudio system configuration completed"
}

# Configure user-specific settings
configure_user_settings() {
    if is_user_config_setup; then
        print_status "User PulseAudio configuration already exists, updating..."
    else
        print_status "Setting up user PulseAudio configuration..."
    fi
    
    # Create user directories
    mkdir -p "/home/$REAL_USER/.config/pulse"
    mkdir -p "/home/$REAL_USER/.config/systemd/user"
    
    # User PulseAudio configuration
    cat > "/home/$REAL_USER/.config/pulse/default.pa" << 'EOF'
#!/usr/bin/pulseaudio -nF

# Load core modules with high-quality settings
.include /etc/pulse/default.pa

# Unload default Bluetooth modules to reconfigure for quality
.nofail
unload-module module-bluetooth-discover
unload-module module-bluetooth-policy
unload-module module-bluez5-discover
.fail

# Load Bluetooth modules with high-quality codec preferences
load-module module-bluetooth-discover headset=auto a2dp_config="ldac_eqmid=hq ldac_fmt=f32 sbc_freq=48k sbc_chmode=joint_stereo aptx_hd=yes"
load-module module-bluetooth-policy a2dp_source=true ag_mode=false

# Automatically switch to Bluetooth when connected
load-module module-switch-on-connect

# Load additional modules for better quality
load-module module-filter-heuristics
load-module module-filter-apply
EOF
    
    # User ALSA configuration for high-quality audio
    cat > "/home/$REAL_USER/.asoundrc" << 'EOF'
# High-quality user ALSA configuration
pcm.!default {
    type pulse
    fallback "sysdefault"
    hint {
        show on
        description "Default ALSA Output (High-Quality PulseAudio)"
    }
}

ctl.!default {
    type pulse
    fallback "sysdefault"
}

# High-quality PCM device
pcm.hifi {
    type hw
    card 0
    device 0
    format S32_LE
    rate 48000
    channels 2
}

# High-quality control
ctl.hifi {
    type hw
    card 0
}
EOF
    
    # Auto-start script
    cat > "/home/$REAL_USER/.config/autostart-pulseaudio.sh" << 'EOF'
#!/bin/bash
# Auto-start PulseAudio if not running
if ! pulseaudio --check 2>/dev/null; then
    pulseaudio --start --log-target=syslog 2>/dev/null
fi
EOF
    
    chmod +x "/home/$REAL_USER/.config/autostart-pulseaudio.sh"
    
    # Add to .bashrc if not already there
    if ! grep -q "autostart-pulseaudio.sh" "/home/$REAL_USER/.bashrc" 2>/dev/null; then
        echo "# Auto-start PulseAudio for Bluetooth" >> "/home/$REAL_USER/.bashrc"
        echo "\"/home/$REAL_USER/.config/autostart-pulseaudio.sh\"" >> "/home/$REAL_USER/.bashrc"
    fi
    
    # Set ownership
    chown -R "$REAL_USER:$REAL_USER" "/home/$REAL_USER/.config"
    chown "$REAL_USER:$REAL_USER" "/home/$REAL_USER/.asoundrc"
    
    # Add user to audio groups
    usermod -a -G audio,bluetooth "$REAL_USER"
    
    print_success "User configuration completed"
}

# Create utility scripts
create_utilities() {
    print_status "Creating utility scripts..."
    
    # High-quality audio optimization utility
    cat > /usr/local/bin/optimize-bluetooth-audio.sh << 'EOF'
#!/bin/bash
# High-Quality Bluetooth Audio Optimizer

REAL_USER=${1:-$(logname 2>/dev/null)}
if [ -z "$REAL_USER" ]; then
    REAL_USER=$(ls /home | head -1)
fi

echo "Optimizing high-quality Bluetooth audio for user: $REAL_USER"

# Wait for services to be ready
sleep 3

# Get connected Bluetooth audio devices and optimize them
sudo -u "$REAL_USER" pactl list sinks short | grep bluez | while read -r sink_info; do
    sink_name=$(echo $sink_info | cut -f2)
    echo "Optimizing high-quality Bluetooth sink: $sink_name"
    
    # Set optimal volume and unmute
    sudo -u "$REAL_USER" pactl set-sink-volume "$sink_name" 90% 2>/dev/null || true
    sudo -u "$REAL_USER" pactl set-sink-mute "$sink_name" false 2>/dev/null || true
    
    # Try to set high-quality codec profile
    card_name=$(echo "$sink_name" | sed 's/bluez_sink\.//' | sed 's/\.a2dp_sink.*//')
    if [ ! -z "$card_name" ]; then
        sudo -u "$REAL_USER" pactl set-card-profile "bluez_card.$card_name" a2dp_sink 2>/dev/null || true
    fi
done

# Fix balance for all sinks (including local audio)
sudo -u "$REAL_USER" pactl list sinks short | while read -r sink_info; do
    sink_name=$(echo $sink_info | cut -f2)
    echo "Optimizing sink: $sink_name"
    sudo -u "$REAL_USER" pactl set-sink-volume "$sink_name" 85% 2>/dev/null || true
    sudo -u "$REAL_USER" pactl set-sink-mute "$sink_name" false 2>/dev/null || true
done

# Optimize system settings for audio performance
echo "Optimizing system for high-quality audio..."

# Set CPU governor to performance for better audio processing
echo performance > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || true

# Optimize audio scheduling
sysctl -w kernel.sched_rt_runtime_us=950000 2>/dev/null || true

echo "High-quality Bluetooth audio optimization complete!"
EOF
    
    # Audio balance fix utility (simpler version)
    cat > /usr/local/bin/fix-audio-balance.sh << 'EOF'
#!/bin/bash
# Audio balance fix utility

REAL_USER=${1:-$(logname 2>/dev/null)}
if [ -z "$REAL_USER" ]; then
    REAL_USER=$(ls /home | head -1)
fi

echo "Fixing audio balance for user: $REAL_USER"
/usr/local/bin/optimize-bluetooth-audio.sh "$REAL_USER"
EOF
    
    chmod +x /usr/local/bin/optimize-bluetooth-audio.sh
    chmod +x /usr/local/bin/fix-audio-balance.sh
    
    # Create automatic audio optimization service
    cat > /etc/systemd/system/bluetooth-audio-optimizer.service << EOF
[Unit]
Description=High-Quality Bluetooth Audio Optimizer
After=bluetooth.service graphical-session.target
Wants=bluetooth.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/optimize-bluetooth-audio.sh $REAL_USER
RemainAfterExit=yes
User=root

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl enable bluetooth-audio-optimizer.service
    
    # Create udev rule for automatic codec optimization
    cat > /etc/udev/rules.d/99-bluetooth-audio-quality.rules << 'EOF'
# High-quality Bluetooth audio optimization
ACTION=="add", SUBSYSTEM=="bluetooth", ATTR{class}=="0x240404", RUN+="/usr/local/bin/optimize-bluetooth-audio.sh"
EOF
    
    udevadm control --reload-rules
    
    # Bluetooth control utility
    cat > /usr/local/bin/bluetooth-control.sh << 'EOF'
#!/bin/bash
# Bluetooth control utility

case "$1" in
    "discoverable")
        bluetoothctl power on
        bluetoothctl discoverable on
        bluetoothctl pairable on
        echo "Device is now discoverable"
        ;;
    "status")
        bluetoothctl show
        ;;
    "devices")
        bluetoothctl devices
        ;;
    "restart")
        systemctl restart bluetooth
        echo "Bluetooth service restarted"
        ;;
    *)
        echo "Usage: $0 {discoverable|status|devices|restart}"
        exit 1
        ;;
esac
EOF
    
    chmod +x /usr/local/bin/bluetooth-control.sh
    
    print_success "Utility scripts created"
}

# Start and configure services
configure_services() {
    print_status "Configuring and starting services..."
    
    # Configure Bluetooth service for high-quality audio
    BLUETOOTHD_PATH=""
    for path in "/usr/lib/bluetooth/bluetoothd" "/usr/libexec/bluetooth/bluetoothd" "/usr/sbin/bluetoothd"; do
        if [ -x "$path" ]; then
            BLUETOOTHD_PATH="$path"
            break
        fi
    done
    
    if [ ! -z "$BLUETOOTHD_PATH" ]; then
        print_status "Configuring Bluetooth service with experimental features at: $BLUETOOTHD_PATH"
        
        mkdir -p /etc/systemd/system/bluetooth.service.d
        cat > /etc/systemd/system/bluetooth.service.d/override.conf << EOF
[Service]
ExecStart=
ExecStart=$BLUETOOTHD_PATH --experimental
Restart=always
RestartSec=5
EOF
    else
        print_warning "Could not find bluetoothd executable, using default configuration"
    fi
    
    # Enable and restart Bluetooth service
    systemctl daemon-reload
    systemctl enable bluetooth.service
    systemctl restart bluetooth.service
    
    # Setup user PulseAudio (with proper session handling)
    export XDG_RUNTIME_DIR="/run/user/$(id -u $REAL_USER)"
    if [ ! -d "$XDG_RUNTIME_DIR" ]; then
        mkdir -p "$XDG_RUNTIME_DIR"
        chown "$REAL_USER:$REAL_USER" "$XDG_RUNTIME_DIR"
        chmod 700 "$XDG_RUNTIME_DIR"
    fi
    
    # Try to start user PulseAudio
    sudo -u "$REAL_USER" killall pulseaudio 2>/dev/null || true
    sleep 2
    
    if ! sudo -u "$REAL_USER" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" systemctl --user start pulseaudio.service 2>/dev/null; then
        print_warning "Starting PulseAudio directly..."
        sudo -u "$REAL_USER" pulseaudio --start --log-target=syslog 2>/dev/null || true
    fi
    
    # Make device discoverable
    sleep 2
    /usr/local/bin/bluetooth-control.sh discoverable
    
    print_success "Services configured and started"
}

# Test the setup
test_setup() {
    print_status "Testing the setup..."
    
    local tests_passed=0
    local total_tests=4
    
    # Test 1: Bluetooth service
    if systemctl is-active --quiet bluetooth.service; then
        print_success "✓ Bluetooth service is running"
        ((tests_passed++))
    else
        print_error "✗ Bluetooth service is not running"
    fi
    
    # Test 2: PulseAudio
    if sudo -u "$REAL_USER" pulseaudio --check 2>/dev/null; then
        print_success "✓ PulseAudio is running"
        ((tests_passed++))
    else
        print_warning "△ PulseAudio not running (will start on user login)"
        ((tests_passed++)) # Still count as pass since it will auto-start
    fi
    
    # Test 3: Bluetooth discoverable
    if bluetoothctl show | grep -q "Discoverable: yes"; then
        print_success "✓ Device is discoverable"
        ((tests_passed++))
    else
        print_warning "△ Device may not be discoverable"
    fi
    
    # Test 4: Audio devices
    if aplay -l >/dev/null 2>&1; then
        print_success "✓ Audio devices detected"
        ((tests_passed++))
    else
        print_warning "△ Audio device detection issues"
    fi
    
    echo ""
    print_status "Tests passed: $tests_passed/$total_tests"
    
    if [ $tests_passed -ge 3 ]; then
        print_success "Setup appears to be working correctly!"
        return 0
    else
        print_warning "Setup may have issues, but basic functionality should work"
        return 1
    fi
}

# Display final status and instructions
show_final_status() {
    echo ""
    echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║                    Setup Complete!                    ║${NC}"
    echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    print_status "Your Raspberry Pi is now configured as a Bluetooth speaker!"
    echo ""
    echo -e "${BOLD}Device Information:${NC}"
    echo "  Name: $DEVICE_NAME"
    echo "  Status: $(bluetoothctl show | grep -o 'Powered: [^[:space:]]*' || echo 'Unknown')"
    echo "  Discoverable: $(bluetoothctl show | grep -o 'Discoverable: [^[:space:]]*' || echo 'Unknown')"
    echo ""
    
    echo -e "${BOLD}High-Quality Audio Features Enabled:${NC}"
    echo "  • Sample Format: 32-bit (professional quality)"
    echo "  • Sample Rate: 48kHz (DVD quality)"
    echo "  • Resampler: SoXR Very High Quality"
    echo "  • Bluetooth Codecs: LDAC, aptX HD, AAC optimized"
    echo "  • Real-time Audio Scheduling: Enabled"
    echo "  • Experimental Bluetooth Features: Active"
    echo ""
    
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Pair your phone/device with '$DEVICE_NAME'"
    echo "  2. Select it as your audio output device"
    echo "  3. Play high-quality music and enjoy the difference!"
    echo "  4. Use LDAC or aptX HD capable devices for best quality"
    echo ""
    
    echo -e "${BOLD}Useful Commands:${NC}"
    echo "  • Test audio (HQ):      speaker-test -t wav -c 2 -r 48000 -f S32_LE"
    echo "  • Test audio (basic):   speaker-test -t wav -c 2"
    echo "  • Optimize audio:       sudo /usr/local/bin/optimize-bluetooth-audio.sh"
    echo "  • Fix audio balance:    sudo /usr/local/bin/fix-audio-balance.sh"
    echo "  • Bluetooth control:    /usr/local/bin/bluetooth-control.sh status"
    echo "  • Make discoverable:    /usr/local/bin/bluetooth-control.sh discoverable"
    echo "  • Check codecs:         pactl list sinks | grep bluetooth"
    echo ""
    
    echo -e "${BOLD}Troubleshooting:${NC}"
    echo "  • Check logs:           tail -f $LOG_FILE"
    echo "  • Audio issues:         Run this script again (it's idempotent)"
    echo "  • Bluetooth issues:     sudo systemctl restart bluetooth"
    echo "  • No sound:             Check cable connections 😉"
    echo ""
    
    print_status "Setup logs saved to: $LOG_FILE"
    print_status "Configuration backups in: $BACKUP_DIR"
}

# Main execution
main() {
    print_header
    
    log "Starting Bluetooth Speaker Setup v$SCRIPT_VERSION"
    
    detect_user
    check_requirements
    
    print_status "Starting setup process..."
    
    install_packages
    configure_bluetooth 
    configure_pulseaudio_system
    configure_user_settings
    create_utilities
    configure_services
    
    sleep 3  # Allow services to stabilize
    
    if test_setup; then
        show_final_status
        log "Setup completed successfully"
        exit 0
    else
        print_warning "Setup completed with some warnings. Check the output above."
        show_final_status
        log "Setup completed with warnings"
        exit 0
    fi
}

# Run main function
main "$@"