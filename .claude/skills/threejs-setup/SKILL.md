---
name: threejs-setup
description: Three.js基本セットアップ。CDN + ES Modules、シーン初期化、レンダラー設定、アニメーションループ。3Dゲーム作成時に必須。
---

# Three.js 基本セットアップ

## CDN + ES Modules

```html
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"></script>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// アニメーションループ（最新API）
renderer.setAnimationLoop(animate);

function animate() {
  renderer.render(scene, camera);
}

// リサイズ対応
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
```

## 重要: 非推奨API

```javascript
// ✅ 正しい
renderer.setAnimationLoop(animate);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ❌ エラーになる
requestAnimationFrame(animate); // 古い
renderer.outputEncoding = THREE.sRGBEncoding; // 削除済み
```
