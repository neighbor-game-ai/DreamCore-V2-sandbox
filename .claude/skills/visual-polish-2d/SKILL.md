---
name: visual-polish-2d
description: 2Dゲームのビジュアルポリッシュ。パーティクル、画面効果、UI演出、ジュース効果で見栄えを向上。P5.js/Canvas専用。
---

# 2D Visual Polish for P5.js/Canvas

2Dゲームの見た目を劇的に改善するテクニック集。

## 画面シェイク

```javascript
let shakeAmount = 0;
let shakeDuration = 0;

function screenShake(intensity, duration) {
  shakeAmount = intensity;
  shakeDuration = duration;
}

function applyShake() {
  if (shakeDuration > 0) {
    translate(random(-shakeAmount, shakeAmount), random(-shakeAmount, shakeAmount));
    shakeDuration -= deltaTime / 1000;
    shakeAmount *= 0.9;  // 減衰
  }
}

// draw()の最初に呼ぶ
function draw() {
  push();
  applyShake();
  // ゲーム描画...
  pop();
}

// ダメージ時などに
screenShake(10, 0.3);
```

## ヒットストップ（フリーズフレーム）

```javascript
let hitStopFrames = 0;

function hitStop(frames = 3) {
  hitStopFrames = frames;
}

function draw() {
  if (hitStopFrames > 0) {
    hitStopFrames--;
    return;  // 更新をスキップ
  }
  // 通常のゲーム更新
}

// 強い攻撃ヒット時
hitStop(5);
```

## パーティクルシステム

```javascript
class Particle {
  constructor(x, y, options = {}) {
    this.x = x;
    this.y = y;
    this.vx = options.vx ?? random(-2, 2);
    this.vy = options.vy ?? random(-5, -1);
    this.size = options.size ?? random(3, 8);
    this.color = options.color ?? color(255, 200, 0);
    this.life = options.life ?? 1;
    this.decay = options.decay ?? 0.02;
    this.gravity = options.gravity ?? 0.1;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.life -= this.decay;
    this.size *= 0.98;
  }

  draw() {
    push();
    noStroke();
    const c = this.color;
    fill(red(c), green(c), blue(c), this.life * 255);
    ellipse(this.x, this.y, this.size);
    pop();
  }

  isDead() {
    return this.life <= 0 || this.size < 0.5;
  }
}

let particles = [];

function emitParticles(x, y, count, options = {}) {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, {
      vx: random(-3, 3) * (options.speed ?? 1),
      vy: random(-5, 0) * (options.speed ?? 1),
      color: options.color ?? color(255, random(100, 200), 0),
      ...options
    }));
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].draw();
    if (particles[i].isDead()) particles.splice(i, 1);
  }
}

// 使用例
emitParticles(player.x, player.y, 20, { color: color(255, 0, 0) });
```

## スパーク（火花）エフェクト

```javascript
function emitSparks(x, y, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = random(TWO_PI);
    const speed = random(3, 8);
    particles.push(new Particle(x, y, {
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      size: random(2, 5),
      color: color(255, random(200, 255), 0),
      life: 0.5,
      decay: 0.05,
      gravity: 0.2
    }));
  }
}
```

## トレイル（残像）エフェクト

```javascript
// 方法1: フェードアウト背景
function draw() {
  // 半透明で塗りつぶして残像
  fill(0, 0, 0, 30);
  rect(0, 0, width, height);

  // オブジェクト描画
  drawPlayer();
}

// 方法2: 位置履歴
class TrailEffect {
  constructor(maxLength = 10) {
    this.positions = [];
    this.maxLength = maxLength;
  }

  add(x, y) {
    this.positions.unshift({ x, y });
    if (this.positions.length > this.maxLength) {
      this.positions.pop();
    }
  }

  draw(size, baseColor) {
    noStroke();
    for (let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      const alpha = map(i, 0, this.positions.length, 200, 0);
      const s = map(i, 0, this.positions.length, size, size * 0.3);
      fill(red(baseColor), green(baseColor), blue(baseColor), alpha);
      ellipse(p.x, p.y, s);
    }
  }
}

// 使用例
const playerTrail = new TrailEffect(15);

function draw() {
  background(0);
  playerTrail.add(player.x, player.y);
  playerTrail.draw(30, color(0, 150, 255));
  drawPlayer();
}
```

## 発光エフェクト（グロー）

```javascript
function drawGlow(x, y, size, col, intensity = 3) {
  noStroke();
  for (let i = intensity; i > 0; i--) {
    const alpha = map(i, intensity, 0, 30, 150);
    const s = size + i * 10;
    fill(red(col), green(col), blue(col), alpha);
    ellipse(x, y, s);
  }
  // コア
  fill(255);
  ellipse(x, y, size * 0.5);
}

// 使用例
drawGlow(bullet.x, bullet.y, 10, color(0, 255, 255));
```

## スケールバウンス（取得時など）

```javascript
class ScaleBounce {
  constructor() {
    this.scale = 1;
    this.targetScale = 1;
  }

  pop() {
    this.scale = 1.5;
  }

  update() {
    this.scale = lerp(this.scale, this.targetScale, 0.2);
  }
}

// スコア表示など
const scoreBounce = new ScaleBounce();

function addScore(points) {
  score += points;
  scoreBounce.pop();
}

function drawScore() {
  scoreBounce.update();
  push();
  translate(width - 100, 30);
  scale(scoreBounce.scale);
  textAlign(CENTER, CENTER);
  textSize(24);
  fill(255);
  text(score, 0, 0);
  pop();
}
```

## フラッシュエフェクト

```javascript
let flashAlpha = 0;
let flashColor = color(255);

function flash(col = color(255), intensity = 200) {
  flashColor = col;
  flashAlpha = intensity;
}

function drawFlash() {
  if (flashAlpha > 0) {
    noStroke();
    fill(red(flashColor), green(flashColor), blue(flashColor), flashAlpha);
    rect(0, 0, width, height);
    flashAlpha *= 0.85;
  }
}

// draw()の最後に呼ぶ
function draw() {
  // ゲーム描画...
  drawFlash();
}

// ダメージ時
flash(color(255, 0, 0), 150);
// 回復時
flash(color(0, 255, 0), 100);
```

## スローモーション

```javascript
let timeScale = 1;
let slowMoDuration = 0;

function slowMotion(scale, duration) {
  timeScale = scale;
  slowMoDuration = duration;
}

function getScaledDelta() {
  let dt = deltaTime / 1000;

  if (slowMoDuration > 0) {
    slowMoDuration -= dt;
    dt *= timeScale;
    if (slowMoDuration <= 0) {
      timeScale = 1;
    }
  }

  return dt;
}

// 使用例：ボス撃破時
slowMotion(0.3, 1);  // 0.3倍速で1秒間
```

## 画面遷移（ワイプ/フェード）

```javascript
let transition = {
  active: false,
  type: 'fade',
  progress: 0,
  callback: null
};

function startTransition(type, callback) {
  transition.active = true;
  transition.type = type;
  transition.progress = 0;
  transition.callback = callback;
}

function updateTransition() {
  if (!transition.active) return;

  transition.progress += 0.05;

  if (transition.progress >= 1) {
    if (transition.callback) transition.callback();
    transition.progress = 1;
  }

  // フェードイン（1を超えたら）
  if (transition.progress > 1) {
    transition.progress += 0.05;
    if (transition.progress >= 2) {
      transition.active = false;
    }
  }
}

function drawTransition() {
  if (!transition.active) return;

  const p = transition.progress > 1 ? 2 - transition.progress : transition.progress;

  if (transition.type === 'fade') {
    noStroke();
    fill(0, p * 255);
    rect(0, 0, width, height);
  } else if (transition.type === 'circle') {
    noStroke();
    fill(0);
    const maxRadius = sqrt(width * width + height * height);
    const radius = maxRadius * (1 - p);
    ellipse(width / 2, height / 2, radius * 2);
  }
}

// シーン切り替え
startTransition('fade', () => {
  currentScene = 'game';
});
```

## スクリーンウェーブ（衝撃波）

```javascript
let waves = [];

class ScreenWave {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = max(width, height);
    this.speed = 15;
    this.thickness = 20;
  }

  update() {
    this.radius += this.speed;
  }

  draw() {
    noFill();
    const alpha = map(this.radius, 0, this.maxRadius, 255, 0);
    stroke(255, alpha);
    strokeWeight(this.thickness * (1 - this.radius / this.maxRadius));
    ellipse(this.x, this.y, this.radius * 2);
  }

  isDone() {
    return this.radius > this.maxRadius;
  }
}

function emitWave(x, y) {
  waves.push(new ScreenWave(x, y));
}

function updateWaves() {
  for (let i = waves.length - 1; i >= 0; i--) {
    waves[i].update();
    waves[i].draw();
    if (waves[i].isDone()) waves.splice(i, 1);
  }
}
```

## ズームエフェクト

```javascript
let zoomLevel = 1;
let targetZoom = 1;

function zoomTo(level, duration = 0.5) {
  targetZoom = level;
}

function applyZoom() {
  zoomLevel = lerp(zoomLevel, targetZoom, 0.1);
  translate(width / 2, height / 2);
  scale(zoomLevel);
  translate(-width / 2, -height / 2);
}

function draw() {
  push();
  applyZoom();
  // ゲーム描画
  pop();
}

// ボス登場時
zoomTo(1.5);
setTimeout(() => zoomTo(1), 500);
```

## 完成例：ジューシーなシューティング

```javascript
let player, bullets, enemies, particles;
let score = 0;
let shakeAmount = 0;
const scoreBounce = { scale: 1 };

function setup() {
  createCanvas(windowWidth, windowHeight);
  player = { x: width / 2, y: height - 100, trail: [] };
  bullets = [];
  enemies = [];
  particles = [];
}

function draw() {
  background(10, 10, 30);

  // 画面シェイク適用
  push();
  if (shakeAmount > 0) {
    translate(random(-shakeAmount, shakeAmount), random(-shakeAmount, shakeAmount));
    shakeAmount *= 0.9;
  }

  // 残像背景
  fill(10, 10, 30, 50);
  noStroke();
  rect(0, 0, width, height);

  // プレイヤートレイル
  player.trail.unshift({ x: player.x, y: player.y });
  if (player.trail.length > 10) player.trail.pop();

  for (let i = 0; i < player.trail.length; i++) {
    const t = player.trail[i];
    const alpha = map(i, 0, player.trail.length, 150, 0);
    fill(0, 200, 255, alpha);
    ellipse(t.x, t.y, 30 - i * 2);
  }

  // プレイヤー
  fill(0, 255, 255);
  ellipse(player.x, player.y, 30);

  // 弾丸（グロー付き）
  for (let b of bullets) {
    b.y -= 10;
    // グロー
    for (let i = 3; i > 0; i--) {
      fill(255, 255, 0, 50);
      ellipse(b.x, b.y, 10 + i * 8);
    }
    fill(255);
    ellipse(b.x, b.y, 8);
  }
  bullets = bullets.filter(b => b.y > 0);

  // パーティクル
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 0.02;
    fill(red(p.color), green(p.color), blue(p.color), p.life * 255);
    ellipse(p.x, p.y, p.size * p.life);
    if (p.life <= 0) particles.splice(i, 1);
  }

  pop();

  // UI（シェイク外）
  scoreBounce.scale = lerp(scoreBounce.scale, 1, 0.1);
  push();
  translate(width - 80, 40);
  scale(scoreBounce.scale);
  fill(255);
  textSize(24);
  textAlign(CENTER);
  text(score, 0, 0);
  pop();
}

function shoot() {
  bullets.push({ x: player.x, y: player.y - 20 });
}

function explode(x, y) {
  shakeAmount = 8;
  scoreBounce.scale = 1.3;
  score += 100;

  for (let i = 0; i < 20; i++) {
    const angle = random(TWO_PI);
    const speed = random(2, 6);
    particles.push({
      x, y,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      size: random(5, 12),
      color: color(255, random(100, 200), 0),
      life: 1
    });
  }
}

function touchMoved() {
  player.x = mouseX;
  return false;
}

function touchStarted() {
  shoot();
  return false;
}
```
