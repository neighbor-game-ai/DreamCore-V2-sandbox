# Modal Sandbox Architecture (Modal‑only Knowledge)

This document captures **Modal‑specific architecture knowledge** to help integrate DreamCore‑V2
with Modal Sandbox. It avoids product‑specific UX details by design.

---

## 1. Goals (Modal‑side)
- Strong user isolation per project/session (sandbox boundary)
- Controlled I/O via volumes and explicitly allowed endpoints
- Streamed responses (SSE) with backpressure safety
- Secrets handled in Modal, not exposed to browser

---

## 2. Reference Architecture (Modal‑centric)

```
Browser
  ↓
Next.js API (auth + request shaping + SSE proxy)
  ↓
Modal web endpoint(s)
  ↓
Modal Sandbox (Claude CLI / Python / Git / file ops)
  ↓
Modal Volume (project workspace)
  ↓
External services (DB/Storage/Observability)
```

**Key idea:** Next.js acts as the control plane; Modal executes isolated workloads.

---

## 3. Isolation Model
- **Sandbox boundary:** each request runs in a sandboxed process context
- **Volume scoping:** map project‑specific paths; avoid shared writeable paths
- **Path validation:** strict user_id/project_id validation to prevent traversal
- **Secrets:** injected via Modal Secrets; never sent from browser

---

## 4. Volume Strategy
- **Project workspace volume:**
  - `/projects/{user_id}/{project_id}/...`
  - scoped to one user/project
- **Global volume (optional, read‑only):**
  - shared scripts/skills/config
- **Commit policy:** explicit `volume.commit()` after writes

---

## 5. Endpoints & Contracts
- Keep endpoint count minimal; consolidate behaviors behind **internal routes**
- Use a **single generate endpoint** and reuse internal helpers
- Prefer **SSE streaming** for long‑running jobs

SSE event patterns (example):
- `status` — progress updates
- `stream` — raw output chunk
- `done` — completion
- `error` — fail fast

(Exact event schema should align with the product contract managed in Next.js.)

---

## 6. Sandbox Execution Patterns
- Claude CLI: run via `sandbox.exec()` (stdin → stdout streaming)
- Python scripts: run via `subprocess` or `sandbox.exec()`
- Git: run inside volume‑mounted workspace

Recommendations:
- Prefer **non‑root** execution where required by CLI tools
- Keep **timeouts** explicit (sandbox + per‑process)
- Always `terminate()` sandbox on completion or error

---

## 7. Security
- Internal auth: shared secret header (e.g. `X-Modal-Secret`)
- Validate all input (UUID format, path constraints)
- Avoid returning raw errors to the browser; sanitize

---

## 8. Observability
- Emit structured `status` updates in SSE
- Log sandbox start/end/exit_code/elapsed
- Track cold‑start impact and failure modes

---

## 9. Common Failure Modes
- **SSE buffering** → ensure `Content-Type: text/event-stream` and no cache
- **Invalid JSON from LLM** → fail fast and fall back (handled at control plane)
- **Volume writes not persisted** → missing `commit()`
- **Timeout mismatches** → align sandbox timeout with upstream API limits

---

## 10. Checklist (Modal‑side)
- [ ] Secrets configured in Modal
- [ ] Volumes created + mounted correctly
- [ ] Path validation enforced
- [ ] SSE streaming validated end‑to‑end
- [ ] Sandbox termination on all paths
- [ ] Cold‑start behavior acceptable

---

## 11. What Modal should NOT know
- UI/UX decisions
- Product routing details
- Business logic outside execution sandbox

Keep Modal focused on secure execution and file operations.
