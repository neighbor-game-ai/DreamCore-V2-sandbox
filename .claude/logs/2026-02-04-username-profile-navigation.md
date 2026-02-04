# @username プロフィールナビゲーション実装

**日付:** 2026-02-04

## 概要

TikTok/Instagram スタイルの `/@username` URL フォーマットを実装し、プロフィールページのナビゲーションを改善。

## 実装内容

### 1. URL 形式の統一

| 変更前 | 変更後 |
|--------|--------|
| `/u/{public_id}` | `/@{username}` （ユーザー向け） |
| `/mypage.html` → リダイレクト | `/mypage.html` は直接表示 |

### 2. 採用した仕様（Spec C）

- **ナビバーの「マイ」タブ**: `/@{username}` に直接遷移（username がない場合は `/mypage.html`）
- **`/mypage.html`**: リダイレクトせず、プロフィールを直接表示（編集用途）
- **シェア URL**: `/@{username}` 形式を優先
- **URL 正規化**: `/u/{id}` アクセス時は `/@{username}` に正規化

### 3. ユーザーフロー

```
ナビ「マイ」クリック
  → username あり → /@username（公開プロフィール）
  → username なし → /mypage.html（設定促進）

/@username アクセス
  → user.html を直接配信（リダイレクトなし）

/u/{public_id} アクセス
  → user.html 表示 → JS で /@username に正規化
```

## 変更ファイル一覧

### 新規作成

| ファイル | 内容 |
|----------|------|
| `server/modules/profile/usernameValidator.js` | 共通バリデーションモジュール |

### サーバーサイド

| ファイル | 変更内容 |
|----------|----------|
| `server/modules/profile/routes.js` | `/api/users/username/:username/public` エンドポイント追加、予約語チェック |
| `server/modules/profile/publicRoutes.js` | `/@:username` ルート追加、予約語チェック |

### フロントエンド

| ファイル | 変更内容 |
|----------|----------|
| `public/auth.js` | `getMyProfileUrl()`, `clearMyUsernameCache()` 追加 |
| `public/profile.js` | `/@username` URL 対応、正規化処理 |
| `public/mypage.js` | リダイレクト削除、直接表示に変更 |
| `public/app.js` | プロフィールタブで `getMyProfileUrl()` 使用 |
| `public/notifications.js` | 同上 |
| `public/discover.html` | 同上 |
| `public/game.html` | 同上 |
| `public/js/modules/profile.js` | プロフィール更新時に username キャッシュクリア |

## セキュリティ対策

### 1. 予約語保護

`usernameValidator.js` で一元管理:

```javascript
const RESERVED_USERNAMES = new Set([
  'api', 'admin', 'game', 'create', 'discover', 'notifications',
  'play', 'project', 'u', 'g', 'p', 'assets', 'login', 'signup',
  'settings', 'auth', 'callback', 'waitlist', 'mypage', 'profile',
  'help', 'support', 'about', 'terms', 'privacy', 'contact',
  'blog', 'news', 'status', 'docs', 'developer', 'developers',
  'app', 'apps', 'games', 'user', 'users', 'home', 'index',
  'dreamcore', 'official', 'system', 'mod', 'moderator', 'staff',
  'null', 'undefined', 'anonymous', 'guest', 'test', 'demo'
]);
```

### 2. 検証の一貫性

- `/@:username` ルート: 予約語チェック → 404
- `/api/users/username/:username/public`: 予約語チェック → 404
- 両方で同じ `RESERVED_USERNAMES` を使用

### 3. XSS 対策

- `profile.js` で `textContent` を使用
- ユーザー入力を直接 `innerHTML` に挿入しない

## テスト結果

### ブラウザテスト

| テストケース | 結果 |
|--------------|------|
| `/@username` でプロフィール表示 | ✅ |
| `/u/{public_id}` → `/@username` 正規化 | ✅ |
| ナビ「マイ」→ `/@username` 遷移 | ✅ |
| `/mypage.html` で直接表示（リダイレクトなし） | ✅ |
| 予約語（`/@api`）で 404 | ✅ |

### UX 改善

**改善前:**
```
/mypage.html → /@username → /u/{public_id}
（画面が3回切り替わる）
```

**改善後:**
```
ナビ「マイ」クリック → /@username（1回で完了）
```

## コミット

1. `feat(profile): serve /@username directly without redirect`
2. `fix(mypage): remove redirect, display profile directly`
3. `refactor(profile): share username validation across routes`
4. `feat(nav): use /@username for profile tab navigation`

## CodeRabbit レビュー対応

### Warning 2件を修正

| 指摘 | 対応 |
|------|------|
| `profile.js:77` URL エンコードの不整合 | クライアント側で `USERNAME_REGEX` バリデーション追加、末尾スラッシュ除去、小文字正規化 |
| `routes.js` CLI ゲーム取得エラーの黙殺 | `meta: { cli_games: 'error' }` をレスポンスに追加 |

### 追加コミット

5. `fix(profile): add client-side username validation and CLI error meta`

## デプロイ

- **日時:** 2026-02-04
- **対象:** GCE `dreamcore-v2`
- **ヘルスチェック:** HTTP 200 ✅

## 学んだこと

1. **URL 一貫性と UX の両立**: 複数リダイレクトは UX を損なう。ナビゲーション元で最終 URL を直接指定するのが最善
2. **バリデーションの一元化**: 同じルールを複数箇所で使う場合、共通モジュールに抽出して保守性を確保
3. **キャッシュ戦略**: セッションキャッシュ（5分 TTL）で API 呼び出しを削減しつつ、プロフィール更新時にクリアして一貫性を維持
4. **レビュー指摘への対応**: 「必須修正ではないが小さく直せる」指摘は積極的に対応すると品質が上がる
