# PROXY統合とSecret化（Modal統合Phase 2）

**日付:** 2026-01-29
**作業者:** Claude

## 背景

Modal Sandbox の外部通信を制限するため、GCE 上の Squid プロキシを経由させる仕組みを実装。当初は Sandbox のみ PROXY 経由だったが、運用一貫性と監査性のため Modal Function 内の httpx 通信も PROXY 経由に統一した。

## 実施内容

### 1. プロキシ認証情報の Secret 化

ハードコードされていたプロキシ認証情報を Modal Secret に移行:

```bash
modal secret create dreamcore-proxy \
  PROXY_HOST=35.200.79.157 \
  PROXY_PORT=3128 \
  PROXY_USER=dreamcore_proxy \
  PROXY_PASS=<password>
```

**app.py の変更:**
- `SECRET_PROXY = "dreamcore-proxy"` 追加
- `ENV_PROXY_HOST`, `ENV_PROXY_PORT`, `ENV_PROXY_USER`, `ENV_PROXY_PASS` 定数追加
- `get_proxy_url()` ヘルパー関数追加（環境変数から URL を構築）
- `proxy_secret = modal.Secret.from_name(...)` 追加
- ハードコードの `PROXY_URL` 削除

### 2. 全 Sandbox.create に PROXY 設定

4箇所の `Sandbox.create` すべてに環境変数経由で PROXY を設定:

| 関数 | 用途 |
|------|------|
| `run_in_sandbox` | 汎用 Sandbox 実行 |
| `generate_game` (2箇所) | Claude CLI 実行（新規作成・リクリエート） |
| `run_haiku_in_sandbox` | Haiku モデルでの軽量タスク |

### 3. Modal Function 内の httpx も PROXY 経由に統一

`generate_gemini` 関数内の Gemini API 呼び出しを PROXY 経由に変更:

```python
# 環境変数経由で設定（httpx が自動で読み取る）
os.environ["HTTP_PROXY"] = proxy_url
os.environ["HTTPS_PROXY"] = proxy_url
```

`generate_image.py` subprocess 呼び出し時も環境変数を渡す:

```python
env={
    **os.environ,
    "GEMINI_API_KEY": api_key,
    "HTTP_PROXY": proxy_url,
    "HTTPS_PROXY": proxy_url,
}
```

### 4. @app.function デコレーターに proxy_secret 追加

以下の関数に `proxy_secret` を追加:
- `generate_game`
- `detect_intent`
- `detect_skills`
- `generate_gemini`

## 発見した問題と対応

### 問題1: httpx.Client(proxy=...) が動作しない

**現象:** Modal Function 内で `httpx.Client(timeout=120.0, proxy=proxy_url)` を使用すると、Gemini API への接続がタイムアウト

**原因:** httpx の `proxy` パラメータの動作が環境依存で不安定

**対応:** 環境変数 `HTTP_PROXY`/`HTTPS_PROXY` を `os.environ` に設定し、`httpx.Client()` に自動で読み取らせる方式に変更

```python
# NG: パラメータ指定
client = httpx.Client(timeout=120.0, proxy=proxy_url)

# OK: 環境変数経由
os.environ["HTTP_PROXY"] = proxy_url
os.environ["HTTPS_PROXY"] = proxy_url
client = httpx.Client(timeout=120.0)
```

### 問題2: GCE ファイアウォール疑惑

**現象:** Modal Function → GCE プロキシへの接続がタイムアウト

**調査結果:**
- ファイアウォールルール `allow-squid-proxy` は `0.0.0.0/0` で全 IP 許可済み
- Squid は `*:3128` で全インターフェース LISTEN
- ローカルからの接続は成功

**結論:** ファイアウォールは問題なし。httpx の設定方法が原因だった

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `/Users/admin/DreamCore-V2-modal/modal/app.py` | Secret 定義、`get_proxy_url()` 追加、Sandbox.create の env 設定、httpx の PROXY 設定、デコレーターに proxy_secret 追加 |

## 最終構成

```
┌─────────────────────────────────────────────────────────────┐
│ Modal Function                                              │
│  - generate_gemini: httpx → PROXY → Gemini API             │
│  - generate_image.py: httpx → PROXY → Gemini API           │
│  → 環境変数 HTTP_PROXY/HTTPS_PROXY で設定                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Modal Sandbox (CIDR allowlist: 35.200.79.157/32 のみ)       │
│  - Claude CLI → PROXY → api.anthropic.com                  │
│  - 画像生成 → PROXY → generativelanguage.googleapis.com    │
│  → env パラメータで HTTP_PROXY/HTTPS_PROXY を設定           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ GCE Squid Proxy (35.200.79.157:3128)                        │
│  - Basic 認証: dreamcore_proxy / <password>                 │
│  - 許可ドメイン:                                            │
│    - api.anthropic.com                                      │
│    - generativelanguage.googleapis.com                      │
│    - api.replicate.com                                      │
└─────────────────────────────────────────────────────────────┘
```

## Squid ログで確認

```
TCP_TUNNEL/200 ... CONNECT generativelanguage.googleapis.com:443 dreamcore_proxy
TCP_DENIED/403 ... CONNECT www.google.com:443 - (許可外ドメインは拒否)
```

## 学び・注意点

1. **httpx の proxy 設定は環境変数経由が安定**
   - `httpx.Client(proxy=...)` よりも `os.environ["HTTP_PROXY"]` の方が確実に動作する

2. **Modal Function と Sandbox の違い**
   - Sandbox: `cidr_allowlist` でネットワーク制限可能
   - Modal Function: ネットワーク制限なし（コード側で PROXY を設定する必要がある）

3. **運用一貫性の重要性**
   - 全通信を PROXY 経由に統一することで、監査・調査が容易になる
   - 将来の許可ドメイン追加も Squid の設定変更のみで対応可能

4. **Secret 管理**
   - 認証情報は必ず Modal Secret に格納
   - ローテーション時は `modal secret create --force` で更新可能
