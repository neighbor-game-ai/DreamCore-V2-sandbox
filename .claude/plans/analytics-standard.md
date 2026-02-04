# Analytics 実装計画（Standard）

**作成日:** 2026-02-04
**ステータス:** 計画中
**スコープ:** MVP以上・大手未満の実用バランス

---

## 概要

行動分析の基盤を Standard スコープで導入する。
- セッション追跡
- イベント記録
- デバイス識別
- pre-login イベントの保持とログイン時紐付け

---

## 1. DB スキーマ

### 1.1 user_sessions

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- セッション情報
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_sec INTEGER,

  -- 流入情報
  first_path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  -- デバイス・地域
  device_id TEXT,
  country TEXT,
  timezone TEXT
);

-- インデックス
CREATE INDEX idx_user_sessions_user_started ON user_sessions(user_id, started_at DESC);
CREATE INDEX idx_user_sessions_started ON user_sessions(started_at DESC);
CREATE INDEX idx_user_sessions_device ON user_sessions(device_id);
```

### 1.2 user_events

```sql
CREATE TABLE user_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,

  -- イベント情報
  event_type TEXT NOT NULL,
  event_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  path TEXT,
  properties JSONB,

  -- バリデーション（初期リリース + 将来拡張分を含む）
  CONSTRAINT valid_event_type CHECK (
    event_type IN (
      -- 初期リリース
      'page_view', 'login', 'logout',
      'game_play', 'game_create', 'game_publish',
      'error',
      -- 後日追加
      'button_click', 'form_submit', 'scroll_depth'
    )
  ),
  CONSTRAINT properties_size CHECK (
    properties IS NULL OR octet_length(properties::text) <= 4096
  )
);

-- インデックス
CREATE INDEX idx_user_events_user_ts ON user_events(user_id, event_ts DESC);
CREATE INDEX idx_user_events_type_ts ON user_events(event_type, event_ts DESC);
CREATE INDEX idx_user_events_session_ts ON user_events(session_id, event_ts DESC);
CREATE INDEX idx_user_events_ts ON user_events(event_ts DESC);
```

### 1.3 user_devices

```sql
CREATE TABLE user_devices (
  device_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- デバイス情報（UA解析後）
  os TEXT,
  browser TEXT,
  screen TEXT,

  -- タイムスタンプ
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_user_devices_user_lastseen ON user_devices(user_id, last_seen_at DESC);
```

### 1.4 マイグレーションファイル

`supabase/migrations/012_analytics_tables.sql` として作成。

---

## 2. Retention（データ保持）

### 2.1 削除ルール

| テーブル | 保持期間 | 削除タイミング |
|----------|----------|----------------|
| user_events | 180日 | 日次 Cron |
| user_sessions | 365日 | 日次 Cron |
| user_devices | 無期限 | - |

**user_devices について:**
- 現時点では無期限保持
- `last_seen_at` を毎セッション更新する設計
- 将来的に「365日以上未使用のデバイスを削除」等のクリーンアップを検討可能

### 2.2 削除 SQL

```sql
-- user_events: 180日超過を削除
DELETE FROM user_events
WHERE event_ts < NOW() - INTERVAL '180 days';

-- user_sessions: 365日超過を削除
DELETE FROM user_sessions
WHERE started_at < NOW() - INTERVAL '365 days';
```

### 2.3 Cron 設定

`server/cron/analytics-retention.js` で日次実行（深夜3時）。

---

## 3. 収集イベント

### 3.1 固定リスト

| フェーズ | event_type | 説明 | properties 例 |
|----------|------------|------|---------------|
| **初期リリース** | `page_view` | ページ表示 | `{ title }` |
| | `login` | ログイン | `{ method: 'google' }` |
| | `logout` | ログアウト | - |
| | `game_play` | ゲームプレイ開始 | `{ game_id, duration_sec }` |
| | `game_create` | ゲーム作成完了 | `{ project_id }` |
| | `game_publish` | ゲーム公開 | `{ game_id }` |
| | `error` | エラー発生 | `{ message, stack }` |
| **後日追加** | `button_click` | ボタンクリック | `{ button_id, label }` |
| | `form_submit` | フォーム送信 | `{ form_id }` |
| | `scroll_depth` | スクロール深度 | `{ depth: 50 }` |

**方針:** 初期リリースは価値の高いイベントに集中。拡張イベントは運用開始後に追加。

### 3.2 バリデーション

サーバー側で `event_type` が固定リストに含まれるかチェック。
不正な event_type は 400 エラー。

---

## 4. 収集フロー

### 4.1 フロントエンド → サーバー

```
[ブラウザ]
  │
  │ イベント発生
  ↓
analytics.track('page_view', { title: 'Create' })
  │
  │ バッファに追加
  ↓
[25件 or 5秒経過]
  │
  ↓
POST /api/analytics/track
  {
    device_id: 'xxx',
    session_id: 'yyy',
    events: [
      { event_type, event_ts, path, properties },
      ...
    ]
  }
  │
  ↓
[サーバー]
  │
  │ 1. user_id 補完（認証済みなら）
  │ 2. country 補完（Cloudflare ヘッダー）
  │ 3. event_type バリデーション
  │ 4. properties サイズチェック（4KB）
  ↓
INSERT INTO user_events
```

### 4.2 session_id の管理

```javascript
// localStorage で管理
// 無操作30分で新規セッション

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30分

function getSessionId() {
  const stored = localStorage.getItem('dc_session');
  if (stored) {
    const { id, lastActive } = JSON.parse(stored);
    if (Date.now() - lastActive < SESSION_TIMEOUT) {
      // セッション継続
      updateLastActive(id);
      return id;
    }
  }
  // 新規セッション
  return createNewSession();
}

function createNewSession() {
  const id = crypto.randomUUID();
  localStorage.setItem('dc_session', JSON.stringify({
    id,
    lastActive: Date.now(),
    startedAt: Date.now(),
  }));

  // セッション開始を通知
  sendSessionStart(id);
  return id;
}

function updateLastActive(id) {
  const stored = JSON.parse(localStorage.getItem('dc_session'));
  stored.lastActive = Date.now();
  localStorage.setItem('dc_session', JSON.stringify(stored));
}
```

### 4.3 device_id の管理

```javascript
// localStorage で永続管理

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

## 5. pre-login の扱い

### 5.1 匿名イベントの保存

ログイン前のイベントも `user_id = NULL` で保存。
`session_id` と `device_id` で追跡可能。

### 5.2 ログイン時の紐付け

```sql
-- ログイン成功時に実行
-- 同一セッション内のイベントに user_id を紐付け

UPDATE user_events
SET user_id = $1
WHERE session_id = $2
  AND user_id IS NULL;

UPDATE user_sessions
SET user_id = $1
WHERE id = $2
  AND user_id IS NULL;

-- デバイスも紐付け（user_id が NULL の場合のみ）
-- last_seen_at は常に更新
UPDATE user_devices
SET
  user_id = COALESCE(user_id, $1),
  last_seen_at = NOW()
WHERE device_id = $3;
```

### 5.3 セッション開始時のデバイス更新

```sql
-- 毎セッション開始時に last_seen_at を更新
INSERT INTO user_devices (device_id, user_id, os, browser, screen, first_seen_at, last_seen_at)
VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
ON CONFLICT (device_id) DO UPDATE SET
  user_id = COALESCE(user_devices.user_id, EXCLUDED.user_id),
  os = EXCLUDED.os,
  browser = EXCLUDED.browser,
  screen = EXCLUDED.screen,
  last_seen_at = NOW();
```

### 5.3 フロー図

```
[未ログイン]
  │
  │ page_view (user_id=NULL, session_id=abc)
  │ button_click (user_id=NULL, session_id=abc)
  ↓
[ログイン]
  │
  │ login イベント発生
  │ サーバーで紐付け実行
  ↓
[ログイン後]
  │
  │ page_view (user_id=123, session_id=abc)  ← 自動で user_id 付与
  │
  │ 過去イベントも更新済み:
  │   page_view (user_id=123, session_id=abc)  ← NULL → 123
  │   button_click (user_id=123, session_id=abc)
```

---

## 6. セキュリティ/プライバシー

### 6.1 保存しないデータ

| データ | 理由 | 代替 |
|--------|------|------|
| IP アドレス | 個人情報 | country のみ保存 |
| User-Agent 生値 | 詳細すぎる | os/browser に解析後保存 |
| 詳細位置情報 | 不要 | country + timezone |

### 6.2 properties 制限

- 最大 4KB（4096バイト）
- DB 側で CHECK 制約
- サーバー側でも事前チェック

### 6.3 RLS ポリシー

```sql
-- user_events: 自分のイベントのみ参照可能
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events" ON user_events
  FOR SELECT
  USING (user_id = auth.uid());

-- service_role は全アクセス可（INSERT 用）
CREATE POLICY "Service role full access" ON user_events
  FOR ALL
  USING (auth.role() = 'service_role');
```

---

## 7. 実装ファイル

### 7.1 サーバー側

```
server/
├── modules/
│   └── analytics/
│       ├── index.js          # ルート定義
│       ├── ingest.js         # イベント受信・保存
│       ├── session.js        # セッション管理
│       ├── enrichment.js     # country/UA解析
│       └── retention.js      # 保持期間管理
└── cron/
    └── analytics-retention.js  # 日次削除ジョブ
```

### 7.2 フロントエンド

```
public/
└── js/
    └── modules/
        └── analytics.js      # 収集・送信ロジック
```

### 7.3 ドキュメント

`docs/API-REFERENCE.md` に以下を追記:

```markdown
## Analytics API

### POST /api/analytics/track

イベントをバッチ送信。

**Request:**
```json
{
  "device_id": "xxx",
  "session_id": "yyy",
  "events": [
    {
      "event_type": "page_view",
      "event_ts": "2026-02-04T12:00:00Z",
      "path": "/create",
      "properties": { "title": "Create" }
    }
  ]
}
```

**Response:** `200 OK` / `400 Bad Request`
```

---

## 8. 実装タスク

### Phase 1: DB スキーマ（Day 1）

- [ ] `012_analytics_tables.sql` 作成
- [ ] マイグレーション実行
- [ ] インデックス確認

### Phase 2: サーバー API（Day 2-3）

- [ ] `server/modules/analytics/index.js` - ルート
- [ ] `server/modules/analytics/ingest.js` - イベント受信
- [ ] `server/modules/analytics/session.js` - セッション開始/終了
- [ ] `server/modules/analytics/enrichment.js` - country/UA解析
- [ ] event_type バリデーション
- [ ] properties サイズチェック

### Phase 3: フロントエンド（Day 4-5）

- [ ] `public/js/modules/analytics.js`
  - [ ] device_id 管理
  - [ ] session_id 管理（30分タイムアウト）
  - [ ] イベントバッファ（25件 or 5秒）
  - [ ] track() 関数
  - [ ] 自動 page_view
- [ ] 各ページに analytics.js 読み込み
- [ ] ログイン時の紐付け処理

### Phase 4: Retention（Day 6）

- [ ] `server/cron/analytics-retention.js`
- [ ] Cron 設定（日次 3:00 AM）
- [ ] 動作確認

### Phase 5: テスト・ドキュメント（Day 7）

- [ ] page_view 記録確認
- [ ] session_id 継続確認
- [ ] login 後 user_id 紐付け確認
- [ ] retention SQL 動作確認
- [ ] `docs/API-REFERENCE.md` 更新

---

## 9. 検証チェックリスト

### 9.1 基本動作

- [ ] 未ログインで page_view が記録される
- [ ] session_id が localStorage に保存される
- [ ] 30分以内の再訪問で同一 session_id
- [ ] 30分超過で新規 session_id

### 9.2 ログイン紐付け

- [ ] ログイン前のイベント（user_id=NULL）が存在
- [ ] ログイン後、同一セッションのイベントに user_id が付与
- [ ] 新規イベントに自動で user_id が付与

### 9.3 Retention

- [ ] 180日超過の user_events が削除される
- [ ] 365日超過の user_sessions が削除される
- [ ] user_devices は削除されない

### 9.4 セキュリティ

- [ ] IP アドレスが保存されていない
- [ ] User-Agent 生値が保存されていない
- [ ] 4KB 超過の properties が拒否される
- [ ] 不正な event_type が拒否される

---

## 10. 想定データ量（再計算）

| テーブル | 1日 | 1ヶ月 | 180日後 |
|----------|-----|-------|---------|
| user_events | 1.6万件 | 50万件 | 300万件 |
| user_sessions | 550件 | 1.6万件 | 20万件 |
| user_devices | 50件 | 1.5千件 | 9千件 |

**ストレージ:**
- user_events: 300万件 × 500B ≒ 1.5GB（180日後）
- user_sessions: 20万件 × 300B ≒ 60MB
- user_devices: 9千件 × 200B ≒ 2MB

**合計: 約1.6GB**（Supabase Pro プラン 8GB 内）

---

## 11. 今後の拡張（スコープ外）

| 機能 | 説明 | 優先度 |
|------|------|--------|
| 集計テーブル | daily_stats, weekly_stats | 中 |
| ダッシュボード | DAU/MAU, イベント推移 | 中 |
| ファネル分析 | 登録→作成→公開の転換率 | 低 |
| コホート分析 | 週別リテンション | 低 |
| 外部連携 | Amplitude, BigQuery | 低 |
