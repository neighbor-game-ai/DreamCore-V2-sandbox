# DreamCore-V2-sandbox 本番デプロイ手順

## 前提条件

- GitHub リポジトリ: `https://github.com/notef-neighbor/DreamCore-V2-sandbox`
- main ブランチに Modal 統合コードが push 済み
- GCE インスタンス: dreamcorecode (asia-northeast1-b)

---

## Step 1: GCE サーバーに SSH 接続

```bash
gcloud compute ssh dreamcorecode --zone=asia-northeast1-b
```

---

## Step 2: リポジトリのクローン

```bash
cd /home/admin
git clone https://github.com/notef-neighbor/DreamCore-V2-sandbox.git
cd DreamCore-V2-sandbox
```

---

## Step 3: 環境変数の設定

```bash
# 既存の .env をコピー
cp ../DreamCore-V2/.env .env

# Modal 環境変数を追加
cat >> .env << 'EOF'

# Modal Integration
USE_MODAL=true
MODAL_ENDPOINT=https://notef-neighbor--dreamcore-generate-game.modal.run
MODAL_INTERNAL_SECRET=dreamcore-sandbox-secret-2026
EOF

# 確認
grep MODAL .env
```

---

## Step 4: 依存関係のインストール

```bash
npm install
```

---

## Step 5: PM2 に登録・起動

```bash
# ポート 3005 で sandbox を起動
PORT=3005 pm2 start server/index.js --name dreamcore-sandbox

# 状態確認
pm2 list
```

---

## Step 6: 動作確認（切り替え前）

```bash
# ログ確認
pm2 logs dreamcore-sandbox --lines 50

# ローカルテスト
curl http://localhost:3005/api/config
```

---

## Step 7: Nginx の切り替え

```bash
# Nginx 設定を編集
sudo nano /etc/nginx/sites-available/default
```

設定例（upstream を変更）:
```nginx
upstream dreamcore {
    server 127.0.0.1:3005;  # sandbox に変更
}
```

```bash
# 設定テスト
sudo nginx -t

# リロード
sudo nginx -s reload
```

---

## Step 8: 本番動作確認

1. ブラウザで https://dreamcore.code.tokyo にアクセス
2. ログインしてプロジェクト作成
3. ゲーム生成（Gemini で）
4. バージョン履歴確認
5. 復元機能確認

---

## ロールバック手順

### オプション A: Modal を無効化

```bash
# .env を編集して USE_MODAL=false に変更
nano /home/admin/DreamCore-V2-sandbox/.env
# USE_MODAL=false

pm2 restart dreamcore-sandbox
```

### オプション B: 旧 V2 に戻す

```bash
# Nginx を旧 V2 (ポート 3000) に戻す
sudo nano /etc/nginx/sites-available/default
# upstream dreamcore { server 127.0.0.1:3000; }
sudo nginx -s reload
```

---

## トラブルシューティング

### Modal 認証エラー

```bash
# Modal シークレットを確認
modal secret list

# Express の .env と一致しているか確認
grep MODAL_INTERNAL_SECRET /home/admin/DreamCore-V2-sandbox/.env

# 不一致の場合は Modal シークレットを更新
modal secret create modal-internal-secret MODAL_INTERNAL_SECRET=dreamcore-sandbox-secret-2026 --force
```

### ゲーム生成が失敗する

```bash
# PM2 ログを確認
pm2 logs dreamcore-sandbox --lines 100

# Modal エンドポイントに直接リクエスト（認証なし）
curl -X POST https://notef-neighbor--dreamcore-generate-game.modal.run \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'
```

---

## 完了チェックリスト

- [ ] リポジトリをクローン
- [ ] .env に Modal 環境変数を追加
- [ ] npm install 完了
- [ ] PM2 で起動（ポート 3005）
- [ ] Nginx を 3005 に切り替え
- [ ] ゲーム生成テスト OK
- [ ] バージョン履歴テスト OK
- [ ] 復元機能テスト OK
