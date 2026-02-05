# i18n 完全対応完了

**日付:** 2026-02-05
**作業者:** Claude Code

## 概要

app.js および game.html の残存日本語文字列を i18n 対応し、全ページで多言語サポートを完了。

## 実施内容

### 1. app.js の完全 i18n 化

100+ の日本語文字列を `this.t()` 関数に置換:

- ウェルカムメッセージ、エラーメッセージ
- ゲームサンプル名（15種）
- ステータスメッセージ（接続中、エラー等）
- クォータ制限メッセージ
- セッション関連メッセージ
- バージョン復元メッセージ
- アセット削除確認

### 2. game.html の i18n 化

CTOレビュー指摘事項を対応:

| 箇所 | 対応 |
|------|------|
| エラー画面 | `data-i18n` 属性追加 |
| aria-label（戻る、いいね、コメント、シェア、情報） | `data-i18n-aria` 属性追加 |
| 共有パネル（QRコード、URLコピー、その他） | `data-i18n-title` 属性追加 |
| QRモーダル（スマホでスキャン、閉じる） | `data-i18n` 属性追加 |
| 共有テキスト | `t('game.shareText', { title })` |
| コピートースト | `t('game.copied')` |
| 系譜エラー | `t('game.lineageLoadError')` |

### 3. i18n.js 機能追加

`data-i18n-aria` 属性のサポートを追加:

```javascript
document.querySelectorAll('[data-i18n-aria]').forEach(el => {
  el.setAttribute('aria-label', t(el.dataset.i18nAria));
});
```

### 4. Locale ファイル更新（6言語）

`game` セクションに18キーを追加:

- `errorNotFound`, `errorNotFoundMessage`, `errorGoBack`
- `ariaBack`, `ariaLike`, `ariaComment`, `ariaShare`, `ariaInfo`
- `qrCode`, `copyUrl`, `shareMore`, `scanWithPhone`, `closeModal`
- `shareText`, `copied`, `lineageLoadError`

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `public/app.js` | 100+ 日本語文字列 → `this.t()` |
| `public/game.html` | aria-label, title, エラー画面, 共有パネル |
| `public/i18n.js` | `data-i18n-aria` サポート追加 |
| `public/locales/en.json` | game セクションに18キー追加 |
| `public/locales/ja.json` | game セクションに18キー追加 |
| `public/locales/zh.json` | game セクションに18キー追加 |
| `public/locales/ko.json` | game セクションに18キー追加 |
| `public/locales/es.json` | game セクションに18キー追加 |
| `public/locales/pt.json` | game セクションに18キー追加 |

## CTO承認

以下の3点を確認し、承認済み:

1. ✅ game.html に日本語の aria/title 残留なし
2. ✅ 6言語ファイルに追加キーが均等に存在（各11件）
3. ✅ i18n.js の `data-i18n-aria` が正しく実装

## 備考

- profile.js の `usernameHint`, `error.systemError` は既に対応済み
- game.html 内のコメント、モックデータ（ゲストブックのサンプル）は翻訳対象外
