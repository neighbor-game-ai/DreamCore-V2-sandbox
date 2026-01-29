# 2026-01-30: サンドボックスアーキテクチャ実装

## 概要

公開ゲームのセキュリティを itch.io 水準に強化。iframe のオリジン分離とパーミッション設定を実装。

---

## アーキテクチャ変更

### 変更前（初期実装）

```
play.dreamcore.gg が v2.dreamcore.gg を iframe で埋め込む
```

### 変更後（itch.io モデル）

```
v2.dreamcore.gg/game/:gameId  ← ゲーム詳細ページ（認証情報あり）
        │
        └── iframe src="play.dreamcore.gg/g/:gameId/index.html"
                    │
                    └── ゲーム本体（別オリジン・サンドボックス化）
```

**理由:** v2 に認証情報があるため、v2 が親になる方がセキュア

---

## ルーティング

| URL | ドメイン | 内容 |
|-----|---------|------|
| `/game/:gameId` | v2.dreamcore.gg | ゲーム詳細ページ（iframe 埋め込み） |
| `/g/:gameId` | play.dreamcore.gg | → `/g/:gameId/index.html` にリダイレクト |
| `/g/:gameId/*` | play.dreamcore.gg | ゲームファイル配信 |
| `/g/:gameId/*` | v2.dreamcore.gg | 404（直接アクセス不可） |

---

## iframe セキュリティ設定

### sandbox 属性

| 属性 | 状態 | 説明 |
|------|------|------|
| `allow-scripts` | ✅ 許可 | JavaScript 実行（ゲームに必須） |
| `allow-pointer-lock` | ✅ 許可 | マウスロック（FPS等） |
| `allow-popups` | ✅ 許可 | 新しいウィンドウを開く |
| `allow-orientation-lock` | ✅ 許可 | 画面回転ロック（モバイル） |
| `allow-forms` | ✅ 許可 | フォーム送信 |
| `allow-modals` | ❌ 禁止 | alert/confirm/prompt（悪用防止） |
| `allow-same-origin` | ❌ 禁止 | **絶対禁止** - 認証情報窃取を防止 |
| `allow-top-navigation` | ❌ 禁止 | フィッシング防止 |
| `allow-downloads` | ❌ 禁止 | マルウェア配布防止 |

### allow 属性（Permissions Policy）

| 機能 | 状態 | 説明 |
|------|------|------|
| `fullscreen` | ✅ 許可 | フルスクリーン |
| `accelerometer` | ✅ 許可 | 加速度センサー |
| `gyroscope` | ✅ 許可 | ジャイロスコープ |
| `gamepad` | ✅ 許可 | ゲームパッド |
| `camera` | ✅ 許可 | カメラ（ユーザー許可必要） |
| `microphone` | ✅ 許可 | マイク（ユーザー許可必要） |
| `autoplay` | ✅ 許可 | 音声自動再生 |
| `geolocation` | ❌ 禁止 | 位置情報（将来検討） |

### 最終的な iframe タグ

```html
<iframe
  sandbox="allow-scripts allow-pointer-lock allow-popups allow-orientation-lock allow-forms"
  allow="fullscreen; accelerometer; gyroscope; gamepad; camera; microphone; autoplay"
>
```

---

## CSP ヘッダー

play.dreamcore.gg からのゲームファイル配信時:

```
Content-Security-Policy: frame-ancestors 'self' https://v2.dreamcore.gg
```

v2.dreamcore.gg からのみ iframe 埋め込み可能。

---

## セキュリティモデル

### なぜ安全か

1. **オリジン分離**: ゲームは `play.dreamcore.gg` で実行、認証情報は `v2.dreamcore.gg` にある
2. **sandbox**: `allow-same-origin` なしで、iframe は「謎のユニークオリジン」扱い
3. **CSP**: v2 からのみ埋め込み可能

### 悪意あるゲームができないこと

| 攻撃 | 結果 |
|------|------|
| v2 の Cookie を盗む | ❌ 別オリジン |
| v2 の localStorage を読む | ❌ 別オリジン |
| v2 の API に認証リクエスト | ❌ Cookie が送られない |
| 親ページを偽サイトに遷移 | ❌ `allow-top-navigation` なし |
| マルウェアをダウンロード | ❌ `allow-downloads` なし |

---

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `server/index.js` | `/game/:gameId` ルート追加、`/g/` ルートの Host 判定 |
| `public/game.html` | 新規作成（ゲーム詳細ページ） |
| `public/play-public.html` | iframe 属性更新 |
| `public/publish.js` | リダイレクト先を `/game/:gameId` に変更 |

---

## テスト結果

| テスト | URL | 結果 |
|--------|-----|------|
| ゲーム詳細ページ | v2.dreamcore.gg/game/:gameId | 200 |
| play リダイレクト | play.dreamcore.gg/g/:gameId | 302 → index.html |
| ゲーム本体配信 | play.dreamcore.gg/g/:gameId/index.html | 200 + CSP |
| v2 からゲームファイル | v2.dreamcore.gg/g/:gameId/* | 404 |

---

## 追加作業

### Discover ページ（Coming Soon）

- `public/discover.html` を Coming Soon 表示に変更
- 他ページと同じ構造に統一（認証チェック、Supabase lazy loader、5タブ bottom-nav）
- タブナビゲーションのクリックハンドラ追加

### ブランド名統一

- `create.html`: GAME CREATOR → **DreamCore**
- `game.html`: GAME CREATOR → **DreamCore**

### フォントサイズ調整

`.brand-text` の文字が小さすぎたため拡大:

| 環境 | 変更前 | 変更後 |
|------|--------|--------|
| デスクトップ | 0.75rem (12px) | 1.125rem (18px) |
| モバイル | 0.6875rem (11px) | 1rem (16px) |
| letter-spacing | 0.12em | 0.02em |

### TODO 追加

- Bottom Navigation 共通化（各HTMLに直接記述 → JS動的挿入 or Web Components）

---

## 変更ファイル一覧（追加分）

| ファイル | 変更内容 |
|----------|----------|
| `public/discover.html` | Coming Soon + 統一構造 |
| `public/create.html` | ブランド名変更 |
| `public/game.html` | ブランド名変更 |
| `public/style.css` | brand-text フォントサイズ拡大 |
| `docs/IFRAME-SECURITY.md` | 新規作成（iframe セキュリティガイド） |
| `TODO.md` | Bottom Navigation 共通化を追加 |

---

## 参考

- [itch.io のセキュリティモデル](https://itch.io/docs/creators/html5)
- 詳細ドキュメント: `docs/IFRAME-SECURITY.md`
