# Terrain & Tracks Reference

## トラック/コース設計

### ウェイポイントベースのトラック

```javascript
class Track {
  constructor() {
    this.waypoints = [];
    this.width = 80;
  }

  // コースを定義
  define(points) {
    this.waypoints = points.map((p, i) => ({
      x: p.x,
      y: p.y,
      index: i,
      next: (i + 1) % points.length
    }));
  }

  // スプライン補間でなめらかなコースを生成
  getSplinePoints(resolution = 10) {
    const spline = [];
    for (let i = 0; i < this.waypoints.length; i++) {
      const p0 = this.waypoints[(i - 1 + this.waypoints.length) % this.waypoints.length];
      const p1 = this.waypoints[i];
      const p2 = this.waypoints[(i + 1) % this.waypoints.length];
      const p3 = this.waypoints[(i + 2) % this.waypoints.length];

      for (let t = 0; t < 1; t += 1 / resolution) {
        spline.push(this.catmullRom(p0, p1, p2, p3, t));
      }
    }
    return spline;
  }

  catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  }

  // トラックを描画
  draw(ctx) {
    const points = this.getSplinePoints();
    if (points.length < 2) return;

    // 道路
    ctx.strokeStyle = '#333';
    ctx.lineWidth = this.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    // 中央線
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
```

### トラック境界判定

```javascript
class TrackBounds {
  constructor(track) {
    this.track = track;
    this.segments = this.generateSegments();
  }

  generateSegments() {
    const points = this.track.getSplinePoints();
    const segments = [];
    const halfWidth = this.track.width / 2;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      // 法線ベクトル
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;

      segments.push({
        innerLeft: { x: p1.x + nx * halfWidth, y: p1.y + ny * halfWidth },
        innerRight: { x: p1.x - nx * halfWidth, y: p1.y - ny * halfWidth },
        outerLeft: { x: p2.x + nx * halfWidth, y: p2.y + ny * halfWidth },
        outerRight: { x: p2.x - nx * halfWidth, y: p2.y - ny * halfWidth }
      });
    }
    return segments;
  }

  isOnTrack(x, y) {
    // 最も近いセグメントを見つけて、トラック幅内かチェック
    const points = this.track.getSplinePoints();
    let minDist = Infinity;

    for (const p of points) {
      const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
      minDist = Math.min(minDist, dist);
    }

    return minDist < this.track.width / 2;
  }
}
```

## 地形効果

### サーフェスタイプ

```javascript
const SURFACE_TYPES = {
  asphalt: {
    grip: 1.0,
    drag: 0.98,
    color: '#333',
    particles: null
  },
  grass: {
    grip: 0.6,
    drag: 0.92,
    color: '#4a7c23',
    particles: 'grass'
  },
  sand: {
    grip: 0.5,
    drag: 0.88,
    color: '#c9a227',
    particles: 'dust'
  },
  gravel: {
    grip: 0.7,
    drag: 0.90,
    color: '#888',
    particles: 'rocks'
  },
  ice: {
    grip: 0.2,
    drag: 0.99,
    color: '#aaddff',
    particles: null
  },
  mud: {
    grip: 0.4,
    drag: 0.80,
    color: '#5c4033',
    particles: 'mud'
  },
  water: {
    grip: 0.3,
    drag: 0.75,
    color: '#4488cc',
    particles: 'splash'
  }
};

class TerrainManager {
  constructor() {
    this.zones = [];
  }

  addZone(x, y, width, height, type) {
    this.zones.push({
      bounds: { x, y, width, height },
      surface: SURFACE_TYPES[type]
    });
  }

  getSurfaceAt(x, y) {
    for (const zone of this.zones) {
      if (x >= zone.bounds.x && x <= zone.bounds.x + zone.bounds.width &&
          y >= zone.bounds.y && y <= zone.bounds.y + zone.bounds.height) {
        return zone.surface;
      }
    }
    return SURFACE_TYPES.asphalt;  // デフォルト
  }

  applyToVehicle(vehicle) {
    const surface = this.getSurfaceAt(vehicle.pos.x, vehicle.pos.y);
    vehicle.currentGrip = vehicle.baseGrip * surface.grip;
    vehicle.currentDrag = surface.drag;

    // パーティクル生成
    if (surface.particles && vehicle.speed > 2) {
      this.emitParticles(vehicle, surface.particles);
    }
  }

  emitParticles(vehicle, type) {
    // パーティクルシステムと連携
    if (window.particleSystem) {
      window.particleSystem.emit(type, vehicle.pos.x, vehicle.pos.y);
    }
  }
}
```

### 坂道/傾斜

```javascript
class SlopeSystem {
  constructor() {
    this.slopes = [];
  }

  addSlope(x, y, width, height, angle) {
    this.slopes.push({
      bounds: { x, y, width, height },
      angle: angle * Math.PI / 180  // 度からラジアン
    });
  }

  getSlopeAt(x, y) {
    for (const slope of this.slopes) {
      if (x >= slope.bounds.x && x <= slope.bounds.x + slope.bounds.width &&
          y >= slope.bounds.y && y <= slope.bounds.y + slope.bounds.height) {
        return slope.angle;
      }
    }
    return 0;
  }

  applyToVehicle(vehicle) {
    const slopeAngle = this.getSlopeAt(vehicle.pos.x, vehicle.pos.y);

    // 坂道の影響を加速度に適用
    const gravityEffect = Math.sin(slopeAngle) * 0.3;
    vehicle.speed -= gravityEffect;
  }
}
```

## チェックポイント/ラップ

```javascript
class RaceManager {
  constructor(track) {
    this.checkpoints = [];
    this.currentCheckpoint = 0;
    this.lap = 0;
    this.lapTimes = [];
    this.lapStartTime = 0;
    this.bestLap = Infinity;
  }

  addCheckpoint(x, y, radius) {
    this.checkpoints.push({ x, y, radius, passed: false });
  }

  update(vehicle, timestamp) {
    const cp = this.checkpoints[this.currentCheckpoint];
    const dist = Math.sqrt(
      (vehicle.pos.x - cp.x) ** 2 +
      (vehicle.pos.y - cp.y) ** 2
    );

    if (dist < cp.radius) {
      cp.passed = true;
      this.currentCheckpoint++;

      // ラップ完了
      if (this.currentCheckpoint >= this.checkpoints.length) {
        this.completeLap(timestamp);
      }
    }
  }

  completeLap(timestamp) {
    const lapTime = timestamp - this.lapStartTime;
    this.lapTimes.push(lapTime);

    if (lapTime < this.bestLap) {
      this.bestLap = lapTime;
    }

    this.lap++;
    this.currentCheckpoint = 0;
    this.lapStartTime = timestamp;

    // チェックポイントをリセット
    this.checkpoints.forEach(cp => cp.passed = false);
  }

  formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor((ms % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`;
  }
}
```

## 障害物

```javascript
class Obstacle {
  constructor(x, y, type) {
    this.pos = { x, y };
    this.type = type;
    this.active = true;

    const configs = {
      cone: { radius: 15, effect: 'slow', value: 0.5 },
      barrier: { width: 60, height: 20, effect: 'stop' },
      oil: { radius: 40, effect: 'slip', duration: 2000 },
      boost: { radius: 30, effect: 'speed', value: 2.0 },
      jump: { width: 80, height: 20, effect: 'launch', value: -15 }
    };

    Object.assign(this, configs[type] || configs.cone);
  }

  checkCollision(vehicle) {
    if (!this.active) return false;

    if (this.radius) {
      // 円形の当たり判定
      const dist = Math.sqrt(
        (vehicle.pos.x - this.pos.x) ** 2 +
        (vehicle.pos.y - this.pos.y) ** 2
      );
      return dist < this.radius + 20;
    } else {
      // 矩形の当たり判定
      return vehicle.pos.x > this.pos.x - this.width / 2 &&
             vehicle.pos.x < this.pos.x + this.width / 2 &&
             vehicle.pos.y > this.pos.y - this.height / 2 &&
             vehicle.pos.y < this.pos.y + this.height / 2;
    }
  }

  applyEffect(vehicle) {
    switch (this.effect) {
      case 'slow':
        vehicle.speed *= this.value;
        break;
      case 'stop':
        vehicle.speed = 0;
        vehicle.vel = { x: 0, y: 0 };
        break;
      case 'slip':
        vehicle.driftFactor = 0.3;
        setTimeout(() => vehicle.driftFactor = vehicle.baseDriftFactor, this.duration);
        break;
      case 'speed':
        vehicle.speed *= this.value;
        break;
      case 'launch':
        vehicle.vel.y = this.value;
        break;
    }
  }
}
```

## プロシージャルトラック生成

```javascript
class ProceduralTrack {
  generate(complexity = 10, size = 500) {
    const points = [];
    const angleStep = (Math.PI * 2) / complexity;

    for (let i = 0; i < complexity; i++) {
      const angle = i * angleStep;
      const radius = size + (Math.random() - 0.5) * size * 0.5;
      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }

    // 交差を避けるためにスムージング
    return this.smooth(points, 2);
  }

  smooth(points, iterations) {
    for (let i = 0; i < iterations; i++) {
      const newPoints = [];
      for (let j = 0; j < points.length; j++) {
        const prev = points[(j - 1 + points.length) % points.length];
        const curr = points[j];
        const next = points[(j + 1) % points.length];
        newPoints.push({
          x: curr.x * 0.5 + (prev.x + next.x) * 0.25,
          y: curr.y * 0.5 + (prev.y + next.y) * 0.25
        });
      }
      points = newPoints;
    }
    return points;
  }
}
```
