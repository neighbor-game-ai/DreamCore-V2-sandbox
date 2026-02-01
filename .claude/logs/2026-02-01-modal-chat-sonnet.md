# Modal chat_sonnet エンドポイント追加

**日付:** 2026-02-01
**作業内容:** analyzeImageDirection を Modal Sonnet 経由に移行

---

## 背景

セキュリティレビュー対応で「本番環境でのローカル CLI 実行禁止」を実装した結果、`analyzeImageDirection()` 関数がエラーを出すようになった。

**エラーログ:**
```
Error: Local CLI execution is not allowed in production. USE_MODAL must be true.
    at spawnClaudeAsync (/home/notef/DreamCore-V2-sandbox/server/claudeRunner.js:206:11)
    at ClaudeRunner.analyzeImageDirection (/home/notef/DreamCore-V2-sandbox/server/claudeRunner.js:584:12)
```

**原因:**
- `analyzeImageDirection()` は画像の向き（左/右/上/下）を判定する関数
- Sonnet モデルが必要（視覚分析のため Haiku では不十分）
- 既存の `chat_haiku` エンドポイントは Haiku モデル固定
- ローカル CLI 実行がフォールバックされていたが、本番では禁止された

---

## 実装内容

### 1. Modal app.py

**追加した関数:**

```python
async def run_sonnet_in_sandbox(prompt: str, timeout_seconds: int = 30) -> str:
    """Run Claude Sonnet in sandbox for complex tasks like image analysis."""
    # Haiku版と同構造、--model sonnet を使用
    claude_cmd = (
        f"ANTHROPIC_BASE_URL={anthropic_base_url} "
        f"cat {prompt_file} | /usr/bin/claude --model sonnet --print --dangerously-skip-permissions 2>&1"
    )
```

**追加したエンドポイント:**

```python
@app.function(...)
@fastapi_app.post("/chat_sonnet")
async def chat_sonnet(request: Request):
    """Chat with Claude Sonnet (for complex tasks like image analysis)."""
    # system_prompt, raw_output パラメータをサポート
    # run_sonnet_in_sandbox() を呼び出し
```

### 2. server/modalClient.js

**追加したメソッド:**

```javascript
async chatSonnet({ message, game_spec = '', conversation_history = [], system_prompt = '', raw_output = false }) {
  const endpoint = getEndpoint(null, this.baseEndpoint, 'chat_sonnet');
  // chat_haiku と同じ構造、エンドポイントのみ異なる
}
```

### 3. server/claudeRunner.js

**analyzeImageDirection() の修正:**

```javascript
async analyzeImageDirection(imagePath, imageName, projectId, userId) {
  // Modal Sonnet を使用（USE_MODAL=true の場合）
  if (config.USE_MODAL) {
    const client = getModalClient();
    if (client) {
      console.log(`[analyzeImageDirection] Using Modal Sonnet for: ${imageName}`);
      const response = await client.chatSonnet({
        message: prompt,
        system_prompt: '画像アセットの向きを分析するアシスタントです...',
        raw_output: true,
      });
      return parseDirectionResult(response.result || '', imageName, originalPrompt);
    }
  }

  // ローカルフォールバック（開発環境のみ）
  if (config.IS_PRODUCTION) {
    throw new Error('Local CLI execution is not allowed in production');
  }
  // ...
}
```

---

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `modal/app.py` | `run_sonnet_in_sandbox()` 関数追加、`chat_sonnet` エンドポイント追加 |
| `server/modalClient.js` | `chatSonnet()` メソッド追加 |
| `server/claudeRunner.js` | `analyzeImageDirection()` を Modal Sonnet 対応に修正 |

---

## デプロイ

1. **git push origin main** - コード反映
2. **modal deploy app.py** - `chat_sonnet` エンドポイント追加
3. **GCE git pull + pm2 restart** - 本番反映

**Modal エンドポイント確認:**
```
├── 🔨 Created web function chat_sonnet =>
│   https://notef-neighbor--dreamcore-chat-sonnet.modal.run
```

---

## 検証結果

**テストプロジェクト:** `019c197a-2a24-74da-a419-b96a3070aaf2`

**ログ確認:**
```
Analyzing image direction for: player.png
No direction in SPEC.md, using AI analysis for: player.png
[analyzeImageDirection] Using Modal Sonnet for: player.png
Analyzing image direction for: enemy.png
No direction in SPEC.md, using AI analysis for: enemy.png
[analyzeImageDirection] Using Modal Sonnet for: enemy.png
```

**結果:**
- ✅ Modal Sonnet が使用されている
- ✅ `Local CLI execution is not allowed in production` エラーなし

---

## 関連する過去の作業

| 日付 | 作業 | 関連 |
|------|------|------|
| 2026-02-01 | セキュリティレビュー対応 | ローカル CLI 禁止の原因 |
| 2026-01-29 | claudeChat Modal Haiku 統合 | chat_haiku の実装パターン |
| 2026-01-29 | API キープロキシ実装 | ANTHROPIC_BASE_URL 経由の安全な API 呼び出し |

---

## 学び

1. **Haiku vs Sonnet の使い分け**
   - Haiku: 軽量タスク（Q&A、サムネイル生成プロンプト）
   - Sonnet: 複雑タスク（画像分析、コード生成）

2. **Modal エンドポイントの追加パターン**
   - `run_*_in_sandbox()` 関数を作成
   - `@fastapi_app.post()` でエンドポイント定義
   - `modalClient.js` にメソッド追加
   - 呼び出し元で `USE_MODAL` 分岐

3. **本番フォールバック禁止の重要性**
   - セキュリティ上、本番では Modal 必須
   - 開発環境のみローカルフォールバック許可
