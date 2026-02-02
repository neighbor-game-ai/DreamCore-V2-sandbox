# DreamCore CLI Deploy

CLI からゲームを DreamCore にデプロイする機能。

**設計ドキュメント:** `../.claude/docs/cli-deploy-design.md`
**実装計画:** `../.claude/plans/tender-leaping-cook.md`

## 概要

この機能は DreamCore 本体と**完全に分離**されています。

- 別 Supabase プロジェクト（Supabase B: `dgusszutzzoeadmpyira`）を使用
- 別ドメイン（`cli.dreamcore.gg`）で配信
- 削除時は `cli-deploy/` フォルダを削除するだけ

## フォルダ構成

```
cli-deploy/
├── server/
│   ├── index.js         # エクスポート
│   ├── routes.js        # API ルート
│   ├── supabase.js      # Supabase B クライアント
│   ├── tokenManager.js  # 2段階ハッシュトークン管理
│   ├── deviceAuth.js    # デバイスフロー認証
│   └── upload.js        # アップロード処理・検証
├── public/
│   └── auth.html        # デバイスフロー認証ページ
├── skills/
│   └── dreamcore-deploy/
│       └── SKILL.md     # Claude Code Skills
├── .env.example
└── README.md
```

## 依存パッケージ

以下を DreamCore 本体の package.json に追加:

```bash
npm install adm-zip bcrypt express-rate-limit multer
```

## 環境変数

`.env` に追加:

```bash
# CLI Deploy (Supabase B)
SUPABASE_CLI_URL=https://dgusszutzzoeadmpyira.supabase.co
SUPABASE_CLI_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_CLI_SERVICE_ROLE_KEY=<Supabase ダッシュボードから取得>

# トークン検索用の pepper（64文字のランダム文字列）
# 生成: openssl rand -hex 32
TOKEN_PEPPER=<生成した64文字の秘密鍵>

# CLI ゲーム配信ドメイン
CLI_GAMES_DOMAIN=cli.dreamcore.gg
```

## Supabase B 情報

- **Project ID:** `dgusszutzzoeadmpyira`
- **Region:** ap-northeast-1 (Tokyo)
- **URL:** https://dgusszutzzoeadmpyira.supabase.co

テーブルと Storage は作成済み（2026-02-02）。

## 本体への接続

`server/index.js` に追加:

```javascript
// CLI Deploy 機能をマウント
if (process.env.SUPABASE_CLI_URL) {
  const cliDeploy = require('../cli-deploy/server');
  app.use('/api/cli', cliDeploy.router);
  app.use('/cli-auth', express.static(path.join(__dirname, '../cli-deploy/public')));
}
```

## 削除方法

```bash
# 1. フォルダ削除
rm -rf cli-deploy/

# 2. server/index.js から上記の統合コードを削除

# 3. Supabase B プロジェクトを削除（任意）
```

## API エンドポイント

| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| POST | `/api/cli/device/code` | なし | デバイスコード発行 |
| POST | `/api/cli/device/authorize` | Bearer (Supabase A) | ユーザーコード認可 |
| POST | `/api/cli/device/deny` | Bearer (Supabase A) | ユーザーコード拒否 |
| POST | `/api/cli/device/token` | なし | トークン取得（ポーリング） |
| POST | `/api/cli/deploy` | Bearer (dc_xxx) | ゲームデプロイ |
| GET | `/api/cli/projects` | Bearer (dc_xxx) | プロジェクト一覧 |
| DELETE | `/api/cli/projects/:id` | Bearer (dc_xxx) | プロジェクト削除 |

## 配信ドメイン

- **API:** `v2.dreamcore.gg/api/cli/*`
- **認証UI:** `v2.dreamcore.gg/cli-auth/auth.html`
- **ゲーム配信:** `cli.dreamcore.gg/{public_id}/`

## トークン形式

- **CLI トークン:** `dc_` + 32文字の英数字（例: `dc_7KmNx2pQ9wR4tYuIoP1aS5dFgH8jKlZ`）
- **public_id:** `g_` + 10文字の英数字（例: `g_7F2cK9wP1x`）
