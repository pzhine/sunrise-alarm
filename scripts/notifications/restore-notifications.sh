#!/bin/bash

# Restore Desktop Notifications for DawnDeck Speaker
# This script restores desktop notifications from backup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
BACKUP_DIR="$HOME/.local/share/dawndeck/notification-backups"

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

# Find latest backup file
find_latest_backup() {
    if [ ! -d "$BACKUP_DIR" ]; then
        print_error "No backup directory found at $BACKUP_DIR"
        print_status "Notifications may not have been disabled by our script"
        exit 1
    fi
    
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/original-settings-*.conf 2>/dev/null | head -1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        print_error "No backup file found in $BACKUP_DIR"
        print_status "Cannot restore original settings"
        exit 1
    fi
    
    print_status "Found backup: $LATEST_BACKUP"
}

# Load settings from backup
load_backup_settings() {
    print_status "Loading original settings from backup..."
    
    # Source the backup file to get original values
    source "$LATEST_BACKUP"
    
    print_success "Original settings loaded"
}

# Restore GNOME notifications
restore_gnome_notifications() {
    if command -v gsettings >/dev/null 2>&1; then
        print_status "Restoring GNOME desktop notifications..."
        
        # Restore main notification settings
        if [ ! -z "$GNOME_SHOW_BANNERS" ]; then
            gsettings set org.gnome.desktop.notifications show-banners "$GNOME_SHOW_BANNERS" 2>/dev/null || true
        fi
        
        if [ ! -z "$GNOME_SHOW_IN_LOCK_SCREEN" ]; then
            gsettings set org.gnome.desktop.notifications show-in-lock-screen "$GNOME_SHOW_IN_LOCK_SCREEN" 2>/dev/null || true
        fi
        
        # Re-enable specific notification categories
        gsettings reset org.gnome.desktop.notifications.application:/org/gnome/desktop/notifications/application/blueman/ enable 2>/dev/null || true
        gsettings reset org.gnome.desktop.notifications.application:/org/gnome/desktop/notifications/application/bluetooth/ enable 2>/dev/null || true
        
        print_success "GNOME notifications restored"
    else
        print_warning "GNOME settings not available"
    fi
}

# Restore KDE notifications
restore_kde_notifications() {
    if command -v kwriteconfig5 >/dev/null 2>&1; then
        print_status "Restoring KDE desktop notifications..."
        
        if [ ! -z "$KDE_NOTIFICATIONS_ENABLED" ]; then
            kwriteconfig5 --file plasmanotifyrc --group Notifications --key Enabled "$KDE_NOTIFICATIONS_ENABLED" 2>/dev/null || true
        fi
        
        # Reset bluetooth notifications
        kwriteconfig5 --file plasmanotifyrc --group Applications --group blueman --key Enabled true 2>/dev/null || true
        
        # Restart plasmashell to apply changes
        if pgrep plasmashell >/dev/null; then
            print_status "Restarting plasmashell to apply changes..."
            killall plasmashell 2>/dev/null || true
            sleep 2
            plasmashell &
        fi
        
        print_success "KDE notifications restored"
    else
        print_warning "KDE settings not available"
    fi
}

# Re-enable notification daemons
enable_notification_daemons() {
    print_status "Re-enabling notification daemons..."
    
    # Unmask and enable systemd services
    local daemons=("dunst" "mako" "notification-daemon" "notify-osd")
    
    for daemon in "${daemons[@]}"; do
        if systemctl --user list-unit-files | grep -q "$daemon"; then
            systemctl --user unmask "$daemon" 2>/dev/null || true
            systemctl --user enable "$daemon" 2>/dev/null || true
        fi
    done
    
    print_success "Notification daemons re-enabled"
}

# Remove persistent disable service
remove_persistent_disable() {
    print_status "Removing persistent notification disable service..."
    
    # Stop and disable the service
    sudo systemctl stop disable-notifications.service 2>/dev/null || true
    sudo systemctl disable disable-notifications.service 2>/dev/null || true
    
    # Remove service files
    sudo rm -f /etc/systemd/system/disable-notifications.service
    sudo rm -f /usr/local/bin/disable-notifications-persistent.sh
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    print_success "Persistent disable service removed"
}

# Interactive backup selection
select_backup() {
    if [ -t 0 ]; then  # Check if running interactively
        echo ""
        echo -e "${BOLD}Available backups:${NC}"
        
        local backups=($(ls -t "$BACKUP_DIR"/original-settings-*.conf 2>/dev/null))
        
        if [ ${#backups[@]} -eq 0 ]; then
            print_error "No backup files found"
            exit 1
        fi
        
        for i in "${!backups[@]}"; do
            local backup_date=$(echo "${backups[$i]}" | grep -o '[0-9]\{8\}_[0-9]\{6\}')
            local formatted_date=$(echo "$backup_date" | sed 's/_/ /' | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\) \([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
            echo "  $((i+1)). $formatted_date - ${backups[$i]}"
        done
        
        echo ""
        read -p "Select backup to restore (1-${#backups[@]}, or Enter for latest): " choice
        
        if [ -z "$choice" ]; then
            LATEST_BACKUP="${backups[0]}"
        elif [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#backups[@]} ]; then
            LATEST_BACKUP="${backups[$((choice-1))]}"
        else
            print_error "Invalid selection"
            exit 1
        fi
    else
        # Non-interactive mode - use latest
        LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/original-settings-*.conf 2>/dev/null | head -1)
    fi
    
    print_status "Selected backup: $LATEST_BACKUP"
}

# Main function
main() {
    echo -e "${BOLD}${BLUE}DawnDeck Notification Restorer${NC}"
    echo "================================"
    echo ""
    
    print_status "Restoring desktop notifications from backup..."
    echo ""
    
    find_latest_backup
    select_backup
    load_backup_settings
    restore_gnome_notifications
    restore_kde_notifications
    enable_notification_daemons
    remove_persistent_disable
    
    echo ""
    echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║          Notifications Successfully Restored          ║${NC}"
    echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    print_success "Desktop notifications have been restored"
    print_status "Restored from backup: $LATEST_BACKUP"
    echo ""
    
    echo -e "${BOLD}Changes made:${NC}"
    echo "  • GNOME notification settings restored to original values"
    echo "  • KDE notification system re-enabled"
    echo "  • Notification daemons unmasked and re-enabled"
    echo "  • Persistent disable service removed"
    echo ""
    
    print_status "Reboot or restart desktop session for all changes to take effect"
}

# Check if running as root for some operations
if [[ $EUID -eq 0 ]]; then
    print_error "Please run this script as a regular user (it will use sudo when needed)"
    exit 1
fi

# Run main function
main "$@"