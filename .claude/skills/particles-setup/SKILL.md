---
name: particles-setup
description: tsParticles基本セットアップ。CDN読み込み、基本設定、ゲーム統合。パーティクルエフェクト使用時に必須。
---

# tsParticles 基本セットアップ

## CDN

```html
<script src="https://cdn.jsdelivr.net/npm/tsparticles@2.12.0/tsparticles.bundle.min.js"></script>
```

## 基本設定

```javascript
tsParticles.load('particles', {
  fullScreen: { enable: false },  // ゲーム用
  fpsLimit: 60,
  particles: {
    number: { value: 50 },  // モバイル用に控えめ
    color: { value: '#ffffff' },
    size: { value: 3 },
    move: { enable: true, speed: 2 }
  }
});
```

## ゲーム統合

```html
<style>
  /* 背景レイヤー */
  #particles { position: fixed; top: 0; left: 0; z-index: -1; }
  /* 前景エフェクト */
  #effects { position: fixed; top: 0; left: 0; z-index: 100; pointer-events: none; }
</style>

<div id="particles"></div>
<div id="game">...</div>
<div id="effects"></div>
```

## 制御

```javascript
const container = tsParticles.domItem(0);
container.pause();   // 一時停止
container.play();    // 再開
container.destroy(); // 破棄
```
