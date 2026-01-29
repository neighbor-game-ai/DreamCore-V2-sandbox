# API Key Proxy Deployment

This proxy removes API keys from Modal Sandbox by routing requests through GCE.

## Architecture

```
Modal Sandbox (no API keys)
├── Claude CLI → ANTHROPIC_BASE_URL → GCE Proxy → api.anthropic.com
└── Image Gen → GEMINI_BASE_URL → GCE Proxy → googleapis.com
```

## Prerequisites

1. **DNS**: `api-proxy.dreamcore.gg` → `35.200.79.157`
2. **Modal Team Plan**: Required for Proxy feature (static IP)

## Deployment Steps

### Step 1: Deploy GCE Proxy

```bash
# From local machine
scp -r /Users/admin/DreamCore-V2-sandbox/deploy/api-proxy notef@35.200.79.157:/home/notef/

# SSH to GCE
ssh notef@35.200.79.157

# Deploy
cd /home/notef/api-proxy
./deploy-gce.sh
```

### Step 2: Configure Modal Proxy Static IP

1. Go to Modal Dashboard → Settings → Proxies
2. Create a new Proxy
3. Note the static IP (e.g., `203.0.113.10`)

### Step 3: Update Nginx IP Restriction

```bash
ssh notef@35.200.79.157
sudo nano /etc/nginx/sites-available/api-proxy
# Replace <MODAL_PROXY_STATIC_IP> with actual IP
sudo nginx -t && sudo nginx -s reload
```

### Step 4: Create Modal Secret

```bash
# Generate secret
export PROXY_SECRET=$(openssl rand -hex 32)

# Create Modal secret
modal secret create api-proxy-config \
  ANTHROPIC_BASE_URL=https://api-proxy.dreamcore.gg/a/$PROXY_SECRET \
  GEMINI_BASE_URL=https://api-proxy.dreamcore.gg/g/$PROXY_SECRET \
  PROXY_INTERNAL_SECRET=$PROXY_SECRET

# Also update GCE .env with same PROXY_INTERNAL_SECRET
```

### Step 5: Deploy Modal

```bash
cd /Users/admin/DreamCore-V2-modal
modal deploy modal/app.py
```

## Verification

### Test GCE Proxy (local)

```bash
ssh notef@35.200.79.157
SECRET="<your-64-char-secret>"

# Health check
curl http://127.0.0.1:3100/health

# Anthropic test
curl -X POST "http://127.0.0.1:3100/a/$SECRET/v1/messages" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

### Test External Access (from Modal IP only)

```bash
curl -X POST "https://api-proxy.dreamcore.gg/a/$SECRET/v1/messages" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

### Security Verification

In the app, try prompt injection:
- `printenv`
- `echo $ANTHROPIC_API_KEY`
- `env | grep KEY`

Expected: No API keys visible

## Rollback

```bash
cd /Users/admin/DreamCore-V2-modal
git checkout HEAD~1 -- modal/app.py modal/scripts/generate_image.py
modal deploy modal/app.py
```

## Secret Rotation

See `.claude/plans/api-key-proxy.md` for rotation procedure.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Node.js proxy server |
| `package.json` | Dependencies |
| `.env.example` | Environment template |
| `nginx-api-proxy.conf` | Nginx configuration |
| `deploy-gce.sh` | Deployment script |
