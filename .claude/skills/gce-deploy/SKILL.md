# GCE Deploy Skill

DreamCore-V2-sandbox を GCE (Google Compute Engine) にデプロイ・管理するスキル。

## 使用タイミング

ユーザーが以下のような依頼をした時に使用:
- 「GCEにデプロイして」
- 「本番環境を更新して」
- 「サーバーを最新版にして」
- 「GCEでコマンド実行して」
- 「サーバーのログを見せて」

## GCE接続情報

```
Instance: dreamcore-v2
Zone: asia-northeast1-a
User: notef
IP: 35.200.79.157
Port: 3005
App Dir: /home/notef/DreamCore-V2-sandbox
Process: PM2 (dreamcore-sandbox)
URL: http://35.200.79.157:3005
```

## SSH接続コマンド

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="コマンド"
```

## よく使うコマンド

### デプロイ（git pull + restart）

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="cd /home/notef/DreamCore-V2-sandbox && git pull && npm install && pm2 restart dreamcore-sandbox"
```

### ステータス確認

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="pm2 status"
```

### ログ確認

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="pm2 logs dreamcore-sandbox --lines 50 --nostream"
```

### 環境変数確認

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="grep -E '^(USE_|MODAL_|SUPABASE_URL)' /home/notef/DreamCore-V2-sandbox/.env"
```

### サーバー再起動

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="pm2 restart dreamcore-sandbox"
```

## ウォームアップ設定

Modal コールドスタート対策として、5分ごとに list_files エンドポイントを叩く cron が設定済み。

```
スクリプト: /home/notef/bin/modal-warmup.sh
cron: */5 * * * *
ログ: /home/notef/logs/modal-warmup.log（エラー時のみ）
```

### ウォームアップ状態確認

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="crontab -l | grep warmup; cat /home/notef/logs/modal-warmup.log 2>/dev/null || echo 'No errors logged'"
```

## トラブルシューティング

### gcloud認証が切れた場合

```bash
/usr/local/bin/gcloud auth login --launch-browser
```

### PM2プロセスが存在しない場合

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="cd /home/notef/DreamCore-V2-sandbox && PORT=3005 pm2 start server/index.js --name dreamcore-sandbox && pm2 save"
```

### Modal 接続エラー

```bash
# .env の Modal 設定確認
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="grep MODAL /home/notef/DreamCore-V2-sandbox/.env"

# 手動ウォームアップテスト
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="/home/notef/bin/modal-warmup.sh && echo OK"
```
