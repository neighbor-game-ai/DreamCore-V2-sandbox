# i18n（国際化）実装

**日付:** 2026-02-05
**ステータス:** 完了

## 概要

DreamCore V2 に多言語対応（i18n）を実装。英語（デフォルト）、日本語、中国語をサポート。

## 実装内容

### 1. コア機能 (`public/i18n.js`)

- **言語検出**: localStorage → `navigator.language` → デフォルト（en）の優先順位
- **翻訳関数**: `DreamCoreI18n.t('key.path', {vars})` で変数補間対応
- **DOM 更新**: `data-i18n`, `data-i18n-placeholder`, `data-i18n-title` 属性をサポート
- **永続化**: `localStorage` に言語設定を保存

### 2. 翻訳ファイル (`public/locales/`)

| ファイル | 言語 |
|----------|------|
| `en.json` | 英語（デフォルト） |
| `ja.json` | 日本語 |
| `zh.json` | 中国語（簡体字） |
| `TRANSLATION-GUIDE.md` | 翻訳者向けガイド |

**キー命名規則:**
- `page.{pageName}.{element}` - ページ固有
- `common.{element}` - 共通テキスト
- `nav.{item}` - ナビゲーション
- `button.{action}` - ボタン
- `modal.{name}.{element}` - モーダル
- `error.{type}` - エラーメッセージ

### 3. 言語セレクター UI

- 全ページの右上にドロップダウン追加
- `EN` / `JA` / `ZH` で切り替え可能
- CSS アニメーション付き

### 4. 対応ページ

- `index.html` - ログインページ
- `create.html` - ゲーム作成ページ
- `mypage.html` - マイページ

## 修正したバグ

### 1. 言語セレクターの位置ずれ（デスクトップ）

**問題:** `.login-lang-selector` が正しい位置に表示されない
**原因:** `.login-view` に `position: relative` がなかった
**修正:** `public/style.css` に追加

### 2. 言語セレクターの CSS 未適用（モバイル）

**問題:** モバイルでドロップダウンが横並びで表示される
**原因:** ブラウザが古い CSS をキャッシュしていた
**修正:** 全 HTML ファイルに `?v=20260205` キャッシュバスティングを追加

## 変更ファイル一覧

### 新規作成
- `public/i18n.js` - i18n コアモジュール
- `public/locales/en.json` - 英語翻訳
- `public/locales/ja.json` - 日本語翻訳
- `public/locales/zh.json` - 中国語翻訳
- `public/locales/TRANSLATION-GUIDE.md` - 翻訳ガイド

### 修正
- `public/index.html` - i18n 対応 + 言語セレクター
- `public/create.html` - i18n 対応 + 言語セレクター
- `public/mypage.html` - i18n 対応 + 言語セレクター
- `public/style.css` - 言語セレクター CSS + `.login-view` 修正
- 全 `public/*.html` - キャッシュバスティング追加

## CTO レビュー結果

5項目すべてクリア:
- [x] `<html lang="en">` に変更
- [x] `data-i18n-placeholder` / `data-i18n-title` 対応
- [x] ハードコード日本語なし
- [x] 翻訳キー欠落時のフォールバックログ
- [x] `document.title` の動的更新

## 検証方法

```javascript
// Console で確認
DreamCoreI18n.getLanguage()     // 現在の言語
DreamCoreI18n.t('nav.create')   // 翻訳取得
DreamCoreI18n.setLanguage('en') // 言語変更
```

## 今後の課題

- [ ] 他のページへの i18n 適用（discover, notifications 等）
- [ ] 韓国語、フランス語等の追加
- [ ] サーバーサイドでの言語検出（Accept-Language ヘッダー）

## コミット

- `9a05e2b` - fix(i18n): language selector positioning on login page
- `4c1682c` - fix(cache): add cache-busting query string to static assets
