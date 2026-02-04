# ユーザーアナリティクス設計（大手並み）

**作成日:** 2026-02-04
**ステータス:** 提案
**参考:** TikTok, Instagram, YouTube のデータ収集

---

## 概要

DreamCore のユーザーデータ収集を大手プラットフォーム並みに拡張する。
プライバシーポリシーの更新と同意取得が必要。

---

## データモデル

### 1. public.users（プロフィール拡張）

```sql
-- 既存
id, email, display_name, username, avatar_url, bio, social_links, public_id

-- 追加: 基本属性
phone TEXT,                      -- 電話番号（任意）
birth_date DATE,                 -- 生年月日（任意）
gender TEXT,                     -- 性別（任意）
preferred_language TEXT,         -- 希望言語（UIに使用）

-- 追加: 地域・ロケール
country TEXT,                    -- 国コード（JP, US, etc）
region TEXT,                     -- 地域（Tokyo, California, etc）
city TEXT,                       -- 都市
timezone TEXT,                   -- タイムゾーン
currency TEXT,                   -- 通貨（JPY, USD）

-- 追加: マーケティング属性
referrer TEXT,                   -- 初回流入元
utm_source TEXT,
utm_medium TEXT,
utm_campaign TEXT,
utm_term TEXT,
utm_content TEXT,
acquisition_channel TEXT,        -- organic, paid, social, referral

-- 追加: エンゲージメント集計（デイリー更新）
games_created_count INTEGER DEFAULT 0,
games_published_count INTEGER DEFAULT 0,
total_play_count INTEGER DEFAULT 0,      -- 自分のゲームの総プレイ数
total_likes_received INTEGER DEFAULT 0,
session_count INTEGER DEFAULT 0,
total_session_duration INTEGER DEFAULT 0, -- 秒
days_active_total INTEGER DEFAULT 0,
days_active_last_7 INTEGER DEFAULT 0,
days_active_last_30 INTEGER DEFAULT 0,

-- 追加: タイムスタンプ
first_login_at TIMESTAMPTZ,
last_login_at TIMESTAMPTZ,
last_active_at TIMESTAMPTZ,      -- 最後のアクション
last_game_created_at TIMESTAMPTZ,
last_game_published_at TIMESTAMPTZ,

-- 追加: ステータス
account_status TEXT DEFAULT 'active',  -- active, suspended, deleted
email_verified BOOLEAN DEFAULT false,
phone_verified BOOLEAN DEFAULT false,
onboarding_completed BOOLEAN DEFAULT false,
onboarding_step TEXT,

-- 追加: 設定
notification_settings JSONB DEFAULT '{}',
privacy_settings JSONB DEFAULT '{}',
```

### 2. user_devices（デバイス情報）

```sql
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- デバイス識別
  device_fingerprint TEXT,       -- ブラウザフィンガープリント
  device_id TEXT,                -- localStorage に保存したID

  -- デバイス情報
  device_type TEXT,              -- mobile, tablet, desktop
  device_vendor TEXT,            -- Apple, Samsung, etc
  device_model TEXT,             -- iPhone 15 Pro, etc
  os_name TEXT,                  -- iOS, Android, Windows, macOS
  os_version TEXT,               -- 17.2, 14, 11, etc
  browser_name TEXT,             -- Safari, Chrome, etc
  browser_version TEXT,

  -- 画面
  screen_width INTEGER,
  screen_height INTEGER,
  pixel_ratio REAL,

  -- ネットワーク
  connection_type TEXT,          -- wifi, 4g, 5g

  -- 位置（デバイス単位）
  ip_address INET,
  country TEXT,
  region TEXT,
  city TEXT,
  latitude REAL,
  longitude REAL,

  -- メタ
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  session_count INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,

  UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX idx_user_devices_user ON user_devices(user_id);
CREATE INDEX idx_user_devices_fingerprint ON user_devices(device_fingerprint);
```

### 3. user_sessions（セッション追跡）

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES user_devices(id),

  -- セッション情報
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- 流入
  entry_url TEXT,
  entry_page TEXT,               -- /create, /discover, etc
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,

  -- アクティビティ集計
  page_views INTEGER DEFAULT 0,
  actions_count INTEGER DEFAULT 0,
  games_created INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,

  -- 離脱
  exit_page TEXT,
  bounce BOOLEAN DEFAULT false,  -- 1ページで離脱

  -- ステータス
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_started ON user_sessions(started_at DESC);
```

### 4. user_events（イベント追跡）

```sql
CREATE TABLE user_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  device_id UUID REFERENCES user_devices(id) ON DELETE SET NULL,

  -- イベント情報
  event_name TEXT NOT NULL,      -- page_view, button_click, game_create, etc
  event_category TEXT,           -- navigation, engagement, conversion
  event_action TEXT,             -- click, submit, scroll, etc
  event_label TEXT,              -- 詳細ラベル
  event_value INTEGER,           -- 数値（秒数、金額など）

  -- コンテキスト
  page_url TEXT,
  page_path TEXT,
  page_title TEXT,
  element_id TEXT,               -- クリックした要素
  element_class TEXT,

  -- 対象リソース
  resource_type TEXT,            -- game, project, asset, user
  resource_id UUID,

  -- 追加データ
  properties JSONB DEFAULT '{}', -- イベント固有のデータ

  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- パーティション（月別）を検討
CREATE INDEX idx_user_events_user ON user_events(user_id);
CREATE INDEX idx_user_events_session ON user_events(session_id);
CREATE INDEX idx_user_events_name ON user_events(event_name);
CREATE INDEX idx_user_events_created ON user_events(created_at DESC);
```

### 5. user_preferences（設定・嗜好）

```sql
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- UI設定
  theme TEXT DEFAULT 'system',   -- light, dark, system
  language TEXT DEFAULT 'ja',

  -- 通知設定
  email_marketing BOOLEAN DEFAULT true,
  email_updates BOOLEAN DEFAULT true,
  email_social BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT false,

  -- プライバシー設定
  profile_public BOOLEAN DEFAULT true,
  show_activity BOOLEAN DEFAULT true,
  allow_analytics BOOLEAN DEFAULT true,

  -- コンテンツ設定
  mature_content BOOLEAN DEFAULT false,
  autoplay BOOLEAN DEFAULT true,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## イベント定義

### コアイベント

| イベント名 | カテゴリ | 説明 |
|-----------|---------|------|
| `page_view` | navigation | ページ表示 |
| `session_start` | session | セッション開始 |
| `session_end` | session | セッション終了 |
| `login` | auth | ログイン |
| `logout` | auth | ログアウト |
| `signup` | auth | 新規登録 |

### エンゲージメント

| イベント名 | カテゴリ | 説明 |
|-----------|---------|------|
| `game_create_start` | engagement | ゲーム作成開始 |
| `game_create_complete` | conversion | ゲーム作成完了 |
| `game_publish` | conversion | ゲーム公開 |
| `game_play_start` | engagement | ゲームプレイ開始 |
| `game_play_end` | engagement | ゲームプレイ終了 |
| `game_like` | engagement | いいね |
| `game_share` | engagement | シェア |
| `prompt_send` | engagement | AIプロンプト送信 |

### UI操作

| イベント名 | カテゴリ | 説明 |
|-----------|---------|------|
| `button_click` | interaction | ボタンクリック |
| `link_click` | interaction | リンククリック |
| `form_submit` | interaction | フォーム送信 |
| `modal_open` | interaction | モーダル表示 |
| `modal_close` | interaction | モーダル閉じる |
| `scroll_depth` | interaction | スクロール深度 |
| `video_play` | interaction | 動画再生 |

### エラー

| イベント名 | カテゴリ | 説明 |
|-----------|---------|------|
| `error` | error | エラー発生 |
| `api_error` | error | API エラー |
| `js_error` | error | JavaScript エラー |

---

## 収集タイミング

### 1. ページロード時

```javascript
// 毎ページで自動実行
analytics.track('page_view', {
  page_path: location.pathname,
  page_title: document.title,
  referrer: document.referrer,
});
```

### 2. セッション開始時

```javascript
// 30分以上の無操作後、または新規訪問
analytics.startSession({
  entry_url: location.href,
  referrer: document.referrer,
  utm: getUtmParams(),
  device: getDeviceInfo(),
});
```

### 3. アクション時

```javascript
// ボタン/リンクに data-track 属性
<button data-track="game_publish" data-game-id="xxx">公開</button>

// 自動追跡
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-track]');
  if (el) {
    analytics.track(el.dataset.track, {
      element_id: el.id,
      ...el.dataset,
    });
  }
});
```

### 4. 離脱時

```javascript
// beforeunload または visibilitychange
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    analytics.endSession();
  }
});
```

### 5. 定期的（ハートビート）

```javascript
// 30秒ごとにアクティブ状態を送信
setInterval(() => {
  if (document.visibilityState === 'visible') {
    analytics.heartbeat();
  }
}, 30000);
```

---

## 実装アーキテクチャ

### フロントエンド

```
public/analytics.js
├── init()           - 初期化、デバイス識別
├── startSession()   - セッション開始
├── endSession()     - セッション終了
├── track(event, props)  - イベント送信
├── identify(userId)     - ユーザー識別
├── heartbeat()          - アクティブ状態
└── getDeviceInfo()      - デバイス情報取得
```

### バックエンド

```
POST /api/analytics/events     - イベント受信（バッチ）
POST /api/analytics/session    - セッション開始/終了
GET  /api/analytics/config     - 設定取得

server/analytics/
├── ingest.js        - イベント受信・バリデーション
├── enrichment.js    - IP→地域、UA解析
├── aggregation.js   - 集計処理（Cron）
└── export.js        - 外部連携（BigQuery, Amplitude）
```

### データフロー

```
ブラウザ
  ↓ イベント（バッチ、5秒ごと or 10件ごと）
Express /api/analytics/events
  ↓ バリデーション + エンリッチメント（IP→地域、UA解析）
PostgreSQL (user_events)
  ↓ Cron（1時間ごと）
集計テーブル (user_stats_daily, user_stats_hourly)
  ↓ 外部連携（任意）
BigQuery / Amplitude / Mixpanel
```

---

## デバイス識別

### フィンガープリント生成

```javascript
async function generateFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency,
    navigator.deviceMemory,
    // Canvas fingerprint
    await getCanvasFingerprint(),
    // WebGL fingerprint
    await getWebGLFingerprint(),
  ];

  return await sha256(components.join('|'));
}
```

### デバイスID（永続）

```javascript
function getDeviceId() {
  let id = localStorage.getItem('dc_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('dc_device_id', id);
  }
  return id;
}
```

---

## IP → 地域変換

### オプション A: Cloudflare（推奨）

```javascript
// Cloudflare が自動付与するヘッダー
const country = req.headers['cf-ipcountry'];      // JP
const city = req.headers['cf-ipcity'];            // Tokyo
const latitude = req.headers['cf-iplat'];
const longitude = req.headers['cf-iplon'];
```

### オプション B: MaxMind GeoLite2

```javascript
import maxmind from 'maxmind';
const lookup = await maxmind.open('/path/to/GeoLite2-City.mmdb');
const geo = lookup.get(ipAddress);
// geo.country.iso_code, geo.city.names.en, etc
```

---

## プライバシー対応

### 必須対応

| 項目 | 対応 |
|------|------|
| プライバシーポリシー更新 | 収集データの明記 |
| Cookie同意バナー | 初回訪問時に表示 |
| データ削除機能 | GDPR/個人情報保護法対応 |
| オプトアウト | アナリティクス無効化オプション |
| データエクスポート | ユーザーが自分のデータをダウンロード |

### 同意フロー

```javascript
// 初回訪問
if (!hasConsent()) {
  showConsentBanner({
    essential: true,      // 必須（常にON）
    analytics: true,      // アナリティクス（デフォルトON）
    marketing: false,     // マーケティング（デフォルトOFF）
  });
}

// 同意状態に応じて収集
if (getConsent('analytics')) {
  analytics.init();
}
```

---

## 実装フェーズ

### Phase 1: 基盤（1週間）

- [ ] public.users カラム追加
- [ ] user_devices テーブル作成
- [ ] user_sessions テーブル作成
- [ ] user_events テーブル作成
- [ ] analytics.js 基本実装

### Phase 2: イベント追跡（1週間）

- [ ] page_view 自動追跡
- [ ] セッション管理
- [ ] クリック追跡（data-track）
- [ ] エラー追跡

### Phase 3: エンリッチメント（3日）

- [ ] IP → 地域変換
- [ ] User-Agent 解析
- [ ] デバイスフィンガープリント

### Phase 4: 集計・可視化（1週間）

- [ ] 日次集計 Cron
- [ ] users テーブルへの反映
- [ ] 管理ダッシュボード（任意）

### Phase 5: プライバシー（3日）

- [ ] 同意バナー
- [ ] プライバシーポリシー更新
- [ ] オプトアウト機能

---

## 外部サービス連携（検討）

| サービス | 用途 | コスト |
|----------|------|--------|
| **Amplitude** | プロダクトアナリティクス | 無料〜 |
| **Mixpanel** | イベント分析 | 無料〜 |
| **PostHog** | オープンソース、セルフホスト可 | 無料〜 |
| **Google Analytics 4** | 汎用アナリティクス | 無料 |
| **BigQuery** | データウェアハウス | 従量課金 |

**推奨:** PostHog（セルフホスト）または Amplitude（マネージド）

---

## 想定データ量

| テーブル | 1日あたり | 1ヶ月あたり |
|----------|----------|------------|
| user_events | 100万件 | 3,000万件 |
| user_sessions | 5万件 | 150万件 |
| user_devices | 1,000件 | 3万件 |

**対策:**
- user_events は月別パーティション
- 90日以上のデータは集計後アーカイブ
- インデックス最適化

---

## まとめ

| 項目 | 現状 | 大手並み |
|------|------|---------|
| プロフィール項目 | 6項目 | 20+項目 |
| デバイス情報 | なし | 詳細（OS, ブラウザ, 画面, etc） |
| 位置情報 | country のみ | country + region + city |
| セッション追跡 | なし | 完全追跡 |
| イベント追跡 | なし | 全操作を記録 |
| 集計指標 | なし | DAU, MAU, リテンション等 |

実装工数: **約3-4週間**
