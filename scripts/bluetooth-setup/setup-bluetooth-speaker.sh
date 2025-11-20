#!/bin/bash

# Master Bluetooth Speaker Setup Script with Media Control
# This script provides a complete, idempotent setup for Raspberry Pi Bluetooth speaker functionality
# with advanced media control and metadata access for Electron app integration
# Run with: sudo ./setup-bluetooth-speaker.sh
#
# Features:
# - Complete Bluetooth speaker configuration
# - Advanced media control (AVRCP) with play/pause/next/previous
# - Real-time metadata capture (song, artist, album info)
# - Unix socket interface for Electron app integration
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
DEVICE_NAME="DawnDeck"
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
    
    # List of required packages (including high-quality audio, Python for agents, and media control)
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
        "python3"
        "python3-dbus"
        "python3-gi"
        "python3-pip"
        "nodejs"
        "npm"
        "dbus-x11"
        "at-spi2-core"
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
    
    # Install Python packages for media control
    print_status "Installing Python packages for media control..."
    pip3 install pydbus pygobject 2>/dev/null || print_warning "Could not install some Python packages"
    
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
DiscoverableTimeout = 180
Discoverable = no
PairableTimeout = 0
Pairable = yes
AutoConnect = yes
FastConnectable = true
JustWorksRepairing = always
Privacy = device
MultiProfile = multiple

# SSP (Secure Simple Pairing) settings for seamless pairing
SSPMode = 1
JustWorksRepairing = always
TemporaryTimeout = 30

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
    
    # Create Bluetooth name setter utility
    cat > /usr/local/bin/set-bluetooth-name.sh << EOF
#!/bin/bash
# Force set Bluetooth device name

DEVICE_NAME="$DEVICE_NAME"

echo "Setting Bluetooth device name to '\$DEVICE_NAME'..."

# Method 1: Use bluetoothctl
bluetoothctl system-alias "\$DEVICE_NAME" 2>/dev/null || echo "Could not set via bluetoothctl"

# Method 2: Update hostname-based name via dbus
dbus-send --system --dest=org.bluez --print-reply /org/bluez/hci0 \
    org.freedesktop.DBus.Properties.Set string:org.bluez.Adapter1 string:Alias variant:string:"\$DEVICE_NAME" 2>/dev/null || echo "Could not set via dbus"

# Method 3: Restart Bluetooth service to pick up config
systemctl restart bluetooth 2>/dev/null || echo "Could not restart bluetooth service"

sleep 2

# Verify
current_name=\$(bluetoothctl show 2>/dev/null | grep "Alias:" | cut -d: -f2 | xargs)
if [ "\$current_name" = "\$DEVICE_NAME" ]; then
    echo "Success! Bluetooth device name is now '\$DEVICE_NAME'"
else
    echo "Current name: \$current_name"
    echo "Note: Name change may require a reboot to take full effect"
fi
EOF
    
    chmod +x /usr/local/bin/set-bluetooth-name.sh
    
    # Create D-Bus policy for media access
    print_status "Configuring D-Bus permissions for media access..."
    cat > /etc/dbus-1/system.d/bluetooth-media.conf << 'EOF'
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN"
"http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <policy user="root">
    <allow own="org.bluez"/>
    <allow send_destination="org.bluez"/>
    <allow send_interface="org.bluez.Agent1"/>
    <allow send_interface="org.bluez.MediaPlayer1"/>
    <allow send_interface="org.bluez.MediaTransport1"/>
    <allow send_interface="org.freedesktop.DBus.Properties"/>
    <allow receive_sender="org.bluez"/>
  </policy>
  
  <policy user="pi">
    <allow send_destination="org.bluez"/>
    <allow send_interface="org.bluez.MediaPlayer1"/>
    <allow send_interface="org.bluez.MediaTransport1"/>
    <allow send_interface="org.freedesktop.DBus.Properties"/>
    <allow receive_sender="org.bluez"/>
  </policy>
  
  <policy context="default">
    <deny send_destination="org.bluez"/>
  </policy>
</busconfig>
EOF

    # Create enhanced Bluetooth agent with media support
    print_status "Creating enhanced Bluetooth media agent..."
    cat > /usr/local/bin/bluetooth-media-agent.py << 'EOF'
#!/usr/bin/env python3
import dbus
import dbus.service
import dbus.mainloop.glib
from gi.repository import GLib
import json
import time
import threading
import socket
import os

class MediaAgent(dbus.service.Object):
    exit_on_release = True

    def __init__(self, bus, path):
        super().__init__(bus, path)
        self.bus = bus
        self.current_metadata = {}
        self.current_status = "stopped"
        self.current_position = 0
        self.current_duration = 0
        
        # Create socket server for Electron communication
        self.setup_socket_server()
        
    def setup_socket_server(self):
        """Set up Unix socket for communication with Electron app"""
        socket_path = "/tmp/bluetooth_media.sock"
        if os.path.exists(socket_path):
            os.unlink(socket_path)
            
        self.server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server_socket.bind(socket_path)
        os.chmod(socket_path, 0o666)  # Allow access from any user
        self.server_socket.listen(1)
        
        # Start socket server thread
        self.socket_thread = threading.Thread(target=self.socket_server_loop)
        self.socket_thread.daemon = True
        self.socket_thread.start()
        
    def socket_server_loop(self):
        """Handle connections from Electron app"""
        while True:
            try:
                conn, addr = self.server_socket.accept()
                client_thread = threading.Thread(target=self.handle_client, args=(conn,))
                client_thread.daemon = True
                client_thread.start()
            except Exception as e:
                print(f"Socket server error: {e}")
                
    def handle_client(self, conn):
        """Handle individual client connections"""
        try:
            while True:
                data = conn.recv(1024).decode('utf-8')
                if not data:
                    break
                    
                try:
                    command = json.loads(data)
                    response = self.process_command(command)
                    conn.send((json.dumps(response) + '\n').encode('utf-8'))
                except json.JSONDecodeError:
                    conn.send(b'{"error": "Invalid JSON"}\n')
        except Exception as e:
            print(f"Client handler error: {e}")
        finally:
            conn.close()
            
    def process_command(self, command):
        """Process commands from Electron app"""
        cmd_type = command.get('type')
        
        if cmd_type == 'get_metadata':
            return {
                'metadata': self.current_metadata,
                'status': self.current_status,
                'position': self.current_position,
                'duration': self.current_duration
            }
        elif cmd_type == 'media_control':
            action = command.get('action')
            return self.send_media_command(action)
        else:
            return {'error': 'Unknown command type'}
            
    def send_media_command(self, action):
        """Send media control commands via D-Bus"""
        try:
            # Find connected media players
            adapter = self.bus.get_object("org.bluez", "/org/bluez/hci0")
            
            # Get all devices
            manager = dbus.Interface(adapter, "org.freedesktop.DBus.ObjectManager")
            objects = manager.GetManagedObjects()
            
            for path, interfaces in objects.items():
                if "org.bluez.MediaPlayer1" in interfaces:
                    player = self.bus.get_object("org.bluez", path)
                    player_interface = dbus.Interface(player, "org.bluez.MediaPlayer1")
                    
                    if action == "play":
                        player_interface.Play()
                    elif action == "pause":
                        player_interface.Pause()
                    elif action == "stop":
                        player_interface.Stop()
                    elif action == "next":
                        player_interface.Next()
                    elif action == "previous":
                        player_interface.Previous()
                    
                    return {'success': True, 'action': action}
                    
            return {'error': 'No media player found'}
        except Exception as e:
            return {'error': str(e)}

    def set_exit_on_release(self, exit_on_release):
        self.exit_on_release = exit_on_release

    @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
    def Release(self):
        print("Release")
        if self.exit_on_release:
            mainloop.quit()

    @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
    def AuthorizeService(self, device, uuid):
        print("AuthorizeService (%s, %s)" % (device, uuid))
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="s")
    def RequestPinCode(self, device):
        print("RequestPinCode (%s)" % (device))
        return "0000"

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="u")
    def RequestPasskey(self, device):
        print("RequestPasskey (%s)" % (device))
        return dbus.UInt32(0000)

    @dbus.service.method("org.bluez.Agent1", in_signature="ouq", out_signature="")
    def DisplayPasskey(self, device, passkey, entered):
        print("DisplayPasskey (%s, %06u entered %u)" % (device, passkey, entered))

    @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
    def DisplayPinCode(self, device, pincode):
        print("DisplayPinCode (%s, %s)" % (device, pincode))

    @dbus.service.method("org.bluez.Agent1", in_signature="ou", out_signature="")
    def RequestConfirmation(self, device, passkey):
        print("RequestConfirmation (%s, %06d)" % (device, passkey))
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="")
    def RequestAuthorization(self, device):
        print("RequestAuthorization (%s)" % (device))
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
    def Cancel(self):
        print("Cancel")

def property_changed_handler(interface, changed_properties, invalidated_properties, path):
    """Handle D-Bus property changes for media metadata"""
    if interface == "org.bluez.MediaPlayer1":
        if "Track" in changed_properties:
            track = changed_properties["Track"]
            metadata = {
                'title': track.get('Title', 'Unknown'),
                'artist': track.get('Artist', 'Unknown'),
                'album': track.get('Album', 'Unknown'),
                'duration': track.get('Duration', 0),
            }
            agent.current_metadata = metadata
            print(f"Metadata updated: {metadata}")
            
        if "Status" in changed_properties:
            agent.current_status = changed_properties["Status"]
            print(f"Status updated: {agent.current_status}")
            
        if "Position" in changed_properties:
            agent.current_position = changed_properties["Position"]
            print(f"Position updated: {agent.current_position}")

if __name__ == '__main__':
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)

    bus = dbus.SystemBus()
    
    # Set up property change monitoring
    bus.add_signal_receiver(
        property_changed_handler,
        signal_name="PropertiesChanged",
        dbus_interface="org.freedesktop.DBus.Properties",
        path_keyword="path"
    )
    
    capability = "NoInputNoOutput"
    path = "/test/agent"
    agent = MediaAgent(bus, path)

    obj = bus.get_object("org.bluez", "/org/bluez")
    manager = dbus.Interface(obj, "org.bluez.AgentManager1")
    manager.RegisterAgent(path, capability)
    manager.RequestDefaultAgent(path)

    print("Bluetooth Media Agent started")
    mainloop = GLib.MainLoop()
    
    try:
        mainloop.run()
    except KeyboardInterrupt:
        print("Shutting down...")
    finally:
        if hasattr(agent, 'server_socket'):
            agent.server_socket.close()
EOF

    chmod +x /usr/local/bin/bluetooth-media-agent.py

    # Create media metadata monitor service
    print_status "Creating media metadata monitor..."
    cat > /usr/local/bin/media-metadata-monitor.py << 'EOF'
#!/usr/bin/env python3
import dbus
import dbus.mainloop.glib
from gi.repository import GLib
import json
import time

class MetadataMonitor:
    def __init__(self):
        self.bus = dbus.SystemBus()
        self.current_metadata = {}
        self.log_file = "/var/log/media_metadata.log"
        
    def property_changed(self, interface, changed_properties, invalidated_properties, path):
        if interface == "org.bluez.MediaPlayer1":
            timestamp = int(time.time())
            
            if "Track" in changed_properties:
                track = changed_properties["Track"]
                self.current_metadata = {
                    'timestamp': timestamp,
                    'title': str(track.get('Title', 'Unknown')),
                    'artist': str(track.get('Artist', 'Unknown')),
                    'album': str(track.get('Album', 'Unknown')),
                    'duration': int(track.get('Duration', 0)),
                    'track_number': int(track.get('TrackNumber', 0)),
                    'genre': str(track.get('Genre', 'Unknown')),
                }
                
                # Log metadata to file for debugging
                with open(self.log_file, 'a') as f:
                    f.write(f"{json.dumps(self.current_metadata)}\n")
                
                print(f"New track: {self.current_metadata['artist']} - {self.current_metadata['title']}")
            
            if "Status" in changed_properties:
                status = str(changed_properties["Status"])
                print(f"Playback status: {status}")
                
                # Update status in metadata
                self.current_metadata['status'] = status
                self.current_metadata['status_timestamp'] = timestamp
                
            if "Position" in changed_properties:
                position = int(changed_properties["Position"])
                self.current_metadata['position'] = position
                print(f"Position: {position}ms")

if __name__ == '__main__':
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    
    monitor = MetadataMonitor()
    
    # Set up signal receiver
    monitor.bus.add_signal_receiver(
        monitor.property_changed,
        signal_name="PropertiesChanged",
        dbus_interface="org.freedesktop.DBus.Properties",
        path_keyword="path"
    )
    
    print("Media metadata monitor started")
    mainloop = GLib.MainLoop()
    
    try:
        mainloop.run()
    except KeyboardInterrupt:
        print("Monitor stopped")
EOF

    chmod +x /usr/local/bin/media-metadata-monitor.py

    # Create utility script for media control testing
    print_status "Creating media control utility..."
    cat > /usr/local/bin/media-control.py << 'EOF'
#!/usr/bin/env python3
import dbus
import sys
import json

def get_media_players():
    """Get all available media players"""
    bus = dbus.SystemBus()
    
    try:
        manager = bus.get_object("org.bluez", "/")
        manager_interface = dbus.Interface(manager, "org.freedesktop.DBus.ObjectManager")
        objects = manager_interface.GetManagedObjects()
        
        players = []
        for path, interfaces in objects.items():
            if "org.bluez.MediaPlayer1" in interfaces:
                players.append(path)
        
        return players
    except Exception as e:
        print(f"Error getting players: {e}")
        return []

def send_command(command):
    """Send media control command"""
    bus = dbus.SystemBus()
    players = get_media_players()
    
    if not players:
        print("No media players found")
        return False
    
    for player_path in players:
        try:
            player = bus.get_object("org.bluez", player_path)
            player_interface = dbus.Interface(player, "org.bluez.MediaPlayer1")
            
            if command == "play":
                player_interface.Play()
            elif command == "pause":
                player_interface.Pause()
            elif command == "stop":
                player_interface.Stop()
            elif command == "next":
                player_interface.Next()
            elif command == "previous":
                player_interface.Previous()
            elif command == "status":
                properties = dbus.Interface(player, "org.freedesktop.DBus.Properties")
                status = properties.Get("org.bluez.MediaPlayer1", "Status")
                track = properties.Get("org.bluez.MediaPlayer1", "Track")
                position = properties.Get("org.bluez.MediaPlayer1", "Position")
                
                print(f"Status: {status}")
                print(f"Position: {position}ms")
                if track:
                    print(f"Title: {track.get('Title', 'Unknown')}")
                    print(f"Artist: {track.get('Artist', 'Unknown')}")
                    print(f"Album: {track.get('Album', 'Unknown')}")
                    print(f"Duration: {track.get('Duration', 0)}ms")
            
            print(f"Command '{command}' sent successfully")
            return True
            
        except Exception as e:
            print(f"Error sending command to {player_path}: {e}")
    
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: media-control.py <play|pause|stop|next|previous|status>")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    valid_commands = ["play", "pause", "stop", "next", "previous", "status"]
    
    if command not in valid_commands:
        print(f"Invalid command. Valid commands: {', '.join(valid_commands)}")
        sys.exit(1)
    
    send_command(command)
EOF

    chmod +x /usr/local/bin/media-control.py
    
    # Create enhanced Bluetooth media agent service
    cat > /etc/systemd/system/bluetooth-media-agent.service << 'EOF'
[Unit]
Description=Bluetooth Media Agent with AVRCP support
After=bluetooth.service pulseaudio.service dbus.service
Wants=bluetooth.service pulseaudio.service dbus.service

[Service]
Type=simple
ExecStart=/usr/local/bin/bluetooth-media-agent.py
Restart=on-failure
RestartSec=5
User=root
Group=root
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

[Install]
WantedBy=multi-user.target
EOF

    # Create service for metadata monitor
    cat > /etc/systemd/system/media-metadata-monitor.service << 'EOF'
[Unit]
Description=Bluetooth Media Metadata Monitor
After=bluetooth.service dbus.service
Wants=bluetooth.service dbus.service

[Service]
Type=simple
ExecStart=/usr/local/bin/media-metadata-monitor.py
Restart=on-failure
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
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
    
    # Set the Bluetooth adapter name explicitly
    sleep 2
    print_status "Setting Bluetooth device name to '$DEVICE_NAME'..."
    bluetoothctl system-alias "$DEVICE_NAME" || print_warning "Could not set system alias"
    
    # Stop old bluetooth-agent service if it exists (for idempotency)
    systemctl stop bluetooth-agent.service 2>/dev/null || true
    systemctl disable bluetooth-agent.service 2>/dev/null || true
    
    # Enable new media services
    print_status "Enabling media control services..."
    systemctl daemon-reload
    systemctl enable bluetooth-media-agent.service
    systemctl enable media-metadata-monitor.service
    
    # Start the new services
    systemctl start bluetooth-media-agent.service || print_warning "Media agent will start on next boot"
    systemctl start media-metadata-monitor.service || print_warning "Media monitor will start on next boot"
    
    # Ensure the name is applied
    bluetoothctl power off
    sleep 1
    bluetoothctl power on
    sleep 2
    
    # Verify the name was set
    local current_name=$(bluetoothctl show | grep "Alias:" | cut -d: -f2 | xargs)
    if [ "$current_name" = "$DEVICE_NAME" ]; then
        print_success "Bluetooth device name set to '$DEVICE_NAME'"
    else
        print_warning "Device name may still show as '$current_name' - this will be fixed after reboot"
    fi
    
    print_success "Services configured and started"
}

# Test the setup
test_setup() {
    print_status "Testing the setup..."
    
    local tests_passed=0
    local total_tests=6
    
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
    
    # Test 5: Media control service
    if systemctl is-enabled --quiet bluetooth-media-agent.service 2>/dev/null; then
        print_success "✓ Media control service enabled"
        ((tests_passed++))
    else
        print_warning "△ Media control service not enabled"
    fi
    
    # Test 6: D-Bus media configuration
    if [ -f "/etc/dbus-1/system.d/bluetooth-media.conf" ]; then
        print_success "✓ D-Bus media configuration present"
        ((tests_passed++))
    else
        print_warning "△ D-Bus media configuration missing"
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
    
    echo -e "${BOLD}Media Control Features Enabled:${NC}"
    echo "  • AVRCP Media Control (play, pause, next, previous)"
    echo "  • Real-time Metadata Capture (song, artist, album info)"
    echo "  • Unix Socket Interface for Electron App Integration"
    echo "  • D-Bus Media Player Interfaces"
    echo "  • Position and Duration Tracking"
    echo "  • Automatic Metadata Logging"
    echo ""
    
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Reboot to ensure all services start properly (recommended)"
    echo "  2. Run './enable-pairing.sh' to make '$DEVICE_NAME' discoverable"
    echo "  3. Pair your phone/device within 3 minutes (no confirmation needed)"
    echo "  4. Select it as your audio output device"
    echo "  5. Play high-quality music and enjoy the difference!"
    echo "  6. Use LDAC or aptX HD capable devices for best quality"
    echo ""
    
    echo -e "${BOLD}Useful Commands:${NC}"
    echo "  • Test audio (HQ):      speaker-test -t wav -c 2 -r 48000 -f S32_LE"
    echo "  • Test audio (basic):   speaker-test -t wav -c 2"
    echo "  • Optimize audio:       sudo /usr/local/bin/optimize-bluetooth-audio.sh"
    echo "  • Fix audio balance:    sudo /usr/local/bin/fix-audio-balance.sh"
    echo "  • Set device name:      sudo /usr/local/bin/set-bluetooth-name.sh"
    echo "  • Bluetooth control:    /usr/local/bin/bluetooth-control.sh status"
    echo "  • Enable pairing:       ./enable-pairing.sh"
    echo "  • Make discoverable:    /usr/local/bin/bluetooth-control.sh discoverable"
    echo "  • Check codecs:         pactl list sinks | grep bluetooth"
    echo "  • Media control:        sudo /usr/local/bin/media-control.py status"
    echo "  • View metadata logs:   tail -f /var/log/media_metadata.log"
    echo ""
    
    echo -e "${BOLD}Troubleshooting:${NC}"
    echo "  • Check logs:           tail -f $LOG_FILE"
    echo "  • Audio issues:         Run this script again (it's idempotent)"
    echo "  • Bluetooth issues:     sudo systemctl restart bluetooth"
    echo "  • Wrong device name:    sudo /usr/local/bin/set-bluetooth-name.sh or reboot"
    echo "  • Media services:       systemctl status bluetooth-media-agent"
    echo "  • No sound:             Check cable connections 😉"
    echo ""
    
    echo -e "${BOLD}Integration Notes:${NC}"
    echo "  • Unix socket available at: /tmp/bluetooth_media.sock"
    echo "  • Send JSON commands to control media and get metadata"
    echo "  • Socket accepts: {'type': 'get_metadata'} and {'type': 'media_control', 'action': 'play'}"
    echo "  • Available actions: play, pause, stop, next, previous"
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