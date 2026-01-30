# ゲームプレイページのタップハイライト無効化

**日付:** 2026-01-31
**作業者:** Claude

## 背景

`/game/:id` ページで、iframe内をタッチすると iframe 枠全体が一瞬ハイライト（選択状態）になる問題が発生していた。

## 問題の原因

タップハイライトが2箇所から発生していた：

1. **iframe要素自体** - フォーカス時にハイライトされる
2. **iframe内のHTML** - ゲームHTML自体のタップハイライト

さらに、ローカル環境では `playDomain` が `https://play.dreamcore.gg` を指しているため、ローカルの変更が iframe 内に反映されず、テストには本番デプロイが必要だった。

## 実施内容

### 1. game.html（v2.dreamcore.gg/game/:id ラッパー）

**CSS追加:**
- `* { -webkit-tap-highlight-color: transparent }` - 全要素のタップハイライト無効
- `::selection { background: transparent }` - 選択時の背景を透明に
- `.game-frame:focus, .game-frame:focus-visible { outline: none !important }` - フォーカス時のアウトライン無効

**JavaScript追加:**
```javascript
gameFrame.addEventListener('focus', () => {
    gameFrame.blur();
});
```

### 2. play-public.html（play.dreamcore.gg ラッパー）

**CSS追加:**
- `* { -webkit-tap-highlight-color: transparent; -webkit-user-select: none }`
- `::selection { background: transparent }`
- `iframe:focus, iframe:focus-visible { outline: none !important }`

**JavaScript追加:**
```javascript
gameFrame.addEventListener('focus', function() {
    gameFrame.blur();
});
```

### 3. server/index.js（/g/:gameId/* 配信時のCSS注入）

`injectPublicGameHtml` 関数で注入するCSSに以下を追加：
- `-webkit-tap-highlight-color:transparent!important`
- `::selection{background:transparent!important}`

## 試した対策（効果なし）

| 対策 | 結果 |
|------|------|
| `-webkit-tap-highlight-color: transparent` のみ | 効果なし |
| `touch-action: manipulation` | 効果なし |
| `onselectstart="return false"` | 効果なし |
| `tabindex="-1"` | 効果なし |
| タッチイベントで `clearSelection()` | 効果なし |

**原因:** これらはローカルの game.html にのみ適用され、iframe 内のコンテンツ（本番サーバーから配信）には届いていなかった。

## 最終的に効いた対策

1. **iframe の focus イベントで即座に blur()** - iframe 要素自体のハイライトを防止
2. **サーバーサイドでの CSS 注入** - iframe 内の HTML にもタップハイライト無効化を適用

## 発見した問題と対応

| 問題 | 対応 |
|------|------|
| ローカルテストで iframe 内の変更が反映されない | playDomain が本番を指しているため、本番デプロイが必要 |
| CSS だけでは不十分 | JS で focus → blur() を追加 |

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `public/game.html` | tap-highlight無効CSS、:focus/:focus-visible outline無効、iframe blur on focus |
| `public/play-public.html` | 同上 |
| `server/index.js` | injectPublicGameHtml で tap-highlight 無効 CSS を注入 |

## 学び・注意点

1. **iframe 内のスタイルは親ページから制御できない** - サーバーサイドでの HTML 注入が必要
2. **ローカルテストの限界** - iframe が外部ドメインを参照する場合、ローカル変更が反映されない
3. **タップハイライトは複数レイヤーで発生** - 外側（iframe要素）と内側（ゲームHTML）の両方を対策する必要がある
4. **focus → blur() が効果的** - CSS だけでは防げないフォーカスハイライトに有効
