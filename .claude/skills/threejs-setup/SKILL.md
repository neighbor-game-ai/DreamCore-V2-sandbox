---
name: threejs-setup
description: Three.js基本セットアップ。CDN + ES Modules、シーン初期化、レンダラー設定、アニメーションループ。3Dゲーム作成時に必須。
---

# Three.js 基本セットアップ

## 基本テンプレート

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { overflow: hidden; touch-action: none; }
    #gameCanvas { display: block; width: 100%; height: 100vh; z-index: 1; }
  </style>
</head>
<body>
  <canvas id="gameCanvas"></canvas>
  <!-- UI要素はここに配置 -->

  <script type="importmap">
  {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}
  </script>
  <script type="module">
  import * as THREE from 'three';

  const canvas = document.getElementById('gameCanvas');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // リサイズ対応
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // アニメーションループ
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
  </script>
</body>
</html>
```

## z-indexレイヤー（モバイルUI用）

| z-index | 用途 | touch-action |
|---------|------|--------------|
| 1 | Canvas | - |
| 50 | ジョイスティック | none |
| 100 | ボタン | manipulation |
| 150 | HUD | pointer-events: none |

## 座標系ルール（重要）

| 項目 | ルール |
|------|--------|
| ジョイスティックY軸 | `y = -deltaY`（上に倒す=前進=正の値） |
| カメラピッチ（ドラッグ） | `pitch += deltaY`（上スワイプ=上を向く） |
| カメラピッチ（ジョイスティック） | `pitch -= joy.y`（Y軸は既に反転済み） |
| rotation.order | `'YXZ'`（ジンバルロック防止） |

## 非推奨API

```javascript
// ❌ エラーになる
document.body.appendChild(renderer.domElement);
requestAnimationFrame(animate);
renderer.outputEncoding = THREE.sRGBEncoding;

// ✅ 正しい
new THREE.WebGLRenderer({ canvas: existingCanvas });
renderer.setAnimationLoop(animate);
renderer.outputColorSpace = THREE.SRGBColorSpace;
```
