# GameCreatorMVP - Google Cloud Deployment

## Prerequisites

1. Google Cloud アカウント
2. `gcloud` CLI インストール済み
3. Gemini API Key
4. Anthropic API Key (Claude CLI用)

## デプロイ手順

### 1. GCEインスタンス作成

```bash
# gcloud認証
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# インスタンス作成
chmod +x deploy/create-instance.sh
./deploy/create-instance.sh
```

### 2. VMに接続

```bash
gcloud compute ssh gamecreator-vm --zone=asia-northeast1-b
```

### 3. セットアップスクリプト実行

```bash
# VMで実行
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/deploy/setup-gce.sh | bash
```

または手動で:

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3 git nginx

# PM2 & Claude CLI
sudo npm install -g pm2 @anthropic-ai/claude-code
```

### 4. アプリケーションデプロイ

```bash
cd /opt/gamecreator

# リポジトリをクローン（または直接ファイル転送）
git clone https://github.com/YOUR_REPO.git .

# 依存関係インストール
npm install

# 環境変数設定
cp deploy/.env.example .env
nano .env  # API keyを設定

# Claude CLI設定
claude config set api_key YOUR_ANTHROPIC_API_KEY
```

### 5. PM2で起動

```bash
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup  # 自動起動設定
```

### 6. Nginx設定

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/gamecreator
sudo ln -s /etc/nginx/sites-available/gamecreator /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 7. SSL設定（ドメインがある場合）

```bash
sudo certbot --nginx -d yourdomain.com
```

## 確認

```bash
# PM2ステータス
pm2 status

# ログ確認
pm2 logs gamecreator

# Nginx確認
sudo systemctl status nginx
```

## ファイル転送（Gitを使わない場合）

```bash
# ローカルから
gcloud compute scp --recurse /Users/admin/GameCreatorMVP-v2/* gamecreator-vm:/opt/gamecreator/ --zone=asia-northeast1-b
```

## コスト目安

| マシンタイプ | スペック | 月額(東京) |
|-------------|---------|-----------|
| e2-micro | 0.25 vCPU, 1GB | ~$6 |
| e2-small | 2 vCPU, 2GB | ~$13 |
| e2-medium | 2 vCPU, 4GB | ~$26 |

※ 無料枠: e2-micro 1台/月 (us-* リージョン)
