#!/bin/bash
#
# Modal Warmup Script
#
# Purpose: Keep Modal function containers warm to reduce cold start latency.
# Note: This only warms the function container, not the gVisor sandbox.
#
# Usage: Run via cron every 5 minutes
#   */5 * * * * /home/notef/bin/modal-warmup.sh
#
# Requirements:
#   - MODAL_INTERNAL_SECRET in /home/notef/DreamCore-V2-sandbox/.env
#   - Warmup project created in DreamCore (name: __warmup__)
#

set -e

# Load environment variables
ENV_FILE="/home/notef/DreamCore-V2-sandbox/.env"
if [ -f "$ENV_FILE" ]; then
  # Extract MODAL_INTERNAL_SECRET from .env
  MODAL_INTERNAL_SECRET=$(grep "^MODAL_INTERNAL_SECRET=" "$ENV_FILE" | cut -d'=' -f2-)
fi

if [ -z "$MODAL_INTERNAL_SECRET" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: MODAL_INTERNAL_SECRET not found" >> /home/notef/logs/modal-warmup.log
  exit 1
fi

# Warmup project (dedicated project created in DreamCore)
# Using real user UUID to avoid validation issues with all-zero UUIDs
WARMUP_USER_ID="ed58dfd0-03c8-4617-ae86-f28df6f562ff"
WARMUP_PROJECT_ID="__REPLACE_WITH_WARMUP_PROJECT_ID__"

# Modal list_files endpoint
ENDPOINT="https://notef-neighbor--dreamcore-list-files.modal.run"

# Execute warmup request
# Expected responses: 200 (success), 404 (project not found) - both are valid
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "${ENDPOINT}?user_id=${WARMUP_USER_ID}&project_id=${WARMUP_PROJECT_ID}" \
  -H "X-Modal-Secret: ${MODAL_INTERNAL_SECRET}")

# Log only on unexpected failure (not 200/404)
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "404" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') Modal warmup failed: HTTP $HTTP_CODE" >> /home/notef/logs/modal-warmup.log
fi
