#!/bin/bash

# Quick fix for PulseAudio deprecation warnings
# Run with: sudo ./fix_pulseaudio_warnings.sh

echo "=== Fixing PulseAudio Deprecation Warnings ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run this script with sudo"
    exit 1
fi

# Update PulseAudio daemon configuration
echo "Updating PulseAudio configuration..."
cat > /etc/pulse/daemon.conf << 'EOF'
# PulseAudio daemon configuration for user mode
system-instance = no
enable-remixing = yes
remixing-produce-lfe = yes
remixing-consume-lfe = yes
default-sample-format = s16le
default-sample-rate = 44100
default-sample-channels = 2
default-channel-map = front-left,front-right
resample-method = speex-float-1
flat-volumes = no
EOF

echo "✓ PulseAudio configuration updated"
echo "The warnings should disappear after your next login or PulseAudio restart."
echo ""
echo "To restart PulseAudio now (optional):"
echo "  pulseaudio --kill && pulseaudio --start"
echo ""
echo "Fix completed!"