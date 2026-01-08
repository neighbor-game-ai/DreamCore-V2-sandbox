# Vehicle Physics Skill

ブラウザゲームで車両物理を実装するためのスキルです。

## 推奨ライブラリ

### 2D車両ゲーム
```html
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.0/lib/p5.min.js"></script>
```

### 3D車両ゲーム
```html
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.min.js"></script>
```

## 基本的な車両物理モデル

### 2D トップダウンビュー
```javascript
class Vehicle {
  constructor(x, y) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.angle = 0;           // 向き（ラジアン）
    this.speed = 0;           // 現在速度
    this.maxSpeed = 8;        // 最高速度
    this.acceleration = 0.2;  // 加速度
    this.friction = 0.98;     // 摩擦係数
    this.turnSpeed = 0.05;    // 旋回速度
    this.driftFactor = 0.95;  // ドリフト係数（1.0 = グリップ、低い = スリップ）
  }

  update(input) {
    // アクセル/ブレーキ
    if (input.up) {
      this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
    }
    if (input.down) {
      this.speed = Math.max(this.speed - this.acceleration, -this.maxSpeed / 2);
    }

    // ステアリング（速度に応じて旋回）
    if (Math.abs(this.speed) > 0.1) {
      if (input.left) this.angle -= this.turnSpeed * Math.sign(this.speed);
      if (input.right) this.angle += this.turnSpeed * Math.sign(this.speed);
    }

    // 速度ベクトル計算
    const targetVelX = Math.cos(this.angle) * this.speed;
    const targetVelY = Math.sin(this.angle) * this.speed;

    // ドリフト効果（徐々に目標速度に近づく）
    this.vel.x = this.vel.x * (1 - this.driftFactor) + targetVelX * this.driftFactor;
    this.vel.y = this.vel.y * (1 - this.driftFactor) + targetVelY * this.driftFactor;

    // 位置更新
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;

    // 摩擦
    this.speed *= this.friction;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    // 車体
    ctx.fillStyle = '#e63946';
    ctx.fillRect(-25, -12, 50, 24);

    // フロント
    ctx.fillStyle = '#1d3557';
    ctx.fillRect(15, -10, 10, 20);

    ctx.restore();
  }
}
```

### サイドビュー（横スクロール）
```javascript
class SideViewVehicle {
  constructor(x, y) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.wheelAngle = 0;      // 車輪回転
    this.grounded = false;
    this.gravity = 0.5;
    this.jumpForce = -12;
  }

  update(input, ground) {
    // 重力
    this.vel.y += this.gravity;

    // 地面判定
    if (this.pos.y >= ground) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // 移動
    if (input.right) this.vel.x = Math.min(this.vel.x + 0.3, 10);
    if (input.left) this.vel.x = Math.max(this.vel.x - 0.3, -10);

    // ジャンプ
    if (input.up && this.grounded) {
      this.vel.y = this.jumpForce;
    }

    // 摩擦（地面のみ）
    if (this.grounded) {
      this.vel.x *= 0.95;
    }

    // 位置更新
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;

    // 車輪回転
    this.wheelAngle += this.vel.x * 0.1;
  }
}
```

## 入力処理

```javascript
const input = {
  up: false, down: false, left: false, right: false
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w') input.up = true;
  if (e.key === 'ArrowDown' || e.key === 's') input.down = true;
  if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w') input.up = false;
  if (e.key === 'ArrowDown' || e.key === 's') input.down = false;
  if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
});
```

## モバイル対応（タッチ操作）

```javascript
// バーチャルジョイスティック
class VirtualJoystick {
  constructor(container) {
    this.active = false;
    this.startPos = { x: 0, y: 0 };
    this.currentPos = { x: 0, y: 0 };
    this.output = { x: 0, y: 0 };  // -1 to 1

    container.addEventListener('touchstart', (e) => this.onStart(e));
    container.addEventListener('touchmove', (e) => this.onMove(e));
    container.addEventListener('touchend', () => this.onEnd());
  }

  onStart(e) {
    this.active = true;
    const touch = e.touches[0];
    this.startPos = { x: touch.clientX, y: touch.clientY };
    this.currentPos = { ...this.startPos };
  }

  onMove(e) {
    if (!this.active) return;
    const touch = e.touches[0];
    this.currentPos = { x: touch.clientX, y: touch.clientY };

    const dx = this.currentPos.x - this.startPos.x;
    const dy = this.currentPos.y - this.startPos.y;
    const maxDist = 50;

    this.output.x = Math.max(-1, Math.min(1, dx / maxDist));
    this.output.y = Math.max(-1, Math.min(1, dy / maxDist));
  }

  onEnd() {
    this.active = false;
    this.output = { x: 0, y: 0 };
  }
}
```

## 車両パラメータの調整ガイド

| パラメータ | 低い値 | 高い値 |
|-----------|--------|--------|
| acceleration | ゆっくり加速 | 素早く加速 |
| maxSpeed | 遅い車 | 速い車 |
| friction | すぐ減速 | 長く滑る |
| turnSpeed | 曲がりにくい | クイック |
| driftFactor | ドリフトしやすい | グリップ強い |

## 車種プリセット

```javascript
const VEHICLE_PRESETS = {
  sports: {
    maxSpeed: 12, acceleration: 0.4, turnSpeed: 0.08, driftFactor: 0.9
  },
  truck: {
    maxSpeed: 6, acceleration: 0.15, turnSpeed: 0.03, driftFactor: 0.98
  },
  drift: {
    maxSpeed: 10, acceleration: 0.3, turnSpeed: 0.06, driftFactor: 0.7
  },
  offroad: {
    maxSpeed: 8, acceleration: 0.25, turnSpeed: 0.05, driftFactor: 0.85
  }
};
```
