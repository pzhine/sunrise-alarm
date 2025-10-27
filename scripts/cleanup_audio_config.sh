#!/bin/bash

# Minimal Audio Configuration Cleanup
# This keeps the beneficial changes but removes unnecessary complexity
# Run with: sudo ./cleanup_audio_config.sh

echo "=== Cleaning Up Audio Configuration ==="

# Detect user
REAL_USER=${SUDO_USER:-$(logname 2>/dev/null || echo "")}
if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
    REAL_USER=$(ls /home | head -1)
fi

echo "Detected user: $REAL_USER"

# Keep the improved .asoundrc but simplify it
echo "Updating user ALSA configuration..."
cat > /home/$REAL_USER/.asoundrc << 'EOF'
# Simple ALSA configuration for PulseAudio
pcm.!default {
    type pulse
    fallback "sysdefault"
}

ctl.!default {
    type pulse
    fallback "sysdefault"
}
EOF

# Simplify PulseAudio user configuration  
echo "Simplifying PulseAudio configuration..."
cat > /home/$REAL_USER/.config/pulse/default.pa << 'EOF'
#!/usr/bin/pulseaudio -nF

# Load core modules
.include /etc/pulse/default.pa

# Load Bluetooth modules
load-module module-bluetooth-policy
load-module module-bluetooth-discover

# Automatically switch to Bluetooth when connected
load-module module-switch-on-connect
EOF

# Set ownership
chown -R $REAL_USER:$REAL_USER /home/$REAL_USER/.config/pulse
chown $REAL_USER:$REAL_USER /home/$REAL_USER/.asoundrc

# Keep the balance fix utility (it's useful!)
echo "✓ Keeping audio balance utility at /usr/local/bin/fix-audio-balance.sh"

# Restart PulseAudio
echo "Restarting PulseAudio..."
sudo -u $REAL_USER killall pulseaudio 2>/dev/null || true
sleep 2
sudo -u $REAL_USER pulseaudio --start

echo ""
echo "=== Cleanup Complete ==="
echo "✓ Simplified audio configuration"
echo "✓ Kept Bluetooth functionality" 
echo "✓ Kept balance fix utility"
echo "✓ Removed complex channel mapping"
echo ""
echo "Your audio should work the same but with cleaner config files!"