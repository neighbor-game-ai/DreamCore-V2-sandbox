# DreamCore Deploy スキル

ゲームを DreamCore にデプロイする。

## トリガー

- 「DreamCoreにデプロイして」
- 「ゲームを公開して」
- 「DreamCoreにアップロードして」

## 前提条件

- プロジェクトルートに `index.html` が存在すること

## フロー

### Step 1: index.html の確認

プロジェクトルートに `index.html` があるか確認。
なければエラーを表示して終了。

### Step 2: 既存の dreamcore.json を確認

`dreamcore.json` が存在し、`id` フィールドがある場合:

```
このゲームは既に DreamCore にアップロードされています。
ID: {id}

どうしますか？
1. 上書き更新する
2. 別ゲームとして新規投稿する
3. キャンセル
```

ユーザーが「別ゲームとして投稿」を選んだ場合、`id` フィールドを削除する。

### Step 3: 公開情報を生成

ゲームのコード（index.html 等）を読み取り、以下の情報を生成:

| フィールド | 説明 | 制約 |
|-----------|------|------|
| `title` | ゲームの魅力が伝わるタイトル | 50字以内 |
| `description` | ゲームの概要・世界観・特徴 | 500字以内 |
| `howToPlay` | 操作方法・ルール・攻略ヒント | 1000字以内、プレーンテキスト |
| `tags` | 検索用キーワード | 最大5個、各20字以内 |

### Step 4: ユーザーに確認

生成した情報をユーザーに提示し、確認を求める。
修正があれば反映する。

### Step 5: 公開設定を質問

ユーザーに以下を質問:

**1. 公開範囲**
- **公開** (`"public"`) - 誰でも発見・プレイできる（推奨）
- **限定公開** (`"unlisted"`) - URLを知っている人だけ

**2. Remix許可**
- **許可する** (`true`) - 他ユーザーがこのゲームをベースに新しいゲームを作れる（推奨）
- **許可しない** (`false`)

### Step 6: dreamcore.json 作成

プロジェクトルートに `dreamcore.json` を作成（既存の `id` があれば保持）:

```json
{
  "id": "g_xxxxxxxxxx",
  "title": "ゲームタイトル",
  "description": "ゲームの概要説明",
  "howToPlay": "操作方法とルール",
  "tags": ["アクション", "パズル"],
  "visibility": "public",
  "allowRemix": true
}
```

### Step 7: 認証トークンを取得

1. `~/.dreamcore/token` ファイルを確認
2. なければデバイスフロー認証を開始:

```bash
# デバイスコードを取得
curl -X POST https://v2.dreamcore.gg/api/cli/device/code

# レスポンス例:
# {
#   "device_code": "xxx",
#   "user_code": "ABCD-1234",
#   "verification_uri": "https://v2.dreamcore.gg/cli-auth/auth.html",
#   "expires_in": 900,
#   "interval": 5
# }
```

ユーザーに以下を表示:
```
認証が必要です。

1. ブラウザで以下のURLを開いてください:
   https://v2.dreamcore.gg/cli-auth/auth.html

2. 以下のコードを入力してください:
   ABCD-1234

待機中...
```

トークン取得をポーリング:
```bash
curl -X POST https://v2.dreamcore.gg/api/cli/device/token \
  -H "Content-Type: application/json" \
  -d '{"device_code": "xxx", "grant_type": "urn:ietf:params:oauth:grant-type:device_code"}'
```

成功したら `~/.dreamcore/token` に保存。

### Step 8: ZIP を作成してデプロイ

```bash
# ZIP 作成（node_modules, .git 等を除外）
zip -r game.zip . -x "node_modules/*" -x ".git/*" -x "*.DS_Store"

# デプロイ
curl -X POST https://v2.dreamcore.gg/api/cli/deploy \
  -H "Authorization: Bearer dc_xxxxx" \
  -F "file=@game.zip"

# 一時ファイル削除
rm game.zip
```

### Step 9: 結果を表示

成功時:
```
✅ デプロイ完了！

🎮 ゲームURL: https://v2.dreamcore.gg/game/g_xxxxxxxxxx
📋 ID: g_xxxxxxxxxx

dreamcore.json に ID を保存しました。
次回は同じゲームを上書き更新できます。
```

失敗時はエラーメッセージを表示。

---

## サムネイル（オプション）

プロジェクトルートに以下のいずれかを配置すると、サムネイルとしてアップロードされる:

- `thumbnail.webp`（推奨）
- `thumbnail.png`
- `thumbnail.jpg`

**制約:**
- 最大 1MB
- WebP に自動変換（変換失敗時は元形式を使用）

---

## dreamcore.json 仕様

### フィールド一覧

| フィールド | 必須 | 型 | デフォルト | 説明 |
|-----------|------|-----|-----------|------|
| `id` | ❌ | string | 自動生成 | 公開ID（`g_` + 10文字英数字） |
| `title` | ✅ | string | - | ゲームタイトル（50字以内） |
| `description` | ❌ | string | `""` | 概要説明（500字以内） |
| `howToPlay` | ❌ | string | `""` | 操作方法・ルール（1000字以内） |
| `tags` | ❌ | string[] | `[]` | 検索用タグ（最大5個、各20字以内） |
| `visibility` | ❌ | string | `"public"` | `"public"` または `"unlisted"` |
| `allowRemix` | ❌ | boolean | `true` | Remix許可 |

---

## トークン保存場所

```
~/.dreamcore/token
```

形式: `dc_` + 32文字の英数字

---

## エラー例

```
✗ index.html が見つかりません
✗ title is required in dreamcore.json
✗ title must be 50 characters or less
✗ tags must have at most 5 items
✗ visibility must be "public" or "unlisted"
✗ Thumbnail exceeds 1MB limit
✗ 認証に失敗しました。再度ログインしてください。
```

---

## 参考

- [CLI Architecture](/docs/CLI-ARCHITECTURE.md)
- [API Reference](/docs/API-REFERENCE.md)
