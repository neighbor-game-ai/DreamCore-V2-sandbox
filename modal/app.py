"""
DreamCore Modal App

AI-powered browser game creation platform.
Sandbox execution for Claude CLI with isolation.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shlex
import modal
from typing import TYPE_CHECKING, AsyncGenerator

if TYPE_CHECKING:
    from fastapi import Request

# Note: fastapi is available at runtime in web_image, not locally
try:
    from fastapi import Request
except ImportError:
    Request = None  # type: ignore

# =============================================================================
# Settings
# =============================================================================

APP_NAME = "dreamcore"
APP_VERSION = "2.0.1-poc"

# Secret names
SECRET_ANTHROPIC = "anthropic-api-key"  # Legacy (for rollback)
SECRET_INTERNAL = "modal-internal-secret"
SECRET_GEMINI = "gemini-api-key"  # Legacy (for rollback)
SECRET_PROXY = "dreamcore-proxy"
SECRET_API_PROXY = "api-proxy-config"  # New: GCE proxy authentication
# Vertex AI secrets
SECRET_VERTEX_AI = "gcp-vertex-ai"  # GCP service account JSON
SECRET_VERTEX_CONFIG = "vertex-claude-config"  # Vertex AI configuration

# Environment variable names
ENV_ANTHROPIC_API_KEY = "ANTHROPIC_API_KEY"  # Legacy (for rollback)
ENV_INTERNAL_SECRET = "MODAL_INTERNAL_SECRET"
ENV_GEMINI_API_KEY = "GEMINI_API_KEY"  # Legacy (for rollback)
ENV_PROXY_HOST = "PROXY_HOST"
ENV_PROXY_PORT = "PROXY_PORT"
ENV_PROXY_USER = "PROXY_USER"
ENV_PROXY_PASS = "PROXY_PASS"
# New: API Proxy environment variables
ENV_ANTHROPIC_BASE_URL = "ANTHROPIC_BASE_URL"
ENV_GEMINI_BASE_URL = "GEMINI_BASE_URL"
ENV_PROXY_INTERNAL_SECRET = "PROXY_INTERNAL_SECRET"
# Vertex AI environment variables
ENV_VERTEX_PROJECT_ID = "ANTHROPIC_VERTEX_PROJECT_ID"
ENV_VERTEX_REGION = "CLOUD_ML_REGION"
ENV_VERTEX_OPUS_MODEL = "ANTHROPIC_DEFAULT_OPUS_MODEL"
ENV_VERTEX_SONNET_MODEL = "ANTHROPIC_DEFAULT_SONNET_MODEL"
ENV_VERTEX_HAIKU_MODEL = "ANTHROPIC_DEFAULT_HAIKU_MODEL"
ENV_GCP_CREDENTIALS_JSON = "GOOGLE_APPLICATION_CREDENTIALS_JSON"

# Gemini settings (Vertex AI)
GEMINI_MODEL = "gemini-3-pro-preview"  # Vertex AI model name

# Volume names
VOLUME_DATA = "dreamcore-data"
VOLUME_GLOBAL = "dreamcore-global"

# Mount paths
MOUNT_DATA = "/data"
MOUNT_GLOBAL = "/global"

# Sandbox settings
SANDBOX_TIMEOUT = 600
SANDBOX_MEMORY = 2048
SANDBOX_IDLE_TIMEOUT = 20 * 60      # 20分（アイドル時の自動終了）
SANDBOX_MAX_TIMEOUT = 5 * 60 * 60   # 5時間（最大寿命）

# Network allowlist (CIDR ranges for allowed outbound traffic)
# Sandbox can ONLY access the GCE proxy server (Squid handles Google APIs)
SANDBOX_CIDR_ALLOWLIST = [
    "35.200.79.157/32",     # GCE proxy server (dreamcore-v2) - Squid + api-proxy
]


def get_proxy_url() -> str:
    """Build proxy URL from environment variables (injected by Modal Secret).

    The proxy is a GCE Squid proxy with domain filtering.
    Only allows: api.anthropic.com, generativelanguage.googleapis.com, api.replicate.com
    """
    host = os.environ.get(ENV_PROXY_HOST, "")
    port = os.environ.get(ENV_PROXY_PORT, "")
    user = os.environ.get(ENV_PROXY_USER, "")
    password = os.environ.get(ENV_PROXY_PASS, "")
    if not all([host, port, user, password]):
        raise ValueError("Proxy credentials not configured. Check dreamcore-proxy secret.")
    return f"http://{user}:{password}@{host}:{port}"

# SSE settings
SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}
SSE_MEDIA_TYPE = "text/event-stream"

# UUID pattern
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE
)

# =============================================================================
# Error Codes
# =============================================================================

# Claude CLI exit codes → structured error info
CLI_ERROR_CODES = {
    0: {"code": "CLI_SUCCESS", "userMessage": None, "recoverable": False},
    1: {"code": "CLI_GENERAL_ERROR", "userMessage": "生成中にエラーが発生しました", "recoverable": False},
    124: {"code": "CLI_TIMEOUT", "userMessage": "生成に時間がかかりすぎました（5分制限）", "recoverable": True},
    137: {"code": "CLI_KILLED", "userMessage": "生成がキャンセルされました", "recoverable": True},
    143: {"code": "CLI_TERMINATED", "userMessage": "生成が中断されました", "recoverable": True},
}

# API/Sandbox errors (for generate_gemini etc)
API_ERROR_CODES = {
    "NETWORK_ERROR": {"userMessage": "ネットワーク接続に問題があります", "recoverable": True},
    "AUTH_ERROR": {"userMessage": "認証に失敗しました", "recoverable": False},
    "RATE_LIMIT": {"userMessage": "APIの利用制限に達しました", "recoverable": True},
    "API_TIMEOUT": {"userMessage": "APIの応答がタイムアウトしました", "recoverable": True},
    "SANDBOX_ERROR": {"userMessage": "実行環境の準備に失敗しました", "recoverable": False},
    "UNKNOWN_ERROR": {"userMessage": "予期しないエラーが発生しました", "recoverable": False},
}


def get_cli_error_info(exit_code: int) -> dict:
    """Get structured error info from CLI exit code."""
    info = CLI_ERROR_CODES.get(exit_code, {
        "code": "CLI_UNKNOWN_ERROR",
        "userMessage": f"予期しないエラーが発生しました (コード: {exit_code})",
        "recoverable": False
    })
    return {"type": "error", "exitCode": exit_code, **info}


def get_api_error_info(error_code: str, detail: str = None) -> dict:
    """Get structured error info from API error code."""
    info = API_ERROR_CODES.get(error_code, API_ERROR_CODES["UNKNOWN_ERROR"])
    # Log detail for debugging (not sent to client)
    if detail:
        print(f"[Error] {error_code}: {detail}")
    return {"type": "error", "code": error_code, **info}

# =============================================================================
# Security
# =============================================================================


def validate_uuid(value: str, field_name: str) -> None:
    """Validate UUID format to prevent path traversal attacks."""
    if not value:
        raise ValueError(f"{field_name} is required")
    if not UUID_PATTERN.match(value):
        raise ValueError(f"Invalid {field_name}: must be UUID format")


def validate_ids(user_id: str, project_id: str) -> None:
    """Validate both user_id and project_id."""
    validate_uuid(user_id, "user_id")
    validate_uuid(project_id, "project_id")


def verify_internal_auth(request) -> bool:
    """Verify X-Modal-Secret header for internal API calls."""
    expected_secret = os.environ.get(ENV_INTERNAL_SECRET)
    if not expected_secret:
        return False
    provided_secret = request.headers.get("X-Modal-Secret")
    return provided_secret == expected_secret


def is_valid_git_hash(hash_str: str) -> bool:
    """Validate git commit hash format (short or full)."""
    if not hash_str or not isinstance(hash_str, str):
        return False
    return bool(re.match(r'^[0-9a-f]{7,40}$', hash_str, re.IGNORECASE))


# Git restore patterns (code files only, excludes assets)
RESTORE_PATTERNS = [
    "index.html",
    "*.js",
    "*.css",
    "SPEC.md",
    "STYLE.md",
    "PUBLISH.json",
]


# =============================================================================
# Vertex AI Helpers
# =============================================================================


def get_vertex_env() -> dict:
    """Get Vertex AI environment variables for Claude CLI and Gemini scripts.

    Returns dict with:
        - CLAUDE_CODE_USE_VERTEX=1
        - ANTHROPIC_VERTEX_PROJECT_ID
        - CLOUD_ML_REGION
        - ANTHROPIC_DEFAULT_*_MODEL (opus/sonnet/haiku)
        - GOOGLE_APPLICATION_CREDENTIALS (file path for Gemini scripts)
    """
    return {
        "CLAUDE_CODE_USE_VERTEX": "1",
        "ANTHROPIC_VERTEX_PROJECT_ID": os.environ.get(ENV_VERTEX_PROJECT_ID, ""),
        "CLOUD_ML_REGION": os.environ.get(ENV_VERTEX_REGION, ""),
        "ANTHROPIC_DEFAULT_OPUS_MODEL": os.environ.get(ENV_VERTEX_OPUS_MODEL, ""),
        "ANTHROPIC_DEFAULT_SONNET_MODEL": os.environ.get(ENV_VERTEX_SONNET_MODEL, ""),
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": os.environ.get(ENV_VERTEX_HAIKU_MODEL, ""),
        # For Gemini image generation script (file written by write_gcp_credentials)
        "GOOGLE_APPLICATION_CREDENTIALS": "/tmp/gcp-creds.json",
    }


def write_gcp_credentials(sb) -> str:
    """Write GCP credentials JSON to sandbox and return path.

    Args:
        sb: Modal Sandbox instance

    Returns:
        Path to credentials file in sandbox (/tmp/gcp-creds.json)
    """
    creds_json = os.environ.get(ENV_GCP_CREDENTIALS_JSON, "")
    print(f"[write_gcp_credentials] ENV_GCP_CREDENTIALS_JSON length: {len(creds_json) if creds_json else 0}")
    if not creds_json:
        raise ValueError("GCP credentials not configured - check gcp-vertex-ai secret")

    creds_path = "/tmp/gcp-creds.json"
    # Write credentials file (base64 encode to avoid shell escaping)
    # chmod 644 so claude user can read it
    creds_b64 = base64.b64encode(creds_json.encode()).decode()
    write_cmd = f"echo '{creds_b64}' | base64 -d > {creds_path} && chmod 644 {creds_path}"
    print(f"[write_gcp_credentials] Writing to {creds_path}...")
    write_proc = sb.exec("bash", "-c", write_cmd)
    write_proc.wait()

    # Verify file was written
    verify_cmd = f"ls -la {creds_path} && head -c 50 {creds_path}"
    verify_proc = sb.exec("bash", "-c", verify_cmd)
    verify_output = []
    for line in verify_proc.stdout:
        verify_output.append(line.strip() if isinstance(line, str) else line.decode('utf-8', errors='replace').strip())
    verify_proc.wait()
    print(f"[write_gcp_credentials] Verify: {verify_output}")

    return creds_path


# =============================================================================
# Named Sandbox Helpers (Persistent Sandbox with 20min TTL)
# =============================================================================


def get_sandbox_name(user_id: str, project_id: str) -> str:
    """Generate deterministic sandbox name from user_id + project_id.

    Uses SHA-256 hash to avoid collision and ensure valid naming.
    Format: dreamcore-{hash[:12]}-p2  (p2 suffix forces new sandbox for Phase 2)
    """
    combined = f"{user_id}:{project_id}"
    hash_str = hashlib.sha256(combined.encode()).hexdigest()[:12]
    return f"dreamcore-{hash_str}-p2"  # Force new sandbox creation for API proxy


# =============================================================================
# App Definition
# =============================================================================

app = modal.App(APP_NAME)

# =============================================================================
# Secrets
# =============================================================================

anthropic_secret = modal.Secret.from_name(SECRET_ANTHROPIC)  # Legacy (for rollback)
internal_secret = modal.Secret.from_name(SECRET_INTERNAL)
gemini_secret = modal.Secret.from_name(SECRET_GEMINI, required_keys=[ENV_GEMINI_API_KEY])  # Legacy (for rollback)
proxy_secret = modal.Secret.from_name(SECRET_PROXY, required_keys=[ENV_PROXY_HOST, ENV_PROXY_PORT, ENV_PROXY_USER, ENV_PROXY_PASS])
# New: API Proxy secret (no API keys, only proxy URLs and secret)
api_proxy_secret = modal.Secret.from_name(
    SECRET_API_PROXY,
    required_keys=[ENV_ANTHROPIC_BASE_URL, ENV_GEMINI_BASE_URL, ENV_PROXY_INTERNAL_SECRET]
)
# Vertex AI secrets
vertex_ai_secret = modal.Secret.from_name(
    SECRET_VERTEX_AI,
    required_keys=[ENV_GCP_CREDENTIALS_JSON]
)
vertex_config_secret = modal.Secret.from_name(
    SECRET_VERTEX_CONFIG,
    required_keys=[ENV_VERTEX_PROJECT_ID, ENV_VERTEX_REGION, ENV_VERTEX_OPUS_MODEL, ENV_VERTEX_SONNET_MODEL, ENV_VERTEX_HAIKU_MODEL]
)

# Modal Proxy for static IP (52.55.224.171)
# Required: Nginx allows only this IP for api-proxy.dreamcore.gg
# Name verified via Modal Dashboard → Settings → Proxies
modal_proxy = modal.Proxy.from_name("dreamcore-api-proxy")

# =============================================================================
# Volumes
# =============================================================================

data_volume = modal.Volume.from_name(VOLUME_DATA, create_if_missing=True)
global_volume = modal.Volume.from_name(VOLUME_GLOBAL, create_if_missing=True)

# =============================================================================
# Images
# =============================================================================

web_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")  # Required for version history
    .pip_install("fastapi[standard]", "google-auth", "requests")  # google-auth + requests for Vertex AI
)

sandbox_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "ca-certificates")
    .pip_install("Pillow", "httpx", "google-auth", "requests")  # For image generation script + Vertex AI
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g @anthropic-ai/claude-code",
    )
    .run_commands(
        # Create non-root user for Claude CLI (required for --dangerously-skip-permissions)
        "useradd -m -s /bin/bash claude && mkdir -p /data && chown claude:claude /data",
    )
)

# =============================================================================
# Sandbox Execution
# =============================================================================


async def run_in_sandbox(
    user_id: str,
    project_id: str,
    prompt: str,
) -> AsyncGenerator[str, None]:
    """Execute Claude CLI in a Sandbox."""
    project_dir = f"{MOUNT_DATA}/users/{user_id}/projects/{project_id}"
    proxy_url = get_proxy_url()

    sb = modal.Sandbox.create(
        "bash", "-c", "sleep infinity",
        image=sandbox_image,
        secrets=[api_proxy_secret],  # GCE proxy auth (no API keys in sandbox)
        volumes={
            MOUNT_DATA: data_volume,
            # TODO: Re-enable read-only global volume after testing
            # MOUNT_GLOBAL: global_volume,
        },
        timeout=SANDBOX_TIMEOUT,
        memory=SANDBOX_MEMORY,
        cidr_allowlist=SANDBOX_CIDR_ALLOWLIST,
        proxy=modal_proxy,  # Static IP (52.55.224.171) for api-proxy.dreamcore.gg
        env={
            "HTTP_PROXY": proxy_url,
            "HTTPS_PROXY": proxy_url,
            "NO_PROXY": "localhost,127.0.0.1,api-proxy.dreamcore.gg",
        },
    )

    try:
        mkdir_proc = sb.exec("mkdir", "-p", project_dir)
        mkdir_proc.wait()

        # Write prompt to a temp file to avoid shell escaping issues
        prompt_file = f"{project_dir}/.prompt.txt"
        prompt_b64 = base64.b64encode(prompt.encode()).decode()
        write_prompt_cmd = f"echo '{prompt_b64}' | base64 -d > {prompt_file}"
        write_proc = sb.exec("bash", "-c", write_prompt_cmd)
        write_proc.wait()

        # Run Claude CLI with prompt from file via stdin
        claude_cmd = f"cd {project_dir} && cat {prompt_file} | claude --output-format stream-json"
        proc = sb.exec("bash", "-c", claude_cmd)

        for line in proc.stdout:
            stripped = line.strip()
            if stripped:
                yield stripped

        exit_code = proc.wait()

        # Cleanup prompt file
        cleanup_proc = sb.exec("rm", "-f", prompt_file)
        cleanup_proc.wait()

        data_volume.commit()
        yield json.dumps({"type": "done", "exit_code": exit_code})

    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)})

    finally:
        sb.terminate()


# =============================================================================
# Main Endpoint
# =============================================================================


@app.function(
    image=web_image,
    secrets=[api_proxy_secret, internal_secret, proxy_secret, vertex_ai_secret, vertex_config_secret],
    volumes={MOUNT_DATA: data_volume, MOUNT_GLOBAL: global_volume}
)
@modal.fastapi_endpoint(method="POST")
async def generate_game(request: Request):
    """Generate game code using Claude CLI in a Sandbox."""
    from starlette.responses import StreamingResponse, JSONResponse

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    user_id = body.get("user_id")
    project_id = body.get("project_id")
    prompt = body.get("prompt")
    # Test parameter to force specific errors (for testing only, behind internal auth)
    test_error = body.get("_test_error")  # "timeout", "general", "sandbox", "network"

    try:
        validate_ids(user_id, project_id)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    if not prompt:
        return JSONResponse({"error": "prompt is required"}, status_code=400)

    # Handle test error simulation
    if test_error:
        def stream_test_error():
            yield f"data: {json.dumps({'type': 'status', 'message': 'テストエラーをシミュレート中...'})}\n\n"
            import time
            time.sleep(1)  # Small delay to simulate processing

            if test_error == "timeout":
                error_info = get_cli_error_info(124)
                yield f"data: {json.dumps(error_info)}\n\n"
            elif test_error == "general":
                error_info = get_cli_error_info(1)
                yield f"data: {json.dumps(error_info)}\n\n"
            elif test_error == "sandbox":
                error_info = get_api_error_info("SANDBOX_ERROR", "Test sandbox error")
                yield f"data: {json.dumps(error_info)}\n\n"
            elif test_error == "network":
                error_info = get_api_error_info("NETWORK_ERROR", "Test network error")
                yield f"data: {json.dumps(error_info)}\n\n"
            elif test_error == "rate_limit":
                error_info = get_api_error_info("RATE_LIMIT", "Test rate limit")
                yield f"data: {json.dumps(error_info)}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'done', 'exit_code': 0})}\n\n"

        return StreamingResponse(stream_test_error(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)

    # Inline sandbox creation (avoiding async generator issues)
    project_dir = f"/data/users/{user_id}/projects/{project_id}"

    # CLI execution timeout (separate from sandbox timeout)
    cli_timeout = 300  # 5 minutes for CLI execution

    def stream_sync():
        import time

        start_time = time.time()
        sandbox_name = get_sandbox_name(user_id, project_id)
        proxy_url = get_proxy_url()
        sandbox_reused = False
        sb = None

        try:
            # Try to reuse existing sandbox (warm start)
            try:
                sb = modal.Sandbox.from_name(APP_NAME, sandbox_name)
                sandbox_reused = True
                yield f"data: {json.dumps({'type': 'status', 'message': 'Sandbox connected (warm)'})}\n\n"
                print(f"[Sandbox] Reusing: {sandbox_name}")
            except modal.exception.NotFoundError:
                # Create new sandbox (cold start)
                yield f"data: {json.dumps({'type': 'status', 'message': 'Creating sandbox...'})}\n\n"
                print(f"[Sandbox] Creating: {sandbox_name}")
                try:
                    sb = modal.Sandbox.create(
                        "bash", "-c", "sleep infinity",
                        app=app,
                        name=sandbox_name,
                        image=sandbox_image,  # Has Claude CLI installed + Pillow/httpx for image generation
                        secrets=[api_proxy_secret, vertex_ai_secret, vertex_config_secret],  # GCE proxy + Vertex AI
                        volumes={
                            "/data": data_volume,
                            "/global": global_volume,  # Read-only skills and scripts
                        },
                        timeout=SANDBOX_MAX_TIMEOUT,      # 5時間（最大寿命）
                        idle_timeout=SANDBOX_IDLE_TIMEOUT,  # 20分（アイドル時に自動終了）
                        memory=SANDBOX_MEMORY,
                        cidr_allowlist=SANDBOX_CIDR_ALLOWLIST,
                        proxy=modal_proxy,  # Static IP (52.55.224.171) for api-proxy.dreamcore.gg
                        env={
                            "HTTP_PROXY": proxy_url,
                            "HTTPS_PROXY": proxy_url,
                            # API proxy is accessed directly (not via Squid proxy)
                            "NO_PROXY": "localhost,127.0.0.1,api-proxy.dreamcore.gg",
                            # Vertex AI env vars (Claude CLI will use these)
                            **get_vertex_env(),
                        },
                    )
                    # Delete old Claude CLI cache (prevents stale auth from old sandbox)
                    cleanup_claude_cache = sb.exec("bash", "-c", "rm -rf /home/claude/.claude 2>/dev/null || true")
                    cleanup_claude_cache.wait()
                    # Write GCP credentials for Vertex AI
                    gcp_creds_path = write_gcp_credentials(sb)
                    print(f"[Sandbox] GCP credentials written to {gcp_creds_path}")
                except (modal.exception.AlreadyExistsError, Exception) as create_err:
                    # Race condition: another request created it first, or other error
                    if "already exists" in str(create_err).lower():
                        sb = modal.Sandbox.from_name(APP_NAME, sandbox_name)
                        sandbox_reused = True
                        print(f"[Sandbox] Race resolved, reusing: {sandbox_name}")
                    else:
                        raise create_err
            except (modal.exception.SandboxTerminatedError, modal.exception.SandboxTimeoutError) as e:
                # Sandbox exists but is in bad state (terminated, timed out, etc.)
                yield f"data: {json.dumps({'type': 'status', 'message': 'Recreating sandbox...'})}\n\n"
                print(f"[Sandbox] Sandbox in bad state, recreating: {sandbox_name} - {e}")
                sb = modal.Sandbox.create(
                    "bash", "-c", "sleep infinity",
                    app=app,
                    name=sandbox_name,
                    image=sandbox_image,
                    secrets=[api_proxy_secret, vertex_ai_secret, vertex_config_secret],  # GCE proxy + Vertex AI
                    volumes={
                        "/data": data_volume,
                        "/global": global_volume,
                    },
                    timeout=SANDBOX_MAX_TIMEOUT,
                    idle_timeout=SANDBOX_IDLE_TIMEOUT,
                    memory=SANDBOX_MEMORY,
                    cidr_allowlist=SANDBOX_CIDR_ALLOWLIST,
                    proxy=modal_proxy,  # Static IP (52.55.224.171) for api-proxy.dreamcore.gg
                    env={
                        "HTTP_PROXY": proxy_url,
                        "HTTPS_PROXY": proxy_url,
                        "NO_PROXY": "localhost,127.0.0.1,api-proxy.dreamcore.gg",
                        **get_vertex_env(),
                    },
                )
                # Delete old Claude CLI cache (prevents stale auth from recreated sandbox)
                cleanup_claude_cache = sb.exec("bash", "-c", "rm -rf /home/claude/.claude 2>/dev/null || true")
                cleanup_claude_cache.wait()
                # Write GCP credentials for Vertex AI
                gcp_creds_path = write_gcp_credentials(sb)
                print(f"[Sandbox] GCP credentials written to {gcp_creds_path}")

            # Create project directory (as root, then chown to claude user)
            mkdir_proc = sb.exec("bash", "-c", f"mkdir -p {project_dir} && chown -R claude:claude {project_dir}")
            mkdir_proc.wait()

            # Copy skills from global volume to project directory
            # This enables Claude CLI to find and use the skill files
            yield f"data: {json.dumps({'type': 'status', 'message': 'Loading skills...'})}\n\n"
            skills_src = "/global/.claude/skills"
            skills_dst = f"{project_dir}/.claude/skills"
            copy_skills_cmd = f"mkdir -p {project_dir}/.claude && cp -r {skills_src} {skills_dst} 2>/dev/null || true"
            copy_proc = sb.exec("bash", "-c", copy_skills_cmd)
            copy_proc.wait()
            # Make skills readable by claude user
            chown_skills_cmd = f"chown -R claude:claude {project_dir}/.claude 2>/dev/null || true"
            chown_proc = sb.exec("bash", "-c", chown_skills_cmd)
            chown_proc.wait()

            yield f"data: {json.dumps({'type': 'status', 'message': 'Starting Claude CLI...'})}\n\n"

            # Write prompt to temp file (avoids shell escaping issues)
            prompt_b64 = base64.b64encode(prompt.encode()).decode()
            prompt_file = f"{project_dir}/.prompt.txt"
            write_cmd = f"echo '{prompt_b64}' | base64 -d > {prompt_file} && chmod 644 {prompt_file}"
            write_proc = sb.exec("bash", "-c", write_cmd)
            write_proc.wait()

            # Run Claude CLI as non-root user (required for --dangerously-skip-permissions)
            # Read prompt from stdin, output in stream-json format (requires --verbose)
            # Vertex AI mode: use GCP credentials instead of API key
            # Export env vars explicitly (su -m doesn't preserve them in Modal Sandbox)
            vertex_env = get_vertex_env()
            print(f"[generate_game] Using Vertex AI: project={vertex_env.get('ANTHROPIC_VERTEX_PROJECT_ID')}, region={vertex_env.get('CLOUD_ML_REGION')}")
            # Use shlex.quote() for shell-safe escaping of all values
            claude_cmd = (
                # Proxy settings (for Vertex AI OAuth via Squid)
                f"export HTTP_PROXY={shlex.quote(proxy_url)} && "
                f"export HTTPS_PROXY={shlex.quote(proxy_url)} && "
                f"export NO_PROXY='localhost,127.0.0.1,api-proxy.dreamcore.gg' && "
                # Vertex AI settings
                f"export GOOGLE_APPLICATION_CREDENTIALS='/tmp/gcp-creds.json' && "
                f"export CLAUDE_CODE_USE_VERTEX='1' && "
                f"export ANTHROPIC_VERTEX_PROJECT_ID={shlex.quote(vertex_env.get('ANTHROPIC_VERTEX_PROJECT_ID', ''))} && "
                f"export CLOUD_ML_REGION={shlex.quote(vertex_env.get('CLOUD_ML_REGION', ''))} && "
                f"export ANTHROPIC_DEFAULT_OPUS_MODEL={shlex.quote(vertex_env.get('ANTHROPIC_DEFAULT_OPUS_MODEL', ''))} && "
                f"export ANTHROPIC_DEFAULT_SONNET_MODEL={shlex.quote(vertex_env.get('ANTHROPIC_DEFAULT_SONNET_MODEL', ''))} && "
                f"export ANTHROPIC_DEFAULT_HAIKU_MODEL={shlex.quote(vertex_env.get('ANTHROPIC_DEFAULT_HAIKU_MODEL', ''))} && "
                f"cd {project_dir} && cat {prompt_file} | /usr/bin/claude --verbose --output-format stream-json --dangerously-skip-permissions 2>&1"
            )
            full_cmd = f"timeout {cli_timeout} su claude -c \"{claude_cmd}\""
            print(f"[generate_game] Starting Claude CLI for {project_id}")

            proc = sb.exec("bash", "-c", full_cmd)

            # Stream output - validate JSON before sending
            output_lines = []
            line_count = 0
            json_buffer = ""

            for line in proc.stdout:
                stripped = line.strip()
                if not stripped:
                    continue

                # Try to parse as JSON directly
                try:
                    parsed = json.loads(stripped)
                    # Valid JSON - send it
                    output_lines.append(stripped)
                    line_count += 1
                    yield f"data: {stripped}\n\n"
                except json.JSONDecodeError:
                    # Not valid JSON - might be partial or non-JSON output
                    # Try buffering with previous incomplete JSON
                    if json_buffer:
                        json_buffer += stripped
                        try:
                            parsed = json.loads(json_buffer)
                            # Buffer completed a valid JSON
                            output_lines.append(json_buffer)
                            line_count += 1
                            yield f"data: {json_buffer}\n\n"
                            json_buffer = ""
                        except json.JSONDecodeError:
                            # Still incomplete, keep buffering
                            pass
                    elif stripped.startswith('{'):
                        # Looks like start of JSON, buffer it
                        json_buffer = stripped
                    else:
                        # Non-JSON output (e.g., verbose logging) - wrap it
                        wrapped = json.dumps({'type': 'log', 'content': stripped})
                        output_lines.append(wrapped)
                        line_count += 1
                        yield f"data: {wrapped}\n\n"

                # Safety: limit to 1000 lines
                if line_count >= 1000:
                    yield f"data: {json.dumps({'type': 'warning', 'message': 'Output limit reached (1000 lines)'})}\n\n"
                    break

            # Flush any remaining buffer
            if json_buffer:
                wrapped = json.dumps({'type': 'log', 'content': json_buffer})
                yield f"data: {wrapped}\n\n"

            exit_code = proc.wait()
            elapsed = time.time() - start_time

            # Cleanup prompt file
            cleanup_proc = sb.exec("rm", "-f", prompt_file)
            cleanup_proc.wait()

            # Git commit for version history (run inside sandbox where git is available)
            git_commit_hash = None
            try:
                yield f"data: {json.dumps({'type': 'status', 'message': 'Saving version history...'})}\n\n"

                # Configure safe.directory to allow git operations on volume-mounted directories
                safe_dir_cmd = f"git config --global --add safe.directory {project_dir}"
                safe_proc = sb.exec("bash", "-c", safe_dir_cmd)
                safe_proc.wait()

                # Check if git is initialized
                git_check = sb.exec("bash", "-c", f"test -d {project_dir}/.git && echo 'exists'")
                git_check_output = git_check.stdout.read().strip()
                git_check.wait()

                # Initialize git if not exists
                if "exists" not in git_check_output:
                    init_cmd = f"cd {project_dir} && git init && git config user.email 'gamecreator@dreamcore.app' && git config user.name 'Game Creator'"
                    init_proc = sb.exec("bash", "-c", init_cmd)
                    init_proc.wait()
                    yield f"data: {json.dumps({'type': 'log', 'content': 'Git repository initialized', 'level': 'info'})}\n\n"

                # Stage and commit
                commit_cmd = f"cd {project_dir} && git add -A && git commit -m 'Update via Claude CLI' 2>/dev/null && git rev-parse --short HEAD"
                commit_proc = sb.exec("bash", "-c", commit_cmd)
                commit_output = ""
                for line in commit_proc.stdout:
                    commit_output = line.strip()  # Last line is the hash
                commit_proc.wait()

                if commit_output and len(commit_output) >= 7:
                    git_commit_hash = commit_output
                    yield f"data: {json.dumps({'type': 'log', 'content': f'Git commit created: {git_commit_hash}', 'level': 'info'})}\n\n"

            except Exception as git_err:
                yield f"data: {json.dumps({'type': 'log', 'content': f'Git error: {str(git_err)}', 'level': 'warn'})}\n\n"

            # Commit volume changes (persist to Modal Volume)
            data_volume.commit()

            # Debug info
            debug_info = {
                'type': 'debug',
                'exit_code': exit_code,
                'elapsed_seconds': round(elapsed, 2),
                'output_line_count': len(output_lines),
                'sandbox_reused': sandbox_reused,  # True = warm start, False = cold start
            }

            if git_commit_hash:
                debug_info['git_commit'] = git_commit_hash

            if exit_code == 124:
                debug_info['timeout_reached'] = True
                debug_info['message'] = f'CLI timed out after {cli_timeout} seconds'

            yield f"data: {json.dumps(debug_info)}\n\n"

            # Send structured error for non-zero exit codes, done for success
            if exit_code == 0:
                yield f"data: {json.dumps({'type': 'done', 'exit_code': 0})}\n\n"
            else:
                # Send structured error event (don't send done after error)
                error_info = get_cli_error_info(exit_code)
                yield f"data: {json.dumps(error_info)}\n\n"

        except Exception as e:
            elapsed = time.time() - start_time
            print(f"[Error] generate_game exception: {e}")
            error_info = get_api_error_info("SANDBOX_ERROR", str(e))
            error_info['elapsed_seconds'] = round(elapsed, 2)
            yield f"data: {json.dumps(error_info)}\n\n"

        # NOTE: Do NOT terminate the sandbox!
        # It will auto-terminate after idle_timeout (20 min) for reuse by subsequent requests

    return StreamingResponse(stream_sync(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)


@app.function(image=web_image, secrets=[internal_secret], volumes={MOUNT_DATA: data_volume})
@modal.fastapi_endpoint(method="GET")
async def get_file(request: Request):
    """Serve a file from the data volume for preview."""
    from starlette.responses import Response, JSONResponse
    import mimetypes

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    # Get query parameters
    user_id = request.query_params.get("user_id")
    project_id = request.query_params.get("project_id")
    file_path = request.query_params.get("path", "index.html")

    # Validate IDs
    try:
        validate_ids(user_id, project_id)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    # Sanitize file_path to prevent path traversal
    # Remove leading slashes and normalize
    file_path = file_path.lstrip("/")
    if ".." in file_path or file_path.startswith("/"):
        return JSONResponse({"error": "Invalid file path"}, status_code=400)

    # Build full path
    project_dir = f"{MOUNT_DATA}/users/{user_id}/projects/{project_id}"
    full_path = f"{project_dir}/{file_path}"

    try:
        with open(full_path, "rb") as f:
            content = f.read()
    except FileNotFoundError:
        # If index.html not found, try to find any HTML file
        if file_path == "index.html":
            import os
            try:
                for f in os.listdir(project_dir):
                    if f.endswith('.html') and not f.startswith('.'):
                        full_path = f"{project_dir}/{f}"
                        file_path = f
                        with open(full_path, "rb") as fh:
                            content = fh.read()
                        break
                else:
                    return JSONResponse({"error": "No HTML file found"}, status_code=404)
            except FileNotFoundError:
                return JSONResponse({"error": "Project not found"}, status_code=404)
        else:
            return JSONResponse({"error": "File not found"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

    # Determine MIME type
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    # Cache-Control based on file type
    # HTML: no-store (always fetch fresh for updates)
    # Static assets: cache for 1 hour (images, CSS, JS, fonts)
    if mime_type and mime_type.startswith("text/html"):
        cache_control = "no-store"
    elif mime_type and (
        mime_type.startswith("image/") or
        mime_type.startswith("audio/") or
        mime_type.startswith("font/") or
        mime_type in ("text/css", "application/javascript", "text/javascript")
    ):
        cache_control = "public, max-age=3600"  # 1 hour
    else:
        cache_control = "no-cache"

    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Cache-Control": cache_control,
            "Access-Control-Allow-Origin": "*",
        }
    )


@app.function(image=web_image, secrets=[internal_secret], volumes={MOUNT_DATA: data_volume})
@modal.fastapi_endpoint(method="GET")
async def list_files(request: Request):
    """List files in a project directory."""
    from starlette.responses import JSONResponse
    import os

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    user_id = request.query_params.get("user_id")
    project_id = request.query_params.get("project_id")

    try:
        validate_ids(user_id, project_id)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    project_dir = f"{MOUNT_DATA}/users/{user_id}/projects/{project_id}"

    try:
        files = []
        for root, dirs, filenames in os.walk(project_dir):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for filename in filenames:
                if not filename.startswith('.'):
                    rel_path = os.path.relpath(os.path.join(root, filename), project_dir)
                    files.append(rel_path)
        return JSONResponse({"files": files})
    except FileNotFoundError:
        return JSONResponse({"error": "Project not found", "files": []}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# =============================================================================
# Git Operation Handlers (for apply_files endpoint)
# =============================================================================


def handle_git_log(user_id: str, project_id: str):
    """Get git log for project (no limit).

    Auto-initializes git if project exists but .git doesn't.
    Returns 'autoInitialized: true' flag when git was just initialized.
    """
    from starlette.responses import JSONResponse
    import subprocess

    project_dir = f"{MOUNT_DATA}/users/{user_id}/projects/{project_id}"
    git_dir = os.path.join(project_dir, ".git")
    auto_initialized = False

    # Auto-initialize git for existing projects
    if not os.path.exists(git_dir):
        # Check if project directory exists
        if not os.path.exists(project_dir):
            return JSONResponse({"commits": [], "debug": {"project_exists": False, "path": project_dir}})

        # Initialize git for existing project
        safe_dir_arg = f"safe.directory={project_dir}"
        try:
            print(f"[git_log] Auto-initializing git for project {project_id}")
            subprocess.run(
                ["git", "-c", safe_dir_arg, "-C", project_dir, "init"],
                check=True, capture_output=True, timeout=30
            )
            subprocess.run(
                ["git", "-c", safe_dir_arg, "-C", project_dir, "config", "user.email", "gamecreator@dreamcore.app"],
                check=True, capture_output=True, timeout=5
            )
            subprocess.run(
                ["git", "-c", safe_dir_arg, "-C", project_dir, "config", "user.name", "Game Creator"],
                check=True, capture_output=True, timeout=5
            )
            # Add all existing files and create initial commit
            subprocess.run(
                ["git", "-c", safe_dir_arg, "-C", project_dir, "add", "."],
                check=True, capture_output=True, timeout=30
            )
            commit_result = subprocess.run(
                ["git", "-c", safe_dir_arg, "-C", project_dir, "commit", "-m", "Initial commit (auto-initialized)"],
                check=False, capture_output=True, timeout=30  # May fail if no files
            )
            auto_initialized = True
            print(f"[git_log] Git auto-initialized for project {project_id}")
        except Exception as e:
            # If initialization fails, return empty commits
            print(f"[git_log] Git auto-init FAILED for project {project_id}: {e}")
            return JSONResponse({"commits": [], "warning": f"Git init failed: {str(e)}"})

    try:
        # Use -c safe.directory to allow git operations on volume-mounted directories
        result = subprocess.run(
            ["git", "-c", f"safe.directory={project_dir}", "-C", project_dir, "log", "--format=%h|%s|%aI"],
            capture_output=True, text=True, timeout=30
        )

        commits = []
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split('|', 2)
                if len(parts) == 3:
                    commits.append({
                        "hash": parts[0],
                        "message": parts[1],
                        "date": parts[2]
                    })

        response = {"commits": commits, "_v": 2}  # Version for debug
        if auto_initialized:
            response["autoInitialized"] = True
        return JSONResponse(response)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


def handle_git_diff(user_id: str, project_id: str, commit: str):
    """Get diff for a specific commit."""
    from starlette.responses import JSONResponse
    import subprocess

    if not is_valid_git_hash(commit):
        return JSONResponse({"error": "Invalid commit hash"}, status_code=400)

    project_dir = f"{MOUNT_DATA}/users/{user_id}/projects/{project_id}"
    git_dir = os.path.join(project_dir, ".git")

    if not os.path.exists(git_dir):
        return JSONResponse({"error": "Git not initialized"}, status_code=404)

    # Use -c safe.directory to allow git operations on volume-mounted directories
    safe_dir_arg = f"safe.directory={project_dir}"

    # Verify commit exists
    verify = subprocess.run(
        ["git", "-c", safe_dir_arg, "-C", project_dir, "cat-file", "-e", commit],
        capture_output=True, timeout=5
    )
    if verify.returncode != 0:
        return JSONResponse({"error": "Commit not found"}, status_code=404)

    try:
        # Try diff with parent first
        result = subprocess.run(
            ["git", "-c", safe_dir_arg, "-C", project_dir, "diff", f"{commit}^..{commit}"],
            capture_output=True, text=True, timeout=10
        )

        # If failed (likely first commit), use git show
        if result.returncode != 0:
            result = subprocess.run(
                ["git", "-c", safe_dir_arg, "-C", project_dir, "show", "--format=", commit],
                capture_output=True, text=True, timeout=10
            )

        return JSONResponse({"diff": result.stdout})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


def handle_git_restore(user_id: str, project_id: str, commit: str):
    """Restore code files to a specific commit (excludes assets)."""
    from starlette.responses import JSONResponse
    import subprocess

    if not is_valid_git_hash(commit):
        return JSONResponse({"error": "Invalid commit hash"}, status_code=400)

    project_dir = f"{MOUNT_DATA}/users/{user_id}/projects/{project_id}"
    git_dir = os.path.join(project_dir, ".git")

    if not os.path.exists(git_dir):
        return JSONResponse({"error": "Git not initialized"}, status_code=404)

    # Use -c safe.directory to allow git operations on volume-mounted directories
    safe_dir_arg = f"safe.directory={project_dir}"

    # Verify commit exists
    verify = subprocess.run(
        ["git", "-c", safe_dir_arg, "-C", project_dir, "cat-file", "-e", commit],
        capture_output=True, timeout=5
    )
    if verify.returncode != 0:
        return JSONResponse({"error": "Commit not found"}, status_code=404)

    try:
        # Checkout each pattern separately (code files only)
        for pattern in RESTORE_PATTERNS:
            subprocess.run(
                ["git", "-c", safe_dir_arg, "-C", project_dir, "checkout", commit, "--", pattern],
                capture_output=True, text=True, timeout=10
            )
            # Pattern may not exist in that commit - that's OK, continue

        # Get list of files changed in that commit (for UI display)
        ls_result = subprocess.run(
            ["git", "-c", safe_dir_arg, "-C", project_dir, "show", "--name-only", "--format=", commit],
            capture_output=True, text=True, timeout=10
        )
        restored_files = [f for f in ls_result.stdout.strip().split('\n') if f]

        # Commit volume changes (important!)
        data_volume.commit()

        return JSONResponse({
            "success": True,
            "restored_files": restored_files
        })
    except Exception as e:
        return JSONResponse({
            "success": False,
            "error": str(e)
        })


@app.function(image=web_image, secrets=[internal_secret], volumes={MOUNT_DATA: data_volume})
@modal.fastapi_endpoint(method="POST")
async def apply_files(request: Request):
    """Apply files or execute git operations.

    Actions:
        - None (default): Apply files to project (SSE response)
        - git_log: Get commit history (JSON response)
        - git_diff: Get diff for a commit (JSON response)
        - git_restore: Restore code files to a commit (JSON response)
    """
    from starlette.responses import StreamingResponse, JSONResponse

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    user_id = body.get("user_id")
    project_id = body.get("project_id")
    action = body.get("action")  # Git operation action (optional)

    # Validate IDs
    try:
        validate_ids(user_id, project_id)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    # Git operations (JSON response)
    if action == "git_log":
        return handle_git_log(user_id, project_id)

    if action == "git_diff":
        commit = body.get("commit")
        if not commit:
            return JSONResponse({"error": "commit is required"}, status_code=400)
        return handle_git_diff(user_id, project_id, commit)

    if action == "git_restore":
        commit = body.get("commit")
        if not commit:
            return JSONResponse({"error": "commit is required"}, status_code=400)
        return handle_git_restore(user_id, project_id, commit)

    # Unknown action → 400
    if action is not None:
        return JSONResponse({"error": f"Unknown action: {action}"}, status_code=400)

    # Default (action=None): file apply (existing SSE logic)
    files = body.get("files", [])
    commit_message = body.get("commit_message", "Update via API")

    if not files:
        return JSONResponse({"error": "files array is required"}, status_code=400)

    project_dir = f"{MOUNT_DATA}/users/{user_id}/projects/{project_id}"

    def stream_apply():
        import subprocess
        import time

        start_time = time.time()

        try:
            # Create project directory
            os.makedirs(project_dir, exist_ok=True)
            yield f'data: {json.dumps({"type":"status","message":"Creating project directory..."})}\n\n'

            written_files = []

            for file_info in files:
                file_path_rel = file_info.get("path", "")
                action = file_info.get("action", "create")
                content = file_info.get("content", "")

                # Validate path (no traversal)
                if ".." in file_path_rel or file_path_rel.startswith("/"):
                    yield f'data: {json.dumps({"type":"error","message":f"Invalid file path: {file_path_rel}"})}\n\n'
                    return

                file_path = os.path.join(project_dir, file_path_rel)

                if action == "delete":
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    yield f'data: {json.dumps({"type":"status","message":f"Deleted {file_path_rel}"})}\n\n'
                    written_files.append({
                        "path": file_path_rel,
                        "action": "delete",
                        "size": 0
                    })
                else:
                    # Create parent directories
                    parent_dir = os.path.dirname(file_path)
                    if parent_dir and parent_dir != project_dir:
                        os.makedirs(parent_dir, exist_ok=True)

                    # Write file
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(content)

                    size = len(content.encode("utf-8"))
                    written_files.append({
                        "path": file_path_rel,
                        "action": action,
                        "size": size
                    })
                    yield f'data: {json.dumps({"type":"status","message":f"Writing {file_path_rel}..."})}\n\n'

            # Git commit (initialize git if needed)
            git_dir = os.path.join(project_dir, ".git")
            safe_dir_arg = f"safe.directory={project_dir}"
            yield f'data: {json.dumps({"type":"status","message":"Committing changes..."})}\n\n'
            try:
                # Initialize git if not exists
                if not os.path.exists(git_dir):
                    yield f'data: {json.dumps({"type":"log","content":"Initializing git repository..."})}\n\n'
                    subprocess.run(
                        ["git", "-c", safe_dir_arg, "-C", project_dir, "init"],
                        check=True, capture_output=True, timeout=30
                    )
                    subprocess.run(
                        ["git", "-c", safe_dir_arg, "-C", project_dir, "config", "user.email", "gamecreator@dreamcore.app"],
                        check=True, capture_output=True, timeout=5
                    )
                    subprocess.run(
                        ["git", "-c", safe_dir_arg, "-C", project_dir, "config", "user.name", "Game Creator"],
                        check=True, capture_output=True, timeout=5
                    )

                # Add and commit
                subprocess.run(
                    ["git", "-c", safe_dir_arg, "-C", project_dir, "add", "."],
                    check=True, capture_output=True, timeout=30
                )
                # Commit may fail if nothing to commit, that's OK
                commit_result = subprocess.run(
                    ["git", "-c", safe_dir_arg, "-C", project_dir, "commit", "-m", commit_message],
                    check=False, capture_output=True, text=True, timeout=30
                )
                if commit_result.returncode == 0:
                    # Get the commit hash
                    hash_result = subprocess.run(
                        ["git", "-c", safe_dir_arg, "-C", project_dir, "rev-parse", "--short", "HEAD"],
                        capture_output=True, text=True, timeout=5
                    )
                    commit_hash = hash_result.stdout.strip() if hash_result.returncode == 0 else "unknown"
                    yield f'data: {json.dumps({"type":"log","content":f"Committed: {commit_hash}"})}\n\n'
                else:
                    yield f'data: {json.dumps({"type":"log","content":"No changes to commit"})}\n\n'
            except subprocess.TimeoutExpired:
                yield f'data: {json.dumps({"type":"log","content":"Git commit timed out","level":"warn"})}\n\n'
            except subprocess.CalledProcessError as e:
                error_msg = e.stderr if hasattr(e, "stderr") and e.stderr else str(e)
                yield f'data: {json.dumps({"type":"log","content":f"Git error: {error_msg}","level":"warn"})}\n\n'

            # Commit Volume changes
            data_volume.commit()

            elapsed = time.time() - start_time

            # Send result
            yield f'data: {json.dumps({"type":"result","files":written_files})}\n\n'
            yield f'data: {json.dumps({"type":"done","exit_code":0,"duration_ms":int(elapsed * 1000)})}\n\n'

        except PermissionError as e:
            yield f'data: {json.dumps({"type":"error","message":f"Permission denied: {str(e)}","code":"PERMISSION_ERROR"})}\n\n'
        except OSError as e:
            if "Disk quota" in str(e) or "No space" in str(e):
                yield f'data: {json.dumps({"type":"error","message":"Disk quota exceeded","code":"QUOTA_EXCEEDED"})}\n\n'
            else:
                yield f'data: {json.dumps({"type":"error","message":str(e),"code":"OS_ERROR"})}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"type":"error","message":str(e),"code":"INTERNAL"})}\n\n'

    return StreamingResponse(stream_apply(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)


# =============================================================================
# AI Detection Endpoints (Claude Haiku for lightweight tasks)
# =============================================================================


async def run_haiku_in_sandbox(prompt: str, timeout_seconds: int = 15) -> str:
    """Run Claude CLI with Haiku model in a sandbox for fast, lightweight tasks.

    Args:
        prompt: The prompt to send to Claude Haiku
        timeout_seconds: Maximum time to wait (default 15s for quick responses)

    Returns:
        The text response from Claude Haiku
    """
    import os as _os  # Local import to avoid conflict

    proxy_url = get_proxy_url()
    sb = modal.Sandbox.create(
        "bash", "-c", "sleep infinity",
        image=sandbox_image,
        secrets=[api_proxy_secret, proxy_secret, vertex_ai_secret, vertex_config_secret],  # API proxy + Vertex AI
        timeout=60,  # Sandbox timeout
        memory=1024,  # Less memory needed for Haiku
        cidr_allowlist=SANDBOX_CIDR_ALLOWLIST,
        proxy=modal_proxy,  # Static IP (52.55.224.171) for api-proxy.dreamcore.gg
        env={
            "HTTP_PROXY": proxy_url,
            "HTTPS_PROXY": proxy_url,
            "NO_PROXY": "localhost,127.0.0.1,api-proxy.dreamcore.gg",
            **get_vertex_env(),
        },
    )

    try:
        print(f"[run_haiku] Starting sandbox for prompt ({len(prompt)} chars)")

        # Write GCP credentials for Vertex AI
        gcp_creds_path = write_gcp_credentials(sb)
        print(f"[run_haiku] GCP credentials written to {gcp_creds_path}")

        # Get Vertex AI env vars
        vertex_env = get_vertex_env()
        print(f"[run_haiku] Using Vertex AI: project={vertex_env.get('ANTHROPIC_VERTEX_PROJECT_ID')}, region={vertex_env.get('CLOUD_ML_REGION')}")

        # Write prompt to temp file with world-readable permissions
        prompt_b64 = base64.b64encode(prompt.encode()).decode()
        prompt_file = "/tmp/haiku_prompt.txt"
        write_cmd = f"echo '{prompt_b64}' | base64 -d > {prompt_file} && chmod 644 {prompt_file}"
        write_proc = sb.exec("bash", "-c", write_cmd)
        write_proc.wait()
        print("[run_haiku] Prompt written to file")

        # Test: Simple echo to verify output capture works
        echo_proc = sb.exec("bash", "-c", "echo 'TEST_OUTPUT_CAPTURE'")
        echo_output = []
        for line in echo_proc.stdout:
            echo_output.append(line.strip())
        echo_proc.wait()
        print(f"[run_haiku] Echo test: {echo_output}")

        # Run Claude CLI with Vertex AI environment variables
        # Don't rely on su -m, pass the env vars explicitly
        # Use shlex.quote() for shell-safe escaping of all values
        claude_cmd = (
            # Proxy settings (for Vertex AI OAuth via Squid)
            f"export HTTP_PROXY={shlex.quote(proxy_url)} && "
            f"export HTTPS_PROXY={shlex.quote(proxy_url)} && "
            f"export NO_PROXY='localhost,127.0.0.1,api-proxy.dreamcore.gg' && "
            # Vertex AI settings
            f"export GOOGLE_APPLICATION_CREDENTIALS={shlex.quote(gcp_creds_path)} && "
            f"export CLAUDE_CODE_USE_VERTEX='1' && "
            f"export ANTHROPIC_VERTEX_PROJECT_ID={shlex.quote(vertex_env.get('ANTHROPIC_VERTEX_PROJECT_ID', ''))} && "
            f"export CLOUD_ML_REGION={shlex.quote(vertex_env.get('CLOUD_ML_REGION', ''))} && "
            f"export ANTHROPIC_DEFAULT_OPUS_MODEL={shlex.quote(vertex_env.get('ANTHROPIC_DEFAULT_OPUS_MODEL', ''))} && "
            f"export ANTHROPIC_DEFAULT_SONNET_MODEL={shlex.quote(vertex_env.get('ANTHROPIC_DEFAULT_SONNET_MODEL', ''))} && "
            f"export ANTHROPIC_DEFAULT_HAIKU_MODEL={shlex.quote(vertex_env.get('ANTHROPIC_DEFAULT_HAIKU_MODEL', ''))} && "
            f"cat {prompt_file} | /usr/bin/claude --model haiku --print --dangerously-skip-permissions 2>&1"
        )
        # Run as claude user with env vars exported in the command
        full_cmd = f"timeout {timeout_seconds} su claude -c \"{claude_cmd}\""
        print(f"[run_haiku] Running command (first 200 chars): {full_cmd[:200]}...")

        proc = sb.exec("bash", "-c", full_cmd)

        output_lines = []
        for line in proc.stdout:
            try:
                stripped = line.strip() if isinstance(line, str) else line.decode('utf-8', errors='replace').strip()
                if stripped:
                    output_lines.append(stripped)
                    print(f"[run_haiku] Output: {stripped[:100]}")
            except Exception as e:
                print(f"[run_haiku] Error reading line: {e}")

        exit_code = proc.wait()
        print(f"[run_haiku] Exit code: {exit_code}, output lines: {len(output_lines)}")

        return "\n".join(output_lines)

    finally:
        sb.terminate()


@app.function(image=web_image, secrets=[api_proxy_secret, internal_secret, proxy_secret, vertex_ai_secret, vertex_config_secret])
@modal.fastapi_endpoint(method="POST")
async def detect_intent(request: Request):
    """Detect user intent using Claude Haiku.

    Returns one of: restore, chat, edit

    Based on GameCreatorMVP-v2/server/claudeRunner.js:detectIntent
    """
    from starlette.responses import JSONResponse

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    message = body.get("message", "")
    if not message:
        return JSONResponse({"error": "message is required"}, status_code=400)

    print(f"[detect_intent] Received message: {message[:50]}...")

    # Build prompt for intent detection
    prompt = f"""ユーザーのメッセージの意図を判定してください。
メッセージ: "{message}"

以下から1つだけ選んでください:
- restore: 元に戻す、前のバージョンに戻す、取り消す
- chat: 質問、相談、説明を求める、教えて
- edit: コード変更、機能追加、バグ修正、ゲーム作成

回答（1単語のみ、小文字で）:"""

    try:
        print("[detect_intent] Calling run_haiku_in_sandbox...")
        result = await run_haiku_in_sandbox(prompt, timeout_seconds=15)
        print(f"[detect_intent] Result: {result[:100] if result else 'EMPTY'}")

        # Parse result
        result_lower = result.lower().strip()

        if "restore" in result_lower:
            intent = "restore"
        elif "chat" in result_lower:
            intent = "chat"
        else:
            intent = "edit"

        return JSONResponse({
            "intent": intent,
            "raw_response": result[:100],  # First 100 chars for debugging
        })

    except Exception as e:
        print(f"[detect_intent] ERROR: {type(e).__name__}: {e}")
        # Fallback to keyword-based detection on error
        message_lower = message.lower()

        if any(kw in message_lower for kw in ["元に戻", "戻して", "undo", "restore", "前の", "revert"]):
            intent = "restore"
        elif any(kw in message_lower for kw in ["?", "？", "教えて", "なぜ", "どうして", "ですか"]):
            intent = "chat"
        else:
            intent = "edit"

        return JSONResponse({
            "intent": intent,
            "fallback": True,
            "error": str(e),
        })


@app.function(image=web_image, secrets=[api_proxy_secret, internal_secret, proxy_secret, vertex_ai_secret, vertex_config_secret])
@modal.fastapi_endpoint(method="POST")
async def detect_skills(request: Request):
    """Detect required skills using Claude Haiku.

    Returns an array of skill names (max 5).

    Based on GameCreatorMVP-v2/server/claudeRunner.js:detectSkillsWithAI
    """
    from starlette.responses import JSONResponse

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    message = body.get("message", "")
    dimension = body.get("dimension", "2d")  # 2d or 3d
    existing_code = body.get("existing_code", "")

    if not message:
        return JSONResponse({"error": "message is required"}, status_code=400)

    # Available skills (excluding problematic ones)
    available_skills = [
        # 2D skills
        "p5js-setup", "p5js-input", "p5js-collision",
        # 3D skills
        "threejs-setup", "threejs-input", "threejs-lighting", "threejs-water",
        # Common skills
        "game-ai", "tween-animation",
        # Style skills
        "kawaii-colors", "kawaii-ui", "kawaii-3d",
        # Effects
        "visual-polish-2d", "visual-polish-3d",
    ]

    # Excluded skills (from v1)
    excluded_skills = [
        "audio-mobile", "audio-synth", "game-audio",
        "particles", "particles-effects", "particles-explosion", "particles-setup",
        "sprite-sheet", "nanobanana", "kawaii-design", "p5js", "threejs",
    ]

    skill_list = "\n".join(f"- {s}" for s in available_skills)

    # Build prompt for skill detection
    prompt = f"""ユーザーのリクエストに最適なスキルを選んでJSON配列で出力してください。

利用可能なスキル:
{skill_list}

リクエスト: "{message}"
ディメンション: {dimension}
既存コード: {"あり" if existing_code else "なし"}

重要:
- 必ず{dimension}に対応したセットアップスキルを含める（p5js-setup または threejs-setup）
- 最大5個まで選択
- JSON配列のみを出力（説明不要）

出力例: ["p5js-setup", "p5js-input", "game-ai"]

出力:"""

    try:
        result = await run_haiku_in_sandbox(prompt, timeout_seconds=20)

        # Extract JSON array from response
        json_match = re.search(r'\[[\s\S]*?\]', result)
        if json_match:
            skills = json.loads(json_match.group())
            # Validate and filter skills
            valid_skills = [s for s in skills if s in available_skills and s not in excluded_skills]
            # Ensure we have at least the base setup skill
            if dimension == "3d" and "threejs-setup" not in valid_skills:
                valid_skills.insert(0, "threejs-setup")
            elif dimension == "2d" and "p5js-setup" not in valid_skills:
                valid_skills.insert(0, "p5js-setup")

            return JSONResponse({
                "skills": valid_skills[:5],
                "raw_response": result[:200],
            })
        else:
            raise ValueError("No JSON array found in response")

    except Exception as e:
        # Fallback to default skills based on dimension
        if dimension == "3d":
            fallback_skills = ["threejs-setup", "threejs-input", "threejs-lighting"]
        else:
            fallback_skills = ["p5js-setup", "p5js-input", "p5js-collision"]

        return JSONResponse({
            "skills": fallback_skills,
            "fallback": True,
            "error": str(e),
        })


@app.function(image=web_image, secrets=[api_proxy_secret, internal_secret, proxy_secret, vertex_ai_secret, vertex_config_secret])
@modal.fastapi_endpoint(method="POST")
async def chat_haiku(request: Request):
    """Handle chat requests using Claude Haiku in sandbox.

    Request body:
        {
            "message": "user's question",
            "game_spec": "SPEC.md content (optional)",
            "conversation_history": [{"role": "user/assistant", "content": "..."}],
            "system_prompt": "custom system prompt (optional, overrides default)",
            "raw_output": false  // if true, return raw text without JSON parsing
        }

    Response (default mode):
        {
            "message": "AI response",
            "suggestions": ["suggestion1", "suggestion2"]
        }

    Response (raw_output mode):
        {
            "result": "raw AI response text"
        }
    """
    from starlette.responses import JSONResponse

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    message = body.get("message", "")
    game_spec = body.get("game_spec", "")
    conversation_history = body.get("conversation_history", [])
    custom_system_prompt = body.get("system_prompt", "")
    raw_output = body.get("raw_output", False)

    if not message:
        return JSONResponse({"error": "message is required"}, status_code=400)

    print(f"[chat_haiku] Received message: {message[:50]}...")
    print(f"[chat_haiku] Mode: {'raw_output' if raw_output else 'default'}, custom_prompt: {bool(custom_system_prompt)}")

    # Build prompt
    if custom_system_prompt:
        # Use custom system prompt (for thumbnail generation, etc.)
        prompt = f"""{custom_system_prompt}

{message}"""
    else:
        # Default: game development Q&A mode
        prompt = """あなたはゲーム開発のアシスタントです。ユーザーが作成中のブラウザゲームについての質問に答えてください。

## あなたの役割
- ユーザーの質問に的確に答える
- 改善案やアイデアを提案する

## 回答のルール
- 簡潔で分かりやすい日本語で回答
- 技術的な内容は噛み砕いて説明
- 改善案やアイデアは**3つまで**に厳選

## suggestionsのルール
- 本文で提案した内容と対応させる
- 「〜して」という依頼形式で書く

"""

        if game_spec:
            prompt += f"""## ゲーム仕様書
{game_spec}

"""

        if conversation_history:
            recent_history = conversation_history[-10:]  # Last 10 messages
            prompt += "## 会話履歴\n"
            for msg in recent_history:
                role = "ユーザー" if msg.get("role") == "user" else "アシスタント"
                content = msg.get("content", "")[:500]
                prompt += f"{role}: {content}\n"
            prompt += "\n"

        prompt += f"""## ユーザーの質問（今回）
{message}

## 出力形式（必ず守ること）
JSON形式で出力。suggestionsは「〜して」形式で2-3個：
{{"message": "回答本文", "suggestions": ["アクション1", "アクション2"]}}"""

    try:
        print("[chat_haiku] Calling run_haiku_in_sandbox...")
        result = await run_haiku_in_sandbox(prompt, timeout_seconds=30)
        print(f"[chat_haiku] Result: {result[:200] if result else 'EMPTY'}")

        # Raw output mode: return text as-is
        if raw_output:
            return JSONResponse({
                "result": result.strip(),
            })

        # Default mode: try to parse JSON response
        import re
        json_match = re.search(r'\{[^{}]*"message"[^{}]*\}', result, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                return JSONResponse({
                    "message": parsed.get("message", result),
                    "suggestions": parsed.get("suggestions", []),
                })
            except json.JSONDecodeError:
                pass

        # Fallback: return raw result as message
        return JSONResponse({
            "message": result,
            "suggestions": [],
        })

    except Exception as e:
        print(f"[chat_haiku] ERROR: {type(e).__name__}: {e}")
        return JSONResponse({
            "error": str(e),
            "message": "申し訳ございません。回答の生成中にエラーが発生しました。",
            "suggestions": [],
        }, status_code=500)


@app.function(
    image=web_image,
    secrets=[api_proxy_secret, internal_secret, proxy_secret, vertex_ai_secret, vertex_config_secret],
)
@modal.fastapi_endpoint(method="POST")
async def generate_publish_info(request: Request):
    """Generate publish info (title, description, howToPlay, tags) using Claude Haiku.

    File contents are passed from the Express server (GCE) to avoid Volume sync issues.

    Request body:
        {
            "user_id": "uuid",
            "project_id": "uuid",
            "project_name": "My Game",
            "game_code": "index.html content (optional)",
            "spec_content": "spec.md content (optional)"
        }

    Response:
        {
            "title": "ゲームタイトル",
            "description": "ゲームの説明",
            "howToPlay": "操作方法",
            "tags": ["タグ1", "タグ2"]
        }
    """
    from starlette.responses import JSONResponse

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    user_id = body.get("user_id")
    project_id = body.get("project_id")
    project_name = body.get("project_name", "")
    game_code = body.get("game_code", "")
    spec_content = body.get("spec_content", "")

    # Validate IDs
    try:
        validate_ids(user_id, project_id)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    print(f"[generate_publish_info] Project: {project_name}, game_code: {len(game_code)} chars, spec: {len(spec_content)} chars")

    # Build prompt blocks (avoid nested f-strings with \n)
    spec_block = f"仕様書:\n{spec_content}\n" if spec_content else ""
    code_block = f"ゲームコード（抜粋）:\n{game_code[:3000]}\n" if game_code else ""

    # Build prompt for Haiku
    prompt = f"""以下のゲームプロジェクトの情報から、公開用のタイトル、概要、ルールと操作方法、タグを生成してください。

プロジェクト名: {project_name}

{spec_block}{code_block}
以下のJSON形式で回答してください（JSONのみ、他のテキストは不要）:
{{
  "title": "魅力的なゲームタイトル（50文字以内）",
  "description": "ゲームの概要説明（200文字程度、特徴や魅力を含む）",
  "howToPlay": "ルールと操作方法（300文字程度、具体的な操作方法とゲームのルールを説明）",
  "tags": ["タグ1", "タグ2", "タグ3"]
}}

タグは3〜5個、それぞれ10文字以内で。"""

    try:
        result = await run_haiku_in_sandbox(prompt, timeout_seconds=30)

        # Extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', result)
        if json_match:
            publish_info = json.loads(json_match.group())

            # Validate required fields
            required_fields = ["title", "description", "howToPlay", "tags"]
            for field in required_fields:
                if field not in publish_info:
                    raise ValueError(f"Missing required field: {field}")

            # Ensure tags is an array
            if not isinstance(publish_info.get("tags"), list):
                publish_info["tags"] = []

            return JSONResponse(publish_info)
        else:
            raise ValueError("No JSON found in response")

    except json.JSONDecodeError as e:
        return JSONResponse({
            "error": "Failed to parse AI response",
            "raw": result[:500] if result else "",
        }, status_code=500)

    except Exception as e:
        return JSONResponse({
            "error": str(e),
            "raw": result[:500] if 'result' in dir() else "",
        }, status_code=500)


# =============================================================================
# Skill Content Endpoint
# =============================================================================


@app.function(
    image=web_image,
    secrets=[internal_secret],
    volumes={MOUNT_GLOBAL: global_volume},
)
@modal.fastapi_endpoint(method="POST")
async def get_skill_content(request: Request):
    """Get skill content (SKILL.md) for Gemini prompt injection.

    Request body:
        { "skill_names": ["threejs-setup", "p5js-input", ...] }

    Response:
        { "skills": { "threejs-setup": "content...", ... } }

    Security:
        - X-Modal-Secret verification (internal API only)
        - Skill name sanitization (alphanumeric, dash, underscore only)
        - Path traversal prevention (realpath check)
        - Request size limit (max 20 skills)
        - Read-only access to /global/.claude/skills/ only

    Source: V1 claudeRunner.js readSkillContents() (lines 576-594)
    """
    from starlette.responses import JSONResponse

    # 1. Verify internal authentication
    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    skill_names = body.get("skill_names", [])

    if not isinstance(skill_names, list):
        return JSONResponse({"error": "skill_names must be an array"}, status_code=400)

    # 2. Limit request size to prevent DoS
    MAX_SKILLS = 20
    if len(skill_names) > MAX_SKILLS:
        return JSONResponse(
            {"error": f"Too many skills requested (max {MAX_SKILLS})"},
            status_code=400
        )

    skills_dir = f"{MOUNT_GLOBAL}/.claude/skills"
    skills_dir_realpath = os.path.realpath(skills_dir)
    result = {}

    for skill_name in skill_names:
        # 3. Sanitize skill name (alphanumeric, dash, underscore only)
        # This prevents path traversal via skill_name like "../../../etc/passwd"
        if not skill_name or not isinstance(skill_name, str):
            continue
        if not all(c.isalnum() or c in "-_" for c in skill_name):
            print(f"[get_skill_content] Invalid skill name rejected: {skill_name}")
            continue

        skill_path = f"{skills_dir}/{skill_name}/SKILL.md"

        # 4. Additional path traversal check using realpath
        try:
            real_skill_path = os.path.realpath(skill_path)
            if not real_skill_path.startswith(skills_dir_realpath + "/"):
                print(f"[get_skill_content] Path traversal attempt blocked: {skill_name}")
                continue
        except Exception:
            continue

        # 5. Read skill content
        try:
            if os.path.exists(skill_path) and os.path.isfile(skill_path):
                with open(skill_path, "r", encoding="utf-8") as f:
                    content = f.read()
                result[skill_name] = content
            else:
                print(f"[get_skill_content] Skill not found: {skill_name}")
        except Exception as e:
            print(f"[get_skill_content] Error reading {skill_name}: {e}")

    return JSONResponse({"skills": result})


# =============================================================================
# Gemini Generation Endpoint
# =============================================================================


@app.function(
    image=web_image.pip_install("httpx", "Pillow"),  # Pillow for image generation
    secrets=[api_proxy_secret, internal_secret, proxy_secret, vertex_ai_secret, vertex_config_secret],
    volumes={
        MOUNT_DATA: data_volume,
        MOUNT_GLOBAL: global_volume,  # For /global/scripts/generate_image.py
    },
)
@modal.fastapi_endpoint(method="POST")
async def generate_gemini(request: Request):
    """Generate game code using Gemini API via Vertex AI.

    This endpoint is preferred for code generation due to:
    - Faster response time
    - Streaming support
    - JSON output format

    Falls back to Claude CLI on failure (handled by Next.js orchestrator).
    """
    from starlette.responses import StreamingResponse, JSONResponse
    import traceback

    try:
        import httpx
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GoogleAuthRequest
    except ImportError as e:
        return JSONResponse({"error": f"Import error: {e}"}, status_code=500)

    if not verify_internal_auth(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    user_id = body.get("user_id")
    project_id = body.get("project_id")
    prompt = body.get("prompt")

    try:
        validate_ids(user_id, project_id)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    if not prompt:
        return JSONResponse({"error": "prompt is required"}, status_code=400)

    # Vertex AI configuration
    gcp_project_id = os.environ.get(ENV_VERTEX_PROJECT_ID)
    gcp_region = os.environ.get(ENV_VERTEX_REGION)
    gcp_creds_json = os.environ.get(ENV_GCP_CREDENTIALS_JSON)

    if not all([gcp_project_id, gcp_region, gcp_creds_json]):
        return JSONResponse({"error": "Vertex AI not configured"}, status_code=500)

    project_dir = f"{MOUNT_DATA}/users/{user_id}/projects/{project_id}"

    def stream_gemini():
        import time

        start_time = time.time()

        try:
            yield f'data: {json.dumps({"type": "status", "message": "Gemini生成を開始..."})}\n\n'

            # Ensure project directory exists
            os.makedirs(project_dir, exist_ok=True)

            # Get OAuth access token from service account
            creds_info = json.loads(gcp_creds_json)
            credentials = service_account.Credentials.from_service_account_info(
                creds_info,
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            credentials.refresh(GoogleAuthRequest())
            access_token = credentials.token

            # Vertex AI Gemini endpoint (global - Gemini 3 models are only available globally)
            url = f"https://aiplatform.googleapis.com/v1/projects/{gcp_project_id}/locations/global/publishers/google/models/{GEMINI_MODEL}:streamGenerateContent?alt=sse"

            request_body = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 32768,
                    "responseMimeType": "application/json",
                },
            }

            yield f'data: {json.dumps({"type": "status", "message": "Vertex AI Geminiに接続中..."})}\n\n'

            # Use httpx for streaming with Bearer token auth (via Squid proxy)
            import httpx

            full_text = ""
            print(f"[generate_gemini] Using Vertex AI: project={gcp_project_id}, region={gcp_region}, model={GEMINI_MODEL}")

            # Build proxy URL for Vertex AI traffic
            proxy_url = get_proxy_url()
            print(f"[generate_gemini] Using proxy: {proxy_url.split('@')[1] if '@' in proxy_url else proxy_url}")

            print(f"[generate_gemini] Requesting: {url[:100]}...")
            with httpx.Client(timeout=120.0, proxy=proxy_url) as client:
                with client.stream(
                    "POST",
                    url,
                    json=request_body,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {access_token}",
                    },
                ) as response:
                    print(f"[generate_gemini] Response status: {response.status_code}")
                    if response.status_code != 200:
                        error_text = response.read().decode()
                        print(f"[generate_gemini] Error response: {error_text[:500]}")
                        # Classify HTTP errors
                        if response.status_code == 401:
                            error_info = get_api_error_info("AUTH_ERROR", f"HTTP 401: {error_text[:200]}")
                        elif response.status_code == 429:
                            error_info = get_api_error_info("RATE_LIMIT", f"HTTP 429: {error_text[:200]}")
                        elif response.status_code == 403:
                            error_info = get_api_error_info("AUTH_ERROR", f"HTTP 403: {error_text[:200]}")
                        elif response.status_code == 404:
                            error_info = get_api_error_info("NETWORK_ERROR", f"HTTP 404 (Model not found): {error_text[:200]}")
                        else:
                            error_info = get_api_error_info("NETWORK_ERROR", f"HTTP {response.status_code}: {error_text[:200]}")
                        error_info["fallback"] = "cli"
                        error_info["debug"] = f"URL: {url}, Status: {response.status_code}, Response: {error_text[:300]}"
                        yield f'data: {json.dumps(error_info)}\n\n'
                        return

                    yield f'data: {json.dumps({"type": "status", "message": "コード生成中..."})}\n\n'

                    buffer = ""
                    for line in response.iter_lines():
                        if not line:
                            continue

                        # SSE format: "data: {...}"
                        if line.startswith("data: "):
                            json_str = line[6:]
                            if json_str.strip() == "[DONE]":
                                continue

                            try:
                                data = json.loads(json_str)
                                text = (
                                    data.get("candidates", [{}])[0]
                                    .get("content", {})
                                    .get("parts", [{}])[0]
                                    .get("text", "")
                                )
                                if text:
                                    full_text += text
                                    # Stream chunk to frontend
                                    yield f'data: {json.dumps({"type": "stream", "content": text})}\n\n'
                            except json.JSONDecodeError:
                                # Incomplete chunk, buffer it
                                buffer += json_str

            # Parse the JSON response (V1-style: simple parse, fail fast)
            if not full_text:
                error_info = get_api_error_info("NETWORK_ERROR", "Gemini returned empty response")
                error_info["fallback"] = "cli"
                yield f'data: {json.dumps(error_info)}\n\n'
                return

            try:
                # Simple JSON parse - V1 style
                result_json = json.loads(full_text.strip())

                # Extract files and images from result
                # Handle array, object with files/images, or single file object
                if isinstance(result_json, list):
                    # Array format: [{"filename": "...", "content": "..."}]
                    raw_files = result_json
                    raw_images = []
                elif "files" in result_json or "images" in result_json:
                    # Object format: {"files":[...], "images":[...]}
                    raw_files = result_json.get("files", [])
                    raw_images = result_json.get("images", [])
                elif "content" in result_json or "code" in result_json:
                    # Single file object: {"filename": "...", "content": "..."}
                    raw_files = [result_json]
                    raw_images = []
                else:
                    raw_files = []
                    raw_images = []

                # Separate actual files from image specs that may be mixed in
                files = []
                images = list(raw_images)  # Start with explicit images

                for item in raw_files:
                    if not isinstance(item, dict):
                        continue
                    # If item has "content" key, it's a file
                    if "content" in item:
                        files.append(item)
                    # If item has "prompt" key (and no content), it's an image spec
                    elif "prompt" in item and "name" in item:
                        images.append(item)

                # Extract mode and summary (only available in object format)
                if isinstance(result_json, dict):
                    mode = result_json.get("mode", "create")
                    summary = result_json.get("summary", "")
                else:
                    mode = "create"
                    summary = ""

                if not files:
                    yield f'data: {json.dumps({"type": "error", "message": "Gemini returned no files", "fallback": "cli"})}\n\n'
                    return

                yield f'data: {json.dumps({"type": "status", "message": "ファイルを保存中..."})}\n\n'

                # Write files to project directory
                written_files = []
                for file_info in files:
                    # Handle various key names for filename
                    file_path = file_info.get("path") or file_info.get("file") or file_info.get("filename") or file_info.get("name") or file_info.get("title", "index.html")
                    # Handle various key names for content
                    content = file_info.get("content") or file_info.get("code", "")

                    # Sanitize path
                    if ".." in file_path or file_path.startswith("/"):
                        continue

                    full_path = os.path.join(project_dir, file_path)

                    # Create parent directories
                    parent_dir = os.path.dirname(full_path)
                    if parent_dir:
                        os.makedirs(parent_dir, exist_ok=True)

                    # Write file
                    with open(full_path, "w", encoding="utf-8") as f:
                        f.write(content)

                    written_files.append({
                        "path": file_path,
                        "size": len(content.encode("utf-8")),
                    })

                # Generate images if requested (2D games only)
                generated_images = []
                if images and len(images) > 0:
                    yield f'data: {json.dumps({"type": "status", "message": f"画像を生成中... ({len(images)}枚)"})}\n\n'

                    # Create assets directory
                    assets_dir = os.path.join(project_dir, "assets")
                    os.makedirs(assets_dir, exist_ok=True)

                    # Limit to 3 images per request
                    images_to_generate = images[:3]

                    for img_info in images_to_generate:
                        img_name = img_info.get("name", "image.png")
                        img_prompt = img_info.get("prompt", "")

                        if not img_prompt:
                            continue

                        # Sanitize filename
                        if ".." in img_name or img_name.startswith("/"):
                            continue

                        img_path = os.path.join(assets_dir, img_name)

                        yield f'data: {json.dumps({"type": "status", "message": f"生成中: {img_name}"})}\n\n'

                        try:
                            # Call image generation script via Vertex AI
                            import subprocess
                            result = subprocess.run(
                                [
                                    "python3",
                                    "/global/scripts/generate_image.py",
                                    "--prompt", img_prompt,
                                    "--output", img_path,
                                    "--transparent",
                                ],
                                capture_output=True,
                                text=True,
                                timeout=120,  # Image generation needs more time
                                env={
                                    **os.environ,
                                    # Pass Vertex AI config for image generation
                                    "ANTHROPIC_VERTEX_PROJECT_ID": gcp_project_id,
                                    "CLOUD_ML_REGION": gcp_region,
                                    "GOOGLE_APPLICATION_CREDENTIALS_JSON": gcp_creds_json,
                                    # Proxy for Vertex AI (through Squid)
                                    "HTTP_PROXY": proxy_url,
                                    "HTTPS_PROXY": proxy_url,
                                },
                            )

                            if result.returncode == 0 and os.path.exists(img_path):
                                img_size = os.path.getsize(img_path)
                                generated_images.append({
                                    "path": f"assets/{img_name}",
                                    "size": img_size,
                                })
                                yield f'data: {json.dumps({"type": "status", "message": f"✓ {img_name} 生成完了"})}\n\n'
                            else:
                                yield f'data: {json.dumps({"type": "log", "content": f"Image generation failed for {img_name}: {result.stderr[:200]}", "level": "warn"})}\n\n'

                        except subprocess.TimeoutExpired:
                            yield f'data: {json.dumps({"type": "log", "content": f"Image generation timed out for {img_name}", "level": "warn"})}\n\n'
                        except Exception as img_err:
                            yield f'data: {json.dumps({"type": "log", "content": f"Image generation error for {img_name}: {str(img_err)}", "level": "warn"})}\n\n'

                # Git commit for version history
                yield f'data: {json.dumps({"type": "status", "message": "バージョン履歴を保存中..."})}\n\n'
                git_dir = os.path.join(project_dir, ".git")
                safe_dir_arg = f"safe.directory={project_dir}"
                git_commit_hash = None
                try:
                    import subprocess

                    # Initialize git if not exists
                    if not os.path.exists(git_dir):
                        subprocess.run(
                            ["git", "-c", safe_dir_arg, "-C", project_dir, "init"],
                            capture_output=True, timeout=10
                        )
                        subprocess.run(
                            ["git", "-c", safe_dir_arg, "-C", project_dir, "config", "user.email", "gamecreator@dreamcore.app"],
                            capture_output=True, timeout=5
                        )
                        subprocess.run(
                            ["git", "-c", safe_dir_arg, "-C", project_dir, "config", "user.name", "Game Creator"],
                            capture_output=True, timeout=5
                        )
                        yield f'data: {json.dumps({"type": "log", "content": "Git repository initialized", "level": "info"})}\n\n'

                    # Stage all changes
                    subprocess.run(
                        ["git", "-c", safe_dir_arg, "-C", project_dir, "add", "-A"],
                        capture_output=True, timeout=30
                    )

                    # Commit with summary as message
                    commit_message = summary[:50] if summary else "Update via Gemini"
                    commit_result = subprocess.run(
                        ["git", "-c", safe_dir_arg, "-C", project_dir, "commit", "-m", commit_message],
                        capture_output=True, text=True, timeout=30
                    )

                    # Get commit hash if successful
                    if commit_result.returncode == 0:
                        hash_result = subprocess.run(
                            ["git", "-c", safe_dir_arg, "-C", project_dir, "rev-parse", "--short", "HEAD"],
                            capture_output=True, text=True, timeout=5
                        )
                        if hash_result.returncode == 0:
                            git_commit_hash = hash_result.stdout.strip()
                            yield f'data: {json.dumps({"type": "log", "content": f"Git commit created: {git_commit_hash}", "level": "info"})}\n\n'
                    else:
                        # Commit may fail if nothing to commit (same content)
                        yield f'data: {json.dumps({"type": "log", "content": "No changes to commit (files unchanged)", "level": "info"})}\n\n'

                except subprocess.TimeoutExpired:
                    yield f'data: {json.dumps({"type": "log", "content": "Git operation timed out", "level": "warn"})}\n\n'
                except Exception as git_err:
                    yield f'data: {json.dumps({"type": "log", "content": f"Git error: {str(git_err)}", "level": "warn"})}\n\n'

                # Commit volume changes
                data_volume.commit()

                elapsed = time.time() - start_time

                # Combine written files and generated images
                all_files = written_files + generated_images

                # Send result
                result_data = {"type": "result", "mode": mode, "files": all_files, "summary": summary, "images_generated": len(generated_images)}
                if git_commit_hash:
                    result_data["git_commit"] = git_commit_hash
                yield f'data: {json.dumps(result_data)}\n\n'
                yield f'data: {json.dumps({"type": "done", "exit_code": 0, "duration_ms": int(elapsed * 1000), "generator": "gemini"})}\n\n'

            except json.JSONDecodeError as e:
                # V1-style: fail fast, signal CLI fallback (not user-facing)
                print(f"[Error] JSON parse failed: {e}")
                error_info = get_api_error_info("UNKNOWN_ERROR", f"JSON parse: {str(e)}")
                error_info["fallback"] = "cli"
                yield f'data: {json.dumps(error_info)}\n\n'

        except httpx.TimeoutException as e:
            print(f"[generate_gemini] Timeout: {e}")
            error_info = get_api_error_info("API_TIMEOUT", f"Gemini API timeout: {str(e)}")
            error_info["fallback"] = "cli"
            yield f'data: {json.dumps(error_info)}\n\n'
        except httpx.RequestError as e:
            print(f"[generate_gemini] Request error: {type(e).__name__}: {e}")
            error_info = get_api_error_info("NETWORK_ERROR", f"{type(e).__name__}: {str(e)}")
            error_info["fallback"] = "cli"
            error_info["debug"] = f"URL: {url}"
            yield f'data: {json.dumps(error_info)}\n\n'
        except Exception as e:
            import traceback
            elapsed = time.time() - start_time
            print(f"[generate_gemini] Exception: {type(e).__name__}: {e}")
            print(traceback.format_exc())
            error_info = get_api_error_info("UNKNOWN_ERROR", f"{type(e).__name__}: {str(e)}")
            error_info["fallback"] = "cli"
            error_info["elapsed_seconds"] = round(elapsed, 2)
            error_info["debug"] = f"{type(e).__name__}: {str(e)[:200]}"
            yield f'data: {json.dumps(error_info)}\n\n'

    return StreamingResponse(stream_gemini(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)


# Health endpoint removed to stay within Starter plan limit (8 endpoints)
# Modal Dashboard provides built-in monitoring as alternative
# Uncomment below if upgrading to Team plan
#
# @app.function(image=web_image)
# @modal.fastapi_endpoint(method="GET")
# async def health():
#     """Health check endpoint."""
#     from starlette.responses import JSONResponse
#     return JSONResponse({
#         "status": "healthy",
#         "app": APP_NAME,
#         "version": APP_VERSION,
#     })
