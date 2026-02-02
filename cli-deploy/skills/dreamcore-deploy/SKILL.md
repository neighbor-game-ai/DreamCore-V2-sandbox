# DreamCore Deploy

DreamCore にゲームをデプロイするスキル。

## 使用タイミング

- ユーザーが「DreamCore にデプロイして」「公開して」「アップロードして」と言った時
- HTML5 ゲームを作成した後、公開 URL が必要な時
- 既存のゲームを更新したい時

## 前提条件

1. デプロイするゲームが `index.html` を含むこと
2. DreamCore の認証トークンが設定されていること（初回のみ認証フローが必要）

## 認証フロー（初回のみ）

```bash
# 1. デバイスコードを発行
curl -X POST https://v2.dreamcore.gg/api/cli/device/code

# レスポンス例:
# {
#   "device_code": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
#   "user_code": "ABCD-1234",
#   "verification_uri": "https://v2.dreamcore.gg/cli-auth/auth.html",
#   "verification_uri_complete": "https://v2.dreamcore.gg/cli-auth/auth.html?code=ABCD-1234",
#   "expires_in": 900,
#   "interval": 5
# }

# 2. ユーザーに verification_uri_complete を開いてもらい認可してもらう
# 3. トークンをポーリング
curl -X POST https://v2.dreamcore.gg/api/cli/device/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": "<device_code>"}'

# 成功時のレスポンス:
# {
#   "access_token": "dc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
#   "token_type": "Bearer"
# }
```

**トークンの保存場所:** `.dreamcore/token` にトークンを保存

## デプロイ手順

### 1. dreamcore.json を作成

プロジェクトルートに `dreamcore.json` を作成:

```json
{
  "title": "ゲームタイトル",
  "description": "ゲームの説明（任意）"
}
```

既存プロジェクトを更新する場合は `id` を追加:

```json
{
  "id": "g_XXXXXXXXXX",
  "title": "ゲームタイトル"
}
```

### 2. ZIP ファイルを作成

```bash
# ゲームディレクトリで実行
zip -r game.zip . -x "*.git*" -x "node_modules/*" -x ".DS_Store"
```

### 3. デプロイ

```bash
curl -X POST https://v2.dreamcore.gg/api/cli/deploy \
  -H "Authorization: Bearer dc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -F "file=@game.zip"

# 成功時のレスポンス:
# {
#   "success": true,
#   "public_id": "g_7F2cK9wP1x",
#   "url": "https://cli.dreamcore.gg/g_7F2cK9wP1x/",
#   "files_uploaded": 15,
#   "is_update": false
# }
```

## プロジェクト管理

### 一覧を取得

```bash
curl -H "Authorization: Bearer dc_xxxxxxxx" \
  https://v2.dreamcore.gg/api/cli/projects
```

### 削除

```bash
curl -X DELETE \
  -H "Authorization: Bearer dc_xxxxxxxx" \
  https://v2.dreamcore.gg/api/cli/projects/g_XXXXXXXXXX
```

## 実装例（Node.js スクリプト）

```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOKEN_FILE = '.dreamcore/token';
const API_BASE = 'https://v2.dreamcore.gg/api/cli';

async function deploy(gameDir) {
  // トークンを読み込み
  const tokenPath = path.join(process.env.HOME, TOKEN_FILE);
  if (!fs.existsSync(tokenPath)) {
    console.error('認証が必要です。まず認証フローを実行してください。');
    return;
  }
  const token = fs.readFileSync(tokenPath, 'utf-8').trim();

  // ZIP を作成
  const zipPath = '/tmp/game.zip';
  execSync(`cd "${gameDir}" && zip -r "${zipPath}" . -x "*.git*" -x "node_modules/*"`);

  // デプロイ
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(zipPath));

  const res = await fetch(`${API_BASE}/deploy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...form.getHeaders()
    },
    body: form
  });

  const result = await res.json();
  if (result.success) {
    console.log(`デプロイ成功: ${result.url}`);
  } else {
    console.error('デプロイ失敗:', result.message);
  }
}
```

## 注意事項

- ファイルサイズ上限: 単一ファイル 50MB、合計 100MB
- 許可される拡張子: .html, .css, .js, .json, .png, .jpg, .gif, .webp, .svg, .mp3, .ogg, .wav, .woff, .woff2, .glb, .gltf
- `index.html` がルートに必須
- public_id（例: g_XXXXXXXXXX）は一度発行されると変更不可
