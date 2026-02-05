# Push Notification Architecture

## Overview

DreamCore uses Web Push Notifications to notify users when game generation is complete. This document covers the architecture, known limitations, and solutions discovered during implementation.

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
│              openWindow()   BroadcastChannel   postMessage       │
│                    │               │               │             │
│                    └───────────────┼───────────────┘             │
│                                    ▼                             │
│                              app.js                              │
│                         window.location.href                     │
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
| `public/push.js` | Push subscription management |
| `public/app.js` | BroadcastChannel listener for navigation |

## Push Payload Structure

```javascript
{
  title: "Project Name",
  body: "AI response message",
  icon: "/icons/icon-192.png",
  badge: "/icons/icon-192.png",
  tag: "notification-{id}",
  data: {
    url: "/create.html?project={projectId}",
    projectId: "{projectId}",
    type: "project",
    timestamp: 1234567890
  }
}
```

## iOS PWA Limitations (Known Issue)

**Status**: Accepted as platform limitation (2026-02-06)

iOS PWA では通知タップ時にプロジェクトページへの遷移ができません。これは iOS の制限によるもので、現時点では解決策がありません。

### 試した方法と結果

| API | 結果 |
|-----|------|
| `client.navigate(url)` | Promise は resolve するが遷移しない |
| `clients.openWindow(url)` | PWA をフォーカスするが URL は無視される |
| `postMessage` | バックグラウンドでは JS 停止のため受信不可 |
| `BroadcastChannel` | 同上 |
| `IndexedDB` + `visibilitychange` | IndexedDB 保存は成功するが、アプリ側で読み取れない |

### 現在の動作

- **iOS**: 通知タップで PWA が開くが、`start_url` (`/create.html`) が表示される
- **Android**: 通知タップで直接プロジェクトページに遷移する

### 実装

IndexedDB への URL 保存は残しています（将来の iOS アップデートで動作する可能性があるため）。

```javascript
// sw.js - 通知タップ時
await storeNavigationUrl(absoluteUrl);  // iOS 用フォールバック
await clients.openWindow(absoluteUrl);   // Android で動作

// app.js - visibilitychange 時
checkPendingNavigation();  // IndexedDB をチェックして遷移（iOS では動作しない）
```

### 参考: 過去の試行 (BroadcastChannel)

```javascript
// First, focus the PWA
await clients.openWindow(absoluteUrl);

// Send messages with delays
sendBroadcast();           // Immediate
setTimeout(sendBroadcast, 100);   // 100ms
setTimeout(sendBroadcast, 300);   // 300ms
setTimeout(sendBroadcast, 500);   // 500ms
setTimeout(sendBroadcast, 1000);  // 1s
```

## Final Working Solution

### Service Worker (sw.js)

```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const notificationData = event.notification.data || {};
  let targetUrl = '/notifications.html';

  if (notificationData.url) {
    targetUrl = notificationData.url;
  } else if (notificationData.projectId) {
    targetUrl = `/create.html?project=${notificationData.projectId}`;
  }

  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      // Focus the PWA first
      if (clients.openWindow) {
        await clients.openWindow(absoluteUrl);
      }

      // Send BroadcastChannel messages with delays
      const sendBroadcast = () => {
        const channel = new BroadcastChannel('dreamcore-notifications');
        channel.postMessage({ type: 'NAVIGATE', url: absoluteUrl });
        channel.close();
      };

      sendBroadcast();
      setTimeout(sendBroadcast, 100);
      setTimeout(sendBroadcast, 300);
      setTimeout(sendBroadcast, 500);
      setTimeout(sendBroadcast, 1000);
    })()
  );
});
```

### App (app.js)

```javascript
if ('BroadcastChannel' in window) {
  const channel = new BroadcastChannel('dreamcore-notifications');
  channel.onmessage = (event) => {
    if (event.data && event.data.type === 'NAVIGATE') {
      const url = event.data.url;
      if (url && url !== window.location.href) {
        window.location.href = url;
      }
    }
  };
}
```

## Android Behavior

On Android, the behavior is different:

1. **PWA running**: `openWindow()` focuses the existing PWA window
2. **PWA not running**: `openWindow()` may open Chrome instead of the PWA (platform limitation)

The BroadcastChannel solution works for both cases when the PWA is running.

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

## Testing

### Debug Endpoints

- `POST /api/push/debug` - Log client push state
- `POST /api/push/debug-click` - Log notification click data from SW

### Test Flow

1. Subscribe to push notifications
2. Create a game and wait for completion
3. Tap the notification
4. Verify navigation to project page

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Notification not received | SW not registered | Reinstall PWA |
| Wrong page opens | Old SW cached | Bump cache version, reinstall PWA |
| Navigation doesn't work | iOS PWA limitation | Use BroadcastChannel with delays |
| Opens Chrome instead of PWA | Android limitation | Document as known limitation |

## Debugging Tips

1. **Check SW version**: Look for `[SW] Version: xxx` in server logs
2. **Check payload**: Look for `[Push] Full payload:` in server logs
3. **Check click handling**: Look for `[Push Debug Click]` in server logs
4. **Force SW update**: Delete PWA, clear site data, reinstall

## References

- [Web Push Protocol](https://tools.ietf.org/html/rfc8030)
- [VAPID](https://tools.ietf.org/html/rfc8292)
- [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [Service Worker Clients API](https://developer.mozilla.org/en-US/docs/Web/API/Clients)
