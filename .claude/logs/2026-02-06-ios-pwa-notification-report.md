# iOS PWA プッシュ通知ナビゲーション問題 報告書

**日付**: 2026-02-06
**ステータス**: 調査中

---

## 1. 問題概要

iOS PWA でプッシュ通知をタップしても、通知に含まれるプロジェクトページ (`/project/{id}`) に遷移しない。

### 期待する動作
1. ユーザーがゲーム作成を開始
2. 生成完了時にプッシュ通知を受信
3. 通知をタップ → `/project/{projectId}` に遷移

### 実際の動作
1. 通知は正常に受信される
2. 通知をタップすると PWA は開く
3. しかし `start_url` (`/create.html`) が開き、プロジェクトページには遷移しない

---

## 2. iOS PWA の既知の制限

| API | 期待される動作 | iOS PWA での実際の動作 |
|-----|---------------|----------------------|
| `client.navigate(url)` | 指定 URL に遷移 | Promise は resolve するが遷移しない |
| `clients.openWindow(url)` | 指定 URL でウィンドウを開く | 既存ウィンドウをフォーカスするだけ（URL 無視） |
| `postMessage` | ページにメッセージ送信 | バックグラウンドでは JS 停止のため受信不可 |
| `BroadcastChannel` | 複数コンテキスト間通信 | 同上、受信不可 |

**結論**: iOS PWA がバックグラウンドにある時、JavaScript は完全に停止しており、Service Worker からのメッセージを受信できない。

---

## 3. 現在の実装アプローチ

### 3.1 方針: IndexedDB + visibilitychange

1. **Service Worker (通知タップ時)**:
   - 遷移先 URL を IndexedDB に保存
   - `clients.openWindow()` で PWA をフォーカス

2. **App (PWA が visible になった時)**:
   - `visibilitychange` イベントで IndexedDB をチェック
   - 保留中の URL があれば遷移

### 3.2 現在のステータス

| フェーズ | 状態 | 備考 |
|---------|------|------|
| SW: IndexedDB に保存 | ✅ 成功 | `stored_in_indexeddb` ログ確認済み |
| App: IndexedDB を読み取り | ❓ 不明 | `app_check_start` ログが出ていない |
| App: 遷移実行 | ❌ 失敗 | 遷移しない |

---

## 4. 該当コード

### 4.1 Service Worker (`public/sw.js`)

```javascript
const SW_VERSION = '2026.02.05.p';
const CACHE_NAME = 'dreamcore-v15';

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click, version:', SW_VERSION, 'action:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Determine URL based on notification data
  const notificationData = event.notification.data || {};
  let targetUrl = '/notifications.html';

  if (notificationData.url) {
    targetUrl = notificationData.url;
  } else if (notificationData.projectId) {
    targetUrl = `/project/${notificationData.projectId}`;
  }

  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  // Debug: Send computed values to server
  fetch('/api/push/debug-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: SW_VERSION,
      rawDataUrl: notificationData.url,
      rawDataProjectId: notificationData.projectId,
      targetUrl: targetUrl,
      absoluteUrl: absoluteUrl,
      origin: self.location.origin
    })
  }).catch(() => {});

  // iOS PWA workaround: Store URL in IndexedDB
  event.waitUntil(
    (async () => {
      try {
        await storeNavigationUrl(absoluteUrl);

        fetch('/api/push/debug-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'stored_in_indexeddb', url: absoluteUrl })
        }).catch(() => {});

        // Focus the PWA window
        if (clients.openWindow) {
          await clients.openWindow(absoluteUrl);
        }
      } catch (err) {
        fetch('/api/push/debug-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'error', error: err.message })
        }).catch(() => {});
      }
    })()
  );
});

// Store navigation URL in IndexedDB
function storeNavigationUrl(url) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dreamcore-navigation', 1);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending');
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('pending', 'readwrite');
      const store = tx.objectStore('pending');
      const putRequest = store.put({ url: url, timestamp: Date.now() }, 'navigation');

      putRequest.onerror = () => reject(putRequest.error);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
```

### 4.2 App (`public/app.js`)

```javascript
// setupErrorListeners() 内で呼び出し
setupErrorListeners() {
  // ... 他の初期化 ...

  // Check for pending navigation from notification click (iOS PWA workaround)
  this.checkPendingNavigation();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      this.checkPendingNavigation();
    }
  });
}

// Check for pending navigation URL from notification click (iOS PWA workaround)
async checkPendingNavigation() {
  // Debug: log that function was called
  fetch('/api/push/debug-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase: 'app_check_start', currentUrl: window.location.href })
  }).catch(() => {});

  try {
    const request = indexedDB.open('dreamcore-navigation', 1);

    request.onerror = () => {
      fetch('/api/push/debug-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'app_idb_error', error: request.error?.message })
      }).catch(() => {});
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending');
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('pending', 'readwrite');
      const store = tx.objectStore('pending');
      const getRequest = store.get('navigation');

      getRequest.onerror = () => {
        fetch('/api/push/debug-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'app_get_error', error: getRequest.error?.message })
        }).catch(() => {});
      };

      getRequest.onsuccess = () => {
        const data = getRequest.result;
        fetch('/api/push/debug-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'app_idb_read', hasData: !!data, data: data || null })
        }).catch(() => {});

        if (data && data.url) {
          const age = Date.now() - data.timestamp;
          if (age < 30000 && data.url !== window.location.href) {
            console.log('[App] Found pending navigation:', data.url);
            fetch('/api/push/debug-click', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phase: 'app_found_pending', url: data.url, age })
            }).catch(() => {});

            store.delete('navigation');
            window.location.href = data.url;
          } else {
            fetch('/api/push/debug-click', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phase: 'app_skip_navigation', age, sameUrl: data.url === window.location.href })
            }).catch(() => {});
            store.delete('navigation');
          }
        }
      };
    };
  } catch (err) {
    console.error('[App] Error checking pending navigation:', err);
    fetch('/api/push/debug-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'app_error', error: err.message })
    }).catch(() => {});
  }
}
```

### 4.3 Manifest (`public/manifest.json`)

```json
{
  "name": "DreamCore - Create Games by Chatting",
  "short_name": "DreamCore",
  "start_url": "/create.html",
  "id": "/create.html",
  "scope": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#FF3B30"
}
```

---

## 5. サーバーログ（実際のテスト結果）

```
[Push Debug Click] SW notification data: {"version":"2026.02.05.p","rawDataUrl":"/project/019c3019-0a06-7042-8c4b-f257391805fa","rawDataProjectId":"019c3019-0a06-7042-8c4b-f257391805fa","targetUrl":"/project/019c3019-0a06-7042-8c4b-f257391805fa","absoluteUrl":"https://v2.dreamcore.gg/project/019c3019-0a06-7042-8c4b-f257391805fa","origin":"https://v2.dreamcore.gg"}

[Push Debug Click] SW notification data: {"phase":"stored_in_indexeddb","url":"https://v2.dreamcore.gg/project/019c3019-0a06-7042-8c4b-f257391805fa"}
```

**観察**:
- `stored_in_indexeddb` は出ている → SW 側は正常動作
- `app_check_start` が出ていない → App 側の `checkPendingNavigation()` が呼ばれていない可能性

---

## 6. 疑問点・調査が必要な箇所

### 6.1 App 側が動いていない理由の候補

1. **PWA が `start_url` から再起動している?**
   - iOS は通知タップ時に PWA を完全に再起動する可能性
   - その場合、`/create.html` が読み込まれ、`app.js` も読み込まれるはず

2. **`app.js` がキャッシュされている?**
   - Service Worker は `app.js` をキャッシュしていない（icons と manifest のみ）
   - ブラウザの HTTP キャッシュの可能性

3. **`setupErrorListeners()` が呼ばれていない?**
   - 認証チェックやリダイレクトで早期 return している可能性

4. **IndexedDB が異なるスコープ?**
   - SW と App で異なる IndexedDB にアクセスしている可能性（通常は同一オリジンで共有）

### 6.2 確認したいこと

1. iOS Safari で IndexedDB が Service Worker と Web Page 間で共有されるか
2. 通知タップ時の PWA 起動シーケンス（どのページが最初に読み込まれるか）
3. `visibilitychange` イベントが iOS PWA で正常に発火するか

---

## 7. 参考情報

### 7.1 環境

- iOS バージョン: (要確認、16.4+ で Web Push 対応)
- PWA インストール: ホーム画面に追加済み
- Service Worker バージョン: `2026.02.05.p`
- キャッシュバージョン: `dreamcore-v15`

### 7.2 関連ドキュメント

- `/Users/admin/DreamCore-V2-sandbox/docs/PUSH-NOTIFICATION-ARCHITECTURE.md`
- `/Users/admin/DreamCore-V2-sandbox/.claude/logs/2026-02-05-push-notification-ios-fix.md`

---

## 8. 次のステップ

1. デバッグログ付きの `app.js` でテストし、`app_check_start` が出るか確認
2. 出ない場合、`app.js` の読み込み自体を確認（console.log を冒頭に追加）
3. IndexedDB のスコープ問題を調査
