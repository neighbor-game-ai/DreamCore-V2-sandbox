/**
 * Base rules and design style for game generation
 * These are included in all prompts (create and update)
 */

// Note: Visual style is now determined by user selection at game creation time.
// The visual guideline is appended to the user's message and takes precedence.
// If no style is selected, AI should create a reasonable default based on the game type.

const codingRules = `[コーディングルール]
- HTML5 + CSS + JavaScript（単一HTMLファイル）
- モバイルファースト（タッチ操作、縦画面対応、viewport設定必須）
- 60fps目標のパフォーマンス最適化
- CDNからライブラリを読み込む
  - 2Dゲーム: p5.js (https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.2/p5.min.js)
  - 3Dゲーム: Three.js r172 ES Modules形式で読み込む:
    <script type="importmap">
    { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/" } }
    </script>
    <script type="module">
    import * as THREE from 'three';
    </script>
- タッチイベントは passive: false で preventDefault() を適切に使用
- 画面サイズ変更に対応（resize イベント処理）`;

const gameDesignRules = `[ゲームデザインルール]
- 直感的な操作（タップ、スワイプ、ドラッグ）
- 明確なフィードバック（視覚・音声）
- スコアやプログレスの表示
- ゲームオーバー・リトライ機能
- ゲームは即座に開始（タイトル画面やスタート画面は不要）`;

const touchControlRules = `[タッチ操作ルール - CRITICAL]

仮想ジョイスティック実装:
- touchstartで開始タッチのidentifierを記録し、touchmove/touchendでは同じidentifierのタッチのみ処理する
- event.touches[0]は使用禁止（マルチタッチで破綻する）
- リスナーは { passive: false } で登録し、preventDefault()を呼ぶ
- CSS: .joystick { touch-action: none; pointer-events: auto; }
- マルチタッチ時、ジョイスティックは元のidentifierに紐付けたまま、別の指でカメラ操作を許可

カメラドラッグ実装:
- ジョイスティックとは別のidentifierでカメラタッチを管理
- touchstartでevent.changedTouchesからカメラエリア内のタッチを選択
- アクティブな間はidentifierを再割り当てしない（touchend/touchcancelで解放）
- FIRE/JUMPボタン上で開始したタッチはカメラドラッグから除外

UI操作ルール:
- オーバーレイコンテナは pointer-events: none; でOK
- 明示的なインタラクティブ要素（ボタン、ジョイスティック）は pointer-events: auto; 必須
- ボタンは touchstart と click 両方にリスナー登録
- UI層のz-indexは最上位に（キャンバスより上）

入力座標系の一貫性:
- 入力軸とゲーム座標系を一致させる
- 暗黙の軸反転を避け、必要な場合は一箇所で集中管理
- 移動、照準、当たり判定で一貫した座標系を使用

テキスト選択の無効化（モバイル長押し対策）:
\`\`\`css
{ -webkit-user-select: none; user-select: none; }
\`\`\``;

const cameraSystemRules = `[3Dカメラシステムルール]

Yaw/Pitch カメラ実装（必須）:
- yawとpitchを明示的なスカラー変数として保持（camera.rotation直接操作禁止）
- 初期化時に camera.rotation.order = 'YXZ' を設定
- クォータニオンで向きを設定: camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
- pitchは [-Math.PI/2, Math.PI/2] にクランプ、yawは自由回転
- camera.up = (0, 1, 0) を維持、rollは常に0
- カメラ感度のデフォルト: CAMERA_SENSITIVITY = 0.006（ラジアン/ピクセル）

カメラタイプ:
- 一人称視点: プレイヤー視点からのカメラ配置
- 三人称視点: プレイヤー背後からのフォローカメラ
- 切り替え: トランジションエフェクトを使用`;

const movementRules = `[3D移動ルール - カメラ相対]

移動ベクトル計算（必須）:
- カメラのforward vectorを水平面に投影（y=0にしてnormalize）
- right vectorは normalize(cross(forward, camera.up)) で計算
- 移動ベクトル: move = forward * inputY + right * inputX
- 移動計算はyawのみ使用（pitchは移動に影響させない）

実装例:
\`\`\`javascript
const forward = new THREE.Vector3();
camera.getWorldDirection(forward);
forward.y = 0;
forward.normalize();
const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
const move = forward.multiplyScalar(inputY).add(right.multiplyScalar(inputX));
\`\`\``;

const audioRules = `[オーディオルール]

BGM（ストリーミング必須）:
- <audio>タグを使用（decodeAudioDataは禁止）
- DOM配置: <audio id="bgm" src="URL" preload="none" playsinline hidden></audio>
- 再生開始は初回ユーザーインタラクション時のみ:
  \`\`\`javascript
  element.addEventListener('pointerdown', () => {
    bgm.load();
    bgm.addEventListener('canplay', () => bgm.play(), { once: true });
  }, { once: true });
  \`\`\`
- canplaythroughを待たない

効果音:
- new Audio(url) で作成、preload='none'
- 同時再生: cloneNode(true).play()
- 短い効果音のみAudioContextでデコードOK`;

const resultScreenRules = `[リザルト画面 - GSAP必須]

GSAPを使ったリッチなリザルト画面を必ず実装すること:

CDN読み込み:
\`\`\`html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
\`\`\`

リザルト画面の必須要素:
- 半透明オーバーレイ（背景をぼかす）
- スコア表示（カウントアップアニメーション）
- 「GAME OVER」または「CLEAR」のタイトル
- リトライボタン

アニメーション実装例:
\`\`\`javascript
function showResult(score, isGameOver = true) {
  const overlay = document.getElementById('result-overlay');
  overlay.style.display = 'flex';

  // タイムラインでシーケンス
  const tl = gsap.timeline();

  // オーバーレイフェードイン
  tl.fromTo(overlay,
    { opacity: 0 },
    { opacity: 1, duration: 0.3 }
  );

  // タイトル（バウンス登場）
  tl.fromTo('#result-title',
    { scale: 0, rotation: -10 },
    { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.7)' }
  );

  // スコアカウントアップ
  const scoreObj = { value: 0 };
  tl.to(scoreObj, {
    value: score,
    duration: 1.5,
    ease: 'power2.out',
    onUpdate: () => {
      document.getElementById('result-score').textContent = Math.floor(scoreObj.value);
    }
  }, '-=0.2');

  // ボタン登場（下からスライド）
  tl.fromTo('#retry-btn',
    { y: 50, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }
  );
}
\`\`\`

リザルト画面HTML例:
\`\`\`html
<div id="result-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(5px); justify-content:center; align-items:center; flex-direction:column; z-index:1000;">
  <div id="result-title" style="font-size:3rem; color:#FF69B4; text-shadow:0 0 20px #FF69B4; margin-bottom:20px;">GAME OVER</div>
  <div style="font-size:1.5rem; color:#fff; margin-bottom:10px;">SCORE</div>
  <div id="result-score" style="font-size:4rem; color:#FFD700; font-weight:bold;">0</div>
  <button id="retry-btn" style="margin-top:30px; padding:15px 40px; font-size:1.2rem; background:linear-gradient(135deg,#FF69B4,#9370DB); border:none; border-radius:50px; color:#fff; cursor:pointer; box-shadow:0 5px 20px rgba(255,105,180,0.5);">RETRY</button>
</div>
\`\`\`

リトライボタン処理:
\`\`\`javascript
document.getElementById('retry-btn').addEventListener('click', () => {
  gsap.to('#result-overlay', {
    opacity: 0,
    duration: 0.3,
    onComplete: () => {
      document.getElementById('result-overlay').style.display = 'none';
      resetGame();
    }
  });
});
\`\`\``;

const prohibitions = `[禁止事項 - CRITICAL]

絶対禁止:
- alert() の使用（モーダルやトースト通知を代用）
- Base64データの直接埋め込み（画像・音声は必ず絶対URLを使用）
- location.reload() でのリスタート（変数初期化でリセットすること）
- 疑似ローディング画面の実装
- フォッグの使用（scene.fog, THREE.Fog, THREE.FogExp2）

[よくあるバグ - 必ず避けること]

1. pointer-eventsとイベントリスナーの矛盾:
   - 要素に pointer-events: none; を設定しているのに、その要素にクリック/タップイベントリスナーを追加するのは矛盾
   - クリック可能にしたい要素は必ず pointer-events: auto; にする
   - 正しい実装:
   \`\`\`css
   #overlay-container { pointer-events: none; }  /* コンテナは透過 */
   #start-button { pointer-events: auto; }       /* ボタンはクリック可能 */
   \`\`\`

2. resetGame()でのgameState設定ミス:
   - resetGame()内で gameState = 'PLAYING' に設定すると、スタート画面が機能しない
   - resetGame()は変数の初期化のみ行い、gameStateは 'READY' や 'WAITING' に戻す
   - ゲーム開始は startGame() 等の別関数で行う
   - 正しい実装:
   \`\`\`javascript
   function resetGame() {
     score = 0;
     playerX = startX;
     gameState = 'READY';  // PLAYINGではなくREADYに戻す
   }
   function startGame() {
     resetGame();
     gameState = 'PLAYING';  // ここでPLAYINGに変更
   }
   \`\`\`

3. オーバーレイの表示/非表示:
   - ゲーム開始時: スタートオーバーレイを非表示、ゲームループ開始
   - ゲームオーバー時: リザルトオーバーレイを表示、ゲームループ停止または一時停止
   - リトライ時: リザルトオーバーレイを非表示、resetGame()→startGame()

パフォーマンス注意:
- 重いリソースは非同期でロード
- 不要になったイベントリスナーとオブジェクトは適切に破棄
- 画面外のオブジェクトは更新・描画から除外`;

module.exports = {
  codingRules,
  gameDesignRules,
  touchControlRules,
  cameraSystemRules,
  movementRules,
  audioRules,
  resultScreenRules,
  prohibitions,

  // Combined rules for system prompt
  getBaseRules() {
    // Visual style is now determined by user selection (via visual guideline in message)
    // No default style is enforced here
    return `${codingRules}

${gameDesignRules}

${touchControlRules}

${cameraSystemRules}

${movementRules}

${audioRules}

${resultScreenRules}

${prohibitions}`;
  }
};
