# cli.dreamcore.gg Cloudflare Worker

CLI Deploy で公開されたゲームを配信するプロキシ。

## セットアップ手順

### 1. Wrangler CLI インストール

```bash
npm install -g wrangler
```

### 2. Cloudflare にログイン

```bash
wrangler login
```

### 3. Worker をデプロイ

```bash
cd cli-deploy/cloudflare-worker
wrangler deploy
```

デプロイ後、`https://cli-dreamcore.<your-subdomain>.workers.dev` でアクセス可能になります。

### 4. カスタムドメイン設定

1. **Cloudflare Dashboard** → Workers & Pages → cli-dreamcore
2. **Settings** → **Triggers** → **Custom Domains**
3. `cli.dreamcore.gg` を追加

または、**DNS** で設定:

1. Cloudflare DNS で `cli.dreamcore.gg` を追加
2. Type: `CNAME`, Name: `cli`, Target: `cli-dreamcore.<your-subdomain>.workers.dev`
3. Proxy status: **Proxied** (オレンジの雲)

### 5. wrangler.toml のルート設定（オプション）

カスタムドメイン設定後、`wrangler.toml` のコメントを外す:

```toml
routes = [
  { pattern = "cli.dreamcore.gg/*", zone_name = "dreamcore.gg" }
]
```

## 動作確認

```bash
# Worker URL でテスト
curl https://cli-dreamcore.<your-subdomain>.workers.dev/g_XXXXXXXXXX/

# カスタムドメインでテスト（設定後）
curl https://cli.dreamcore.gg/g_XXXXXXXXXX/
```

## URL マッピング

| リクエスト | プロキシ先 |
|-----------|-----------|
| `cli.dreamcore.gg/g_abc123/` | `supabase.co/.../games/g_abc123/index.html` |
| `cli.dreamcore.gg/g_abc123/game.js` | `supabase.co/.../games/g_abc123/game.js` |

## セキュリティ

- public_id 形式（`g_` + 10文字）のみ許可
- パストラバーサル（`..`）をブロック
- セキュリティヘッダー付与
