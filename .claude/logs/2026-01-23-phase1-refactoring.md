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

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/config.js` | `isValidGitHash()`, `RATE_LIMIT` 設定 |
| `server/userManager.js` | `execGitSafe()`, 改行サニタイズ |
| `server/jobManager.js` | スロット管理 |
| `server/claudeRunner.js` | スロット制御統合, タイムアウト |
| `server/index.js` | versionId検証, エラー統一 |
| `server/errorResponse.js` | 新規作成 |
| `supabase/migrations/006_sync_rls.sql` | 新規作成 |

---

## コミット

```
8a1b55a security: Phase 1 リファクタリング（セキュリティ・安定性改善）
```

---

## 次のステップ

- [ ] `006_sync_rls.sql` を Supabase に適用
- [ ] Phase 2 公開機能の実装開始
- [ ] P2 エラー統一の段階的移行（約80箇所）
