# Phase 1 リファクタリング作業ログ

**日付:** 2026-01-23
**目的:** Phase 2（公開機能）前に必要なセキュリティ・安定性の改善

---

## 実施内容

### P0: コマンドインジェクション修正（重大）

**問題:**
`userManager.js` の `execGit` 関数がユーザー入力をシェルコマンドに直接渡していた。
```javascript
// 脆弱なコード
execGit(`git commit -m "${message.replace(/"/g, '\\"')}"`, projectDir);
```
`$(whoami)` やバッククォートでRCE（リモートコード実行）が可能だった。

**修正:**
1. `execSync` → `execFileSync` に移行（シェル解釈を回避）
2. `execGitSafe(['commit', '-m', message])` 形式で引数を配列渡し
3. `isValidGitHash()` 関数を追加し、versionId を検証
4. コミットメッセージの改行をサニタイズ

**変更ファイル:**
- `server/config.js` - `isValidGitHash()` 追加
- `server/userManager.js` - `execGitSafe()` 作成、全呼び出し箇所を置換
- `server/index.js` - `restoreVersion` ハンドラに検証追加

---

### P1: 子プロセス同時実行制御

**問題:**
Claude CLI の spawn 呼び出しに同時実行制限がなく、サーバーリソースを枯渇させる可能性があった。

**修正:**
1. `jobManager.js` にスロット管理を追加
   - `acquireSlot(userId)` - スロット取得（制限超過で例外）
   - `releaseSlot(userId)` - スロット解放（冪等性あり）
2. `claudeRunner.js` に `processJobWithSlot()` ラッパー追加
   - try-finally でスロット解放を保証
   - タイムアウト処理（10分）

**設定値:**
- ユーザーあたり上限: 1件
- システム全体上限: 50件
- タイムアウト: 10分

**変更ファイル:**
- `server/config.js` - `RATE_LIMIT.cli` 設定
- `server/jobManager.js` - スロット管理追加
- `server/claudeRunner.js` - スロット制御統合

---

### P1: RLSポリシー統合

**問題:**
`005_asset_v2.sql` で追加されたRLSポリシーが Phase 2 の anon アクセスに不十分だった。

**修正:**
`006_sync_rls.sql` マイグレーション作成:
- `assets`: anon向けSELECT（公開/グローバル）
- `projects`: anon向けSELECT（公開プロジェクト）
- `project_assets`: anon向けSELECT（公開プロジェクトのリンク）
- `chat_history`: anon向けSELECT（公開プロジェクトの履歴）
- `publish_drafts`: anon向けSELECT（公開情報）

**作成ファイル:**
- `supabase/migrations/006_sync_rls.sql`

---

### P2: エラーレスポンス統一

**問題:**
エラー形式が4種類混在していた:
1. `{ error: "message" }`
2. `{ error: "message", success: false }`
3. プレーンテキスト
4. WebSocket `{ type: 'error', message }`

**修正:**
統一ヘルパー `errorResponse.js` を作成:
```javascript
// HTTP API
{ status: "error", error: { code: "NOT_FOUND", message: "..." } }

// WebSocket
{ type: "error", error: { code: "USER_LIMIT_EXCEEDED", message: "..." } }
```

**作成ファイル:**
- `server/errorResponse.js`

**統合箇所:**
- `server/index.js` - スロット制限エラーで使用

---

## 監修コメント対応

1. **改行サニタイズ:** `commitToProject` に `.replace(/[\r\n]+/g, ' ')` 追加
2. **二重解放ガード:** `releaseSlot` は元から冪等（`if > 0` ガード）→ コメント明示

---

### P3: exec系の完全排除

**問題:**
`index.js`, `claudeChat.js`, `claudeRunner.js` に `exec`/`execSync` が残存。
ユーザー入力は入っていないが、将来の保守性のため統一。

**修正:**
1. `index.js` に `gitCommitAsync` ヘルパー追加（4箇所の `exec` を置換）
2. `claudeChat.js` の `execSync` → `execFileSync`（3箇所）
3. `claudeRunner.js` の `execSync` → `execFileSync`（1箇所）

**結果:**
シェル経由の exec が完全排除され、レビュー基準が明確化。

---

### P4: 公開用インデックス追加

**背景:**
V1で既に7,000件以上の公開ゲームが存在。月間約1,000件の成長見込み。

**修正:**
`007_public_indexes.sql` マイグレーション作成:
- `idx_projects_public` - 公開プロジェクト一覧の高速化
- `idx_assets_public_active` - 公開アセット取得の高速化（`is_deleted = FALSE` 条件付き）

**作成ファイル:**
- `supabase/migrations/007_public_indexes.sql`

---

## 設定変更履歴

| 設定 | 変更前 | 変更後 | 理由 |
|------|--------|--------|------|
| `maxConcurrentTotal` | 10 | 50 | V1実績（7,000件超）を考慮 |
| `timeout` | 5分 | 10分 | ゲーム生成に5分以上かかるケースに対応 |

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/config.js` | `isValidGitHash()`, `RATE_LIMIT` 設定 |
| `server/userManager.js` | `execGitSafe()`, 改行サニタイズ |
| `server/jobManager.js` | スロット管理 |
| `server/claudeRunner.js` | スロット制御統合, タイムアウト, execFileSync化 |
| `server/claudeChat.js` | execFileSync化 |
| `server/index.js` | versionId検証, エラー統一, gitCommitAsyncヘルパー |
| `server/errorResponse.js` | 新規作成 |
| `supabase/migrations/006_sync_rls.sql` | 新規作成 |
| `supabase/migrations/007_public_indexes.sql` | 新規作成 |
| `CLAUDE.md` | 同時実行制御の設定値をドキュメント化 |

---

## コミット履歴

```
8a1b55a security: Phase 1 リファクタリング（セキュリティ・安定性改善）
9f0443b docs: Phase 1 リファクタリング作業ログ追加
9c37427 security: exec系をexecFile系に完全移行（P3）
05f8ca3 perf: Phase 2 公開アクセス用インデックス追加
dc163fc docs: 同時実行制御の設定値をドキュメント化（50/global）
```

---

## 完了状況

- [x] P0: コマンドインジェクション修正
- [x] P1: 同時実行制御（1/user, 50/global, 10分タイムアウト）
- [x] P1: RLSポリシー統合 → Supabase適用済み
- [x] P2: エラーレスポンス統一（ヘルパー作成）
- [x] P3: exec完全排除
- [x] P4: 公開用インデックス → Supabase適用済み

---

## 次のステップ

- [ ] Phase 2 公開機能の実装開始
- [ ] P2 エラー統一の段階的移行（約80箇所）
