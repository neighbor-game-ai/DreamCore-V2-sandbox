# LINE式 Push 抑制 - 実装完了報告

**日付:** 2026-02-07
**ステータス:** 実装完了・本番デプロイ済み

---

## 実装概要

LINE のメッセージ通知と同様の「アクティブ閲覧中は Push 通知を抑制する」仕組みを実装。ユーザーがエディタでプロジェクトを閲覧中に、そのプロジェクトの生成完了通知をわざわざ Push で送らないようにする。

### サーバー側 (`server/index.js`)

- `shouldSuppressPush(userId, projectId)` 関数を追加（L1237-1248）
- WebSocket 接続オブジェクトに3つの状態を追跡:
  - `activeProjectId` - 現在閲覧中のプロジェクト ID
  - `visible` - ブラウザタブがフォアグラウンドかどうか
  - `lastSeenAt` - 最終ハートビート時刻
- **抑制条件**: 同一プロジェクトを閲覧中 AND visible === true AND lastSeenAt が 15秒以内

### クライアント側 (`public/app.js`)

- `sendViewState(type, visible)` - viewState / deselectProject メッセージ送信
- `startEditorHeartbeat()` - 10秒間隔の ping で lastSeenAt を維持
- `visibilitychange` イベントハンドラで visible 状態をサーバーに同期

---

## WebSocket メッセージプロトコル

| メッセージ | 方向 | ペイロード | 用途 |
|-----------|------|-----------|------|
| `viewState` | Client → Server | `{ projectId, visible }` | エディタ閲覧状態の通知 |
| `deselectProject` | Client → Server | (なし) | 一覧ページに戻った時 |
| `ping` | Client → Server | (なし) | heartbeat (lastSeenAt 更新) |

---

## CTO レビューで発見・修正した問題

### 1. lastSeenAt 失効リスク (修正済み)

- **問題**: `visibilitychange` イベントだけでは、ユーザーがエディタをアクティブに閲覧中でも 15秒以上イベントが発火しないケースがあり、lastSeenAt が失効して Push が送信されてしまう
- **修正**: エディタ画面で 10秒間隔の heartbeat ping を送信。サーバー側で `ping` 受信時に `activeProjectId` が設定済みなら `lastSeenAt` を更新（L1340-1343）

### 2. Critical: 一覧ページでの誤抑制 (修正済み)

- **問題**: `showListView()` が `deselectProject` をサーバーに送信した後、クライアント側の `this.currentProjectId` を null にしていなかった
- **結果**: `visibilitychange` イベントで古い `projectId` が `viewState` として再送信 → サーバーの `activeProjectId` が再セットされる → ユーザーは一覧ページにいるのに Push が抑制される
- **修正**:
  - `showListView()` で `this.currentProjectId = null` を追加（L848）
  - `sendViewState()` で `currentProjectId` が null の場合は viewState 送信をスキップ

---

## E2E テスト結果

- agent-browser で並列テスト実施（`--session` オプションで独立セッション使用）
- テスト用プロジェクトの AI 生成がテスト時間内に完了しないタイミング問題あり
- **本番ログで動作確認済み**: ユーザー `5b11e8bf` のセッションにて
  - エディタ閲覧中 → `[Notification] Push suppressed` ログ出力を確認
  - 別プロジェクト閲覧中 → Push 正常送信 (`sent=1`) を確認

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/index.js` | `shouldSuppressPush()` 関数追加、viewState / deselectProject / ping ハンドラ追加 |
| `public/app.js` | `sendViewState()` / `startEditorHeartbeat()` 追加、`currentProjectId` null 化修正 |
| `public/create.html` | キャッシュバスター更新 |
| `public/editor.html` | キャッシュバスター更新 |

---

## 技術的な補足

### 抑制判定ロジック (server/index.js L1237-1248)

```javascript
function shouldSuppressPush(userId, projectId) {
  const connections = wsConnections.get(userId);
  if (!connections) return false;
  for (const conn of connections) {
    if (conn.activeProjectId === projectId &&
        conn.visible === true &&
        conn.lastSeenAt && (Date.now() - conn.lastSeenAt) < 15000) {
      return true;
    }
  }
  return false;
}
```

- 複数 WebSocket 接続に対応（複数タブ・デバイス）
- いずれか 1 つの接続でアクティブ閲覧中であれば Push 抑制
- 15秒の閾値は heartbeat (10秒) + マージン (5秒) で設計

### 呼び出し箇所

- 生成成功通知（L2450）
- 生成失敗通知（L2479）
- いずれの場合も、抑制時はログ出力のみで Push は送信しない
- **in-app 通知は常に送信される**（Push のみ抑制）

---

## ステータス

- 全変更コミット・デプロイ済み (GCE)
- Push 抑制: 本番環境で動作確認済み
- 追加対応不要

---

## 追記: PWA インストール修正 (user.html)

**問題**: user.html の `<head>` に `<link rel="manifest">` を含む PWA メタタグが全て欠落。`beforeinstallprompt` が発火せず、Android Chrome でインストールプロンプトが表示されなかった。

**修正**: PWA メタタグブロックを追加。preauth.js は公開ページのため追加せず。

**確認**: デプロイ後、Android Chrome でインストールプロンプト発火を確認。

**再発防止提案**: 主要 HTML の `<head>` 必須タグを CI で静的チェック化（CTO 指示）。
