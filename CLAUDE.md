# DreamCore V2

AI-powered browser game creation platform.

## 必須環境変数

起動時に以下が未設定の場合、即エラー終了:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 禁止事項

- `/api/auth/*` は廃止 - Supabase Authで代替済み
- `visitorId` の新規利用禁止 - すべて `userId` (Supabase Auth) を使用
- `db.getProject()` は使用禁止 - `db.getProjectById()` を使用
- Cookie認証は使用しない - localStorage + Authorization ヘッダー方式を採用

## 認証ルール

- **認証方式**: Supabase Auth + Google OAuth
- 認証は `authenticate` ミドルウェア経由
- 所有者チェック: `project.user_id === req.user.id`
- WebSocket: `access_token` をinitメッセージで送信

### フロントエンド認証

- `public/auth.js` - Supabase Auth ユーティリティ（`DreamCoreAuth`グローバル）
- `public/index.html` - Google Sign-In ボタン
- `/api/config` - フロントエンド用Supabase設定を提供

### Supabase Dashboard設定（設定済み）

- **Authentication > Providers > Google**: 有効
- Google Cloud Console でOAuthクライアント設定済み
- リダイレクトURL: `https://tcynrijrovktirsvwiqb.supabase.co/auth/v1/callback`

## UUID検証

全箇所で統一:
```javascript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

## コマンド

- `npm run dev` - 開発サーバー起動（ファイル変更で自動再起動）
- `npm start` - 本番起動
- デフォルトポート: **3000**（`PORT`環境変数で変更可能）

## 重要ファイル

- `.claude/plans/auth-migration.md` - 認証移行ドキュメント（実装の詳細）
- `.claude/plans/sandbox-architecture.md` - セキュリティ/サンドボックス設計
- `server/authMiddleware.js` - 認証ミドルウェア
- `server/config.js` - 設定・起動チェック
- `server/supabaseClient.js` - Supabaseクライアント
- `server/database-supabase.js` - Supabase DB操作（現在使用中）
- `.claude/docs/database-schema.md` - DBスキーマ設計詳細

## Phase 1 スコープ

- Creator機能のみ（ゲーム作成・プレビュー・保存）
- 公開機能なし
- `/play/:projectId` - owner-onlyプレビュー
- `/discover` - 静的ページ（Phase 2準備中表示）

## RLS設計方針（Phase 1）

### 基本原則

- **削除済みリソースは見せない**: `is_deleted = true` のアセットはRLSで非表示
- **所有者のみアクセス可**: projects, assets は `owner_id = auth.uid()` でフィルタ

### assets テーブルの特殊動作

SELECTポリシー:
```sql
USING (owner_id = auth.uid() AND is_deleted = FALSE)
```

**Soft Delete後の動作**:
- 更新後、その行はSELECTポリシーにより**見えなくなる**
- PostgRESTのRETURNING（`.select()`）を使うと、更新後の行が取得できずエラーになる

**RLS WITH CHECK制約について**:
- 現在のDB設定では、ユーザークライアントからの`is_deleted = true`更新がRLSで拒否される
- 原因: UPDATEポリシーの`WITH CHECK`句が`is_deleted = FALSE`を要求している可能性
- **対応**: `db.deleteAsset()`は`req.supabase`（ユーザークライアント）を使用しているため、service_roleに変更が必要

**これは仕様です**:
- Phase 1では削除済みアセットを表示しない設計
- ソフトデリート時は `.select()` を使わない（`database-supabase.js:491-495`参照）
- 検証が必要な場合は `service_role` クライアントを使用

**対策済み**: DELETE `/api/assets/:id` エンドポイントでは `supabaseAdmin` (service_role) を使用してsoft deleteを実行

### Wrong Owner アクセス時の挙動

他ユーザーのリソースにアクセスした場合:
- **HTTP 404** が返る（403ではない）
- RLSがクエリ結果をフィルタするため「存在しない」扱いになる
- これはセキュリティ上適切（リソースの存在を漏洩しない）

## テスト

- `node test-rls.js` - RLSポリシーのテスト
- `node test-job-permissions.js` - ジョブ権限テスト
- `node test-ws-permissions-final.js` - WebSocket権限テスト
- `node test-ws-project-operations.js` - プロジェクトCRUD操作テスト
- `node test-assets-api.js` - アセットAPIテスト
- `node test-exception-boundary.js` - 例外・境界ケーステスト

## Phase 1 完了ステータス

**最終検証日: 2026-01-22**

### バックエンド ✅

- [x] public系エンドポイント削除（`/api/public-games`等）
- [x] `/play/:projectId` owner-only
- [x] `/api/assets/search` owner限定
- [x] 起動時envバリデーション（config.js）
- [x] Supabase Auth一本化（database-supabase.js使用中）
- [x] RLSポリシー検証済み（test-rls.js）
- [x] WebSocket権限検証済み（test-ws-permissions-final.js）
- [x] プロジェクトCRUD検証済み（test-ws-project-operations.js）
- [x] アセットAPI検証済み（test-assets-api.js）

### フロントエンド ✅

- [x] Supabase Auth SDK導入（public/auth.js）
- [x] Google Sign-In実装
- [x] authFetch APIラッパー実装
- [x] WebSocket認証（access_token）
- [x] プレビューiframe認証（access_token query param）

### 技術的負債（解消済み）

- ~~`database.js`~~ - 削除済み
- ~~`initLoginUsers.js`~~ - 削除済み
- ~~`assets.is_deleted`~~ - マイグレーション実行済み（2026-01-22）
- ~~`visitorId`言及~~ - serverディレクトリから完全削除（2026-01-22）

## 開発方針

### ローンチ前ポリシー

- **既存データは破棄可能**: マイグレーションで古いデータ・テーブルを削除してOK
- **互換性不要**: 過去のスキーマとの互換性は維持しない
- **技術的負債の除去**: 不要な構造は積極的に DROP
- **ローンチ後は変更**: 本番データができたら安全版マイグレーションに切り替え

### 計画駆動の開発

- 実装前に必ず計画を立てる（`.claude/plans/` 参照）
- ユーザーは非エンジニアのため、計画から外れた指示をすることがある
- その場合は**遠慮なく指摘**し、計画との整合性を確認すること
- 「この指示は〇〇の計画と矛盾しますが、進めてよいですか？」のように確認する

### サブエージェント並列実行

調査・実装タスクではサブエージェント（Task tool）を**複数並列**で実行する。1つで済ませようとせず、観点ごとに分けて並列起動すること。

### 作業記録

ユーザーが作業の記録を依頼した場合（「作業を記録して」「履歴を更新して」「やったことをメモして」等）：

**1. 詳細ログを作成:** `.claude/logs/YYYY-MM-DD-タスク名.md`
- 実施内容の詳細
- 発見した問題と対応
- 専門家レビュー対応
- 変更ファイル一覧
- 学び・注意点

**2. TODO.md を更新:** 概要 + ログへの参照
- 日付と作業タイトル
- `**詳細:** .claude/logs/ファイル名.md` で参照
- 実施内容（箇条書きで簡潔に）
- 発見した問題（あれば）

**ファイル構成:**
```
.claude/logs/          ← 詳細な作業ログ（日付別）
.claude/plans/         ← 計画ファイル
TODO.md                ← 概要 + 参照リンク
```

## パフォーマンス最適化 (2026-01-23)

### バックエンド

- **JWT ローカル検証**: `jose` + JWKS で Supabase API 呼び出しゼロ（`server/supabaseClient.js`）
- `/game/*` エンドポイント: DB クエリ削除、ファイルシステムのみで応答

### フロントエンド

- **Supabase SDK 遅延読み込み**: 初期 JS 346KB → 186KB（`window.__loadSupabase()`）
- **早期 auth リダイレクト**: SDK ロード前に localStorage チェック
- **セッションキャッシュ**: localStorage 5分 TTL（`auth.js`）
- **フォント非ブロッキング**: `@import` 削除 → `preconnect` + `media="print" onload`
- **静的ウェルカム**: HTML に直接配置、サジェスト部分のみ JS で更新
- **スケルトンカード**: create.html でプロジェクト一覧の即時表示
- **iframe 遅延表示**: 新規プロジェクトでは非表示（HTTP リクエスト削減）
- **画像 WebP 化**: PNG → WebP で約 90% サイズ削減
