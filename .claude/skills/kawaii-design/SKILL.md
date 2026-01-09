---
name: kawaii-design
description: KAWAIIデザインスタイル。日本の「ゆめかわいい」をベースにしたポップでドリーミーな世界観。パステルカラー、丸みのある形状、トゥーンマテリアル。全てのゲームにデフォルトで適用。
priority: 1
---

# KAWAII Design Style Guide

全てのゲームにデフォルトで適用するデザインスタイル。

## カラーパレット（必須）

```
背景色:      #FFF0F5 (Lavender Blush - 極めて淡いピンク)
メインカラー: #FF69B4 (Hot Pink)
サブカラー:  #9370DB (Pastel Purple)
アクセント1: #4ECDC4 (Mint Green / Tiffany Blue)
アクセント2: #FFD700 (Gold)
影の色:      #DDA0DD (Plum - 濃いピンク系、黒は使わない)
```

## 3Dジオメトリ（Three.js）

```javascript
// 丸みのあるフォルム - 角を極力なくす
const playerGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.6, 16, 16);

// 四角い物体でも角丸に
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
// または RoundedBoxGeometry を使用
```

## マテリアル設定

```javascript
// トゥーン調マテリアル（リアルな質感は避ける）
const material = new THREE.MeshToonMaterial({
  color: 0xFF69B4,
  gradientMap: threeTone  // 3段階グラデーション
});

// またはマットな質感
const matteMatrial = new THREE.MeshLambertMaterial({
  color: 0xFF69B4
});
```

## ライティング設定

```javascript
// 控えめなライティング（白飛びを避ける）
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.45);

// 影は柔らかいピンク系
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

## カメラ設定

```javascript
// Orthographic Camera でミニチュア感を強調
const aspect = window.innerWidth / window.innerHeight;
const frustumSize = 10;
const camera = new THREE.OrthographicCamera(
  frustumSize * aspect / -2,
  frustumSize * aspect / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1, 1000
);
```

## 禁止事項

- フォッグ（scene.fog）は使用禁止
- 暗い色・黒は影以外に使わない
- リアルな質感・PBRマテリアルは避ける
- 暴力的・写実的な表現は避ける

## UI デザイン

```css
/* 丸ゴシック体 */
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700&display=swap');
font-family: 'M PLUS Rounded 1c', sans-serif;

/* ボタン - ステッカー風 */
.button {
  border-radius: 25px;
  background: linear-gradient(145deg, #FF69B4, #FF85C1);
  border: 3px solid white;
  box-shadow: 0 4px 15px rgba(255, 105, 180, 0.4);
  color: white;
  font-weight: 700;
}
```

## 完成イメージ

- おもちゃ箱のような「無害で楽しい」印象
- 頭身の低いコロコロしたキャラクター
- パステルネオンな色使い
- ポップでドリーミーな世界観
