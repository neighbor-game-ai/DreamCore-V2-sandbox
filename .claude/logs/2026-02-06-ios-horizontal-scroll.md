# iOS Create ページ 横スクロール問題 - CTO レポート（第2報）

**日付:** 2026-02-06
**ステータス:** 未解決
**影響範囲:** iPhoneのみ（ブラウザ・PWA両方）。Android は問題なし。
**対象ページ:** `/create` のみ。`/mypage`, `/login`, `/@username` は正常。

---

## 症状

- `/create` ページを左右にスワイプすると、画面全体（sticky ヘッダー + fixed ボトムナビ 含む）が横にずれる
- 他のページ（mypage, login, /@username）では発生しない
- Android では完全に正常

## 試したこと（すべて効果なし）

### 第1報の対策（推測ベース CSS、すべて撤去済み）

| # | 対策 | コミット | 結果 |
|---|------|---------|------|
| 1 | `.project-list-view` に `overflow-x: hidden` | `8d2bbb0` | 効果なし |
| 2 | `.project-list-view` に `touch-action: pan-y` + `overscroll-behavior-x: none` | `108b3b0` | 効果なし |
| 3 | `body` に `position: fixed; width: 100%` | `108b3b0` | 効果なし |
| 4 | `html, body` に `overscroll-behavior: none` | `108b3b0` | 効果なし |
| 5 | `.list-header` に `overflow: hidden; max-width: 100vw` | `108b3b0` | 効果なし |
| 6 | `.list-header-right` に `min-width: 0; flex-shrink: 1; overflow: hidden` | `108b3b0` | 効果なし |
| 7 | モバイルで `.quota-display` を非表示 | `108b3b0` | 効果なし |
| 8 | `.list-header-right` の gap を 16px → 8px に縮小 | `108b3b0` | 効果なし |

### 第2報の対策（CTO方針に基づくターゲット修正、効果なし）

| # | 対策 | コミット | 結果 |
|---|------|---------|------|
| 9 | `.create-hero` を `left:50%+transform` → `left:0; right:0` に変更 | `d43fb25` | 効果なし |
| 10 | `.bottom-nav` を `left:50%+transform` → `left:0; right:0; width:fit-content; margin:auto` に変更 | `d43fb25` | 効果なし |
| 11 | `.list-header` の `max-width: 100vw` → `100%` に変更 | `d43fb25` | 効果なし |
| 12 | `html, body` に `overflow-x: clip` 追加 | `d43fb25` | 効果なし |
| 13 | 推測ベース CSS (#2-#4, #7-#8) を全撤去 | `d43fb25` | — |

**特筆:** `left:50% + transform` による中央寄せは原因ではなかった。

## Chromium での検出結果

agent-browser (Chromium) で 375×812 ビューポートで CTO 提供の getBoundingClientRect スクリプトを実行:

```
vw: 375, scrollWidth: 375, offenders: 0
```

**Chromium では再現しない。iOS Safari 固有の問題。**

## 現在の構造比較

### create.html（問題あり）

```
<body data-page="create">
  <div class="project-list-view">    ← スクロールコンテナ (overflow-y: auto)
    <header class="list-header">     ← sticky ヘッダー（7+要素）
    <div class="create-hero">        ← position: fixed（now left:0;right:0）
    <div class="games-section">      ← プロジェクトグリッド + filter-slider
  </div>
  <div class="new-game-modal hidden">  ← display: none !important
  <div class="rename-modal hidden">    ← display: none !important（※要確認）
  <div class="delete-confirm-modal hidden">
  <div class="quota-limit-modal hidden">
  <nav class="bottom-nav">           ← position: fixed（now left:0;right:0;margin:auto）
  <div class="game-start-overlay">   ← inset:0, opacity:0, pointer-events:none
```

### mypage.html（問題なし）

```
<body data-page="mypage">
  <div class="mypage-view">          ← スクロールコンテナ
    <header class="mypage-header">   ← 3要素のみ
    <section>
    <div class="mypage-showcase">
    <div class="mypage-footer">
  </div>
  <nav class="bottom-nav">           ← 同じ CSS（now left:0;right:0;margin:auto）
  <div class="game-start-overlay">
```

### create.html にのみ存在する要素（容疑者リスト）

| 要素 | 状態 | 検証済み？ |
|------|------|-----------|
| `.create-hero` (position: fixed) | left:0;right:0 に変更済み | ✅ 効果なし |
| hidden モーダル 4つ | `.hidden` = `display: none !important` | ✅ レイアウト影響なし |
| `.games-filter-bar` + `.filter-slider` (position: absolute) | JS で width/left 動的制御 | ❌ **未検証** |
| `.project-grid` (CSS Grid auto-fill) | 動的カード生成 | ❌ **未検証** |
| `.list-header` (7+要素) | overflow:hidden + max-width:100% | ✅ 効果なし |
| skeleton カード (inline width) | percentage 値 | ❌ **未検証** |
| `create.js` が生成する動的要素 | 不明 | ❌ **未検証** |

## 判明していること

1. **CSS の静的修正では解決しない** — 13 種類の対策がすべて効果なし
2. **Chromium では再現しない** — iOS Safari 固有
3. **viewport レベルの横スクロール** — sticky ヘッダーも fixed ナビも一緒に動く
4. **`left:50% + transform` は原因ではない** — `left:0; right:0` に変更しても効果なし

## ブロッカー

**iOS Safari 実機でしか再現しないため、犯人特定には Mac + iPhone の Safari Web Inspector が必要。**

Chromium ベースの agent-browser では再現せず、検出スクリプトが offender 0 を返す。

## 次のアクション（CTO 判断を仰ぐ）

### オプション A: Safari Web Inspector で実機デバッグ（推奨）
iPhone を Mac に USB 接続し、Safari の Web Inspector で `/create` ページを開き、以下を実行:

```javascript
(() => {
  const vw = window.visualViewport?.width || document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 0.5 || r.left < -0.5) {
      offenders.push({
        tag: el.tagName,
        cls: el.className,
        id: el.id,
        left: +r.left.toFixed(2),
        right: +r.right.toFixed(2),
        width: +r.width.toFixed(2),
      });
      el.style.outline = '2px solid red';
    }
  });
  console.table(offenders);
  console.log('vw=', vw, 'scrollWidth=', document.scrollingElement.scrollWidth);
})();
```

### オプション B: 要素の段階的削除
create.html から要素を1つずつ削除して、どの要素を消すと横スクロールが消えるか特定する（バイナリサーチ）。

### オプション C: JS 動的要素の調査
`create.js` が生成する DOM を精査。filter-slider の位置計算、プロジェクトカードの生成処理に viewport を超える要素がないか確認。

## 現在の CSS 状態（参考）

```css
/* 保険として残している */
html, body { overflow: hidden; overflow-x: clip; overscroll-behavior: none; }

/* スクロールコンテナ */
.project-list-view { overflow-x: hidden; overflow-y: auto; }

/* ヘッダー */
.list-header { overflow: hidden; max-width: 100%; }
.list-header-right { min-width: 0; overflow: hidden; }

/* 中央寄せ（transform 廃止済み） */
.create-hero { left: 0; right: 0; }
.bottom-nav { left: 0; right: 0; width: fit-content; margin: 0 auto; }
```
