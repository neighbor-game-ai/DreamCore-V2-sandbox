#!/bin/bash
#
# Deploy API Proxy to GCE
#
# Prerequisites:
#   1. DNS: api-proxy.dreamcore.gg -> 35.200.79.157
#   2. Modal Team Plan + Proxy static IP
#
# Usage:
#   # From local machine:
#   scp -r deploy/api-proxy notef@35.200.79.157:/home/notef/
#
#   # On GCE:
#   cd /home/notef/api-proxy
#   ./deploy-gce.sh

set -e

echo "=== API Proxy Deployment ==="

# Check if running on GCE
if [[ ! -f /etc/os-release ]]; then
    echo "Error: This script should be run on GCE, not locally"
    echo "Use: scp -r deploy/api-proxy notef@35.200.79.157:/home/notef/"
    exit 1
fi

# Create .env if not exists
if [[ ! -f .env ]]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Edit .env and configure:"
    echo "  - ANTHROPIC_API_KEY"
    echo "  - GEMINI_API_KEY"
    echo "  - PROXY_INTERNAL_SECRET (run: openssl rand -hex 32)"
    echo ""
    read -p "Press Enter after editing .env..."
fi

# Validate .env
source .env
if [[ -z "$ANTHROPIC_API_KEY" || "$ANTHROPIC_API_KEY" == "sk-ant-xxx" ]]; then
    echo "Error: ANTHROPIC_API_KEY not configured in .env"
    exit 1
fi
if [[ -z "$GEMINI_API_KEY" || "$GEMINI_API_KEY" == "xxx" ]]; then
    echo "Error: GEMINI_API_KEY not configured in .env"
    exit 1
fi
if [[ -z "$PROXY_INTERNAL_SECRET" ]]; then
    echo "Error: PROXY_INTERNAL_SECRET not configured in .env"
    echo "Generate with: openssl rand -hex 32"
    exit 1
fi

echo "Environment validated."

# Install dependencies
echo "Installing npm dependencies..."
npm install

# Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    sudo apt update
    sudo apt install -y nginx
fi

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    sudo apt install -y certbot python3-certbot-nginx
fi

# Copy Nginx config
echo "Configuring Nginx..."
sudo cp nginx-api-proxy.conf /etc/nginx/sites-available/api-proxy

# Check if Modal IP is configured
if grep -q "<MODAL_PROXY_STATIC_IP>" /etc/nginx/sites-available/api-proxy; then
    echo ""
    echo "IMPORTANT: Update Nginx config with Modal Proxy IP"
    echo "Edit /etc/nginx/sites-available/api-proxy and replace <MODAL_PROXY_STATIC_IP>"
    echo ""
    read -p "Press Enter after updating..."
fi

# Enable site
if [[ ! -L /etc/nginx/sites-enabled/api-proxy ]]; then
    sudo ln -s /etc/nginx/sites-available/api-proxy /etc/nginx/sites-enabled/
fi

# Get SSL certificate
if [[ ! -f /etc/letsencrypt/live/api-proxy.dreamcore.gg/fullchain.pem ]]; then
    echo "Obtaining Let's Encrypt certificate..."
    # Temporarily disable the server block that requires the cert
    sudo rm -f /etc/nginx/sites-enabled/api-proxy
    sudo certbot certonly --nginx -d api-proxy.dreamcore.gg
    sudo ln -s /etc/nginx/sites-available/api-proxy /etc/nginx/sites-enabled/
fi

# Test Nginx config
echo "Testing Nginx configuration..."
sudo nginx -t

# Reload Nginx
echo "Reloading Nginx..."
sudo nginx -s reload

# Start/restart with PM2
if command -v pm2 &> /dev/null; then
    echo "Starting API Proxy with PM2..."
    pm2 delete api-proxy 2>/dev/null || true
    pm2 start server.js --name api-proxy
    pm2 save
else
    echo "Warning: PM2 not installed. Install with: npm install -g pm2"
    echo "Then run: pm2 start server.js --name api-proxy && pm2 save"
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Test locally:"
echo "  curl http://127.0.0.1:3100/health"
echo ""
echo "Test externally (from Modal IP only):"
echo "  curl https://api-proxy.dreamcore.gg/health"
echo ""
echo "Next steps:"
echo "  1. Create Modal Secret 'api-proxy-config' with:"
echo "     ANTHROPIC_BASE_URL=https://api-proxy.dreamcore.gg/a/$PROXY_INTERNAL_SECRET"
echo "     GEMINI_BASE_URL=https://api-proxy.dreamcore.gg/g/$PROXY_INTERNAL_SECRET"
echo "     PROXY_INTERNAL_SECRET=$PROXY_INTERNAL_SECRET"
echo ""
echo "  2. Update Modal app.py to use the new secret"
echo "  3. Run: modal deploy modal/app.py"
