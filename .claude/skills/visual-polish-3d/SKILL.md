---
name: visual-polish-3d
description: 3Dゲームのビジュアルポリッシュ。トゥーンシェーダー、ポストプロセス、パーティクル、環境エフェクトで見栄えを向上。Three.js専用。
---

# 3D Visual Polish for Three.js

3Dゲームの見た目を劇的に改善するテクニック集。

## CDN Setup

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
  }
}
</script>
```

## 基本的なポストプロセス

```javascript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// コンポーザー設定
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// ブルーム（発光エフェクト）
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,   // strength
  0.4,   // radius
  0.85   // threshold
);
composer.addPass(bloomPass);

// 最終出力
composer.addPass(new OutputPass());

// アニメーションループ
function animate() {
  composer.render();  // renderer.render() の代わり
}
renderer.setAnimationLoop(animate);
```

## アウトライン効果

```javascript
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

const outlinePass = new OutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  scene,
  camera
);
outlinePass.edgeStrength = 3;
outlinePass.edgeGlow = 0.5;
outlinePass.edgeThickness = 1;
outlinePass.visibleEdgeColor.set('#ffffff');
outlinePass.hiddenEdgeColor.set('#190a05');

composer.addPass(outlinePass);

// ホバー時にアウトライン
outlinePass.selectedObjects = [targetMesh];
```

## 環境マップ（反射/環境光）

```javascript
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// HDR環境マップ（無料素材: polyhaven.com）
new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_03_1k.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.background = texture;  // オプション：背景にも使用
});

// または単色環境
scene.environment = new THREE.Color(0x404040);
```

## 影の設定（ソフトシャドウ）

```javascript
// レンダラー設定
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ライト設定
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
light.castShadow = true;
light.shadow.mapSize.width = 2048;
light.shadow.mapSize.height = 2048;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 50;
light.shadow.camera.left = -10;
light.shadow.camera.right = 10;
light.shadow.camera.top = 10;
light.shadow.camera.bottom = -10;
light.shadow.bias = -0.0001;
scene.add(light);

// オブジェクト設定
mesh.castShadow = true;
mesh.receiveShadow = true;
ground.receiveShadow = true;
```

## スカイボックス/グラデーション背景

```javascript
// グラデーション背景（シェーダー）
const vertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition + offset).y;
    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
  }
`;

const skyGeo = new THREE.SphereGeometry(400, 32, 15);
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: new THREE.Color(0x0077ff) },
    bottomColor: { value: new THREE.Color(0xffffff) },
    offset: { value: 33 },
    exponent: { value: 0.6 }
  },
  vertexShader,
  fragmentShader,
  side: THREE.BackSide
});
scene.add(new THREE.Mesh(skyGeo, skyMat));
```

## パフォーマンス設定

```javascript
// モバイル最適化
const isMobile = /Android|iPhone|iPad/.test(navigator.userAgent);

renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2));

// ブルームをモバイルで軽量化
if (isMobile) {
  bloomPass.strength = 0.3;
  bloomPass.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
}

// シャドウマップサイズ調整
light.shadow.mapSize.width = isMobile ? 512 : 2048;
light.shadow.mapSize.height = isMobile ? 512 : 2048;
```

## よく使うマテリアル設定

```javascript
// 光沢のあるプラスチック風
const plasticMaterial = new THREE.MeshStandardMaterial({
  color: 0xff0000,
  roughness: 0.3,
  metalness: 0.0
});

// 金属風
const metalMaterial = new THREE.MeshStandardMaterial({
  color: 0xcccccc,
  roughness: 0.2,
  metalness: 1.0
});

// 発光マテリアル（ブルームと組み合わせ）
const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0x00ffff
});
// ブルームのthresholdより明るい色を使うと発光

// 半透明
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transmission: 0.9,
  roughness: 0.1,
  thickness: 0.5
});
```

## 完成例：ゲーム向けビジュアル設定

```javascript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// シーン・カメラ・レンダラー
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);
// 注意: scene.fog は使用しない（KAWAIIスタイルでは禁止）

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ライティング
const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 1);
mainLight.position.set(5, 10, 5);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(2048, 2048);
scene.add(mainLight);

// ポストプロセス
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.3, 0.9));
composer.addPass(new OutputPass());

// アニメーション
renderer.setAnimationLoop(() => {
  composer.render();
});
```
