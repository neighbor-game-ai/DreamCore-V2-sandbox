# TODO - DreamCore V2

## 現在の状況

アーキテクチャ設計レビュー完了。同時実行数制御の実装計画を作成。

---

## 残タスク

### 中優先度（100人イベント前に必須）

- [ ] **同時実行数制御の実装** → `.claude/plans/concurrent-execution-control.md`
  - ユーザーあたり1件制限
  - システム全体20件制限（環境変数で調整可能）
  - GCSバックアップ機能（Phase 2）

### 低優先度（運用後に判断）

- [x] profiles テーブル削除 ✅ 2026-01-23
- [ ] インデックス冗長整理（`pg_stat_user_indexes` で確認後）
- [ ] 本番 Redirect URLs に本番URL追加（デプロイ時）
- [ ] iframe sandbox属性のセキュリティ対策（Phase 2でサブドメイン方式で対応）

---

## Phase 2 準備（基盤整備後に着手）

- [ ] 公開機能の設計
- [ ] `/discover` ページ実装
- [ ] `/api/public-games` エンドポイント復活

---

## 作業履歴

### 2026-01-23: 統一パス構造リファクタリング

**詳細:** `.claude/logs/2026-01-23-unified-path-structure.md`

**実施内容:**
- `getProjectPath` を統一構造 `users/{userId}/projects/{projectId}` に変更
- `getProjectPathV2`, `getUserAssetsPathV2` を削除（統合）
- `PROJECTS_DIR`, `ASSETS_DIR` 定数を削除
- 古いMVPドキュメント（ARCHITECTURE.md, SPECIFICATION.md）を削除
- README.md, CLAUDE.md を更新

**新パス構造:**
```
/data/users/{userId}/projects/{projectId}/  - プロジェクト
/data/users/{userId}/assets/                - アセット
/data/assets/global/                        - グローバル
```

---

### 2026-01-23: 画像読み込み問題の調査

**詳細:** `.claude/logs/2026-01-23-image-loading-investigation.md`

**調査内容:**
- `allow-same-origin` 削除を試行 → CDN スクリプトがブロックされゲーム停止
- CORS ヘッダー追加（アセットエンドポイント用）
- `/api/assets/:id` を公開アセット対応に変更

**結論:**
- `allow-same-origin` は Phase 1 では必要（Phase 2 でサブドメイン方式で対応）
- CORS ヘッダーと公開アセット対応は維持

---

### 2026-01-23: visitorId 完全削除

フロントエンドから `visitorId` 変数名を `userId` にリネーム。

**変更ファイル:**
- `public/app.js` - 12箇所リネーム、不要クエリパラメータ削除
- `public/mypage.js`, `notifications.js`, `publish.js` - 各2箇所
- `public/auth.js` - レガシーキークリーンアップ追加
- `CLAUDE.md` - 技術的負債更新

---

### 2026-01-23: アーキテクチャ設計レビュー

元のMVPアーキテクチャ設計書（sandbox-architecture.md）との比較を実施。

**確認結果:**
- ✅ 認証・RLS・データアーキテクチャ: 設計通り
- ⚠️ 同時実行数制御: 未実装 → 計画作成済み
- ⚠️ GCSバックアップ: 未実装（Phase 2）
- ⚠️ iframe allow-same-origin: Phase 2でサブドメイン方式で対応予定

**計画作成:** `.claude/plans/concurrent-execution-control.md`

---

### 2026-01-23: PostgreSQL Table Design レビュー対応

**詳細:** `.claude/logs/2026-01-23-postgresql-table-design-review.md`

**実施内容:**
- wshobson/agents postgresql-table-design スキルでレビュー
- 004_schema_improvements.sql 作成・本番適用
- profiles テーブル削除（技術的負債除去）
- NOT NULL 制約追加、INTEGER → BIGINT
- users.updated_at 追加
- games FK インデックス追加
- rls-policies.sql 更新

**適用結果:**
- テーブル数 9個（設計通り）
- profiles 参照完全削除確認

---

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

最終更新: 2026-01-23 (統一パス構造リファクタリング)
