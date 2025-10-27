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

# Enable pairing mode
enable_pairing() {
    print_status "Enabling pairing mode for '$DEVICE_NAME'..."
    
    # Ensure device name is set correctly first
    bluetoothctl system-alias "$DEVICE_NAME" 2>/dev/null || print_warning "Could not set device name"
    
    # Set up automatic pairing agent (no user interaction required)
    print_status "Setting up automatic pairing agent..."
    bluetoothctl agent NoInputNoOutput
    bluetoothctl default-agent
    
    # Make device discoverable and pairable
    bluetoothctl discoverable on
    bluetoothctl pairable on
    
    if [ $? -eq 0 ]; then
        print_success "Pairing mode enabled (automatic pairing - no confirmation needed)!"
        log "Pairing mode activated for $PAIRING_TIMEOUT seconds"
    else
        print_error "Failed to enable pairing mode"
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
        if bluetoothctl info 2>/dev/null | grep -q "Connected: yes"; then
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
    
    bluetoothctl discoverable off
    
    if [ $? -eq 0 ]; then
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