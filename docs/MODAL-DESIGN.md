# Modal + Next.js 技術設計書

作成日: 2026-01-27
更新日: 2026-01-27
参考: DreamCore-V2-modal エンジニア実装

---

## システム概要

```
Browser ──JWT──▶ Vercel (Next.js) ──X-Modal-Secret──▶ Modal ──▶ gVisor Sandbox
                       │                                              │
                       ▼                                              ▼
                  Supabase                                      Claude CLI
                  (Auth + DB)                                   (Code Gen)
```

---

## 1. Modal Sandbox設計

### Sandbox Image構成

```python
# modal/app.py
sandbox_image = modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "ca-certificates", "nodejs", "npm")
    .pip_install("Pillow", "httpx")
    .run_commands(
        # Claude Code CLI インストール
        "npm install -g @anthropic-ai/claude-code",
        # 非rootユーザー作成
        "useradd -m -s /bin/bash claude"
    )
```

### Sandbox実行パラメータ

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `timeout` | 600秒 | 最大実行時間（10分） |
| `memory` | 2048MB | メモリ上限 |
| `user` | claude (UID 1000) | 非root実行 |
| `isolation` | gVisor | VM級隔離 |

### gVisor隔離の特徴

```
┌─────────────────────────────────────────────────────────┐
│  Host Kernel                                             │
│  ┌─────────────────────────────────────────────────────┐│
│  │  gVisor Sentry (User-space Kernel)                  ││
│  │  - System call interception                         ││
│  │  - Kernel attack surface minimization               ││
│  │  ┌─────────────────────────────────────────────────┐││
│  │  │  Sandbox Container                              │││
│  │  │  - Claude Code CLI                              │││
│  │  │  - User's generated code (isolated)             │││
│  │  └─────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## 2. Modal Volume設計

### Volume構成

```
dreamcore-data/                      ← ユーザーデータ（読み書き可能）
└── users/
    └── {userId}/                    ← UUID形式のみ許可
        ├── projects/
        │   └── {projectId}/
        │       ├── index.html
        │       ├── style.css
        │       ├── script.js
        │       ├── assets/
        │       │   ├── player.png
        │       │   └── enemy.png
        │       └── .claude/
        │           └── skills/      ← プロジェクト固有スキル
        └── assets/                  ← ユーザーグローバルアセット

dreamcore-global/                    ← グローバルリソース（読み取り専用）
├── .claude/
│   └── skills/                      ← 共有スキル
│       ├── p5js-setup/
│       ├── threejs-setup/
│       ├── kawaii-colors/
│       └── ...
└── scripts/
    └── generate_image.py
```

### Volume作成

```bash
# Modal CLI で作成
modal volume create dreamcore-data
modal volume create dreamcore-global

# スキルアップロード
cd modal
modal run upload_skills.py
```

---

## 3. Modal Endpoints設計

### FastAPI Endpoints

```python
# modal/app.py
import modal
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse

app = modal.App("dreamcore")
web_app = FastAPI()

# Volumes
data_volume = modal.Volume.from_name("dreamcore-data")
global_volume = modal.Volume.from_name("dreamcore-global")

# Secrets
secrets = [
    modal.Secret.from_name("anthropic-api-key"),
    modal.Secret.from_name("modal-internal-secret"),
    modal.Secret.from_name("gemini-api-key"),
]

@web_app.post("/generate_game")
async def generate_game(
    request: GenerateRequest,
    x_modal_secret: str = Header(...),
):
    """Claude CLIでゲーム生成（SSE）"""
    validate_secret(x_modal_secret)
    validate_uuid(request.user_id)
    validate_uuid(request.project_id)

    return StreamingResponse(
        generate_stream(request),
        media_type="text/event-stream",
    )

@web_app.post("/generate_gemini")
async def generate_gemini(
    request: GenerateRequest,
    x_modal_secret: str = Header(...),
):
    """Gemini APIで高速生成（SSE）"""
    validate_secret(x_modal_secret)
    return StreamingResponse(
        gemini_stream(request),
        media_type="text/event-stream",
    )

@web_app.get("/get_file")
async def get_file(
    user_id: str,
    project_id: str,
    path: str,
    x_modal_secret: str = Header(...),
):
    """プロジェクトファイル取得"""
    validate_secret(x_modal_secret)
    validate_uuid(user_id)
    validate_uuid(project_id)
    validate_path(path)

    file_path = f"/data/users/{user_id}/projects/{project_id}/{path}"
    with data_volume.open(file_path, "r") as f:
        return {"content": f.read()}

@web_app.post("/detect_intent")
async def detect_intent(
    request: IntentRequest,
    x_modal_secret: str = Header(...),
):
    """ユーザー意図検出（Haiku）"""
    validate_secret(x_modal_secret)
    # Claude Haiku で intent 判定
    intent = await detect_with_haiku(request.message)
    return {"intent": intent}

@web_app.post("/detect_skills")
async def detect_skills(
    request: SkillRequest,
    x_modal_secret: str = Header(...),
):
    """必要スキル検出（Haiku）"""
    validate_secret(x_modal_secret)
    skills = await detect_skills_with_haiku(
        request.message,
        request.dimension,
    )
    return {"skills": skills}
```

### Endpoint一覧

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/generate_game` | POST | Claude CLIでゲーム生成（SSE） | X-Modal-Secret |
| `/generate_gemini` | POST | Gemini APIで高速生成（SSE） | X-Modal-Secret |
| `/get_file` | GET | プロジェクトファイル取得 | X-Modal-Secret |
| `/list_files` | GET | プロジェクトファイル一覧 | X-Modal-Secret |
| `/apply_files` | POST | 外部生成ファイル適用 | X-Modal-Secret |
| `/detect_intent` | POST | ユーザー意図検出（Haiku） | X-Modal-Secret |
| `/detect_skills` | POST | 必要スキル検出（Haiku） | X-Modal-Secret |
| `/get_skill_content` | POST | スキルMDコンテンツ取得 | X-Modal-Secret |

---

## 4. Next.js API Routes設計

### ディレクトリ構成

```
next/src/app/
├── api/
│   ├── generate/
│   │   └── route.ts          # SSEオーケストレーション
│   ├── projects/
│   │   ├── route.ts          # 一覧・作成
│   │   └── [id]/
│   │       └── route.ts      # 詳細・更新・削除
│   ├── assets/
│   │   ├── route.ts          # アップロード・一覧
│   │   └── [id]/
│   │       └── route.ts      # 取得・削除
│   ├── preview/
│   │   └── [projectId]/
│   │       └── [...path]/
│   │           └── route.ts  # セキュアファイル配信
│   └── chat/
│       └── save/
│           └── route.ts      # チャット履歴保存
├── (auth)/
│   ├── login/
│   │   └── page.tsx
│   └── callback/
│       └── route.ts
├── create/
│   └── page.tsx              # プロジェクト一覧
├── project/
│   └── [id]/
│       └── page.tsx          # エディタ
├── play/
│   └── [id]/
│       └── page.tsx          # プレビュー
└── publish/
    └── [id]/
        └── page.tsx          # 公開設定
```

### /api/generate/route.ts

```typescript
// next/src/app/api/generate/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  // 1. JWT検証
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { projectId, message } = await request.json();

  // 2. プロジェクト所有権チェック
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (!project) {
    return new Response('Not Found', { status: 404 });
  }

  // 3. Modal呼び出し（SSEプロキシ）
  const modalResponse = await fetch(process.env.MODAL_ENDPOINT!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Modal-Secret': process.env.MODAL_INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      user_id: user.id,
      project_id: projectId,
      message,
    }),
  });

  // 4. SSEストリームを転送
  return new Response(modalResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### /api/preview/[projectId]/[...path]/route.ts

```typescript
// セキュアファイル配信
import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; path: string[] } }
) {
  const { projectId, path } = params;
  const filePath = path.join('/');

  // 署名付きURL検証 or JWT検証
  const signature = request.nextUrl.searchParams.get('sig');
  if (signature) {
    const isValid = verifySignature(projectId, filePath, signature);
    if (!isValid) {
      return new Response('Invalid signature', { status: 403 });
    }
  } else {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 所有権チェック
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    if (!project || project.user_id !== user.id) {
      return new Response('Not Found', { status: 404 });
    }
  }

  // Modalからファイル取得
  const response = await fetch(
    `${process.env.MODAL_GET_FILE_ENDPOINT}?user_id=${userId}&project_id=${projectId}&path=${filePath}`,
    {
      headers: {
        'X-Modal-Secret': process.env.MODAL_INTERNAL_SECRET!,
      },
    }
  );

  const { content } = await response.json();
  const contentType = getContentType(filePath);

  return new Response(content, {
    headers: { 'Content-Type': contentType },
  });
}
```

---

## 5. 認証フロー

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Browser │────▶│  Next.js API │────▶│  Modal      │────▶│  Sandbox        │
│          │     │  (Vercel)    │     │  Backend    │     │  (gVisor)       │
└──────────┘     └──────────────┘     └─────────────┘     └─────────────────┘
      │                 │                    │                    │
      │  1. JWT Token   │                    │                    │
      │  (Authorization │                    │                    │
      │   Header)       │                    │                    │
      │────────────────▶│                    │                    │
      │                 │                    │                    │
      │                 │  2. JWT Verify     │                    │
      │                 │  (JWKS, local)     │                    │
      │                 │──────────┐         │                    │
      │                 │          │         │                    │
      │                 │◀─────────┘         │                    │
      │                 │                    │                    │
      │                 │  3. Project Owner  │                    │
      │                 │  Check (Supabase)  │                    │
      │                 │──────────┐         │                    │
      │                 │          │         │                    │
      │                 │◀─────────┘         │                    │
      │                 │                    │                    │
      │                 │  4. X-Modal-Secret │                    │
      │                 │────────────────────▶                    │
      │                 │                    │                    │
      │                 │                    │  5. UUID Validate  │
      │                 │                    │──────────┐         │
      │                 │                    │          │         │
      │                 │                    │◀─────────┘         │
      │                 │                    │                    │
      │                 │                    │  6. Sandbox Create │
      │                 │                    │───────────────────▶│
      │                 │                    │                    │
      │  7. SSE Stream  │◀───────────────────│◀───────────────────│
      │◀────────────────│                    │                    │
```

### 認証レイヤー

| レイヤー | 方式 | 検証内容 |
|---------|------|----------|
| Browser → Next.js | JWT (Supabase Auth) | ユーザー認証 |
| Next.js → Modal | X-Modal-Secret | 内部サービス間認証 |
| Modal内部 | UUID検証 | パストラバーサル防止 |
| Supabase | RLS | 所有権チェック（補完的） |

---

## 6. UUID検証

```python
# modal/app.py
import re

UUID_REGEX = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)

def validate_uuid(value: str) -> None:
    """UUID形式を検証。パストラバーサル攻撃を防止。"""
    if not UUID_REGEX.match(value):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid UUID format: {value}"
        )

def validate_path(path: str) -> None:
    """ファイルパスを検証。"""
    if '..' in path:
        raise HTTPException(status_code=400, detail="Invalid path: contains ..")
    if path.startswith('/'):
        raise HTTPException(status_code=400, detail="Invalid path: absolute path")
    if path.startswith(('/etc', '/proc', '/dev')):
        raise HTTPException(status_code=400, detail="Invalid path: system path")
```

---

## 7. SSEストリーミング

### Modal側（Python）

```python
# modal/app.py
async def generate_stream(request: GenerateRequest):
    """Claude CLI出力をSSEでストリーム"""
    project_dir = f"/data/users/{request.user_id}/projects/{request.project_id}"

    with modal.Sandbox.create(
        image=sandbox_image,
        volumes={"/data": data_volume, "/global": global_volume},
        secrets=secrets,
        timeout=600,
    ) as sb:
        # Claude CLI実行
        proc = sb.exec(
            "bash", "-c",
            f"cd {project_dir} && echo '{request.prompt}' | claude --output-format stream-json"
        )

        # 出力をSSEとしてストリーム
        for line in proc.stdout:
            yield f"data: {json.dumps({'type': 'stream', 'content': line})}\n\n"

        exit_code = proc.wait()
        yield f"data: {json.dumps({'type': 'done', 'exit_code': exit_code})}\n\n"
```

### Next.js側（TypeScript）

```typescript
// クライアント側でSSEを受信
async function* streamGenerate(projectId: string, message: string) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ projectId, message }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        yield data;
      }
    }
  }
}

// 使用例
for await (const event of streamGenerate(projectId, message)) {
  if (event.type === 'stream') {
    appendToChat(event.content);
  } else if (event.type === 'done') {
    refreshPreview();
  }
}
```

---

## 8. 環境変数

### Vercel (Next.js)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Modal Endpoints
MODAL_ENDPOINT=https://xxx--dreamcore-generate-game.modal.run
MODAL_GET_FILE_ENDPOINT=https://xxx--dreamcore-get-file.modal.run
MODAL_GEMINI_ENDPOINT=https://xxx--dreamcore-generate-gemini.modal.run
MODAL_SKILL_CONTENT_ENDPOINT=https://xxx--dreamcore-get-skill-content.modal.run

# Secrets
MODAL_INTERNAL_SECRET=<random-hex-64>
PREVIEW_SIGNING_SECRET=<random-hex-64>

# Optional
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://dreamcore.gg
```

### Modal Secrets

```bash
# 作成コマンド
modal secret create anthropic-api-key ANTHROPIC_API_KEY=sk-ant-...
modal secret create modal-internal-secret MODAL_INTERNAL_SECRET=$(openssl rand -hex 32)
modal secret create gemini-api-key GEMINI_API_KEY=...
```

---

## 9. デプロイ手順

### 初期セットアップ

```bash
# 1. Modal Secrets作成
modal secret create anthropic-api-key ANTHROPIC_API_KEY=sk-ant-...
modal secret create modal-internal-secret MODAL_INTERNAL_SECRET=$(openssl rand -hex 32)
modal secret create gemini-api-key GEMINI_API_KEY=...

# 2. Modal Volumes作成
modal volume create dreamcore-data
modal volume create dreamcore-global

# 3. スキルアップロード
cd modal
modal run upload_skills.py

# 4. Modalアプリデプロイ
modal deploy app.py

# 5. Vercel環境変数設定（ダッシュボードまたはCLI）
vercel env add MODAL_ENDPOINT
vercel env add MODAL_INTERNAL_SECRET
# ...

# 6. Vercelデプロイ
vercel --prod
```

### 更新時

```bash
# スキル変更時
cd modal && modal run upload_skills.py

# Modalアプリ変更時
cd modal && modal deploy app.py

# Next.js変更時
vercel --prod
```

---

## 10. モニタリング

### Modalログ

```bash
# リアルタイム監視
modal logs dreamcore --follow

# 特定エンドポイントのみ
modal logs dreamcore --filter="generate_game"
```

### テスト

```bash
cd modal/tests

# 全テスト実行
python run_all.py

# 個別テスト
python test_sandbox_io.py   # Sandbox I/O
python test_gvisor.py       # 隔離確認
python test_stream.py       # SSEストリーミング
python test_volume.py       # Volume永続化
python test_auth.py         # 認証
```

---

## 11. トラブルシューティング

| Issue | Check |
|-------|-------|
| 401 on Modal | X-Modal-Secret matches? |
| 401 on Next.js | JWT expired? |
| Files not persisting | `volume.commit()` called? |
| Skills not loading | `modal run upload_skills.py` run? |
| Sandbox timeout | Check complexity, increase timeout |
| SSE not streaming | Check Content-Type header |
