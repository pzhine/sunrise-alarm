#!/bin/bash

# Bluetooth Speaker Setup Script for Raspberry Pi 4
# This script configures the device to act as a Bluetooth speaker
# Run with: sudo ./setup_bluetooth_speaker.sh

set -e  # Exit on any error

echo "=== Bluetooth Speaker Setup for Raspberry Pi 4 ==="
echo "Starting configuration..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Update system packages
print_status "Updating system packages..."
apt update && apt upgrade -y

# Ensure we have the latest package information
print_status "Refreshing package cache..."
apt update --fix-missing

# Install required packages
print_status "Installing required packages..."
apt install -y \
    bluetooth \
    bluez \
    bluez-tools \
    pulseaudio \
    pulseaudio-module-bluetooth \
    pavucontrol \
    alsa-utils \
    libasound2-plugins

# Verify Bluetooth service is available
if ! systemctl list-unit-files | grep -q bluetooth.service; then
    print_error "Bluetooth service not found. Attempting to install bluez-firmware..."
    apt install -y bluez-firmware pi-bluetooth || print_warning "Could not install additional Bluetooth packages"
fi

print_status "Verifying package installation..."
for pkg in bluetooth bluez pulseaudio; do
    if ! dpkg -l | grep -q "^ii  $pkg "; then
        print_error "Package $pkg not properly installed"
        exit 1
    fi
done

# Enable Bluetooth service
print_status "Enabling Bluetooth service..."
systemctl enable bluetooth
systemctl start bluetooth

# Configure PulseAudio for system-wide use
print_status "Configuring PulseAudio..."

# Create PulseAudio system configuration
cat > /etc/pulse/system.pa << 'EOF'
#!/usr/bin/pulseaudio -nF

# Load core modules
load-module module-device-restore
load-module module-stream-restore
load-module module-card-restore
load-module module-augment-properties
load-module module-switch-on-port-available

# Load hardware detection modules
load-module module-udev-detect
load-module module-alsa-sink
load-module module-alsa-source device=hw:1,0

# Load Bluetooth modules for BlueZ 5
load-module module-bluetooth-policy
load-module module-bluetooth-discover

# Native protocol for local access
load-module module-native-protocol-unix auth-anonymous=1 socket=/tmp/pulse-socket

# Set default sink
set-default-sink alsa_output.platform-bcm2835_audio.analog-stereo
EOF

# Create PulseAudio daemon configuration
cat > /etc/pulse/daemon.conf << 'EOF'
# PulseAudio daemon configuration
system-instance = yes
enable-remixing = yes
enable-lfe-remixing = yes
default-sample-format = s16le
default-sample-rate = 44100
default-sample-channels = 2
default-channel-map = front-left,front-right
EOF

# Configure Bluetooth main configuration
print_status "Configuring Bluetooth settings..."
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
EOF

# Create systemd service for PulseAudio
print_status "Creating PulseAudio system service..."
cat > /etc/systemd/system/pulseaudio.service << 'EOF'
[Unit]
Description=PulseAudio system server
After=sound.target bluetooth.service

[Service]
Type=notify
ExecStart=/usr/bin/pulseaudio --daemonize=no --system --realtime --log-target=journal
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF

# Add users to audio and bluetooth groups
print_status "Configuring user permissions..."
usermod -a -G audio,bluetooth pulse
usermod -a -G audio,bluetooth pi 2>/dev/null || true

# Ensure audio devices have correct permissions
print_status "Setting audio device permissions..."
cat > /etc/udev/rules.d/99-audio-permissions.rules << 'EOF'
SUBSYSTEM=="sound", GROUP="audio", MODE="0664"
KERNEL=="controlC[0-9]*", GROUP="audio", MODE="0664"
EOF

# Create Bluetooth agent script for auto-pairing
print_status "Creating Bluetooth auto-pairing service..."
cat > /usr/local/bin/bluetooth-agent.py << 'EOF'
#!/usr/bin/env python3
import dbus
import dbus.service
import dbus.mainloop.glib
from gi.repository import GLib
import sys

class Agent(dbus.service.Object):
    exit_on_release = True

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

if __name__ == '__main__':
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)

    bus = dbus.SystemBus()
    capability = "NoInputNoOutput"

    path = "/test/agent"
    agent = Agent(bus, path)

    obj = bus.get_object("org.bluez", "/org/bluez")
    manager = dbus.Interface(obj, "org.bluez.AgentManager1")
    manager.RegisterAgent(path, capability)
    manager.RequestDefaultAgent(path)

    mainloop = GLib.MainLoop()
    mainloop.run()
EOF

chmod +x /usr/local/bin/bluetooth-agent.py

# Create systemd service for Bluetooth agent
cat > /etc/systemd/system/bluetooth-agent.service << 'EOF'
[Unit]
Description=Bluetooth Agent
After=bluetooth.service pulseaudio.service
Wants=bluetooth.service pulseaudio.service

[Service]
Type=simple
ExecStart=/usr/local/bin/bluetooth-agent.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Configure ALSA for better audio quality
print_status "Configuring ALSA..."
cat > /etc/asound.conf << 'EOF'
pcm.!default {
    type pulse
}
ctl.!default {
    type pulse
}
EOF

# Create script to make device discoverable
print_status "Creating discoverable script..."
cat > /usr/local/bin/make-discoverable.sh << 'EOF'
#!/bin/bash
bluetoothctl <<EOF
power on
discoverable on
pairable on
agent NoInputNoOutput
default-agent
EOF
EOF

chmod +x /usr/local/bin/make-discoverable.sh

# Create systemd service to make device discoverable on boot
cat > /etc/systemd/system/bluetooth-discoverable.service << 'EOF'
[Unit]
Description=Make Bluetooth discoverable
After=bluetooth.service
Wants=bluetooth.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/make-discoverable.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Enable all services
print_status "Enabling services..."
systemctl daemon-reload
systemctl enable pulseaudio.service
systemctl enable bluetooth-agent.service
systemctl enable bluetooth-discoverable.service

# Start PulseAudio
systemctl start pulseaudio.service

# Configure audio output routing
print_status "Configuring audio routing..."

# Ensure Bluetooth audio modules are loaded
sudo -u pulse pulseaudio -k 2>/dev/null || true
sleep 2
systemctl start pulseaudio.service

# Set audio output to maximum quality
amixer set PCM 100%
amixer set Master 100%

# Create a script to handle Bluetooth connections
print_status "Creating connection handler..."
cat > /usr/local/bin/bluetooth-connect-handler.sh << 'EOF'
#!/bin/bash

# This script handles Bluetooth device connections
# It ensures audio is properly routed when devices connect

DEVICE_MAC="$1"
ACTION="$2"

case "$ACTION" in
    "connected")
        echo "Device connected: $DEVICE_MAC"
        # Wait for A2DP profile to be ready
        sleep 3
        # Set the connected device as default sink
        sudo -u pulse pactl set-default-sink bluez_sink.${DEVICE_MAC//:/_}.a2dp_sink 2>/dev/null || true
        ;;
    "disconnected")
        echo "Device disconnected: $DEVICE_MAC"
        # Fall back to local audio output
        sudo -u pulse pactl set-default-sink alsa_output.platform-bcm2835_audio.analog-stereo 2>/dev/null || true
        ;;
esac
EOF

chmod +x /usr/local/bin/bluetooth-connect-handler.sh

# Add udev rule for Bluetooth device events
cat > /etc/udev/rules.d/99-bluetooth-audio.rules << 'EOF'
SUBSYSTEM=="bluetooth", ACTION=="add", RUN+="/usr/local/bin/bluetooth-connect-handler.sh %k connected"
SUBSYSTEM=="bluetooth", ACTION=="remove", RUN+="/usr/local/bin/bluetooth-connect-handler.sh %k disconnected"
EOF

# Reload udev rules
udevadm control --reload-rules

print_status "Configuration complete!"
print_warning "Please reboot the system for all changes to take effect."
print_status "After reboot, your Raspberry Pi will be discoverable as 'SunriseAlarm-Speaker'"
print_status "Devices can connect without requiring a PIN (uses 0000 if needed)"

echo ""
echo "=== Post-Setup Instructions ==="
echo "1. Reboot the system: sudo reboot"
echo "2. The device will be discoverable as 'SunriseAlarm-Speaker'"
echo "3. Pair your phone/device and select it as audio output"
echo "4. Audio will automatically route to connected Bluetooth devices"
echo "5. Use 'bluetoothctl' to manage connections manually if needed"
echo ""
echo "=== Useful Commands ==="
echo "- Check Bluetooth status: systemctl status bluetooth"
echo "- Check PulseAudio status: systemctl status pulseaudio"
echo "- List audio devices: sudo -u pulse pactl list sinks short"
echo "- Make discoverable again: sudo /usr/local/bin/make-discoverable.sh"
echo "- Monitor Bluetooth: bluetoothctl"

print_status "Setup script completed successfully!"