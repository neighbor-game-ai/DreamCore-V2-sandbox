# TODO - DreamCore V2

## 現在の状況

Asset Architecture V2 実装完了。エイリアスベースURLにより「Zero Replacement」を実現。

---

## 残タスク

### 低優先度（運用後に判断）

- [ ] profiles テーブル削除（レガシー、コードで未参照）
- [ ] インデックス冗長整理（`pg_stat_user_indexes` で確認後）
- [ ] 本番 Redirect URLs に本番URL追加（デプロイ時）

---

## Phase 2 準備（基盤整備後に着手）

- [ ] 公開機能の設計
- [ ] `/discover` ページ実装
- [ ] `/api/public-games` エンドポイント復活

---

## 作業履歴

### 2026-01-23: Asset Architecture V2 実装完了

**詳細:** `.claude/logs/2026-01-23-asset-architecture-v2.md`

**実施内容:**
- 005_asset_v2.sql 作成・本番適用（alias, hash, is_global等）
- 新エンドポイント `/user-assets/:userId/:alias`, `/global-assets/:category/:alias`
- AI生成画像のV2対応（saveGeneratedImage更新）
- フロントエンドURL形式変更

**専門家レビュー対応:**
- P0: aliasExists()のis_deleted条件削除（UNIQUE衝突回避）
- P1: filenameサニタイズ追加
- P1: DB失敗時の孤児ファイル削除
- 運用: alias競合ログ追加

**テスト完了:**
- 同名画像自動採番 ✅
- DB失敗時ファイルクリーンアップ ✅

---

### 2026-01-23: 003_sync_schema.sql 本番適用完了

**詳細:** `.claude/logs/2026-01-23-supabase-003-migration.md`

**実施内容:**
- 003_sync_schema.sql 作成・本番適用
- RLS 最適化（`(SELECT auth.uid())`）
- TO authenticated 追加（全29ポリシー）
- WITH CHECK 明示追加（UPDATE 6箇所）
- games ポリシー統一（owner-only）
- FK インデックス追加（10個）
- OAuth コールバックバグ修正

**発見した問題:**
- Supabase Redirect URLs が空だった
- OAuth 後の早期リダイレクト問題

---

### 2026-01-23: 本番調査完了・計画確定

**詳細:** `.claude/plans/supabase-refactoring.md`

**本番調査結果:**
- users: 5件, profiles: 11件
- RLS ポリシー重複（assets/projects 各4ペア）
- 全ポリシーが `{public}` + `auth.uid()` 直書き

---

### 2026-01-22: Phase 1 完了

- Supabase Auth 一本化完了
- 全テストスイート実行・検証完了
- 技術的負債の解消

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| `CLAUDE.md` | プロジェクト全体のルール・方針 |
| `.claude/plans/supabase-refactoring.md` | リファクタリング計画 |
| `.claude/logs/` | 作業ログ（日付別） |

---

最終更新: 2026-01-23 (Asset Architecture V2)
