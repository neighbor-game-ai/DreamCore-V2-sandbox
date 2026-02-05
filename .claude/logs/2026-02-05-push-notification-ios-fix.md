# Push Notification iOS PWA Fix - 2026-02-05

## Summary

iOS PWA で通知をタップしてもプロジェクトページに遷移しない問題を解決。

## 問題

1. `client.navigate()` - Promise は resolve するが実際にはナビゲートしない
2. `clients.openWindow()` - ウィンドウをフォーカスするが、指定した URL ではなく現在の URL を返す
3. `postMessage` - PWA がバックグラウンドにある時、JavaScript が停止しているため受信できない
4. `BroadcastChannel` - 即座に送信すると PWA が起動する前にメッセージが失われる

## 解決策

1. `openWindow()` でまず PWA をフォーカス
2. BroadcastChannel で複数回遅延送信（0ms, 100ms, 300ms, 500ms, 1000ms）
3. app.js で BroadcastChannel を受信してナビゲート

## コミット履歴

- `f3a2ed6` - iOS PWA handling 追加（リグレッション発生）
- `916d63a` - デバッグログ追加
- `51bd457` - サーバーサイドログ追加
- `12dce8d` - 詳細なナビゲーションフェーズログ
- `1efc151` - openWindow() のみ使用に変更
- `8d197ea` - openWindow() 結果ログ追加
- `953891e` - BroadcastChannel 導入
- `85b3ddf` - **最終修正**: 遅延付き複数送信

## 発見した iOS PWA の制限

| API | 期待される動作 | 実際の動作 |
|-----|--------------|-----------|
| `client.navigate(url)` | URL に遷移 | Promise は resolve するがナビゲートしない |
| `clients.openWindow(url)` | 新しいウィンドウで URL を開く | 既存ウィンドウをフォーカスするだけ |
| `postMessage` | メッセージを送信 | バックグラウンドでは受信できない |

## 最終的なコード

### sw.js

```javascript
// openWindow() でフォーカス後、BroadcastChannel で複数回送信
await clients.openWindow(absoluteUrl);

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
```

### app.js

```javascript
if ('BroadcastChannel' in window) {
  const channel = new BroadcastChannel('dreamcore-notifications');
  channel.onmessage = (event) => {
    if (event.data?.type === 'NAVIGATE') {
      const url = event.data.url;
      if (url && url !== window.location.href) {
        window.location.href = url;
      }
    }
  };
}
```

## ドキュメント

- `/Users/admin/DreamCore-V2-sandbox/docs/PUSH-NOTIFICATION-ARCHITECTURE.md`

## 学び

1. iOS PWA は独自の制限が多い
2. `navigate()` や `openWindow()` の成功は信用できない
3. 遅延付き複数回送信がロバストな解決策
4. デバッグログをサーバーに送信することで、クライアント側の問題を可視化できる
