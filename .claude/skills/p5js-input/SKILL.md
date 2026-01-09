---
name: p5js-input
description: P5.js入力処理。キーボード、マウス、タッチ操作の実装パターン。
---

# P5.js 入力処理

## キーボード（連続）

```javascript
function draw() {
  if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) player.x -= 5;   // A
  if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) player.x += 5;  // D
  if (keyIsDown(UP_ARROW) || keyIsDown(87)) player.y -= 5;     // W
  if (keyIsDown(DOWN_ARROW) || keyIsDown(83)) player.y += 5;   // S
}
```

## キーボード（単発）

```javascript
function keyPressed() {
  if (key === ' ') shoot();
  if (keyCode === ENTER) startGame();
  return false; // デフォルト動作を防ぐ
}
```

## マウス

```javascript
function draw() {
  if (mouseIsPressed) {
    // ドラッグ中
  }
}

function mousePressed() {
  if (mouseButton === LEFT) shoot();
}
```

## タッチ（モバイル）

```javascript
function touchStarted() {
  for (let touch of touches) {
    handleTouch(touch.x, touch.y);
  }
  return false; // スクロール防止
}

function touchMoved() {
  return false;
}
```
