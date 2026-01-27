---
name: env-check
description: 必須環境変数が設定されているか確認するスキル。起動前のチェックやトラブルシューティングに使用します。
---

# Env Check Skill

必須環境変数が設定されているか確認するスキル。

## トリガー

以下のような依頼で実行:
- 「環境変数チェックして」
- 「envを確認して」
- 「起動前チェックして」
- 「設定を確認して」

## 必須環境変数

### 共通（全プロジェクト）

| 変数名 | 用途 | 取得元 |
|--------|------|--------|
| `SUPABASE_URL` | Supabase API URL | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | Supabase 匿名キー | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー | Supabase Dashboard > Settings > API |

### DreamCore-V2-sandbox（Modal 統合時）

| 変数名 | 用途 | 取得元 |
|--------|------|--------|
| `USE_MODAL` | Modal 使用フラグ | `true` / `false` |
| `MODAL_ENDPOINT` | Modal generate エンドポイント | Modal Dashboard |
| `MODAL_INTERNAL_SECRET` | Modal 内部認証シークレット | 自分で生成 |

### DreamCore-V2-modal (Next.js on Vercel)

| 変数名 | 用途 | 取得元 |
|--------|------|--------|
| `MODAL_ENDPOINT` | Modal generate-game エンドポイント | Modal Dashboard |
| `MODAL_GET_FILE_ENDPOINT` | Modal get-file エンドポイント | Modal Dashboard |
| `MODAL_INTERNAL_SECRET` | Modal 内部認証シークレット | Modal Secrets |
| `PREVIEW_SIGNING_SECRET` | プレビュー URL 署名用 | 自分で生成 |

### Modal Secrets

```bash
# 確認
modal secret list

# 必要なシークレット
- anthropic-api-key (ANTHROPIC_API_KEY)
- modal-internal-secret (MODAL_INTERNAL_SECRET)
- gemini-api-key (GEMINI_API_KEY)
```

## チェック手順

### 1. ローカル環境のチェック

```bash
# 必須変数の存在確認
echo "SUPABASE_URL: ${SUPABASE_URL:-(未設定)}"
echo "SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY:+設定済み}"
echo "SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:+設定済み}"
```

### 2. .env ファイルの確認

```bash
# .env ファイルの存在確認
ls -la .env .env.local .env.development 2>/dev/null

# 内容確認（秘密情報は表示しない）
grep -E "^[A-Z_]+=" .env | cut -d= -f1
```

### 3. Vercel 環境変数の確認

Vercel Dashboard > Project > Settings > Environment Variables

### 4. Modal Secrets の確認

```bash
modal secret list
```

## 出力形式

```markdown
## 環境変数チェック結果

**実行日時:** YYYY-MM-DD HH:MM
**対象:** DreamCore-V2-sandbox

### 必須変数

| 変数名 | 状態 |
|--------|------|
| SUPABASE_URL | OK / 未設定 |
| SUPABASE_ANON_KEY | OK / 未設定 |
| SUPABASE_SERVICE_ROLE_KEY | OK / 未設定 |
| USE_MODAL | OK / 未設定 |
| MODAL_ENDPOINT | OK / 未設定 |
| MODAL_INTERNAL_SECRET | OK / 未設定 |

### Modal Secrets

| シークレット名 | 状態 |
|---------------|------|
| anthropic-api-key | OK / 未設定 |
| modal-internal-secret | OK / 未設定 |
| gemini-api-key | OK / 未設定 |

### 総合判定
- OK: 全て設定済み
- NG: 未設定の変数あり
```

## トラブルシューティング

### 「SUPABASE_URL is required」エラー

```bash
# .env ファイルに追加
SUPABASE_URL=https://tcynrijrovktirsvwiqb.supabase.co
```

### Modal 接続エラー

```bash
# Modal シークレットを確認
modal secret list

# シークレットを作成/更新
modal secret create anthropic-api-key ANTHROPIC_API_KEY=sk-...
```

### Vercel で環境変数が読めない

1. Vercel Dashboard で変数を確認
2. 再デプロイを実行
3. `process.env.VARIABLE_NAME` でアクセスしているか確認

## 注意事項

- 秘密情報（キー、シークレット）はログに出力しない
- `.env` ファイルは `.gitignore` に含まれているか確認
- 本番環境と開発環境で異なる値を使用する場合は注意
