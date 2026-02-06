# URL構造リファクタ Phase 2 — ルート意味切替

**日付:** 2026-02-06
**作業者:** Claude (Agent Teams使用)

## 概要

`/` をホーム（ゲーム作成画面）、`/login` をログイン専用URLに変更。
ファイルリネームは行わず、ルーティングのみ変更。

## 変更内容

### ルート切替（server/index.js）

| URL | 変更前 | 変更後 |
|-----|--------|--------|
| `GET /` | express.static → index.html (ログイン) | **create.html (ホーム)** |
| `GET /login` | index.html | index.html (変更なし) |
| `GET /index.html` | 301 → /login | 301 → /login (変更なし) |

### その他の修正

| ファイル | 変更 |
|---------|------|
| `public/manifest.json` | `id` を `/create.html` → `/create` に修正 |
| `public/waitlist.html` | 認証リダイレクト `/` → `/login` に修正 |

### 変更不要だったもの（既に正しい状態）

- `preauth.js` — `LOGIN_URL = '/login'` ✅
- `auth.js` — 全リダイレクト `/login` ✅
- `app.js` — 全リダイレクト `/login` ✅
- `index.html` — 認証済みユーザーを `/create` にリダイレクト ✅
- 301リダイレクト — `/index.html` → `/login` 含め全て整備済み ✅
- `manifest.json` `start_url` — `/create` ✅
- OAuth redirectTo — `origin + '/create'` ✅

## E2E テスト結果

### agent-browser 自動テスト

| # | チェック | 結果 |
|---|---------|------|
| 1 | `GET /` → create.html (ホーム) | ✅ PASS |
| 2 | `GET /login` → login page | ✅ PASS |
| 3 | `GET /index.html` → 301 `/login` | ✅ PASS |
| 4 | manifest.json start_url/id 正常 | ✅ PASS |
| 5 | 未ログイン `/`, `/create`, `/mypage` → `/login` | ✅ PASS |
| 6 | `/@notef` → 戻るでチラ見えなし | ✅ PASS |

### 手動テスト

| # | チェック | 結果 | 日時 |
|---|---------|------|------|
| 6 | 通知タップ → `/project/:id`（Neon Runner Endless） | ✅ PASS | 2026-02-06 15:00 JST |
| — | Android 通知タップ | ✅ | 同上 |

## コミット一覧

| コミット | 内容 |
|---------|------|
| `93d704c` | feat(routing): make / serve home page instead of login page |
| `37a27e2` | chore(routing): fix manifest.json id and waitlist redirect |
| `48b12b5` | merge: URL restructure Phase 2 |

## 既知の注意事項

### manifest.json `id` 変更の影響

`id` を `/create.html` → `/create` に変更。PWA の `id` はアプリのユニーク識別子として使われるため、この変更により一部のブラウザでPWAが「別のアプリ」として認識される可能性がある。ユーザーはPWAの再インストールが必要になる場合がある。

### 301リダイレクト維持期間

- `/index.html` → `/login` の301は最低90日間維持する
- その他の `.html` → clean URL 301も同様

## 依存関係

この変更は以下の先行作業に依存:
- P0: app.js getSession() フォールバック（commit `b82bef5`）
- A: 共通 preauth.js 抽出（commit `0d32151`）
