#!/bin/bash

# Disable Desktop Notifications for DawnDeck Speaker
# This script permanently disables desktop notifications for a dedicated speaker device

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
BACKUP_DIR="/var/backups/notification-settings"
BACKUP_FILE="$BACKUP_DIR/original-settings-$(date +%Y%m%d_%H%M%S).conf"

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

# Create backup directory
create_backup() {
    print_status "Creating backup of current notification settings..."
    
    sudo mkdir -p "$BACKUP_DIR"
    
    cat > "$BACKUP_FILE" << EOF
# Original notification settings backup - $(date)
# This file can be used to restore original notification settings

EOF
    
    # Backup GNOME settings
    if command -v gsettings >/dev/null 2>&1; then
        echo "# GNOME Settings" >> "$BACKUP_FILE"
        echo "GNOME_SHOW_BANNERS=$(gsettings get org.gnome.desktop.notifications show-banners 2>/dev/null || echo 'true')" >> "$BACKUP_FILE"
        echo "GNOME_SHOW_IN_LOCK_SCREEN=$(gsettings get org.gnome.desktop.notifications show-in-lock-screen 2>/dev/null || echo 'true')" >> "$BACKUP_FILE"
    fi
    
    # Backup KDE settings
    if command -v kreadconfig5 >/dev/null 2>&1; then
        echo "# KDE Settings" >> "$BACKUP_FILE"
        echo "KDE_NOTIFICATIONS_ENABLED=$(kreadconfig5 --file plasmanotifyrc --group Notifications --key Enabled 2>/dev/null || echo 'true')" >> "$BACKUP_FILE"
    fi
    
    sudo chown $(whoami):$(whoami) "$BACKUP_FILE"
    print_success "Settings backed up to: $BACKUP_FILE"
}

# Disable GNOME notifications
disable_gnome_notifications() {
    if command -v gsettings >/dev/null 2>&1; then
        print_status "Disabling GNOME desktop notifications..."
        
        gsettings set org.gnome.desktop.notifications show-banners false 2>/dev/null || true
        gsettings set org.gnome.desktop.notifications show-in-lock-screen false 2>/dev/null || true
        
        # Disable specific notification categories
        gsettings set org.gnome.desktop.notifications.application:/org/gnome/desktop/notifications/application/blueman/ enable false 2>/dev/null || true
        gsettings set org.gnome.desktop.notifications.application:/org/gnome/desktop/notifications/application/bluetooth/ enable false 2>/dev/null || true
        
        print_success "GNOME notifications disabled"
    else
        print_warning "GNOME settings not available (not running GNOME?)"
    fi
}

# Disable KDE notifications
disable_kde_notifications() {
    if command -v kwriteconfig5 >/dev/null 2>&1; then
        print_status "Disabling KDE desktop notifications..."
        
        kwriteconfig5 --file plasmanotifyrc --group Notifications --key Enabled false 2>/dev/null || true
        kwriteconfig5 --file plasmanotifyrc --group Applications --group blueman --key Enabled false 2>/dev/null || true
        
        # Restart plasmashell to apply changes
        if pgrep plasmashell >/dev/null; then
            print_status "Restarting plasmashell to apply changes..."
            killall plasmashell 2>/dev/null || true
            sleep 2
            plasmashell &
        fi
        
        print_success "KDE notifications disabled"
    else
        print_warning "KDE settings not available (not running KDE/Plasma?)"
    fi
}

# Disable notification daemons
disable_notification_daemons() {
    print_status "Disabling notification daemons..."
    
    # Stop and disable notification services
    local daemons=("dunst" "mako" "notification-daemon" "notify-osd")
    
    for daemon in "${daemons[@]}"; do
        if pgrep -f "$daemon" >/dev/null; then
            print_status "Stopping $daemon..."
            pkill -f "$daemon" 2>/dev/null || true
        fi
        
        # Disable systemd services if they exist
        if systemctl --user list-unit-files | grep -q "$daemon"; then
            systemctl --user disable "$daemon" 2>/dev/null || true
            systemctl --user mask "$daemon" 2>/dev/null || true
        fi
    done
    
    print_success "Notification daemons disabled"
}

# Create persistent disable script
create_persistent_disable() {
    print_status "Creating persistent notification disable service..."
    
    sudo cat > /etc/systemd/system/disable-notifications.service << 'EOF'
[Unit]
Description=Disable Desktop Notifications for DawnDeck
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/disable-notifications-persistent.sh
User=root

[Install]
WantedBy=graphical.target
EOF

    sudo cat > /usr/local/bin/disable-notifications-persistent.sh << 'EOF'
#!/bin/bash
# Persistent notification disabling

# Wait for desktop to be ready
sleep 10

# Get the current user
REAL_USER=${SUDO_USER:-$(logname 2>/dev/null || echo "")}
if [ -z "$REAL_USER" ]; then
    REAL_USER=$(ls /home | head -1)
fi

if [ ! -z "$REAL_USER" ]; then
    export XDG_RUNTIME_DIR="/run/user/$(id -u $REAL_USER)"
    
    # Disable GNOME notifications
    if command -v gsettings >/dev/null 2>&1; then
        sudo -u "$REAL_USER" gsettings set org.gnome.desktop.notifications show-banners false 2>/dev/null || true
        sudo -u "$REAL_USER" gsettings set org.gnome.desktop.notifications show-in-lock-screen false 2>/dev/null || true
    fi
    
    # Kill notification daemons
    pkill -f "dunst" 2>/dev/null || true
    pkill -f "mako" 2>/dev/null || true
    pkill -f "notification-daemon" 2>/dev/null || true
    pkill -f "notify-osd" 2>/dev/null || true
fi
EOF

    sudo chmod +x /usr/local/bin/disable-notifications-persistent.sh
    sudo systemctl enable disable-notifications.service
    
    print_success "Persistent notification service created"
}

# Main function
main() {
    echo -e "${BOLD}${BLUE}DawnDeck Notification Disabler${NC}"
    echo "================================="
    echo ""
    
    print_status "Disabling all desktop notifications for dedicated speaker use..."
    echo ""
    
    create_backup
    disable_gnome_notifications
    disable_kde_notifications
    disable_notification_daemons
    create_persistent_disable
    
    echo ""
    echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║            Notifications Successfully Disabled         ║${NC}"
    echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    print_success "Desktop notifications have been completely disabled"
    print_status "Original settings backed up to: $BACKUP_FILE"
    print_status "To restore notifications, run: ./restore-notifications.sh"
    echo ""
    
    echo -e "${BOLD}Changes made:${NC}"
    echo "  • GNOME notification banners disabled"
    echo "  • KDE notification system disabled"
    echo "  • Notification daemons stopped and masked"
    echo "  • Persistent service created to maintain disabled state"
    echo ""
    
    print_status "Reboot recommended to ensure all changes take effect"
}

# Check if running as root for some operations
if [[ $EUID -eq 0 ]]; then
    print_error "Please run this script as a regular user (it will use sudo when needed)"
    exit 1
fi

# Run main function
main "$@"