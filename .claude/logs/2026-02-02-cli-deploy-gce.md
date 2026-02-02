# CLI Deploy GCE デプロイ完了

**日付:** 2026-02-02
**セッション ID:** `1066e873-0ca7-4a51-9715-06aa61d60092`

## 概要

CLI Deploy 機能を GCE 本番環境にデプロイし、動作確認を完了した。

## 実施内容

### 1. server/index.js 統合 (Step 4)

最小限の統合（条件付きロード）:

```javascript
// Line 37-38: CLI Deploy（条件付きロード）
const cliDeploy = process.env.SUPABASE_CLI_URL ? require('../cli-deploy/server') : null;

// Line 305-309: Rate limit exclusion
const publicPaths = [
  '/api/published-games/',
  '/api/config',
  '/api/cli/',  // CLI Deploy（独自レート制限）
];

// Line 400-405: Route mounting
if (cliDeploy) {
  app.use('/api/cli', cliDeploy.router);
  app.use('/cli-auth', express.static(path.join(__dirname, '../cli-deploy/public')));
  console.log('[CLI Deploy] Mounted at /api/cli');
}
```

### 2. Cloudflare Worker 作成 (Step 6)

`cli-deploy/cloudflare-worker/` に Supabase Storage へのプロキシを実装:

| ファイル | 内容 |
|----------|------|
| `worker.js` | プロキシロジック（public_id 検証、パストラバーサル防止） |
| `wrangler.toml` | Worker 設定 |
| `README.md` | セットアップ手順 |

**デプロイ先:** `https://cli-dreamcore.notef.workers.dev`

**注意:** dreamcore.gg は GoDaddy 管理のため、Cloudflare カスタムドメインは設定不可。workers.dev サブドメインを使用。

### 3. 環境変数設定

`.env` に追加:

```bash
# CLI Deploy (Supabase B)
SUPABASE_CLI_URL=https://dgusszutzzoeadmpyira.supabase.co
SUPABASE_CLI_SERVICE_ROLE_KEY=eyJhbG...
TOKEN_PEPPER=687e9811b72979d9ff004906b09d44e24479b43976f62258a5d5349ded751778
CLI_GAMES_DOMAIN=cli-dreamcore.notef.workers.dev
```

### 4. ローカルテスト

```bash
# bcrypt/adm-zip がなかったためインストール
npm install bcrypt adm-zip

# サーバー起動
npm run dev

# テスト
curl -X POST http://localhost:3000/api/cli/device/code
# → 成功
```

### 5. GCE デプロイ (Step 7)

```bash
# コミット & プッシュ
git add cli-deploy/ package.json
git commit -m "feat(cli-deploy): add CLI Deploy module..."
git push

# GCE デプロイ
gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a \
  --command="cd /home/notef/DreamCore-V2-sandbox && git pull && npm install && pm2 restart dreamcore-sandbox"

# 環境変数追加
gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a \
  --command="cat >> /home/notef/DreamCore-V2-sandbox/.env << 'EOF'
# CLI Deploy (Supabase B)
SUPABASE_CLI_URL=https://dgusszutzzoeadmpyira.supabase.co
SUPABASE_CLI_SERVICE_ROLE_KEY=eyJhbG...
TOKEN_PEPPER=687e9811b72979d9ff004906b09d44e24479b43976f62258a5d5349ded751778
CLI_GAMES_DOMAIN=cli-dreamcore.notef.workers.dev
EOF"

# PM2 再起動
pm2 restart dreamcore-sandbox
```

### 6. 本番テスト

```bash
curl -X POST https://v2.dreamcore.gg/api/cli/device/code
```

**結果:**
```json
{
  "device_code": "4bcd8fb0-c5fb-445d-91e2-d12af63f74d0",
  "user_code": "57BH-9ZXE",
  "verification_uri": "https://v2.dreamcore.gg/cli-auth/auth.html",
  "verification_uri_complete": "https://v2.dreamcore.gg/cli-auth/auth.html?code=57BH-9ZXE",
  "expires_in": 900,
  "interval": 5
}
```

## 発見した問題

### 1. bcrypt モジュール不足

**エラー:** `Cannot find module 'bcrypt'`

**原因:** package.json に bcrypt と adm-zip が追加されていなかった

**対応:** `npm install bcrypt adm-zip`

### 2. IPv6 Rate Limit 警告

**エラー:** `ERR_ERL_KEY_GEN_IPV6` in express-rate-limit

**状況:** エラーログに警告が出るが、サーバーは正常起動し、エンドポイントも動作

**対応:** 未対応（非ブロッキング、Phase 2 で検討）

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `server/index.js` | CLI Deploy 統合（条件付きロード） |
| `cli-deploy/` | 新規モジュール全体 |
| `cli-deploy/cloudflare-worker/` | Cloudflare Worker |
| `package.json` | bcrypt, adm-zip 追加 |
| `.env` | CLI Deploy 環境変数 |
| `TODO.md` | 進捗更新 |

## 完了ステータス

| ステップ | 状態 |
|----------|------|
| Step 1: Supabase B セットアップ | ✅ 完了 |
| Step 2: サーバー実装 | ✅ 完了 |
| Step 3: 認証ページ | ✅ 完了 |
| Step 4: server/index.js 統合 | ✅ 完了 |
| Step 5: Claude Code Skills | ✅ 完了 |
| Step 6: Cloudflare Worker | ✅ 完了 |
| Step 7: GCE デプロイ | ✅ 完了 |

## 次のステップ

1. **認証フロー E2E テスト**: `auth.html?code=XXXX-XXXX` を開いて認証 → トークン取得
2. **ゲームデプロイテスト**: `POST /api/cli/deploy` でゲームをアップロード
3. **ゲーム配信テスト**: Cloudflare Worker 経由でゲームがプレイできることを確認

## 学び

- **条件付きロード**: `process.env.XXX ? require(...) : null` で環境変数がない場合はモジュールをスキップ
- **Cloudflare カスタムドメイン**: DNS が Cloudflare 管理でないと設定不可（GoDaddy → workers.dev 使用）
- **PM2 環境変数**: `.env` 変更後は `pm2 restart` が必要
