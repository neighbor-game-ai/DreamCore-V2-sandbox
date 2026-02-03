# DreamCore V2 API Reference

エンジニア向けの包括的な API ドキュメント。

## 概要

### 認証方式

DreamCore V2 は Supabase Auth + Google OAuth を使用。認証は JWT ベースで、`Authorization` ヘッダーでトークンを送信する。

```http
Authorization: Bearer <access_token>
```

JWT 検証は `jose` ライブラリ + JWKS を使用し、Supabase API 呼び出しなしでローカル検証を行う。

### ベース URL

- **ローカル開発**: `http://localhost:3000`
- **本番 (GCE)**: `http://35.200.79.157:3005`

### エラーレスポンス形式

#### REST API

現在の実装では以下の形式を使用:

```json
{ "error": "Error message here" }
```

一部のエンドポイントは追加フィールドを含む:

```json
{ "error": "Error message", "success": false }
{ "error": "Error message", "raw": "..." }
```

**注意**: 静的ファイル（`/user-assets/*`, `/global-assets/*`）の 404 はプレーンテキスト `"Not found"` を返す。

#### WebSocket

```json
{ "type": "error", "message": "Error message here" }
```

#### 将来の標準化（server/errorResponse.js）

将来的には以下の形式への統一を予定:

```json
{
  "status": "error",
  "error": {
    "code": "NOT_FOUND",
    "message": "Project not found"
  }
}
```

標準エラーコード:

| コード | HTTP | 説明 |
|--------|------|------|
| `NOT_AUTHENTICATED` | 401 | 認証が必要 |
| `ACCESS_DENIED` | 403 | アクセス権限なし |
| `INVALID_TOKEN` | 401 | 無効なトークン |
| `INVALID_REQUEST` | 400 | 無効なリクエスト |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `USER_LIMIT_EXCEEDED` | 429 | ユーザー制限超過 |
| `SYSTEM_LIMIT_EXCEEDED` | 503 | システム制限超過 |
| `OPERATION_FAILED` | 500 | 操作失敗 |

### レート制限

#### CLI 実行制限（コード生成）

| 制限 | 値 | 説明 |
|------|-----|------|
| `maxConcurrentPerUser` | 1 | ユーザーあたり同時実行数 |
| `maxConcurrentTotal` | 50 | システム全体の同時実行数 |
| `timeout` | 10分 | 1ジョブの最大実行時間 |
| `maxOutputSize` | 1MB | 出力サイズ上限 |

#### チャット制限

| 制限 | 値 | 説明 |
|------|-----|------|
| `weeklyLimit` | 50 | 週間チャット上限 |
| `resetDay` | 1 (月曜) | リセット曜日 |

#### API レート制限（リクエスト/分）

| 対象 | 値 |
|------|-----|
| 認証済み | 60 |
| 匿名 | 10 |

---

## REST API エンドポイント

### Health & Configuration

#### `GET /api/health`

ヘルスチェック。認証不要。

**レスポンス:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-29T12:00:00.000Z",
  "uptime": 3600.123
}
```

---

#### `GET /api/config`

フロントエンド用 Supabase 設定。認証不要。1時間キャッシュ。

**レスポンス:**
```json
{
  "supabaseUrl": "https://xxx.supabase.co",
  "supabaseAnonKey": "eyJhbGc..."
}
```

---

#### `GET /api/quota`

ユーザーの日次クォータ（利用制限）情報を取得。

**認証:** 必須

**レスポンス:**
```json
{
  "projects": {
    "used": 2,
    "limit": 3,
    "remaining": 1
  },
  "messages": {
    "used": 15,
    "limit": 20,
    "remaining": 5
  },
  "plan": "free",
  "resetAt": "2026-01-30T00:00:00.000Z"
}
```

**フィールド説明:**
- `projects`: プロジェクト作成のクォータ
- `messages`: メッセージ送信のクォータ
- `plan`: ユーザーのプラン (`free`, `pro`, `team`)
- `resetAt`: クォータリセット時刻（UTC 00:00 = JST 09:00）
- `limit: -1` は無制限を示す（`pro`, `team` プラン）

**プラン別制限:**

| プラン | プロジェクト作成 | メッセージ送信 |
|--------|------------------|----------------|
| free | 3回/日 | 20回/日 |
| pro | 100回/日 | 500回/日 |
| team | 無制限 | 無制限 |

---

### Users / Profile

#### `GET /api/users/me`

認証ユーザーの完全プロフィールを取得。

**認証:** 必須

**レスポンス:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "display_name": "User Name",
  "avatar_url": "https://cdn.dreamcore.gg/avatars/{userId}/avatar.webp",
  "bio": "自己紹介文",
  "social_links": {
    "x": "https://x.com/username",
    "youtube": "https://youtube.com/@channel",
    "github": "https://github.com/username",
    "tiktok": null,
    "instagram": null,
    "custom": [
      { "label": "Blog", "url": "https://example.com" }
    ]
  },
  "public_id": "u_Abc123XYZ0",
  "created_at": "2026-01-29T12:00:00.000Z",
  "updated_at": "2026-01-29T12:00:00.000Z"
}
```

---

#### `PATCH /api/users/me`

プロフィールを更新。

**認証:** 必須

**Content-Type:** `application/json` (max 64KB)

**リクエストボディ:**
```json
{
  "display_name": "New Name",
  "bio": "新しい自己紹介",
  "social_links": {
    "x": "https://x.com/newusername"
  }
}
```

**バリデーション:**
- `display_name`: 最大 50 文字、空文字は null
- `bio`: 最大 500 文字、空文字は null
- `social_links`: HTTPS URL のみ、custom は最大 5 件（各 label 最大 30 文字）

**エラー:**
- 400: `{ "error": "display_name max 50 chars" }`
- 400: `{ "error": "bio max 500 chars" }`
- 400: `{ "error": "x must start with https://" }`

**レスポンス:** 更新後のユーザーオブジェクト（`GET /api/users/me` と同形式）

---

#### `POST /api/users/me/avatar`

アバター画像をアップロード。WebP に変換して R2 に保存。

**認証:** 必須

**Content-Type:** `multipart/form-data`

**パラメータ:**
- `avatar` (required): 画像ファイル（最大 2MB、4096x4096 ピクセル以内）

**レスポンス:**
```json
{
  "avatar_url": "https://cdn.dreamcore.gg/avatars/{userId}/avatar.webp"
}
```

**エラー:**
- 400: `{ "error": "No file uploaded" }`
- 400: `{ "error": "画像が大きすぎます（最大 4096x4096）" }`
- 503: `{ "error": "Avatar upload not available (R2 not configured)" }`

---

#### `GET /api/users/:id/public`

ユーザーの公開プロフィールを取得。email は含まれない。

**認証:** 不要

**パラメータ:**
- `id` (path): UUID または public_id (`u_XXXXXXXXXX`)

**レスポンス:**
```json
{
  "id": "uuid",
  "display_name": "User Name",
  "avatar_url": "https://cdn.dreamcore.gg/avatars/{userId}/avatar.webp",
  "bio": "自己紹介文",
  "social_links": { ... },
  "public_id": "u_Abc123XYZ0",
  "created_at": "2026-01-29T12:00:00.000Z"
}
```

**エラー:**
- 400: `{ "error": "Invalid user ID" }`
- 404: `{ "error": "User not found" }`

---

### Jobs

#### `GET /api/jobs/:jobId`

ジョブ状態を取得。所有者のみアクセス可能。

**認証:** 必須

**パラメータ:**
- `jobId` (path): ジョブ ID (UUID)

**エラー:**
- 400: `{ "error": "Invalid job ID" }` - UUID 形式不正
- 404: `{ "error": "Job not found" }`
- 403: `{ "error": "Access denied" }` - 他ユーザーのジョブ

**レスポンス:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "project_id": "uuid",
  "status": "completed",
  "progress": 100,
  "progress_message": "Complete",
  "error": null,
  "created_at": "2026-01-29T12:00:00.000Z",
  "completed_at": "2026-01-29T12:01:00.000Z"
}
```

---

#### `GET /api/projects/:projectId/active-job`

プロジェクトのアクティブなジョブを取得。

**認証:** 必須

**レスポンス:**
```json
{
  "job": { ... }
}
```

ジョブがない場合:
```json
{
  "job": null
}
```

---

#### `GET /api/projects/:projectId/jobs`

プロジェクトのジョブ履歴を取得。

**認証:** 必須

**クエリパラメータ:**
- `limit` (optional): 取得件数 (default: 20)

**レスポンス:**
```json
{
  "jobs": [...]
}
```

---

#### `POST /api/jobs/:jobId/cancel`

実行中のジョブをキャンセル。

**認証:** 必須

**レスポンス:**
```json
{
  "success": true
}
```

**注意:** `job` フィールドは非同期処理のため含まれない場合がある。キャンセル状態は WebSocket の `cancelled` イベントまたは `GET /api/jobs/:jobId` で確認。

---

### Projects

#### `GET /api/projects`

ユーザーのプロジェクト一覧を取得。

**認証:** 必須

**レスポンス:**
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "My Game",
      "created_at": "2026-01-29T12:00:00.000Z",
      "updated_at": "2026-01-29T12:00:00.000Z"
    }
  ]
}
```

---

#### `GET /api/projects/:projectId`

プロジェクト詳細を取得。

**認証:** 必須

**レスポンス:**
```json
{
  "id": "uuid",
  "name": "My Game",
  "user_id": "uuid",
  "created_at": "2026-01-29T12:00:00.000Z",
  "updated_at": "2026-01-29T12:00:00.000Z"
}
```

---

#### `GET /api/projects/:projectId/code`

プロジェクトの HTML コードを取得。

**認証:** 必須

**エラー:**
- 404: `{ "error": "Project not found" }` - index.html が存在しない

**レスポンス:**
```json
{
  "code": "<!DOCTYPE html>..."
}
```

---

#### `GET /api/projects/:projectId/ai-context`

AI コンテキスト（Gemini edits, summary 等）を取得。

**認証:** 必須

**レスポンス:**
```json
{
  "context": { ... }
}
```

---

#### `GET /api/projects/:projectId/download`

プロジェクトを ZIP でダウンロード。

**認証:** 必須

**ZIP 内容:**
- `index.html` - メインファイル
- `assets/` - アセットディレクトリ（存在する場合のみ）

**注意:** `SPEC.md`, `.git/` 等は含まれない。

**エラー:**
- 404: `{ "error": "Project not found" }` - プロジェクトディレクトリが存在しない

**レスポンス:** `application/zip` ファイル (`game.zip`)

---

### Assets

#### `POST /api/assets/upload`

アセットをアップロード。V2 では alias + hash 方式で管理。

**認証:** 必須

**Content-Type:** `multipart/form-data`

**パラメータ:**
- `file` (required): アップロードファイル
- `projectId` (optional): プロジェクト ID
- `originalName` (optional): オリジナルファイル名 (UTF-8 対応)
- `tags` (optional): タグ
- `description` (optional): 説明

**制限:**
- **ファイルサイズ**: 最大 1MB
- **対応形式**: jpeg, jpg, png, gif, webp, svg, mp3, wav, ogg, json

**エラー:**
- 400: `{ "error": "No file uploaded" }`
- 400: `{ "error": "Invalid project ID" }`
- 403: `{ "error": "Access denied to project" }`
- 500: `{ "error": "..." }` - 処理エラー

**レスポンス:**
```json
{
  "success": true,
  "asset": {
    "id": "uuid",
    "alias": "player.png",
    "filename": "player.png",
    "mimeType": "image/png",
    "size": 12345,
    "url": "/user-assets/{userId}/player.png"
  }
}
```

---

#### `GET /api/assets/search`

アセットを検索。オーナー限定。

**認証:** 必須

**クエリパラメータ:**
- `q` (optional): 検索クエリ（なければ全件取得）

**レスポンス:**
```json
{
  "assets": [
    {
      "id": "uuid",
      "filename": "player.png",
      "alias": "player.png",
      "mimeType": "image/png",
      "size": 12345,
      "isPublic": true,
      "isOwner": true,
      "tags": ["character"],
      "description": "Player character",
      "url": "/user-assets/{userId}/player.png"
    }
  ]
}
```

---

#### `GET /api/assets`

ユーザーのアセット一覧を取得（プロジェクト紐付け情報付き）。

**認証:** 必須

**クエリパラメータ:**
- `currentProjectId` (optional): 現在のプロジェクト ID

**レスポンス:**
```json
{
  "assets": [
    {
      "id": "uuid",
      "filename": "player.png",
      "alias": "player.png",
      "mimeType": "image/png",
      "size": 12345,
      "isPublic": true,
      "tags": ["character"],
      "description": "Player character",
      "url": "/user-assets/{userId}/player.png",
      "projects": [
        { "id": "uuid", "name": "My Game" }
      ],
      "createdAt": "2026-01-29T12:00:00.000Z"
    }
  ],
  "currentProjectId": "uuid"
}
```

---

#### `GET /api/assets/:id`

アセットファイルを取得。オーナーまたは公開アセットにアクセス可能。

**認証:** オプション

**エラー:**
- 400: `{ "error": "Invalid asset ID" }`
- 404: `{ "error": "Asset not found" }` - RLS によりアクセス不可も 404
- 404: `{ "error": "Asset file not found" }` - ファイルが物理的に存在しない

**レスポンス:** ファイルバイナリ（Content-Type はアセットの mime_type）

---

#### `GET /api/assets/:id/meta`

アセットメタデータを取得。オーナーのみ。

**認証:** 必須

**レスポンス:**
```json
{
  "id": "uuid",
  "filename": "player.png",
  "alias": "player.png",
  "mimeType": "image/png",
  "size": 12345,
  "isPublic": true,
  "tags": ["character"],
  "description": "Player character",
  "createdAt": "2026-01-29T12:00:00.000Z",
  "url": "/user-assets/{userId}/player.png"
}
```

---

#### `PUT /api/assets/:id`

アセットメタデータを更新。

**認証:** 必須

**リクエストボディ:**
```json
{
  "tags": ["character", "pixel"],
  "description": "Updated description"
}
```

**レスポンス:**
```json
{
  "success": true,
  "asset": {
    "id": "uuid",
    "tags": ["character", "pixel"],
    "description": "Updated description"
  }
}
```

---

#### `PUT /api/assets/:id/publish`

アセットの公開状態を更新。

**認証:** 必須

**リクエストボディ:**
```json
{
  "isPublic": true
}
```

**レスポンス:**
```json
{
  "success": true,
  "asset": {
    "id": "uuid",
    "isPublic": true
  }
}
```

---

#### `DELETE /api/assets/:id`

アセットを削除（ソフトデリート）。

**認証:** 必須

**エラー:**
- 500: `{ "error": "Failed to delete asset" }`
- 404: `{ "error": "Asset not found or already deleted" }`

**レスポンス:**
```json
{
  "success": true,
  "message": "Asset deleted. It was used in 2 project(s) - they will now see a placeholder."
}
```

使用されていない場合:
```json
{
  "success": true,
  "message": "Asset deleted."
}
```

---

### V2 Asset URL エンドポイント

#### `GET /user-assets/:userId/:alias`

ユーザーアセットをエイリアスで取得。

**認証:** オプション（オーナーまたは公開アセットにアクセス可能）

**アクセス条件:**
- オーナーであること、または
- `is_public = true` または `is_global = true` であること
- `is_deleted = false` であること
- `available_from` / `available_until` の期間内であること

**エラー:**
- 404: プレーンテキスト `"Not found"` - 条件を満たさない場合

**レスポンス:** ファイルバイナリ

---

#### `GET /global-assets/:category/:alias`

グローバルアセットをカテゴリとエイリアスで取得。

**認証:** 不要

**アクセス条件:**
- `is_deleted = false` であること
- `available_from` / `available_until` の期間内であること（季節限定アセット等）

**エラー:**
- 404: プレーンテキスト `"Not found"`

**レスポンス:** ファイルバイナリ

---

### Game Files

#### `GET /game/:userId/:projectId/*`

ゲームファイルを配信。オーナーのみアクセス可能。
ネストしたパス（js/, css/, assets/）に対応。

**認証:** 必須

**例:**
- `/game/{userId}/{projectId}/index.html`
- `/game/{userId}/{projectId}/assets/player.png`

**パス検証:**
- `..` を含むパスは拒否（パストラバーサル防止）
- `/` で始まるパスは拒否

**エラー:**
- 400: `{ "error": "Invalid ID format" }`
- 403: `{ "error": "Access denied" }`
- 400: `{ "error": "Invalid file path" }`
- 404: プレーンテキスト `"File not found"`
- 500: `{ "error": "Failed to fetch file from Modal" }` - Modal フォールバック失敗時

**特殊処理:**
- `index.html` にはエラー検出スクリプトが自動注入される（親フレームに `gameError`, `gameLoaded` を postMessage）

**対応 Content-Type:**
| 拡張子 | Content-Type |
|--------|-------------|
| .html | text/html |
| .css | text/css |
| .js, .mjs | application/javascript |
| .json | application/json |
| .png | image/png |
| .jpg, .jpeg | image/jpeg |
| .gif | image/gif |
| .webp | image/webp |
| .svg | image/svg+xml |
| .mp3 | audio/mpeg |
| .wav | audio/wav |
| .ogg | audio/ogg |
| .woff | font/woff |
| .woff2 | font/woff2 |
| .ttf | font/ttf |

---

#### `GET /api/projects/:projectId/preview`

プロジェクトの HTML プレビューを取得。オーナーのみ。

**認証:** 必須

**エラー:**
- 404: プレーンテキスト `"Game file not found"`
- 500: プレーンテキスト `"Error loading game"`

**レスポンス:** `text/html`

---

### Publishing

#### `GET /api/projects/:projectId/publish-draft`

公開ドラフトを取得。

**認証:** 必須

**レスポンス:**

ドラフトが存在する場合:
```json
{
  "title": "My Awesome Game",
  "description": "Game description",
  "howToPlay": "Use arrow keys to move",
  "tags": ["action", "puzzle"],
  "visibility": "public",
  "remix": "allowed",
  "thumbnailUrl": "/api/projects/{projectId}/thumbnail"
}
```

ドラフトが未作成の場合:
```json
null
```

---

#### `PUT /api/projects/:projectId/publish-draft`

公開ドラフトを保存。`PUBLISH.json` として Git にもコミットされる。

**認証:** 必須

**リクエストボディ:**
```json
{
  "title": "My Awesome Game",
  "description": "Game description",
  "howToPlay": "Use arrow keys to move",
  "tags": ["action", "puzzle"],
  "visibility": "public",
  "remix": "allowed",
  "thumbnailUrl": "/api/projects/{projectId}/thumbnail"
}
```

**レスポンス:**
```json
{
  "success": true
}
```

**エラー:**
- 500: `{ "error": "..." }`

---

#### `POST /api/projects/:projectId/generate-publish-info`

AI でタイトル、説明、遊び方、タグを自動生成。

- Modal 使用時: Modal Haiku エンドポイント
- ローカル時: Claude CLI (Haiku)

**認証:** 必須

**レスポンス:**
```json
{
  "title": "Generated Title",
  "description": "Generated description...",
  "howToPlay": "How to play...",
  "tags": ["tag1", "tag2", "tag3"]
}
```

**エラー:**
- 500: `{ "error": "...", "raw": "..." }` - AI レスポンスのパース失敗時

---

#### `POST /api/projects/:projectId/generate-thumbnail`

AI でサムネイルを生成。

1. Modal Haiku でプロンプト生成
2. Nano Banana (Gemini) で画像生成
3. WebP に変換して保存

**認証:** 必須

**リクエストボディ:**
```json
{
  "title": "Optional custom title"
}
```

**レスポンス:**
```json
{
  "success": true,
  "thumbnailUrl": "/api/projects/{projectId}/thumbnail?t=1234567890"
}
```

**エラー:**
- 500: `{ "error": "Failed to generate thumbnail", "output": "..." }`

---

#### `POST /api/projects/:projectId/upload-thumbnail`

サムネイル画像をアップロード。

**認証:** 必須

**Content-Type:** `multipart/form-data`

**パラメータ:**
- `thumbnail` (required): 画像ファイル

**制限:**
- **ファイルサイズ**: 最大 1MB（`/api/assets/upload` と共通の multer 設定）
- **対応形式**: jpeg, jpg, png, gif, webp, svg, mp3, wav, ogg, json

**レスポンス:**
```json
{
  "success": true,
  "thumbnailUrl": "/api/projects/{projectId}/thumbnail?t=1234567890"
}
```

---

#### `GET /api/projects/:projectId/thumbnail`

サムネイル画像を取得。認証不要（公開表示用）。

**エラー:**
- 404: プレーンテキスト `"Not found"` - サムネイルが存在しない、またはプロジェクトが存在しない

**レスポンス:** `image/webp` または `image/png`（WebP 優先）

---

#### `POST /api/projects/:projectId/generate-movie`

デモ動画を生成。

1. Claude Sonnet で Remotion コンポーネントを生成
2. Remotion でレンダリング（7秒、30fps、1080x1920）

**認証:** 必須

**レスポンス:**
```json
{
  "success": true,
  "movieUrl": "/api/projects/{projectId}/movie?t=1234567890",
  "duration": 7
}
```

**エラー:**
- 404: `{ "error": "Game code not found" }`
- 500: `{ "error": "Failed to generate demo component" }`
- 500: `{ "error": "Failed to extract component code" }`
- 500: `{ "error": "Failed to render video", "output": "..." }`

---

#### `GET /api/projects/:projectId/movie`

デモ動画を取得。オーナーのみ。

**認証:** 必須

**エラー:**
- 404: プレーンテキスト `"Movie not found"`

**レスポンス:** `video/mp4`

---

### Remix & Lineage (V2)

#### `POST /api/games/:gameId/remix`

公開ゲームをリミックス（コピー）して自分のプロジェクトとして作成。

**認証:** 必須

**パラメータ:**
- `gameId` (path): ゲーム ID (UUID または public_id `g_xxxxxxxxxx`)

**レスポンス:**
```json
{
  "success": true,
  "project": {
    "id": "uuid",
    "name": "Original Game (Remix)",
    "user_id": "uuid",
    "remixed_from": "uuid"
  }
}
```

**エラー:**
- 400: `{ "error": "Invalid game ID format" }`
- 404: `{ "error": "Game not found" }` - 存在しない、または非公開
- 403: `{ "error": "Remix not allowed for this game" }` - `allow_remix = false`

---

#### `GET /api/games/:gameId/lineage`

ゲームの系譜（先祖・子孫のツリー）を取得。

**認証:** 不要

**パラメータ:**
- `gameId` (path): ゲーム ID (UUID または public_id `g_xxxxxxxxxx`)

**レスポンス:**
```json
{
  "actualRoot": {
    "projectId": "uuid",
    "name": "Original Game",
    "isPublic": true,
    "creatorName": "User Name",
    "avatarUrl": "https://...",
    "publishedGame": {
      "id": "uuid",
      "publicId": "g_xxxxxxxxxx",
      "title": "Original Game",
      "thumbnailUrl": "/api/projects/{id}/thumbnail"
    }
  },
  "visibleAncestors": [
    {
      "projectId": "uuid",
      "name": "Ancestor Game",
      "userId": "uuid",
      "creatorName": "...",
      "avatarUrl": "...",
      "publishedGame": { ... },
      "createdAt": "2026-01-29T12:00:00.000Z"
    }
  ],
  "current": { ... },
  "descendants": [
    {
      "projectId": "uuid",
      "name": "Child Game",
      "children": [ ... ]
    }
  ],
  "stats": {
    "actualDepth": 3,
    "visibleDepth": 2,
    "visibleRemixes": 5,
    "totalRemixes": 8,
    "totalRemixesExact": true,
    "maxDepth": 10,
    "depthCapped": false
  }
}
```

**非公開ルートの場合:**
```json
{
  "actualRoot": {
    "projectId": null,
    "name": "(非公開)",
    "isPublic": false,
    "publishedGame": null
  }
}
```

**stats フィールド:**
- `actualDepth`: 実際の世代数（非公開含む）
- `visibleDepth`: 表示される公開先祖の数
- `visibleRemixes`: 表示される公開 Remix 数（maxDepth 制限付き）
- `totalRemixes`: 全 Remix 数（非公開含む）
- `totalRemixesExact`: RPC 成功時 `true`、フォールバック時 `false`
- `totalRemixesFallbackMaxDepth`: RPC 失敗時のフォールバック探索深さ（`exact=false` 時のみ）
- `maxDepth`: 子孫の最大探索深さ (10)
- `depthCapped`: 深さ制限に達したか

**エラー:**
- 400: `{ "error": "Invalid game ID format" }`
- 404: `{ "error": "Game not found" }`

---

### Published Games (V2)

#### `POST /api/projects/:projectId/publish`

ゲームを公開（または公開情報を更新）。

**認証:** 必須

**リクエストボディ:**
```json
{
  "title": "My Awesome Game",
  "description": "Game description",
  "howToPlay": "Use arrow keys to move",
  "tags": ["action", "puzzle"],
  "visibility": "public",
  "allowRemix": true,
  "thumbnailUrl": "/api/projects/{projectId}/thumbnail"
}
```

**パラメータ:**
- `title` (required): ゲームタイトル
- `description` (optional): ゲーム説明
- `howToPlay` (optional): 遊び方
- `tags` (optional): タグ配列
- `visibility` (optional): `public`, `private`, `unlisted` (default: `public`)
- `allowRemix` (optional): リミックス許可 (default: `true`)
- `thumbnailUrl` (optional): サムネイル URL

**レスポンス:**
```json
{
  "success": true,
  "gameId": "uuid",
  "game": {
    "id": "uuid",
    "project_id": "uuid",
    "title": "My Awesome Game",
    "visibility": "public",
    ...
  }
}
```

**エラー:**
- 400: `{ "error": "Title is required" }`
- 400: `{ "error": "Invalid visibility option" }`
- 400: `{ "error": "Tags must be an array of strings" }`
- 500: `{ "error": "Failed to publish game" }`

---

#### `GET /api/projects/:projectId/published`

プロジェクトの公開状態を確認。

**認証:** 必須

**レスポンス:**
```json
{
  "published": true,
  "game": {
    "id": "uuid",
    "title": "My Awesome Game",
    ...
  }
}
```

未公開の場合:
```json
{
  "published": false,
  "game": null
}
```

---

#### `DELETE /api/projects/:projectId/publish`

ゲームを非公開にする。

**認証:** 必須

**レスポンス:**
```json
{
  "success": true
}
```

**エラー:**
- 500: `{ "error": "Failed to unpublish game" }`

---

#### `GET /api/published-games/:id`

公開ゲームの情報を取得。認証不要。`public` または `unlisted` のゲームのみ取得可能。

**注意:** このエンドポイントは play_count を増やしません。プレイ数は `POST /api/published-games/:id/play` で別途カウントしてください。

**認証:** 不要

**レスポンス:**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "user_id": "uuid",
  "title": "My Awesome Game",
  "description": "Game description",
  "how_to_play": "Use arrow keys",
  "tags": ["action", "puzzle"],
  "thumbnail_url": "/api/projects/{projectId}/thumbnail",
  "visibility": "public",
  "allow_remix": true,
  "play_count": 123,
  "like_count": 45,
  "published_at": "2026-01-29T12:00:00.000Z",
  "updated_at": "2026-01-29T12:00:00.000Z",
  "projects": {
    "id": "uuid",
    "name": "Project Name"
  }
}
```

**エラー:**
- 400: `{ "error": "Invalid game ID" }`
- 404: `{ "error": "Game not found" }` - 存在しない、または private

---

#### `POST /api/published-games/:id/play`

プレイ数をインクリメント。ゲームが実際に開始された時に呼び出す。

**認証:** 不要

**レスポンス:**
```json
{
  "success": true
}
```

**エラー:**
- 400: `{ "error": "Invalid game ID" }`
- 404: `{ "error": "Game not found" }`

---

#### `GET /api/published-games`

公開ゲーム一覧を取得（ディスカバーページ用）。`public` ゲームのみ。

**認証:** 不要

**クエリパラメータ:**
- `limit` (optional): 取得件数 (default: 50, max: 100)
- `offset` (optional): オフセット (default: 0)

**レスポンス:**
```json
{
  "games": [
    {
      "id": "uuid",
      "title": "My Awesome Game",
      "description": "...",
      "tags": ["action"],
      "thumbnail_url": "...",
      "play_count": 123,
      "like_count": 45,
      "published_at": "...",
      "projects": { "id": "uuid", "name": "..." },
      "users": { "display_name": "User", "avatar_url": "..." }
    }
  ]
}
```

---

#### `GET /api/my-published-games`

自分の公開ゲーム一覧を取得。

**認証:** 必須

**レスポンス:**
```json
{
  "games": [...]
}
```

---

### Public Game Files

#### `GET /g/:gameId/*`

公開ゲームのファイルを配信。認証不要。`public` または `unlisted` ゲームのみアクセス可能。

**認証:** 不要

**例:**
- `/g/{gameId}/index.html`
- `/g/{gameId}/assets/player.png`

**特殊処理:**
- `index.html` には `window.ASSET_BASE_URL` が自動注入される（V2_DOMAIN を使用）
- CSP ヘッダー `frame-ancestors 'self' https://play.dreamcore.gg` が設定される

**エラー:**
- 400: プレーンテキスト `"Invalid game ID"`
- 400: プレーンテキスト `"Invalid file path"` または `"Invalid path"`
- 404: プレーンテキスト `"Game not found"` - 存在しない、または private
- 404: プレーンテキスト `"File not found"`

**対応 Content-Type:**
`/game/:userId/:projectId/*` と同様。

---

#### `GET /g/:gameId` (play.dreamcore.gg)

`play.dreamcore.gg` ドメインからアクセス時は `play-public.html`（iframe ラッパー）を返す。

**認証:** 不要

**レスポンス:** `text/html` - ゲームを iframe で表示するラッパーページ

---

### Image Generation

#### `POST /api/generate-image`

Gemini Imagen (Nano Banana / gemini-2.5-flash-image) で画像を生成。

**認証:** 必須

**リクエストボディ:**
```json
{
  "prompt": "A cute pixel art character",
  "style": "pixel",
  "size": "512x512"
}
```

**レスポンス:**
```json
{
  "success": true,
  "image": "data:image/png;base64,...",
  "prompt": "Enhanced prompt used..."
}
```

**エラー:**
- 400: `{ "error": "prompt is required" }`
- 503: `{ "error": "Image generation service not available" }` - GEMINI_API_KEY 未設定
- 500: `{ "error": "...", "success": false }`

---

#### `POST /api/assets/remove-background`

BRIA RMBG 2.0 (Replicate API) で背景を除去。

**認証:** 必須

**リクエストボディ:**
```json
{
  "image": "data:image/png;base64,..."
}
```

**レスポンス:**
```json
{
  "success": true,
  "image": "data:image/png;base64,..."
}
```

**エラー:**
- 400: `{ "error": "image is required" }`
- 503: `{ "error": "Background removal service not configured" }` - REPLICATE_API_TOKEN 未設定
- 500: `{ "error": "...", "success": false }`

---

### Page Routes

これらは HTML ページを返す。

| Path | 説明 | 認証 |
|------|------|------|
| `/` | ログインページ | 不要 |
| `/create` | プロジェクト一覧 | 不要（JS で認証） |
| `/project/:id` | エディターページ | 不要（JS で認証） |
| `/play/:projectId` | プレイ画面 | **必須**（オーナーのみ） |
| `/discover` | ディスカバーページ | 不要 |
| `/mypage` | マイページ | 不要（JS で認証） |
| `/notifications` | 通知ページ | 不要 |

---

## CLI Deploy API

外部 CLI からゲームをデプロイ・管理するための API。

**ベース URL:** `/api/cli`

**認証:** CLI トークン（`dc_` + 32文字）を `Authorization: Bearer` で送信

### POST /device/code

デバイスフロー認証のコードを発行。

**レスポンス:**
```json
{
  "device_code": "xxx",
  "user_code": "ABCD-1234",
  "verification_uri": "https://v2.dreamcore.gg/cli-auth/auth.html",
  "expires_in": 900,
  "interval": 5
}
```

### POST /device/authorize

ユーザーコードを認可（Supabase Auth トークン必須）。

**リクエスト:**
```json
{ "user_code": "ABCD-1234" }
```

### POST /device/token

トークンをポーリングで取得。

**リクエスト:**
```json
{
  "device_code": "xxx",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
}
```

**レスポンス（成功）:**
```json
{
  "access_token": "dc_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token_type": "bearer"
}
```

### POST /deploy

ゲームをデプロイ（ZIP ファイル）。

**リクエスト:** `multipart/form-data` で `file` フィールドに ZIP を送信

**レスポンス:**
```json
{
  "success": true,
  "public_id": "g_7F2cK9wP1x",
  "url": "https://v2.dreamcore.gg/game/g_7F2cK9wP1x",
  "files_uploaded": 15,
  "is_update": false
}
```

### GET /projects

自分のプロジェクト一覧を取得。

**レスポンス:**
```json
{
  "projects": [
    {
      "id": "g_7F2cK9wP1x",
      "title": "My Game",
      "url": "https://v2.dreamcore.gg/game/g_7F2cK9wP1x",
      "visibility": "public",
      "play_count": 42,
      "created_at": "2026-02-03T10:00:00Z",
      "updated_at": "2026-02-03T12:00:00Z"
    }
  ]
}
```

### DELETE /projects/:id

プロジェクトを削除（Storage ファイルも削除）。

**レスポンス:**
```json
{ "success": true, "message": "Project deleted" }
```

### PATCH /projects/:id

メタデータのみを更新（ファイル変更なし）。

**リクエスト:**
```json
{
  "title": "新しいタイトル",
  "description": "新しい説明",
  "howToPlay": "操作方法",
  "tags": ["アクション", "パズル"],
  "visibility": "public",
  "allowRemix": true
}
```

**注意:** 変更するフィールドのみ送信。全フィールド不要。

**バリデーション:**
| フィールド | 制約 |
|-----------|------|
| `title` | 50字以内 |
| `description` | 500字以内 |
| `howToPlay` | 1000字以内 |
| `tags` | 最大5個、各20字以内 |
| `visibility` | `"public"` or `"unlisted"` |
| `allowRemix` | boolean |

**レスポンス:**
```json
{
  "success": true,
  "message": "Metadata updated",
  "updated_fields": ["title", "description"]
}
```

---

## WebSocket API

### 接続

**URL:** `ws://host:port` (HTTPS 環境では自動で WSS に昇格)

### 認証

接続後、`init` メッセージで `access_token` を送信する。

```json
{
  "type": "init",
  "access_token": "eyJhbGc...",
  "sessionId": "optional-session-id"
}
```

認証失敗時は `4001` コードで切断される。

### エラー形式

通常のエラー:
```json
{
  "type": "error",
  "message": "Error message here"
}
```

一部のエラー（レート制限等）は構造化形式:
```json
{
  "type": "error",
  "error": {
    "code": "SYSTEM_LIMIT_EXCEEDED",
    "message": "System is busy"
  }
}
```

### 後方互換性

クライアントは**未知のメッセージタイプを無視する**実装を推奨。新しいイベントタイプが追加される可能性がある。

---

### メッセージタイプ一覧

#### 接続管理

| Type | Direction | 説明 |
|------|-----------|------|
| `init` | → Server | 認証・初期化 |
| `init` | ← Server | 初期化完了、プロジェクト一覧 |
| `ping` | → Server | 接続ヘルスチェック |
| `pong` | ← Server | ping への応答 |
| `error` | ← Server | エラー通知 |

#### プロジェクト操作

| Type | Direction | 説明 |
|------|-----------|------|
| `selectProject` | → Server | プロジェクトを選択 |
| `projectSelected` | ← Server | 選択完了、履歴・バージョン情報 |
| `createProject` | → Server | プロジェクト作成 |
| `projectCreated` | ← Server | 作成完了 |
| `deleteProject` | → Server | プロジェクト削除 |
| `projectDeleted` | ← Server | 削除完了 |
| `renameProject` | → Server | プロジェクト名変更 |
| `projectRenamed` | ← Server | 名前変更完了（生成中の自動リネーム含む） |
| `getProjectInfo` | → Server | プロジェクト情報取得 |
| `projectInfo` | ← Server | プロジェクト情報 |

#### コード生成

| Type | Direction | 説明 |
|------|-----------|------|
| `message` | → Server | ユーザーメッセージ送信 |
| `styleOptions` | ← Server | スタイル選択画面表示 |
| `jobStarted` | ← Server | ジョブ開始 |
| `started` | ← Server | ジョブ処理開始 |
| `progress` | ← Server | ジョブ進捗更新 |
| `completed` | ← Server | ジョブ完了 |
| `failed` | ← Server | ジョブ失敗 |
| `cancelled` | ← Server | ジョブキャンセル |
| `stream` | ← Server | ストリーミング出力 |
| `gameUpdated` | ← Server | ゲーム更新完了 |
| `limitExceeded` | ← Server | 同時実行制限超過 |
| `status` | ← Server | ステータスメッセージ（レガシー同期処理） |

**注意:** ジョブイベント（`started`, `progress`, `completed`, `failed`, `cancelled`）は直接送信される。`jobUpdate` ラッパーは使用されない。

#### Gemini/AI 関連

| Type | Direction | 説明 |
|------|-----------|------|
| `geminiCode` | ← Server | Gemini によるコード生成結果 |
| `geminiChat` | ← Server | Gemini/Haiku によるチャット応答 |
| `geminiRestore` | ← Server | 復元リクエストの処理結果 |
| `imagesGenerated` | ← Server | 画像生成完了通知 |

#### ジョブ管理

| Type | Direction | 説明 |
|------|-----------|------|
| `getJobStatus` | → Server | ジョブ状態取得 |
| `jobStatus` | ← Server | ジョブ状態 |
| `subscribeJob` | → Server | ジョブ更新購読 |
| `subscribed` | ← Server | 購読開始 |
| `cancelJob` | → Server | ジョブキャンセル |
| `jobCancelled` | ← Server | キャンセル完了 |
| `cancel` | → Server | 操作キャンセル（レガシー） |
| `cancelled` | ← Server | キャンセル完了 |

#### バージョン管理

| Type | Direction | 説明 |
|------|-----------|------|
| `getVersions` | → Server | バージョン一覧取得 |
| `versionsList` | ← Server | バージョン一覧 |
| `getVersionEdits` | → Server | バージョンの変更内容取得 |
| `versionEdits` | ← Server | 変更内容 |
| `restoreVersion` | → Server | バージョン復元 |
| `restoreProgress` | ← Server | 復元進捗（checkout/sync） |
| `versionRestored` | ← Server | 復元完了 |

#### テスト

| Type | Direction | 説明 |
|------|-----------|------|
| `testError` | → Server | エラーハンドリングテスト（Modal のみ） |
| `started` | ← Server | テストジョブ開始 |

---

### ジョブイベントの詳細

ジョブの状態遷移は直接 `type` で送信される（`jobUpdate` ラッパーなし）。

#### started

```json
{
  "type": "started",
  "job": {
    "id": "uuid",
    "status": "processing",
    "progress": 0
  }
}
```

#### progress

```json
{
  "type": "progress",
  "job": { ... },
  "progress": 50,
  "message": "コードを生成中..."
}
```

#### completed

```json
{
  "type": "completed",
  "job": { ... },
  "result": { ... }
}
```

#### failed

```json
{
  "type": "failed",
  "job": { ... },
  "error": "Error message",
  "code": "CLI_TIMEOUT",
  "userMessage": "生成に時間がかかりすぎました（5分制限）",
  "recoverable": true,
  "exitCode": 124
}
```

**エラーコード（code）:**

| コード | exitCode | 説明 |
|--------|----------|------|
| `CLI_TIMEOUT` | 124 | タイムアウト（設定: 10分、メッセージ: 5分表記） |
| `CLI_KILLED` | 137 | キャンセルされた |
| `CLI_TERMINATED` | 143 | 中断された |
| `CLI_GENERAL_ERROR` | その他 | 一般エラー |
| `CLI_SPAWN_ERROR` | - | プロセス起動失敗 |
| `NETWORK_ERROR` | - | ネットワークエラー（Modal） |
| `SANDBOX_ERROR` | - | サンドボックスエラー（Modal） |
| `UNKNOWN_ERROR` | - | 不明なエラー（Modal） |

**注意:** `code` は上記以外の値を含む可能性がある。クライアントは未知のコードを想定すること。

#### cancelled

ジョブイベントとして送信される場合:

```json
{
  "type": "cancelled",
  "job": { ... }
}
```

レガシー `cancel` メッセージへの応答として送信される場合:

```json
{
  "type": "cancelled",
  "message": "Job cancelled",
  "jobId": "uuid"
}
```

または:

```json
{
  "type": "cancelled",
  "message": "Operation cancelled"
}
```

**注意:** クライアントは両方の形式を処理できるようにすること。

---

### メッセージ詳細

#### `init` (Client → Server)

```json
{
  "type": "init",
  "access_token": "eyJhbGc...",
  "sessionId": "optional-session-id"
}
```

#### `init` (Server → Client)

```json
{
  "type": "init",
  "userId": "uuid",
  "projects": [
    {
      "id": "uuid",
      "name": "My Game",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

#### `selectProject`

```json
{
  "type": "selectProject",
  "projectId": "uuid"
}
```

#### `projectSelected`

```json
{
  "type": "projectSelected",
  "projectId": "uuid",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "versions": {
    "versions": [...],
    "currentHead": "abc1234"
  },
  "activeJob": null
}
```

#### `message`

```json
{
  "type": "message",
  "content": "シューティングゲームを作って",
  "rawContent": "シューティングゲームを作って",
  "selectedStyle": {
    "dimension": "2d",
    "styleId": "pixel-art"
  },
  "attachedAssets": [],
  "async": true,
  "autoFix": false,
  "skipStyleSelection": false,
  "debugOptions": {
    "useClaude": false,
    "disableSkills": false
  }
}
```

#### `styleOptions`

```json
{
  "type": "styleOptions",
  "dimension": "2d",
  "styles": [
    {
      "id": "pixel-art",
      "name": "Pixel Art",
      "description": "...",
      "imageUrl": "/styles/pixel-art.webp"
    }
  ],
  "originalMessage": "2Dシューティングゲームを作って"
}
```

#### `jobStarted`

```json
{
  "type": "jobStarted",
  "job": {
    "id": "uuid",
    "status": "processing",
    "progress": 0
  },
  "isExisting": false
}
```

#### `limitExceeded`

```json
{
  "type": "limitExceeded",
  "limit": 1,
  "inProgress": 1,
  "jobs": [
    {
      "jobId": "uuid",
      "projectId": "uuid",
      "projectName": "My Game",
      "status": "processing",
      "createdAt": "2026-01-29T12:00:00.000Z"
    }
  ],
  "pendingPrompt": {
    "content": "...",
    "attachedAssets": [],
    "selectedStyle": null
  }
}
```

#### `geminiCode`

```json
{
  "type": "geminiCode",
  "mode": "create",
  "summary": "シューティングゲームを作成しました",
  "files": [
    { "path": "index.html", "content": "..." }
  ],
  "suggestions": ["敵を追加", "背景を変更"]
}
```

`mode: "edit"` の場合は `files` の代わりに `edits` を含む:

```json
{
  "type": "geminiCode",
  "mode": "edit",
  "summary": "プレイヤーの速度を上げました",
  "edits": [
    { "path": "index.html", "search": "...", "replace": "..." }
  ],
  "suggestions": []
}
```

#### `geminiChat`

```json
{
  "type": "geminiChat",
  "message": "このゲームでは...",
  "suggestions": ["敵を追加", "背景を変更"]
}
```

#### `geminiRestore`

復元確認ダイアログを表示するリクエスト:

```json
{
  "type": "geminiRestore",
  "mode": "restore",
  "message": "前のバージョンに戻しますか？",
  "confirmLabel": "戻す",
  "cancelLabel": "キャンセル"
}
```

#### `imagesGenerated`

```json
{
  "type": "imagesGenerated",
  "images": {
    "player.png": "/user-assets/{userId}/player.png",
    "enemy.png": "/user-assets/{userId}/enemy.png"
  },
  "message": "画像を生成しました:\n- player.png: /user-assets/..."
}
```

**注意:** `images` はオブジェクト（ファイル名 → URL のマップ）であり、配列ではない。

#### `getJobStatus`

```json
{
  "type": "getJobStatus",
  "jobId": "uuid"
}
```

#### `jobStatus`

ジョブが存在し、所有者である場合:

```json
{
  "type": "jobStatus",
  "job": {
    "id": "uuid",
    "status": "processing",
    "progress": 50,
    "progress_message": "..."
  }
}
```

ジョブが存在しない、または他ユーザーのジョブの場合:

```json
{
  "type": "jobStatus",
  "job": null
}
```

#### `projectRenamed`

```json
{
  "type": "projectRenamed",
  "project": {
    "id": "uuid",
    "name": "New Game Name"
  }
}
```

#### `restoreVersion`

```json
{
  "type": "restoreVersion",
  "projectId": "uuid",
  "versionId": "abc1234"
}
```

#### `restoreProgress`

```json
{
  "type": "restoreProgress",
  "stage": "checkout",
  "message": "ファイルを復元中..."
}
```

stage の値:
- `checkout` - ファイル復元中
- `sync` - Modal 同期中（USE_MODAL=true 時のみ）

#### `testError`

```json
{
  "type": "testError",
  "errorType": "timeout"
}
```

**errorType オプション:**
- `timeout` - タイムアウトエラー
- `general` - 一般エラー
- `sandbox` - サンドボックスエラー
- `network` - ネットワークエラー
- `rate_limit` - レート制限エラー

---

## Modal 統合

### 概要

`USE_MODAL=true` の場合、Claude CLI とファイル操作は Modal Sandbox 上で実行される。

### 環境変数

| 変数 | 説明 |
|------|------|
| `USE_MODAL` | Modal 使用フラグ (`true` / `false`) |
| `MODAL_ENDPOINT` | Modal generate エンドポイント |
| `MODAL_INTERNAL_SECRET` | Modal 内部認証シークレット |

### Modal API エンドポイント

Modal エンドポイントは `MODAL_ENDPOINT` から自動導出される。

| 機能 | エンドポイント名 |
|------|----------------|
| ゲーム生成 | `generate_game` (base) |
| ファイル取得 | `get_file` |
| ファイル一覧 | `list_files` |
| ファイル適用 | `apply_files` |
| Intent 検出 | `detect_intent` |
| Skill 検出 | `detect_skills` |
| Skill コンテンツ | `get_skill_content` |
| Haiku チャット | `chat_haiku` |
| Gemini 生成 | `generate_gemini` |
| 公開情報生成 | `generate_publish_info` |

### SSE → WebSocket イベント変換

| SSE Type | WebSocket Type |
|----------|----------------|
| `status` | `progress` |
| `stream` | `stream` |
| `done` | `completed` |
| `error` | `failed` |
| `result` | `result` |

---

## 認証詳細

### JWT 検証

`server/supabaseClient.js` で `jose` ライブラリを使用し、Supabase の JWKS で JWT を検証。

```javascript
const { verifyToken, createUserClient } = require('./supabaseClient');

const { user, error } = await verifyToken(accessToken);
if (user) {
  const supabase = createUserClient(accessToken);
  // RLS が適用された Supabase クライアント
}
```

### ミドルウェア

| ミドルウェア | 説明 |
|--------------|------|
| `authenticate` | 認証必須。失敗時は 401 |
| `optionalAuth` | 認証オプション。トークンがあれば検証 |
| `checkProjectOwnership` | プロジェクト所有者チェック（400/404/403） |
| `checkJobOwnership` | ジョブ所有者チェック（400/404/403） |
| `checkAssetOwnership` | アセット所有者チェック（400/404/403） |
| `checkAssetAccess` | アセットアクセス権チェック（オーナーまたは公開）（400/404） |

### WebSocket 認証

```javascript
const { verifyWebSocketAuth } = require('./authMiddleware');

const { user, supabase, accessToken, error } = await verifyWebSocketAuth(token);
```

---

## コード例

### cURL

```bash
# ヘルスチェック
curl http://localhost:3000/api/health

# 認証付きリクエスト
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/projects

# ファイルアップロード
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@player.png" \
  -F "projectId=$PROJECT_ID" \
  http://localhost:3000/api/assets/upload
```

### JavaScript (Fetch)

```javascript
// 認証付きリクエスト
const response = await fetch('/api/projects', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
const data = await response.json();

// アセットアップロード
const formData = new FormData();
formData.append('file', file);
formData.append('projectId', projectId);

const uploadResponse = await fetch('/api/assets/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});
```

### JavaScript (WebSocket)

```javascript
const ws = new WebSocket(`ws://${location.host}`);

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'init',
    access_token: accessToken
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'init':
      console.log('Connected as', data.userId);
      break;

    // Job lifecycle events (sent directly, not wrapped)
    case 'started':
      console.log('Job started:', data.job.id);
      break;
    case 'progress':
      console.log('Progress:', data.progress, data.message);
      break;
    case 'completed':
      console.log('Job completed!');
      break;
    case 'failed':
      console.error('Job failed:', data.userMessage || data.error);
      console.error('Error code:', data.code);
      break;
    case 'cancelled':
      console.log('Job cancelled');
      break;

    // Gemini/AI events
    case 'geminiCode':
      console.log('Code generated:', data.summary);
      break;
    case 'geminiChat':
      console.log('Chat response:', data.message);
      break;
    case 'geminiRestore':
      console.log('Restore confirmation:', data.message);
      break;
    case 'imagesGenerated':
      console.log('Images generated:', Object.keys(data.images));
      break;

    // Other events
    case 'gameUpdated':
      console.log('Game updated!');
      break;
    case 'stream':
      process.stdout.write(data.content);
      break;
    case 'error':
      console.error('Error:', data.message || data.error?.message);
      break;

    default:
      // Handle unknown types gracefully (for forward compatibility)
      console.log('Unknown message type:', data.type, data);
  }
};

// プロジェクト選択
ws.send(JSON.stringify({
  type: 'selectProject',
  projectId: 'uuid'
}));

// メッセージ送信
ws.send(JSON.stringify({
  type: 'message',
  content: 'シューティングゲームを作って',
  async: true
}));
```

---

## 参照ファイル

| ファイル | 説明 |
|----------|------|
| `server/index.js` | 全エンドポイント定義 |
| `server/authMiddleware.js` | 認証ミドルウェア |
| `server/modalClient.js` | Modal API クライアント |
| `server/config.js` | 設定・環境変数・レート制限 |
| `server/errorResponse.js` | エラーレスポンス定義（将来の標準化用） |
| `server/claudeRunner.js` | Claude CLI 実行・ジョブ処理 |
| `server/jobManager.js` | ジョブ管理・スロット制御 |
| `server/database-supabase.js` | Supabase DB 操作 |
| `server/geminiClient.js` | Gemini API クライアント |
| `server/remixService.js` | Remix API + 系譜 API |
