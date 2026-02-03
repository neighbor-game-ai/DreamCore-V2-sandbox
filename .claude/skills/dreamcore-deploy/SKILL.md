# DreamCore Deploy スキル

ゲームを DreamCore にデプロイする。

## トリガー

- 「DreamCoreにデプロイして」
- 「ゲームを公開して」
- 「DreamCoreにアップロードして」
- 「dreamcore deploy」

## 前提条件

- dreamcore CLI がインストール済み
- `dreamcore login` で認証済み

## フロー

### Step 1: 公開情報を生成

以下の情報を生成してください:

| フィールド | 説明 | 制約 |
|-----------|------|------|
| `title` | ゲームの魅力が伝わるタイトル | 50字以内 |
| `description` | ゲームの概要・世界観・特徴 | 500字以内 |
| `howToPlay` | 操作方法・ルール・攻略ヒント | 1000字以内、プレーンテキスト |
| `tags` | 検索用キーワード | 最大5個、各20字以内 |

### Step 2: ユーザーに確認

生成した情報をユーザーに提示し、確認を求める。
修正があれば反映する。

### Step 3: 公開設定を質問

ユーザーに以下を質問:

**1. 公開範囲**
- **公開** (`"public"`) - 誰でも発見・プレイできる
- **限定公開** (`"unlisted"`) - URLを知っている人だけ

**2. Remix許可**
- **許可する** (`true`) - 他ユーザーがこのゲームをベースに新しいゲームを作れる
- **許可しない** (`false`)

### Step 4: dreamcore.json 作成

プロジェクトルートに `dreamcore.json` を作成:

```json
{
  "title": "ゲームタイトル",
  "description": "ゲームの概要説明",
  "howToPlay": "操作方法とルール",
  "tags": ["アクション", "パズル"],
  "visibility": "public",
  "allowRemix": true
}
```

### Step 5: デプロイ実行

```bash
dreamcore deploy
```

## サムネイル（オプション）

プロジェクトルートに以下のいずれかを配置すると、サムネイルとしてアップロードされる:

- `thumbnail.webp`（推奨）
- `thumbnail.png`
- `thumbnail.jpg`

**制約:**
- 最大 1MB
- WebP に自動変換（変換失敗時は元形式を使用）

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

### 後方互換性

v1 形式（`title` + `description` のみ）もそのまま動作する。
新フィールドはデフォルト値が適用される。

## エラー例

```
✗ title is required in dreamcore.json
✗ title must be 50 characters or less
✗ tags must have at most 5 items
✗ visibility must be "public" or "unlisted"
✗ allowRemix must be a boolean (true or false)
✗ Thumbnail exceeds 1MB limit
```

## 参考

- [CLI Architecture](/docs/CLI-ARCHITECTURE.md)
- [API Reference](/docs/API-REFERENCE.md)
