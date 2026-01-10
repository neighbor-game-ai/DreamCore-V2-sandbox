---
name: sprite-sheet
description: スプライトシート生成と活用。キャラクターのアニメーション（歩行、攻撃、ジャンプ等）をスプライトシートで生成し、ゲーム内でアニメーション再生する。
---

# スプライトシート生成・活用スキル

## 概要

Gemini画像生成でスプライトシート（アニメーションフレームを並べた画像）を作成し、ゲーム内でアニメーションとして使用する。

---

## 1. スプライトシート生成

### 生成プロンプトのコツ

```
"[キャラクター説明], sprite sheet, [行数]x[列数] grid, [アニメーション説明],
pixel art style, each frame clearly separated, consistent character design,
on solid magenta (#FF00FF) background"
```

### 例：4フレーム歩行アニメーション

```
"cute cat character, sprite sheet, 1x4 grid, walking animation cycle,
side view, pixel art style, each frame clearly separated,
consistent character design, on solid magenta (#FF00FF) background"
```

### 例：8フレーム（2行4列）アクション

```
"robot character, sprite sheet, 2x4 grid,
top row: idle animation 4 frames,
bottom row: attack animation 4 frames,
pixel art style, 16-bit retro, on solid magenta (#FF00FF) background"
```

### Gemini imagesフィールドでの指定

```json
{
  "images": [
    {
      "name": "player-walk.png",
      "prompt": "cute pixel art cat, sprite sheet, 1x4 grid, walking animation cycle, side view, each frame separated, on solid magenta background",
      "style": "pixel"
    },
    {
      "name": "player-jump.png",
      "prompt": "cute pixel art cat, sprite sheet, 1x3 grid, jump animation (crouch, jump, fall), side view, on solid magenta background",
      "style": "pixel"
    }
  ]
}
```

---

## 2. ゲームでの使用方法

### 基本構造

```javascript
class SpriteAnimation {
  constructor(imageSrc, frameWidth, frameHeight, frameCount, fps = 10) {
    this.image = new Image();
    this.image.src = imageSrc;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.frameCount = frameCount;
    this.currentFrame = 0;
    this.fps = fps;
    this.frameTimer = 0;
    this.loaded = false;

    this.image.onload = () => {
      this.loaded = true;
    };
  }

  update(deltaTime) {
    this.frameTimer += deltaTime;
    if (this.frameTimer >= 1000 / this.fps) {
      this.currentFrame = (this.currentFrame + 1) % this.frameCount;
      this.frameTimer = 0;
    }
  }

  draw(ctx, x, y, scale = 1, flipX = false) {
    if (!this.loaded) return;

    ctx.save();
    if (flipX) {
      ctx.translate(x + this.frameWidth * scale, y);
      ctx.scale(-1, 1);
      x = 0;
      y = 0;
    }

    ctx.drawImage(
      this.image,
      this.currentFrame * this.frameWidth, 0,  // Source x, y
      this.frameWidth, this.frameHeight,        // Source size
      x, y,                                      // Dest x, y
      this.frameWidth * scale, this.frameHeight * scale  // Dest size
    );
    ctx.restore();
  }

  reset() {
    this.currentFrame = 0;
    this.frameTimer = 0;
  }
}
```

### Canvas使用例

```javascript
// スプライトシートを読み込み（4フレーム、各64x64px）
const walkAnim = new SpriteAnimation('assets/player-walk.png', 64, 64, 4, 10);
const idleAnim = new SpriteAnimation('assets/player-idle.png', 64, 64, 2, 5);

let currentAnim = idleAnim;
let lastTime = 0;
let playerX = 100;
let playerY = 200;
let facingRight = true;

function gameLoop(timestamp) {
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;

  // 入力処理
  if (keys.left || keys.right) {
    currentAnim = walkAnim;
    facingRight = keys.right;
  } else {
    currentAnim = idleAnim;
  }

  // アニメーション更新
  currentAnim.update(deltaTime);

  // 描画
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  currentAnim.draw(ctx, playerX, playerY, 2, !facingRight);

  requestAnimationFrame(gameLoop);
}
```

---

## 3. P5.js での使用

```javascript
let spriteSheet;
let frameWidth = 64;
let frameHeight = 64;
let frameCount = 4;
let currentFrame = 0;
let animSpeed = 8; // フレームごとに切り替え

function preload() {
  spriteSheet = loadImage('assets/player-walk.png');
}

function draw() {
  background(220);

  // アニメーションフレーム更新
  if (frameCount % animSpeed === 0) {
    currentFrame = (currentFrame + 1) % frameCount;
  }

  // スプライト描画
  let sx = currentFrame * frameWidth;
  let sy = 0;

  image(
    spriteSheet,
    playerX, playerY,           // 描画位置
    frameWidth * 2, frameHeight * 2,  // 描画サイズ
    sx, sy,                     // ソース位置
    frameWidth, frameHeight     // ソースサイズ
  );
}
```

### P5.js 反転描画

```javascript
function drawFlipped(img, x, y, w, h, sx, sy, sw, sh) {
  push();
  translate(x + w, y);
  scale(-1, 1);
  image(img, 0, 0, w, h, sx, sy, sw, sh);
  pop();
}
```

---

## 4. 複数アニメーション管理

```javascript
class AnimatedSprite {
  constructor() {
    this.animations = {};
    this.currentAnim = null;
    this.currentFrame = 0;
    this.frameTimer = 0;
  }

  addAnimation(name, imageSrc, frameWidth, frameHeight, frameCount, fps) {
    const img = new Image();
    img.src = imageSrc;
    this.animations[name] = {
      image: img,
      frameWidth,
      frameHeight,
      frameCount,
      fps,
      loaded: false
    };
    img.onload = () => { this.animations[name].loaded = true; };

    if (!this.currentAnim) this.currentAnim = name;
  }

  play(name) {
    if (this.currentAnim !== name) {
      this.currentAnim = name;
      this.currentFrame = 0;
      this.frameTimer = 0;
    }
  }

  update(deltaTime) {
    const anim = this.animations[this.currentAnim];
    if (!anim) return;

    this.frameTimer += deltaTime;
    if (this.frameTimer >= 1000 / anim.fps) {
      this.currentFrame = (this.currentFrame + 1) % anim.frameCount;
      this.frameTimer = 0;
    }
  }

  draw(ctx, x, y, scale = 1, flipX = false) {
    const anim = this.animations[this.currentAnim];
    if (!anim || !anim.loaded) return;

    ctx.save();
    if (flipX) {
      ctx.translate(x + anim.frameWidth * scale, y);
      ctx.scale(-1, 1);
      x = 0; y = 0;
    }

    ctx.drawImage(
      anim.image,
      this.currentFrame * anim.frameWidth, 0,
      anim.frameWidth, anim.frameHeight,
      x, y,
      anim.frameWidth * scale, anim.frameHeight * scale
    );
    ctx.restore();
  }
}

// 使用例
const player = new AnimatedSprite();
player.addAnimation('idle', 'assets/player-idle.png', 64, 64, 2, 5);
player.addAnimation('walk', 'assets/player-walk.png', 64, 64, 4, 10);
player.addAnimation('jump', 'assets/player-jump.png', 64, 64, 3, 8);
player.addAnimation('attack', 'assets/player-attack.png', 64, 64, 4, 15);

// ゲームループ内
if (isAttacking) {
  player.play('attack');
} else if (!onGround) {
  player.play('jump');
} else if (isMoving) {
  player.play('walk');
} else {
  player.play('idle');
}
player.update(deltaTime);
player.draw(ctx, playerX, playerY, 2, !facingRight);
```

---

## 5. スプライトシートのサイズ計算

### 自動サイズ検出（横一列の場合）

```javascript
function createAnimationFromSheet(imageSrc, frameCount, fps = 10) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const frameWidth = img.width / frameCount;
      const frameHeight = img.height;
      resolve(new SpriteAnimation(imageSrc, frameWidth, frameHeight, frameCount, fps));
    };
    img.src = imageSrc;
  });
}

// 使用
const walkAnim = await createAnimationFromSheet('assets/walk.png', 4, 10);
```

---

## 6. 推奨フレーム数

| アニメーション | 推奨フレーム数 | FPS |
|--------------|--------------|-----|
| 待機（idle） | 2-4 | 3-5 |
| 歩行（walk） | 4-6 | 8-12 |
| 走り（run） | 4-8 | 12-15 |
| ジャンプ（jump） | 3-4 | 10 |
| 攻撃（attack） | 3-6 | 12-20 |
| ダメージ（hurt） | 2-3 | 8 |
| 死亡（death） | 4-6 | 8 |

---

## 7. プロンプト例集

### キャラクター歩行
```
"[character description], sprite sheet, 1x4 grid, walk cycle animation,
side view, arms and legs moving, pixel art, on magenta background"
```

### 敵キャラクター（スライム）
```
"cute slime monster, sprite sheet, 1x4 grid, bouncing idle animation,
squash and stretch, pixel art style, on solid magenta (#FF00FF) background"
```

### アイテム回転
```
"golden coin, sprite sheet, 1x6 grid, spinning rotation animation,
shiny metallic, pixel art, on magenta background"
```

### 爆発エフェクト
```
"explosion effect, sprite sheet, 1x6 grid, explosion sequence from small to large,
orange and yellow flames, pixel art, on magenta background"
```

---

## 8. 背景透過処理

生成後、マゼンタ背景を透過に変換:

```javascript
// サーバーサイド（既にgeminiClient.jsに実装済み）
// transparent: true オプションで自動的にマゼンタ除去される

// クライアントサイドで追加処理が必要な場合
function removeBackground(img, targetColor = {r: 255, g: 0, b: 255}, threshold = 50) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // マゼンタ判定
    if (r > 180 && g < 100 && b > 100) {
      data[i + 3] = 0; // 透過
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
```
