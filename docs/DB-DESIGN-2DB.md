# DreamCore 2DB設計（Supabase認証 + Cloud SQLデータ基盤）

対応方針: Cloud SQL (Postgres) + Cloud KMS

---

## 0. 目的

- 初心者クリエイター向けに DreamCore がDBを提供
- クリエイターが自前DBを持たなくてもスコア/進捗/テレメトリを保存可能
- DreamCore側で盛り上がり指標・ランキング・推薦に活用

---

## 1. 全体構成（2DB）

```
[Browser/Game]
  └─ DreamCore API (Express)
        ├─ Supabase (Auth専用)
        └─ Cloud SQL (Postgres: ゲームデータ/テレメトリ)
               └─ Cloud KMS（秘密情報の暗号化）
```

ポイント:
- Supabaseは認証/ユーザー管理のみ
- ゲームデータ・テレメトリはCloud SQL
- 秘密情報はKMSで暗号化保存

---

## 2. ID方針

- 内部主キー: BIGINT（外部に出さない）
- 外部公開ID: UUIDv7（public_id）
- 短いID（任意）: public_short_id

---

## 3. データ分離モデル

- クリエイター単位の論理分離（必須）
- プロジェクト単位の上書き（任意）
- 匿名プレイヤーのイベントも記録可能

---

## 4. データモデル（Cloud SQL / Postgres）

### 4.1 環境変数（暗号化）

creator_env_vars
```
id BIGINT PK
creator_id UUID
key TEXT
value_enc BYTEA
kms_key_version TEXT
created_at, updated_at
UNIQUE (creator_id, key)
```

project_env_vars（上書き）
```
id BIGINT PK
project_id UUID
key TEXT
value_enc BYTEA
kms_key_version TEXT
created_at, updated_at
UNIQUE (project_id, key)
```

解決順序:
1) project_env_vars → 2) creator_env_vars

---

### 4.2 テレメトリ（匿名OK）

sessions
```
id BIGINT PK
public_id UUIDv7 UNIQUE
creator_id UUID
project_id UUID
player_id UUID NULL
player_key TEXT NULL
started_at, ended_at
ip_hash, ua_hash (optional)
```

events
```
id BIGINT PK
public_id UUIDv7 UNIQUE
creator_id UUID
project_id UUID
session_id BIGINT
event_name TEXT
data JSONB
created_at
INDEX (project_id, created_at)
INDEX (event_name, created_at)
```

scores
```
id BIGINT PK
public_id UUIDv7 UNIQUE
creator_id UUID
project_id UUID
player_id UUID NULL
player_key TEXT NULL
score INT
metadata JSONB
created_at
INDEX (project_id, score DESC)
```

---

### 4.3 拡張（その場で増やせる論理テーブル）

custom_data
```
id BIGINT PK
creator_id UUID
project_id UUID
collection TEXT
data JSONB
created_at
INDEX (project_id, collection, created_at)
```

---

## 5. API設計（Express）

### 5.1 匿名セッション

- POST /api/telemetry/session
  - 返却: session_id, token, expires_at

### 5.2 イベント送信

- POST /api/telemetry/event
  - token 必須
  - event_name は allowlist

### 5.3 スコア送信

- POST /api/telemetry/score
  - score, metadata

### 5.4 クリエイター向け管理

- GET /api/creator/env
- PUT /api/creator/env
- GET /api/project/:id/env
- PUT /api/project/:id/env
- GET /api/analytics/summary?projectId=...

---

## 6. セキュリティ方針

### 6.1 匿名書き込み

- 短命トークン（JWT/HMAC）
- IP + セッションでレート制限
- スコアは参考値扱い（不正検知用）

### 6.2 秘密情報

- KMSで暗号化保存
- ログに値を出さない
- allowlist注入のみ（Modal実行時）

---

## 7. 運用

### 7.1 レート制限（例）

- /telemetry/*: 60 req/min（IP + session）
- /generate-*: 5 req/min
- 公開APIは除外 or 60 req/min

### 7.2 データ保持

- events: 90日
- sessions: 30日
- scores: 1年 or 永続

### 7.3 バックアップ

- Cloud SQL PITR + 日次バックアップ

---

## 8. 導入ステップ

1) Cloud SQL (Postgres) 作成
2) KMSキー作成
3) テーブル作成
4) ExpressにDB接続 + KMS暗号化ユーティリティ追加
5) /telemetry/* API公開
6) Modal注入の allowlist 実装
7) 分析/ランキングへ活用

---

## 9. 将来拡張

- 集計用のマテビュー（leaderboard）
- BigQuery連携
- 課金プランごとの上限・メータリング

---

## 10. 結論

- DB基盤: Cloud SQL (Postgres)
- 暗号化: Cloud KMS
- 内部主キー: BIGINT
- 外部公開ID: UUIDv7 + public_id
- 分離: クリエイター単位 + プロジェクト上書き

---

## 11. DDL（CREATE TABLE）

注意:
- public_id（UUIDv7）はアプリ側で生成して挿入する前提
- ここでは BIGINT 主キー + public_id UUID を併用

```sql
-- Creator-level env vars (encrypted)
CREATE TABLE creator_env_vars (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL,
  key TEXT NOT NULL,
  value_enc BYTEA NOT NULL,
  kms_key_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, key)
);

-- Project-level env vars (override)
CREATE TABLE project_env_vars (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  key TEXT NOT NULL,
  value_enc BYTEA NOT NULL,
  kms_key_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

-- Sessions (anonymous or logged-in)
CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  creator_id UUID NOT NULL,
  project_id UUID NOT NULL,
  player_id UUID NULL,
  player_key TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NULL,
  ip_hash TEXT NULL,
  ua_hash TEXT NULL
);

CREATE INDEX sessions_project_started_idx
  ON sessions (project_id, started_at DESC);

-- Events (telemetry)
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  creator_id UUID NOT NULL,
  project_id UUID NOT NULL,
  session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_project_created_idx
  ON events (project_id, created_at DESC);
CREATE INDEX events_name_created_idx
  ON events (event_name, created_at DESC);

-- Scores
CREATE TABLE scores (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  creator_id UUID NOT NULL,
  project_id UUID NOT NULL,
  player_id UUID NULL,
  player_key TEXT NULL,
  score INT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scores_project_score_idx
  ON scores (project_id, score DESC);

-- Custom collections (logical tables)
CREATE TABLE custom_data (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL,
  project_id UUID NOT NULL,
  collection TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX custom_data_project_collection_idx
  ON custom_data (project_id, collection, created_at DESC);
```

---

## 12. API仕様（リクエスト/レスポンス例）

### 12.1 匿名セッション

POST /api/telemetry/session

Request:
```json
{
  "projectId": "uuid",
  "playerKey": "optional-anon-id"
}
```

Response:
```json
{
  "sessionId": "uuidv7",
  "token": "short-lived-token",
  "expiresAt": 1730000000
}
```

Notes:
- tokenは短命（例: 15分）
- tokenは署名付き（JWT/HMAC）

### 12.2 イベント送信

POST /api/telemetry/event

Request:
```json
{
  "sessionId": "uuidv7",
  "token": "short-lived-token",
  "eventName": "death",
  "data": { "stage": 3, "reason": "hit_enemy" }
}
```

Response:
```json
{ "ok": true }
```

### 12.3 スコア送信

POST /api/telemetry/score

Request:
```json
{
  "sessionId": "uuidv7",
  "token": "short-lived-token",
  "score": 12345,
  "metadata": { "mode": "normal" }
}
```

Response:
```json
{ "ok": true }
```

### 12.4 クリエイター環境変数

GET /api/creator/env

Response:
```json
[
  { "key": "SUPABASE_URL" },
  { "key": "GAME_API_KEY" }
]
```

PUT /api/creator/env

Request:
```json
{
  "key": "GAME_API_KEY",
  "value": "secret-value"
}
```

Response:
```json
{ "ok": true }
```

Notes:
- valueはレスポンスに返さない
- 更新は監査ログに記録

### 12.5 プロジェクト環境変数（上書き）

GET /api/project/:id/env
PUT /api/project/:id/env

同様の仕様でproject_idスコープ

---

## 13. 暗号化（KMS）設計

### 13.1 方針
- KMSで暗号化してDBに保存
- 復号はサーバー側のみ
- ログに平文を出さない

### 13.2 暗号化フロー（シンプル）
1) サーバーで平文を受け取る
2) Cloud KMSで暗号化
3) `value_enc` と `kms_key_version` を保存

### 13.3 ローテーション
- 新規書き込みは新しいKMS key versionを使用
- 既存は旧keyで復号可能

---

## 14. 運用・監視

### 14.1 監視
- DB接続数、CPU、遅いクエリ
- テレメトリ書き込み量（events/s）

### 14.2 バックアップ
- Cloud SQL PITR + 日次バックアップ

### 14.3 データ保持
- events: 90日
- sessions: 30日
- scores: 1年 or 永続

### 14.4 データ削除
- クリエイター削除時: creator_idで論理削除 or バッチ削除

---

## 15. 図（アーキテクチャ概要）

```mermaid
flowchart LR
  A[Browser/Game] --> B[DreamCore API]
  B --> C[Supabase Auth]
  B --> D[Cloud SQL (Postgres)]
  B --> E[Cloud KMS]
  D --> F[(Telemetry / Scores / Env Vars)]
```

---

## 16. KMS 実装サンプル（Node.js）

注意:
- ここは実装例。値はログに出さない
- KMSキーは環境変数で指定

```js
// kms.js
const { KeyManagementServiceClient } = require('@google-cloud/kms');

const client = new KeyManagementServiceClient();
const keyName = process.env.KMS_KEY_NAME; // projects/.../locations/.../keyRings/.../cryptoKeys/...

async function encryptValue(plainText) {
  const [result] = await client.encrypt({
    name: keyName,
    plaintext: Buffer.from(plainText),
  });
  return result.ciphertext; // Buffer
}

async function decryptValue(ciphertext) {
  const [result] = await client.decrypt({
    name: keyName,
    ciphertext,
  });
  return result.plaintext.toString('utf8');
}

module.exports = { encryptValue, decryptValue };
```

使用例:
```js
const { encryptValue, decryptValue } = require('./kms');

// 保存時
const enc = await encryptValue(value);
await db.saveEnvVar({ creator_id, key, value_enc: enc, kms_key_version: 'v1' });

// 読み出し時
const value = await decryptValue(row.value_enc);
```

---

## 17. 初期マイグレーション手順

1) Cloud SQL (Postgres) 作成  
2) KMSキー作成（CryptoKey + version）  
3) サービスアカウントに以下を付与  
   - Cloud SQL Client  
   - Cloud KMS CryptoKey Encrypter/Decrypter  
4) 接続情報を環境変数に設定  
   - `CLOUD_SQL_HOST`, `CLOUD_SQL_DB`, `CLOUD_SQL_USER`, `CLOUD_SQL_PASSWORD`  
   - `KMS_KEY_NAME`  
5) DDL適用（本ドキュメントの CREATE TABLE）  
6) 接続テスト（healthcheck）  
7) /telemetry/* API を段階的に公開  

