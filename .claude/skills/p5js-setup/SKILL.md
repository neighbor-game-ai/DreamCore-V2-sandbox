---
name: p5js-setup
description: P5.js基本セットアップ。CDN、setup/draw構造、インスタンスモード。2Dゲーム作成時に必須。
---

# P5.js 基本セットアップ

## CDN

```html
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.0/lib/p5.min.js"></script>
```

## 基本構造

```javascript
function setup() {
  createCanvas(windowWidth, windowHeight);
}

function draw() {
  background(220);
  // ゲームロジック（60FPS）
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
```

## インスタンスモード（推奨）

```javascript
const game = (p) => {
  let player;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
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

## 便利関数

```javascript
constrain(x, 0, width);  // 範囲制限
dist(x1, y1, x2, y2);    // 距離
random(10);              // 0-10のランダム
random(5, 15);           // 5-15のランダム
```
