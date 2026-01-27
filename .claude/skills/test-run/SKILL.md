---
name: test-run
description: プロジェクトのテストを実行するスキル。変更内容に応じて適切なテストを選択・実行します。
---

# Test Run Skill

プロジェクトのテストを実行するスキル。

## トリガー

以下のような依頼で実行:
- 「テストして」
- 「テスト実行して」
- 「RLSテストを実行」
- 「権限テストして」
- 「全テスト回して」

## テスト一覧

### DreamCore-V2 / DreamCore-V2-sandbox

| テストファイル | 対象 | 実行コマンド |
|---------------|------|-------------|
| `test-rls.js` | RLS ポリシー | `node test-rls.js` |
| `test-job-permissions.js` | ジョブ権限 | `node test-job-permissions.js` |
| `test-ws-permissions-final.js` | WebSocket 権限 | `node test-ws-permissions-final.js` |
| `test-ws-project-operations.js` | プロジェクト CRUD | `node test-ws-project-operations.js` |
| `test-assets-api.js` | アセット API | `node test-assets-api.js` |
| `test-exception-boundary.js` | 例外・境界ケース | `node test-exception-boundary.js` |

### DreamCore-V2-modal

| テストファイル | 対象 | 実行コマンド |
|---------------|------|-------------|
| Modal テスト | Modal 関数 | `cd modal/tests && python run_all.py` |
| Next.js テスト | API Routes | `cd next && npm test` |

## 実行手順

### 1. 変更内容の確認

```bash
git diff --name-only HEAD~1
```

### 2. 影響範囲に応じたテスト選択

| 変更ファイル | 実行すべきテスト |
|-------------|-----------------|
| `server/authMiddleware.js` | `test-rls.js`, `test-ws-permissions-final.js` |
| `server/database-supabase.js` | `test-rls.js`, `test-assets-api.js` |
| WebSocket 関連 | `test-ws-permissions-final.js`, `test-ws-project-operations.js` |
| API エンドポイント | `test-assets-api.js`, `test-exception-boundary.js` |
| Modal `app.py` | `modal/tests/run_all.py` |

### 3. テスト実行

```bash
# 個別実行
node test-rls.js

# 全テスト（DreamCore-V2 系）
for test in test-rls.js test-job-permissions.js test-ws-permissions-final.js test-ws-project-operations.js test-assets-api.js test-exception-boundary.js; do
  echo "=== Running $test ==="
  node $test
done
```

### 4. 結果確認

すべてのテストが PASS であることを確認。

## テスト実行前の準備

### 環境変数

```bash
# 必須
export SUPABASE_URL="..."
export SUPABASE_ANON_KEY="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
```

### サーバー起動（必要な場合）

```bash
# WebSocket テストにはサーバーが必要
npm run dev
```

## 出力形式

```markdown
## テスト結果

**実行日時:** YYYY-MM-DD HH:MM
**対象:** DreamCore-V2-sandbox

| テスト | 結果 | 備考 |
|-------|------|------|
| test-rls.js | PASS/FAIL | |
| test-job-permissions.js | PASS/FAIL | |
| ... | | |

**総合結果:** ALL PASS / X件 FAIL
```

## 注意事項

- テスト実行にはサーバーが起動している必要があるものがある
- RLS テストは Supabase に接続するため、環境変数が必須
- 失敗したテストがあれば、修正してから再実行
