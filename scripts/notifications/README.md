# Desktop Notification Management for DawnDeck

This directory contains scripts to manage desktop notifications on the DawnDeck speaker device.

## Overview

For a dedicated speaker device, desktop notifications are typically unwanted as they can:
- Interrupt the audio experience
- Show unnecessary popups during Bluetooth pairing
- Display system messages that aren't relevant for a speaker-only device

## Scripts

### `disable-notifications.sh`
**Purpose**: Permanently disable all desktop notifications system-wide.

**Usage**:
```bash
cd scripts/notifications
./disable-notifications.sh
```

**What it does**:
- Backs up current notification settings
- Disables GNOME notification banners and lock screen notifications
- Disables KDE/Plasma notification system
- Stops and masks notification daemons (dunst, mako, notify-osd, etc.)
- Creates a persistent systemd service to maintain disabled state after reboots
- Disables Bluetooth-specific notifications

**Files created**:
- `/var/backups/notification-settings/original-settings-YYYYMMDD_HHMMSS.conf`
- `/etc/systemd/system/disable-notifications.service`
- `/usr/local/bin/disable-notifications-persistent.sh`

### `restore-notifications.sh`
**Purpose**: Restore desktop notifications to their original state.

**Usage**:
```bash
cd scripts/notifications
./restore-notifications.sh
```

**What it does**:
- Lists available backup files
- Allows selection of which backup to restore from
- Restores GNOME notification settings
- Re-enables KDE notification system  
- Unmasks and re-enables notification daemons
- Removes the persistent disable service

**Interactive mode**: If run from a terminal, shows backup selection menu.
**Non-interactive mode**: Automatically uses the most recent backup.

## Desktop Environment Support

### GNOME/GTK-based DEs
- Controls `org.gnome.desktop.notifications` settings via gsettings
- Manages notification banners and lock screen notifications
- Handles application-specific notification settings

### KDE/Plasma
- Controls `plasmanotifyrc` configuration
- Manages the Plasma notification system
- Restarts plasmashell when needed to apply changes

### Other Desktop Environments
- Manages common notification daemons:
  - **dunst**: Lightweight notification daemon
  - **mako**: Wayland notification daemon  
  - **notify-osd**: Ubuntu's notification system
  - **notification-daemon**: Traditional X11 daemon

## Usage Scenarios

### For DawnDeck Speaker Setup
```bash
# During initial setup - disable all notifications permanently
./disable-notifications.sh

# If you need to troubleshoot or want notifications back
./restore-notifications.sh
```

### For Development/Testing
```bash
# Temporarily restore notifications for testing
./restore-notifications.sh

# Re-disable when done
./disable-notifications.sh
```

## Integration with Bluetooth Setup

The Bluetooth pairing script (`../bluetooth-setup/enable-pairing.sh`) includes basic notification suppression during pairing sessions, but for a dedicated speaker device, you'll likely want permanent suppression via these scripts.

## Backup and Recovery

### Backup Format
Backup files are stored in `/var/backups/notification-settings/` with timestamps:
```
original-settings-20251103_142530.conf
```

### Manual Backup Recovery
If needed, you can manually restore settings:
```bash
# Load the backup
source /var/backups/notification-settings/original-settings-YYYYMMDD_HHMMSS.conf

# Apply GNOME settings
gsettings set org.gnome.desktop.notifications show-banners "$GNOME_SHOW_BANNERS"

# Apply KDE settings  
kwriteconfig5 --file plasmanotifyrc --group Notifications --key Enabled "$KDE_NOTIFICATIONS_ENABLED"
```

## Troubleshooting

### Notifications Still Appearing
1. Check if the persistent service is running:
   ```bash
   systemctl status disable-notifications.service
   ```

2. Verify desktop environment detection:
   ```bash
   echo $XDG_CURRENT_DESKTOP
   ```

3. Check for alternative notification systems:
   ```bash
   pgrep -f "notify"
   ```

### Unable to Restore
1. List available backups:
   ```bash
   ls -la /var/backups/notification-settings/
   ```

2. Check backup file contents:
   ```bash
   cat /var/backups/notification-settings/original-settings-*.conf
   ```

3. Manual restoration using gsettings/kwriteconfig5

### Permission Issues
- Both scripts handle sudo elevation automatically
- Backup files are created with user ownership
- Systemd services require root privileges (handled automatically)

## Log Locations

- Script output is displayed in real-time
- Systemd service logs: `journalctl -u disable-notifications.service`
- Desktop environment logs: Check DE-specific log locations

## Compatibility

**Tested with**:
- Raspberry Pi OS (GNOME-based)
- Ubuntu Desktop (GNOME)
- KDE Plasma
- XFCE (via notification daemon management)

**Requirements**:
- bash
- systemd
- sudo privileges
- gsettings (for GNOME-based DEs)
- kwriteconfig5/kreadconfig5 (for KDE)