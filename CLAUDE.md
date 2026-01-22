# DreamCore V2

AI-powered browser game creation platform.

## 必須環境変数

起動時に以下が未設定の場合、即エラー終了:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 禁止事項

- `/api/auth/*` は廃止 - Supabase Authで代替済み
- `visitorId` の新規利用禁止 - すべて `userId` (Supabase Auth) を使用
- `db.getProject()` は使用禁止 - `db.getProjectById()` を使用

## 認証ルール

- 認証は `authenticate` ミドルウェア経由
- 所有者チェック: `project.user_id === req.user.id`
- WebSocket: `access_token` クエリパラメータ必須

## UUID検証

全箇所で統一:
```javascript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

## コマンド

- `npm run dev` - 開発サーバー起動（ファイル変更で自動再起動）
- `npm start` - 本番起動

## 重要ファイル

- `.claude/plans/auth-migration.md` - 認証移行ドキュメント（実装の詳細はここ）
- `server/authMiddleware.js` - 認証ミドルウェア
- `server/config.js` - 設定・起動チェック
- `server/supabaseClient.js` - Supabaseクライアント

## Phase 1 スコープ

- Creator機能のみ（ゲーム作成・プレビュー・保存）
- 公開機能なし
- `/play/:projectId` - owner-onlyプレビュー
- `/discover` - 静的ページ（Phase 2準備中表示）
