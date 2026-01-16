# GCE Deploy Skill

GameCreatorMVPをGCE (Google Compute Engine) にデプロイするスキル。

## 使用タイミング

ユーザーが以下のような依頼をした時に使用:
- 「GCEにデプロイして」
- 「本番環境を更新して」
- 「サーバーを最新版にして」
- 「デプロイして」

## GCE接続情報

```
Host: 34.84.28.42
Instance: dreamcorecode
Zone: asia-northeast1-b
App Dir: /opt/gamecreator
Process: PM2 (gamecreator) - runs as user dreamcorecode
URL: http://34.84.28.42 または https://dreamcorecode.asia
SSH User: admin (プロジェクトメタデータで設定)
SSH Key: ~/.ssh/google_compute_engine
```

## デプロイ手順

### 1. まず直接SSHを試す（推奨）

```bash
# 現在のブランチ名を取得
BRANCH=$(git branch --show-current)

# 直接SSHでデプロイ
ssh -o BatchMode=yes -o StrictHostKeyChecking=no -i ~/.ssh/google_compute_engine admin@34.84.28.42 \
  "cd /opt/gamecreator && sudo git stash && sudo git fetch origin && sudo git checkout $BRANCH && sudo git pull origin $BRANCH && sudo npm install --silent && sudo -u dreamcorecode pm2 restart gamecreator && sudo -u dreamcorecode pm2 status gamecreator"
```

### 2. SSHが失敗したらgcloudを使う

```bash
# gcloud認証（ブラウザが開く）
/usr/local/bin/gcloud auth login --launch-browser

# gcloudでデプロイ（dreamcorecodeユーザーで接続）
/usr/local/bin/gcloud compute ssh dreamcorecode@dreamcorecode --zone=asia-northeast1-b --command="cd /opt/gamecreator && sudo git checkout main && sudo git pull origin main && sudo npm install --silent && pm2 restart gamecreator && pm2 status gamecreator"
```

### ステータス確認

```bash
# 直接SSH
ssh -i ~/.ssh/google_compute_engine admin@34.84.28.42 'sudo -u dreamcorecode pm2 status gamecreator'

# またはgcloud
/Users/admin/GameCreatorMVP-v2/google-cloud-sdk/bin/gcloud compute ssh notef_neighbor_gg@dreamcorecode --zone=asia-northeast1-b --command='sudo -u dreamcorecode pm2 status gamecreator'
```

### ログ確認

```bash
# 直接SSH
ssh -i ~/.ssh/google_compute_engine admin@34.84.28.42 'sudo -u dreamcorecode pm2 logs gamecreator --lines 50 --nostream'
```

## SSH鍵の設定方法（直接SSHを使うために必要）

1. GCE Console → Compute Engine → メタデータ → SSH認証鍵
2. 以下の公開鍵を追加:
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCudZx7bl2ZgWKiRRLLOjQ87D7M4euUlpISv9lOXkqO9RLjVzl7Z9jZ5o4L4OuAMygqZkBypjZZ/xiFc/QQVZ2b3NrggMGyL1Y5K6PKbVh8y9eim5RLp8dpfJvGvPA8YBghes8B4bItfMzy4SKnbjpgDvjImjOLIz2l2wUqRKW5JvXq6s8X0j9/90tr8Ro76CK1NPgsdPVyVBy+8iBW1GMZOfMVflaUEUL6RczKKBcAJxicCYXn+kwxYEtT9BcoLc9tBs3eZQIvoIDZuBtuy+yoQmAhX33fV3wjgs2E6K30Nl+GxLi2mgex1jQeFw/nXHj9dZ/NR/BoAUL3o9gIx+awSGTBT+YPPC95UdxUHrcNCnyPTXrrxMsYnyAXi7UftSf1bajamdSkNH8z21Mn3z0TYisRhTzjAKGNkeGVMDotCnI1Ck44Aq4YnGMbPsbawkLcgWZgrxOT7OID5dTv+81PGD9YMDN2kPabUrAk+UTxhbYVspKSSJr5Ryv/J8aheFE= admin@RyonoMBP
```

## 注意事項

- git操作には`sudo`が必要（/opt/gamecreatorのパーミッション）
- npm installにも`sudo`が必要
- PM2は`dreamcorecode`ユーザーで実行されているため `sudo -u dreamcorecode pm2` を使う
- サーバーにローカル変更がある場合は `sudo git stash` で退避

## トラブルシューティング

### 直接SSHが「Permission denied」の場合
→ GCEプロジェクトメタデータにSSH公開鍵を登録してください（上記参照）

### gcloud認証が切れた場合
```bash
/Users/admin/GameCreatorMVP-v2/google-cloud-sdk/bin/gcloud auth login --launch-browser
```

### PM2プロセスが存在しない場合
```bash
ssh -i ~/.ssh/google_compute_engine admin@34.84.28.42 \
  'cd /opt/gamecreator && sudo -u dreamcorecode pm2 start server/index.js --name gamecreator && sudo -u dreamcorecode pm2 save'
```
