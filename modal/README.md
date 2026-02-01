# DreamCore Modal Backend

Sandbox execution for AI game generation with Claude CLI.

> **Note**: This is the canonical Modal code location. Always deploy from here, not from `DreamCore-V2-modal/` (deprecated).

## Prerequisites

1. **Modal Account**: Sign up at https://modal.com
2. **Modal CLI**: Install with `pip install modal`
3. **Anthropic API Key**: Required for Claude CLI

## Quick Start

```bash
# 1. Authenticate with Modal
modal token new

# 2. Run setup script
./setup.sh

# 3. Deploy app
modal deploy app.py

# 4. Run PoC tests
export MODAL_ENDPOINT="https://your-workspace--dreamcore"
export MODAL_INTERNAL_SECRET="your-secret-from-setup"
export ALLOW_NON_GVISOR=1  # Optional: skip gVisor check
python tests/run_all.py
```

## File Structure

```
modal/
├── app.py              # All-in-one: App, endpoints, sandbox execution
├── README.md           # This file
├── requirements.txt    # Python dependencies
├── setup.sh            # Automated setup script
└── tests/
    ├── conftest.py         # Pytest fixtures
    ├── helpers.py          # Test utilities
    ├── run_all.py          # Full test runner
    ├── test_auth.py        # Gate #5: Authentication
    ├── test_gvisor.py      # Gate #2: Sandbox isolation
    ├── test_sandbox_io.py  # Gate #1: Command execution
    ├── test_stream.py      # Gate #3: SSE streaming
    └── test_volume.py      # Gate #4: Volume persistence
```

## app.py Structure

All code is consolidated in `app.py` due to Modal's requirement that functions be defined at global scope:

| Section | Contents |
|---------|----------|
| Settings | App name, timeouts, secret/volume names |
| Security | `validate_uuid()`, `verify_internal_auth()` |
| App/Resources | Modal App, Secrets, Volumes, Images |
| Sandbox | `run_in_sandbox()` async generator |
| Endpoints | All web endpoints (generate_game, tests, health) |

## Environment Variables

### Required for Tests

| Variable | Description |
|----------|-------------|
| `MODAL_ENDPOINT` | Base URL (e.g., `https://notef-neighbor--dreamcore`) |
| `MODAL_INTERNAL_SECRET` | Shared secret for X-Modal-Secret header |

### Optional

| Variable | Description |
|----------|-------------|
| `ALLOW_NON_GVISOR` | Set to `1` to pass isolation test even if gVisor not detected (**暫定**: Modal公式回答待ち) |

## Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Health check |
| `/generate_game` | POST | X-Modal-Secret | Game generation |
| `/test_sandbox_io` | POST | X-Modal-Secret | PoC: Command execution |
| `/test_gvisor` | POST | X-Modal-Secret | PoC: Isolation check |
| `/test_stream` | POST | X-Modal-Secret | PoC: SSE streaming |
| `/test_volume` | POST | X-Modal-Secret | PoC: Volume persistence |
| `/test_auth` | POST | X-Modal-Secret | PoC: Auth verification |

## PoC Gates

| Gate | Test | Pass Condition |
|------|------|----------------|
| #1 | Sandbox I/O | Command output matches expected |
| #2 | Isolation | gVisor detected OR `ALLOW_NON_GVISOR=1` |
| #3 | Streaming | 5+ chunks received at ~1s intervals |
| #4 | Volume | Write/read match |
| #5 | Auth | 401 without secret, 200 with secret |

## Testing

### Run All Tests

```bash
export MODAL_ENDPOINT="https://your-workspace--dreamcore"
export MODAL_INTERNAL_SECRET="your-secret"
export ALLOW_NON_GVISOR=1

python tests/run_all.py
```

### Run with Pytest

```bash
pip install pytest pytest-asyncio httpx
pytest tests/ -v
```

## Security

| Threat | Mitigation |
|--------|------------|
| API Key Exposure | Modal Secrets → Sandbox env vars |
| Unauthorized Access | JWT (Next.js) + X-Modal-Secret (Modal) |
| Path Traversal | UUID validation in `app.py` |
| Sandbox Escape | Modal Sandbox isolation |
| Global Asset Tampering | `volume.read_only()` mount |

## Local Development

```bash
# Run locally with hot reload
modal serve app.py
```

## Setup Details

### Create Secrets

```bash
modal secret create anthropic-api-key ANTHROPIC_API_KEY=sk-ant-...
modal secret create modal-internal-secret MODAL_INTERNAL_SECRET=$(openssl rand -hex 32)
```

### Create Volumes

```bash
modal volume create dreamcore-data
modal volume create dreamcore-global
```

### Deploy

```bash
modal deploy app.py
```
