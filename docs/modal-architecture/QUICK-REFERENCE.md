# Modal Sandbox — Quick Reference

This is a Modal‑only operational cheat sheet. It intentionally omits product details.

---

## Common Commands

```bash
# Authenticate
modal token new

# Create volumes
modal volume create <volume-name>

# Create secrets
modal secret create <secret-name> KEY=value

# Deploy
modal deploy path/to/app.py

# Logs
modal app logs <app-name>
```

---

## Runtime Checks

- **SSE headers**
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`

- **Sandbox lifecycle**
  - created → exec → terminate

- **Volume persistence**
  - ensure `volume.commit()` after writes

---

## Debug Signals (SSE)
- `status` — progress messages
- `stream` — raw output chunk
- `done` — completion
- `error` — failure (include minimal reason)

---

## Safety Rules (Modal‑side)
- Validate all user/project ids (UUID only)
- Do not trust request paths
- Never pass secrets from browser; only Modal Secrets
- Keep sandbox timeouts explicit

---

## Known Pitfalls
- Missing `commit()` → files not persisted
- `event-stream` buffering by proxy → no incremental updates
- Long‑running jobs without keep‑alive → upstream timeouts
- CLI runs as root when tool requires non‑root
