#!/bin/bash
# Deploy GameCreator with Docker
# Usage: ./scripts/deploy-docker.sh

set -e

echo "=== GameCreator Docker Deploy ==="

# Pull latest code
echo "Pulling latest code..."
git pull origin main

# Build and start with docker-compose
echo "Building and starting containers..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Show status
echo ""
echo "=== Deployment Complete ==="
docker-compose ps

echo ""
echo "Logs: docker-compose logs -f"
echo "Stop: docker-compose down"
