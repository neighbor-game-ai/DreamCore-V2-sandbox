#!/bin/bash
# E2E test for generate flow through Next.js API
# Tests: Intent detection -> Skill selection -> Modal call -> SSE response

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f "$(dirname "$0")/../../next/.env.local" ]; then
    export $(grep -v '^#' "$(dirname "$0")/../../next/.env.local" | xargs)
fi

# Configuration
VERCEL_API="${VERCEL_API:-https://next-tau-rust.vercel.app/api}"
TEST_PROJECT_ID="${TEST_PROJECT_ID:-}"
TEST_ACCESS_TOKEN="${TEST_ACCESS_TOKEN:-}"

echo "======================================"
echo "DreamCore E2E Generate Test"
echo "======================================"
echo ""

# Check required environment variables
if [ -z "$TEST_ACCESS_TOKEN" ]; then
    echo -e "${YELLOW}[SKIP]${NC} TEST_ACCESS_TOKEN not set"
    echo "To run this test, set:"
    echo "  export TEST_ACCESS_TOKEN=<your-supabase-access-token>"
    echo "  export TEST_PROJECT_ID=<your-project-uuid>"
    exit 0
fi

if [ -z "$TEST_PROJECT_ID" ]; then
    echo -e "${YELLOW}[SKIP]${NC} TEST_PROJECT_ID not set"
    exit 0
fi

echo "API: $VERCEL_API"
echo "Project: $TEST_PROJECT_ID"
echo ""

# Test 1: Simple 2D game generation
echo "======================================"
echo "Test 1: 2D Game Generation"
echo "======================================"

response=$(curl -s -w "\n%{http_code}" -X POST "$VERCEL_API/generate" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_ACCESS_TOKEN" \
    -d '{
        "projectId": "'"$TEST_PROJECT_ID"'",
        "message": "赤い四角を矢印キーで動かすゲームを作って"
    }' 2>&1)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}[PASS]${NC} HTTP 200 received"

    # Check for SSE events
    if echo "$body" | grep -q "data:"; then
        echo -e "${GREEN}[PASS]${NC} SSE events received"

        # Count event types
        status_count=$(echo "$body" | grep -c '"type":"status"' || echo 0)
        stream_count=$(echo "$body" | grep -c '"type":"assistant"' || echo 0)
        done_count=$(echo "$body" | grep -c '"type":"done"' || echo 0)

        echo "  Status events: $status_count"
        echo "  Stream events: $stream_count"
        echo "  Done events: $done_count"
    else
        echo -e "${RED}[FAIL]${NC} No SSE events in response"
        echo "$body" | head -20
    fi
else
    echo -e "${RED}[FAIL]${NC} HTTP $http_code"
    echo "$body" | head -10
fi

echo ""

# Test 2: Chat intent (should not generate code)
echo "======================================"
echo "Test 2: Chat Intent Detection"
echo "======================================"

response=$(curl -s -w "\n%{http_code}" -X POST "$VERCEL_API/generate" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_ACCESS_TOKEN" \
    -d '{
        "projectId": "'"$TEST_PROJECT_ID"'",
        "message": "このゲームはどうやって動いていますか？"
    }' 2>&1)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}[PASS]${NC} HTTP 200 received"

    # Chat should return quickly with a chat response
    if echo "$body" | grep -q '"mode":"chat"'; then
        echo -e "${GREEN}[PASS]${NC} Chat intent detected correctly"
    else
        echo -e "${YELLOW}[INFO]${NC} Response did not indicate chat mode"
    fi
else
    echo -e "${RED}[FAIL]${NC} HTTP $http_code"
fi

echo ""

# Test 3: 3D game keywords
echo "======================================"
echo "Test 3: 3D Dimension Detection"
echo "======================================"

response=$(curl -s -w "\n%{http_code}" -X POST "$VERCEL_API/generate" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_ACCESS_TOKEN" \
    -d '{
        "projectId": "'"$TEST_PROJECT_ID"'",
        "message": "Three.jsで立方体が回転するデモを作って"
    }' 2>&1)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}[PASS]${NC} HTTP 200 received"

    if echo "$body" | grep -q "data:"; then
        echo -e "${GREEN}[PASS]${NC} SSE response for 3D request"
    fi
else
    echo -e "${RED}[FAIL]${NC} HTTP $http_code"
fi

echo ""

# Test 4: Authentication failure
echo "======================================"
echo "Test 4: Authentication Required"
echo "======================================"

response=$(curl -s -w "\n%{http_code}" -X POST "$VERCEL_API/generate" \
    -H "Content-Type: application/json" \
    -d '{
        "projectId": "'"$TEST_PROJECT_ID"'",
        "message": "test"
    }' 2>&1)

http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq 401 ]; then
    echo -e "${GREEN}[PASS]${NC} Unauthorized without token (401)"
else
    echo -e "${RED}[FAIL]${NC} Expected 401, got $http_code"
fi

echo ""

# Test 5: Invalid project ID
echo "======================================"
echo "Test 5: Invalid Project Validation"
echo "======================================"

response=$(curl -s -w "\n%{http_code}" -X POST "$VERCEL_API/generate" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_ACCESS_TOKEN" \
    -d '{
        "projectId": "invalid-not-uuid",
        "message": "test"
    }' 2>&1)

http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq 400 ]; then
    echo -e "${GREEN}[PASS]${NC} Invalid UUID rejected (400)"
else
    echo -e "${RED}[FAIL]${NC} Expected 400, got $http_code"
fi

echo ""
echo "======================================"
echo "E2E Test Complete"
echo "======================================"
