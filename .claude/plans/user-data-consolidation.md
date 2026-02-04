# ユーザーデータ統合計画

**作成日:** 2026-02-04
**ステータス:** 提案

---

## 背景

現在、ユーザー関連データが複数テーブルに分散している：

| テーブル | 役割 | データ例 |
|----------|------|----------|
| `auth.users` | 認証（Supabase管理） | email, provider, metadata |
| `public.users` | プロフィール | display_name, bio, avatar_url |
| `user_access` | ウェイトリスト + 分析 | language, country, utm_source |

**問題点:**
- `user_access` はウェイトリスト用だが、分析データも混在
- ウェイトリスト廃止後、分析データの行き場がない
- データ取得タイミングが不明確

---

## 提案: public.users への統合

### 追加カラム

```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
```

### 最終スキーマ

| カラム | 型 | 取得タイミング | 説明 |
|--------|-----|----------------|------|
| id | UUID (PK) | 登録時 | auth.users.id と同一 |
| email | TEXT | 登録時 | メールアドレス |
| display_name | TEXT | 登録時/編集時 | 表示名 |
| username | TEXT | 編集時 | ユーザー名（URL用） |
| avatar_url | TEXT | 編集時 | プロフィール画像 |
| bio | TEXT | 編集時 | 自己紹介 |
| social_links | JSONB | 編集時 | SNSリンク |
| public_id | TEXT | 登録時（自動） | 公開ID |
| **language** | TEXT | **毎ログイン** | ブラウザ言語（2文字: ja, en） |
| **country** | TEXT | **毎ログイン** | 国（Cloudflare/IP推定） |
| **timezone** | TEXT | **毎ログイン** | タイムゾーン |
| **device_type** | TEXT | **毎ログイン** | デバイス種別 |
| **referrer** | TEXT | **初回のみ** | 流入元（上書き不可） |
| **utm_source** | TEXT | **初回のみ** | UTMパラメータ（上書き不可） |
| **utm_campaign** | TEXT | **初回のみ** | UTMキャンペーン（上書き不可） |
| **first_login_at** | TIMESTAMPTZ | **初回のみ** | 初回ログイン日時 |
| **last_login_at** | TIMESTAMPTZ | **毎ログイン** | 最終ログイン |
| **login_count** | INTEGER | **毎ログイン** | ログイン回数 |
| created_at | TIMESTAMPTZ | 登録時 | 作成日時 |
| updated_at | TIMESTAMPTZ | 更新時（自動） | 更新日時 |

**ポイント:**
- `language`, `country`, `timezone`, `device_type` → **毎回更新**（V1移行ユーザーも次回ログインで取得される）
- `referrer`, `utm_*` → **初回のみ**（`COALESCE(既存値, 新値)` で上書き防止）
- `first_login_at IS NULL` で初回判定

---

## データ取得タイミング

### データの分類

| 分類 | データ | 取得タイミング | 理由 |
|------|--------|----------------|------|
| **初回のみ** | referrer, utm_source, utm_campaign | 初回ログイン | 流入元は最初の1回だけ意味がある |
| **毎回更新** | language, country, timezone | 毎ログイン | 言語設定やVPN使用で変わる可能性 |
| **毎回更新** | last_login_at, login_count | 毎ログイン | アクティビティ追跡 |
| **毎回更新** | device_type | 毎ログイン | PC/モバイル切り替えを追跡 |

### 1. 初回ログイン判定

**定義:** `public.users.first_login_at IS NULL`

```sql
-- カラム追加
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ;
```

**初回のみ取得するデータ:**
- referrer（最初の流入元）
- utm_source / utm_campaign（最初のキャンペーン）
- first_login_at（記録）

### 2. 毎ログイン時

**取得データ:**
- language（`navigator.language` → 先頭2文字に正規化）
- country（Cloudflare ヘッダー or IP推定）
- timezone（`Intl.DateTimeFormat().resolvedOptions().timeZone`）
- device_type（User-Agent から判定）
- last_login_at
- login_count（インクリメント）

**実装場所:** `public/auth.js` の `onAuthStateChange` 内

```javascript
// 毎ログイン時に実行
async function recordLogin(userId) {
  // language を先頭2文字に正規化（ja-JP → ja）
  const language = navigator.language?.slice(0, 2).toLowerCase();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const deviceType = getDeviceType(); // mobile / tablet / desktop

  // 初回判定用: UTM は localStorage から取得（24h有効）
  const utmData = getStoredUtmData(); // expires_at チェック込み

  await supabase.rpc('record_login', {
    p_user_id: userId,
    p_language: language,
    p_timezone: timezone,
    p_device_type: deviceType,
    p_referrer: utmData?.referrer || null,
    p_utm_source: utmData?.utm_source || null,
    p_utm_campaign: utmData?.utm_campaign || null,
  });

  // UTM 使用済みなら削除
  if (utmData) clearStoredUtmData();
}
```

**Supabase Function（冪等・二重発火対策済み）:**

```sql
CREATE OR REPLACE FUNCTION record_login(
  p_user_id UUID,
  p_language TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE public.users
  SET
    -- 毎回更新
    language = COALESCE(p_language, language),
    timezone = COALESCE(p_timezone, timezone),
    device_type = COALESCE(p_device_type, device_type),
    last_login_at = NOW(),
    login_count = COALESCE(login_count, 0) + 1,

    -- 初回のみ（NULL の場合だけ更新）
    first_login_at = COALESCE(first_login_at, NOW()),
    referrer = COALESCE(referrer, p_referrer),
    utm_source = COALESCE(utm_source, p_utm_source),
    utm_campaign = COALESCE(utm_campaign, p_utm_campaign)
  WHERE id = p_user_id
    -- 冪等性: 同じ分内の二重実行を防止
    AND (last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '1 minute');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3. UTM保存（24時間有効）

LP 到着時に localStorage へ保存（sessionStorage だとタブを閉じると消えるため）：

```javascript
// LP 到着時（index.html など）
function saveUtmData() {
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source');
  const utmCampaign = params.get('utm_campaign');
  const referrer = document.referrer;

  if (utmSource || referrer) {
    const data = {
      utm_source: utmSource,
      utm_campaign: utmCampaign,
      referrer: referrer,
      expires_at: Date.now() + 24 * 60 * 60 * 1000, // 24時間後
    };
    localStorage.setItem('dreamcore_utm', JSON.stringify(data));
  }
}

// ログイン時に取得
function getStoredUtmData() {
  const raw = localStorage.getItem('dreamcore_utm');
  if (!raw) return null;

  const data = JSON.parse(raw);
  if (Date.now() > data.expires_at) {
    localStorage.removeItem('dreamcore_utm');
    return null;
  }
  return data;
}

function clearStoredUtmData() {
  localStorage.removeItem('dreamcore_utm');
}
```

### 3. プロフィール編集時

**取得データ:**
- display_name, username, bio, avatar_url, social_links

**実装場所:** マイページ編集フォーム（既存）

### 4. Country（国）の取得方法

**オプション A: Cloudflare ヘッダー（推奨）**
```javascript
// Cloudflare が自動付与
const country = request.headers.get('CF-IPCountry');
```

**オプション B: IP Geolocation API**
```javascript
// 無料API例
const res = await fetch('https://ipapi.co/json/');
const { country_code } = await res.json();
```

**オプション C: サーバーサイドで取得**
- ログイン時に Express でヘッダーから取得
- `req.headers['cf-ipcountry']` または IP lookup

---

## 移行手順

### Phase 1: スキーマ変更

```sql
-- 1. カラム追加
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- 2. record_login 関数作成
CREATE OR REPLACE FUNCTION record_login(user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.users
  SET
    last_login_at = NOW(),
    login_count = COALESCE(login_count, 0) + 1
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 2: 既存データ移行

```sql
-- user_access から public.users へデータコピー（10件のみ）
UPDATE public.users u
SET
  language = ua.language,
  country = ua.country,
  timezone = ua.timezone,
  referrer = ua.referrer,
  utm_source = ua.utm_source,
  device_type = ua.device_type
FROM user_access ua
WHERE LOWER(u.email) = LOWER(ua.email)
  AND ua.language IS NOT NULL;
```

### Phase 3: フロントエンド実装

1. LP 到着時に UTM / referrer を sessionStorage に保存
2. `auth.js` で初回ログイン検出 → データ送信
3. 毎ログイン時に `record_login` RPC 呼び出し

### Phase 4: user_access の扱い

**ウェイトリスト廃止後:**
- 新規カラム（language等）は使用停止
- テーブル自体は削除 or アーカイブ
- `server/waitlist.js` のルート無効化

---

## データ活用例

### 1. 言語別ユーザー数

```sql
SELECT language, COUNT(*)
FROM public.users
WHERE language IS NOT NULL
GROUP BY language
ORDER BY COUNT(*) DESC;
```

### 2. 国別アクティブユーザー

```sql
SELECT country, COUNT(*)
FROM public.users
WHERE last_login_at > NOW() - INTERVAL '30 days'
GROUP BY country;
```

### 3. UTM 効果測定

```sql
SELECT utm_source, utm_campaign, COUNT(*)
FROM public.users
WHERE utm_source IS NOT NULL
GROUP BY utm_source, utm_campaign;
```

### 4. Brevo 連携

Brevo のコンタクト属性として同期：
- LANGUAGE → メール言語切り替え
- COUNTRY → 地域別キャンペーン
- LAST_LOGIN_AT → 休眠ユーザー検出

---

## 今後の拡張

| データ | 用途 | 優先度 |
|--------|------|--------|
| subscription_tier | 課金プラン | 将来 |
| notification_settings | 通知設定 | 将来 |
| preferred_theme | ダーク/ライト | 将来 |
| onboarding_completed | 初回チュートリアル | 将来 |

---

## まとめ

| Before | After |
|--------|-------|
| auth.users + public.users + user_access | auth.users + public.users |
| データ分散 | public.users に集約 |
| 取得タイミング不明確 | 初回ログイン / 毎ログイン / 編集時 |

**メリット:**
- シンプルなデータ構造
- RLS で自動的に保護
- 分析クエリが書きやすい
- ウェイトリスト廃止が容易
