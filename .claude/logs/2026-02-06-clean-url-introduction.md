# クリーンURL導入

**日付:** 2026-02-06
**作業者:** Claude (Agent Teams使用)
**コミット:** a0e9b9e

## 概要

ユーザーに見せるURLから `.html` 拡張子を廃止し、モダンなクリーンURL構造に移行。
ファイルリネームは行わず、サーバー側ルーティングで対応。

## 実施内容

### サーバー側

- クリーンURLルート8つを `express.static` の前に追加
  - `/create`, `/login`, `/mypage`, `/discover`, `/notifications`, `/waitlist`, `/editor`, `/publish`
- 301リダイレクト8つ（クエリ文字列保持、`req.originalUrl` 使用）
  - `/create.html` → `/create`, `/index.html` → `/login` 等
- 後段の重複ルート定義を削除（コメント参照に置換）
- 通知フォールバックURL更新（`notificationService.js`, `pushService.js`）

### フロントエンド側

- 全HTMLファイル・JSファイルの `.html` 参照をクリーンURLに更新
- 対象: `auth.js`, `app.js`, `sw.js`, `publish.js`, `mypage.js`, `notifications.js`, `discover.html`, `game.html`, `index.html`, `waitlist.html`
- `manifest.json`: `start_url` を `/create` に変更、`id` は旧値 `/create.html` を維持（PWA互換性）
- コメント中の `.html` 参照も統一

### OAuth設定

- Supabase URL Configuration に `https://v2.dreamcore.gg/create` を追加
- Google/Apple OAuth は Supabase callback 経由のため変更不要

## レビュー対応（3ラウンド）

### ラウンド1
| 重要度 | 指摘 | 対応 |
|--------|------|------|
| High | 301で `?id=...` クエリが消える | `req.originalUrl` でクエリ保持 |
| Medium | ルート二重定義 | 後段の重複4箇所を削除 |
| Medium | discover.html に `.html` 直リンク残留 | 5箇所更新 |
| Low | サーバー側通知URLが `.html` | 2ファイル更新 |

### ラウンド2
| 重要度 | 指摘 | 対応 |
|--------|------|------|
| Medium | PWA `id` 変更で既存インストール分断 | `id` を旧値に戻し、`start_url` のみ変更 |
| Low | `/index.html` の301が未定義 | `'/index.html': '/login'` を追加 |
| Low | waitlist.html, game.html に `.html` 残存 | 4箇所+3箇所更新 |

### ラウンド3
| 重要度 | 指摘 | 対応 |
|--------|------|------|
| Medium | game.html ボトムナビの遷移先が誤り | discover/notifications/profile の href を修正（UXバグ修正含む） |

## 変更ファイル一覧（15ファイル）

| ファイル | 変更内容 |
|---------|---------|
| `server/index.js` | クリーンURLルート・301リダイレクト追加、重複削除 |
| `server/notificationService.js` | 通知フォールバックURL `/notifications` |
| `server/pushService.js` | Push通知フォールバックURL `/notifications` |
| `public/auth.js` | OAuth redirectTo、waitlist、mypage参照 |
| `public/app.js` | waitlist、publish、コメント |
| `public/sw.js` | 通知クリック先 `/notifications`（4箇所） |
| `public/publish.js` | create、editor参照 |
| `public/mypage.js` | waitlist参照、コメント |
| `public/notifications.js` | waitlist参照、コメント |
| `public/discover.html` | create、waitlist、mypage、notifications参照 |
| `public/game.html` | ボトムナビ全4タブ + create、mypage参照 |
| `public/index.html` | prefetch、ログインリダイレクト |
| `public/waitlist.html` | create参照 |
| `public/manifest.json` | `start_url` を `/create` に |
| `.claude/plans/url-restructure.md` | 計画書 |

## テスト結果

### ローカルテスト（20/20 合格）
- クリーンURLルート 8つ: 全て 200 ✅
- 301リダイレクト 8つ: 全て正しい Location ✅
- クエリ文字列保持 3つ: `/publish.html?id=UUID` → `/publish?id=UUID` ✅
- ルート `/`: 200 ✅

### 本番ヘルスチェック
- `GET /api/config` → 200 ✅
- `GET /create` → 200 ✅
- `GET /create.html` → 301 → `/create` ✅

## Agent Teams 活用

- リードエージェント + 2メンバーエージェント（server-routing, frontend-refs）で並列実装
- サーバー側とフロント側の変更を同時進行

## 学び・注意点

- **`req.url` vs `req.originalUrl`**: Express のルートハンドラ内で `req.url` はクエリ文字列を含まない場合がある。301リダイレクトでクエリを保持するには `req.originalUrl` を使う。
- **PWA `id` の変更は危険**: `manifest.json` の `id` を変更すると既存インストールが「別アプリ扱い」になる。`start_url` のみ変更し、`id` は旧値を維持するのが安全。
- **express.static の順序**: クリーンURLルートは `express.static` より前に定義しないと、static が `.html` ファイルを直接返してしまう。
- **レビューの重要性**: 3ラウンドのレビューで game.html のボトムナビバグ（discover/notifications タブが `/create.html` に向いていた）を発見。既存バグの修正にもなった。

## 残タスク

- ログインチラ見え対策（`/login` 独立ページ化、別タスク）
- 301リダイレクトの維持期間管理（2026-05-06 まで最低維持、状況次第で2026-08-06）
