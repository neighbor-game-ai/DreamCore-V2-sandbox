# Named Sandbox 最適化 (detect_intent/chat_haiku)

**日付:** 2026-02-05
**作業者:** Claude

## 背景

`detect_intent` エンドポイント（「意図を判定中...」の表示時に呼ばれる）が遅い問題。

**原因:** `run_haiku_in_sandbox()` が毎回新しい Sandbox を作成していた（3-10秒の冷起動）

## 実施内容

### 1. Named Sandbox プール実装

3つの warm sandbox を round-robin で再利用する方式を導入:

| 設定 | 値 |
|------|-----|
| プールサイズ | 3 |
| 命名規則 | `dreamcore-claude-{0,1,2}` |
| timeout | 5時間 |
| idle_timeout | 1時間 |

### 2. `get_claude_sandbox()` ヘルパー追加

```python
def get_claude_sandbox(model: str = "haiku") -> tuple[modal.Sandbox, bool]:
    global _claude_sandbox_counter
    pool_idx = _claude_sandbox_counter % CLAUDE_SANDBOX_POOL_SIZE
    _claude_sandbox_counter += 1
    sandbox_name = f"{CLAUDE_SANDBOX_PREFIX}-{pool_idx}"

    try:
        sb = modal.Sandbox.from_name(sandbox_name, create_if_missing=False)
        return sb, False  # warm hit
    except Exception:
        sb = modal.Sandbox.create(name=sandbox_name, ...)
        write_gcp_credentials(sb)
        return sb, True  # cold start
```

### 3. 変更点

| 変更前 | 変更後 |
|--------|--------|
| `Sandbox.create()` 毎回 | `from_name()` で再利用 |
| `sb.terminate()` 毎回 | 削除（再利用のため） |
| echo テスト | 削除（不要なオーバーヘッド） |
| 固定ファイル `/tmp/haiku_prompt.txt` | ユニークファイル `/tmp/haiku_{uuid}.txt` |

### 4. 並行リクエスト対策

複数リクエストが同じ sandbox を使う場合の競合を防ぐため、プロンプトファイルに UUID を付与:

```python
prompt_filename = f"/tmp/haiku_{uuid.uuid4().hex[:8]}.txt"
```

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `modal/app.py` | Named Sandbox プール実装、get_claude_sandbox() 追加 |

## 効果

| 状態 | 応答時間 |
|------|---------|
| 冷起動（初回） | 3-10秒 |
| warm hit（2回目以降） | 即座 |

## コミット

```
0d334ff perf(modal): Named Sandbox pool for detect_intent/chat_haiku
```

## 学び・注意点

- `from_name()` は sandbox が存在しない場合に例外を投げるため、`try/except` でハンドリング
- `idle_timeout` は sandbox がアイドル状態になってから終了するまでの時間
- `timeout` は sandbox の最大寿命
- `terminate()` を呼ばないことで sandbox を再利用可能に
- 並行リクエストでファイル競合が起きないよう UUID でユニークなファイル名を使用
