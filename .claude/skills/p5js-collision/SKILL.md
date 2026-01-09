---
name: p5js-collision
description: P5.js当たり判定。円同士、矩形同士、円と矩形の衝突検出関数。
---

# P5.js 当たり判定

## 円同士

```javascript
function circlesCollide(x1, y1, r1, x2, y2, r2) {
  return dist(x1, y1, x2, y2) < r1 + r2;
}
```

## 矩形同士（AABB）

```javascript
function rectsCollide(x1, y1, w1, h1, x2, y2, w2, h2) {
  return x1 < x2 + w2 &&
         x1 + w1 > x2 &&
         y1 < y2 + h2 &&
         y1 + h1 > y2;
}
```

## 点と矩形

```javascript
function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw &&
         py >= ry && py <= ry + rh;
}
```

## 円と矩形

```javascript
function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
  let nearestX = constrain(cx, rx, rx + rw);
  let nearestY = constrain(cy, ry, ry + rh);
  return dist(cx, cy, nearestX, nearestY) < r;
}
```

## 使用例

```javascript
// 敵と弾の当たり判定
for (let enemy of enemies) {
  for (let bullet of bullets) {
    if (circlesCollide(enemy.x, enemy.y, 15, bullet.x, bullet.y, 5)) {
      enemy.active = false;
      bullet.active = false;
      score += 10;
    }
  }
}
```
