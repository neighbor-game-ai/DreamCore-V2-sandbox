---
name: p5js-setup
description: P5.js基本セットアップ。CDN、setup/draw構造、インスタンスモード、canvas配置、仮想ジョイスティック。2Dゲーム作成時に必須。
---

# P5.js 基本セットアップ

## CDN

```html
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.0/lib/p5.min.js"></script>
```

---

## ★最重要: 仮想画面サイズシステム

**全てのゲームで必須。** どのデバイスでも同じゲーム体験を提供するため、固定の仮想画面サイズを使用する。

### 仮想画面サイズ定数

```javascript
// ★仮想画面サイズ（スマホ縦向き基準）
const VIRTUAL_WIDTH = 390;
const VIRTUAL_HEIGHT = 844;
```

### スケーリング実装

```javascript
const game = (p) => {
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('game-container');
    calculateScale();
  };

  function calculateScale() {
    // デバイス画面に仮想画面をフィットさせる
    const scaleX = p.windowWidth / VIRTUAL_WIDTH;
    const scaleY = p.windowHeight / VIRTUAL_HEIGHT;
    scale = Math.min(scaleX, scaleY);  // アスペクト比を維持

    // センタリング用オフセット
    offsetX = (p.windowWidth - VIRTUAL_WIDTH * scale) / 2;
    offsetY = (p.windowHeight - VIRTUAL_HEIGHT * scale) / 2;
  }

  p.draw = () => {
    p.background(0);  // レターボックス部分の色

    p.push();
    p.translate(offsetX, offsetY);
    p.scale(scale);

    // ★ここからは仮想座標（390x844）で描画
    drawGame();

    p.pop();
  };

  function drawGame() {
    p.background(30);  // ゲーム画面の背景

    // 仮想座標系で描画（どのデバイスでも同じサイズ）
    p.fill(0, 255, 255);
    p.ellipse(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, 50, 50);  // 50pxは常に同じ見た目
  }

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    calculateScale();
  };
};

new p5(game);
```

### タッチ座標の変換

タッチ入力は実際の画面座標なので、仮想座標に変換する必要がある：

```javascript
// 実座標 → 仮想座標に変換
function toVirtualX(screenX) {
  return (screenX - offsetX) / scale;
}

function toVirtualY(screenY) {
  return (screenY - offsetY) / scale;
}

// マウス/タッチ位置を仮想座標で取得
p.mousePressed = () => {
  const vx = toVirtualX(p.mouseX);
  const vy = toVirtualY(p.mouseY);
  // vx, vy は仮想座標（0-390, 0-844の範囲）
};
```

### オブジェクトサイズの目安（仮想座標基準）

| 要素 | 推奨サイズ | 画面に対する割合 |
|------|-----------|-----------------|
| プレイヤー | 40-60px | 約10-15% |
| 敵（小） | 30-40px | 約8-10% |
| 敵（大） | 60-80px | 約15-20% |
| 弾 | 8-16px | 約2-4% |
| アイテム | 30-40px | 約8-10% |
| ボタン | 60-80px | 約15-20% |

### 完全な仮想画面対応テンプレート

```javascript
const VIRTUAL_WIDTH = 390;
const VIRTUAL_HEIGHT = 844;

const game = (p) => {
  let scale = 1, offsetX = 0, offsetY = 0;
  let player = { x: VIRTUAL_WIDTH / 2, y: VIRTUAL_HEIGHT - 100, size: 50 };

  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('game-container');
    p.imageMode(p.CENTER);
    calculateScale();
  };

  function calculateScale() {
    const scaleX = p.windowWidth / VIRTUAL_WIDTH;
    const scaleY = p.windowHeight / VIRTUAL_HEIGHT;
    scale = Math.min(scaleX, scaleY);
    offsetX = (p.windowWidth - VIRTUAL_WIDTH * scale) / 2;
    offsetY = (p.windowHeight - VIRTUAL_HEIGHT * scale) / 2;
  }

  function toVirtualX(x) { return (x - offsetX) / scale; }
  function toVirtualY(y) { return (y - offsetY) / scale; }

  p.draw = () => {
    p.background(0);
    p.push();
    p.translate(offsetX, offsetY);
    p.scale(scale);

    // ゲーム描画（仮想座標系）
    p.background(30);
    p.fill(0, 255, 255);
    p.ellipse(player.x, player.y, player.size, player.size);

    p.pop();
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    calculateScale();
  };

  // タッチ/マウス座標を仮想座標に変換
  p.mousePressed = () => {
    const vx = toVirtualX(p.mouseX);
    const vy = toVirtualY(p.mouseY);
    console.log(`Virtual: ${vx}, ${vy}`);
  };
};

new p5(game);
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

// ★アスペクト比を維持して描画（必須）
// 画像は正方形PNGだが、キャラクターの実際の形状は縦長や横長
function drawSprite(p, img, x, y, displayW, fallbackColor) {
  if (img) {
    const displayH = img.height ? displayW * (img.height / img.width) : displayW;
    p.image(img, x, y, displayW, displayH);
  } else {
    p.fill(fallbackColor || p.color(255, 0, 255));
    p.noStroke();
    p.rect(x - displayW/2, y - displayW/2, displayW, displayW);
  }
}

// 使用例
class Player {
  draw() {
    drawSprite(this.p, assets.player, this.x, this.y, 50, this.p.color(0, 255, 255));
  }
}
```

### ★画像描画の注意（重要）

**画像アセットは正方形PNGですが、キャラクターの実際の形状は縦長や横長です。**
`p.image()` で描画する際は、幅と高さを同じ値にせず、**必ずアスペクト比を計算**してください：

```javascript
// ✅ 正しい: アスペクト比を維持
const img = assets.player;
const displayW = 50;
const displayH = img.height ? displayW * (img.height / img.width) : displayW;
p.image(img, x, y, displayW, displayH);

// ❌ 禁止: 正方形固定（キャラが潰れる）
p.image(img, x, y, 50, 50);
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

        // ゲーム描画（★アスペクト比を維持）
        if (assets.player) {
          const pw = 50;
          const ph = assets.player.height ? pw * (assets.player.height / assets.player.width) : pw;
          p.image(assets.player, p.width/2, p.height/2, pw, ph);
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

## 仮想ジョイスティック（モバイル対応）

**外部ライブラリ不要** - 軽量カスタム実装。

### HTML

```html
<div id="joystick-zone" style="
  position: fixed;
  bottom: calc(30px + env(safe-area-inset-bottom));
  left: 20px;
  width: 120px;
  height: 120px;
  z-index: 50;
  touch-action: none;
"></div>
```

### VirtualJoystick クラス

```javascript
class VirtualJoystick {
  constructor(container, options = {}) {
    this.container = container;
    this.radius = options.radius || 50;
    this.innerRadius = options.innerRadius || 25;
    this.color = options.color || 'rgba(255,255,255,0.5)';
    this.active = false;
    this.vector = { x: 0, y: 0 };
    this.startPos = { x: 0, y: 0 };
    this.createElements();
    this.bindEvents();
  }

  createElements() {
    this.base = document.createElement('div');
    this.base.style.cssText = `
      position: absolute;
      width: ${this.radius * 2}px;
      height: ${this.radius * 2}px;
      background: rgba(255,255,255,0.2);
      border: 3px solid ${this.color};
      border-radius: 50%;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    `;

    this.stick = document.createElement('div');
    this.stick.style.cssText = `
      position: absolute;
      width: ${this.innerRadius * 2}px;
      height: ${this.innerRadius * 2}px;
      background: ${this.color};
      border-radius: 50%;
      left: 50%;
      top: 50%;
      margin-left: -${this.innerRadius}px;
      margin-top: -${this.innerRadius}px;
    `;

    this.base.appendChild(this.stick);
    this.container.appendChild(this.base);
  }

  bindEvents() {
    this.container.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    this.container.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    this.container.addEventListener('touchend', () => this.onEnd());
    this.container.addEventListener('touchcancel', () => this.onEnd());

    // PC デバッグ用
    this.container.addEventListener('mousedown', (e) => this.onMouseStart(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', () => this.onMouseEnd());
  }

  onStart(e) {
    e.preventDefault();
    this.active = true;
    const rect = this.base.getBoundingClientRect();
    this.startPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  onMove(e) {
    if (!this.active) return;
    e.preventDefault();
    this.updatePosition(e.touches[0].clientX, e.touches[0].clientY);
  }

  onEnd() {
    this.active = false;
    this.stick.style.transform = 'translate(0px, 0px)';
    this.vector = { x: 0, y: 0 };
  }

  onMouseStart(e) {
    this.active = true;
    const rect = this.base.getBoundingClientRect();
    this.startPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  onMouseMove(e) {
    if (!this.active) return;
    this.updatePosition(e.clientX, e.clientY);
  }

  onMouseEnd() {
    if (!this.active) return;
    this.onEnd();
  }

  updatePosition(clientX, clientY) {
    const dx = clientX - this.startPos.x;
    const dy = clientY - this.startPos.y;
    const maxDistance = this.radius - this.innerRadius;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);

    const clampedX = Math.cos(angle) * distance;
    const clampedY = Math.sin(angle) * distance;

    this.stick.style.transform = `translate(${clampedX}px, ${clampedY}px)`;

    // ★Y軸: 上に倒す → マイナス値（P5.jsのY座標系に合わせる）
    this.vector = {
      x: clampedX / maxDistance,
      y: clampedY / maxDistance  // P5.jsはY軸が下向き正なので反転しない
    };
  }

  getVector() {
    return this.vector;
  }
}
```

### P5.js での使用例

```javascript
let joystick;
let player;

const game = (p) => {
  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('game-container');
    player = { x: p.width / 2, y: p.height / 2 };

    // ジョイスティック初期化
    joystick = new VirtualJoystick(document.getElementById('joystick-zone'));
  };

  p.draw = () => {
    p.background(30);

    // ★ジョイスティックの入力を取得
    const input = joystick.getVector();
    const speed = 5;

    player.x += input.x * speed;
    player.y += input.y * speed;

    // 画面内に制限
    player.x = p.constrain(player.x, 25, p.width - 25);
    player.y = p.constrain(player.y, 25, p.height - 25);

    // プレイヤー描画
    p.fill(0, 255, 255);
    p.noStroke();
    p.ellipse(player.x, player.y, 50, 50);
  };
};

new p5(game);
```

### ジョイスティック + 発射ボタン

```html
<div id="joystick-zone" style="position:fixed; bottom:30px; left:20px; width:120px; height:120px; z-index:50; touch-action:none;"></div>
<button id="fire-btn" style="position:fixed; bottom:50px; right:30px; width:80px; height:80px; border-radius:50%; z-index:100; font-size:20px;">🔥</button>
```

```javascript
let joystick;
const input = { fire: false };

// 発射ボタン
document.getElementById('fire-btn').addEventListener('pointerdown', () => input.fire = true);
document.getElementById('fire-btn').addEventListener('pointerup', () => input.fire = false);

p.draw = () => {
  const move = joystick.getVector();
  player.x += move.x * 5;
  player.y += move.y * 5;

  if (input.fire) {
    shoot();
    input.fire = false;  // 連射防止
  }
};
```

### CSS（ジョイスティック用）

```css
#joystick-zone {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

/* モバイル判定で表示切替 */
@media (hover: hover) and (pointer: fine) {
  /* PC: ジョイスティック非表示（キーボード操作） */
  #joystick-zone { display: none; }
}

@media (hover: none) or (pointer: coarse) {
  /* モバイル: ジョイスティック表示 */
  #joystick-zone { display: block; }
}
```

---

## チェックリスト

- [ ] `createCanvas().parent('game-container')` を使用
- [ ] `#game-container canvas { z-index: 1 }` で最背面に
- [ ] `#controls { z-index: 100 }` でcanvasより上に
- [ ] `pointer-events: auto` をボタンに設定
- [ ] 画像読み込み失敗時のフォールバック描画
- [ ] `pointerdown`/`pointerup` でモバイル対応
- [ ] 仮想ジョイスティック使用時は `z-index: 50` で配置

---

## 禁止

- `createCanvas()` を `.parent()` なしで使う → canvasが画面外に行く
- canvasのz-indexを高くする → ボタンが押せなくなる
- `#controls`にz-indexを設定しない → canvasの後ろに隠れる
- `pointer-events`を設定しない → クリックが透過しない
- `click` イベントのみ使用 → モバイルで反応悪い
- 画像読み込み失敗を無視 → 透明になって見えない
- ジョイスティックに `{ passive: false }` を忘れる → スクロールされてしまう
