# DreamCore CLI Deploy 設計書

## ビジョンと思想

### DreamCore の最終目標

**DreamCore は「ゲーム版 Roblox / itch.io」を目指す。**

```
DreamCore = バイブコーディングで作ったゲームの
            ホスティング + バックエンド機能 を提供するプラットフォーム
```

単なる静的ホスティングではなく、ゲームに必要なバックエンド機能（リーダーボード、クラウドセーブ、実績、ソーシャル機能）をすべて提供する。

### DreamCore の本質

DreamCore は「**バイブコーディングで作ったゲームのホスティングプラットフォーム**」である。

内部で持つゲーム生成ロジック（Modal Sandbox + Claude）は、このビジョンからの派生機能に過ぎない。本質は「誰でもゲームを作って投稿できる場所」を提供すること。

### 背景

2025-2026年、Claude Code や Codex などの AI コーディング CLI が急速に普及した。多くのエンジニアが自分の環境でゲームを作れるようになった。

しかし、作ったゲームを公開する場所がない。GitHub Pages は設定が面倒。Vercel/Netlify はゲームに特化していない。

**DreamCore は「CLI から直接ゲームを投稿できる場所」を提供する。**

### 設計原則

| 原則 | 理由 |
|------|------|
| **CLI 完結** | エンジニアは GUI が嫌い。ブラウザ操作は最小限に |
| **即公開** | デプロイしたらすぐ遊べる。承認プロセスは不要 |
| **完全隔離** | 既存 DreamCore と DB・Storage を完全分離。セキュリティリスクを隔離 |
| **Claude Code Skills 優先** | 多くのユーザーが Claude Code を使っている。Skills として提供するのが自然 |
| **段階的拡張** | 静的ホスティングから始めて、バックエンド機能を順次追加 |

---

## 3つのデプロイ方法

DreamCore は 3 つの方法でゲームを公開できる。**CLI デプロイは完全に分離された環境を使用。**

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DreamCore Platform                          │
│                                                                     │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐│
│  │   DreamCore 内部生成        │    │   CLI デプロイ（新規）       ││
│  │   （既存機能）              │    │   ローカル / GitHub         ││
│  ├─────────────────────────────┤    ├─────────────────────────────┤│
│  │   Supabase A + Modal Volume │    │   Supabase B + Storage      ││
│  │   v2.dreamcore.gg/g/...     │    │   cli.dreamcore.gg/...    ││
│  └─────────────────────────────┘    └─────────────────────────────┘│
│              │                                │                     │
│              │         完全分離               │                     │
│              └────────────────────────────────┘                     │
│                             │                                       │
│                    同じ user_id で紐付け                             │
│                             ▼                                       │
│                  ┌────────────────────────┐                         │
│                  │   統合マイページ（将来）│                         │
│                  └────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

**重要:** CLI デプロイのゲームは `cli.dreamcore.gg` で配信する（セキュリティのため別オリジン）。

### 1. ローカルデプロイ

ローカル環境から直接デプロイ。最もシンプル。

```bash
dreamcore deploy ./my-game

✓ Deployed!
  https://cli.dreamcore.gg/g_7F2cK9wP1x
```

- ディレクトリを指定するだけ
- 内部処理は自動（ユーザーは ZIP 等を意識しない）
- 即座に公開 URL が返る

**ユースケース:**
- Claude Code でゲームを作った直後
- 素早くテスト公開したい
- CI/CD を設定する前の手動デプロイ

### 2. GitHub 連携（将来）

> **Note:** Phase 1 では実装しない。以下は将来の参考用。

`git push` で自動デプロイ。Vercel/Netlify と同じ体験。

```bash
git push origin main

# → 自動でデプロイ
# → DreamCore に反映
```

**2つの実現方法（将来）:**

#### A) GitHub App（フル連携）

```
1. DreamCore 設定画面でリポジトリを接続（初回のみ）
2. git push origin main
3. Webhook で自動検知 → デプロイ
```

- ボタン 1 クリックで接続
- ブランチプレビュー可能
- 実装コスト: 高

#### B) GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to DreamCore
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dreamcore/deploy-action@v1
        with:
          token: ${{ secrets.DREAMCORE_TOKEN }}
```

- ユーザーが Action を設定
- 柔軟なカスタマイズ可能
- 実装コスト: 低

**ユースケース:**
- 継続的デプロイ
- チーム開発
- 本番環境の運用

### 3. DreamCore 内部生成（既存機能）

DreamCore のチャット UI でゲームを生成し、そのまま公開。

```
チャット: 「シューティングゲームを作って」
  ↓
AI がゲーム生成
  ↓
「公開」ボタンで公開
```

- コーディング不要
- 非エンジニア向け
- **既存機能なので変更なし**

---

## 優先順位

| 順位 | 方法 | 理由 |
|------|------|------|
| 1 | **ローカルデプロイ** | 一番シンプル、すぐ使える、API のコア |
| 2 | **GitHub Actions** | ローカルデプロイ API を呼ぶだけ |
| 3 | **GitHub App** | 体験は最高だが実装コスト高 |
| - | 内部生成 | 既存機能、変更なし |

ローカルデプロイの API を先に作れば、GitHub Actions も自動的に対応できる。

---

## 対象ユーザー

- Claude Code ユーザー
- Codex ユーザー
- Cursor ユーザー
- その他 CLI でコーディングする人
- GitHub でゲームを管理している人

---

## 技術設計

### 完全分離アーキテクチャ

**重要:** CLI デプロイは既存 DreamCore と**完全に分離**する。DB・Storage ともに別環境を使用。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DreamCore Platform                          │
│                                                                     │
│  ┌─────────────────────────┐    ┌─────────────────────────┐        │
│  │   既存 DreamCore        │    │   CLI デプロイ (新規)    │        │
│  │   (内部生成)            │    │   (外部投稿)            │        │
│  ├─────────────────────────┤    ├─────────────────────────┤        │
│  │   Supabase A (既存)     │    │   Supabase B (新規)     │        │
│  │   + Modal Volume        │    │   + Supabase Storage    │        │
│  └─────────────────────────┘    └─────────────────────────┘        │
│              │                             │                        │
│              └──────────────┬──────────────┘                        │
│                             │                                       │
│                    同じ user_id で紐付け                             │
│                             │                                       │
│                             ▼                                       │
│                  ┌────────────────────────┐                         │
│                  │   統合マイページ        │                         │
│                  │   両方のゲームを表示    │                         │
│                  └────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

### なぜ完全分離か

| メリット | 説明 |
|----------|------|
| **セキュリティ隔離** | CLI 側に脆弱性があっても、既存 DreamCore の DB・ファイルは無傷 |
| **障害隔離** | Supabase B が落ちても、既存機能は動く |
| **独立した実験** | CLI 側で新しいスキーマを自由に試せる |
| **すぐ実装できる** | 既存コードを一切触らない |

### 構成比較

| 項目 | 既存 DreamCore | CLI デプロイ |
|------|---------------|-------------|
| DB | Supabase A（既存） | **Supabase B（新規）** |
| Storage | Modal Volume | **Supabase Storage** |
| 認証 | Supabase Auth | 同じ user_id を使用 |
| API | `/api/*` | `/api/cli/*` |

### Supabase B で使う機能

- **Database**: `cli_projects`, `cli_published_games`, `cli_tokens` テーブル（新規作成）
- **Storage**: ゲームファイル（HTML/JS/CSS/画像）
- **Auth**: 使わない（user_id は既存の認証から取得）

### API エンドポイント

```
┌─────────────────────────────────────────────────────────┐
│                    ユーザー環境                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Claude Code  │  │    Codex     │  │    Cursor    │  │
│  │   Skills     │  │     CLI      │  │     CLI      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │          │
│         └────────────────┼─────────────────┘          │
│                          │                             │
│                    curl / REST API                     │
└──────────────────────────┼─────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                   DreamCore REST API                     │
│                                                          │
│  POST /api/cli/device/code    - デバイスコード発行        │
│  POST /api/cli/device/token   - トークン取得（ポーリング） │
│  POST /api/cli/deploy         - ゲームデプロイ            │
│  GET  /api/cli/projects       - プロジェクト一覧          │
│  DELETE /api/cli/projects/:id - プロジェクト削除          │
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────────┐
              │      Supabase B (新規)      │
              │  ┌───────────┬───────────┐  │
              │  │ Database  │  Storage  │  │
              │  │ projects  │  files/   │  │
              │  └───────────┴───────────┘  │
              └─────────────────────────────┘
```

### 認証フロー（OAuth デバイスフロー）

**初回のみ**（以降は自動）

```
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│     CLI      │                    │  DreamCore   │                    │   Browser    │
└──────┬───────┘                    └──────┬───────┘                    └──────┬───────┘
       │                                   │                                   │
       │ POST /api/cli/device/code         │                                   │
       │──────────────────────────────────▶│                                   │
       │                                   │                                   │
       │ { device_code, user_code,         │                                   │
       │   verification_url }              │                                   │
       │◀──────────────────────────────────│                                   │
       │                                   │                                   │
       │ open verification_url             │                                   │
       │──────────────────────────────────────────────────────────────────────▶│
       │                                   │                                   │
       │                                   │      ユーザーが Google ログイン     │
       │                                   │◀──────────────────────────────────│
       │                                   │                                   │
       │                                   │      ユーザーがコード確認＆許可     │
       │                                   │◀──────────────────────────────────│
       │                                   │                                   │
       │ POST /api/cli/device/token        │                                   │
       │ (polling)                         │                                   │
       │──────────────────────────────────▶│                                   │
       │                                   │                                   │
       │ { access_token }                  │                                   │
       │◀──────────────────────────────────│                                   │
       │                                   │                                   │
       │ Save to ~/.config/dreamcore/      │                                   │
       │                                   │                                   │
```

**CLI の出力イメージ**

```bash
$ dreamcore login

! Code: ABCD-1234
  Opening https://v2.dreamcore.gg/cli/auth ...

  Waiting for authorization...

✓ Logged in as you@example.com
  Token saved to ~/.config/dreamcore/credentials
```

### デプロイフロー

```bash
$ dreamcore deploy ./my-game

  Packaging files...
  Found dreamcore.json

  Title: Space Shooter
  Description: 矢印キーで移動、スペースで発射

  Uploading... done

✓ Deployed!
  https://cli.dreamcore.gg/g_7F2cK9wP1x
```

---

## API 仕様

### POST /api/cli/device/code

デバイスコードを発行する。

**Request:**
```json
{}
```

**Response:**
```json
{
  "device_code": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "user_code": "ABCD-1234",
  "verification_url": "https://v2.dreamcore.gg/cli/auth",
  "expires_in": 900,
  "interval": 5
}
```

### POST /api/cli/device/token

トークンを取得する（ポーリング）。

**Request:**
```json
{
  "device_code": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Response (pending):**
```json
{
  "status": "pending"
}
```

**Response (success):**
```json
{
  "status": "success",
  "access_token": "dc_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "user": {
    "id": "uuid",
    "email": "you@example.com"
  }
}
```

**Response (error):**
```json
// 期限切れ
{ "status": "expired", "error": "device_code has expired" }

// 拒否された
{ "status": "denied", "error": "user denied authorization" }

// ポーリング間隔が短すぎる
{ "status": "slow_down", "error": "polling too fast", "interval": 10 }
```

### POST /api/cli/deploy

ゲームをデプロイする。

**Request:**
- `Content-Type: multipart/form-data`
- `Authorization: Bearer dc_xxxx`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| files | File | Yes | ゲームファイル（ZIP または tar.gz） |
| title | String | No | タイトル（dreamcore.json より優先） |
| description | String | No | 説明（dreamcore.json より優先） |

> **Note:** CLI ツールや Skills がファイルをパッケージ化する。ユーザーは ZIP 等を意識しない。

**Response (success):**
```json
{
  "project_id": "uuid",
  "public_id": "g_7F2cK9wP1x",
  "url": "https://cli.dreamcore.gg/g_7F2cK9wP1x",
  "title": "Space Shooter"
}
```

**Response (error):**
```json
// 認証エラー
{ "error": "unauthorized", "message": "invalid or expired token" }  // 401

// バリデーションエラー
{ "error": "validation_failed", "message": "index.html not found" }  // 400
{ "error": "validation_failed", "message": "file too large: game.js (12MB > 10MB)" }  // 400
{ "error": "validation_failed", "message": "forbidden file: .env" }  // 400

// 容量超過
{ "error": "payload_too_large", "message": "total size exceeds 50MB" }  // 413

// レート制限（Retry-After ヘッダも必須で返す）
{ "error": "rate_limited", "message": "too many deploys", "retry_after": 3600 }  // 429
// HTTP Header: Retry-After: 3600
```

### POST /api/cli/deploy/github（将来）

> **Note:** Phase 1 では実装しない。将来の GitHub 連携用。

GitHub リポジトリからデプロイする（GitHub Actions 用）。

**Request:**
- `Content-Type: application/json`
- `Authorization: Bearer dc_xxxx`

```json
{
  "repository": "username/repo",
  "ref": "main",
  "commit_sha": "abc123..."
}
```

**Response:**
```json
{
  "project_id": "uuid",
  "public_id": "g_7F2cK9wP1x",
  "url": "https://cli.dreamcore.gg/g_7F2cK9wP1x",
  "title": "Space Shooter"
}
```

> **Note:** API がリポジトリからファイルを取得してデプロイ。

### GET /api/cli/projects

ユーザーのプロジェクト一覧を取得。

**Request:**
- `Authorization: Bearer dc_xxxx`

**Response:**
```json
{
  "projects": [
    {
      "id": "uuid",
      "public_id": "g_7F2cK9wP1x",
      "title": "Space Shooter",
      "url": "https://cli.dreamcore.gg/g_7F2cK9wP1x",
      "created_at": "2026-02-01T12:00:00Z"
    }
  ]
}
```

### DELETE /api/cli/projects/:id

プロジェクトを削除。

**Request:**
- `Authorization: Bearer dc_xxxx`

**Response:**
```json
{
  "deleted": true
}
```

---

## dreamcore.json 仕様

ゲームディレクトリのルートに配置するメタデータファイル。

```json
{
  "title": "Space Shooter",
  "description": "矢印キーで移動、スペースで発射。ハイスコアを目指せ！",
  "thumbnail": "thumbnail.png"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | String | Yes | ゲームタイトル（最大100文字） |
| description | String | No | ゲーム説明（最大500文字） |
| thumbnail | String | No | サムネイル画像のパス |

---

## Claude Code Skills（★最重要）

Phase 1 の核心。ユーザーが Claude Code でゲームを作った後、`/dreamcore-deploy` するだけで公開できる。

### ユーザー体験（理想形）

```bash
# Claude Code でゲームを作る
> シューティングゲームを作って

# ... ゲーム完成 ...

# デプロイ
> /dreamcore-deploy

  Checking authentication...
  ✓ Logged in as you@example.com

  Found game directory: ./shooting-game
  Title: Space Shooter

  Uploading files...
  ✓ index.html
  ✓ game.js
  ✓ style.css
  ✓ assets/player.png

✓ Deployed!
  https://cli.dreamcore.gg/g_7F2cK9wP1x

  Share this URL with friends!
```

### 初回認証（一度だけ）

```bash
> /dreamcore-deploy

  No credentials found. Let's log in.

  ! Code: ABCD-1234
    Opening https://v2.dreamcore.gg/cli/auth ...

  Waiting for authorization...

  ✓ Logged in as you@example.com
    Credentials saved.

  Now deploying...
```

### ファイル配置

```
.claude/
└── skills/
    └── dreamcore-deploy/
        └── SKILL.md
```

### SKILL.md の設計ポイント

Skills が自動で行うこと：

| ステップ | 処理 |
|----------|------|
| 1. 認証確認 | `~/.config/dreamcore/credentials` を確認 |
| 2. 未認証なら | デバイスフローで認証 |
| 3. ゲーム検出 | `index.html` があるディレクトリを探す |
| 4. メタデータ | `dreamcore.json` を読む（なければ作成提案） |
| 5. パッケージ | ファイルを ZIP 化 |
| 6. アップロード | `POST /api/cli/deploy` |
| 7. 結果表示 | 公開 URL を表示 |

### dreamcore.json（オプション）

```json
{
  "title": "Space Shooter",
  "description": "矢印キーで移動、スペースで発射"
}
```

なければ Skills が対話的に聞く：
```bash
? Game title: Space Shooter
? Description (optional): 矢印キーで移動...
```

### 認証トークンの保存場所

```
~/.config/dreamcore/credentials
```

または環境変数 `DREAMCORE_TOKEN`。

### Skills の配布方法

**案 1:** ユーザーが自分でインストール
```bash
# DreamCore の Skills をインストール
git clone https://github.com/dreamcore/claude-skills ~/.claude/skills/dreamcore
```

**案 2:** npm パッケージとして配布
```bash
npm install -g dreamcore-claude-skills
```

**案 3:** DreamCore 公式サイトからダウンロード

→ 最初は案 1 でシンプルに始める。

---

## GitHub Actions（将来）

> **Note:** Phase 1 では実装しない。以下は将来の参考用。

GitHub からのデプロイには GitHub Actions を使用する。

### dreamcore/deploy-action

DreamCore 公式の GitHub Action（将来）。

```yaml
# .github/workflows/deploy.yml
name: Deploy to DreamCore

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to DreamCore
        uses: dreamcore/deploy-action@v1
        with:
          token: ${{ secrets.DREAMCORE_TOKEN }}
          # directory: ./  # デフォルトはリポジトリルート
```

### セットアップ手順

1. DreamCore にログイン
2. 設定画面で CLI トークンを発行
3. GitHub リポジトリの Settings → Secrets に `DREAMCORE_TOKEN` を追加
4. `.github/workflows/deploy.yml` を作成
5. `git push` で自動デプロイ

### Action の内部動作

```
1. リポジトリをチェックアウト
2. dreamcore.json を読み込み
3. ファイルをパッケージ化
4. POST /api/cli/deploy に送信
5. 公開 URL をログに出力
```

---

## ロードマップ

### 開発戦略: 既存環境を触らずに進める

```
Phase 1: 完全独立で開発（既存環境に一切触らない）★今ここ
├── Supabase B 作成
├── /api/cli/* 実装
├── OAuth デバイスフロー
├── Claude Code Skills ← 最重要
└── CLI 単体で動作確認 ✓

────────────────────────────────────
↓ Phase 1 が完成してから考える ↓
────────────────────────────────────

Phase 将来: GitHub 連携
├── GitHub Actions
└── git push でデプロイ

Phase 将来: WebUI 統合（ここで初めて既存環境に触る）
├── マイページに CLI デプロイのゲームも表示
└── 両方の DB からデータ取得

Phase 将来: DreamCore SDK
├── リーダーボード / クラウドセーブ / 実績
└── ※ 別セッションで設計中
```

---

### Phase 1: 極小の機能でスタート（★現在のフォーカス）

**目標:** Claude Code Skills からゲームをデプロイできるようにする

**やること:**
- [x] 設計完了（本ドキュメント）
- [ ] Supabase B プロジェクト作成
- [ ] REST API 実装（`/api/cli/*`）
- [ ] OAuth デバイスフロー認証
- [ ] **Claude Code Skills（`/dreamcore-deploy`）← 最重要**

**この段階でできること:**
```bash
# Claude Code でゲームを作った後
/dreamcore-deploy

✓ Deployed!
  https://cli.dreamcore.gg/g_xxxxx
```

**この段階でできないこと（将来）:**
- GitHub 連携
- WebUI のマイページ表示
- DreamCore SDK（リーダーボード等）

**既存環境への影響:** ゼロ

---

### Phase 将来: その他の機能

以下は Phase 1 が完成してから検討する。

| 機能 | 概要 |
|------|------|
| GitHub 連携 | `git push` で自動デプロイ |
| WebUI 統合 | マイページに表示（ここで初めて既存環境に触る） |
| DreamCore SDK | リーダーボード、クラウドセーブ等（別セッションで設計中） |
| 高度な機能 | バージョニング、カスタムドメイン等 |

---

## 実装時の注意

### 既存環境への影響

**変更なし**。すべて新規ファイル・新規 Supabase プロジェクトとして追加する。

| 項目 | 状態 |
|------|------|
| `server/routes/cli.js` | 新規作成 |
| `server/services/deviceAuth.js` | 新規作成 |
| `server/services/cliSupabase.js` | 新規作成（Supabase B クライアント） |
| `public/cli/auth.html` | 新規作成 |
| Supabase B プロジェクト | **新規作成** |
| 既存のすべてのファイル | **変更なし** |
| 既存の Supabase A | **変更なし** |

### Supabase B セットアップ

```bash
# 1. 新規 Supabase プロジェクト作成
#    - 名前: dreamcore-cli (例)
#    - リージョン: Tokyo

# 2. 環境変数追加
SUPABASE_CLI_URL=https://xxxxx.supabase.co
SUPABASE_CLI_ANON_KEY=eyJhbG...
SUPABASE_CLI_SERVICE_ROLE_KEY=eyJhbG...

# 3. Storage バケット作成
#    - games (public)

# 4. テーブル作成
#    - cli_projects
#    - cli_published_games
```

### セキュリティ

#### 別オリジン配信（Critical）

**ユーザー生成コンテンツは `cli.dreamcore.gg` で配信する。`v2.dreamcore.gg` と同一オリジンにしてはならない。**

```
❌ 危険: 同一オリジン
v2.dreamcore.gg/g/xxx     → XSS でセッション窃取可能
v2.dreamcore.gg/dashboard → Cookie/LocalStorage 共有

✅ 安全: 別オリジン
cli.dreamcore.gg/xxx    → ユーザー生成コンテンツ（隔離）
v2.dreamcore.gg/dashboard → 管理画面（保護）
```

| 設定 | 値 |
|------|-----|
| 配信ドメイン | `cli.dreamcore.gg`（CLI デプロイ専用） |
| CSP | `default-src 'self'; script-src 'self' 'unsafe-inline'` ※1 |
| COOP | `same-origin` |
| COEP | `require-corp` |

> ※1 **CSP について:** `'unsafe-inline'` は Phase 1 では許容する（ユーザー生成ゲームの多くがインラインスクリプトを使用するため）。将来的には nonce ベースの CSP に移行することを検討。

**配信ドメインの役割:**
| ドメイン | 用途 | 配信内容 |
|----------|------|----------|
| `v2.dreamcore.gg` | 管理画面・API | DreamCore 公式コード |
| `cli.dreamcore.gg` | CLI デプロイ | ユーザー生成コンテンツ（UGC） |
| `play.dreamcore.gg` | WebUI 生成 | ユーザー生成コンテンツ（UGC） |

**重要:** `cli.dreamcore.gg` と `play.dreamcore.gg` は両方 UGC 配信だが、別オリジンなので互いに隔離される。管理画面 `v2.dreamcore.gg` とも隔離されるため、XSS があっても管理画面のセッションは窃取できない。

#### Cookie スコープ（重要）

管理画面の認証 Cookie は**ホスト限定**にする。`Domain=.dreamcore.gg` を設定してはならない。

```
❌ 危険: Domain=.dreamcore.gg
Set-Cookie: session=xxx; Domain=.dreamcore.gg
→ cli.dreamcore.gg からも Cookie が送信される（XSS で窃取可能）

✅ 安全: __Host- プレフィックス
Set-Cookie: __Host-session=xxx; Secure; Path=/; SameSite=Strict
→ v2.dreamcore.gg のみに限定、サブドメインに送信されない
```

| Cookie 設定 | 値 | 必須 |
|-------------|-----|------|
| Name | `__Host-session` | ✓ |
| Secure | `true` | ✓（__Host- の要件） |
| Path | `/` | ✓（__Host- の要件） |
| SameSite | `Strict` | 推奨 |
| Domain | **設定しない** | ✓（__Host- の要件） |

> **__Host- プレフィックスの要件:** `Secure` + `Path=/` + `Domain 未設定` の3つすべてが必須。1つでも欠けるとブラウザが Cookie を拒否する。

#### UGC 配信ドメインの Cookie ポリシー

**`cli.dreamcore.gg` と `play.dreamcore.gg` には認証 Cookie を一切発行しない。**

| ドメイン | 認証 Cookie | 理由 |
|----------|-------------|------|
| `v2.dreamcore.gg` | ✓ 発行 | 管理画面 |
| `cli.dreamcore.gg` | ✗ 発行しない | UGC 配信のみ |
| `play.dreamcore.gg` | ✗ 発行しない | UGC 配信のみ |

UGC 配信ドメインは静的ファイル配信のみ。認証が必要な操作は `v2.dreamcore.gg` で行う。

#### CORS / Origin 制限

UGC 配信ドメインから管理 API を叩けないようにする。

**v2.dreamcore.gg/api/* の CORS 設定:**
```
Access-Control-Allow-Origin: https://v2.dreamcore.gg
Access-Control-Allow-Credentials: true  ← 管理画面のみ Cookie 送信許可
```

**cli.dreamcore.gg, play.dreamcore.gg の CORS 設定:**
```
Access-Control-Allow-Origin: *  または 設定しない
Access-Control-Allow-Credentials: false  ← Cookie 送信禁止
```

| ドメイン | Allow-Origin | Allow-Credentials |
|----------|--------------|-------------------|
| `v2.dreamcore.gg` | `https://v2.dreamcore.gg` | `true` |
| `cli.dreamcore.gg` | `*` or なし | `false` |
| `play.dreamcore.gg` | `*` or なし | `false` |

**許可しないオリジン（v2 API へのアクセス）:**
- `https://cli.dreamcore.gg` ← 拒否
- `https://play.dreamcore.gg` ← 拒否

これにより、UGC 内の悪意ある JS が管理 API を叩くことを防止。

#### トークン管理

CLI トークンは Supabase B の `cli_tokens` テーブルで管理する。

```sql
CREATE TABLE cli_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id UUID NOT NULL,           -- Supabase A の user_id
  token_lookup TEXT NOT NULL,      -- HMAC-SHA256（検索用・pepper付き）
  token_verify TEXT NOT NULL,      -- bcrypt ハッシュ（検証用・ソルト付き）
  name TEXT,                       -- トークン名（任意）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,          -- NULL = 有効
  UNIQUE(token_lookup)
);

-- RLS: service_role のみアクセス可
ALTER TABLE cli_tokens ENABLE ROW LEVEL SECURITY;
```

**トークン形式:** `dc_` + 32文字のランダム文字列

**なぜ2段階ハッシュか:**
- bcrypt はソルト付きなので検索に使えない（同じ入力でも毎回異なるハッシュ）
- 単純な SHA-256 は DB 漏洩時に逆引き可能（危険）
- **HMAC-SHA256 + pepper** なら DB 漏洩しても pepper がなければ逆引き不可
- 両方使うことで「検索可能 + 安全」を両立

**pepper の管理:**
```bash
# 環境変数で管理（DB には保存しない）
TOKEN_PEPPER=ランダムな64文字の秘密鍵
```

**検証フロー:**
1. `Authorization: Bearer dc_xxx` を受信
2. `HMAC_SHA256(dc_xxx, TOKEN_PEPPER)` を計算 → `token_lookup` で検索
3. 該当行の `token_verify` と bcrypt 比較
4. `revoked_at IS NULL` を確認
5. `last_used_at` を更新

#### アップロード検証（サーバー側必須）

CLI 側のパッケージ化に依存せず、**サーバー側で必ず検証する**。

| チェック項目 | 内容 |
|-------------|------|
| **index.html 必須** | ルートに index.html がなければ拒否 |
| **Zip Slip 防止** | `../` を含むパスを拒否 |
| **シンボリックリンク** | シンボリックリンクを拒否 |
| **ファイルサイズ** | 単一ファイル: 10MB 以下、合計: 50MB 以下 |
| **ファイル数** | 最大 500 ファイル |
| **許可拡張子** | `.html`, `.js`, `.css`, `.json`, `.png`, `.jpg`, `.gif`, `.svg`, `.webp`, `.mp3`, `.wav`, `.ogg`, `.woff`, `.woff2`, `.ttf` |
| **禁止ファイル** | `.env`, `.git/`, `node_modules/`, `.DS_Store` |

#### その他

- トークンは長期有効（revoke 機能あり）
- トークンは `dc_` プレフィックス付き（識別しやすく）
- レート制限: 10 deploys/hour/user
- **完全隔離**: 既存 DreamCore とは別 DB・別 Storage・別オリジン

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-02-02 | 初版作成 |
| 2026-02-02 | 3つのデプロイ方法を明記（ローカル、GitHub、内部生成） |
| 2026-02-02 | GitHub Actions セクション追加 |
| 2026-02-02 | ビジョン更新: 「ゲーム版 Roblox/itch.io」を目指すことを明記 |
| 2026-02-02 | ロードマップ更新: 静的ホスティング（Phase 1-2）と DreamCore SDK（Phase 3+）に分離 |
| 2026-02-02 | **完全分離アーキテクチャ採用**: 別 Supabase プロジェクト（Supabase B）を使用 |
| 2026-02-02 | **Phase 1 フォーカス**: 極小機能でスタート、Claude Code Skills を最重要に |
| 2026-02-02 | **セキュリティレビュー反映**: 別オリジン配信、トークン管理、アップロード検証、エラー仕様追加 |
| 2026-02-02 | **CTOレビュー反映**: 2段階ハッシュ（HMAC+bcrypt）、CSP nonce化の将来計画、配信ドメイン役割明確化 |
| 2026-02-02 | **CTOレビュー追加**: Cookie __Host- プレフィックス、HMAC pepper、CORS Origin 制限 |
| 2026-02-02 | **最終安全確認**: __Host- 要件明文化、Allow-Credentials 明記、UGC ドメイン Cookie 禁止方針 |

## 議論参加者

- ユーザー（プロダクトオーナー）
- Claude（技術設計）

## 関連ドキュメント

- `docs/ENGINEER-HANDOFF.md` - Modal 統合の引き継ぎ
- `docs/API-REFERENCE.md` - 既存 API 仕様
