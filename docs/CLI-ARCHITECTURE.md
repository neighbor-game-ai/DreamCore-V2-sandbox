# CLI Deploy Architecture

This document is the source of truth for the CLI deploy/update architecture.

## Important: No Standalone CLI Tool

**`dreamcore` CLI ツールは存在しません。**

CLI Deploy は HTTP API ベースで動作します。Claude Code Skills がユーザーの代わりに以下を実行します:

1. デバイスフロー認証（`/api/cli/device/*`）
2. ZIP 作成（`zip` コマンド）
3. HTTP アップロード（`curl` で `/api/cli/deploy`）

ユーザーは `npm install -g dreamcore` などを実行する必要はありません。

## Overview

CLI Deploy is fully separated from the main DreamCore runtime:

- API/authorization: v2.dreamcore.gg (GCE)
- UGC delivery: cli.dreamcore.gg (Cloudflare Worker proxy)
- Storage/DB: Supabase B (dgusszutzzoeadmpyira)

Canonical public URL:

```
https://cli.dreamcore.gg/g/{public_id}/
```

## Domains

- v2.dreamcore.gg/api/cli/*: CLI API (device flow, deploy, projects)
- v2.dreamcore.gg/cli-auth/*: Device authorization UI
- cli.dreamcore.gg/*: UGC delivery only (no API, no auth UI)

## Storage Layout

Play and CLI now share the same *shape*:

```
users/{user_id}/projects/{public_id}/
```

Examples:

```
users/<user_id>/projects/g_7F2cK9wP1x/index.html
users/<user_id>/projects/g_7F2cK9wP1x/js/main.js
```

## Worker Proxy

Cloudflare Worker resolves public_id -> user_id, then proxies to Supabase Storage:

```
cli.dreamcore.gg/g/{public_id}/*
  -> users/{user_id}/projects/{public_id}/*
```

The Worker strips Supabase CSP/X-Frame-Options, adds frame-ancestors allowlist, and normalizes Content-Type.

## Public ID

- Format: g_ + 10 base62 chars
- Validation: /^g_[A-Za-z0-9]{10}$/
- Immutable (Phase 1)

## Deploy Flow (Create/Update)

1. Client uploads ZIP to /api/cli/deploy
2. Server validates:
   - index.html required at root
   - Zip Slip prevention
   - forbidden paths (.git/, node_modules/, etc.)
   - file count/size limits
   - symlink rejection
3. For update:
   - delete storage recursively under users/{user_id}/projects/{public_id}/
4. Upload files to Storage using the same path
5. Upsert cli_projects + cli_published_games

## API Surface (CLI)

- POST /api/cli/device/code
- POST /api/cli/device/authorize
- POST /api/cli/device/deny
- POST /api/cli/device/token
- POST /api/cli/deploy
- GET  /api/cli/projects
- DELETE /api/cli/projects/:id
- PATCH /api/cli/projects/:id

## Data Stores (Supabase B)

Tables:
- cli_device_codes
- cli_tokens
- cli_projects
- cli_published_games

Tokens:
- token_lookup = HMAC-SHA256 (pepper)
- token_verify = bcrypt

## Security Controls

- Origin allowlist for /device/authorize and /device/deny
- Rate limits per endpoint
- UGC on separate domain (cli.dreamcore.gg)
- CSP control at Worker level (frame-ancestors allowlist)

## Integration with v2 Game Page

`/api/published-games/:id` falls back to CLI games (Supabase B) and returns:
- is_cli_game = true
- play_domain = cli.dreamcore.gg

`public/game.html` uses play_domain and **/g/{public_id}/index.html** for iframe src.

## dreamcore.json Specification (v2)

ZIP ルートに配置するメタデータファイル。

### フィールド一覧

| フィールド | 必須 | 型 | デフォルト | 制約 |
|-----------|------|-----|-----------|------|
| `id` | ❌ | string | 自動生成 | `g_` + 10文字英数字 |
| `title` | ✅ | string | - | 50字以内 |
| `description` | ❌ | string | `null` | 500字以内 |
| `howToPlay` | ❌ | string | `null` | 1000字以内 |
| `tags` | ❌ | string[] | `[]` | 最大5個、各20字以内 |
| `visibility` | ❌ | string | `"public"` | `"public"` or `"unlisted"` |
| `allowRemix` | ❌ | boolean | `true` | Remix許可 |

### 例

```json
{
  "id": "g_7F2cK9wP1x",
  "title": "Space Shooter",
  "description": "A fast-paced arcade shooter set in space.",
  "howToPlay": "Use arrow keys to move. Press Space to shoot.",
  "tags": ["arcade", "shooter", "space"],
  "visibility": "public",
  "allowRemix": true
}
```

### 後方互換性

v1 形式（`title` + `description` のみ）もそのまま動作する。

```json
{
  "title": "My Game",
  "description": "A simple game"
}
```

### バリデーションエラー

| エラー | 原因 |
|--------|------|
| `title is required` | title が未指定 |
| `title must be 50 characters or less` | title が50字超 |
| `tags must be an array` | tags が配列でない |
| `tags must have at most 5 items` | tags が5個超 |
| `visibility must be "public" or "unlisted"` | 不正な visibility 値 |
| `allowRemix must be a boolean` | allowRemix が boolean でない |

## Thumbnail

ZIP ルートに配置するとサムネイルとしてアップロード。

### 対応形式（優先順）

1. `thumbnail.webp`
2. `thumbnail.png`
3. `thumbnail.jpg`

### 制約

- 最大 1MB
- WebP に自動変換（変換失敗時は元形式のまま保存）

### 保存先

```
users/{user_id}/projects/{public_id}/thumbnail.webp
```

