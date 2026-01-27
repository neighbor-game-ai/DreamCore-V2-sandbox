# TODO - DreamCore V2

## 現在の状況

Phase 1 リファクタリング完了。セキュリティ・安定性の改善を実施。

---

## 残タスク

### 中優先度（100人イベント前に必須）

- [x] **同時実行数制御の実装** ✅ 2026-01-23
  - ユーザーあたり1件制限
  - システム全体50件制限
  - タイムアウト10分
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

### 2026-01-27: Modal Git 操作 await 修正

**詳細:** `.claude/logs/2026-01-27-modal-git-await-fix.md`

**実施内容:**
- `server/index.js` の 4箇所で await 不足を修正
- `test-modal-git-operations.js` 新規作成（E2Eテスト）
- ローカル/Modal 両モードでテスト確認済み

**修正箇所:**
- selectProject: `getVersions()` に await
- getVersions: `getVersions()` に await
- getVersionEdits: `getVersionEdits()` に await
- restoreVersion: `restoreVersion()` に await

---

### 2026-01-27: Modal 統合実装（Express側 Phase 1）

**詳細:** `.claude/logs/2026-01-27-modal-integration-express.md`

**実施内容:**
- `config.js` に Modal 環境変数追加（USE_MODAL, MODAL_ENDPOINT等）
- `modalClient.js` 新規作成（SSEパース、API呼び出し、Git操作）
- `claudeRunner.js` に USE_MODAL 分岐追加（detectIntent, detectSkills, Claude CLI実行）
- `userManager.js` のファイル操作・Git操作を Modal 対応

**設計原則:**
- `USE_MODAL=false` で即座にローカル実行にフォールバック可能
- フロントエンド変更なし、WS/API形式維持
- DB操作は Express に集約（Modal に Supabase 情報を渡さない）

**依存タスク:** Modal側の Git 拡張（`/apply_files` に git_log/git_diff/git_restore アクション追加）が必要

---

### 2026-01-25: sandbox-runtime 導入

**詳細:** `.claude/logs/2026-01-25-sandbox-runtime.md`

**実施内容:**
- Claude CLI 実行に sandbox-runtime を適用（OS ネイティブ隔離）
- 全呼び出しを spawnClaudeAsync() に移行（10箇所）
- 初期化 Promise 共有、シェルエスケープ安全化、動的 allowWrite
- 動作検証完了（初期化・実行・ゲーム生成すべて正常）

---

### 2026-01-23: Phase 1 リファクタリング（セキュリティ・安定性）

**詳細:** `.claude/logs/2026-01-23-phase1-refactoring.md`

**実施内容:**
- P0: コマンドインジェクション修正（execFileSync化、versionId検証）
- P1: 子プロセス同時実行制御（1/user, 50/global, 10分タイムアウト）
- P1: RLSポリシー統合（006_sync_rls.sql）
- P2: エラーレスポンス統一（errorResponse.js）

---

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

最終更新: 2026-01-27 (Modal Git操作 await修正)
