# TODO - DreamCore V2

## 優先度高（技術的負債）

- [x] `assets.is_deleted` に NOT NULL + DEFAULT FALSE 制約追加
  - マイグレーション: `supabase/migrations/002_assets_is_deleted_not_null.sql`
  - ✅ Supabase Dashboardで実行済み (2026-01-22)
- [x] `database.js`（SQLite版レガシー）削除
- [x] `initLoginUsers.js` 削除（Supabase Auth移行済み）

## Phase 2 準備

- [ ] 公開機能の設計
  - is_public フラグの活用
  - RLSポリシー拡張（public読み取り許可）
- [ ] `/discover` ページ実装（現在は静的「準備中」表示）
- [ ] `/api/public-games` エンドポイント復活（Phase 2用）

## 検討事項

- [ ] 削除済みアセットのレスポンスコード検討（現在404、410にするか？）
  - 現設計: `checkAssetOwnership` → RLSで隠れる → 404固定
  - 410にする場合は参照クライアント/順序の再設計が必要

## 完了済み（参考）

- [x] Supabase Auth一本化
- [x] RLSポリシー実装・検証
- [x] テストスイート作成（48+テスト）
- [x] Phase 1 owner-only モード確認
- [x] `.claude/plans/` をgit管理対象に追加
- [x] フロントエンドSupabase Auth対応（Google Sign-In）
- [x] API呼び出しをauthFetch化（Authorization Bearer）
- [x] `profiles` → `users` テーブル修正（FK制約対応）
- [x] プレビューiframe認証（access_token query param）
- [x] visitorId言及をserverディレクトリから完全削除
- [x] Phase 1 全テスト検証完了（RLS, WebSocket, Assets, Project CRUD）

---

最終更新: 2026-01-22
**Phase 1 完了**
詳細は `CLAUDE.md` および `.claude/plans/` を参照
