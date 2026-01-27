# DreamCore-V2 → Next.js + Modal 移行計画

作成日: 2026-01-27
更新日: 2026-01-27
ベース: DreamCore-V2（Supabase Auth + RLS 移行済み）
参考: DreamCore-V2-modal エンジニア実装

---

## 目的

- **UXは完全維持**: 画面デザイン・操作フローをDreamCore-V2と同一に保つ
- **フロントエンド**: Express静的配信 → Next.js (Vercel)
- **通信方式**: WebSocket → SSE (Server-Sent Events)
- **バックエンド**: Node.js → Modal Sandbox (gVisor)
- **セキュリティ強化**: VM級隔離 + 4層防御アーキテクチャ

---

## 現状 vs 移行後

| 項目 | 現状 (V2) | 移行後 (Next.js + Modal) |
|------|-----------|--------------------------|
| **フロントエンド** | Express静的配信 | Next.js (Vercel) |
| **リアルタイム通信** | WebSocket | SSE (Server-Sent Events) |
| **認証** | Supabase Auth | Supabase Auth（変更なし） |
| **DB** | Supabase PostgreSQL | Supabase PostgreSQL（変更なし） |
| **ゲーム生成** | ローカル Claude CLI | Modal Sandbox (gVisor) |
| **画像生成** | ローカル Gemini API | Modal Function |
| **ファイル保存** | ローカル `/data/` | Modal Volume |
| **サーバー管理** | 必要（EC2等） | 不要（サーバーレス） |
| **スケーリング** | 手動 | 自動 |

---

## アーキテクチャ（移行後）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User's Browser                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  React/Next.js App                                                   │   │
│  │  - Chat Interface                                                    │   │
│  │  - Game Preview (iframe sandbox="allow-scripts")                    │   │
│  │  - Project Management                                                │   │
│  │  - SSE (EventSource) for streaming                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ HTTPS + JWT
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Vercel Edge Network                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Next.js API Routes                                                  │   │
│  │  - /api/generate      → ゲーム生成オーケストレーション (SSE)        │   │
│  │  - /api/preview/[id]  → セキュアファイル配信                        │   │
│  │  - /api/projects      → プロジェクトCRUD                            │   │
│  │  - /api/assets        → アセット管理                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ X-Modal-Secret (Internal Auth)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Modal Cloud                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Web Endpoints (FastAPI)                                              │ │
│  │  - generate_game     : Claude CLI でゲーム生成（SSE）                 │ │
│  │  - generate_gemini   : Gemini API で高速生成（SSE）                  │ │
│  │  - get_file          : プロジェクトファイル取得                      │ │
│  │  - detect_intent     : ユーザー意図検出（Haiku）                     │ │
│  │  - detect_skills     : 必要スキル検出（Haiku）                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                     │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Modal Sandbox (gVisor VM-level Isolation)                            │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  Per-Request Isolated Container                                  │ │ │
│  │  │  - User: claude (non-root, UID 1000)                            │ │ │
│  │  │  - Memory: 2GB limit                                             │ │ │
│  │  │  - Timeout: 10 minutes                                           │ │ │
│  │  │  - Claude Code CLI installed                                     │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Modal Volumes (Persistent Storage)                                   │ │
│  │  - dreamcore-data   : /data/users/{userId}/projects/{projectId}/    │ │
│  │  - dreamcore-global : /.claude/skills/, /scripts/                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Supabase (PostgreSQL + Auth)                          │
│  - User authentication (Google OAuth)                                        │
│  - Project metadata                                                          │
│  - Chat history                                                              │
│  - RLS policies for data isolation                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4層防御アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 1: UUID Validation                                                    │
│  ├── user_id, project_id は UUID 形式のみ許可                               │
│  ├── 正規表現: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i │
│  └── パストラバーサル攻撃を完全ブロック                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 2: Path-Based Isolation                                               │
│  ├── パス構築: /data/users/{UUID}/projects/{UUID}/                          │
│  └── 別ユーザーのディレクトリへのアクセスは物理的に不可能                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 3: gVisor Sandbox                                                     │
│  ├── 各リクエストは独立したコンテナで実行                                   │
│  ├── gVisor による VM 級隔離                                                │
│  └── Claude Code Web と同等のセキュリティレベル                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 4: File Path Validation                                               │
│  ├── ファイルパスに ".." が含まれていたら拒否                               │
│  ├── 絶対パス（"/"で開始）は拒否                                            │
│  └── システムパス（/etc, /proc, /dev）へのアクセスをブロック                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 移行範囲

### 移行するもの

| カテゴリ | 移行内容 |
|---------|----------|
| **フロントエンド** | Express静的配信 → Next.js App Router |
| **リアルタイム通信** | WebSocket → SSE (EventSource) |
| **ゲーム生成** | claudeRunner.js → Modal generate_game |
| **画像生成** | geminiClient.js → Modal generate_gemini |
| **ファイルI/O** | userManager.js → Modal Volume |
| **API** | Express routes → Next.js API Routes |

### 移行しないもの（Supabase維持）

- Supabase Auth (Google OAuth)
- Supabase PostgreSQL（テーブル構造・RLS）
- 認証フロー（JWT検証ロジック）

---

## 移行フェーズ

### Phase 0: 準備（1週間）

- [ ] Modalアカウント作成・設定
- [ ] Next.jsプロジェクト初期化
- [ ] Vercelプロジェクト作成
- [ ] Modal Secrets設定
- [ ] Modal Volumes作成（dreamcore-data, dreamcore-global）
- [ ] スキルアップロードスクリプト作成

### Phase 1: Next.js基盤構築（1週間）

- [ ] Next.js App Router構成
- [ ] Supabase Auth統合（既存ロジック移植）
- [ ] 基本ページ移植（ログイン、プロジェクト一覧）
- [ ] JWT検証ミドルウェア実装
- [ ] Vercelデプロイ設定

### Phase 2: Modal Backend構築（2週間）

- [ ] Modal app.py 実装
  - [ ] generate_game（Claude CLI + SSE）
  - [ ] generate_gemini（Gemini高速パス）
  - [ ] get_file / list_files / apply_files
  - [ ] detect_intent / detect_skills
- [ ] gVisor Sandbox設定
- [ ] X-Modal-Secret認証実装
- [ ] SSEストリーミング実装

### Phase 3: フロントエンド移植（2週間）

- [ ] エディタページ（project.html → /project/[id]）
- [ ] SSEクライアント実装（WebSocket置き換え）
- [ ] プレビューページ（play.html → /play/[id]）
- [ ] 公開ページ（publish.html → /publish/[id]）
- [ ] アセット管理UI

### Phase 4: API Routes実装（1週間）

- [ ] /api/generate（SSEオーケストレーション）
- [ ] /api/projects（CRUD）
- [ ] /api/assets（アップロード・取得・削除）
- [ ] /api/preview/[projectId]/[...path]（セキュアファイル配信）

### Phase 5: 統合・テスト（1週間）

- [ ] E2Eテスト実装
- [ ] パフォーマンステスト
- [ ] セキュリティテスト
- [ ] ステージング環境検証

### Phase 6: 本番切り替え（1週間）

- [ ] DNS切り替え
- [ ] モニタリング設定
- [ ] ロールバック手順確認
- [ ] ドキュメント更新

---

## WebSocket → SSE 変更

### Before (WebSocket)

```javascript
// public/app.js
const ws = new WebSocket('wss://api.dreamcore.com/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'init', access_token: token }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'stream') handleStream(msg.content);
  if (msg.type === 'gameUpdated') handleGameUpdated();
};

// ゲーム生成リクエスト
ws.send(JSON.stringify({ type: 'message', projectId, message: userInput }));
```

### After (SSE)

```javascript
// app/components/ChatInterface.tsx
const generateGame = async (projectId: string, message: string) => {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ projectId, message }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'stream') handleStream(data.content);
        if (data.type === 'done') handleGameUpdated();
      }
    }
  }
};
```

---

## SSE Event Types

| Type | Description | Example |
|------|-------------|---------|
| `stream` | Claude出力チャンク | `{"type":"stream","content":"..."}` |
| `result` | 生成ファイル | `{"type":"result","html":"..."}` |
| `question` | Dimension/Style選択 | `{"type":"question","question_type":"dimension"}` |
| `done` | 完了シグナル | `{"type":"done","exit_code":0}` |
| `error` | エラー | `{"type":"error","message":"..."}` |

---

## Volume構造

```
dreamcore-data/                      ← ユーザーデータ（読み書き可能）
└── users/
    └── {userId}/                    ← UUID形式のみ許可
        ├── projects/
        │   └── {projectId}/
        │       ├── index.html
        │       ├── style.css
        │       ├── assets/
        │       └── .claude/
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

---

## 環境変数

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

# Secrets
MODAL_INTERNAL_SECRET=<random-hex-64>
PREVIEW_SIGNING_SECRET=<random-hex-64>
```

### Modal Secrets

```bash
modal secret create anthropic-api-key ANTHROPIC_API_KEY=sk-ant-...
modal secret create modal-internal-secret MODAL_INTERNAL_SECRET=...
modal secret create gemini-api-key GEMINI_API_KEY=...
```

---

## ロールバック計画

### トリガー条件
- 本番切り替え後に重大なエラー
- パフォーマンス著しく低下
- Modal障害

### 手順
1. DNS を旧サーバー（Express版）に切り替え
2. 旧サーバー起動確認
3. データ同期確認（Volume → ローカル）

### 事前準備
- 旧Express版サーバーを1週間維持
- データ同期スクリプト準備

---

## 成功基準

| 項目 | 基準 |
|------|------|
| **UXパリティ** | 画面・操作がV2と同一 |
| **レイテンシ** | 初回生成がV2比+30%以内 |
| **可用性** | 99.5%以上 |
| **隔離性** | ユーザー間でファイルアクセス不可 |
| **コスト** | サーバー費用削減（従量課金化） |

---

## 参考ドキュメント

- `/Users/admin/DreamCore-V2-modal/docs/modal-architecture/ENGINEER-BRIEFING.md`
- `/Users/admin/DreamCore-V2-modal/docs/modal-architecture/MODAL-SANDBOX-ARCHITECTURE.md`
- `/Users/admin/DreamCore-V2-modal/docs/modal-architecture/QUICK-REFERENCE.md`
