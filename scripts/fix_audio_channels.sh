#!/bin/bash

# Fix Audio Channel Issues (Left Speaker Only)
# Run with: sudo ./fix_audio_channels.sh

echo "=== Fixing Audio Channel Issues ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script with sudo"
    exit 1
fi

# Detect the actual user
REAL_USER=${SUDO_USER:-$(logname 2>/dev/null || echo "")}
if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
    REAL_USER=$(ls /home | head -1)
fi

print_status "Detected user: $REAL_USER"

# Diagnose current audio setup
print_status "Diagnosing current audio setup..."

echo "=== Audio Device Information ==="
aplay -l 2>/dev/null || echo "Could not list audio devices"

echo ""
echo "=== Current PulseAudio Sinks ==="
sudo -u $REAL_USER pactl list sinks short 2>/dev/null || echo "PulseAudio not responding"

echo ""
echo "=== Current Audio Balance ==="
sudo -u $REAL_USER pactl list sinks | grep -A 15 "analog-stereo" | grep -E "(Volume|Balance|Mute)" 2>/dev/null || echo "Could not get balance info"

# Fix 1: Update ALSA configuration for proper stereo
print_status "Fixing ALSA configuration for proper stereo output..."

# Update the user's .asoundrc for better stereo handling
cat > /home/$REAL_USER/.asoundrc << 'EOF'
# ALSA configuration for proper stereo output
pcm.!default {
    type pulse
    fallback "sysdefault"
    hint {
        show on
        description "Default ALSA Output (currently PulseAudio Sound Server)"
    }
}

ctl.!default {
    type pulse
    fallback "sysdefault"
}

# Force stereo output
pcm.stereo {
    type route
    slave {
        pcm "hw:0,0"
        channels 2
    }
    ttable.0.0 1.0
    ttable.1.1 1.0
}
EOF

chown $REAL_USER:$REAL_USER /home/$REAL_USER/.asoundrc

# Fix 2: Update PulseAudio configuration for proper channel mapping
print_status "Updating PulseAudio configuration for stereo output..."

cat > /home/$REAL_USER/.config/pulse/default.pa << 'EOF'
#!/usr/bin/pulseaudio -nF

# Load core modules
.include /etc/pulse/default.pa

# Unload and reload ALSA modules with explicit channel mapping
unload-module module-alsa-sink
unload-module module-alsa-source

# Load ALSA sink with explicit stereo mapping
load-module module-alsa-sink device=hw:0,0 sink_name=alsa_output.stereo channels=2 channel_map=front-left,front-right

# Load Bluetooth modules
load-module module-bluetooth-policy
load-module module-bluetooth-discover

# Set Bluetooth codec preferences
load-module module-bluez5-discover headset=auto

# Automatically switch to Bluetooth when connected
load-module module-switch-on-connect

# Set default sink
set-default-sink alsa_output.stereo
EOF

chown -R $REAL_USER:$REAL_USER /home/$REAL_USER/.config/pulse

# Fix 3: Create a script to fix audio balance
print_status "Creating audio balance fix script..."

cat > /usr/local/bin/fix-audio-balance.sh << 'EOF'
#!/bin/bash

# Get the real user
REAL_USER=${1:-$(logname 2>/dev/null)}
if [ -z "$REAL_USER" ]; then
    REAL_USER=$(ls /home | head -1)
fi

echo "Fixing audio balance for user: $REAL_USER"

# Wait for PulseAudio to be ready
sleep 2

# Get all sinks and fix their balance/volume
sudo -u $REAL_USER pactl list sinks short | while read -r sink_info; do
    sink_name=$(echo $sink_info | cut -f2)
    echo "Fixing balance for sink: $sink_name"
    
    # Set balance to center (0.0)
    sudo -u $REAL_USER pactl set-sink-volume $sink_name 80%
    
    # Reset balance to center
    sudo -u $REAL_USER pactl set-sink-mute $sink_name false
    
    # Set proper channel volumes (left and right equal)
    sudo -u $REAL_USER pactl set-sink-volume $sink_name 65536,65536
done

# Also fix any connected Bluetooth devices
sudo -u $REAL_USER pactl list sinks short | grep bluez | while read -r sink_info; do
    sink_name=$(echo $sink_info | cut -f2)
    echo "Fixing Bluetooth balance for: $sink_name"
    sudo -u $REAL_USER pactl set-sink-volume $sink_name 80%
    sudo -u $REAL_USER pactl set-sink-mute $sink_name false
done

echo "Audio balance fixed!"
EOF

chmod +x /usr/local/bin/fix-audio-balance.sh

# Fix 4: Update system-wide ALSA configuration
print_status "Updating system ALSA configuration..."

cat > /etc/asound.conf << 'EOF'
# System ALSA configuration for proper stereo
pcm.!default {
    type pulse
    fallback "sysdefault"
}

ctl.!default {
    type pulse
    fallback "sysdefault"
}

# Ensure stereo output
defaults.pcm.card 0
defaults.pcm.device 0
defaults.ctl.card 0
EOF

# Fix 5: Restart PulseAudio with new configuration
print_status "Restarting PulseAudio with new configuration..."

# Kill existing PulseAudio
sudo -u $REAL_USER killall pulseaudio 2>/dev/null || true
sleep 2

# Start PulseAudio
sudo -u $REAL_USER pulseaudio --start --log-target=syslog

# Wait for it to initialize
sleep 3

# Apply balance fix
/usr/local/bin/fix-audio-balance.sh $REAL_USER

# Test audio channels
print_status "Testing audio channels..."

echo ""
echo "=== Testing Left Channel ==="
sudo -u $REAL_USER speaker-test -t sine -f 440 -c 2 -s 1 -l 1 2>/dev/null &
TEST_PID=$!
sleep 2
kill $TEST_PID 2>/dev/null || true

echo ""
echo "=== Testing Right Channel ==="
sudo -u $REAL_USER speaker-test -t sine -f 880 -c 2 -s 2 -l 1 2>/dev/null &
TEST_PID=$!
sleep 2
kill $TEST_PID 2>/dev/null || true

echo ""
print_status "Audio channel fix completed!"
print_warning "Please test both speakers now:"
echo "1. Test stereo: speaker-test -t wav -c 2"
echo "2. Test left only: speaker-test -t sine -f 440 -c 2 -s 1 -l 3"
echo "3. Test right only: speaker-test -t sine -f 880 -c 2 -s 2 -l 3"
echo "4. Check Bluetooth audio balance when connected"

echo ""
echo "=== Manual Balance Adjustment Commands ==="
echo "- List sinks: sudo -u $REAL_USER pactl list sinks short"
echo "- Set volume: sudo -u $REAL_USER pactl set-sink-volume SINK_NAME 80%"
echo "- Run balance fix: sudo /usr/local/bin/fix-audio-balance.sh"
echo "- Check volumes: sudo -u $REAL_USER pactl list sinks | grep -A 10 Volume"

print_status "Channel fix script completed!"