#!/bin/bash

# Advanced Bluetooth Media Controller Setup Script for Raspberry Pi 4
# This script extends basic Bluetooth speaker functionality with full media control
# and metadata access for integration with Electron applications
# Run with: sudo ./setup_bluetooth_media_controller.sh

set -e  # Exit on any error

echo "=== Advanced Bluetooth Media Controller Setup ==="
echo "Starting enhanced configuration..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_note() {
    echo -e "${BLUE}[NOTE]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script with sudo"
    exit 1
fi

# Check if basic bluetooth speaker setup was run first
if [ ! -f "/etc/bluetooth/main.conf" ]; then
    print_error "Please run setup_bluetooth_speaker.sh first!"
    exit 1
fi

print_status "Installing additional packages for media control..."
apt install -y \
    python3-dbus \
    python3-gi \
    python3-pip \
    nodejs \npm \
    dbus-x11 \
    at-spi2-core

# Install Python packages for D-Bus interaction
pip3 install pydbus pygobject

# Enhanced Bluetooth configuration with AVRCP support
print_status "Configuring advanced Bluetooth settings with AVRCP..."
cat > /etc/bluetooth/main.conf << 'EOF'
[General]
Name = SunriseAlarm-Speaker
Class = 0x200414
DiscoverableTimeout = 0
Discoverable = yes
PairableTimeout = 0
Pairable = yes
AutoConnect = yes
MultiProfile = multiple

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

# Create systemd service for the enhanced media agent
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

# Replace the old bluetooth agent service
print_status "Updating services..."
systemctl stop bluetooth-agent.service 2>/dev/null || true
systemctl disable bluetooth-agent.service 2>/dev/null || true

# Enable new services
systemctl daemon-reload
systemctl enable bluetooth-media-agent.service
systemctl enable media-metadata-monitor.service

# Restart Bluetooth service with new configuration
systemctl restart bluetooth.service
sleep 2
systemctl start bluetooth-media-agent.service
systemctl start media-metadata-monitor.service

print_status "Advanced Bluetooth media controller setup complete!"
print_note "The system now supports:"
echo "  ✓ AVRCP media control (play, pause, next, previous)"
echo "  ✓ Real-time metadata capture (song, artist, album info)"
echo "  ✓ Unix socket interface for Electron app integration"
echo "  ✓ D-Bus media player interfaces"
echo "  ✓ Position and duration tracking"

print_warning "Please reboot the system for all changes to take effect."

echo ""
echo "=== Testing Commands ==="
echo "- Test media control: sudo /usr/local/bin/media-control.py status"
echo "- View metadata logs: tail -f /var/log/media_metadata.log"
echo "- Check services: systemctl status bluetooth-media-agent"
echo "- Monitor D-Bus: dbus-monitor --system"

echo ""
echo "=== Integration Notes ==="
echo "- Unix socket available at: /tmp/bluetooth_media.sock"
echo "- Send JSON commands to control media and get metadata"
echo "- Example Electron integration code will be created next"

print_status "Advanced setup completed successfully!"