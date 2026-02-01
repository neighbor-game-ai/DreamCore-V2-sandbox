#!/bin/bash
#
# DreamCore Modal Setup Script
#
# Creates required secrets and volumes for the Modal backend.
#
# Usage:
#   ./setup.sh
#
# Prerequisites:
#   - Modal CLI installed: pip install modal
#   - Modal authenticated: modal token new
#   - ANTHROPIC_API_KEY environment variable set
#

set -e

echo "========================================"
echo "DreamCore Modal Setup"
echo "========================================"
echo

# Check prerequisites
if ! command -v modal &> /dev/null; then
    echo "ERROR: Modal CLI not found"
    echo "       Install with: pip install modal"
    exit 1
fi

# Check for Anthropic API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Enter your Anthropic API key (sk-ant-...):"
    read -s ANTHROPIC_API_KEY
    echo
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "ERROR: ANTHROPIC_API_KEY is required"
    exit 1
fi

# Generate internal secret
MODAL_INTERNAL_SECRET=$(openssl rand -hex 32)

echo "Creating secrets..."
echo

# Create Anthropic secret
echo "  Creating anthropic-api-key secret..."
modal secret create anthropic-api-key "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" 2>/dev/null || \
    echo "  (already exists, skipping)"

# Create internal secret
echo "  Creating modal-internal-secret..."
modal secret create modal-internal-secret "MODAL_INTERNAL_SECRET=$MODAL_INTERNAL_SECRET" 2>/dev/null || {
    echo "  (already exists, generating new value)"
    modal secret delete modal-internal-secret 2>/dev/null || true
    modal secret create modal-internal-secret "MODAL_INTERNAL_SECRET=$MODAL_INTERNAL_SECRET"
}

echo
echo "Creating volumes..."
echo

# Create volumes
echo "  Creating dreamcore-data volume..."
modal volume create dreamcore-data 2>/dev/null || echo "  (already exists)"

echo "  Creating dreamcore-global volume..."
modal volume create dreamcore-global 2>/dev/null || echo "  (already exists)"

echo
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo
echo "Internal Secret (save this!):"
echo "  $MODAL_INTERNAL_SECRET"
echo
echo "Next steps:"
echo "  1. Deploy the app:"
echo "     modal deploy app.py"
echo
echo "  2. Get your endpoint URL from the deploy output"
echo
echo "  3. Run PoC tests:"
echo "     export MODAL_ENDPOINT='https://your-workspace--dreamcore-generate-game.modal.run'"
echo "     export MODAL_INTERNAL_SECRET='$MODAL_INTERNAL_SECRET'"
echo "     python tests/run_all.py"
echo
