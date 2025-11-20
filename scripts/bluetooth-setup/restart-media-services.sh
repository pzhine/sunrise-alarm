#!/bin/bash

# Restart Media Services Script
# This script restarts the Bluetooth media services to apply updates

echo "Restarting Bluetooth media services..."

# Stop services
sudo systemctl stop media-metadata-monitor.service
sudo systemctl stop bluetooth-media-agent.service

# Wait a moment
sleep 2

# Restart services  
sudo systemctl start bluetooth-media-agent.service
sudo systemctl start media-metadata-monitor.service

# Check status
echo ""
echo "Service Status:"
sudo systemctl is-active bluetooth-media-agent.service
sudo systemctl is-active media-metadata-monitor.service

echo ""
echo "Media services restarted. Try the media control command again:"
echo "sudo /usr/local/bin/media-control.py status"