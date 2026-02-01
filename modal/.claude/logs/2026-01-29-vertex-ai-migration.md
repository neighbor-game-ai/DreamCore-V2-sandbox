# Vertex AI 移行作業ログ

**日付:** 2026-01-29
**ブランチ:** feature/sandbox-runtime

---

## 概要

DreamCore-V2-modal の AI API 呼び出しを直接 API から Vertex AI 経由に移行。
Claude CLI と Gemini API の両方を Vertex AI 経由で動作させる。

---

## 実施内容

### 1. Claude CLI の Vertex AI 対応

- Modal Secret に GCP サービスアカウント認証情報を追加 (`gcp-vertex-ai`)
- Modal Secret に Vertex AI 設定を追加 (`vertex-claude-config`)
- Sandbox 内で Claude CLI が Vertex AI を使用するよう環境変数を設定
- Squid プロキシ経由で Google APIs にアクセス

### 2. Gemini コード生成 (generate_gemini) の Vertex AI 対応

**変更ファイル:** `modal/app.py`

| 変更箇所 | 内容 |
|----------|------|
| Line 14 | `import shlex` 追加（シェルエスケープ用） |
| Line 1911-1912 | エンドポイントを `global` に変更 |
| Line 1915 | リクエストに `"role": "user"` 追加 |
| Line 1929-1930 | Squid プロキシ経由でアクセス |
| Line 2006-2020 | JSON レスポンス形式の柔軟化（配列、単一オブジェクト対応） |
| Line 2038-2043 | `mode`/`summary` 取得時のリスト対応 |
| Line 2044-2045 | ファイル名キー（`filename`, `title`）とコンテンツキー（`code`）対応 |
| Line 613-627, 1275-1290 | `shlex.quote()` でシェルエスケープ |

### 3. Gemini 画像生成 (generate_image.py) の Vertex AI 対応

**変更ファイル:** `modal/scripts/generate_image.py`

| 変更箇所 | 内容 |
|----------|------|
| Line 182 | エンドポイントを `global` に変更 |
| Line 217 | リクエストに `"role": "user"` 追加 |
| Line 225 | `responseMimeType` 削除（画像生成では非対応） |
| Line 232 | `httpx.Client(trust_env=True)` でプロキシ環境変数使用 |

---

## 発見した問題と対応

### 問題 1: Gemini 3 モデルは global エンドポイントのみ

**症状:** 404 Not Found
```
Publisher Model `projects/.../locations/us-east5/publishers/google/models/gemini-3-pro-preview` not found.
```

**原因:** `gemini-3-pro-preview` と `gemini-3-pro-image-preview` は `us-east5` などのリージョナルエンドポイントでは利用不可。

**対応:** エンドポイントを `global` に変更
```python
# Before
url = f"https://{gcp_region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{gcp_region}/..."

# After
url = f"https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/..."
```

### 問題 2: role フィールドが必須

**症状:** 400 Bad Request
```
Please use a valid role: user, model.
```

**対応:** contents 内に `"role": "user"` を追加
```python
"contents": [{"role": "user", "parts": [{"text": "..."}]}]
```

### 問題 3: 画像生成で responseMimeType 非対応

**症状:** 400 Bad Request
```
Parameter response_mime_type is not supported for generating image response.
```

**対応:** generationConfig から `responseMimeType` を削除

### 問題 4: Gemini のレスポンス形式が不安定

**症状:** JSON パースエラー、files 取得失敗

**原因:** Gemini API は様々な形式でレスポンスを返す
- 配列: `[{"filename": "...", "content": "..."}]`
- 単一オブジェクト: `{"filename": "...", "content": "..."}`
- files/images形式: `{"files": [...], "images": [...]}`
- キー名の違い: `content` vs `code`, `filename` vs `title`

**対応:** 全形式に対応するパースロジックを実装

---

## 動作確認結果

| 機能 | テスト方法 | 結果 |
|------|-----------|------|
| Claude CLI (Vertex AI) | detect_intent エンドポイント | ✅ `edit` 返却 |
| Gemini コード生成 | generate_gemini エンドポイント | ✅ index.html 生成成功 |
| Gemini 画像生成 | test_image_gen.py | ✅ cat.png (244KB) 生成成功 |

---

## Squid プロキシ許可ドメイン

以下のドメインが GCE Squid で許可済み:
- `oauth2.googleapis.com`
- `sts.googleapis.com`
- `aiplatform.googleapis.com`
- `us-east5-aiplatform.googleapis.com`
- `www.googleapis.com`

---

## 注意点

1. **Gemini 3 モデルは global のみ** - リージョナルエンドポイントでは動作しない
2. **Claude は us-east5** - Claude モデルは引き続き `us-east5` リージョンを使用
3. **role 必須** - Vertex AI の Gemini API では `role: "user"` が必須
4. **画像生成の制約** - `responseMimeType` は使用不可

---

## E2E テスト結果

| テスト | 結果 |
|--------|------|
| detect_intent (Haiku) | ✅ `{"intent":"edit"}` |
| generate_gemini (Gemini) | ✅ index.html 生成成功 |
| generate_publish_info (Haiku) | ✅ 正常応答 |
| Squid ログ確認 | ✅ oauth2 + aiplatform + us-east5 通過 |
| Web UI 動作確認 | ✅ ストリーミング動作 OK |

**本番稼働確認済み** (http://35.200.79.157:3005/)

---

## 関連ファイル

- `modal/app.py` - メイン Modal アプリケーション
- `modal/scripts/generate_image.py` - 画像生成スクリプト
- `modal/upload_skills.py` - スクリプトの Volume アップロード
