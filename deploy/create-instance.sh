#!/bin/bash
# Create GCE instance for GameCreatorMVP
# Requires: gcloud CLI installed and authenticated

# Configuration
INSTANCE_NAME="gamecreator-vm"
ZONE="asia-northeast1-b"  # Tokyo
MACHINE_TYPE="e2-small"   # 2 vCPU, 2GB RAM (~$13/month)
# Use e2-medium for better performance (~$26/month)

echo "Creating GCE instance: $INSTANCE_NAME"

gcloud compute instances create $INSTANCE_NAME \
  --zone=$ZONE \
  --machine-type=$MACHINE_TYPE \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --boot-disk-type=pd-balanced \
  --tags=http-server,https-server \
  --metadata=startup-script='#!/bin/bash
    apt update
    apt install -y git
  '

echo ""
echo "Creating firewall rules..."

# Allow HTTP
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 \
  --target-tags http-server \
  --description "Allow HTTP" \
  2>/dev/null || echo "HTTP rule already exists"

# Allow HTTPS
gcloud compute firewall-rules create allow-https \
  --allow tcp:443 \
  --target-tags https-server \
  --description "Allow HTTPS" \
  2>/dev/null || echo "HTTPS rule already exists"

echo ""
echo "=== Instance created! ==="
echo ""
echo "Connect with:"
echo "  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE"
echo ""
echo "Get external IP:"
echo "  gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIP)'"
echo ""
