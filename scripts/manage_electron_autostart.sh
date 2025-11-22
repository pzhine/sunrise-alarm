#!/bin/bash

# Script to manage Electron app autostart in LXDE startup configuration
# Usage: ./manage_electron_autostart.sh [enable-dev|disable-dev]
# This script is idempotent and can be run multiple times safely.

# Derive project root from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ELECTRON_DIR="$PROJECT_ROOT/electron"

# LXDE autostart configuration
AUTOSTART_FILE="/etc/xdg/lxsession/LXDE-pi/autostart"
AUTOSTART_COMMENT="# Sunrise Alarm Electron App"
AUTOSTART_SCRIPT="/usr/local/bin/sunrise-alarm-dev.sh"
AUTOSTART_ENTRY="@sudo $AUTOSTART_SCRIPT"

# Function to show usage
show_usage() {
    echo "Usage: $0 [enable-dev|disable-dev]"
    echo ""
    echo "Commands:"
    echo "  enable-dev   - Add Electron app (dev mode) to startup (default if no command given)"
    echo "  disable-dev  - Remove Electron app from startup"
    echo ""
    echo "Configuration:"
    echo "  Project root: $PROJECT_ROOT"
    echo "  Electron dir: $ELECTRON_DIR"
    echo "  Autostart file: $AUTOSTART_FILE"
    echo "  Log file: /var/log/sunrise-alarm.log"
}

# Function to check if we're running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "Error: This script must be run as root (use sudo)"
        echo "The autostart file $AUTOSTART_FILE requires root access to modify"
        exit 1
    fi
}

# Function to validate directories
validate_directories() {
    if [ ! -d "$PROJECT_ROOT" ]; then
        echo "Error: Project root not found at $PROJECT_ROOT"
        exit 1
    fi
    
    if [ ! -d "$ELECTRON_DIR" ]; then
        echo "Error: Electron directory not found at $ELECTRON_DIR"
        echo "Make sure this script is run from the correct location"
        exit 1
    fi
    
    if [ ! -f "$ELECTRON_DIR/package.json" ]; then
        echo "Error: package.json not found in $ELECTRON_DIR"
        echo "This doesn't appear to be a valid Electron project directory"
        exit 1
    fi
    
    # Check if npm run dev script exists
    if ! grep -q '"dev"' "$ELECTRON_DIR/package.json" 2>/dev/null; then
        echo "Warning: 'dev' script may not be defined in package.json"
        echo "Make sure 'npm run dev' is a valid command in the Electron directory"
    fi
}

# Function to enable autostart
enable_autostart() {
    echo "Enabling Electron app autostart..."
    
    # Get the actual user who ran sudo
    REAL_USER="${SUDO_USER:-$(whoami)}"
    echo "Real user detected: $REAL_USER"
    
    # Create the startup script with logging and permission fixes
    echo "Creating startup script: $AUTOSTART_SCRIPT"
    cat > "$AUTOSTART_SCRIPT" << EOF
#!/bin/bash
# Sunrise Alarm Electron App Startup Script

ACTUAL_USER="$REAL_USER"
LOG_FILE="/home/\$ACTUAL_USER/sunrise-alarm-startup.log"

# Function to log messages
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" | tee -a "\$LOG_FILE"
}

log_message "=== Sunrise Alarm startup script started ==="
log_message "Current user: \$(whoami)"
log_message "Current directory: \$(pwd)"
log_message "PATH: \$PATH"

# Change to electron directory
ELECTRON_DIR="$ELECTRON_DIR"
log_message "Changing to directory: \$ELECTRON_DIR"

if [ ! -d "\$ELECTRON_DIR" ]; then
    log_message "ERROR: Electron directory not found: \$ELECTRON_DIR"
    read -p "Press Enter to close..."
    exit 1
fi

cd "\$ELECTRON_DIR" || {
    log_message "ERROR: Failed to change to \$ELECTRON_DIR"
    read -p "Press Enter to close..."
    exit 1
}

log_message "Successfully changed to: \$(pwd)"

log_message "Using user: \$ACTUAL_USER"

# Fix permissions if needed
log_message "Fixing file permissions..."
if chown -R "\$ACTUAL_USER:\$ACTUAL_USER" . 2>>"\$LOG_FILE"; then
    log_message "✓ Fixed file ownership to \$ACTUAL_USER"
else
    log_message "⚠ Could not fix file ownership (may not be needed)"
fi

# Clean build directory
log_message "Cleaning build directory..."
if rm -rf dist-electron 2>>"\$LOG_FILE"; then
    log_message "✓ Cleaned dist-electron directory"
else
    log_message "⚠ Could not clean dist-electron (may not exist)"
fi

# Check for package.json
if [ ! -f "package.json" ]; then
    log_message "ERROR: package.json not found in \$(pwd)"
    read -p "Press Enter to close..."
    exit 1
fi

log_message "✓ Found package.json"

# Check if dev script exists
if ! grep -q '"dev"' package.json; then
    log_message "ERROR: 'dev' script not found in package.json"
    read -p "Press Enter to close..."
    exit 1
fi

log_message "✓ Found 'dev' script in package.json"

# Load user environment using detected user
USER_HOME="/home/\$ACTUAL_USER"
if [ -f "\$USER_HOME/.bashrc" ]; then
    log_message "Loading \$USER_HOME/.bashrc..."
    source "\$USER_HOME/.bashrc" 2>>"\$LOG_FILE"
fi

if [ -f "\$USER_HOME/.profile" ]; then
    log_message "Loading \$USER_HOME/.profile..."
    source "\$USER_HOME/.profile" 2>>"\$LOG_FILE"
fi

# Load NVM if available
if [ -s "\$USER_HOME/.nvm/nvm.sh" ]; then
    log_message "Loading NVM from \$USER_HOME..."
    source "\$USER_HOME/.nvm/nvm.sh" 2>>"\$LOG_FILE"
fi

# Find npm
NPM_CMD=\$(which npm 2>/dev/null)
if [ -z "\$NPM_CMD" ]; then
    for npm_path in "/usr/bin/npm" "/usr/local/bin/npm" "\$USER_HOME/.nvm/versions/node/*/bin/npm"; do
        if [ -x "\$npm_path" ]; then
            NPM_CMD="\$npm_path"
            break
        fi
    done
fi

if [ -z "\$NPM_CMD" ]; then
    log_message "ERROR: npm command not found"
    log_message "PATH: \$PATH"
    read -p "Press Enter to close..."
    exit 1
fi

log_message "✓ Using npm at: \$NPM_CMD"

# Start the development server as the detected user
log_message "Starting Electron app with: sudo -u \$ACTUAL_USER \$NPM_CMD run dev"
log_message "=========================================="

# Run npm dev as the actual user and keep terminal open
sudo -u "\$ACTUAL_USER" bash -c "cd '\$ELECTRON_DIR' && \$NPM_CMD run dev" 2>&1 | tee -a "\$LOG_FILE"

# Keep terminal open after exit
echo ""
log_message "Electron app has stopped"
read -p "Press Enter to close terminal..."
EOF

    chmod +x "$AUTOSTART_SCRIPT"
    echo "✓ Created startup script: $AUTOSTART_SCRIPT"
    
    # Create autostart file if it doesn't exist
    if [ ! -f "$AUTOSTART_FILE" ]; then
        echo "Creating autostart file: $AUTOSTART_FILE"
        mkdir -p "$(dirname "$AUTOSTART_FILE")"
        touch "$AUTOSTART_FILE"
    fi
    
    # Check if entry already exists
    if grep -q "sunrise-alarm\|$AUTOSTART_SCRIPT" "$AUTOSTART_FILE" 2>/dev/null; then
        echo "✓ Electron app autostart entry already exists"
        echo "Current entry:"
        grep -A1 -B1 "sunrise-alarm\|$AUTOSTART_SCRIPT" "$AUTOSTART_FILE" 2>/dev/null || true
        return 0
    fi
    
    # Add the autostart entry
    echo "" >> "$AUTOSTART_FILE"
    echo "$AUTOSTART_COMMENT" >> "$AUTOSTART_FILE"
    echo "$AUTOSTART_ENTRY" >> "$AUTOSTART_FILE"
    
    echo "✓ Added Electron app to LXDE autostart"
    echo "✓ App will start automatically in lxterminal on next boot"
    echo ""
    echo "Configuration added:"
    echo "  Comment: $AUTOSTART_COMMENT"
    echo "  Command: $AUTOSTART_ENTRY"
    echo ""
    echo "Debug information:"
    echo "  Autostart file: $AUTOSTART_FILE"
    echo "  View autostart: cat $AUTOSTART_FILE"
    echo "  Test manually: sudo $AUTOSTART_SCRIPT" 
    echo "  View logs: tail -f /home/$REAL_USER/sunrise-alarm-startup.log"
}

# Function to disable autostart
disable_autostart() {
    echo "Disabling Electron app autostart..."
    
    if [ ! -f "$AUTOSTART_FILE" ]; then
        echo "✓ No autostart file found - nothing to disable"
        return 0
    fi
    
    # Check if entry exists
    if ! grep -q "sunrise-alarm\|$AUTOSTART_SCRIPT" "$AUTOSTART_FILE" 2>/dev/null; then
        echo "✓ No Electron app autostart entry found - already disabled"
        return 0
    fi
    
    # Remove the startup script
    if [ -f "$AUTOSTART_SCRIPT" ]; then
        rm "$AUTOSTART_SCRIPT"
        echo "✓ Removed startup script: $AUTOSTART_SCRIPT"
    fi
    
    # Remove the entry and comment
    grep -v "sunrise-alarm\|$AUTOSTART_SCRIPT" "$AUTOSTART_FILE" > "${AUTOSTART_FILE}.tmp"
    mv "${AUTOSTART_FILE}.tmp" "$AUTOSTART_FILE"
    
    # Remove empty lines at the end
    sed -i '/^$/N;/^\n$/d' "$AUTOSTART_FILE" 2>/dev/null || true
    
    echo "✓ Removed Electron app from LXDE autostart"
    echo "✓ App will no longer start automatically on boot"
    echo ""
    echo "Debug information:"
    echo "  Autostart file: $AUTOSTART_FILE"
    echo "  View autostart: cat $AUTOSTART_FILE"
}

# Function to show current status
show_status() {
    echo "Current autostart status:"
    echo "Project root: $PROJECT_ROOT"
    echo "Electron dir: $ELECTRON_DIR"
    echo ""
    
    if [ ! -f "$AUTOSTART_FILE" ]; then
        echo "Status: DISABLED (no autostart file)"
        return 0
    fi
    
    if grep -q "sunrise-alarm\|$AUTOSTART_SCRIPT" "$AUTOSTART_FILE" 2>/dev/null; then
        echo "Status: ENABLED"
        echo ""
        echo "Current autostart entries:"
        grep -A1 -B1 "sunrise-alarm\|$AUTOSTART_SCRIPT" "$AUTOSTART_FILE" 2>/dev/null || true
    else
        echo "Status: DISABLED"
    fi
}

# Main script logic
main() {
    local command="${1:-enable-dev}"
    
    case "$command" in
        "enable-dev")
            check_root
            validate_directories
            enable_autostart
            ;;
        "disable-dev")
            check_root
            disable_autostart
            ;;
        "status")
            validate_directories
            show_status
            ;;
        "-h"|"--help"|"help")
            show_usage
            ;;
        *)
            echo "Error: Unknown command '$command'"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"