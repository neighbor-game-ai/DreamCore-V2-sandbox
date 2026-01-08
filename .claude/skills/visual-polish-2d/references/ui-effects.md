# UI演出

ゲームUIを魅力的にする演出テクニック。

## 数値カウントアップ

```javascript
class CountUpNumber {
  constructor(x, y, options = {}) {
    this.x = x;
    this.y = y;
    this.current = 0;
    this.target = 0;
    this.speed = options.speed || 0.1;
    this.size = options.size || 32;
    this.color = options.color || color(255);
    this.prefix = options.prefix || '';
    this.suffix = options.suffix || '';
  }

  setTarget(value) {
    this.target = value;
  }

  add(value) {
    this.target += value;
  }

  update() {
    this.current = lerp(this.current, this.target, this.speed);
    if (abs(this.current - this.target) < 1) {
      this.current = this.target;
    }
  }

  draw() {
    push();
    textAlign(CENTER, CENTER);
    textSize(this.size);
    fill(this.color);

    // 数値変化中は少し大きく
    const scale = this.current !== this.target ? 1.1 : 1;
    translate(this.x, this.y);
    scale(scale);

    text(this.prefix + floor(this.current) + this.suffix, 0, 0);
    pop();
  }
}

// 使用例
const scoreDisplay = new CountUpNumber(width / 2, 50, {
  prefix: 'SCORE: ',
  size: 28
});

function addScore(points) {
  scoreDisplay.add(points);
}

function draw() {
  scoreDisplay.update();
  scoreDisplay.draw();
}
```

## バウンス付きスコア表示

```javascript
class BouncyScore {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.score = 0;
    this.displayScore = 0;
    this.scale = 1;
    this.targetScale = 1;
    this.rotation = 0;
  }

  add(points) {
    this.score += points;
    this.scale = 1.5;  // ポップ
    this.rotation = random(-0.1, 0.1);
  }

  update() {
    // スコア追従
    this.displayScore = lerp(this.displayScore, this.score, 0.1);

    // スケール戻り
    this.scale = lerp(this.scale, this.targetScale, 0.15);
    this.rotation = lerp(this.rotation, 0, 0.1);
  }

  draw() {
    push();
    translate(this.x, this.y);
    rotate(this.rotation);
    scale(this.scale);

    textAlign(CENTER, CENTER);
    textSize(36);

    // 影
    fill(0, 100);
    text(floor(this.displayScore), 2, 2);

    // メイン
    fill(255, 220, 0);
    text(floor(this.displayScore), 0, 0);

    pop();
  }
}

const bouncyScore = new BouncyScore(width - 100, 40);
```

## コンボ表示

```javascript
class ComboDisplay {
  constructor() {
    this.combo = 0;
    this.timer = 0;
    this.maxTime = 2;  // 2秒でリセット
    this.scale = 1;
    this.shake = 0;
  }

  hit() {
    this.combo++;
    this.timer = this.maxTime;
    this.scale = 1.5;
    this.shake = 5;
  }

  update() {
    this.timer -= deltaTime / 1000;
    if (this.timer <= 0) {
      this.combo = 0;
    }

    this.scale = lerp(this.scale, 1, 0.1);
    this.shake *= 0.9;
  }

  draw() {
    if (this.combo <= 1) return;

    push();
    translate(width / 2, height / 3);
    translate(random(-this.shake, this.shake), random(-this.shake, this.shake));
    scale(this.scale);

    textAlign(CENTER, CENTER);

    // コンボ数
    textSize(48);
    fill(255, 100 + this.combo * 20, 0);
    text(this.combo, 0, 0);

    // COMBO テキスト
    textSize(20);
    fill(255);
    text('COMBO', 0, 35);

    // タイマーバー
    const barWidth = 100;
    const progress = this.timer / this.maxTime;
    noStroke();
    fill(50);
    rect(-barWidth / 2, 55, barWidth, 5, 2);
    fill(255, 200, 0);
    rect(-barWidth / 2, 55, barWidth * progress, 5, 2);

    pop();
  }
}

const comboDisplay = new ComboDisplay();
```

## HPバー

```javascript
class HPBar {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.maxHP = 100;
    this.currentHP = 100;
    this.displayHP = 100;
    this.damageHP = 100;  // ダメージ表示用（遅延）
  }

  setHP(value) {
    this.currentHP = constrain(value, 0, this.maxHP);
  }

  damage(amount) {
    this.currentHP = max(0, this.currentHP - amount);
  }

  heal(amount) {
    this.currentHP = min(this.maxHP, this.currentHP + amount);
  }

  update() {
    // 現在値への追従
    this.displayHP = lerp(this.displayHP, this.currentHP, 0.2);

    // ダメージ表示（遅延）
    if (this.damageHP > this.currentHP) {
      this.damageHP = lerp(this.damageHP, this.currentHP, 0.05);
    } else {
      this.damageHP = this.currentHP;
    }
  }

  draw() {
    push();

    // 背景
    noStroke();
    fill(30);
    rect(this.x, this.y, this.width, this.height, 3);

    // ダメージ部分（赤）
    const damageWidth = (this.damageHP / this.maxHP) * this.width;
    fill(200, 50, 50);
    rect(this.x, this.y, damageWidth, this.height, 3);

    // 現在HP
    const hpWidth = (this.displayHP / this.maxHP) * this.width;
    const hpRatio = this.currentHP / this.maxHP;

    // 色を残量で変化
    let barColor;
    if (hpRatio > 0.5) {
      barColor = color(100, 200, 100);
    } else if (hpRatio > 0.25) {
      barColor = color(200, 200, 100);
    } else {
      barColor = color(200, 100, 100);
    }

    fill(barColor);
    rect(this.x, this.y, hpWidth, this.height, 3);

    // ハイライト
    fill(255, 50);
    rect(this.x, this.y, hpWidth, this.height / 3, 3);

    // 枠
    noFill();
    stroke(255, 100);
    strokeWeight(2);
    rect(this.x, this.y, this.width, this.height, 3);

    // 数値
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(this.height * 0.7);
    text(`${floor(this.currentHP)}/${this.maxHP}`, this.x + this.width / 2, this.y + this.height / 2);

    pop();
  }
}

const playerHP = new HPBar(20, 20, 200, 25);
```

## ボタン

```javascript
class GameButton {
  constructor(x, y, w, h, label) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.label = label;
    this.scale = 1;
    this.hovered = false;
    this.pressed = false;
    this.enabled = true;
    this.onClick = null;
  }

  update() {
    const mx = mouseX;
    const my = mouseY;

    this.hovered = mx > this.x - this.width / 2 &&
                   mx < this.x + this.width / 2 &&
                   my > this.y - this.height / 2 &&
                   my < this.y + this.height / 2;

    // スケールアニメーション
    const targetScale = this.hovered ? 1.1 : 1;
    this.scale = lerp(this.scale, targetScale, 0.2);
  }

  draw() {
    push();
    translate(this.x, this.y);
    scale(this.scale);

    // 影
    noStroke();
    fill(0, 50);
    rect(3, 3, this.width, this.height, 10);

    // ボタン本体
    if (!this.enabled) {
      fill(100);
    } else if (this.pressed) {
      fill(80, 120, 200);
    } else if (this.hovered) {
      fill(120, 160, 255);
    } else {
      fill(100, 140, 220);
    }
    rect(0, 0, this.width, this.height, 10);

    // ハイライト
    fill(255, 40);
    rect(0, -this.height / 4, this.width, this.height / 2, 10);

    // ラベル
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(this.height * 0.4);
    text(this.label, 0, 0);

    pop();
  }

  handlePress() {
    if (this.hovered && this.enabled) {
      this.pressed = true;
    }
  }

  handleRelease() {
    if (this.pressed && this.hovered && this.onClick) {
      this.onClick();
    }
    this.pressed = false;
  }
}

// 使用例
const startButton = new GameButton(width / 2, height / 2, 200, 60, 'START');
startButton.onClick = () => {
  gameState = 'playing';
};

function draw() {
  startButton.update();
  startButton.draw();
}

function mousePressed() {
  startButton.handlePress();
}

function mouseReleased() {
  startButton.handleRelease();
}
```

## 通知/トースト

```javascript
class Toast {
  constructor() {
    this.messages = [];
  }

  show(text, options = {}) {
    this.messages.push({
      text,
      x: width / 2,
      y: height,
      targetY: height - 80,
      life: options.duration || 2,
      color: options.color || color(255),
      bgColor: options.bgColor || color(0, 200),
      size: options.size || 20
    });
  }

  update() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];

      // スライドイン
      m.y = lerp(m.y, m.targetY, 0.1);

      // ライフ減少
      m.life -= deltaTime / 1000;

      // フェードアウト開始
      if (m.life < 0.5) {
        m.targetY = height + 50;
      }

      if (m.life <= 0) {
        this.messages.splice(i, 1);
      }
    }
  }

  draw() {
    for (const m of this.messages) {
      const alpha = min(m.life * 2, 1) * 255;

      push();
      translate(m.x, m.y);

      // 背景
      textSize(m.size);
      const tw = textWidth(m.text) + 40;
      rectMode(CENTER);
      fill(red(m.bgColor), green(m.bgColor), blue(m.bgColor), alpha * 0.8);
      rect(0, 0, tw, m.size + 20, 10);

      // テキスト
      fill(red(m.color), green(m.color), blue(m.color), alpha);
      textAlign(CENTER, CENTER);
      text(m.text, 0, 0);

      pop();
    }
  }
}

const toast = new Toast();

// 使用例
toast.show('ゲーム開始！', { color: color(100, 255, 100) });
toast.show('ハイスコア更新！', { color: color(255, 200, 0), duration: 3 });
```

## ポーズ画面オーバーレイ

```javascript
let pauseAlpha = 0;
let isPaused = false;

function togglePause() {
  isPaused = !isPaused;
}

function updatePauseOverlay() {
  const targetAlpha = isPaused ? 200 : 0;
  pauseAlpha = lerp(pauseAlpha, targetAlpha, 0.1);
}

function drawPauseOverlay() {
  if (pauseAlpha < 1) return;

  push();

  // 暗いオーバーレイ
  fill(0, pauseAlpha);
  rect(0, 0, width, height);

  // ぼかし効果（グリッドパターン）
  if (pauseAlpha > 100) {
    stroke(255, 20);
    for (let x = 0; x < width; x += 20) {
      line(x, 0, x, height);
    }
    for (let y = 0; y < height; y += 20) {
      line(0, y, width, y);
    }
  }

  // PAUSED テキスト
  const textAlpha = map(pauseAlpha, 0, 200, 0, 255);
  textAlign(CENTER, CENTER);
  textSize(48);

  // 影
  fill(0, textAlpha);
  text('PAUSED', width / 2 + 3, height / 2 + 3);

  // メイン
  fill(255, textAlpha);
  text('PAUSED', width / 2, height / 2);

  // サブテキスト
  textSize(20);
  fill(200, textAlpha);
  text('Tap to resume', width / 2, height / 2 + 50);

  pop();
}
```

## レベルアップ演出

```javascript
class LevelUpEffect {
  constructor() {
    this.active = false;
    this.progress = 0;
    this.level = 1;
  }

  trigger(newLevel) {
    this.active = true;
    this.progress = 0;
    this.level = newLevel;
  }

  update() {
    if (!this.active) return;

    this.progress += 0.02;
    if (this.progress >= 1) {
      this.active = false;
    }
  }

  draw() {
    if (!this.active) return;

    push();

    // フラッシュ
    if (this.progress < 0.1) {
      fill(255, 255, 200, (1 - this.progress / 0.1) * 200);
      rect(0, 0, width, height);
    }

    // テキスト
    const textProgress = constrain((this.progress - 0.1) / 0.3, 0, 1);
    const fadeProgress = constrain((this.progress - 0.7) / 0.3, 0, 1);

    translate(width / 2, height / 2);

    // スケールイン
    const s = 0.5 + textProgress * 0.5;
    scale(s);

    // アルファ
    const alpha = (1 - fadeProgress) * 255;

    textAlign(CENTER, CENTER);

    // LEVEL UP
    textSize(60);
    fill(255, 220, 0, alpha);
    text('LEVEL UP!', 0, -30);

    // レベル数
    textSize(80);
    fill(255, alpha);
    text(this.level, 0, 50);

    pop();
  }
}

const levelUpEffect = new LevelUpEffect();

// レベルアップ時
levelUpEffect.trigger(5);
```

## カウントダウン

```javascript
class Countdown {
  constructor(onComplete) {
    this.count = 3;
    this.progress = 0;
    this.active = false;
    this.onComplete = onComplete;
  }

  start() {
    this.count = 3;
    this.progress = 0;
    this.active = true;
  }

  update() {
    if (!this.active) return;

    this.progress += deltaTime / 1000;

    if (this.progress >= 1) {
      this.progress = 0;
      this.count--;

      if (this.count < 0) {
        this.active = false;
        if (this.onComplete) this.onComplete();
      }
    }
  }

  draw() {
    if (!this.active) return;

    push();
    translate(width / 2, height / 2);

    // スケールアニメーション
    const scale = 1 + (1 - this.progress) * 0.5;
    const alpha = this.progress < 0.8 ? 255 : (1 - this.progress) / 0.2 * 255;

    scale(scale);

    textAlign(CENTER, CENTER);
    textSize(120);

    // 影
    fill(0, alpha * 0.5);
    text(this.count > 0 ? this.count : 'GO!', 3, 3);

    // メイン
    if (this.count > 0) {
      fill(255, alpha);
    } else {
      fill(255, 200, 0, alpha);
    }
    text(this.count > 0 ? this.count : 'GO!', 0, 0);

    pop();
  }
}

const countdown = new Countdown(() => {
  gameState = 'playing';
});

// ゲーム開始時
countdown.start();
```

## ミニマップ

```javascript
class Minimap {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.worldWidth = 1000;
    this.worldHeight = 1000;
  }

  worldToMap(wx, wy) {
    return {
      x: this.x + (wx / this.worldWidth) * this.width,
      y: this.y + (wy / this.worldHeight) * this.height
    };
  }

  draw(player, enemies, items) {
    push();

    // 背景
    fill(0, 150);
    stroke(255, 100);
    strokeWeight(2);
    rect(this.x, this.y, this.width, this.height, 5);

    noStroke();

    // アイテム
    fill(255, 255, 0);
    for (const item of items) {
      const p = this.worldToMap(item.x, item.y);
      ellipse(p.x, p.y, 4);
    }

    // 敵
    fill(255, 50, 50);
    for (const enemy of enemies) {
      const p = this.worldToMap(enemy.x, enemy.y);
      ellipse(p.x, p.y, 5);
    }

    // プレイヤー
    fill(0, 255, 100);
    const pp = this.worldToMap(player.x, player.y);
    ellipse(pp.x, pp.y, 8);

    // 視界範囲
    noFill();
    stroke(0, 255, 100, 100);
    strokeWeight(1);
    ellipse(pp.x, pp.y, 30);

    pop();
  }
}

const minimap = new Minimap(width - 120, 10, 100, 100);

function draw() {
  minimap.draw(player, enemies, items);
}
```

## タッチ用バーチャルボタン

```javascript
class VirtualButton {
  constructor(x, y, size, label, options = {}) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.label = label;
    this.isPressed = false;
    this.color = options.color || color(100, 150, 255);
    this.touchId = null;
  }

  checkPress(touches) {
    for (const t of touches) {
      const d = dist(t.x, t.y, this.x, this.y);
      if (d < this.size / 2) {
        if (!this.isPressed) {
          this.isPressed = true;
          this.touchId = t.id;
          return true;  // 押された瞬間
        }
      }
    }
    return false;
  }

  checkRelease(touches) {
    if (!this.isPressed) return false;

    const stillTouching = touches.some(t => t.id === this.touchId);
    if (!stillTouching) {
      this.isPressed = false;
      this.touchId = null;
      return true;  // 離された瞬間
    }
    return false;
  }

  draw() {
    push();

    // 影
    noStroke();
    fill(0, 50);
    ellipse(this.x + 3, this.y + 3, this.size);

    // ボタン
    const c = this.color;
    if (this.isPressed) {
      fill(red(c) * 0.7, green(c) * 0.7, blue(c) * 0.7, 200);
    } else {
      fill(red(c), green(c), blue(c), 150);
    }
    stroke(255, 100);
    strokeWeight(3);
    ellipse(this.x, this.y, this.size);

    // ラベル
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(this.size * 0.3);
    text(this.label, this.x, this.y);

    pop();
  }
}

// 使用例
const jumpButton = new VirtualButton(width - 80, height - 80, 80, 'JUMP');
const attackButton = new VirtualButton(width - 180, height - 60, 60, 'ATK', {
  color: color(255, 100, 100)
});

function draw() {
  jumpButton.draw();
  attackButton.draw();
}

function touchStarted() {
  if (jumpButton.checkPress(touches)) {
    player.jump();
  }
  if (attackButton.checkPress(touches)) {
    player.attack();
  }
  return false;
}

function touchEnded() {
  jumpButton.checkRelease(touches);
  attackButton.checkRelease(touches);
  return false;
}
```
