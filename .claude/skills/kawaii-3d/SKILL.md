---
name: kawaii-3d
description: KAWAII 3Dスタイル。トゥーンマテリアル、丸みのあるジオメトリ、控えめライティング。
---

# KAWAII 3D スタイル

## キャラクター設計の原則

- **丸みのあるフォルム** - 角を極力なくす、球体・カプセルベース
- **頭身の低い体型** - 頭が大きく、体が小さい
- **表情をつける** - 目、ほっぺ、口で愛嬌を出す
- **トゥーン調** - リアルな質感は避ける

## キャラクターの構成要素

```
体:     大きな球体（メイン）
目:     楕円形、大きめ（愛嬌）
ほっぺ: ピンクの丸（かわいさ）
足:     小さな楕円（デフォルメ）
```

## マテリアル

```javascript
// トゥーンマテリアル（推奨）
new THREE.MeshToonMaterial({ color: 0xFF69B4 })

// マットな質感もOK
new THREE.MeshLambertMaterial({ color: 0xFF69B4 })
```

## ライティング（控えめに）

```javascript
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.45);
```

## カメラ

```javascript
// Orthographic でミニチュア感
const camera = new THREE.OrthographicCamera(...);
```

## 禁止

- scene.fog
- MeshStandardMaterial（リアルすぎる）
- 暗い色・黒
