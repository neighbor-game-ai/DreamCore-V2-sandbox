# モバイル仮想ジョイスティック

モバイルゲーム向けバーチャルジョイスティック実装ガイド。
**外部ライブラリ不要** - カスタム実装で軽量・確実に動作。

## シンプルなジョイスティック実装

```html
<!-- ジョイスティック配置用DOM -->
<div id="joystick-zone" style="
  position: fixed;
  bottom: calc(30px + env(safe-area-inset-bottom));
  left: 20px;
  width: 120px;
  height: 120px;
  z-index: 100;
  touch-action: none;
"></div>

<script type="module">
import * as THREE from 'three';

// ==================== 仮想ジョイスティッククラス ====================
class VirtualJoystick {
  constructor(container, options = {}) {
    this.container = container;
    this.radius = options.radius || 50;
    this.innerRadius = options.innerRadius || 25;
    this.color = options.color || 'rgba(255,255,255,0.5)';

    this.active = false;
    this.vector = { x: 0, y: 0 };
    this.startPos = { x: 0, y: 0 };

    this.createElements();
    this.bindEvents();
  }

  createElements() {
    // ベース（外側の円）
    // ★重要: 中央配置にはtransformを使用（left/bottom基準だとズレる）
    this.base = document.createElement('div');
    this.base.style.cssText = `
      position: absolute;
      width: ${this.radius * 2}px;
      height: ${this.radius * 2}px;
      background: rgba(255,255,255,0.2);
      border: 3px solid ${this.color};
      border-radius: 50%;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    `;

    // スティック（内側の円）
    // ★重要: marginで中央配置（transformはJSアニメーションで使用するため）
    this.stick = document.createElement('div');
    this.stick.style.cssText = `
      position: absolute;
      width: ${this.innerRadius * 2}px;
      height: ${this.innerRadius * 2}px;
      background: ${this.color};
      border-radius: 50%;
      left: 50%;
      top: 50%;
      margin-left: -${this.innerRadius}px;
      margin-top: -${this.innerRadius}px;
      transition: none;
    `;

    this.base.appendChild(this.stick);
    this.container.appendChild(this.base);
  }

  bindEvents() {
    // タッチイベント
    this.container.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    this.container.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    this.container.addEventListener('touchend', (e) => this.onEnd(e));
    this.container.addEventListener('touchcancel', (e) => this.onEnd(e));

    // マウスイベント（PC デバッグ用）
    this.container.addEventListener('mousedown', (e) => this.onMouseStart(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', (e) => this.onMouseEnd(e));
  }

  onStart(e) {
    e.preventDefault();
    this.active = true;
    const rect = this.base.getBoundingClientRect();
    this.startPos = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  onMove(e) {
    if (!this.active) return;
    e.preventDefault();

    const touch = e.touches[0];
    this.updatePosition(touch.clientX, touch.clientY);
  }

  onEnd(e) {
    this.active = false;
    this.resetStick();
  }

  onMouseStart(e) {
    this.active = true;
    const rect = this.base.getBoundingClientRect();
    this.startPos = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  onMouseMove(e) {
    if (!this.active) return;
    this.updatePosition(e.clientX, e.clientY);
  }

  onMouseEnd(e) {
    if (!this.active) return;
    this.active = false;
    this.resetStick();
  }

  updatePosition(clientX, clientY) {
    const dx = clientX - this.startPos.x;
    const dy = clientY - this.startPos.y;

    const maxDistance = this.radius - this.innerRadius;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);

    const clampedX = Math.cos(angle) * distance;
    const clampedY = Math.sin(angle) * distance;

    this.stick.style.transform = `translate(${clampedX}px, ${clampedY}px)`;

    // 正規化されたベクトル (-1 ~ 1)
    // ★重要: Y軸を反転する（-clampedY）
    // 理由: HTML/ブラウザの座標系では画面上方向がY=0（上が小さい）
    //       ジョイスティックを上に倒すとdy < 0（負の値）になる
    //       しかし3Dゲームでは「上=前進=正の値」にしたい
    //       そのため符号を反転してプラスにする
    this.vector = {
      x: clampedX / maxDistance,
      y: -clampedY / maxDistance  // ★Y軸反転: 上に倒す → プラス値 → 前進
    };
  }

  resetStick() {
    this.stick.style.transform = 'translate(0px, 0px)';
    this.vector = { x: 0, y: 0 };
  }

  // 現在の入力値を取得
  getVector() {
    return this.vector;
  }
}

// ==================== 使用例 ====================
const joystick = new VirtualJoystick(document.getElementById('joystick-zone'));

// アニメーションループ内で使用
function animate() {
  const input = joystick.getVector();
  const speed = 0.1;

  player.position.x += input.x * speed;
  player.position.z -= input.y * speed;

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
</script>
```

## カメラ方向を考慮した移動

```javascript
const moveDirection = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();

function animate() {
  const input = joystick.getVector();

  if (input.x !== 0 || input.y !== 0) {
    // カメラの前方向を取得
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();

    // 右方向
    const rightDirection = new THREE.Vector3();
    rightDirection.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));

    // 移動ベクトル計算
    moveDirection.set(0, 0, 0);
    moveDirection.addScaledVector(rightDirection, input.x);
    moveDirection.addScaledVector(cameraDirection, input.y);

    // プレイヤー移動
    const speed = 0.1;
    player.position.add(moveDirection.multiplyScalar(speed));

    // プレイヤーの向きを移動方向に
    if (moveDirection.length() > 0.01) {
      const angle = Math.atan2(moveDirection.x, moveDirection.z);
      player.rotation.y = angle;
    }
  }

  renderer.render(scene, camera);
}
```

## デュアルジョイスティック（移動 + 視点）

```html
<div id="joystick-move" style="position:fixed; bottom:30px; left:20px; width:120px; height:120px; z-index:100; touch-action:none;"></div>
<div id="joystick-look" style="position:fixed; bottom:30px; right:20px; width:120px; height:120px; z-index:100; touch-action:none;"></div>

<script type="module">
// 移動用ジョイスティック
const moveJoystick = new VirtualJoystick(
  document.getElementById('joystick-move'),
  { color: 'rgba(100,150,255,0.6)' }
);

// 視点用ジョイスティック
const lookJoystick = new VirtualJoystick(
  document.getElementById('joystick-look'),
  { color: 'rgba(255,100,100,0.6)' }
);

// ★カメラピッチ用の状態変数
let cameraPitch = 0;  // 上下角度

function animate() {
  const move = moveJoystick.getVector();
  const look = lookJoystick.getVector();

  // 移動
  player.position.x += move.x * 0.1;
  player.position.z -= move.y * 0.1;

  // 視点回転（ヨー: 左右）
  camera.rotation.y -= look.x * 0.02;

  // 視点回転（ピッチ: 上下）
  // ★重要: += を使用（上スワイプ=上を見る）
  // 解説: look.yはジョイスティックで反転済み（上=正）
  //       Three.js右手系ではX軸正回転=下を向く
  //       したがって上スワイプ(正)で下を向かないよう -= に変更
  cameraPitch -= look.y * 0.02;
  cameraPitch = Math.max(-Math.PI/4, Math.min(Math.PI/4, cameraPitch));
  camera.rotation.x = cameraPitch;

  renderer.render(scene, camera);
}
</script>
```

## アクションボタン

```html
<button id="action-btn" style="
  position: fixed;
  bottom: calc(40px + env(safe-area-inset-bottom));
  right: 20px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(145deg, #ff6b6b, #ee5a5a);
  border: 3px solid white;
  color: white;
  font-size: 14px;
  font-weight: bold;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  z-index: 100;
">ACTION</button>

<script type="module">
let isActionPressed = false;

const actionBtn = document.getElementById('action-btn');

actionBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isActionPressed = true;
  actionBtn.style.transform = 'scale(0.9)';
  performAction();
});

actionBtn.addEventListener('touchend', () => {
  isActionPressed = false;
  actionBtn.style.transform = 'scale(1)';
});

// クリックイベント（PC用）
actionBtn.addEventListener('click', (e) => {
  e.preventDefault();
  performAction();
});

function performAction() {
  // ジャンプ、攻撃、シュートなど
  console.log('Action performed!');
}
</script>
```

## CSS設定（競合回避）

```css
/* ジョイスティック領域でのデフォルト動作を無効化 */
#joystick-zone, #joystick-move, #joystick-look {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

/* ゲーム全体のスクロール防止 */
html, body {
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: none;
}

/* iOSでのバウンス無効化 */
body {
  position: fixed;
  width: 100%;
  height: 100%;
}
```

## z-indexレイヤー管理（重要）

**透明な操作エリアがボタンのタッチを吸い取る問題を防ぐ。**

```css
/* ★レイヤー階層を明確に定義 */

/* 背景レイヤー: 広範囲のドラッグ/カメラ操作エリア */
#camera-zone,
.drag-zone {
  z-index: 5;
  touch-action: none;
}

/* 中間レイヤー: ジョイスティック */
#joystick-zone,
#joystick-move,
#joystick-look {
  z-index: 50;
}

/* 前面レイヤー: ボタン類（常に最前面） */
.control-area,
#action-btn,
#jump-btn,
#fire-btn,
#controls button {
  z-index: 100;
}

/* UI/HUD: スコア、ライフ表示（タッチ透過） */
.hud,
#score,
#lives {
  z-index: 150;
  pointer-events: none;
}
```

### レイヤー階層まとめ

| z-index | 用途 | 例 |
|---------|------|-----|
| 5 | 背景操作エリア | カメラドラッグ、画面タッチ移動 |
| 50 | ジョイスティック | 移動用、視点用 |
| 100 | アクションボタン | ジャンプ、攻撃、発射 |
| 150 | HUD（タッチ透過） | スコア、ライフ |

### よくある問題

| 症状 | 原因 | 解決 |
|------|------|------|
| ボタンが反応しない | カメラゾーンがタッチを吸収 | ボタンの `z-index: 100` |
| カメラがボタン上で動く | レイヤー逆転 | カメラゾーンの `z-index: 5` |
| HUDがタッチを妨害 | イベント発生 | `pointer-events: none` |

## モバイル判定

```javascript
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

if (isMobile) {
  document.getElementById('joystick-zone').style.display = 'block';
  document.getElementById('action-btn').style.display = 'block';
} else {
  // PC: キーボード操作のみ
  document.getElementById('joystick-zone').style.display = 'none';
  document.getElementById('action-btn').style.display = 'none';
}
```

---

## ドラッグ式タッチ移動（ジョイスティック不要版）

シンプルなゲームではジョイスティックなしでドラッグ操作が適切：

```javascript
// ★タッチ状態管理
const touchState = {
  active: false,
  lastX: 0,
  lastY: 0
};

// ★画面サイズに依存しない感度
const sensitivity = () => window.innerWidth / 400;

// ★{ passive: false } でブラウザのスクロールを確実に防止
document.addEventListener('touchstart', (e) => {
  e.preventDefault();
  touchState.active = true;
  touchState.lastX = e.touches[0].clientX;
  touchState.lastY = e.touches[0].clientY;
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  e.preventDefault();  // ★これがないと画面スクロールが優先される
  if (!touchState.active) return;

  const touch = e.touches[0];
  // ★相対移動量（Delta）を計算
  const deltaX = (touch.clientX - touchState.lastX) * sensitivity();
  const deltaY = (touch.clientY - touchState.lastY) * sensitivity();

  // 3D空間での移動（X=左右、Z=前後）
  player.position.x += deltaX * 0.01;
  player.position.z += deltaY * 0.01;  // 注: 2Dと違いY軸反転不要な場合あり

  touchState.lastX = touch.clientX;
  touchState.lastY = touch.clientY;
}, { passive: false });

document.addEventListener('touchend', () => {
  touchState.active = false;
});

document.addEventListener('touchcancel', () => {
  touchState.active = false;
});
```

---

## タッチ操作のベストプラクティス

### 必須事項

| 項目 | 理由 |
|------|------|
| `{ passive: false }` | `preventDefault()` を有効にするため |
| `e.preventDefault()` | ブラウザのスクロールを防止 |
| `e.touches[0].clientX` | タッチは `e.clientX` ではなくこちら |
| 相対移動（Delta） | 絶対座標だと指で対象が隠れる |
| 画面サイズ依存の感度 | どの端末でも同じ操作感 |

### 座標取得の違い

```javascript
// ★マウスとタッチで座標取得方法が異なる
function getEventPosition(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else {
    return { x: e.clientX, y: e.clientY };
  }
}
```

### マルチタッチID管理（上級）

移動しながら別のボタンを押す操作には、タッチIDによる追跡が必要：

```javascript
const activeTouches = new Map();

document.addEventListener('touchstart', (e) => {
  for (const touch of e.changedTouches) {
    activeTouches.set(touch.identifier, {
      startX: touch.clientX,
      startY: touch.clientY,
      purpose: detectTouchPurpose(touch)  // 'move' or 'action'
    });
  }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const tracked = activeTouches.get(touch.identifier);
    if (tracked && tracked.purpose === 'move') {
      // 移動処理
    }
  }
}, { passive: false });

document.addEventListener('touchend', (e) => {
  for (const touch of e.changedTouches) {
    activeTouches.delete(touch.identifier);
  }
});

function detectTouchPurpose(touch) {
  // 画面左半分は移動、右半分はアクション
  return touch.clientX < window.innerWidth / 2 ? 'move' : 'action';
}
```

---

## カメラピッチ方向（上下回転）の正しい実装

**Three.js右手座標系でのカメラ回転方向を正しく理解する。**

### 座標系の理解

```
Three.js右手座標系:
- X軸正回転 → カメラが下を向く
- X軸負回転 → カメラが上を向く

タッチ入力:
- 上スワイプ → deltaY < 0（画面上方向はY値が小さい）
- 下スワイプ → deltaY > 0
```

### ドラッグでカメラ操作（推奨パターン）

```javascript
let cameraPitch = 0;  // 上下角度（ラジアン）
let cameraYaw = 0;    // 左右角度（ラジアン）

const sensitivity = 0.005;

document.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!touchState.active) return;

  const touch = e.touches[0];
  const deltaX = touch.clientX - touchState.lastX;
  const deltaY = touch.clientY - touchState.lastY;

  // ヨー（左右回転）: 右スワイプ=右を向く
  cameraYaw -= deltaX * sensitivity;

  // ピッチ（上下回転）: 上スワイプ=上を向く
  // ★重要: += を使用
  // 上スワイプ(deltaY < 0) → pitch減少 → X軸負回転 → 上を向く
  cameraPitch += deltaY * sensitivity;
  cameraPitch = Math.max(-Math.PI/3, Math.min(Math.PI/3, cameraPitch));

  // カメラに適用
  camera.rotation.order = 'YXZ';  // ジンバルロック防止
  camera.rotation.y = cameraYaw;
  camera.rotation.x = cameraPitch;

  touchState.lastX = touch.clientX;
  touchState.lastY = touch.clientY;
}, { passive: false });
```

### 方向の検証方法

| 操作 | deltaY | pitch変化 | X軸回転 | 結果 |
|------|--------|-----------|---------|------|
| 上スワイプ | < 0 | 減少 | 負 | 上を向く ✓ |
| 下スワイプ | > 0 | 増加 | 正 | 下を向く ✓ |

### よくある間違い

```javascript
// ❌ 間違い: 上スワイプで下を向いてしまう
cameraPitch -= deltaY * sensitivity;

// ✓ 正解: 上スワイプで上を向く
cameraPitch += deltaY * sensitivity;
```

### ジョイスティック使用時の注意

ジョイスティックでY軸を反転している場合（`y: -clampedY`）、
カメラピッチには `-=` を使用する:

```javascript
// ジョイスティックのlook.yは反転済み（上=正の値）
// Three.jsでX軸正回転=下を向く
// したがって -= で反転させる
cameraPitch -= look.y * sensitivity;
```
