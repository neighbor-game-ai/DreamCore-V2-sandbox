---
name: p5js-setup
description: P5.js基本セットアップ。CDN、setup/draw構造、インスタンスモード、canvas配置。2Dゲーム作成時に必須。
---

# P5.js 基本セットアップ

## CDN

```html
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.0/lib/p5.min.js"></script>
```

---

## 重要: Canvas配置問題

**P5.jsはデフォルトでcanvasを`body`直下に追加する。**
`#game-container`が100vhを占有すると、canvasが画面外に押し出されて「真っ暗」になる。

### 解決策: `.parent()` を必ず使う

```javascript
p.setup = () => {
  const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
  canvas.parent('game-container');  // ★必須！これでUIと同じコンテナに入る
};
```

### CSS: Z-indexレイヤー管理（超重要）

**canvasがUI/コントローラーの上に来ると操作不能になる。**
必ずcanvasを最背面（z-index: 1）に、UI要素を前面に配置する。

```css
#game-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

/* ★canvasは最背面 */
#game-container canvas {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1 !important;  /* 必ず低い値 */
}

/* ★UI要素は前面に */
#ui-layer {
  position: absolute;
  z-index: 10;
  pointer-events: auto;  /* クリック可能 */
}

#controls {
  position: absolute;
  z-index: 100;  /* コントローラーは最前面 */
  pointer-events: auto;
}

#start-overlay,
#result-overlay {
  position: fixed;
  z-index: 1000;  /* オーバーレイは最上位 */
  pointer-events: auto;
}

/* ボタンが確実にクリック可能 */
button, .btn, [role="button"] {
  position: relative;
  z-index: inherit;
  pointer-events: auto;
  cursor: pointer;
}
```

### Z-indexレイヤー順序

| レイヤー | z-index | 用途 |
|---------|---------|------|
| canvas | 1 | ゲーム描画（最背面） |
| ui-layer | 10 | スコア、HP表示 |
| controls | 100 | 操作ボタン |
| overlay | 1000 | スタート/リザルト画面 |

---

## インスタンスモード（推奨）

```javascript
const game = (p) => {
  let player;

  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('game-container');  // ★必須
    player = { x: p.width / 2, y: p.height / 2 };
  };

  p.draw = () => {
    p.background(0);
    p.ellipse(player.x, player.y, 50, 50);
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
};

new p5(game);
```

---

## グローバルモード

```javascript
function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('game-container');  // ★必須
}

function draw() {
  background(220);
  // ゲームロジック（60FPS）
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
```

---

## 画像読み込み（フォールバック付き）

画像が404の場合、透明になってしまうのを防ぐ：

```javascript
const assets = {};

p.preload = () => {
  // 読み込み失敗時はnullにする
  assets.player = p.loadImage('assets/player.png', null, () => assets.player = null);
  assets.enemy = p.loadImage('assets/enemy.png', null, () => assets.enemy = null);
};

// 描画時のフォールバック
function drawSprite(p, img, x, y, w, h, fallbackColor) {
  if (img) {
    p.image(img, x, y, w, h);
  } else {
    p.fill(fallbackColor || p.color(255, 0, 255));
    p.noStroke();
    p.rect(x - w/2, y - h/2, w, h);
  }
}

// 使用例
class Player {
  draw() {
    drawSprite(this.p, assets.player, this.x, this.y, 50, 50, this.p.color(0, 255, 255));
  }
}
```

---

## モバイル対応イベント

`click`より`pointerdown`が確実：

```javascript
// 開始ボタン
document.getElementById('start-btn').addEventListener('pointerdown', () => {
  startGame();
});

// タッチ操作
document.getElementById('left-btn').addEventListener('pointerdown', () => {
  player.moveLeft = true;
});
document.getElementById('left-btn').addEventListener('pointerup', () => {
  player.moveLeft = false;
});
```

---

## 完全なHTML構造

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>P5.js Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; touch-action: none; }

    #game-container {
      position: relative;
      width: 100%;
      height: 100vh;
      background: #000;
    }

    /* ★canvasは最背面（z-index: 1） */
    #game-container canvas {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 1 !important;
    }

    /* ★UI表示（z-index: 10） */
    #ui-layer {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 10;
      color: white;
      font-family: sans-serif;
      pointer-events: none;  /* 表示のみ、クリック透過 */
    }

    /* ★操作ボタン（z-index: 100）- 必ずcanvasより上 */
    #controls {
      position: absolute;
      bottom: 20px;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      gap: 20px;
      z-index: 100;
      pointer-events: auto;
    }

    #controls button {
      width: 70px;
      height: 70px;
      border-radius: 50%;
      font-size: 24px;
      background: rgba(255,255,255,0.3);
      border: 2px solid white;
      color: white;
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    }

    #controls button:active {
      background: rgba(255,255,255,0.6);
    }

    /* ★オーバーレイ（z-index: 1000）- 最前面 */
    #start-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;  /* ★最前面 */
      pointer-events: auto;
    }

    #start-btn {
      padding: 20px 40px;
      font-size: 24px;
      cursor: pointer;
      pointer-events: auto;
    }
  </style>
</head>
<body>
  <div id="game-container">
    <div id="ui-layer">
      <div id="score">Score: 0</div>
    </div>
    <!-- ★操作ボタン（canvasより上のz-index: 100） -->
    <div id="controls">
      <button id="left-btn">◀</button>
      <button id="fire-btn">●</button>
      <button id="right-btn">▶</button>
    </div>
  </div>

  <!-- ★スタート画面（z-index: 1000） -->
  <div id="start-overlay">
    <button id="start-btn">START</button>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/p5@1.11.0/lib/p5.min.js"></script>
  <script>
    const assets = {};
    let gameStarted = false;

    const game = (p) => {
      p.preload = () => {
        assets.player = p.loadImage('assets/player.png', null, () => assets.player = null);
      };

      p.setup = () => {
        const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
        canvas.parent('game-container');  // ★これが重要！
      };

      p.draw = () => {
        p.background(30);

        if (!gameStarted) return;

        // ゲーム描画
        if (assets.player) {
          p.image(assets.player, p.width/2, p.height/2, 50, 50);
        } else {
          p.fill(0, 255, 255);
          p.rect(p.width/2 - 25, p.height/2 - 25, 50, 50);
        }
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      };
    };

    new p5(game);

    // ★入力状態
    const input = { left: false, right: false, fire: false };

    // ★スタートボタン
    document.getElementById('start-btn').addEventListener('pointerdown', () => {
      document.getElementById('start-overlay').style.display = 'none';
      gameStarted = true;
    });

    // ★操作ボタン（z-index: 100でcanvasの上にあるので動作する）
    function setupBtn(id, key) {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); input[key] = true; });
      btn.addEventListener('pointerup', () => input[key] = false);
      btn.addEventListener('pointerleave', () => input[key] = false);
    }
    setupBtn('left-btn', 'left');
    setupBtn('right-btn', 'right');
    setupBtn('fire-btn', 'fire');
  </script>
</body>
</html>
```

---

## チェックリスト

- [ ] `createCanvas().parent('game-container')` を使用
- [ ] `#game-container canvas { z-index: 1 }` で最背面に
- [ ] `#controls { z-index: 100 }` でcanvasより上に
- [ ] `pointer-events: auto` をボタンに設定
- [ ] 画像読み込み失敗時のフォールバック描画
- [ ] `pointerdown`/`pointerup` でモバイル対応

---

## 禁止

- `createCanvas()` を `.parent()` なしで使う → canvasが画面外に行く
- canvasのz-indexを高くする → ボタンが押せなくなる
- `#controls`にz-indexを設定しない → canvasの後ろに隠れる
- `pointer-events`を設定しない → クリックが透過しない
- `click` イベントのみ使用 → モバイルで反応悪い
- 画像読み込み失敗を無視 → 透明になって見えない
