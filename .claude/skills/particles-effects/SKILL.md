---
name: particles-effects
description: パーティクルプリセット。紙吹雪、雪、星空、火花の設定例。
---

# パーティクル プリセット

## 紙吹雪（クリア演出）

```javascript
tsParticles.load('confetti', {
  particles: {
    number: { value: 0 },
    color: { value: ['#FF69B4', '#9370DB', '#4ECDC4', '#FFD700'] },
    shape: { type: ['circle', 'square'] },
    size: { value: { min: 5, max: 10 } },
    move: { enable: true, speed: 10, direction: 'bottom', gravity: { enable: true } },
    life: { duration: { value: 3 }, count: 1 }
  },
  emitters: { position: { x: 50, y: 0 }, rate: { quantity: 10, delay: 0.1 } }
});
```

## 雪

```javascript
tsParticles.load('snow', {
  particles: {
    number: { value: 100 },
    color: { value: '#ffffff' },
    size: { value: { min: 1, max: 5 } },
    move: { enable: true, speed: 1, direction: 'bottom' },
    wobble: { enable: true, distance: 10 },
    opacity: { value: { min: 0.3, max: 0.8 } }
  }
});
```

## 星空（背景）

```javascript
tsParticles.load('stars', {
  particles: {
    number: { value: 200 },
    color: { value: '#ffffff' },
    size: { value: { min: 0.5, max: 2 } },
    move: { enable: false },
    opacity: { value: { min: 0.1, max: 1 }, animation: { enable: true, speed: 0.5 } }
  }
});
```

## 火花

```javascript
tsParticles.load('sparks', {
  particles: {
    number: { value: 0 },
    color: { value: ['#FFD700', '#FF69B4'] },
    size: { value: { min: 2, max: 4 } },
    move: { enable: true, speed: 10, direction: 'top', outModes: 'destroy' },
    life: { duration: { value: 1 }, count: 1 }
  },
  emitters: { position: { x: 50, y: 100 }, rate: { quantity: 3, delay: 0.05 } }
});
```
