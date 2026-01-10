---
name: threejs-water
description: Three.js リアルな水面シミュレーション。Water Shader、Sky反射、法線マップによる波表現。湖、海、川、プールに使用。
---

# Three.js Water - リアルな水面表現

Water Shaderを使用した没入感のあるリアルな水面シミュレーション。

## 実装のポイント

### Water Shader
`THREE.Water`を使用し、法線マップ（Normal Map）による微細な波の表現と、鏡面反射を動的に計算。

### Sky Shader
大気散乱をシミュレートする`Sky`クラスを使い、太陽の位置に基づいた空の色と水面への反射を同期。

### PMREMGenerator
空のテクスチャを環境マップとしてプリプロセスし、水面が周囲の景色をリアルに反射。

### ACES Filmic Tone Mapping
映画のようなハイダイナミックレンジな光の表現。

---

## CDN + ES Modules セットアップ

```html
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
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
</script>
```

---

## 基本実装

```javascript
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

let water, sky, sun;

function initWater(scene, renderer) {
  // 太陽方向ベクトル
  sun = new THREE.Vector3();

  // 水面ジオメトリ
  const waterGeometry = new THREE.PlaneGeometry(10000, 10000);

  // Water Shader
  water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg',
      (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }
    ),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: scene.fog !== undefined
  });

  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  // Sky Shader（大気散乱シミュレーション）
  sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  // Sky パラメータ
  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;        // 大気の濁り
  skyUniforms['rayleigh'].value = 2;          // レイリー散乱
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;

  // 太陽位置の更新関数
  const pmremGenerator = new THREE.PMREMGenerator(renderer);

  function updateSun(elevation = 2, azimuth = 180) {
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);

    sun.setFromSphericalCoords(1, phi, theta);

    // Sky と Water に太陽位置を同期
    sky.material.uniforms['sunPosition'].value.copy(sun);
    water.material.uniforms['sunDirection'].value.copy(sun).normalize();

    // 環境マップ生成（反射用）
    scene.environment = pmremGenerator.fromScene(sky).texture;
  }

  updateSun();

  return { water, sky, sun, updateSun };
}
```

---

## アニメーション

```javascript
// アニメーションループ内で呼び出す
function animateWater() {
  water.material.uniforms['time'].value += 1.0 / 60.0;
}

// 使用例
renderer.setAnimationLoop(() => {
  animateWater();
  renderer.render(scene, camera);
});
```

---

## レンダラー設定

```javascript
// ACES Filmic Tone Mapping（HDR表現）
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;  // 露出調整
```

---

## カメラ設定（水面を見下ろす）

```javascript
// OrbitControls の設定
controls.maxPolarAngle = Math.PI * 0.495;  // 水面下を見れないよう制限
controls.target.set(0, 10, 0);
controls.minDistance = 40;
controls.maxDistance = 200;
```

---

## 水の色バリエーション

```javascript
// 湖（深い緑青）
water.material.uniforms['waterColor'].value.setHex(0x001e0f);

// 海（深い青）
water.material.uniforms['waterColor'].value.setHex(0x001040);

// 熱帯の海（エメラルド）
water.material.uniforms['waterColor'].value.setHex(0x006060);

// プール（明るい青）
water.material.uniforms['waterColor'].value.setHex(0x0077be);

// 夕暮れの海（オレンジがかった青）
water.material.uniforms['waterColor'].value.setHex(0x0a1a2a);
```

---

## パラメータ調整

```javascript
// 波の歪み強度（0〜10）
water.material.uniforms['distortionScale'].value = 3.7;

// 太陽位置で時間帯を表現
updateSun(2, 180);    // 日没近く（elevation低い）
updateSun(45, 180);   // 正午（elevation高い）
updateSun(5, 90);     // 朝日（azimuth東側）
```

---

## クオリティアップ

### フォグ（霧）の追加
```javascript
// 遠景を霞ませて空気感を出す
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0008);
```

### ポストプロセッシング（キラキラ感）
```javascript
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.3,  // strength
  0.4,  // radius
  0.85  // threshold
));

// アニメーションループ
renderer.setAnimationLoop(() => {
  animateWater();
  composer.render();  // renderer.render の代わり
});
```

---

## 完全な実装例

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Realistic Water</title>
  <style>
    body { margin: 0; overflow: hidden; }
  </style>
</head>
<body>
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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

let scene, camera, renderer, controls, water, sky, sun;

function init() {
  // シーン
  scene = new THREE.Scene();

  // カメラ
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 20000);
  camera.position.set(30, 30, 100);

  // レンダラー（ACES Filmic Tone Mapping）
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);

  // コントロール
  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 10, 0);
  controls.minDistance = 40;
  controls.maxDistance = 200;
  controls.update();

  // 太陽
  sun = new THREE.Vector3();

  // 水面（Water Shader）
  const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
  water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg',
      (tex) => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
    ),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: scene.fog !== undefined
  });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  // 空（Sky Shader - 大気散乱）
  sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;
  skyUniforms['rayleigh'].value = 2;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;

  // 太陽位置を設定
  const pmremGenerator = new THREE.PMREMGenerator(renderer);

  function updateSun() {
    const elevation = 2;   // 仰角
    const azimuth = 180;   // 方位角

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);

    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);
    water.material.uniforms['sunDirection'].value.copy(sun).normalize();

    // 環境マップ（反射）
    scene.environment = pmremGenerator.fromScene(sky).texture;
  }

  updateSun();

  // リサイズ対応
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // アニメーション開始
  renderer.setAnimationLoop(animate);
}

function animate() {
  // 水面アニメーション
  water.material.uniforms['time'].value += 1.0 / 60.0;
  renderer.render(scene, camera);
}

init();
</script>
</body>
</html>
```

---

## 禁止

- `requestAnimationFrame` → `renderer.setAnimationLoop()` を使用
- 古いスクリプト形式 → ES Modules を使用
