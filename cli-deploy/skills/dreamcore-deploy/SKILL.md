# DreamCore Deploy スキル

ゲームを DreamCore にデプロイする。

**バージョン:** 1.1.0

## トリガー

- 「DreamCoreにデプロイして」
- 「ゲームを公開して」
- 「DreamCoreにアップロードして」

## 前提条件

- プロジェクトルートに `index.html` が存在すること

## フロー

### Step 0: スキル更新確認

1. サーバーからバージョン情報を取得:
```bash
curl -s https://v2.dreamcore.gg/skills/dreamcore-deploy/version.json
```

2. ローカルのバージョンファイルを確認:
```bash
cat ~/.dreamcore/skill-version 2>/dev/null || echo "0.0.0"
```

3. サーバーのバージョンがローカルより新しい場合、ユーザーに確認:
```
DreamCore Deploy スキルの新バージョン (v{version}) があります。

変更内容: {changelog}

更新しますか？ [Y/n]
```

4. 更新する場合:
   - インストール先を判定:
     - `.claude/skills/dreamcore-deploy/SKILL.md` が存在 → ローカル（プロジェクト内）
     - 存在しない → グローバル（`~/.claude/skills/dreamcore-deploy/`）
   - SKILL.md をダウンロード:
```bash
# グローバルの場合
mkdir -p ~/.claude/skills/dreamcore-deploy
curl -sL https://v2.dreamcore.gg/skills/dreamcore-deploy/SKILL.md \
  -o ~/.claude/skills/dreamcore-deploy/SKILL.md

# ローカルの場合
curl -sL https://v2.dreamcore.gg/skills/dreamcore-deploy/SKILL.md \
  -o .claude/skills/dreamcore-deploy/SKILL.md
```
   - バージョンファイルを更新:
```bash
mkdir -p ~/.dreamcore
echo "{version}" > ~/.dreamcore/skill-version
```

5. 更新完了後:
```
スキルを更新しました (v{version})
引き続きデプロイを実行します...
```

更新しない場合はそのまま続行。

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
```

レスポンス例:
```json
{
  "device_code": "xxx",
  "user_code": "ABCD-1234",
  "verification_uri": "https://v2.dreamcore.gg/cli-auth/auth.html",
  "expires_in": 900,
  "interval": 5
}
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
デプロイ完了！

ゲームURL: https://v2.dreamcore.gg/game/g_xxxxxxxxxx
ID: g_xxxxxxxxxx

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

## ファイル保存場所

| ファイル | パス | 説明 |
|----------|------|------|
| トークン | `~/.dreamcore/token` | 認証トークン（`dc_` + 32文字） |
| バージョン | `~/.dreamcore/skill-version` | インストール済みスキルのバージョン |

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

- [CLI Architecture](https://v2.dreamcore.gg/docs/CLI-ARCHITECTURE.md)
- [API Reference](https://v2.dreamcore.gg/docs/API-REFERENCE.md)
