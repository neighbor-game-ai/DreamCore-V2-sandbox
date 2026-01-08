# 高度なパーティクル

より高度なパーティクルエフェクトの実装パターン。

## 汎用パーティクルエミッター

```javascript
class ParticleEmitter {
  constructor(options = {}) {
    this.particles = [];
    this.maxParticles = options.maxParticles || 500;

    // デフォルト設定
    this.defaults = {
      x: 0,
      y: 0,
      count: 10,
      spread: TWO_PI,
      angle: -HALF_PI,  // 上向き
      speed: { min: 2, max: 5 },
      size: { min: 3, max: 8 },
      life: { min: 0.5, max: 1 },
      gravity: 0.1,
      friction: 0.98,
      colors: [color(255, 200, 0), color(255, 100, 0)],
      fadeOut: true,
      shrink: true,
      glow: false,
      trail: false
    };
  }

  emit(options = {}) {
    const config = { ...this.defaults, ...options };
    const count = min(config.count, this.maxParticles - this.particles.length);

    for (let i = 0; i < count; i++) {
      const angle = config.angle + random(-config.spread / 2, config.spread / 2);
      const speed = random(config.speed.min, config.speed.max);
      const col = random(config.colors);

      this.particles.push({
        x: config.x + random(-5, 5),
        y: config.y + random(-5, 5),
        vx: cos(angle) * speed,
        vy: sin(angle) * speed,
        size: random(config.size.min, config.size.max),
        originalSize: 0,
        life: random(config.life.min, config.life.max),
        maxLife: 0,
        color: col,
        gravity: config.gravity,
        friction: config.friction,
        fadeOut: config.fadeOut,
        shrink: config.shrink,
        glow: config.glow,
        trail: config.trail ? [] : null,
        rotation: random(TWO_PI),
        rotationSpeed: random(-0.2, 0.2)
      });

      const p = this.particles[this.particles.length - 1];
      p.originalSize = p.size;
      p.maxLife = p.life;
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // トレイル記録
      if (p.trail) {
        p.trail.unshift({ x: p.x, y: p.y });
        if (p.trail.length > 5) p.trail.pop();
      }

      // 物理更新
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      // ライフ更新
      p.life -= deltaTime / 1000;

      // サイズ縮小
      if (p.shrink) {
        p.size = p.originalSize * (p.life / p.maxLife);
      }

      // 削除判定
      if (p.life <= 0 || p.size < 0.5) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw() {
    for (const p of this.particles) {
      const alpha = p.fadeOut ? (p.life / p.maxLife) * 255 : 255;
      const c = p.color;

      push();

      // トレイル描画
      if (p.trail) {
        noStroke();
        for (let i = 0; i < p.trail.length; i++) {
          const t = p.trail[i];
          const a = map(i, 0, p.trail.length, alpha * 0.5, 0);
          fill(red(c), green(c), blue(c), a);
          ellipse(t.x, t.y, p.size * (1 - i / p.trail.length));
        }
      }

      // グロー描画
      if (p.glow) {
        noStroke();
        for (let i = 3; i > 0; i--) {
          fill(red(c), green(c), blue(c), alpha * 0.2);
          ellipse(p.x, p.y, p.size + i * 6);
        }
      }

      // メインパーティクル
      noStroke();
      fill(red(c), green(c), blue(c), alpha);
      translate(p.x, p.y);
      rotate(p.rotation);
      ellipse(0, 0, p.size);

      pop();
    }
  }

  clear() {
    this.particles = [];
  }
}

// グローバルエミッター
const emitter = new ParticleEmitter();

function draw() {
  background(0);
  emitter.update();
  emitter.draw();
}
```

## プリセットエフェクト

```javascript
// 爆発
function explode(x, y, intensity = 1) {
  emitter.emit({
    x, y,
    count: floor(30 * intensity),
    spread: TWO_PI,
    speed: { min: 3 * intensity, max: 8 * intensity },
    size: { min: 4, max: 12 },
    life: { min: 0.3, max: 0.8 },
    gravity: 0.15,
    colors: [color(255, 200, 0), color(255, 100, 0), color(255, 50, 0)],
    glow: true
  });

  // 煙
  emitter.emit({
    x, y,
    count: floor(15 * intensity),
    spread: TWO_PI,
    speed: { min: 1, max: 3 },
    size: { min: 10, max: 25 },
    life: { min: 0.5, max: 1.2 },
    gravity: -0.05,
    friction: 0.95,
    colors: [color(100), color(150), color(80)],
    fadeOut: true,
    shrink: false
  });
}

// 火花
function sparks(x, y, direction = -HALF_PI) {
  emitter.emit({
    x, y,
    count: 15,
    angle: direction,
    spread: PI / 3,
    speed: { min: 5, max: 12 },
    size: { min: 2, max: 5 },
    life: { min: 0.2, max: 0.5 },
    gravity: 0.3,
    colors: [color(255, 255, 200), color(255, 200, 100)],
    trail: true
  });
}

// 紙吹雪
function confetti(x, y) {
  const colors = [
    color(255, 100, 100),
    color(100, 255, 100),
    color(100, 100, 255),
    color(255, 255, 100),
    color(255, 100, 255)
  ];

  emitter.emit({
    x, y,
    count: 50,
    spread: PI / 2,
    angle: -HALF_PI,
    speed: { min: 5, max: 10 },
    size: { min: 5, max: 10 },
    life: { min: 2, max: 4 },
    gravity: 0.08,
    friction: 0.99,
    colors,
    fadeOut: false,
    shrink: false
  });
}

// コイン取得
function coinCollect(x, y) {
  emitter.emit({
    x, y,
    count: 8,
    spread: PI,
    angle: -HALF_PI,
    speed: { min: 2, max: 4 },
    size: { min: 4, max: 8 },
    life: { min: 0.3, max: 0.6 },
    gravity: 0,
    colors: [color(255, 215, 0), color(255, 200, 50)],
    glow: true
  });
}

// ダスト（着地時）
function dustCloud(x, y, direction = 0) {
  emitter.emit({
    x, y,
    count: 10,
    angle: direction,
    spread: PI / 4,
    speed: { min: 1, max: 3 },
    size: { min: 8, max: 15 },
    life: { min: 0.3, max: 0.6 },
    gravity: -0.02,
    friction: 0.9,
    colors: [color(200, 180, 150, 150), color(180, 160, 130, 150)]
  });
}

// 水しぶき
function splash(x, y) {
  // 水滴
  emitter.emit({
    x, y,
    count: 20,
    spread: PI,
    angle: -HALF_PI,
    speed: { min: 3, max: 8 },
    size: { min: 3, max: 8 },
    life: { min: 0.4, max: 0.8 },
    gravity: 0.25,
    colors: [color(100, 180, 255, 200), color(150, 200, 255, 200)],
    trail: true
  });
}

// ヒール/回復
function healEffect(x, y) {
  emitter.emit({
    x, y,
    count: 15,
    spread: TWO_PI,
    speed: { min: 0.5, max: 2 },
    size: { min: 5, max: 10 },
    life: { min: 0.8, max: 1.5 },
    gravity: -0.1,
    colors: [color(100, 255, 150), color(150, 255, 200)],
    glow: true
  });
}

// ダメージ/ヒット
function hitEffect(x, y) {
  emitter.emit({
    x, y,
    count: 12,
    spread: TWO_PI,
    speed: { min: 3, max: 6 },
    size: { min: 3, max: 6 },
    life: { min: 0.15, max: 0.3 },
    gravity: 0,
    friction: 0.85,
    colors: [color(255, 50, 50), color(255, 100, 100)],
    glow: true
  });
}
```

## 連続エミッション（炎、煙など）

```javascript
class ContinuousEmitter {
  constructor(options = {}) {
    this.emitter = new ParticleEmitter();
    this.x = 0;
    this.y = 0;
    this.active = false;
    this.emitRate = options.emitRate || 5;  // パーティクル/フレーム
    this.options = options;
  }

  start(x, y) {
    this.x = x;
    this.y = y;
    this.active = true;
  }

  stop() {
    this.active = false;
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
  }

  update() {
    if (this.active) {
      for (let i = 0; i < this.emitRate; i++) {
        this.emitter.emit({
          x: this.x,
          y: this.y,
          count: 1,
          ...this.options
        });
      }
    }
    this.emitter.update();
  }

  draw() {
    this.emitter.draw();
  }
}

// 炎エミッター
const fireEmitter = new ContinuousEmitter({
  emitRate: 3,
  spread: PI / 6,
  angle: -HALF_PI,
  speed: { min: 1, max: 3 },
  size: { min: 8, max: 15 },
  life: { min: 0.3, max: 0.6 },
  gravity: -0.2,
  colors: [color(255, 100, 0), color(255, 200, 0), color(255, 50, 0)],
  glow: true
});

// 煙エミッター
const smokeEmitter = new ContinuousEmitter({
  emitRate: 2,
  spread: PI / 4,
  angle: -HALF_PI,
  speed: { min: 0.5, max: 1.5 },
  size: { min: 15, max: 30 },
  life: { min: 1, max: 2 },
  gravity: -0.03,
  friction: 0.98,
  colors: [color(100, 100, 100, 150), color(80, 80, 80, 150)],
  shrink: false
});

// 使用例
function draw() {
  background(30);

  fireEmitter.moveTo(mouseX, mouseY);
  fireEmitter.update();
  fireEmitter.draw();

  smokeEmitter.moveTo(mouseX, mouseY - 30);
  smokeEmitter.update();
  smokeEmitter.draw();
}

function mousePressed() {
  fireEmitter.start(mouseX, mouseY);
  smokeEmitter.start(mouseX, mouseY - 30);
}

function mouseReleased() {
  fireEmitter.stop();
  smokeEmitter.stop();
}
```

## テキストパーティクル

```javascript
class TextParticle {
  constructor(x, y, text, options = {}) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.vx = options.vx ?? 0;
    this.vy = options.vy ?? -2;
    this.size = options.size ?? 24;
    this.color = options.color ?? color(255);
    this.life = options.life ?? 1;
    this.maxLife = this.life;
    this.gravity = options.gravity ?? 0;
    this.outline = options.outline ?? true;
  }

  update() {
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= deltaTime / 1000;
  }

  draw() {
    const alpha = (this.life / this.maxLife) * 255;
    const scale = 0.8 + (this.life / this.maxLife) * 0.4;

    push();
    translate(this.x, this.y);
    scale(scale);
    textAlign(CENTER, CENTER);
    textSize(this.size);

    if (this.outline) {
      fill(0, alpha);
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          text(this.text, dx, dy);
        }
      }
    }

    fill(red(this.color), green(this.color), blue(this.color), alpha);
    text(this.text, 0, 0);
    pop();
  }

  isDead() {
    return this.life <= 0;
  }
}

let textParticles = [];

function showDamage(x, y, damage) {
  textParticles.push(new TextParticle(x, y, `-${damage}`, {
    vy: -3,
    color: color(255, 50, 50),
    size: 28
  }));
}

function showScore(x, y, points) {
  textParticles.push(new TextParticle(x, y, `+${points}`, {
    vy: -2,
    color: color(255, 255, 0),
    size: 20
  }));
}

function showCombo(x, y, combo) {
  textParticles.push(new TextParticle(x, y, `${combo} COMBO!`, {
    vy: -1,
    vx: random(-1, 1),
    color: color(255, 150, 0),
    size: 32,
    life: 1.5
  }));
}

function updateTextParticles() {
  for (let i = textParticles.length - 1; i >= 0; i--) {
    textParticles[i].update();
    textParticles[i].draw();
    if (textParticles[i].isDead()) {
      textParticles.splice(i, 1);
    }
  }
}
```

## 星形パーティクル

```javascript
function drawStar(x, y, radius1, radius2, points, rotation = 0) {
  beginShape();
  for (let i = 0; i < points * 2; i++) {
    const angle = (TWO_PI / (points * 2)) * i + rotation - HALF_PI;
    const r = i % 2 === 0 ? radius1 : radius2;
    vertex(x + cos(angle) * r, y + sin(angle) * r);
  }
  endShape(CLOSE);
}

// 星パーティクル用の描画関数を持つパーティクル
class StarParticle extends Particle {
  draw() {
    push();
    noStroke();
    const c = this.color;
    fill(red(c), green(c), blue(c), this.life * 255);
    drawStar(this.x, this.y, this.size, this.size * 0.4, 5, frameCount * 0.1);
    pop();
  }
}

// 星エフェクト
function starBurst(x, y) {
  for (let i = 0; i < 10; i++) {
    const angle = random(TWO_PI);
    const speed = random(2, 5);
    const p = new StarParticle(x, y, {
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      size: random(8, 15),
      color: color(255, 255, random(100, 255)),
      life: 0.8
    });
    particles.push(p);
  }
}
```
