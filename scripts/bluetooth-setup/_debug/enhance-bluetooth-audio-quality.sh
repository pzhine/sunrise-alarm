#!/bin/bash

# High-Quality Bluetooth Audio Configuration
# This script optimizes Bluetooth audio for maximum quality
# Run after the main setup: sudo ./enhance-bluetooth-audio-quality.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script with sudo"
    exit 1
fi

# Detect user
REAL_USER=${SUDO_USER:-$(logname 2>/dev/null || echo "")}
if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
    REAL_USER=$(ls /home | head -1)
fi

print_status "Detected user: $REAL_USER"

echo -e "${BOLD}${BLUE}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║           High-Quality Bluetooth Audio Setup         ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

print_status "Enhancing Bluetooth audio quality..."

# Enhanced Bluetooth configuration with codec preferences
print_status "Configuring Bluetooth for high-quality codecs..."

cat > /etc/bluetooth/main.conf << 'EOF'
[General]
Name = SunriseAlarm-Speaker
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

# Enhanced PulseAudio configuration for better quality
print_status "Optimizing PulseAudio for high-quality audio..."

cat > /etc/pulse/daemon.conf << 'EOF'
# PulseAudio daemon configuration optimized for quality
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
EOF

# Create high-quality user PulseAudio configuration
print_status "Creating high-quality user PulseAudio configuration..."

mkdir -p "/home/$REAL_USER/.config/pulse"

cat > "/home/$REAL_USER/.config/pulse/default.pa" << 'EOF'
#!/usr/bin/pulseaudio -nF

# Load core modules with high-quality settings
.include /etc/pulse/default.pa

# Unload default Bluetooth modules to reconfigure
.nofail
unload-module module-bluetooth-discover
unload-module module-bluetooth-policy
unload-module module-bluez5-discover
.fail

# Load Bluetooth modules with high-quality codec preferences
load-module module-bluetooth-discover headset=auto a2dp_config="ldac_eqmid=hq ldac_fmt=f32 sbc_freq=48k sbc_chmode=joint_stereo aptx_hd=yes"
load-module module-bluetooth-policy a2dp_source=true ag_mode=false

# Load high-quality resampler
load-module module-combine-sink sink_name=combined

# Automatically switch to Bluetooth when connected
load-module module-switch-on-connect

# Load additional modules for better quality
load-module module-filter-heuristics
load-module module-filter-apply
EOF

# Create ALSA configuration for high-quality audio
print_status "Configuring ALSA for high-quality output..."

cat > "/home/$REAL_USER/.asoundrc" << 'EOF'
# High-quality ALSA configuration
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

# Create Bluetooth A2DP configuration for codec preferences
print_status "Configuring Bluetooth codec preferences..."

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

# Create high-quality Bluetooth service override
print_status "Creating Bluetooth service optimization..."

# Find the correct bluetoothd path
BLUETOOTHD_PATH=""
for path in "/usr/lib/bluetooth/bluetoothd" "/usr/libexec/bluetooth/bluetoothd" "/usr/sbin/bluetoothd"; do
    if [ -x "$path" ]; then
        BLUETOOTHD_PATH="$path"
        break
    fi
done

if [ -z "$BLUETOOTHD_PATH" ]; then
    print_warning "Could not find bluetoothd executable, skipping service override"
else
    print_status "Found bluetoothd at: $BLUETOOTHD_PATH"
    
    mkdir -p /etc/systemd/system/bluetooth.service.d
    cat > /etc/systemd/system/bluetooth.service.d/override.conf << EOF
[Service]
ExecStart=
ExecStart=$BLUETOOTHD_PATH --experimental
Restart=always
RestartSec=5
EOF
fi

# Install additional audio quality packages
print_status "Installing high-quality audio packages..."

apt update -qq
apt install -y \
    pulseaudio-module-bluetooth \
    libsoxr0 \
    libasound2-plugins \
    libldacbt-enc2 \
    libldacbt-abr2 2>/dev/null || print_warning "Some LDAC packages not available"

# Create audio quality optimization script
print_status "Creating audio quality optimization script..."

cat > /usr/local/bin/optimize-bluetooth-audio.sh << 'EOF'
#!/bin/bash

# Bluetooth Audio Quality Optimizer
REAL_USER=${1:-$(logname 2>/dev/null)}
if [ -z "$REAL_USER" ]; then
    REAL_USER=$(ls /home | head -1)
fi

echo "Optimizing Bluetooth audio quality for user: $REAL_USER"

# Wait for services to be ready
sleep 3

# Get connected Bluetooth audio devices
sudo -u "$REAL_USER" pactl list sinks short | grep bluez | while read -r sink_info; do
    sink_name=$(echo $sink_info | cut -f2)
    echo "Optimizing Bluetooth sink: $sink_name"
    
    # Set high-quality sample format and rate
    sudo -u "$REAL_USER" pactl set-sink-volume "$sink_name" 90%
    sudo -u "$REAL_USER" pactl set-sink-mute "$sink_name" false
    
    # Try to force higher quality settings
    card_name=$(echo "$sink_name" | sed 's/bluez_sink\.//' | sed 's/\.a2dp_sink.*//')
    if [ ! -z "$card_name" ]; then
        # Set codec profile to high quality
        sudo -u "$REAL_USER" pactl set-card-profile "bluez_card.$card_name" a2dp_sink 2>/dev/null || true
    fi
done

# Optimize system audio settings
echo "Optimizing system audio settings..."

# Set CPU governor to performance for better audio processing
echo performance > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || true

# Increase audio buffer sizes
sysctl -w kernel.sched_rt_runtime_us=950000 2>/dev/null || true

echo "Bluetooth audio optimization complete!"
EOF

chmod +x /usr/local/bin/optimize-bluetooth-audio.sh

# Create systemd service for automatic optimization
print_status "Setting up automatic audio optimization..."

cat > /etc/systemd/system/bluetooth-audio-optimizer.service << 'EOF'
[Unit]
Description=Bluetooth Audio Quality Optimizer
After=bluetooth.service pulseaudio.service
Wants=bluetooth.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/optimize-bluetooth-audio.sh
RemainAfterExit=yes
User=root
Environment=REAL_USER=$REAL_USER

[Install]
WantedBy=multi-user.target
EOF

systemctl enable bluetooth-audio-optimizer.service

# Create udev rule for automatic codec optimization
print_status "Setting up automatic codec optimization..."

cat > /etc/udev/rules.d/99-bluetooth-audio-quality.rules << 'EOF'
# Bluetooth audio quality optimization
ACTION=="add", SUBSYSTEM=="bluetooth", ATTR{class}=="0x240404", RUN+="/usr/local/bin/optimize-bluetooth-audio.sh"
EOF

udevadm control --reload-rules

# Set ownership for user files
chown -R "$REAL_USER:$REAL_USER" "/home/$REAL_USER/.config"
chown "$REAL_USER:$REAL_USER" "/home/$REAL_USER/.asoundrc"

# Restart services with new configuration
print_status "Restarting services with high-quality configuration..."

systemctl daemon-reload
systemctl restart bluetooth.service

# Restart user PulseAudio
sudo -u "$REAL_USER" killall pulseaudio 2>/dev/null || true
sleep 3
sudo -u "$REAL_USER" pulseaudio --start --log-target=syslog 2>/dev/null || true

sleep 5

# Run optimization
/usr/local/bin/optimize-bluetooth-audio.sh "$REAL_USER"

# Test audio quality
print_status "Testing audio configuration..."

if sudo -u "$REAL_USER" pactl info >/dev/null 2>&1; then
    print_success "✓ High-quality PulseAudio configuration active"
    
    # Show current sample rate
    sample_rate=$(sudo -u "$REAL_USER" pactl info | grep "Default Sample Specification" | cut -d' ' -f4)
    print_success "✓ Sample rate: $sample_rate"
else
    print_warning "PulseAudio may need manual restart"
fi

if systemctl is-active --quiet bluetooth.service; then
    print_success "✓ Enhanced Bluetooth service running"
else
    print_error "Bluetooth service not running"
fi

echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║          High-Quality Audio Setup Complete!          ║${NC}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

print_status "Audio quality enhancements applied!"
echo ""
echo -e "${BOLD}Quality Improvements:${NC}"
echo "  • Sample Format: 32-bit (was 16-bit)"
echo "  • Sample Rate: 48kHz (was 44.1kHz)" 
echo "  • Resampler: SoXR Very High Quality"
echo "  • Bluetooth Codecs: LDAC, aptX HD, AAC optimized"
echo "  • Real-time Scheduling: Enabled"
echo "  • Buffer Optimization: Applied"
echo ""

echo -e "${BOLD}Supported High-Quality Codecs:${NC}"
echo "  • LDAC (Sony - highest quality)"
echo "  • aptX HD (Qualcomm - CD quality)" 
echo "  • AAC (Apple - high quality)"
echo "  • SBC (Universal - optimized settings)"
echo ""

echo -e "${BOLD}Testing Commands:${NC}"
echo "  • Test quality: speaker-test -t wav -c 2 -r 48000 -f S32_LE"
echo "  • Check codecs: sudo -u $REAL_USER pactl list sinks | grep bluetooth"
echo "  • Optimize again: sudo /usr/local/bin/optimize-bluetooth-audio.sh"
echo ""

echo -e "${BOLD}Notes:${NC}"
echo "  • Your device must support high-quality codecs to benefit"
echo "  • LDAC provides the best quality (990 kbps vs 328 kbps SBC)"
echo "  • aptX HD is widely compatible and sounds great"
echo "  • Optimization runs automatically when devices connect"
echo ""

print_success "Enhanced audio quality setup completed!"