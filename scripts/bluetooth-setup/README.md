# Bluetooth Speaker Setup

This directory contains a comprehensive, idempotent setup system for configuring a Raspberry Pi as a Bluetooth speaker with full media control capabilities.

## Quick Start

```bash
# Make executable
chmod +x setup-bluetooth-speaker.sh

# Run setup (safe to run multiple times)
sudo ./setup-bluetooth-speaker.sh
```

## Features

### ✅ **Complete Setup**
- Bluetooth speaker configuration
- Audio system optimization
- User permissions and groups
- Auto-start configuration
- Utility scripts

### ✅ **Idempotent Operation**
- Safe to run multiple times
- Checks existing configuration
- Only changes what's needed
- Automatic configuration backup

### ✅ **Error Handling**
- Comprehensive error checking
- Automatic rollback on failure
- Detailed logging
- Clear error messages

### ✅ **User-Friendly**
- Colorful, clear output
- Progress indication
- Final status report
- Troubleshooting guide

## What It Does

1. **Package Installation**: Installs required Bluetooth and audio packages
2. **Bluetooth Configuration**: Sets up device as "SunriseAlarm-Speaker"
3. **Audio System**: Configures PulseAudio for optimal Bluetooth audio
4. **User Setup**: Configures user-specific audio settings
5. **Utilities**: Creates helper scripts for maintenance
6. **Service Management**: Starts and configures system services
7. **Testing**: Validates the setup works correctly

## Configuration Files Created/Modified

- `/etc/bluetooth/main.conf` - Bluetooth device configuration
- `/etc/pulse/daemon.conf` - PulseAudio system settings
- `/etc/asound.conf` - System ALSA configuration
- `/home/{user}/.config/pulse/default.pa` - User PulseAudio config
- `/home/{user}/.asoundrc` - User ALSA configuration
- `/home/{user}/.bashrc` - Auto-start PulseAudio on login

## Utility Scripts Created

- `/usr/local/bin/fix-audio-balance.sh` - Fix audio channel balance issues
- `/usr/local/bin/bluetooth-control.sh` - Bluetooth management utility

## Usage Examples

### Basic Setup
```bash
sudo ./setup-bluetooth-speaker.sh
```

### Re-run Setup (Safe)
```bash
# If you need to fix issues or update configuration
sudo ./setup-bluetooth-speaker.sh
```

### Manual User Specification
```bash
# If user detection fails
REAL_USER=myusername sudo ./setup-bluetooth-speaker.sh
```

## Utility Commands

### Audio Management
```bash
# Test audio output
speaker-test -t wav -c 2

# Fix audio balance
sudo /usr/local/bin/fix-audio-balance.sh

# Check audio devices
aplay -l
```

### Bluetooth Management
```bash
# Make device discoverable
/usr/local/bin/bluetooth-control.sh discoverable

# Check Bluetooth status
/usr/local/bin/bluetooth-control.sh status

# List paired devices
/usr/local/bin/bluetooth-control.sh devices

# Restart Bluetooth service
/usr/local/bin/bluetooth-control.sh restart
```

### Troubleshooting
```bash
# Check setup logs
tail -f /var/log/bluetooth-setup.log

# Check PulseAudio status
pactl info

# Check Bluetooth status
systemctl status bluetooth

# Manual PulseAudio restart
pulseaudio --kill && pulseaudio --start
```

## Troubleshooting Guide

### No Audio Output
1. Check cable connections (most common issue!)
2. Run: `sudo /usr/local/bin/fix-audio-balance.sh`
3. Test with: `speaker-test -t wav -c 2`
4. Check volume: `alsamixer`

### Bluetooth Connection Issues
1. Make device discoverable: `/usr/local/bin/bluetooth-control.sh discoverable`
2. Restart Bluetooth: `/usr/local/bin/bluetooth-control.sh restart`
3. Check status: `/usr/local/bin/bluetooth-control.sh status`

### Audio Balance Problems
1. Run the balance fix: `sudo /usr/local/bin/fix-audio-balance.sh`
2. Check physical connections
3. Test individual channels with `speaker-test`

### Service Issues
1. Check logs: `tail -f /var/log/bluetooth-setup.log`
2. Re-run setup: `sudo ./setup-bluetooth-speaker.sh`
3. Manual service restart: `sudo systemctl restart bluetooth`

## Advanced Usage

### Configuration Backup/Restore
- Backups are automatically created in `/var/backups/bluetooth-setup/`
- Each run creates a timestamped backup
- Restore manually if needed: `sudo cp /var/backups/bluetooth-setup/backup_*/file /etc/`

### Custom Device Name
Edit the script and change:
```bash
DEVICE_NAME="YourCustomName"
```

### Integration with Sunrise Alarm
This setup prepares the system for the advanced media controller setup:
```bash
# After running this script, you can add media control features
sudo ./setup_bluetooth_media_controller.sh
```

## File Structure

```
bluetooth-setup/
├── setup-bluetooth-speaker.sh    # Master setup script
├── README.md                      # This documentation
└── [future expansion files]
```

## System Requirements

- Raspberry Pi (any model with Bluetooth)
- Raspberry Pi OS (Bullseye/Bookworm recommended)
- Root access (sudo)
- Internet connection for package installation

## Compatibility

- ✅ Raspberry Pi 4/5 (recommended)
- ✅ Raspberry Pi 3B+ 
- ✅ Raspberry Pi Zero 2W
- ✅ Other ARM devices with Bluetooth
- ✅ Raspberry Pi OS Bookworm/Bullseye
- ✅ Ubuntu on Raspberry Pi

## Security Notes

- Script requires root access for system configuration
- Bluetooth device is discoverable by default
- No PIN required for pairing (configurable)
- All configuration files have appropriate permissions

## Support

If you encounter issues:
1. Check the troubleshooting guide above
2. Review the setup logs: `/var/log/bluetooth-setup.log`
3. Re-run the setup script (it's idempotent)
4. Check hardware connections