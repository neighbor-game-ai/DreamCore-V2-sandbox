# Modal Sandbox 実装 - エンジニア引き継ぎ文書

**作成日**: 2026-01-27
**最終更新**: 2026-01-27
**対象プロジェクト**: DreamCore-V2 Modal Sandbox 化

---

## 1. 最終決定アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                   │
│                    (変更なし・WebSocket)                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │ WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Server                                │
│   【UX/API契約の本体】                                            │
│   - 認証（JWT検証・Supabase Auth）                                │
│   - WebSocket管理                                                │
│   - DB操作（Supabase）                                           │
│   - アセット管理（/api/assets）                                   │
│   - SSE→WS変換                                                   │
│   - Modal呼び出し                                                │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP + SSE
                      │ X-Modal-Internal-Secret ヘッダー
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Modal Sandbox                                 │
│   【実行専用】                                                    │
│   - Claude CLI 実行 ✅ 動作確認済み                               │
│   - Python 実行 ✅ 動作確認済み                                   │
│   - Git 操作 ✅ 動作確認済み                                      │
│   - ファイル I/O                                                  │
│   ※ DB操作は行わない                                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Modal Volume                                  │
│     dreamcore-data: /data/users/{user_id}/projects/              │
│     dreamcore-global: /global (共有・読み取り専用)                │
└─────────────────────────────────────────────────────────────────┘
```

### 決定事項サマリ

| 項目 | 決定内容 |
|------|----------|
| UX | **完全維持**（WebSocketそのまま、フロントエンド変更なし） |
| Express | **UX/API契約の本体**（中継だけでなくDB・認証・アセット管理を担当） |
| Modal | **実行専用**（Claude CLI / Python / Git / ファイルI/O のみ） |
| DB操作 | **Express側に集約**（ModalにはSupabase認証情報を渡さない） |
| サンドボックス | Modal gVisor で実現 |
| スケール | Modal側が自動対応 |

### 守るべき前提

- 既存のWSメッセージ形式を維持（`{ type: ... }`）
- エンドポイント/パス/レスポンス構造は現状のまま
- SSE→WS変換をExpress側で吸収（UIにはSSEを見せない）
- Modalは"実行だけ"（UI/UXに触れない）

### 安全策

- `USE_MODAL=true/false` で即ロールバック可能
- UIは一切改修不要

---

## 2. SSE → WebSocket 変換ルール（固定）

### SSEイベント形式（DreamCore-V2-modal 実装準拠）

Modal からの SSE は以下の形式で送信される（`event:` 行なし、`data:` 行のみ）:

```
data: {"type":"status","message":"Starting generation..."}

data: {"type":"stream","content":"生成されたコード..."}

data: {"type":"done","success":true}

data: {"type":"error","error":"エラーメッセージ"}
```

### 変換マッピング

| SSE data.type | WS message type | 備考 |
|---------------|-----------------|------|
| `status` | `{ type: 'progress', message: ... }` | 進捗表示用 |
| `stream` | `{ type: 'stream', content: ... }` | ストリーミング出力 |
| `done` | `{ type: 'completed', result: ... }` | 正常完了 |
| `error` | `{ type: 'failed', error: ... }` | エラー終了 |

**実装例（Express側）**:
```javascript
// modalClient.js
function convertSseToWsEvent(sseData) {
  // sseData = { type: 'stream', content: '...' }
  const mapping = {
    'status': 'progress',
    'stream': 'stream',
    'done': 'completed',
    'error': 'failed'
  };
  return {
    ...sseData,
    type: mapping[sseData.type] || sseData.type
  };
}
```

---

## 3. 参照ドキュメント

### 移行計画・設計書（実装時に必ず参照）

| ドキュメント | パス | 内容 |
|-------------|------|------|
| 移行計画書 | `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-MIGRATION-PLAN.md` | 6フェーズの移行計画、4層防御、ロールバック計画 |
| 技術設計書 | `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-DESIGN.md` | modalClient.js、claudeRunner.js修正、SSE→WS変換の実装詳細 |
| V2アーキテクチャ | `/Users/admin/DreamCore-V2-sandbox/docs/ARCHITECTURE-V2.md` | 現行DreamCore-V2の正確なアーキテクチャ |

### Modal固有の参照資料

| ドキュメント | パス | 内容 |
|-------------|------|------|
| Modalアーキテクチャ | `/Users/admin/DreamCore-V2-sandbox/docs/modal-architecture/MODAL-SANDBOX-ARCHITECTURE.md` | Modal側の設計パターン、セキュリティ、I/O |
| クイックリファレンス | `/Users/admin/DreamCore-V2-sandbox/docs/modal-architecture/QUICK-REFERENCE.md` | Modalコマンド、SSEヘッダー、デバッグシグナル |

### 現行実装の参照（DreamCore-V2-sandbox）

| ファイル | パス | 参照理由 |
|----------|------|----------|
| Claude実行 | `/Users/admin/DreamCore-V2-sandbox/server/claudeRunner.js` | Modal統合の改修対象 |
| ジョブ管理 | `/Users/admin/DreamCore-V2-sandbox/server/jobManager.js` | ジョブキュー・状態管理 |
| 認証 | `/Users/admin/DreamCore-V2-sandbox/server/authMiddleware.js` | JWT検証ロジック |
| 設定 | `/Users/admin/DreamCore-V2-sandbox/server/config.js` | 環境変数・レート制限 |
| DB操作 | `/Users/admin/DreamCore-V2-sandbox/server/database-supabase.js` | Supabase操作（Express側で維持） |

### 既存Modal実装（再利用）

| ファイル | パス | 備考 |
|----------|------|------|
| Modal App | `/Users/admin/DreamCore-V2-modal/modal/app.py` | **これを再利用する** |

---

## 4. Modal化対象と対象外

### Modal化対象（実行をModalに移行）

| 機能 | 状態 | 備考 |
|------|------|------|
| Claude CLI 実行 | ✅ 動作確認済み | sandbox.exec() で実行 |
| Python スクリプト | ✅ 動作確認済み | subprocess または sandbox.exec() |
| Git 操作 | ✅ 動作確認済み | Volume内で実行 |
| ファイル I/O | ✅ 動作確認済み | Modal Volume に永続化 |

### Modal化対象外（Express側で維持）

| 機能 | 理由 |
|------|------|
| `/api/assets/*` | DB操作を伴うため |
| `/api/projects/*` | DB操作を伴うため |
| 認証・JWT検証 | セキュリティ上の理由 |
| WebSocket管理 | UX契約維持のため |
| Supabase操作 | DB操作はExpress集約方針 |

---

## 5. アセット管理（製品版必須）

アセット管理はExpress側で維持し、以下を復活させる:

### 必須コンポーネント

| コンポーネント | 説明 |
|---------------|------|
| `assets` テーブル | Supabase PostgreSQL でメタデータ管理 |
| `project_assets` テーブル | プロジェクトとアセットの関連付け |
| `/api/assets/:id` | アセット取得エンドポイント |
| `replaceAssetReferences()` | 生成コード内のアセット参照を解決 |

### アセットの流れ

```
1. ユーザーがアセットをアップロード
   → Express: /api/assets (POST)
   → Supabase Storage に保存
   → assets テーブルにメタデータ登録

2. ゲーム生成時
   → Modal: Claude CLI がコード生成
   → Express: replaceAssetReferences() でアセットURLを解決
   → ブラウザ: 正しいURLでアセット取得
```

---

## 6. 実装すべきコンポーネント

### 6.1 Modal側（Python）- 既存実装を再利用

**ファイル**: `/Users/admin/DreamCore-V2-modal/modal/app.py`（既存・再利用）

```python
# 既存のエンドポイントをそのまま使用
@app.function()
@modal.web_endpoint(method="POST")
async def generate(request: Request):
    # 1. X-Modal-Internal-Secret 検証
    # 2. リクエストパラメータ検証（UUID形式）
    # 3. Sandbox作成・実行
    # 4. SSEストリーム返却
```

**SSEイベント形式（既存実装準拠）**:
```
data: {"type":"status","message":"Starting generation..."}

data: {"type":"stream","content":"生成されたコード..."}

data: {"type":"done","success":true}

data: {"type":"error","error":"エラーメッセージ"}
```

### 6.2 Express側（JavaScript）

**ファイル**: `/Users/admin/DreamCore-V2-sandbox/server/modalClient.js`（新規作成）

```javascript
// SSEストリームを受信してイベントを返すジェネレーター
async function* streamFromModal(params) {
  const response = await fetch(MODAL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Modal-Internal-Secret': process.env.MODAL_INTERNAL_SECRET,
    },
    body: JSON.stringify(params),
  });

  // SSEパース（data: {"type":"...","content":"..."} 形式）
  // → yield { type: '...', content: '...' }
}

// SSE→WS変換
function convertSseToWsEvent(sseData) {
  const mapping = {
    'status': 'progress',
    'stream': 'stream',
    'done': 'completed',
    'error': 'failed'
  };
  return {
    ...sseData,
    type: mapping[sseData.type] || sseData.type
  };
}
```

**ファイル**: `/Users/admin/DreamCore-V2-sandbox/server/claudeRunner.js`（修正）

```javascript
const USE_MODAL = process.env.USE_MODAL === 'true';

async function runClaude(jobId, userId, projectId, message, options) {
  if (USE_MODAL) {
    return runClaudeOnModal(jobId, userId, projectId, message, options);
  } else {
    return runClaudeLocal(jobId, userId, projectId, message, options);
  }
}

async function runClaudeOnModal(jobId, userId, projectId, message, options) {
  const stream = modalClient.streamFromModal({
    user_id: userId,
    project_id: projectId,
    message,
    skills: options.skills,
  });

  for await (const sseData of stream) {
    const wsEvent = convertSseToWsEvent(sseData);
    switch (wsEvent.type) {
      case 'stream':
        jobManager.notifySubscribers(jobId, { type: 'stream', content: wsEvent.content });
        break;
      case 'completed':
        jobManager.completeJob(jobId, wsEvent.result);
        break;
      case 'failed':
        jobManager.failJob(jobId, wsEvent.error);
        break;
    }
  }
}
```

---

## 7. セキュリティ要件（4層防御）

| 層 | 実装箇所 | 検証内容 |
|----|----------|----------|
| 1. Express認証 | `authMiddleware.js` | JWT検証、Supabase Auth |
| 2. Modal内部認証 | `X-Modal-Internal-Secret` | 共有シークレット検証 |
| 3. パス検証 | Modal sandbox | UUID形式、パストラバーサル防止 |
| 4. gVisor隔離 | Modal Sandbox | VM レベル隔離 |

### UUID検証（全箇所で統一）

```javascript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

---

## 8. 環境変数

### Express側（追加）

```bash
# Modal統合
USE_MODAL=true                           # Modal使用フラグ（false=ローカル実行）
MODAL_ENDPOINT=https://xxx.modal.run/generate
MODAL_INTERNAL_SECRET=your-shared-secret # X-Modal-Internal-Secretヘッダー用
```

### Modal側

```bash
# Modal Secrets として設定
# ※ Supabase認証情報は含めない（DB操作はExpress側で行う）
modal secret create dreamcore-secrets \
  ANTHROPIC_API_KEY=sk-ant-xxx \
  MODAL_INTERNAL_SECRET=your-shared-secret
```

**重要**: `SUPABASE_URL` や `SUPABASE_SERVICE_ROLE_KEY` は Modal に渡さない。DB操作は Express 側に集約する。

---

## 9. Modal Volume 設定

```bash
# ボリューム作成
modal volume create dreamcore-data
modal volume create dreamcore-global

# マウント構成
dreamcore-data    → /data     # ユーザーデータ（読み書き）
dreamcore-global  → /global   # 共有スキル・スクリプト（読み取り専用）
```

### パス構造

```
/data/
└── users/
    └── {user_id}/
        └── projects/
            └── {project_id}/
                ├── index.html
                ├── game.js
                └── assets/

/global/
├── .claude/
│   └── skills/
│       ├── p5js-setup/
│       ├── threejs-setup/
│       └── ...
└── scripts/
    └── generate_image.py
```

---

## 10. テスト計画

### Phase 1: Modal単体テスト

```bash
# Modal CLIでローカルテスト（有効なUUID形式を使用）
modal run modal/app.py::generate --input '{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "project_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "message": "hello"
}'
```

### Phase 2: 統合テスト

1. `USE_MODAL=true` で Express起動
2. WebSocket経由でゲーム生成リクエスト
3. ストリーミング応答の確認
4. 生成ファイルの永続化確認

### Phase 3: 負荷テスト

- 同時接続数: 10, 50, 100
- Modal cold start の影響測定
- SSE→WS変換のレイテンシ測定

---

## 11. ロールバック計画

```javascript
// config.js
const USE_MODAL = process.env.USE_MODAL === 'true';

// 問題発生時: USE_MODAL=false で即座にローカル実行に戻る
```

**ロールバック手順**:
1. `USE_MODAL=false` に変更
2. Express再起動
3. ローカルClaude CLI実行に自動フォールバック

---

## 12. 実装優先順位

| 優先度 | タスク | 状態 | 担当 |
|--------|--------|------|------|
| 1 | Modal app.py 基本実装 | ✅ 動作確認済み | Modal側 |
| 2 | modalClient.js 実装 | 未着手 | Express側 |
| 3 | claudeRunner.js 統合 | 未着手 | Express側 |
| 4 | SSE→WS変換テスト | 未着手 | 統合 |
| 5 | Volume永続化テスト | 未着手 | Modal側 |
| 6 | アセット管理復活 | 未着手 | Express側 |
| 7 | 本番デプロイ・監視設定 | 未着手 | 両方 |

---

## 13. 命名規則（DreamCore-V2-modal に統一）

| 項目 | 本ドキュメント | 備考 |
|------|---------------|------|
| Modal ファイル | `modal/app.py` | 既存実装を再利用 |
| 環境変数 | `MODAL_INTERNAL_SECRET` | `X-Modal-Internal-Secret` ヘッダー用 |
| Volume マウント | `/global` | 共有スキル・スクリプト用 |
| SSE イベント | `data: {"type":"..."}` | `event:` 行なし |

---

## 14. 質問・連絡先

不明点があれば以下を参照:
- 移行計画の詳細: `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-MIGRATION-PLAN.md`
- 技術設計の詳細: `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-DESIGN.md`
- Modal固有の知識: `/Users/admin/DreamCore-V2-sandbox/docs/modal-architecture/`
- 既存Modal実装: `/Users/admin/DreamCore-V2-modal/modal/app.py`

---

## 15. Vertex AI 移行（詳細版）

### 15.1 目的とアーキテクチャ

- 目的: **Claude CLI を維持したまま Vertex AI 経由で Claude/Gemini を利用**
- ポイント: **Sandbox 内に実 API キーを置かない**（サービスアカウントで OAuth）
- 構成:
  - **Claude CLI (Vertex)**: `CLOUD_ML_REGION=us-east5` を使用
  - **Gemini (Vertex)**: **global エンドポイント**を使用
  - **通信経路**: Modal Sandbox → Squid（GCE）→ Google API（OAuth + aiplatform）

### 15.2 使うモデル名（仕様固定）

`vertex-claude-config` に以下を設定（Claude CLI は `--model opus/sonnet/haiku` を使い続ける）:

```
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-5@20251101
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5@20250929
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5@20251001
```

CLI 実行は従来通り:
- `claude --model opus`
- `claude --model sonnet`
- `claude --model haiku`

上記が **Vertex のモデルIDにマッピング**される（`ANTHROPIC_DEFAULT_*` を参照）。

### 15.3 必要な Secrets

1) **GCP サービスアカウント JSON**（Modal Secret）

```
modal secret create gcp-vertex-ai --force \
  GOOGLE_APPLICATION_CREDENTIALS_JSON="$(cat /Users/admin/DreamCore-V2-modal/dreamcore-472900-2d2afdbce239.json)"
```

2) **Vertex 設定**（Modal Secret）

```
modal secret create vertex-claude-config --force \
  ANTHROPIC_VERTEX_PROJECT_ID="dreamcore-472900" \
  CLOUD_ML_REGION="us-east5" \
  ANTHROPIC_DEFAULT_OPUS_MODEL="claude-opus-4-5@20251101" \
  ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-4-5@20250929" \
  ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-haiku-4-5@20251001"
```

**注意**: サービスアカウント JSON は **Git に入れない**（`.gitignore` 済み）。

### 15.4 ネットワーク（Squid allowlist）

Sandbox の `cidr_allowlist` は **GCE Proxy のみ** (`35.200.79.157/32`)。  
Google API への通信は Squid 経由で許可。

Squid 許可ドメイン:
- `oauth2.googleapis.com`
- `sts.googleapis.com`
- `aiplatform.googleapis.com`
- `us-east5-aiplatform.googleapis.com`
- `www.googleapis.com`

### 15.5 変更したコード（重要箇所）

**/Users/admin/DreamCore-V2-modal/modal/app.py**
- Vertex Secrets 追加
- `get_vertex_env()` / `write_gcp_credentials()` 追加
- `generate_game` / `run_haiku_in_sandbox` を Vertex 対応（`CLAUDE_CODE_USE_VERTEX=1`）
- `generate_gemini` を Vertex API 呼び出しに変更
- `shlex.quote()` で CLI コマンドの安全化

**/Users/admin/DreamCore-V2-modal/modal/scripts/generate_image.py**
- Vertex 画像生成を使用（`gemini-3-pro-image-preview`）
- `httpx.Client(trust_env=True)` で Squid を利用

### 15.6 検証手順（最小）

1) `detect_intent`（Haiku / Vertex）  
2) `generate_gemini`（Gemini / Vertex）  
3) Squid ログで `oauth2.googleapis.com` / `aiplatform.googleapis.com` / `us-east5-aiplatform.googleapis.com` を確認  
4) `generate_publish_info`（Haiku / Vertex）

---

## 16. 直近E2E結果（2026-01-29）

Vertex AI 移行後の最終チェック結果（本番相当環境で実施）:

1. `detect_intent`（Haiku / Vertex）: ✅ `{"intent":"edit"}`
2. `generate_gemini`（Gemini / Vertex）: ✅ `index.html` 生成
3. Squid ログ: ✅ `oauth2.googleapis.com` / `aiplatform.googleapis.com` / `us-east5-aiplatform.googleapis.com` 通過
4. `generate_publish_info`（Haiku / Vertex）: ✅ 応答（ゲームコード無し時は `No JSON found` を返す想定）

補足:
- Vertex AI の通信経路は Squid 経由で確認済み。
- Gemini 画像生成は `images` 配列を検出した場合のみ実行されるため、テスト時に未発火でも正常。

---

## 重要ポイント（まとめ）

1. **フロントエンドは一切変更しない** - WebSocket通信はそのまま維持
2. **ExpressはUX/API契約の本体** - 中継だけでなくDB・認証・アセット管理を担当
3. **Modalは実行専用** - Claude CLI / Python / Git / ファイルI/O のみ
4. **DB操作はExpress集約** - ModalにSupabase認証情報を渡さない
5. **SSE→WS変換は固定マッピング** - status→progress, stream→stream, done→completed, error→failed
6. **既存Modal実装を再利用** - `modal/app.py` をそのまま使用、新規作成しない
7. **命名はDreamCore-V2-modalに統一** - `MODAL_INTERNAL_SECRET`, `/global`, `data: {"type":"..."}`
