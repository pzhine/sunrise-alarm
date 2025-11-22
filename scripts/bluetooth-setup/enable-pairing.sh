#!/bin/bash

# Enable Bluetooth Pairing Mode for DawnDeck Speaker
# This script makes the device discoverable for 3 minutes like commercial speakers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

DEVICE_NAME="DawnDeck"
PAIRING_TIMEOUT=180  # 3 minutes in seconds

# Logging (use user-accessible location)
USER_LOG_DIR="$HOME/.local/log"
mkdir -p "$USER_LOG_DIR" 2>/dev/null || USER_LOG_DIR="/tmp"
PAIRING_LOG="$USER_LOG_DIR/bluetooth-pairing.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$PAIRING_LOG"
}

print_status() {
    echo -e "${BLUE}${BOLD}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}${BOLD}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should NOT be run as root"
        print_status "Run as regular user: ./enable-pairing.sh"
        exit 1
    fi
}

# Check if Bluetooth service is running
check_bluetooth_service() {
    if ! systemctl is-active --quiet bluetooth; then
        print_error "Bluetooth service is not running"
        print_status "Start with: sudo systemctl start bluetooth"
        exit 1
    fi
}

# Check if Python3 is available for the agent
check_python() {
    if ! command -v python3 >/dev/null 2>&1; then
        print_error "Python3 is required but not installed"
        print_status "Install with: sudo apt install python3 python3-dbus python3-gi"
        exit 1
    fi
}

# Enable pairing mode
enable_pairing() {
    print_status "Enabling pairing mode for '$DEVICE_NAME'..."
    
    # Ensure device name is set correctly first
    bluetoothctl system-alias "$DEVICE_NAME" 2>/dev/null || print_warning "Could not set device name"
    
    # Kill any existing bluetoothctl processes that might interfere
    pkill -f "bluetoothctl" 2>/dev/null || true
    
    # Set up automatic pairing agent using a background process
    print_status "Setting up automatic pairing agent (no confirmation mode)..."
    
    # Create a simple-agent script for automatic pairing
    cat > /tmp/bt-agent-$$.py << 'EOF'
#!/usr/bin/env python3
import dbus
import dbus.service
import dbus.mainloop.glib
from gi.repository import GLib

class Agent(dbus.service.Object):
    exit_on_release = True

    def set_exit_on_release(self, exit_on_release):
        self.exit_on_release = exit_on_release

    @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
    def Release(self):
        if self.exit_on_release:
            mainloop.quit()

    @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
    def AuthorizeService(self, device, uuid):
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="s")
    def RequestPinCode(self, device):
        return "0000"

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="u")
    def RequestPasskey(self, device):
        return dbus.UInt32(0)

    @dbus.service.method("org.bluez.Agent1", in_signature="ou", out_signature="")
    def DisplayPasskey(self, device, passkey):
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
    def DisplayPinCode(self, device, pincode):
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="ou", out_signature="")
    def RequestConfirmation(self, device, passkey):
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="")
    def RequestAuthorization(self, device):
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
    def Cancel(self):
        pass

if __name__ == '__main__':
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()
    manager = dbus.Interface(bus.get_object("org.bluez", "/org/bluez"), "org.bluez.AgentManager1")
    
    path = "/test/agent"
    agent = Agent(bus, path)
    
    manager.RegisterAgent(path, "NoInputNoOutput")
    manager.RequestDefaultAgent(path)
    
    mainloop = GLib.MainLoop()
    try:
        mainloop.run()
    except KeyboardInterrupt:
        manager.UnregisterAgent(path)
EOF
    
    # Start the automatic agent in background
    python3 /tmp/bt-agent-$$.py &
    AGENT_PID=$!
    
    sleep 2
    
    # Now enable discoverable mode
    {
        echo "discoverable on"
        echo "pairable on"
        echo "quit"
    } | bluetoothctl
    
    # Verify pairing mode is active
    sleep 2
    if bluetoothctl show | grep -q "Discoverable: yes"; then
        print_success "Pairing mode enabled (automatic pairing - no confirmation needed)!"
        log "Pairing mode activated for $PAIRING_TIMEOUT seconds"
        log "Agent PID: $AGENT_PID"
    else
        print_error "Failed to enable pairing mode"
        kill $AGENT_PID 2>/dev/null || true
        rm -f /tmp/bt-agent-$$.py
        exit 1
    fi
}

# Show pairing status
show_pairing_info() {
    echo ""
    echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║                 Pairing Mode Active                   ║${NC}"
    echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    print_status "Device '$DEVICE_NAME' is now discoverable for pairing"
    print_status "Pairing log: $PAIRING_LOG"
    echo ""
    echo -e "${BOLD}Instructions:${NC}"
    echo "  1. Open Bluetooth settings on your phone/device"
    echo "  2. Look for '$DEVICE_NAME' in available devices"
    echo "  3. Tap to pair (automatic - no PIN or confirmation needed)"
    echo "  4. Select '$DEVICE_NAME' as audio output"
    echo ""
    
    echo -e "${BOLD}Pairing will automatically disable in $PAIRING_TIMEOUT seconds${NC}"
    echo ""
    
    # Show current Bluetooth status
    local status=$(bluetoothctl show 2>/dev/null | grep -E "(Powered|Discoverable|Pairable)" | tr '\n' ' ')
    print_status "Current status: $status"
}

# Wait for pairing timeout with countdown
wait_for_timeout() {
    local remaining=$PAIRING_TIMEOUT
    
    echo -e "${BOLD}Time remaining:${NC}"
    
    while [ $remaining -gt 0 ]; do
        # Format time as MM:SS
        local minutes=$((remaining / 60))
        local seconds=$((remaining % 60))
        printf "\r  %02d:%02d - Press Ctrl+C to stop early" $minutes $seconds
        
        sleep 1
        remaining=$((remaining - 1))
        
        # Check if a new device connected
        if bluetoothctl devices Connected 2>/dev/null | grep -q "Device"; then
            echo ""
            print_success "Device connected! Pairing successful."
            break
        fi
    done
    
    echo ""
}

# Disable pairing mode
disable_pairing() {
    print_status "Disabling pairing mode..."
    
    # Use here document to ensure command is processed
    {
        echo "discoverable off"
        echo "quit"
    } | bluetoothctl
    
    # Verify pairing mode is disabled
    sleep 1
    if bluetoothctl show | grep -q "Discoverable: no"; then
        print_success "Pairing mode disabled"
        log "Pairing mode deactivated"
    else
        print_warning "Failed to disable pairing mode"
    fi
}

# Cleanup on exit
cleanup() {
    echo ""
    print_status "Cleaning up..."
    disable_pairing
    
    # Kill the agent process if it exists
    if [ ! -z "$AGENT_PID" ]; then
        kill $AGENT_PID 2>/dev/null || true
        print_status "Stopped automatic pairing agent"
    fi
    
    # Clean up temporary files
    rm -f /tmp/bt-agent-$$.py
    
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main function
main() {
    echo -e "${BOLD}${BLUE}DawnDeck Bluetooth Pairing${NC}"
    echo "=========================="
    echo ""
    
    check_root
    check_bluetooth_service
    check_python
    enable_pairing
    show_pairing_info
    wait_for_timeout
    disable_pairing
    
    echo ""
    print_success "Pairing session complete"
    print_status "Device is no longer discoverable"
    print_status "Pairing log saved to: $PAIRING_LOG"
    echo ""
}

# Run main function
main "$@"