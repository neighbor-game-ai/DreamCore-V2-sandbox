---
name: particles-explosion
description: 爆発エフェクト。シューティング、アクションゲームの敵撃破・衝突演出用。
---

# 爆発エフェクト

## 爆発関数

```javascript
async function explode(x, y, color = '#ff0000') {
  const id = 'explosion-' + Date.now();
  const container = await tsParticles.load(id, {
    fullScreen: false,
    particles: {
      number: { value: 30 },
      color: { value: color },
      size: { value: { min: 2, max: 5 } },
      move: {
        enable: true,
        speed: { min: 5, max: 20 },
        direction: 'none',
        outModes: 'destroy'
      },
      opacity: {
        value: 1,
        animation: { enable: true, speed: 2, minimumValue: 0 }
      },
      life: { duration: { value: 0.5 }, count: 1 }
    },
    emitters: {
      position: { x: (x / window.innerWidth) * 100, y: (y / window.innerHeight) * 100 },
      rate: { quantity: 30, delay: 0 },
      life: { count: 1, duration: 0.1 }
    }
  });
  setTimeout(() => container.destroy(), 2000);
}
```

## 使用例

```javascript
// 敵撃破時
enemy.onDestroy = () => explode(enemy.x, enemy.y, '#FF69B4');

// クリック時
canvas.onclick = (e) => explode(e.clientX, e.clientY, '#FFD700');
```

## カラーバリエーション

```javascript
explode(x, y, '#FF69B4');  // ピンク（KAWAII）
explode(x, y, '#FFD700');  // ゴールド
explode(x, y, '#4ECDC4');  // ミント
explode(x, y, ['#FF69B4', '#9370DB', '#4ECDC4']);  // 複数色
```
