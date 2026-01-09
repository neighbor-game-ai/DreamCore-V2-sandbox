#!/bin/bash
# GameCreatorMVP GCE Setup Script
# Run this on a fresh Ubuntu 22.04 VM

set -e

echo "=== GameCreatorMVP GCE Setup ==="

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build essentials (for better-sqlite3)
sudo apt install -y build-essential python3

# Install Git
sudo apt install -y git

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Create app directory
sudo mkdir -p /opt/gamecreator
sudo chown $USER:$USER /opt/gamecreator

echo ""
echo "=== Base setup complete ==="
echo ""
echo "Next steps:"
echo "1. Clone your repo: cd /opt/gamecreator && git clone <your-repo-url> ."
echo "2. Install dependencies: npm install"
echo "3. Create .env file with your API keys"
echo "4. Configure Nginx (see nginx.conf template)"
echo "5. Start with PM2: pm2 start server/index.js --name gamecreator"
echo "6. Setup SSL: sudo certbot --nginx -d yourdomain.com"
echo ""
