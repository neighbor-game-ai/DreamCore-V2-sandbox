# ゲーム画面の戻るボタン改善

**日付:** 2026-02-04
**コミット:** 0da4fd4

## 概要

ゲーム画面（`/game/:id`）の戻るボタンを押した際に、マイページまたはプロフィールページに適切に戻れるよう改善。

## 実装内容

### 方針: クエリパラメータ方式 + referrer フォールバック

1. 遷移元で `from` パラメータを付与（`mypage` / `profile`）
2. `goBack()` は `from` を優先、無ければ `referrer`、それも無ければ `/create.html`

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `public/mypage.js` | ゲームリンクに `?from=mypage` を追加 |
| `public/game.html` | `goBack()` 関数を更新 |

### goBack() の処理フロー

```
1. from パラメータを優先（列挙型: mypage / profile のみ）
   - from=mypage → /mypage
   - from=profile&user=xxx → /u/xxx（user は u_ 形式 or UUID のみ）

2. referrer フォールバック
   - /mypage から来た → /mypage
   - /u/xxx から来た → /u/xxx

3. デフォルト → /create.html
```

### セキュリティ対策

- `from` パラメータは列挙型（`mypage` / `profile` 以外は無視）
- `user` パラメータは `u_` 形式（`/^u_[A-Za-z0-9]{10}$/`）または UUID のみ許可
- `referrer` チェックは同一ホスト限定（`ref.includes(location.host)`）
- 不正な値はすべて無視してデフォルトフォールバック

## 動作パターン

| 遷移元 | URL例 | 戻り先 |
|--------|-------|--------|
| マイページ | `/game/g_xxx?from=mypage` | `/mypage` |
| プロフィール | `/game/g_xxx?from=profile&user=u_abc123XYZ0` | `/u/u_abc123XYZ0` |
| 直接アクセス（referrer=mypage） | `/game/g_xxx` | `/mypage` |
| 直接アクセス（referrerなし） | `/game/g_xxx` | `/create.html` |

## 将来の拡張

`user.html`（他人のプロフィールページ）にゲーム一覧が追加された際は、そこで `?from=profile&user=${userId}` を付与すれば対応可能。

## デプロイ

- GCE: `dreamcore-sandbox` 再起動完了
- 本番URL: https://v2.dreamcore.gg
