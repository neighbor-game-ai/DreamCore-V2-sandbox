# エラー分類改善 - 2026-01-29

## 概要

Claude CLI の終了コードやエラータイプをユーザーフレンドリーなメッセージに変換し、トラブルシューティングを容易にする改善を実装。

## 実施内容

### 1. Modal app.py - エラーコード体系の追加

**ファイル:** `/Users/admin/DreamCore-V2-modal/modal/app.py`

- `CLI_ERROR_CODES` 定数追加（exit_code ベース）
  - 0: CLI_SUCCESS
  - 1: CLI_GENERAL_ERROR
  - 124: CLI_TIMEOUT
  - 137: CLI_KILLED
  - 143: CLI_TERMINATED

- `API_ERROR_CODES` 定数追加（API/Sandbox エラー）
  - NETWORK_ERROR
  - AUTH_ERROR
  - RATE_LIMIT
  - API_TIMEOUT
  - SANDBOX_ERROR
  - UNKNOWN_ERROR

- ヘルパー関数追加
  - `get_cli_error_info(exit_code)` - exit_code から構造化エラー情報を取得
  - `get_api_error_info(error_code, detail)` - API エラーコードから構造化エラー情報を取得

- `generate_game` 関数改善
  - 非ゼロ exit_code で構造化エラーイベントを送信
  - 成功時のみ `done` イベントを送信（error と done の排他）

- `generate_gemini` 関数改善
  - HTTP ステータスコード（401/429等）をエラーコードに分類
  - httpx.TimeoutException → API_TIMEOUT
  - httpx.RequestError → NETWORK_ERROR

- テスト用パラメータ `_test_error` 追加
  - timeout, general, sandbox, network, rate_limit をシミュレート可能

### 2. Express サーバー側

**server/jobManager.js:**
- `failJob(jobId, error, errorDetails = {})` - オプションの errorDetails パラメータ追加
- 通知に code, userMessage, recoverable, exitCode を含める

**server/claudeRunner.js:**
- Modal からの `failed` イベントで構造化エラー情報を抽出
- exit_code に基づくエラー分類（ローカル実行時のフォールバック）
- すべての `failJob` 呼び出しを新シグネチャに更新

**server/modalClient.js:**
- `_test_error` パラメータのサポート追加

**server/index.js:**
- `testError` WebSocket メッセージタイプ追加（テスト用）

### 3. フロントエンド

**public/app.js:**
- `failed` ケースで `userMessage`（ユーザーフレンドリー）を優先表示
- `recoverable: true` の場合「もう一度お試しください」を表示
- エラーコードをコンソールにログ出力（デバッグ用）

## エラーメッセージ一覧

| コード | userMessage | recoverable |
|--------|-------------|-------------|
| CLI_TIMEOUT | 生成に時間がかかりすぎました（5分制限） | true |
| CLI_GENERAL_ERROR | 生成中にエラーが発生しました | false |
| CLI_KILLED | 生成がキャンセルされました | true |
| CLI_TERMINATED | 生成が中断されました | true |
| NETWORK_ERROR | ネットワーク接続に問題があります | true |
| AUTH_ERROR | 認証に失敗しました | false |
| RATE_LIMIT | APIの利用制限に達しました | true |
| API_TIMEOUT | APIの応答がタイムアウトしました | true |
| SANDBOX_ERROR | 実行環境の準備に失敗しました | false |

## テスト方法

ブラウザコンソールで以下を実行:

```javascript
// タイムアウトエラー
app.ws.send(JSON.stringify({ type: 'testError', errorType: 'timeout' }));

// 一般エラー
app.ws.send(JSON.stringify({ type: 'testError', errorType: 'general' }));

// ネットワークエラー
app.ws.send(JSON.stringify({ type: 'testError', errorType: 'network' }));

// サンドボックスエラー
app.ws.send(JSON.stringify({ type: 'testError', errorType: 'sandbox' }));

// レート制限エラー
app.ws.send(JSON.stringify({ type: 'testError', errorType: 'rate_limit' }));
```

## テスト結果

全5種類のエラータイプで正常動作を確認:
- ユーザーフレンドリーなメッセージが表示される
- recoverable: true のエラーで「もう一度お試しください」が表示される
- recoverable: false のエラーでは再試行ヒントが表示されない

## 変更ファイル一覧

### Modal (DreamCore-V2-modal)
- `modal/app.py` - エラーコード定数、ヘルパー関数、構造化エラー送信

### Express (DreamCore-V2-sandbox)
- `server/jobManager.js` - failJob に errorDetails パラメータ追加
- `server/claudeRunner.js` - 構造化エラー情報の抽出と伝達
- `server/modalClient.js` - _test_error パラメータ対応
- `server/index.js` - testError WebSocket メッセージタイプ追加
- `public/app.js` - userMessage 優先表示、recoverable で再試行ヒント

## コミット

- `c0d20f5` - feat: エラー分類改善 - 構造化エラーとユーザーフレンドリーメッセージ
- `7523c34` - feat: テストエラー機能追加（エラー分類のテスト用）
- `d30e7c3` - fix: testError の createJob 引数を修正

## デプロイ

- Modal: `modal deploy modal/app.py` ✅
- GCE: `pm2 restart dreamcore-sandbox` ✅
