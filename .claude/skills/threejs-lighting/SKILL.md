---
name: threejs-lighting
description: Three.jsライティングと影の設定。AmbientLight、DirectionalLight、影の設定、地面の作成。
---

# Three.js ライティング

## 基本ライティング

```javascript
// 環境光（全体を均一に照らす）
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// 平行光源（太陽光のような）
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
scene.add(directionalLight);
```

## 影の設定

```javascript
// レンダラーで影を有効化
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// 光源が影を落とす
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;

// オブジェクトが影を落とす/受ける
mesh.castShadow = true;
ground.receiveShadow = true;
```

## 地面

```javascript
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x808080 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
```
