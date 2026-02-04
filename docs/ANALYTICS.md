# Analytics ドキュメント

DreamCore V2 の行動分析システムに関する包括的なドキュメント。

---

## 目次

1. [概要](#1-概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [データベーススキーマ](#3-データベーススキーマ)
4. [API エンドポイント](#4-api-エンドポイント)
5. [フロントエンド統合](#5-フロントエンド統合)
6. [データ保持ポリシー](#6-データ保持ポリシー)
7. [便利な SQL クエリ](#7-便利な-sql-クエリ)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. 概要

### 目的

ユーザー行動を分析し、プロダクト改善に活用するための基盤システム。

### 追跡対象

| カテゴリ | 内容 |
|----------|------|
| **セッション** | 訪問開始/終了、滞在時間、流入元 |
| **ページビュー** | ページ遷移、タイトル |
| **ユーザーアクション** | ログイン/ログアウト、ゲーム作成/公開/プレイ |
| **デバイス情報** | OS、ブラウザ、画面サイズ |
| **流入分析** | リファラー、UTM パラメータ |
| **エラー** | JavaScript エラー、未処理の Promise rejection |

### プライバシー配慮

| 保存しないデータ | 理由 | 代替 |
|------------------|------|------|
| IP アドレス | 個人情報 | country のみ保存（Cloudflare ヘッダーから取得） |
| User-Agent 生値 | 詳細すぎる | OS/ブラウザ名に解析後保存 |
| 詳細位置情報 | 不要 | country + timezone のみ |

---

## 2. アーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              ブラウザ                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  analytics.js (DreamCoreAnalytics)                               │  │
│  │  ├─ device_id 管理 (localStorage: dc_device_id)                  │  │
│  │  ├─ session_id 管理 (localStorage: dc_session)                   │  │
│  │  ├─ UTM データ保存 (localStorage: dc_utm)                        │  │
│  │  ├─ イベントバッファ (25件 or 5秒でフラッシュ)                    │  │
│  │  └─ 自動追跡 (page_view, error)                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼ HTTP POST
┌─────────────────────────────────────────────────────────────────────────┐
│                           Express Server                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  /api/analytics/*                                                 │  │
│  │  ├─ /session      - セッション開始                                │  │
│  │  ├─ /track        - イベントバッチ送信                            │  │
│  │  ├─ /link         - ユーザー紐付け（ログイン時）                  │  │
│  │  └─ /session/:id/end - セッション終了                             │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │ Enrichment                                                   │ │  │
│  │  │ ├─ User-Agent → OS, Browser                                 │ │  │
│  │  │ └─ CF-IPCountry → country                                   │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼ supabaseAdmin
┌─────────────────────────────────────────────────────────────────────────┐
│                           Supabase (PostgreSQL)                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │ user_sessions  │  │  user_events   │  │  user_devices  │            │
│  │ (365日保持)    │  │  (180日保持)   │  │   (無期限)     │            │
│  └────────────────┘  └────────────────┘  └────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
```

### データフロー

```
[ページ読み込み]
      │
      ▼
[UTM パラメータ保存]
      │
      ▼
[セッション取得/作成] ──── 30分タイムアウトで新規作成
      │
      ▼
[page_view イベント追跡]
      │
      ▼
[イベントバッファに追加]
      │
      ├── 25件到達 ──────────┐
      │                      │
      └── 5秒経過 ──────────┼─▶ [フラッシュ]
                             │         │
                             │         ▼
                             │   POST /api/analytics/track
                             │         │
                             │         ▼
                             │   [DB 挿入]
                             │
[ログイン]                   │
      │                      │
      ▼                      │
POST /api/analytics/link ────┘
      │
      ▼
[過去イベントに user_id 紐付け]
```

### ファイル構成

```
server/modules/analytics/
├── index.js        # Express ルート定義
├── ingest.js       # イベント受信・保存ロジック
└── enrichment.js   # UA 解析、国コード取得

public/js/modules/
└── analytics.js    # フロントエンド SDK

supabase/migrations/
└── 015_analytics_tables.sql  # スキーマ定義
```

---

## 3. データベーススキーマ

### 3.1 user_sessions（セッション）

**保持期間: 365日**

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | UUID (PK) | セッション ID |
| `user_id` | UUID (FK) | ユーザー ID（NULL 許容） |
| `started_at` | TIMESTAMPTZ | セッション開始時刻 |
| `ended_at` | TIMESTAMPTZ | セッション終了時刻 |
| `duration_sec` | INTEGER | 滞在時間（秒） |
| `first_path` | TEXT | 最初にアクセスしたパス |
| `referrer` | TEXT | リファラー URL |
| `utm_source` | TEXT | UTM source |
| `utm_medium` | TEXT | UTM medium |
| `utm_campaign` | TEXT | UTM campaign |
| `utm_term` | TEXT | UTM term |
| `utm_content` | TEXT | UTM content |
| `device_id` | TEXT | デバイス ID |
| `country` | TEXT | 国コード（ISO 3166-1 alpha-2） |
| `timezone` | TEXT | タイムゾーン |

**インデックス:**
- `(user_id, started_at DESC)` - ユーザー別セッション取得
- `(started_at DESC)` - 全体セッション一覧
- `(device_id)` - デバイス別検索

### 3.2 user_events（イベント）

**保持期間: 180日**

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | BIGSERIAL (PK) | イベント ID |
| `user_id` | UUID (FK) | ユーザー ID（NULL 許容） |
| `session_id` | UUID (FK) | セッション ID |
| `event_type` | TEXT | イベント種別（制約あり） |
| `event_ts` | TIMESTAMPTZ | イベント発生時刻 |
| `path` | TEXT | ページパス |
| `properties` | JSONB | 追加プロパティ（最大 4KB） |

**許可される event_type:**
- 初期リリース: `page_view`, `login`, `logout`, `game_play`, `game_create`, `game_publish`, `error`
- 将来追加: `button_click`, `form_submit`, `scroll_depth`

**インデックス:**
- `(user_id, event_ts DESC)` - ユーザー別イベント
- `(event_type, event_ts DESC)` - イベント種別別
- `(session_id, event_ts DESC)` - セッション内イベント
- `(event_ts DESC)` - 時系列一覧

### 3.3 user_devices（デバイス）

**保持期間: 無期限**

| カラム | 型 | 説明 |
|--------|-----|------|
| `device_id` | TEXT (PK) | デバイス ID |
| `user_id` | UUID (FK) | ユーザー ID（NULL 許容） |
| `os` | TEXT | OS 名（例: "macOS 10.15", "iOS 17"） |
| `browser` | TEXT | ブラウザ名（例: "Chrome 120", "Safari 17"） |
| `screen` | TEXT | 画面サイズ（例: "1920x1080"） |
| `first_seen_at` | TIMESTAMPTZ | 初回認識日時 |
| `last_seen_at` | TIMESTAMPTZ | 最終アクセス日時 |

**インデックス:**
- `(user_id, last_seen_at DESC)` - ユーザー別デバイス

### 3.4 ER 図

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    users     │       │user_sessions │       │ user_events  │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │◄──┐   │ id (PK)      │◄──────│ session_id   │
│ ...          │   │   │ user_id (FK) │───┐   │ user_id (FK) │───┐
└──────────────┘   │   │ device_id    │   │   │ event_type   │   │
                   │   │ started_at   │   │   │ event_ts     │   │
                   │   │ ended_at     │   │   │ path         │   │
                   │   │ utm_*        │   │   │ properties   │   │
                   │   └──────────────┘   │   └──────────────┘   │
                   │                      │                      │
                   └──────────────────────┴──────────────────────┘
                                          │
                   ┌──────────────┐       │
                   │ user_devices │       │
                   ├──────────────┤       │
                   │ device_id(PK)│       │
                   │ user_id (FK) │───────┘
                   │ os           │
                   │ browser      │
                   │ screen       │
                   │ first_seen_at│
                   │ last_seen_at │
                   └──────────────┘
```

### 3.5 RLS ポリシー

すべてのテーブルで RLS が有効化されている。

| テーブル | ポリシー | 説明 |
|----------|----------|------|
| user_sessions | Users can view own sessions | 自分のセッションのみ SELECT 可能 |
| user_sessions | Service role full access | service_role は全操作可能 |
| user_events | Users can view own events | 自分のイベントのみ SELECT 可能 |
| user_events | Service role full access | service_role は全操作可能 |
| user_devices | Users can view own devices | 自分のデバイスのみ SELECT 可能 |
| user_devices | Service role full access | service_role は全操作可能 |

**注意:** イベント挿入は `supabaseAdmin`（service_role）経由で行うため、ユーザーが直接書き込むことはできない。

### 3.6 ヘルパー関数

#### upsert_device

```sql
upsert_device(
  p_device_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_os TEXT DEFAULT NULL,
  p_browser TEXT DEFAULT NULL,
  p_screen TEXT DEFAULT NULL
)
```

デバイス情報を登録/更新。既存デバイスの場合は `last_seen_at` を更新。

#### link_user_to_session

```sql
link_user_to_session(
  p_user_id UUID,
  p_session_id UUID,
  p_device_id TEXT
)
```

ログイン時に呼び出し、以下を実行:
1. セッション内の匿名イベント（`user_id = NULL`）に `user_id` を付与
2. セッション自体に `user_id` を付与
3. デバイスに `user_id` を付与

#### end_session

```sql
end_session(p_session_id UUID)
```

セッション終了時に `ended_at` と `duration_sec` を計算・保存。

---

## 4. API エンドポイント

すべてのエンドポイントは `/api/analytics` 配下にマウント。

### 4.1 POST /api/analytics/session

新しいセッションを開始する。

**認証:** オプショナル（ログイン済みなら `user_id` を自動設定）

**リクエスト:**
```json
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "first_path": "/create",
  "referrer": "https://google.com",
  "utm_source": "twitter",
  "utm_medium": "social",
  "utm_campaign": "launch",
  "utm_term": "game",
  "utm_content": "cta-button",
  "timezone": "Asia/Tokyo",
  "screen": "1920x1080"
}
```

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| device_id | Yes | デバイス識別子（UUID） |
| first_path | No | 最初のページパス（デフォルト: `/`） |
| referrer | No | リファラー URL |
| utm_* | No | UTM パラメータ（5種） |
| timezone | No | タイムゾーン（IANA 形式） |
| screen | No | 画面サイズ（例: `1920x1080`） |

**レスポンス:**
```json
{
  "session_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**エラー:**
| ステータス | 説明 |
|-----------|------|
| 400 | device_id が未指定または不正 |
| 500 | サーバーエラー |

### 4.2 POST /api/analytics/track

イベントをバッチ送信する。

**認証:** オプショナル（ログイン済みなら `user_id` を自動設定）

**リクエスト:**
```json
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "events": [
    {
      "event_type": "page_view",
      "event_ts": "2026-02-04T12:00:00.000Z",
      "path": "/create",
      "properties": {
        "title": "Create Game"
      }
    },
    {
      "event_type": "game_create",
      "event_ts": "2026-02-04T12:05:00.000Z",
      "path": "/create",
      "properties": {
        "project_id": "abc123"
      }
    }
  ]
}
```

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| device_id | Yes | デバイス識別子 |
| session_id | Yes | セッション ID（UUID） |
| events | Yes | イベント配列（最大 100 件） |
| events[].event_type | Yes | イベント種別（固定リスト） |
| events[].event_ts | No | イベント発生時刻（ISO 8601） |
| events[].path | No | ページパス |
| events[].properties | No | 追加プロパティ（最大 4KB） |

**レスポンス:**
```json
{
  "ok": true,
  "count": 2
}
```

**エラー:**
| ステータス | 説明 |
|-----------|------|
| 400 | device_id/session_id 未指定、不正な event_type、events が空 |
| 500 | サーバーエラー |

### 4.3 POST /api/analytics/link

ログイン後にセッションとユーザーを紐付ける。

**認証:** 必須

**リクエスト:**
```json
{
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "device_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**レスポンス:**
```json
{
  "ok": true
}
```

**エラー:**
| ステータス | 説明 |
|-----------|------|
| 401 | 認証必須 |
| 400 | session_id/device_id が不正 |
| 500 | サーバーエラー |

### 4.4 POST /api/analytics/session/:id/end

セッションを終了する。ページ離脱時に `sendBeacon` で呼び出される。

**認証:** 不要

**リクエスト:**
空の JSON オブジェクト `{}`

**レスポンス:**
```json
{
  "ok": true
}
```

**エラー:**
| ステータス | 説明 |
|-----------|------|
| 400 | session_id が不正な UUID |
| 500 | サーバーエラー |

---

## 5. フロントエンド統合

### 5.1 analytics.js の読み込み

```html
<script src="/js/modules/analytics.js"></script>
<script>
  // ページ読み込み後に初期化
  DreamCoreAnalytics.init();
</script>
```

### 5.2 公開 API

```javascript
// グローバルオブジェクト
window.DreamCoreAnalytics

// メソッド
DreamCoreAnalytics.init(options)      // 初期化
DreamCoreAnalytics.track(eventType, properties)  // イベント追跡
DreamCoreAnalytics.flush()            // バッファをフラッシュ
DreamCoreAnalytics.setUserId(userId)  // ユーザー ID 設定
DreamCoreAnalytics.linkUser()         // セッション紐付け
DreamCoreAnalytics.endSession()       // セッション終了
DreamCoreAnalytics.getSessionId()     // 現在のセッション ID
DreamCoreAnalytics.getDeviceId()      // デバイス ID
```

### 5.3 手動イベント追跡

```javascript
// ゲームプレイ開始
DreamCoreAnalytics.track('game_play', {
  game_id: 'g_abc123',
  duration_sec: 0
});

// ゲーム作成完了
DreamCoreAnalytics.track('game_create', {
  project_id: 'proj_xyz'
});

// ゲーム公開
DreamCoreAnalytics.track('game_publish', {
  game_id: 'g_abc123'
});

// ボタンクリック（将来用）
DreamCoreAnalytics.track('button_click', {
  button_id: 'submit-btn',
  label: 'Create Game'
});
```

### 5.4 自動追跡される内容

| イベント | トリガー | properties |
|----------|----------|------------|
| page_view | 初期化時、pushState/replaceState/popstate | `{ title }` |
| login | DreamCoreAuth で SIGNED_IN 検出時 | `{ method: 'google' }` |
| logout | DreamCoreAuth で SIGNED_OUT 検出時 | - |
| error | window.onerror | `{ message, filename, lineno, colno }` |
| error | unhandledrejection | `{ message, type: 'unhandledrejection' }` |

### 5.5 設定値

```javascript
const CONFIG = {
  BATCH_SIZE: 25,           // バッチあたりのイベント数
  FLUSH_INTERVAL: 5000,     // フラッシュ間隔（5秒）
  SESSION_TIMEOUT: 30 * 60 * 1000, // セッションタイムアウト（30分）
  API_BASE: '/api/analytics',
  STORAGE_KEYS: {
    DEVICE_ID: 'dc_device_id',
    SESSION: 'dc_session',
    UTM: 'dc_utm',
  },
  UTM_EXPIRY: 24 * 60 * 60 * 1000, // UTM 有効期限（24時間）
};
```

### 5.6 localStorage の構造

**dc_device_id**
```
"550e8400-e29b-41d4-a716-446655440000"
```

**dc_session**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "startedAt": 1707048000000,
  "lastActive": 1707048300000
}
```

**dc_utm**
```json
{
  "utm_source": "twitter",
  "utm_medium": "social",
  "utm_campaign": "launch",
  "utm_term": null,
  "utm_content": null,
  "referrer": "https://t.co/...",
  "expires_at": 1707134400000
}
```

### 5.7 DreamCoreAuth との連携

analytics.js は `DreamCoreAuth` が利用可能な場合、以下を自動で行う:

1. **初期化時:** 既存セッションがあれば `currentUserId` を設定
2. **ログイン時:** `linkUser()` を呼び出してセッション紐付け、`login` イベント送信
3. **ログアウト時:** `logout` イベント送信
4. **API 呼び出し時:** `Authorization` ヘッダーに `access_token` を付与

---

## 6. データ保持ポリシー

### 6.1 保持期間

| テーブル | 保持期間 | 理由 |
|----------|----------|------|
| user_events | 180日 | 詳細イベントは短期分析用 |
| user_sessions | 365日 | 長期トレンド分析用 |
| user_devices | 無期限 | デバイス識別は永続的に必要 |

### 6.2 削除処理

日次 Cron ジョブで自動削除（深夜 3:00 JST 想定）。

```sql
-- user_events: 180日超過を削除
DELETE FROM user_events
WHERE event_ts < NOW() - INTERVAL '180 days';

-- user_sessions: 365日超過を削除
DELETE FROM user_sessions
WHERE started_at < NOW() - INTERVAL '365 days';
```

### 6.3 想定データ量

| テーブル | 1日 | 1ヶ月 | 保持期間後 |
|----------|-----|-------|-----------|
| user_events | 16,000件 | 500,000件 | 3,000,000件 |
| user_sessions | 550件 | 16,000件 | 200,000件 |
| user_devices | 50件 | 1,500件 | 9,000件 |

**ストレージ推定（保持期間後）:**
- user_events: 3M x 500B = 約 1.5GB
- user_sessions: 200K x 300B = 約 60MB
- user_devices: 9K x 200B = 約 2MB
- **合計: 約 1.6GB**

---

## 7. 便利な SQL クエリ

### 7.1 DAU / WAU / MAU

```sql
-- DAU（日次アクティブユーザー）
SELECT
  DATE(event_ts AT TIME ZONE 'Asia/Tokyo') AS date,
  COUNT(DISTINCT user_id) AS dau
FROM user_events
WHERE user_id IS NOT NULL
  AND event_ts >= NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;

-- WAU（週次アクティブユーザー）
SELECT
  DATE_TRUNC('week', event_ts AT TIME ZONE 'Asia/Tokyo') AS week,
  COUNT(DISTINCT user_id) AS wau
FROM user_events
WHERE user_id IS NOT NULL
  AND event_ts >= NOW() - INTERVAL '12 weeks'
GROUP BY week
ORDER BY week DESC;

-- MAU（月次アクティブユーザー）
SELECT
  DATE_TRUNC('month', event_ts AT TIME ZONE 'Asia/Tokyo') AS month,
  COUNT(DISTINCT user_id) AS mau
FROM user_events
WHERE user_id IS NOT NULL
  AND event_ts >= NOW() - INTERVAL '12 months'
GROUP BY month
ORDER BY month DESC;
```

### 7.2 人気ページ

```sql
-- 過去7日間のページビュー数（上位20件）
SELECT
  path,
  COUNT(*) AS views,
  COUNT(DISTINCT session_id) AS unique_sessions,
  COUNT(DISTINCT user_id) AS unique_users
FROM user_events
WHERE event_type = 'page_view'
  AND event_ts >= NOW() - INTERVAL '7 days'
GROUP BY path
ORDER BY views DESC
LIMIT 20;

-- 時間帯別アクセス分布
SELECT
  EXTRACT(HOUR FROM event_ts AT TIME ZONE 'Asia/Tokyo') AS hour,
  COUNT(*) AS page_views
FROM user_events
WHERE event_type = 'page_view'
  AND event_ts >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour;
```

### 7.3 ユーザーフロー

```sql
-- セッション内のページ遷移（サンプル）
WITH session_pages AS (
  SELECT
    session_id,
    path,
    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY event_ts) AS step
  FROM user_events
  WHERE event_type = 'page_view'
    AND event_ts >= NOW() - INTERVAL '7 days'
)
SELECT
  p1.path AS from_page,
  p2.path AS to_page,
  COUNT(*) AS transitions
FROM session_pages p1
JOIN session_pages p2
  ON p1.session_id = p2.session_id
  AND p2.step = p1.step + 1
GROUP BY from_page, to_page
ORDER BY transitions DESC
LIMIT 20;

-- ランディングページ別コンバージョン（ゲーム作成まで）
SELECT
  s.first_path,
  COUNT(DISTINCT s.id) AS sessions,
  COUNT(DISTINCT e.session_id) AS converted,
  ROUND(100.0 * COUNT(DISTINCT e.session_id) / COUNT(DISTINCT s.id), 2) AS conversion_rate
FROM user_sessions s
LEFT JOIN user_events e
  ON s.id = e.session_id
  AND e.event_type = 'game_create'
WHERE s.started_at >= NOW() - INTERVAL '30 days'
GROUP BY s.first_path
HAVING COUNT(DISTINCT s.id) >= 10
ORDER BY conversion_rate DESC;
```

### 7.4 ゲームエンゲージメント

```sql
-- ゲーム作成数（日別）
SELECT
  DATE(event_ts AT TIME ZONE 'Asia/Tokyo') AS date,
  COUNT(*) AS games_created
FROM user_events
WHERE event_type = 'game_create'
  AND event_ts >= NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;

-- ゲーム公開数（日別）
SELECT
  DATE(event_ts AT TIME ZONE 'Asia/Tokyo') AS date,
  COUNT(*) AS games_published
FROM user_events
WHERE event_type = 'game_publish'
  AND event_ts >= NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;

-- ゲームプレイ数（game_id 別、過去7日）
SELECT
  properties->>'game_id' AS game_id,
  COUNT(*) AS play_count,
  COUNT(DISTINCT user_id) AS unique_players,
  COUNT(DISTINCT session_id) AS unique_sessions
FROM user_events
WHERE event_type = 'game_play'
  AND event_ts >= NOW() - INTERVAL '7 days'
  AND properties->>'game_id' IS NOT NULL
GROUP BY game_id
ORDER BY play_count DESC
LIMIT 20;

-- 作成→公開のファネル（ユーザー別）
WITH funnels AS (
  SELECT
    user_id,
    MAX(CASE WHEN event_type = 'game_create' THEN 1 ELSE 0 END) AS created,
    MAX(CASE WHEN event_type = 'game_publish' THEN 1 ELSE 0 END) AS published
  FROM user_events
  WHERE event_ts >= NOW() - INTERVAL '30 days'
    AND user_id IS NOT NULL
  GROUP BY user_id
)
SELECT
  SUM(created) AS total_creators,
  SUM(published) AS total_publishers,
  ROUND(100.0 * SUM(published) / NULLIF(SUM(created), 0), 2) AS publish_rate
FROM funnels;
```

### 7.5 エラー追跡

```sql
-- エラー発生数（過去7日、種類別）
SELECT
  properties->>'message' AS error_message,
  COUNT(*) AS occurrences,
  COUNT(DISTINCT session_id) AS affected_sessions,
  COUNT(DISTINCT user_id) AS affected_users,
  MIN(event_ts) AS first_seen,
  MAX(event_ts) AS last_seen
FROM user_events
WHERE event_type = 'error'
  AND event_ts >= NOW() - INTERVAL '7 days'
GROUP BY error_message
ORDER BY occurrences DESC
LIMIT 20;

-- エラー発生ページ別
SELECT
  path,
  COUNT(*) AS error_count
FROM user_events
WHERE event_type = 'error'
  AND event_ts >= NOW() - INTERVAL '7 days'
GROUP BY path
ORDER BY error_count DESC
LIMIT 10;

-- エラー詳細（最新10件）
SELECT
  event_ts,
  path,
  properties->>'message' AS message,
  properties->>'filename' AS filename,
  properties->>'lineno' AS lineno,
  user_id
FROM user_events
WHERE event_type = 'error'
ORDER BY event_ts DESC
LIMIT 10;
```

### 7.6 流入分析

```sql
-- UTM source 別セッション数
SELECT
  COALESCE(utm_source, '(direct)') AS source,
  COUNT(*) AS sessions,
  COUNT(DISTINCT user_id) AS unique_users
FROM user_sessions
WHERE started_at >= NOW() - INTERVAL '30 days'
GROUP BY source
ORDER BY sessions DESC;

-- リファラードメイン別
SELECT
  CASE
    WHEN referrer IS NULL OR referrer = '' THEN '(direct)'
    ELSE SPLIT_PART(SPLIT_PART(referrer, '://', 2), '/', 1)
  END AS referrer_domain,
  COUNT(*) AS sessions
FROM user_sessions
WHERE started_at >= NOW() - INTERVAL '30 days'
GROUP BY referrer_domain
ORDER BY sessions DESC
LIMIT 20;

-- キャンペーン別コンバージョン
SELECT
  COALESCE(s.utm_campaign, '(none)') AS campaign,
  COUNT(DISTINCT s.id) AS sessions,
  COUNT(DISTINCT CASE WHEN e.event_type = 'game_create' THEN s.id END) AS conversions,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN e.event_type = 'game_create' THEN s.id END)
    / NULLIF(COUNT(DISTINCT s.id), 0), 2) AS conversion_rate
FROM user_sessions s
LEFT JOIN user_events e ON s.id = e.session_id
WHERE s.started_at >= NOW() - INTERVAL '30 days'
GROUP BY campaign
HAVING COUNT(DISTINCT s.id) >= 5
ORDER BY sessions DESC;
```

### 7.7 デバイス・地域分析

```sql
-- OS 別ユーザー数
SELECT
  COALESCE(os, 'Unknown') AS os,
  COUNT(*) AS devices,
  COUNT(DISTINCT user_id) AS users
FROM user_devices
WHERE last_seen_at >= NOW() - INTERVAL '30 days'
GROUP BY os
ORDER BY devices DESC;

-- ブラウザ別ユーザー数
SELECT
  COALESCE(browser, 'Unknown') AS browser,
  COUNT(*) AS devices,
  COUNT(DISTINCT user_id) AS users
FROM user_devices
WHERE last_seen_at >= NOW() - INTERVAL '30 days'
GROUP BY browser
ORDER BY devices DESC;

-- 国別セッション数
SELECT
  COALESCE(country, 'Unknown') AS country,
  COUNT(*) AS sessions,
  COUNT(DISTINCT user_id) AS unique_users
FROM user_sessions
WHERE started_at >= NOW() - INTERVAL '30 days'
GROUP BY country
ORDER BY sessions DESC
LIMIT 20;
```

### 7.8 セッション分析

```sql
-- 平均セッション時間（分）
SELECT
  DATE(started_at AT TIME ZONE 'Asia/Tokyo') AS date,
  ROUND(AVG(duration_sec) / 60.0, 1) AS avg_duration_min,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_sec) / 60.0, 1) AS median_duration_min
FROM user_sessions
WHERE started_at >= NOW() - INTERVAL '30 days'
  AND ended_at IS NOT NULL
  AND duration_sec > 0
GROUP BY date
ORDER BY date DESC;

-- セッションあたりのイベント数
SELECT
  DATE(s.started_at AT TIME ZONE 'Asia/Tokyo') AS date,
  ROUND(AVG(event_count), 1) AS avg_events_per_session
FROM user_sessions s
JOIN (
  SELECT session_id, COUNT(*) AS event_count
  FROM user_events
  WHERE event_ts >= NOW() - INTERVAL '30 days'
  GROUP BY session_id
) e ON s.id = e.session_id
WHERE s.started_at >= NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;

-- バウンス率（1ページビューのみのセッション）
WITH session_pageviews AS (
  SELECT
    session_id,
    COUNT(*) AS pageview_count
  FROM user_events
  WHERE event_type = 'page_view'
    AND event_ts >= NOW() - INTERVAL '7 days'
  GROUP BY session_id
)
SELECT
  COUNT(*) AS total_sessions,
  SUM(CASE WHEN pageview_count = 1 THEN 1 ELSE 0 END) AS bounced_sessions,
  ROUND(100.0 * SUM(CASE WHEN pageview_count = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) AS bounce_rate
FROM session_pageviews;
```

---

## 8. トラブルシューティング

### 8.1 イベントが記録されない

**確認手順:**

1. **ブラウザコンソールを確認**
   ```javascript
   // セッション ID が存在するか
   console.log(DreamCoreAnalytics.getSessionId());

   // デバイス ID が存在するか
   console.log(DreamCoreAnalytics.getDeviceId());
   ```

2. **Network タブを確認**
   - `/api/analytics/session` のレスポンスが 200 か
   - `/api/analytics/track` のレスポンスが 200 か

3. **localStorage を確認**
   ```javascript
   console.log(localStorage.getItem('dc_session'));
   console.log(localStorage.getItem('dc_device_id'));
   ```

**よくある原因:**

| 症状 | 原因 | 対処 |
|------|------|------|
| session_id が null | セッション作成失敗 | サーバーログを確認 |
| track が 400 | 不正な event_type | VALID_EVENT_TYPES を確認 |
| track が 400 | session_id が無効な UUID | セッションを再作成 |
| イベントが遅延 | バッファリング中 | `flush()` を手動呼び出し |

### 8.2 ユーザー紐付けが動かない

**確認手順:**

1. **認証状態を確認**
   ```javascript
   // DreamCoreAuth が利用可能か
   console.log(typeof DreamCoreAuth);

   // セッションが存在するか
   console.log(DreamCoreAuth.getSession());
   ```

2. **link API のレスポンスを確認**
   - `/api/analytics/link` が 401 → 認証トークンがない
   - `/api/analytics/link` が 400 → session_id/device_id が不正

3. **DB を直接確認**
   ```sql
   -- セッションに user_id が付与されているか
   SELECT id, user_id, started_at
   FROM user_sessions
   WHERE device_id = 'xxx'
   ORDER BY started_at DESC
   LIMIT 5;

   -- イベントに user_id が付与されているか
   SELECT id, user_id, event_type, event_ts
   FROM user_events
   WHERE session_id = 'yyy'
   ORDER BY event_ts;
   ```

### 8.3 セッションが頻繁に切れる

**原因と対処:**

| 原因 | 対処 |
|------|------|
| 30分無操作 | 仕様通り。タイムアウトを延長する場合は `SESSION_TIMEOUT` を変更 |
| localStorage がクリアされた | プライベートモードやブラウザ設定を確認 |
| 別ドメインからアクセス | Same-origin でのみ動作 |

### 8.4 properties が保存されない

**確認手順:**

1. **サイズを確認**
   ```javascript
   const props = { ... };
   console.log(JSON.stringify(props).length);  // 4096 以下か
   ```

2. **サーバーログを確認**
   ```
   [Analytics] Properties too large for event: xxx
   ```

**対処:**
- properties は 4KB 以下に抑える
- 大きなデータは別途保存し、ID のみを properties に入れる

### 8.5 国コードが null になる

**原因:**
- Cloudflare を経由していない
- `CF-IPCountry` ヘッダーがない

**確認方法:**
```bash
curl -I https://v2.dreamcore.gg/api/config | grep -i cf-
```

**対処:**
- 本番環境では Cloudflare 経由でアクセス
- ローカル開発では null は正常

### 8.6 retention ジョブが動かない

**確認手順:**

1. **Cron ジョブの状態を確認**
   ```bash
   # PM2 のログを確認
   pm2 logs dreamcore-sandbox | grep retention
   ```

2. **手動実行でテスト**
   ```sql
   -- 削除対象件数を確認
   SELECT COUNT(*)
   FROM user_events
   WHERE event_ts < NOW() - INTERVAL '180 days';

   SELECT COUNT(*)
   FROM user_sessions
   WHERE started_at < NOW() - INTERVAL '365 days';
   ```

### 8.7 デバッグ用クエリ

```sql
-- 最新のセッション一覧
SELECT
  id,
  user_id,
  device_id,
  first_path,
  started_at,
  ended_at,
  duration_sec
FROM user_sessions
ORDER BY started_at DESC
LIMIT 10;

-- 最新のイベント一覧
SELECT
  id,
  user_id,
  session_id,
  event_type,
  path,
  event_ts,
  properties
FROM user_events
ORDER BY event_ts DESC
LIMIT 20;

-- 特定セッションの全イベント
SELECT
  event_type,
  path,
  event_ts,
  properties
FROM user_events
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY event_ts;

-- 特定ユーザーの最近のアクティビティ
SELECT
  e.event_type,
  e.path,
  e.event_ts,
  s.first_path,
  s.utm_source
FROM user_events e
JOIN user_sessions s ON e.session_id = s.id
WHERE e.user_id = 'YOUR_USER_ID'
ORDER BY e.event_ts DESC
LIMIT 50;
```

---

## 関連ドキュメント

- [API リファレンス](./API-REFERENCE.md) - 全 API エンドポイント一覧
- [データベーススキーマ](../.claude/docs/database-schema.md) - 全テーブル定義
- [Analytics 実装計画](../.claude/plans/analytics-standard.md) - 設計ドキュメント
