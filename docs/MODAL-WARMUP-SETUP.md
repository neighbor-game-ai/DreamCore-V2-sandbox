# Modal ウォームアップ設定手順

## 概要

Modal 関数コンテナのコールドスタートを軽減するため、5分ごとに `list_files` エンドポイントを叩いてコンテナを温めておく。

**注意**: gVisor Sandbox 自体は毎回起動するため、この対策ではサンドボックス起動時間は改善されない。

---

## 前提条件

- GCE サーバーへの SSH アクセス
- DreamCore-V2-sandbox が `/home/notef/DreamCore-V2-sandbox/` にデプロイ済み
- `.env` に `MODAL_INTERNAL_SECRET` が設定済み

---

## 手順

### Step 1: ウォームアップ用プロジェクトを作成

DreamCore にログインし、新規プロジェクトを作成:

1. https://dreamcore.yourdomain.com にアクセス
2. 新規プロジェクト作成
3. 名前: `__warmup__`（識別しやすいように）
4. 作成後、URL からプロジェクト ID をコピー
   - 例: `https://.../#project=abc12345-...` の `abc12345-...` 部分

### Step 2: GCE に SSH 接続

```bash
gcloud compute ssh notef@dreamcore-server --zone=asia-northeast1-b
```

### Step 3: ディレクトリ作成

```bash
mkdir -p /home/notef/bin /home/notef/logs
```

### Step 4: スクリプトをコピー

ローカルからスクリプトをコピー:

```bash
# ローカルで実行
gcloud compute scp scripts/modal-warmup.sh notef@dreamcore-server:/home/notef/bin/modal-warmup.sh --zone=asia-northeast1-b
```

または、GCE 上で直接作成:

```bash
cat > /home/notef/bin/modal-warmup.sh << 'EOF'
#!/bin/bash
set -e

ENV_FILE="/home/notef/DreamCore-V2-sandbox/.env"
if [ -f "$ENV_FILE" ]; then
  MODAL_INTERNAL_SECRET=$(grep "^MODAL_INTERNAL_SECRET=" "$ENV_FILE" | cut -d'=' -f2-)
fi

if [ -z "$MODAL_INTERNAL_SECRET" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: MODAL_INTERNAL_SECRET not found" >> /home/notef/logs/modal-warmup.log
  exit 1
fi

WARMUP_USER_ID="ed58dfd0-03c8-4617-ae86-f28df6f562ff"
WARMUP_PROJECT_ID="__REPLACE_WITH_WARMUP_PROJECT_ID__"

ENDPOINT="https://notef-neighbor--dreamcore-list-files.modal.run"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "${ENDPOINT}?user_id=${WARMUP_USER_ID}&project_id=${WARMUP_PROJECT_ID}" \
  -H "X-Modal-Secret: ${MODAL_INTERNAL_SECRET}")

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "404" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') Modal warmup failed: HTTP $HTTP_CODE" >> /home/notef/logs/modal-warmup.log
fi
EOF
```

### Step 5: プロジェクト ID を設定

```bash
# Step 1 でコピーしたプロジェクト ID に置換
sed -i 's/__REPLACE_WITH_WARMUP_PROJECT_ID__/実際のプロジェクトID/' /home/notef/bin/modal-warmup.sh
```

### Step 6: 実行権限を付与

```bash
chmod +x /home/notef/bin/modal-warmup.sh
```

### Step 7: 手動テスト

```bash
/home/notef/bin/modal-warmup.sh && echo "OK"
```

成功すれば何も出力されない（またはエラー時のみログ出力）。

### Step 8: cron ジョブを追加

```bash
crontab -e
```

以下の行を追加:

```
*/5 * * * * /home/notef/bin/modal-warmup.sh
```

---

## 検証

### cron 実行の確認（5分後）

```bash
# cron ログを確認
grep CRON /var/log/syslog | tail -10

# または journalctl
journalctl -u cron | tail -20
```

### エラーログの確認

```bash
cat /home/notef/logs/modal-warmup.log
```

エラーがなければファイルは空（または存在しない）。

---

## トラブルシューティング

### "MODAL_INTERNAL_SECRET not found"

`.env` ファイルの場所とフォーマットを確認:

```bash
grep MODAL_INTERNAL_SECRET /home/notef/DreamCore-V2-sandbox/.env
```

### HTTP 401 エラー

シークレットが正しくない。`.env` の `MODAL_INTERNAL_SECRET` を確認。

### HTTP 500 エラー

Modal 側の問題。Modal ダッシュボードでログを確認。

---

## メンテナンス

- **ウォームアッププロジェクトは削除しない**: 誤削除防止のため `__warmup__` という名前にしている
- **ログローテーション**: エラーが多い場合は logrotate を検討
- **監視**: 本番運用では失敗回数のアラートを検討

---

## 将来の改善（計測後に検討）

| 項目 | 条件 |
|------|------|
| 専用ヘルスエンドポイント | Modal Team プラン移行後（9+ エンドポイント必要） |
| ウォームプール | Sandbox 起動が遅い場合に Modal に依頼 |
