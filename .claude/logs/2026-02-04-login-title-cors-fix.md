# 2026-02-04 ログイン画面タイトル変更 & R2 CORS設定 & 送信ボタン状態表示

## 実施内容

### 1. ログイン画面タイトル変更

**変更ファイル:** `public/index.html`

- `<title>` タグ: `ゲームクリエイター - チャットでゲームを作ろう` → `DreamCore - チャットでゲームを作ろう`
- `<h1>` タグ: `ゲームクリエイター` → `DreamCore`

**コミット:** `74fb752`

### 2. R2 CORS設定追加

**問題:** プレビュー画面でアセット画像・音声が読み込めない

**原因:** Cloudflare R2 CDN に CORS ヘッダーが設定されていなかった

**発生フロー:**
```
1. プレビュー iframe (v2.dreamcore.gg) 内で P5.js が loadImage/loadSound を呼び出す
2. /user-assets/... にリクエスト
3. サーバーが 302 リダイレクト → https://cdn.dreamcore.gg/...
4. CDN が画像/音声を返すが Access-Control-Allow-Origin ヘッダーがない
5. ブラウザが CORS ポリシー違反でブロック (ERR_BLOCKED_BY_ORB)
```

**対応:** wrangler CLI で R2 バケット `dreamcore-public` に CORS 設定を追加

```json
{
  "rules": [{
    "allowed": {
      "origins": ["https://v2.dreamcore.gg", "https://play.dreamcore.gg", "http://localhost:3000"],
      "methods": ["GET", "HEAD"],
      "headers": ["*"]
    },
    "exposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "maxAgeSeconds": 86400
  }]
}
```

**コマンド:**
```bash
wrangler r2 bucket cors set dreamcore-public --file /tmp/r2-cors.json
```

**検証結果:**
```bash
curl -I "https://cdn.dreamcore.gg/user-assets/..." -H "Origin: https://v2.dreamcore.gg"
# → access-control-allow-origin: https://v2.dreamcore.gg ✅
```

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `public/index.html` | タイトル・見出し変更 |
| R2 バケット `dreamcore-public` | CORS ルール追加 |

## デプロイ

- GCE デプロイ完了 (`74fb752`)
- ヘルスチェック: HTTP 200 ✅

### 3. 送信ボタン状態表示改善

**問題:** 送信ボタンが無効（disabled）のままになることがあり、なぜ送信できないのかがユーザーに分からない

**解決策:** ボタンのラベル・アイコン・色で状態を視覚的に表現

| 状態 | ラベル | アイコン | 色 | 条件 |
|------|--------|----------|-----|------|
| `ready` | 送信 | 送信 | 青 | 入力あり |
| `empty` | 入力してください | 送信 | グレー | 入力なし |
| `processing` | 処理中… | スピナー | グレー | AI処理中 |
| `quota` | 制限中 | 警告 | 赤 | クォータ超過 |

**実装:**
- `updateSendButtonState(state, reason)` メソッドを追加
- `data-state` / `data-reason` 属性で状態を管理
- CSS で状態に応じたスタイル切り替え
- スピナーアニメーション追加

**変更ファイル:**
- `public/editor.html` - 送信ボタンに複数アイコン・ラベル追加
- `public/style.css` - 状態別スタイル追加
- `public/app.js` - `updateSendButtonState()` メソッド追加、各所で状態更新

**コミット:** `672c37d`

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `public/index.html` | タイトル・見出し変更 |
| `public/editor.html` | 送信ボタンにアイコン・ラベル追加 |
| `public/style.css` | 送信ボタン状態別スタイル追加 |
| `public/app.js` | `updateSendButtonState()` メソッド追加 |
| R2 バケット `dreamcore-public` | CORS ルール追加 |

## デプロイ

- GCE デプロイ完了
- ヘルスチェック: HTTP 200 ✅

## 学び・注意点

- R2 CDN を使用する場合、クロスオリジンリソース（画像、音声等）の配信には CORS 設定が必須
- P5.js の `loadImage`/`loadSound` は Canvas 描画のため CORS が必要（単純な `<img>` タグとは異なる）
- wrangler の CORS 設定 JSON は `rules` キーでラップし、フィールド名は小文字 (`allowed.origins` など)
- モバイルではホバーが使えないため、ツールチップではなくボタン内テキストで状態を表示

---

## 2026-02-04 追記: 送信ボタン状態表示をリバート

**コミット:** `4780f82 Revert "feat(ui): add visual state feedback to send button"`

### 経緯

UX の観点から、送信ボタンの動的状態表示を元のシンプルな実装に戻すことを決定。

### リバート方法

```bash
git revert 672c37d --no-commit  # 事前確認
git revert --continue           # コンフリクトなし → コミット
```

### 結果

- 193行削除、13行復元
- 送信ボタンは「送信」固定ラベル + `disabled` 属性のみに戻った

### CTO 判断

> UX は "分かりやすさ" と "一貫性" が最優先。
> 表示のみの変更で機能要件ではないため、安全に後戻りできるカテゴリ。
