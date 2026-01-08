# Vehicle Controls Reference

## 高度な制御システム

### ステアリングモデル

#### アッカーマンステアリング（リアル）
```javascript
class AckermannSteering {
  constructor(wheelBase, trackWidth) {
    this.wheelBase = wheelBase;   // 前後輪間距離
    this.trackWidth = trackWidth; // 左右輪間距離
  }

  // ステアリング角度から各輪の角度を計算
  getWheelAngles(steerAngle) {
    if (Math.abs(steerAngle) < 0.001) {
      return { left: 0, right: 0 };
    }

    const turnRadius = this.wheelBase / Math.tan(steerAngle);
    const innerRadius = turnRadius - this.trackWidth / 2;
    const outerRadius = turnRadius + this.trackWidth / 2;

    return {
      inner: Math.atan(this.wheelBase / innerRadius),
      outer: Math.atan(this.wheelBase / outerRadius)
    };
  }
}
```

### 加速・減速カーブ

```javascript
class AccelerationCurve {
  constructor() {
    // RPMに基づくトルクカーブ
    this.torqueCurve = [
      { rpm: 0, torque: 0.3 },
      { rpm: 2000, torque: 0.7 },
      { rpm: 4000, torque: 1.0 },
      { rpm: 6000, torque: 0.9 },
      { rpm: 8000, torque: 0.6 }
    ];
  }

  getTorque(rpm) {
    for (let i = 0; i < this.torqueCurve.length - 1; i++) {
      const curr = this.torqueCurve[i];
      const next = this.torqueCurve[i + 1];
      if (rpm >= curr.rpm && rpm <= next.rpm) {
        const t = (rpm - curr.rpm) / (next.rpm - curr.rpm);
        return curr.torque + (next.torque - curr.torque) * t;
      }
    }
    return 0;
  }
}
```

### ブレーキシステム

```javascript
class BrakeSystem {
  constructor() {
    this.frontBias = 0.6;  // フロントブレーキ配分
    this.maxBrakeForce = 1.5;
    this.absEnabled = true;
    this.absThreshold = 0.1;  // スリップ率閾値
  }

  applyBrakes(vehicle, brakeInput) {
    let brakeForce = brakeInput * this.maxBrakeForce;

    // ABS（アンチロックブレーキ）
    if (this.absEnabled) {
      const slipRatio = this.calculateSlipRatio(vehicle);
      if (slipRatio > this.absThreshold) {
        brakeForce *= 0.5;  // ブレーキを緩める
      }
    }

    return {
      front: brakeForce * this.frontBias,
      rear: brakeForce * (1 - this.frontBias)
    };
  }

  calculateSlipRatio(vehicle) {
    const wheelSpeed = vehicle.wheelRotation * vehicle.wheelRadius;
    const groundSpeed = Math.abs(vehicle.speed);
    if (groundSpeed < 0.1) return 0;
    return Math.abs(wheelSpeed - groundSpeed) / groundSpeed;
  }
}
```

### ハンドブレーキ/ドリフト

```javascript
class HandBrake {
  apply(vehicle) {
    // リアホイールをロック
    vehicle.rearWheelLocked = true;

    // 横滑り係数を下げる
    vehicle.lateralGrip *= 0.3;

    // ドリフトアングル計算
    const velocityAngle = Math.atan2(vehicle.vel.y, vehicle.vel.x);
    vehicle.driftAngle = vehicle.angle - velocityAngle;
  }

  release(vehicle) {
    vehicle.rearWheelLocked = false;
    vehicle.lateralGrip = vehicle.baseLateralGrip;
  }
}
```

## ギアシステム

```javascript
class Transmission {
  constructor() {
    this.gears = [
      { ratio: 3.5, maxSpeed: 30 },   // 1st
      { ratio: 2.5, maxSpeed: 60 },   // 2nd
      { ratio: 1.8, maxSpeed: 100 },  // 3rd
      { ratio: 1.3, maxSpeed: 150 },  // 4th
      { ratio: 1.0, maxSpeed: 200 },  // 5th
      { ratio: 0.8, maxSpeed: 250 }   // 6th
    ];
    this.currentGear = 0;
    this.rpm = 0;
    this.shiftDelay = 200; // ms
    this.lastShift = 0;
  }

  update(speed, throttle, timestamp) {
    // RPM計算
    const gear = this.gears[this.currentGear];
    this.rpm = (speed / gear.maxSpeed) * 7000 + 1000;

    // オートシフト
    if (timestamp - this.lastShift > this.shiftDelay) {
      if (this.rpm > 6500 && this.currentGear < this.gears.length - 1) {
        this.shiftUp(timestamp);
      } else if (this.rpm < 2500 && this.currentGear > 0) {
        this.shiftDown(timestamp);
      }
    }

    return this.gears[this.currentGear].ratio;
  }

  shiftUp(timestamp) {
    this.currentGear++;
    this.lastShift = timestamp;
    this.rpm *= 0.6; // RPMドロップ
  }

  shiftDown(timestamp) {
    this.currentGear--;
    this.lastShift = timestamp;
    this.rpm *= 1.4; // RPMジャンプ
  }
}
```

## サウンドエフェクト

```javascript
class EngineSound {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.oscillator = null;
    this.gainNode = null;
  }

  start() {
    this.oscillator = this.audioContext.createOscillator();
    this.gainNode = this.audioContext.createGain();

    this.oscillator.type = 'sawtooth';
    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = 0.1;

    this.oscillator.start();
  }

  update(rpm, throttle) {
    if (!this.oscillator) return;

    // RPMに基づいて周波数を変更
    const baseFreq = 80;
    const maxFreq = 400;
    const freq = baseFreq + (rpm / 8000) * (maxFreq - baseFreq);
    this.oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);

    // スロットルに基づいて音量を変更
    const volume = 0.05 + throttle * 0.15;
    this.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
  }

  stop() {
    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator = null;
    }
  }
}
```

## カメラ追従

```javascript
class VehicleCamera {
  constructor() {
    this.pos = { x: 0, y: 0 };
    this.smoothing = 0.1;
    this.lookAhead = 100;  // 進行方向を先読み
  }

  update(vehicle) {
    // 目標位置（車両の少し前方）
    const targetX = vehicle.pos.x + Math.cos(vehicle.angle) * this.lookAhead;
    const targetY = vehicle.pos.y + Math.sin(vehicle.angle) * this.lookAhead;

    // スムーズ追従
    this.pos.x += (targetX - this.pos.x) * this.smoothing;
    this.pos.y += (targetY - this.pos.y) * this.smoothing;
  }

  apply(ctx, canvasWidth, canvasHeight) {
    ctx.translate(
      canvasWidth / 2 - this.pos.x,
      canvasHeight / 2 - this.pos.y
    );
  }
}
```
