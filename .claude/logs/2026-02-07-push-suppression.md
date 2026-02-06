# Push 抑制 & UI 改善 (2026-02-06~07)

## 概要

LINE式のPush通知抑制機能を実装。エディタ閲覧中はPush通知を抑制し、アプリ内通知のみ配信する。
併せて Create ページの UI 改善（ページネーション、ボタン整理、バグ修正）を実施。

## 実施内容

### 1. Create ページ UI 改善

- `notifications-btn` と `sign-out-btn` をヘッダーから削除 (`create.html`)
- プロジェクトグリッドに20件/ページのページネーション追加 (`app.js` `renderProjectGrid()`)
- ページネーションがボトムナビに隠れる問題を修正 (`margin-bottom: 60px`)
- 言語セレクタのドロップダウンが反応しない問題を修正 (`.list-header-right` の `overflow:hidden` 削除)
- ゴミ箱アイコンが表示されない問題を修正 (`button` タグの閉じ `>` 漏れ)

### 2. User ページ改善

- 言語セレクタの HTML/JS を削除
- `mypage-header` を一旦削除 → ユーザー要望で復元

### 3. LINE式 Push 通知抑制 (メイン機能)

#### サーバー側 (`server/index.js`)

- `shouldSuppressPush(userId, projectId)` 関数追加
  - `wsConnections` から同一ユーザー・同一プロジェクトの接続を検索
  - `activeProjectId` 一致 + `visible === true` + `lastSeenAt` 15秒以内 → 抑制
- `selectProject` ハンドラ: `ws.activeProjectId`, `ws.visible`, `ws.lastSeenAt` を設定
- `deselectProject` ハンドラ: `ws.activeProjectId = null`
- `viewState` ハンドラ: `activeProjectId`, `visible`, `lastSeenAt` を更新
- `ping` ハンドラ: `ws.lastSeenAt` を更新 (heartbeat 対応)
- `jobCompleted` / `jobFailed`: `shouldSuppressPush()` チェック → `sendPush: !suppressPush`

#### クライアント側 (`public/app.js`)

- `sendViewState(type, visible)`: `viewState` / `deselectProject` メッセージ送信
- `startEditorHeartbeat()`: 10秒間隔で `ping` 送信 (`visible` 時のみ)
- `stopEditorHeartbeat()`: heartbeat 停止
- `showListView()`: `deselectProject` 送信 + heartbeat 停止 + `currentProjectId = null`
- `showEditorView()`: heartbeat 開始
- `visibilitychange` ハンドラ: `viewState` を送信

### 4. CTO レビュー対応

#### Issue 1: lastSeenAt 失効 (修正済み)

- **問題**: 長い生成中に `visibilitychange` が発火しないと `lastSeenAt` が失効（15秒閾値）
- **修正**: エディタ heartbeat 追加（10秒間隔で `ping` 送信）+ サーバー `ping` 受信で `lastSeenAt` 更新

#### Issue 2: 一覧ページでの誤抑制 (Critical, 修正済み)

- **問題**: `showListView()` が `currentProjectId` を `null` にしていなかった
- **結果**: `visibilitychange` で古い `projectId` が再送 → サーバーで `activeProjectId` が再セットされる
- **修正**: `currentProjectId = null` を追加 + `sendViewState()` にガード条件追加

### 5. E2E テスト

- agent-browser で並列テスト (`--session` フラグで独立セッション)
- Test A: エディタに滞在 → 生成が20分以内に未完了
- Test B: 生成後 `/create` に移動 → 4分待機
- 本番ログでユーザー `5b11e8bf` の抑制動作を確認

### 6. デプロイ

- 全変更を GCE にデプロイ済み
- PM2 restart 完了、online 確認

### 7. PWA インストール修正 (user.html)

- 調査: user.html に manifest.json リンクと PWA メタタグが全て欠落していた
- 原因: beforeinstallprompt が発火せず、インストールプロンプトが表示されない
- 修正: PWA メタタグブロック（manifest, theme-color, apple-touch-icon, apple-mobile-web-app-*）を追加
- preauth.js は意図的に追加せず（公開プロフィールページのため未ログインユーザーも閲覧可能にする必要あり）
- デプロイ後、Android Chrome でインストールプロンプト発火を確認

## 変更ファイル一覧

| ファイル | 変更種別 |
|----------|----------|
| `server/index.js` | `shouldSuppressPush`, WS ハンドラ追加 |
| `public/app.js` | `sendViewState`, heartbeat, pagination, UI修正 |
| `public/create.html` | ボタン削除, キャッシュバスター |
| `public/editor.html` | キャッシュバスター |
| `public/style.css` | pagination スタイル, overflow修正 |
| `public/user.html` | 言語セレクタ削除, PWA メタタグ追加, キャッシュバスター更新 |

## 学び・注意点

- **agent-browser E2E テスト**: 生成時間のばらつきが大きく、タイムアウト制御が難しい
- **visibilitychange は状態管理と密結合**: ステート変更箇所を漏れなく追う必要がある（`currentProjectId` の null 化忘れが Critical バグになった）
- **キャッシュバスター更新忘れは頻出バグ**: CSS/JS 変更時に必ずセットで更新すること
- **heartbeat パターン**: `visibilitychange` だけでは不十分な場合、定期的な `ping` で補完するのが有効
