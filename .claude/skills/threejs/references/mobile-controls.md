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
    this.base = document.createElement('div');
    this.base.style.cssText = `
      position: absolute;
      width: ${this.radius * 2}px;
      height: ${this.radius * 2}px;
      background: rgba(255,255,255,0.2);
      border: 3px solid ${this.color};
      border-radius: 50%;
      left: ${(this.container.offsetWidth - this.radius * 2) / 2}px;
      bottom: 10px;
    `;

    // スティック（内側の円）
    this.stick = document.createElement('div');
    this.stick.style.cssText = `
      position: absolute;
      width: ${this.innerRadius * 2}px;
      height: ${this.innerRadius * 2}px;
      background: ${this.color};
      border-radius: 50%;
      left: ${this.radius - this.innerRadius}px;
      top: ${this.radius - this.innerRadius}px;
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

function animate() {
  const move = moveJoystick.getVector();
  const look = lookJoystick.getVector();

  // 移動
  player.position.x += move.x * 0.1;
  player.position.z -= move.y * 0.1;

  // 視点回転
  camera.rotation.y -= look.x * 0.02;
  camera.rotation.x = Math.max(-Math.PI/4, Math.min(Math.PI/4, camera.rotation.x + look.y * 0.02));

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
