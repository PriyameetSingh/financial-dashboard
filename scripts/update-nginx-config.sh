#!/bin/bash

# Script to update nginx configuration for large file uploads
# This script should be run on the server hosting nginx

echo "=== Nginx Configuration Update for Large File Uploads ==="

# Backup current nginx configuration
NGINX_SITES_DIR="/etc/nginx/sites-available"
NGINX_CONF_FILE="/etc/nginx/sites-available/product.airawat.org"
BACKUP_DIR="/tmp/nginx-backup-$(date +%Y%m%d-%H%M%S)"

if [ -f "$NGINX_CONF_FILE" ]; then
    echo "Creating backup of current nginx configuration..."
    mkdir -p "$BACKUP_DIR"
    cp "$NGINX_CONF_FILE" "$BACKUP_DIR/"
    echo "Backup created at: $BACKUP_DIR"
else
    echo "Warning: nginx config file not found at $NGINX_CONF_FILE"
    echo "Please check your nginx configuration location"
fi

# Check if the hudd-dashboard location block exists and has client_max_body_size
echo "Checking current nginx configuration..."

if [ -f "$NGINX_CONF_FILE" ]; then
    if grep -q "client_max_body_size" "$NGINX_CONF_FILE"; then
        echo "✓ client_max_body_size directive found"
        grep -n "client_max_body_size" "$NGINX_CONF_FILE"
    else
        echo "⚠ client_max_body_size directive not found in hudd-dashboard location block"
        echo "Please ensure the following is added to your nginx config:"
        echo ""
        echo "location /hudd-dashboard {"
        echo "    proxy_pass          http://13.203.18.97:8765;"
        echo "    proxy_http_version  1.1;"
        echo "    client_max_body_size 50M;"
        echo "    # ... other proxy settings"
        echo "}"
    fi
fi

# Test nginx configuration
echo ""
echo "Testing nginx configuration..."
if command -v nginx >/dev/null 2>&1; then
    if nginx -t; then
        echo "✓ nginx configuration test passed"
        echo ""
        echo "To apply the configuration changes, run:"
        echo "sudo systemctl reload nginx"
        echo "or"
        echo "sudo service nginx reload"
    else
        echo "✗ nginx configuration test failed"
        echo "Please fix the configuration before reloading"
    fi
else
    echo "nginx command not found - please check your installation"
fi

echo ""
echo "=== Configuration Update Complete ==="
