# CLI Deploy スキーマ統一 & Worker 修正

**日付:** 2026-02-03
**作業者:** Claude Opus 4.5

## 概要

CLI Deploy のデータベーススキーマを Play (Supabase A) と統一し、Worker の認証エラーを修正。

## 実施内容

### 1. データベーススキーマ統一（Supabase B）

**cli_projects テーブル:**
| 変更 | 詳細 |
|------|------|
| `title` → `name` | Play の projects テーブルに合わせてリネーム |
| `game_type` 追加 | `'2d'` or `'3d'`、デフォルト `'2d'` |
| `storage_path` 追加 | Storage パス（通常 NULL、自動導出） |
| `is_public` 追加 | 公開フラグ（Phase 2 用）、デフォルト `FALSE` |
| `remixed_from` 追加 | リミックス元プロジェクトへの自己参照 FK |

**cli_published_games テーブル:**
| 追加カラム | 型 | デフォルト |
|-----------|-----|-----------|
| `title` | TEXT | - |
| `description` | TEXT | - |
| `how_to_play` | TEXT | - |
| `thumbnail_url` | TEXT | - |
| `tags` | TEXT[] | `'{}'` |
| `visibility` | TEXT | `'public'` |
| `allow_remix` | BOOLEAN | `TRUE` |
| `play_count` | INTEGER | `0` |
| `like_count` | INTEGER | `0` |
| `updated_at` | TIMESTAMPTZ | `NOW()` |

**マイグレーション:** `align_cli_schema_with_play`
- インデックス追加（user_id, is_public, visibility, published_at）
- `updated_at` 自動更新トリガー追加
- 既存データの `title` を `cli_projects.name` からコピー

### 2. サーバーコード更新

**cli-deploy/server/routes.js:**
- `title` → `name` に変更（INSERT/UPDATE/SELECT）
- `cli_published_games` に `title`, `description` を追加
- `/projects` GET レスポンスに `game_type`, `thumbnail_url`, `visibility`, `play_count` 追加

**cli-deploy/server/index.js:**
- `getCliPublishedGame()` を全フィールド対応に更新
- Play の `published_games` と同じ形式でレスポンス返却

### 3. Worker 認証エラー修正

**問題:** CLI ゲーム（`cli.dreamcore.gg/g/g_xxxxx/`）が 404 エラー

**原因:** Worker の `SUPABASE_SERVICE_ROLE_KEY` が間違っていた
- Worker は Supabase B の DB lookup を行う
- 設定されていたキーが Supabase B 用ではなかった

**ログ:**
```
(error) DB lookup failed: 401
```

**修正:**
```bash
echo "$SUPABASE_CLI_SERVICE_ROLE_KEY" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

**結果:**
```
HTTP/2 200
content-type: text/html; charset=utf-8
```

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `cli-deploy/server/routes.js` | `name` カラム使用、新フィールド追加 |
| `cli-deploy/server/index.js` | `getCliPublishedGame()` 全フィールド対応 |
| Cloudflare Worker (cli-dreamcore) | `SUPABASE_SERVICE_ROLE_KEY` secret 更新 |

## スキーマ比較（統一後）

### cli_projects vs projects (Play)

| カラム | CLI | Play | 備考 |
|--------|-----|------|------|
| id | UUID | UUID | ✅ |
| user_id | UUID | UUID | ✅ |
| public_id | TEXT | TEXT | ✅ |
| name | TEXT | TEXT | ✅ (CLI は title からリネーム) |
| game_type | TEXT | TEXT | ✅ |
| storage_path | TEXT | TEXT | ✅ |
| is_public | BOOLEAN | BOOLEAN | ✅ |
| remixed_from | UUID | UUID | ✅ |
| created_at | TIMESTAMPTZ | TIMESTAMPTZ | ✅ |
| updated_at | TIMESTAMPTZ | TIMESTAMPTZ | ✅ |
| description | TEXT | - | CLI のみ（Play は publish_drafts に） |

### cli_published_games vs published_games (Play)

| カラム | CLI | Play | 備考 |
|--------|-----|------|------|
| id | UUID | UUID | ✅ |
| project_id | UUID | UUID | ✅ |
| user_id | UUID | UUID | ✅ |
| public_id | TEXT | TEXT | ✅ |
| url | TEXT | - | CLI のみ（Play は動的生成） |
| title | TEXT | TEXT | ✅ |
| description | TEXT | TEXT | ✅ |
| how_to_play | TEXT | TEXT | ✅ |
| thumbnail_url | TEXT | TEXT | ✅ |
| tags | TEXT[] | TEXT[] | ✅ |
| visibility | TEXT | TEXT | ✅ |
| allow_remix | BOOLEAN | BOOLEAN | ✅ |
| play_count | INTEGER | INTEGER | ✅ |
| like_count | INTEGER | INTEGER | ✅ |
| published_at | TIMESTAMPTZ | TIMESTAMPTZ | ✅ |
| updated_at | TIMESTAMPTZ | TIMESTAMPTZ | ✅ |

## 検証結果

```bash
# Worker 動作確認
curl -s -I "https://cli.dreamcore.gg/g/g_tNaDWYKAH9/index.html"
# HTTP/2 200
# content-type: text/html; charset=utf-8

# ゲームコンテンツ確認
curl -s "https://cli.dreamcore.gg/g/g_tNaDWYKAH9/index.html" | head -5
# <!DOCTYPE html>
# <html lang="ja">
# <head>
#   <meta charset="UTF-8">
#   <title>Neon Racer</title>
```

## 学び

1. **Worker Secret の管理:** Wrangler CLI で設定した secret が正しい Supabase プロジェクト用か確認が必要
2. **DB 401 エラー:** Supabase REST API の 401 は apikey/Authorization ヘッダーの問題
3. **スキーマ統一のメリット:** 同じ API レスポンス形式で CLI/Play を扱える

## 残タスク

- [ ] CLI Deploy E2E テスト（新スキーマで）
- [ ] デバッグログ削除
- [ ] `/api/published-games/:id/play` の CLI 対応（現在 404）
- [ ] `/api/games/:id/lineage` の CLI 対応（現在 404）

## コミット

```
bfaec9d refactor(cli): align schema with Play (name, visibility, etc.)
```
