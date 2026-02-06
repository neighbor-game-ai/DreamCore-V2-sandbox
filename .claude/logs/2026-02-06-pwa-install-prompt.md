# PWA Install Prompt 実装 (2026-02-06)

## 概要

モバイルブラウザでアクセスしたユーザーに PWA インストールを促すバナーを実装。iOS/Android 両対応、6言語対応、完全自己完結型モジュール。

## 実装内容

### 新規ファイル

- `public/pwa-install.js` - 自己完結型 PWA インストールプロンプト（CSS/HTML/翻訳すべて内蔵）
- `public/pwa-test.html` - デバッグ用テストページ
- `public/pwa-test-create.html` - Create ページ模擬テストページ

### 変更ファイル

- `public/create.html` - `<script>` 1行追加
- `public/discover.html` - `<script>` 1行追加
- `public/notifications.html` - `<script>` 1行追加
- `public/mypage.html` - `<script>` 1行追加
- `public/user.html` - `<script>` 1行追加
- `docs/PUSH-NOTIFICATION-ARCHITECTURE.md` - PWA Install Prompt セクション追加

## 機能詳細

### バナー
- position: fixed, top, DreamCore テーマカラーのグラデーション
- アプリアイコン + タイトル + 説明 + Install ボタン + ✕ ボタン
- ✕ は一時的に閉じるだけ（次回ページ遷移で再表示）
- スライドイン/アウトアニメーション

### iOS モーダル
- Safari ツールバーの SVG イラスト（共有ボタンをハイライト）
- 共有メニューの SVG イラスト（「ホーム画面に追加」をハイライト）
- DreamCore アイコン付きの「追加」ボタンイラスト
- 「わかった」ボタン + 「今後表示しない」リンク

### Android モーダル
- 三点メニュー（⋮）アイコンのイラスト
- メニュー項目のイラスト（「ホーム画面に追加」をハイライト）
- Chrome の `beforeinstallprompt` がある場合はネイティブダイアログを直接表示

### 多言語対応
- en, ja, zh, ko, es, pt（6言語）
- JS 内蔵、locale ファイル変更なし
- 言語判定: DreamCoreI18n → localStorage → navigator.language

## ハードニング

- localStorage を try-catch でラップ（プライベートブラウジング対応）
- iOS モーダルに role="dialog", aria-modal="true"
- フォーカス管理（モーダル表示時に OK ボタンへフォーカス、閉じた後に復帰）
- イベントリスナーを名前付き関数 + removeEventListener でクリーンアップ

## 併せて対応

- Push 通知の全ユーザー開放（`PUSH_ALLOWLIST_USER_IDS` コメントアウト）
- 全ページで Service Worker 登録（discover, notifications でも PWA インストール可能に）

## 発見した問題と対応

| 問題 | 原因 | 対応 |
|------|------|------|
| ブラウザリフレッシュ後にバナーが出ない | キャッシュバスター未更新 | `?v=` を更新 |
| バナーが英語で表示される | DOMContentLoaded 前にバナー描画 | 100ms 遅延追加 + localStorage dreamcore_lang 参照 |
| Android でモーダルが出る（ネイティブ不可） | 既にインストール済み端末では beforeinstallprompt 非発火 | 正常動作。新規ユーザーにはネイティブ表示 |
| user/mypage で PWA インストール不可 | pwa-install.js 未追加 | script タグ追加 |
| ✕ ボタンで7日間非表示 | ✕ = dismiss として実装 | ✕ = 一時的に閉じる、dismiss はモーダル内に移動 |

## コミット履歴

1. `d80304b` - feat(pwa): add install prompt with iOS modal and hardening
2. `8e213ab` - feat(pwa): update install banner copy to highlight fullscreen & notifications
3. `3397cf3` - fix(pwa): close button hides banner temporarily, dismiss moved to modal
4. `10b3372` - fix(pwa): bump cache buster
5. `c5cdf7b` - feat(pwa): show banner immediately on all mobile, add Android modal
6. `6a24736` - fix(pwa): register service worker from pwa-install.js for all pages
7. `bbe6521` - fix(pwa): localize Android modal illustrations and bump cache buster
8. `0c2998b` - fix(pwa): capture beforeinstallprompt at top of IIFE for earlier timing
9. `1168fe5` - fix(pwa): add install prompt to mypage and user pages
10. `f293670` - fix(pwa): use localStorage dreamcore_lang for language detection
11. `9000258` - fix(pwa): delay banner render to after DOMContentLoaded + 100ms for i18n
