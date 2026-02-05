# Sandbox プリウォーム機能実装

**日付**: 2026-02-05
**作業者**: Claude Opus 4.5

## 概要

ユーザーがCreateページを開いた時点でModal Sandboxを事前起動し、ゲーム生成時のコールドスタート待ち時間（約10秒）を削減する機能を実装。

## 背景・課題

DreamCoreのゲーム作成において待ち時間が発生する主なボトルネック：

1. **Modal Sandboxコールドスタート**: 初回10-12秒
2. **Gemini/Claude生成**: 10-20秒
3. **フロントエンドUI遅延**: 1-5秒

特にSandboxコールドスタートは、ユーザーがプロンプト入力中に事前起動することで削減可能。

## 実装内容

### 1. Modal側 (`modal/app.py`)

- `prewarm_sandbox` エンドポイント追加
- Sandbox命名を `user-{full_uuid}` に変更（衝突防止）
- `get_legacy_sandbox_name()` で旧形式への互換性維持
- `generate_game` でのSandbox取得を「新→旧→新規作成」の3段階に変更
- bad state時の再生成で `AlreadyExistsError` ハンドリング追加

### 2. Express側 (`server/modalClient.js`)

- `prewarmSandboxByUser(userId)` メソッド追加
- 5分TTLのinMemoryキャッシュで重複防止
- Fire-and-forget（非同期・非ブロッキング）

### 3. WebSocketハンドラ (`server/index.js`)

- WS `init` 完了後にプリウォーム呼び出し

## コードレビュー対応

### Critical（修正済み）
- `user_id[:8]` → `user_id` (フルUUID) に変更
- 8文字では衝突リスクがあり、他ユーザーのデータ漏洩につながる可能性があった

### Warning（修正済み）
- Sandbox再生成時（bad state）の `AlreadyExistsError` ハンドリング追加
- 終了直後で名前がまだ予約中の場合に対応

### 確認済み
- `prewarm_sandbox` は `X-Modal-Secret` で保護されている

## 動作フロー

```
ユーザー: Createページを開く
    ↓
WebSocket: init メッセージ（認証）
    ↓
サーバー: プロジェクト一覧を返却
    ↓
サーバー: prewarm_sandbox 呼び出し（バックグラウンド）
    ↓
Modal: Sandbox作成・初期化（5-10秒、ユーザーには見えない）
    ↓
ユーザー: プロンプト入力・送信（この間にSandbox準備完了）
    ↓
サーバー: generate_game → Sandbox即座に取得（<1秒）
```

## 期待効果

| 指標 | 変更前 | 変更後 |
|------|--------|--------|
| 初回ゲーム生成 | 26秒 | 15秒（-11秒） |
| Sandboxコールドスタート | 10-12秒 | 0秒（プリウォーム済み） |

## テスト結果

- プリウォームエンドポイント: 動作確認済み
- コールドスタート: 約5.7秒で完了
- ウォームスタート: 即座にレスポンス
- 本番デプロイ後: 複数ユーザーで正常動作確認

```
[modalClient] Prewarm warmed: 6b229f33
[modalClient] Prewarm warmed: 003a0c98
[modalClient] Prewarm warmed: 00cd7c5d
...
```

## 変更ファイル

- `/Users/admin/DreamCore-V2-sandbox/modal/app.py`
- `/Users/admin/DreamCore-V2-sandbox/server/modalClient.js`
- `/Users/admin/DreamCore-V2-sandbox/server/index.js`

## コミット履歴

1. `c6cc937` - feat(prewarm): user-based sandbox pre-warming
2. `f61a900` - fix(prewarm): use full UUID for sandbox name (collision prevention)
3. `d77cc8d` - fix(sandbox): add AlreadyExistsError handling for bad state recreation

## 注意事項

- TTLキャッシュはプロセス内のみ（複数インスタンスでは重複の可能性）
- Sandbox idle_timeout=20分で自動終了（長時間放置後はコールドスタート）
- 旧Sandbox命名へのフォールバックは移行期間後に削除予定
