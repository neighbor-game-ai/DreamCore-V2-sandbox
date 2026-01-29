# API キープロキシ実装ログ

**日付:** 2026-01-29
**タスク:** Modal Sandbox から API キーを削除し、GCE プロキシ経由でキーを注入

## 概要

プロンプトインジェクションによる API キー漏洩リスクを根本的に排除するため、
API キーを Modal Sandbox から完全に削除し、GCE 上のプロキシサーバー経由で注入する。

## 実装内容

### 1. GCE API Proxy サーバー作成

**場所:** `deploy/api-proxy/`

- `server.js` - Express ベースのプロキシサーバー
  - `/a/{secret}/*` → api.anthropic.com
  - `/g/{secret}/*` → generativelanguage.googleapis.com
  - URL パスシークレット検証
  - レート制限（Anthropic: 300/min, Gemini: 600/min）
  - シークレットマスキングログ
- `package.json` - 依存パッケージ
- `.env.example` - 環境変数テンプレート
- `nginx-api-proxy.conf` - Nginx TLS 終端設定
- `deploy-gce.sh` - デプロイスクリプト
- `README.md` - デプロイ手順

### 2. Modal app.py 更新

**場所:** `/Users/admin/DreamCore-V2-modal/modal/app.py`

変更点:
- 新 Secret 定義追加: `api-proxy-config`
- 新環境変数追加: `ANTHROPIC_BASE_URL`, `GEMINI_BASE_URL`, `PROXY_INTERNAL_SECRET`
- Sandbox.create の secrets を `api_proxy_secret` に変更
- NO_PROXY に `api-proxy.dreamcore.gg` を追加
- CLI コマンドから `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY` を削除
- generate_gemini を GCE プロキシ経由に変更
- 画像生成 subprocess を GCE プロキシ経由に変更

### 3. generate_image.py 更新

**場所:** `/Users/admin/DreamCore-V2-modal/modal/scripts/generate_image.py`

変更点:
- `GEMINI_BASE_URL` 環境変数のサポート追加
- プロキシ使用時は URL に API キーを含めない

## セキュリティ対策

| 脅威 | 対策 |
|------|------|
| プロンプトインジェクション | Sandbox 内に API キーなし |
| 不正アクセス | URL パスシークレット + Modal Proxy 静的 IP 制限 + TLS |
| 通信傍受 | TLS (Let's Encrypt) |
| ブルートフォース | レート制限 |
| ログ漏洩 | シークレットマスキング |

## 残タスク（手動対応必要）

1. **DNS 設定**: `api-proxy.dreamcore.gg` → `35.200.79.157`
2. **Let's Encrypt**: `sudo certbot --nginx -d api-proxy.dreamcore.gg`
3. **Modal Team Plan**: Proxy 機能で静的 IP 取得
4. **Modal Secret**: `api-proxy-config` を作成
5. **GCE デプロイ**: `deploy-gce.sh` を実行
6. **Modal デプロイ**: `modal deploy modal/app.py`

## 変更ファイル一覧

```
deploy/api-proxy/
├── server.js
├── package.json
├── .env.example
├── nginx-api-proxy.conf
├── deploy-gce.sh
└── README.md

/Users/admin/DreamCore-V2-modal/modal/
├── app.py (更新)
└── scripts/generate_image.py (更新)
```

## ロールバック手順

```bash
cd /Users/admin/DreamCore-V2-modal
git checkout HEAD~1 -- modal/app.py modal/scripts/generate_image.py
modal deploy modal/app.py
```

## 検証手順

1. GCE プロキシ起動確認: `curl http://127.0.0.1:3100/health`
2. Nginx + TLS 確認: `curl https://api-proxy.dreamcore.gg/health`
3. ゲーム生成テスト
4. 画像生成テスト
5. プロンプトインジェクションテスト（`printenv` で API キーが見えないこと）
