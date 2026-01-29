# 2026-01-30: V2 ゲーム公開・表示機能実装

## 概要

V2 で生成したゲームを V2 内で公開・プレイできる機能を実装。

**ドメイン構成:**
- `v2.dreamcore.gg` - 編集・生成（メインアプリ）
- `play.dreamcore.gg` - プレイ専用（iframe ラッパー）

---

## 実装内容

### 1. Supabase `published_games` テーブル

**マイグレーション:** `supabase/migrations/008_published_games.sql`

```sql
CREATE TABLE published_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title TEXT NOT NULL,
    description TEXT,
    how_to_play TEXT,
    tags TEXT[] DEFAULT '{}',
    thumbnail_url TEXT,
    visibility TEXT NOT NULL DEFAULT 'public',
    allow_remix BOOLEAN DEFAULT true,
    play_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    published_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id)
);
```

**RLS ポリシー:**
- `public` ゲームは誰でも閲覧可（RLS）
- `unlisted` ゲームは API (service_role) 経由のみ
- `private` ゲームは所有者のみ

### 2. バックエンド API

**ファイル:** `server/index.js`, `server/database-supabase.js`

| エンドポイント | 認証 | 説明 |
|---------------|------|------|
| `GET /api/published-games` | 不要 | 公開ゲーム一覧 |
| `GET /api/published-games/:id` | 不要 | 公開ゲーム情報 |
| `POST /api/published-games/:id/play` | 不要 | プレイ数インクリメント |
| `POST /api/projects/:projectId/publish` | 必要 | ゲーム公開 |
| `DELETE /api/projects/:projectId/publish` | 必要 | 非公開化 |
| `GET /g/:gameId/*` | 不要 | 公開ゲームファイル配信 |

### 3. 公開ゲームファイル配信

**ルート:** `/g/:gameId/*`

- パストラバーサル対策: `isPathSafe()` チェック
- ASSET_BASE_URL 注入: `window.ASSET_BASE_URL = "https://v2.dreamcore.gg"`
- CSP ヘッダー: `frame-ancestors 'self' https://play.dreamcore.gg`
- Modal フォールバック: `USE_MODAL=true` 時は Modal `getFile` 使用

### 4. play.dreamcore.gg

**ファイル:** `public/play-public.html`

- iframe ラッパーのみ提供
- sandbox 属性: `allow-scripts allow-pointer-lock allow-popups`（`allow-same-origin` なし）
- ゲーム本体は `v2.dreamcore.gg/g/:gameId/index.html` から読み込み

### 5. CORS 設定

**対象パス:**
- `/user-assets/`
- `/global-assets/`
- `/game/`
- `/g/`
- `/api/assets/`
- `/api/published-games`

**許可オリジン:** `CORS_ALLOWED_ORIGINS` 環境変数で設定

---

## セキュリティ対応

| 指摘 | 対応 |
|------|------|
| パストラバーサル | `isPathSafe(projectDir, localFilePath)` チェック |
| iframe allow-same-origin | 削除（sandbox="allow-scripts allow-pointer-lock allow-popups"）|
| USE_MODAL フォールバック | `/game` ルートと同じパターンで Modal `getFile` 使用 |
| ASSET_BASE_URL host依存 | 固定で `config.V2_DOMAIN` を使用 |
| RLS unlisted 漏洩 | RLS で unlisted を許可しない → API (service_role) 経由のみ |
| play_count 重複カウント | GET から分離、POST `/play` エンドポイントで実行 |

---

## インフラ設定

### DNS

| レコード | タイプ | 値 |
|----------|--------|-----|
| v2.dreamcore.gg | A | 35.200.79.157 |
| play.dreamcore.gg | A | 35.200.79.157 |

### Nginx

**ファイル:** `/etc/nginx/sites-available/dreamcore-v2`

```nginx
# v2.dreamcore.gg
server {
    listen 443 ssl;
    server_name v2.dreamcore.gg;
    ssl_certificate /etc/letsencrypt/live/v2.dreamcore.gg/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/v2.dreamcore.gg/privkey.pem;
    location / { proxy_pass http://localhost:3005; ... }
}

# play.dreamcore.gg
server {
    listen 443 ssl;
    server_name play.dreamcore.gg;
    ssl_certificate /etc/letsencrypt/live/v2.dreamcore.gg/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/v2.dreamcore.gg/privkey.pem;
    location / { proxy_pass http://localhost:3005; ... }
}
```

### SSL 証明書

Let's Encrypt で取得:
```bash
sudo certbot --nginx -d v2.dreamcore.gg -d play.dreamcore.gg
```

### 環境変数

```bash
V2_DOMAIN=https://v2.dreamcore.gg
PLAY_DOMAIN=https://play.dreamcore.gg
CORS_ALLOWED_ORIGINS=https://v2.dreamcore.gg,https://play.dreamcore.gg
```

---

## 発見した問題と対応

### 1. CORS パスマッチング

**問題:** `/api/published-games` が CORS ミドルウェアにマッチしない

**原因:** パスチェックが `/api/published-games/` (trailing slash) だった

**修正:** `startsWith('/api/published-games')` に変更（trailing slash 削除）

### 2. Git push 先の混乱

**問題:** `git push origin` がローカルパスに push された

**原因:** ローカルリポジトリの `origin` が `/Users/admin/DreamCore-V2` を指していた

**対応:** `git push github` で GitHub にプッシュ

---

## テスト結果

### CLI テスト（全て合格）

| テスト | 期待値 | 結果 |
|--------|--------|------|
| 無効な game ID | 400 Invalid game ID | ✅ |
| 存在しない game | 404 Game not found | ✅ |
| 公開ゲーム一覧 | 空配列 | ✅ |
| play_count 更新（存在しないゲーム） | 404 | ✅ |
| 認証なし公開 | 401 | ✅ |
| `/g/` ルート（存在しないゲーム） | 404 | ✅ |
| play.dreamcore.gg iframe | sandbox 属性正常 | ✅ |
| CORS ヘッダー | 設定済み | ✅ |
| OPTIONS preflight | 200 + CORS | ✅ |

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/config.js` | V2_DOMAIN, PLAY_DOMAIN 追加 |
| `server/database-supabase.js` | published_games 関数 8個追加 |
| `server/index.js` | API追加、/g/ルート、Host判定、CORS修正 |
| `public/play-public.html` | 新規作成 |
| `supabase/migrations/008_published_games.sql` | 新規作成 |

---

## 残タスク

- [ ] `/discover` ページ実装（公開ゲーム一覧UI）
- [ ] play_count レート制限（将来・低優先度）
- [ ] OGP 対応（SNSシェア）

---

## 使い方

1. ブラウザで `https://v2.dreamcore.gg` にログイン
2. プロジェクトを開く → 「公開」ボタン
3. タイトル等入力して公開
4. プレイURL: `https://play.dreamcore.gg/g/{gameId}`
