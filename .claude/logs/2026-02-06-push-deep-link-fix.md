# 通知ディープリンク認証修正 + 全ページログインチラ見え修正

**日付:** 2026-02-06
**作業者:** Claude (Agent Teams使用)

## 概要

通知タップでプロジェクトページに遷移する際、ログイン画面にリダイレクトされる問題を修正。
全ページの認証チェックを統一し、ログインリダイレクトをクリーンURL (`/login`) に統一。

## 発見した問題

### High: 通知ディープリンクでログインにリダイレクト

**根本原因:** `app.js` の `DreamCoreAuth.getSessionSync()` が sessionStorage のみ参照。
通知タップは `clients.openWindow()` で新タブを開くため、sessionStorage が空。
localStorage に有効な Supabase セッションがあっても、無視してリダイレクトしていた。

**修正:** `!cachedSession` 分岐で `await DreamCoreAuth.getSession()` を試行。
SDK が localStorage からセッションを復元する。

### Medium: 全ページの早期認証チェックが sessionStorage のみ参照

**影響:** `mypage.html`, `discover.html`, `notifications.html`, `editor.html` で
sessionStorage キャッシュ期限切れ（5分TTL）時にログイン画面が一瞬表示される。

**修正:** `create.html` と同じ localStorage フォールバックパターンを全ページに適用。

### Medium: ログインリダイレクト先の不統一

**影響:** `window.location.href = '/'` が JS ファイルに20箇所以上散在。
クリーンURL方針（`/login`）と不一致。

**修正:** 全 JS ファイル (`app.js`, `auth.js`, `mypage.js`, `notifications.js`, `profile.js`, `publish.js`) で `/login` に統一。

### Low: ブラウザキャッシュで古い JS が配信

**影響:** auth/app.js の修正がデプロイ後も反映されない。

**修正:** 全ページの `<script src="/auth.js">` と `<script src="/app.js">` にキャッシュバスター `?v=20260206b` を追加。

## E2E テスト結果 (Agent Teams)

### Push 送信テスト

| テスト | URL | 送信 | Android | iOS |
|--------|-----|------|---------|-----|
| 通知一覧 | `/notifications` | 15/15 ✅ | ✅ | ✅ |
| Discover | `/discover` | 15/15 ✅ | ✅ | ✅ |
| マイページ | `/mypage` | 15/15 ✅ | ✅ | ✅ |
| Create | `/create` | 15/15 ✅ | ✅ | ✅ |
| プロジェクト | `/project/{id}` | 15/15 ✅ | ✅ | ✅ |
| ゲーム | `/game/{public_id}` | 15/15 ✅ | ✅ | ✅ |

### DB 確認 (notef@neighbor.gg)

- 合計15サブスクリプション: Android 1 (FCM) + iOS/FCM 1 + Apple Push 13
- 全デバイスへの配信成功

## コミット一覧

| コミット | 内容 |
|---------|------|
| `9c5d4c3` | fix(auth): 全ページの早期認証チェックに localStorage フォールバック追加 |
| `b82bef5` | fix(auth): app.js のディープリンク失敗修正 + `/login` 統一 |
| `fd1dc33` | chore: auth.js/app.js のキャッシュバスター追加 |

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `public/app.js` | `getSessionSync()` 失敗時に `getSession()` フォールバック、`/login` 統一 |
| `public/auth.js` | `signOut()`, `requireAuth()`, `requireAuthAndAccess()` のリダイレクト先 `/login` |
| `public/mypage.html` | 早期認証チェックに localStorage フォールバック |
| `public/discover.html` | 同上 + auth.js リダイレクト修正 |
| `public/notifications.html` | 早期認証チェックに localStorage フォールバック |
| `public/editor.html` | 同上 + キャッシュバスター追加 |
| `public/create.html` | キャッシュバスター更新 |
| `public/publish.html` | キャッシュバスター追加 |
| `public/mypage.js` | リダイレクト先 `/login` 統一 |
| `public/notifications.js` | 同上 |
| `public/profile.js` | 同上 |
| `public/publish.js` | 同上 |
| `test-push-notef.js` | フォールバック URL `/notifications` に修正 |
| `docs/PUSH-NOTIFICATION-ARCHITECTURE.md` | PWA ベストプラクティスを大幅追記 |

## 学び・注意点

1. **通知ディープリンクは新タブで開く** → sessionStorage が空の前提で設計する
2. **認証チェックは必ず localStorage もフォールバック** → Supabase SDK は localStorage にセッションを保存する
3. **`getSessionSync()` は FAST PATH のみ** → 失敗時は必ず `await getSession()` を試す
4. **ブラウザキャッシュは認証修正の大敵** → JS ファイルには常にキャッシュバスターを付ける
5. **テスト通知には名前付きプロジェクトを使う** → 「新しいゲーム」では確認不能
6. **全ページで同じパターンを使う** → ページごとに認証チェックが異なると修正漏れが発生する

## 残タスク

- 共通 preauth ヘルパーの作成（全ページの早期認証チェックを1ファイルに統合）
