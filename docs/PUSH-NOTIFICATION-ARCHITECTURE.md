# Push Notification Architecture

## Overview

DreamCore uses Web Push Notifications to notify users when game generation is complete. This document covers the architecture, deep link implementation, known limitations, and **PWA best practices discovered through testing** (2026-02-06).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Server Side                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  jobManager.js ──(jobCompleted)──> notificationService.js        │
│                                           │                      │
│                                           ▼                      │
│                                    pushService.js                │
│                                    (web-push library)            │
│                                           │                      │
│                                           ▼                      │
│                                    Push Service (FCM/APNs)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Client Side                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Push Service ──(push event)──> sw.js (Service Worker)           │
│                                    │                             │
│                                    ▼                             │
│                           showNotification()                     │
│                                    │                             │
│                         (user taps notification)                 │
│                                    │                             │
│                                    ▼                             │
│                         notificationclick event                  │
│                                    │                             │
│                    ┌───────────────┼───────────────┐             │
│                    ▼               ▼               ▼             │
│              openWindow()   IndexedDB store   BroadcastChannel   │
│              (Android OK)   (iOS fallback)    (iOS fallback)     │
│                    │                                             │
│                    ▼                                             │
│              Target page loads                                   │
│              (auth check → render)                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### Server Side

| File | Purpose |
|------|---------|
| `server/jobManager.js` | Emits `jobCompleted` event when game generation finishes |
| `server/notificationService.js` | Creates in-app notification and triggers push |
| `server/pushService.js` | Sends push notification via web-push library |
| `server/routes/pushApi.js` | API endpoints for subscription management |

### Client Side

| File | Purpose |
|------|---------|
| `public/sw.js` | Service Worker - handles push and notification click |
| `public/push.js` | Push subscription management (`DreamCorePush`) |
| `public/app.js` | Authentication, WebSocket, project routing |
| `public/auth.js` | Supabase Auth wrapper (`DreamCoreAuth`) |

## Push Payload Structure

```javascript
{
  title: "ゲーム完成！",
  body: "タップしてプロジェクトを開く",
  icon: "/icons/icon-192.png",
  badge: "/icons/icon-192.png",
  tag: "notification-{id}",
  data: {
    url: "/project/{projectId}",   // Clean URL (no .html)
    projectId: "{projectId}",
    type: "project",               // "project" | "system"
    timestamp: 1234567890
  }
}
```

### 対応している遷移先 URL

| URL パターン | 遷移先 | テスト状況 |
|-------------|--------|-----------|
| `/project/{id}` | プロジェクトエディタ | ✅ Android, ✅ iOS |
| `/game/{public_id}` | 公開ゲームページ | ✅ Android, ✅ iOS |
| `/notifications` | 通知一覧 | ✅ Android, ✅ iOS |
| `/discover` | ディスカバーページ | ✅ Android, ✅ iOS |
| `/mypage` | マイページ | ✅ Android, ✅ iOS |
| `/create` | プロジェクト一覧 | ✅ Android, ✅ iOS |

---

## PWA Deep Link: 認証の落とし穴と解決策

### 問題

通知タップで `clients.openWindow(url)` が新しいタブ/ウィンドウを開く。この新しいコンテキストでは **sessionStorage が空** のため、ページの認証チェックが失敗してログイン画面にリダイレクトされる。

### 根本原因: 認証キャッシュの2層構造

```
sessionStorage (per-tab, 5min TTL)  ← 通知タップの新タブでは空
         ↓ fallback
localStorage (Supabase SDK managed)  ← 有効なセッションがある
         ↓ fallback
Supabase Auth API (async)            ← トークンリフレッシュ
```

### 失敗パターンと修正

#### 失敗1: 早期認証チェック（HTML `<head>` の同期スクリプト）

```javascript
// ❌ BEFORE: sessionStorage のみチェック → 通知タップで即リダイレクト
var cached = sessionStorage.getItem('dreamcore_session_cache');
if (!cached) {
  window.location.href = '/';  // ← 新タブでは必ずここに来る
  return;
}

// ✅ AFTER: localStorage (Supabase session) もフォールバック確認
var cached = sessionStorage.getItem('dreamcore_session_cache');
var supabaseSession = null;
for (var i = 0; i < localStorage.length; i++) {
  var key = localStorage.key(i);
  if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
    supabaseSession = localStorage.getItem(key);
    break;
  }
}
if (!cached && !supabaseSession) { window.location.href = '/login'; return; }
if (!cached && supabaseSession) { return; } // auth.js に委譲
```

**適用対象:** `create.html`, `editor.html`, `mypage.html`, `discover.html`, `notifications.html`

#### 失敗2: app.js の `getSessionSync()` が sessionStorage のみ参照

```javascript
// ❌ BEFORE: sessionStorage キャッシュがないと即リダイレクト
const cachedSession = DreamCoreAuth.getSessionSync(); // sessionStorage only
if (!cachedSession) {
  // OAuth チェック後に...
  window.location.href = '/';  // ← 通知ディープリンクでここに来る
  return;
}

// ✅ AFTER: async で getSession() を試行（SDK が localStorage から復元）
if (!cachedSession) {
  const session = await DreamCoreAuth.getSession(); // localStorage + SDK
  if (!session) {
    window.location.href = '/login';
    return;
  }
  // 正常にセッション復元 → ページ表示
}
```

#### 失敗3: リダイレクト先が `/`（ログイン画面が一瞬見える）

```javascript
// ❌ BEFORE: '/' はログインページだが、index.html が一瞬レンダリングされる
window.location.href = '/';

// ✅ AFTER: クリーンURL統一（ユーザーが見ても違和感なし）
window.location.href = '/login';
```

#### 失敗4: ブラウザキャッシュで古い JS が配信される

```html
<!-- ❌ BEFORE: キャッシュバスターなし → 古い app.js が使われ続ける -->
<script src="/app.js" defer></script>

<!-- ✅ AFTER: バージョン付き → デプロイ後に新しい JS が確実に読まれる -->
<script src="/app.js?v=20260206b" defer></script>
```

### ベストプラクティスまとめ

| # | ルール | 理由 |
|---|--------|------|
| 1 | **認証チェックは必ず localStorage もフォールバック確認** | 通知ディープリンクは新タブで開くため sessionStorage が空 |
| 2 | **`getSessionSync()` 失敗時は `await getSession()` を試す** | SDK が localStorage からセッションを復元できる |
| 3 | **ログインリダイレクトは `/login` に統一** | クリーンURL方針 + ユーザー体験の一貫性 |
| 4 | **JS ファイルにキャッシュバスターを付ける** | 認証ロジック変更後に古い JS が使われると修正が反映されない |
| 5 | **全ページの認証チェックを統一パターンにする** | ページごとに異なるパターンだと修正漏れが発生する |
| 6 | **テスト通知にはわかりやすいプロジェクト名を使う** | 「新しいゲーム」では確認不能 |

---

## iOS PWA Limitations (Known Issue)

**Status**: Accepted as platform limitation (2026-02-06)

iOS PWA では通知タップ時のナビゲーションに制限があります。

### 試した方法と結果

| API | 結果 |
|-----|------|
| `client.navigate(url)` | Promise は resolve するが遷移しない |
| `clients.openWindow(url)` | PWA をフォーカスするが URL は無視される |
| `postMessage` | バックグラウンドでは JS 停止のため受信不可 |
| `BroadcastChannel` | 同上 |
| `IndexedDB` + `visibilitychange` | IndexedDB 保存は成功するが、アプリ側で読み取れない |

### 現在の動作

- **Android**: 通知タップで直接ターゲットページに遷移する ✅
- **iOS (Chrome/Safari)**: 通知タップで直接ターゲットページに遷移する ✅
- **iOS PWA**: 通知タップで PWA が開くが、`start_url` (`/create`) が表示される（制限）

### 実装

IndexedDB への URL 保存は残しています（将来の iOS アップデートで動作する可能性があるため）。

```javascript
// sw.js - 通知タップ時
await storeNavigationUrl(absoluteUrl);  // iOS 用フォールバック（現状動作せず）
await clients.openWindow(absoluteUrl);   // Android/iOS ブラウザで動作
```

---

## E2E テスト結果 (2026-02-06)

### テスト環境

| デバイス | OS | ブラウザ | Push方式 |
|---------|-----|---------|---------|
| Android | Android 10 | Chrome 144 | FCM |
| iPhone | iOS 18.5 | Safari (PWA) | Apple Push |
| iPhone | iOS 18.5 | Safari (ブラウザ) | FCM |

### テスト結果

| テスト | URL | Android | iOS |
|--------|-----|---------|-----|
| 通知一覧 | `/notifications` | ✅ | ✅ |
| Discover | `/discover` | ✅ | ✅ |
| マイページ | `/mypage` | ✅ | ✅ |
| Create | `/create` | ✅ | ✅ |
| プロジェクト | `/project/{id}` | ✅ | ✅ |
| ゲーム | `/game/{public_id}` | ✅ | ✅ |

### テストスクリプト

```bash
# 特定ユーザーにテスト通知を送信
node test-push-notef.js

# カスタム通知（任意のURLに飛ばす）
node -e "
require('dotenv').config();
const pushService = require('./server/pushService');
(async () => {
  const result = await pushService.sendPushToUser('USER_ID', {
    title: 'テスト通知',
    body: 'タップして遷移先を確認',
    url: '/project/PROJECT_ID',
    projectId: 'PROJECT_ID',
    type: 'project'
  });
  console.log(result);
  process.exit(0);
})();
"
```

---

## Database Schema

### push_subscriptions

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, endpoint)
);
```

### notifications

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'project', 'system', 'social'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  job_id UUID,  -- For duplicate prevention
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id)  -- Prevent duplicate notifications per job
);
```

## Environment Variables

```
VAPID_PUBLIC_KEY=xxx
VAPID_PRIVATE_KEY=xxx
VAPID_SUBJECT=mailto:support@dreamcore.gg
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 通知タップ → ログイン画面 | `app.js` が sessionStorage のみ参照 | `await getSession()` フォールバック追加 |
| 修正デプロイ後も旧動作 | ブラウザキャッシュ | JS ファイルにキャッシュバスター追加 |
| 通知は届くがページ遷移しない | iOS PWA 制限 | 既知の制限、`clients.openWindow` で部分対応 |
| sessionStorage TTL切れでリダイレクト | 早期認証チェックの不備 | localStorage フォールバック追加 |
| 通知テストで遷移先が不明 | プロジェクト名が「新しいゲーム」 | 名前付きプロジェクトIDを使用 |

## Debugging Tips

1. **Check SW version**: Look for `[SW] Version: xxx` in server logs
2. **Check payload**: Look for `[Push] Full payload:` in server logs
3. **Check click handling**: Look for `[Push Debug Click]` in server logs
4. **Force SW update**: Delete PWA, clear site data, reinstall
5. **Check subscriptions**: Query `push_subscriptions` table for user's devices
6. **Test with identifiable project**: Use a project with a unique name, not "New Game"

## References

- [Web Push Protocol](https://tools.ietf.org/html/rfc8030)
- [VAPID](https://tools.ietf.org/html/rfc8292)
- [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [Service Worker Clients API](https://developer.mozilla.org/en-US/docs/Web/API/Clients)
