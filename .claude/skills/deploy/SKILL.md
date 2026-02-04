---
name: deploy
description: デプロイ前の事前チェックと本番デプロイを実行するスキル。コミット漏れや push 忘れを防止します。
---

# Deploy Skill（事前チェック付きデプロイ）

デプロイ前に自動で事前チェックを行い、問題がなければ GCE にデプロイするスキル。

## 使用タイミング

ユーザーが以下のような依頼をした時に使用:
- 「デプロイして」
- 「本番に反映して」
- 「プッシュしてデプロイ」

## 実行手順

### Phase 1: 事前チェック（Pre-flight Checks）

以下のチェックを **すべて** 実行し、問題があれば **デプロイを中止** してユーザーに報告する。

#### 1. コミットされていない変更の確認

```bash
git status --porcelain
```

- 出力がある場合 → **警告**: 「以下のファイルがコミットされていません」と表示
- 特に `server/` や重要なファイルの変更は要注意

#### 2. リモートとの差分確認

```bash
git fetch origin && git status -sb
```

- `ahead` がある場合 → **警告**: 「ローカルに push されていないコミットがあります」
- `behind` がある場合 → **警告**: 「リモートに新しいコミットがあります。pull してください」

#### 3. 現在のブランチ確認

```bash
git branch --show-current
```

- `main` 以外の場合 → **確認**: 「現在 {branch} ブランチです。このままデプロイしますか？」

#### 4. 最新コミットの確認

```bash
git log -1 --oneline
```

- ユーザーに表示して「このコミットをデプロイしますか？」と確認

### Phase 2: 問題解決（必要な場合）

事前チェックで問題が見つかった場合:

1. **コミット漏れ** → ユーザーに確認してコミット
2. **push 漏れ** → `git push origin {branch}` を実行
3. **ブランチ違い** → ユーザーに確認

### Phase 3: デプロイ実行

すべてのチェックが通ったら、GCE にデプロイ:

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="cd /home/notef/DreamCore-V2-sandbox && git pull && npm install && pm2 restart dreamcore-sandbox"
```

### Phase 4: ヘルスチェック

デプロイ完了後、サービスが正常に動作しているか確認:

```bash
# PM2 ステータス
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="pm2 status"

# エンドポイント確認
curl -s -o /dev/null -w "%{http_code}" https://v2.dreamcore.gg/api/config
```

- HTTP 200 が返ればOK
- それ以外の場合 → ログを確認して報告

```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="pm2 logs dreamcore-sandbox --lines 20 --nostream"
```

## チェックリスト（手動確認用）

デプロイ前:
- [ ] `git status` でコミット漏れがないか
- [ ] `git push` でリモートに反映済みか
- [ ] 正しいブランチ（通常は `main`）か
- [ ] 最新のコミットが意図したものか

デプロイ後:
- [ ] PM2 ステータスが `online` か
- [ ] https://v2.dreamcore.gg にアクセスできるか
- [ ] エラーログがないか

## エラー時の対応

### 502 エラーが出た場合

よくある原因:
1. **コミット漏れ** - 新しいモジュールやファイルが push されていない
2. **npm install 漏れ** - 新しい依存関係がインストールされていない
3. **環境変数** - `.env` の設定が不足

確認コマンド:
```bash
# エラーログ確認
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="pm2 logs dreamcore-sandbox --err --lines 50 --nostream"
```

## 関連スキル

- `/gce-deploy` - より詳細な GCE 操作（ログ確認、環境変数確認など）
