# Phase C: V2-sandbox 本番デプロイ完了

**日付:** 2026-01-28
**作業者:** Claude

## 概要

DreamCore-V2-sandbox を GCE 本番サーバーにデプロイし、Modal 統合が正常に動作することを確認。

## 実施内容

### 1. GitHub リポジトリ作成・プッシュ

- リポジトリ: `https://github.com/notef-neighbor/DreamCore-V2-sandbox`
- ブランチ: `main`（`feature/sandbox-runtime` からマージ）
- Modal 統合コードを含む全ファイルをプッシュ

### 2. GCE サーバー情報

| 項目 | 値 |
|------|-----|
| インスタンス名 | dreamcore-v2 |
| ゾーン | asia-northeast1-a |
| IP | 35.200.79.157 |
| ユーザー名 | notef |
| デプロイ先 | `/home/notef/DreamCore-V2-sandbox` |
| ポート | 3005 |

### 3. 環境変数設定

```bash
# Supabase（DreamCore-V2 と共有）
SUPABASE_URL=https://tcynrijrovktirsvwiqb.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Modal 統合
USE_MODAL=true
MODAL_ENDPOINT=https://notef-neighbor--dreamcore-generate-game.modal.run
MODAL_INTERNAL_SECRET=dreamcore-sandbox-secret-2026

# Gemini
GEMINI_API_KEY=AIzaSy...

# その他
DATA_DIR=/data
NODE_ENV=production
```

### 4. ディレクトリ作成

```bash
sudo mkdir -p /data/users /data/assets
sudo chown -R notef:notef /data
```

### 5. PM2 起動

```bash
cd /home/notef/DreamCore-V2-sandbox
GEMINI_API_KEY=... PORT=3005 pm2 start server/index.js --name dreamcore-sandbox
```

## 発見した問題と対応

### 問題 1: SSH 接続エラー

**症状:** `Permission denied (publickey)`

**原因:** 正しいユーザー名が `notef` だった

**対応:** `gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a`

### 問題 2: 間違った Supabase プロジェクト

**症状:** JWT 検証エラー、ログインできない

**原因:** .env に古い Supabase プロジェクト ID が設定されていた
- 誤: `zaomwhjrmexisrxxqlwx`
- 正: `tcynrijrovktirsvwiqb`

**対応:** .env を正しい Supabase 認証情報で上書き

### 問題 3: GEMINI_API_KEY が読み込まれない

**症状:** 2D/3D 選択、ビジュアルスタイル選択が表示されない

**原因:** PM2 起動時に dotenv が正しく .env を読み込んでいなかった

**対応:** 環境変数を直接指定して PM2 起動
```bash
GEMINI_API_KEY=... PORT=3005 pm2 start server/index.js --name dreamcore-sandbox
```

## 動作確認結果

| 項目 | 結果 |
|------|------|
| ログイン | ✅ Google OAuth 正常 |
| プロジェクト作成 | ✅ 新規作成成功 |
| 2D/3D 選択 | ✅ 表示される |
| ビジュアルスタイル選択 | ✅ 表示される |
| ゲーム生成（Gemini） | ✅ 完了 |
| 画像生成 | ✅ background.png, block.png 等 |
| Modal 同期 | ✅ `[Modal sync] Committed: 05f1344` |
| Volume 同期 | ✅ `Synced 1 files to Modal Volume` |
| ゲーム表示 | ✅ iframe で正常表示 |

## 現在の構成

```
dreamcore-v2 (GCE: 35.200.79.157)
├── DreamCore-V2        → ポート 3000（旧版・待機中）
└── DreamCore-V2-sandbox → ポート 3005（新版・稼働中）
```

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `server/modalClient.js` | Modal API クライアント（新規） |
| `server/config.js` | Modal 環境変数追加 |
| `server/claudeRunner.js` | Modal 統合ロジック追加 |
| `server/userManager.js` | Modal ファイル操作追加 |
| `server/index.js` | Git 操作の await 追加 |
| `docs/DEPLOY-INSTRUCTIONS.md` | デプロイ手順書（新規） |

## 残タスク（任意）

1. **Nginx 切り替え** - 本番ドメインを 3005 に向ける場合
2. **PM2 環境変数永続化** - ecosystem.config.js 作成
3. **ログ監視** - PM2 ログローテーション設定
4. **旧 V2 停止** - 問題なければ `pm2 stop dreamcore`

## 学び・注意点

1. **dotenv と PM2**: PM2 は .env を自動読み込みしないことがある。環境変数は直接指定するか ecosystem.config.js を使用する
2. **Supabase プロジェクト**: 本番では正しいプロジェクト ID を必ず確認する
3. **GCE ユーザー名**: `admin` ではなく `notef` だった。事前にインスタンス情報を確認する
4. **Modal 統合確認**: ログに `[Modal sync]` が出力されれば正常動作

## ロールバック手順

### オプション A: Modal を無効化

```bash
# .env を編集
USE_MODAL=false
pm2 restart dreamcore-sandbox
```

### オプション B: 旧 V2 に戻す

```bash
# Nginx を 3000 に向ける
sudo nano /etc/nginx/sites-available/default
# upstream dreamcore { server 127.0.0.1:3000; }
sudo nginx -s reload
```
