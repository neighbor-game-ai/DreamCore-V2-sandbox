---
name: threejs-setup
description: Three.js基本セットアップ。CDN + ES Modules、シーン初期化、レンダラー設定、アニメーションループ。3Dゲーム作成時に必須。
---

# Three.js 基本セットアップ

## 重要: Canvas事前配置パターン（推奨）

JavaScriptエラーで画面が真っ白になる問題を防ぐため、**HTMLにCanvas要素を事前配置**する。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; }
    #gameCanvas { display: block; width: 100%; height: 100vh; }
    #loading { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #1a1a2e; color: #fff; font-family: sans-serif; z-index: 9999; }
    #loading.hidden { display: none; }
    #error { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: #2d1b1b; color: #ff6b6b; font-family: sans-serif; z-index: 9999; padding: 20px; text-align: center; }
  </style>
</head>
<body>
  <!-- Canvas事前配置（JSエラーでも要素は存在） -->
  <canvas id="gameCanvas"></canvas>

  <!-- ローディング表示 -->
  <div id="loading">Loading...</div>

  <!-- エラー表示 -->
  <div id="error"></div>

  <!-- UI要素はここに配置 -->

  <!-- CDN: jsdelivrを優先（unpkgより安定） -->
  <script async src="https://cdn.jsdelivr.net/npm/es-module-shims@1.8.0/dist/es-module-shims.min.js"></script>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
  // グローバルエラーハンドリング
  window.onerror = (msg, url, line) => {
    document.getElementById('loading').classList.add('hidden');
    const errorDiv = document.getElementById('error');
    errorDiv.style.display = 'flex';
    errorDiv.textContent = `エラー: ${msg}`;
  };

  try {
    const { Scene, PerspectiveCamera, WebGLRenderer } = await import('three');

    // 事前配置されたCanvasを取得
    const canvas = document.getElementById('gameCanvas');

    const scene = new Scene();
    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new WebGLRenderer({ canvas, antialias: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // ローディング完了
    document.getElementById('loading').classList.add('hidden');

    // アニメーションループ
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    // リサイズ対応
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

  } catch (e) {
    document.getElementById('loading').classList.add('hidden');
    const errorDiv = document.getElementById('error');
    errorDiv.style.display = 'flex';
    errorDiv.textContent = `読み込みエラー: ${e.message}`;
    console.error(e);
  }
  </script>
</body>
</html>
```

## ポイント

1. **Canvas事前配置**: `<canvas id="gameCanvas">` をHTMLに記述
2. **WebGLRenderer({ canvas })**: 既存Canvasを渡す
3. **ローディング/エラー表示**: ユーザーに状態を伝える
4. **try-catch**: モジュール読み込みエラーをキャッチ
5. **jsdelivr CDN**: unpkgより接続安定性が高い

## 最小パターン（シンプル版）

```html
<canvas id="gameCanvas"></canvas>
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
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
```

## 非推奨API（エラーになる）

```javascript
// ❌ 古い・削除済み
document.body.appendChild(renderer.domElement); // Canvas動的追加は避ける
requestAnimationFrame(animate); // setAnimationLoopを使う
renderer.outputEncoding = THREE.sRGBEncoding; // 削除済み

// ✅ 正しい
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
renderer.setAnimationLoop(animate);
renderer.outputColorSpace = THREE.SRGBColorSpace;
```
