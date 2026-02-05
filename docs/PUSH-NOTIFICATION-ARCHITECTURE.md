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

## iOS PWA Limitations & Solutions

### Problem 1: `client.navigate()` doesn't work

**Symptom**: `client.navigate(url)` Promise resolves successfully, but the page doesn't actually navigate.

**Root Cause**: iOS PWA has a bug where `navigate()` reports success but doesn't perform the navigation.

**Solution**: Don't rely on `navigate()`. Use alternative methods.

### Problem 2: `clients.openWindow()` doesn't navigate

**Symptom**: `clients.openWindow(url)` returns a WindowClient, but `windowClient.url` is the current page URL, not the target URL.

**Root Cause**: On iOS PWA, `openWindow()` focuses the existing window but doesn't navigate to the specified URL.

**Evidence from logs**:
```json
{
  "phase": "openWindow_result",
  "url": "https://v2.dreamcore.gg/create.html?project=xxx",
  "success": true,
  "clientUrl": "https://v2.dreamcore.gg/"  // Wrong! Should be the target URL
}
```

**Solution**: Use `openWindow()` only to focus the window, then use BroadcastChannel for navigation.

### Problem 3: `postMessage` not received

**Symptom**: SW sends `client.postMessage()`, but the app never receives it.

**Root Cause**: When the PWA is in the background, JavaScript execution is suspended. The message is sent before the PWA wakes up.

**Solution**: Use BroadcastChannel with delays after `openWindow()`.

### Problem 4: BroadcastChannel timing

**Symptom**: BroadcastChannel message sent immediately is not received.

**Root Cause**: The PWA needs time to wake up after `openWindow()` focuses it.

**Solution**: Send multiple broadcast messages with delays:

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
