# マイページ公開ゲームリンク修正 & iframe専用制限

**日付:** 2026-01-31

## 概要

マイページから公開ゲームへのリンクが機能していない問題を修正。さらに、`play.dreamcore.gg` への直接アクセスをブロックし、iframe 経由のみで閲覧可能にする制限を追加。

## 問題

### 1. リンク先の間違い

マイページ（mypage.js）で公開ゲームをクリックした際のリンク先が間違っていた：

| 項目 | 修正前（誤） | 修正後（正） |
|------|-------------|-------------|
| URL形式 | `/play/${projectId}` | `/game/${gameId}` |
| 使用するID | `project_id` | `published_games.id` |
| 用途 | owner-only プレビュー | 公開ゲーム閲覧 |

### 2. 直接アクセス可能な状態

`play.dreamcore.gg/g/:gameId` に直接ブラウザからアクセスできてしまう状態だった。

## 修正内容

### 1. mypage.js のリンク修正

**変更ファイル:** `public/mypage.js`

```javascript
// 修正前
<div class="mypage-game-case" data-project-id="${game.id}">
// クリック時
window.location.href = `/play/${projectId}`;

// 修正後
const gameId = game.publishedGameId;
<div class="mypage-game-case" data-game-id="${gameId}">
// クリック時
window.location.href = `/game/${gameId}`;
```

### 2. play.dreamcore.gg の iframe 専用制限

**変更ファイル:** `server/index.js`

`Sec-Fetch-Dest` ヘッダーを使用して直接アクセスをブロック：

```javascript
// GET /g/:gameId
const secFetchDest = req.headers['sec-fetch-dest'];
if (secFetchDest === 'document') {
  return res.status(403).send('This game can only be played within DreamCore');
}

// GET /g/:gameId/*
if (secFetchDest === 'document' && filename.endsWith('.html')) {
  return res.status(403).send('This game can only be played within DreamCore');
}
```

## Sec-Fetch-Dest ヘッダーについて

ブラウザが自動的に付与するヘッダーで、リクエストの目的を示す：

| 値 | 意味 | 対応 |
|---|---|---|
| `document` | アドレスバーから直接アクセス | ブロック |
| `iframe` | iframe 内から読み込み | 許可 |
| `script` | `<script>` で読み込み | 許可 |
| `style` | `<link>` で読み込み | 許可 |
| `image` | `<img>` で読み込み | 許可 |

**セキュリティ:** `Sec-Fetch-*` ヘッダーは Forbidden header であり、JavaScript から偽装できない。Referer より信頼性が高い。

## アーキテクチャ

```
v2.dreamcore.gg/game/:gameId
  └── game.html (iframe を含む)
        └── iframe src="play.dreamcore.gg/g/:gameId/index.html"
              └── Sec-Fetch-Dest: iframe → 許可
                  └── ゲームのサブリソース（js, css, 画像）も許可

play.dreamcore.gg/g/:gameId（直接アクセス）
  └── Sec-Fetch-Dest: document → 403 ブロック
```

## 変更ファイル一覧

- `public/mypage.js` - 公開ゲームリンクを `/game/:gameId` に修正
- `server/index.js` - `/g/:gameId` への直接アクセスをブロック

## コミット

1. `fix: マイページの公開ゲームリンクを修正`
2. `fix: 公開ゲームリンクを /game/:gameId に修正`
3. `feat: play.dreamcore.gg を iframe 専用に制限`

## 動作確認

- [x] マイページから公開ゲームをクリック → `/game/:gameId` に遷移
- [x] ゲームが iframe 内で正常に表示される
- [x] `play.dreamcore.gg/g/:gameId` への直接アクセス → 403 エラー
- [x] ゲーム内のサブリソース（js, css, 画像）は正常に読み込まれる
