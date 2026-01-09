/**
 * Base rules and design style for game generation
 * These are included in all prompts (create and update)
 */

const designStyle = `[CRITICAL] デフォルトのデザインスタイル（ユーザーがデザインを指定しない場合に必ず適用すること）:

全体的な雰囲気 (Mood): 日本の「KAWAII」カルチャーや「ゆめかわいい」をベースにした、ポップでドリーミーな世界観。暴力的・写実的な表現は避け、おもちゃ箱のような「無害で楽しい」印象を与える。

カラーパレット (Colors): 背景は極めて淡いピンク（例: Lavender Blush #FFF0F5）。メインカラーはホットピンク (#FF69B4) やパステルパープル (#9370DB)。アクセントにティファニーブルー/ミントグリーン (#4ECDC4) やゴールド (#FFD700) を使用する。全体的に彩度は高めだが明度も高く、「パステルネオン」な印象にする。暗い色は影以外に使わない。

3Dモデル・形状 (Geometry): 球体やカプセル、円錐などのプリミティブを組み合わせ、角を極力なくしたラウンドフォルムにする。四角い物体でもベベルや角丸を用い、デフォルメされた頭身の低いコロコロしたシルエットにする。

マテリアル・ライティング (Material & Lighting): リアルな質感ではなく Toon Material やマットな質感を採用する。影は黒ではなく濃いピンクや紫がかった柔らかい影にする。カメラは Orthographic Camera（等角投影/平行投影）を使用し、ミニチュア感を強調する。フォッグは絶対に使用禁止（scene.fog, THREE.Fog, THREE.FogExp2 は使わない）。ライティング強度は0.45とし、白飛びを避けたソフトな表現にする。

UIデザイン (User Interface): フォントは丸ゴシック体（例: M PLUS Rounded 1c）を使用する。ボタンや枠は角丸（border-radius: 50% や 20px 以上）とし、白い太めのフチ取りやドロップシャドウでステッカーのような見た目にする。

[STRICT] 上記のデフォルトデザインから逸脱してよいのは、ユーザーが明示的に別のデザインや雰囲気を指定した場合のみ。`;

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
  - 音声: Howler.js (https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js)
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

const prohibitions = `[禁止事項 - CRITICAL]

絶対禁止:
- alert() の使用（モーダルやトースト通知を代用）
- Base64データの直接埋め込み（画像・音声は必ず絶対URLを使用）
- location.reload() でのリスタート（変数初期化でリセットすること）
- 疑似ローディング画面の実装
- フォッグの使用（scene.fog, THREE.Fog, THREE.FogExp2）

リスタート実装:
\`\`\`javascript
function resetGame() {
  score = 0;
  playerX = startX;
  playerY = startY;
  gameOver = false;
  // 全ての関連変数を初期値に戻す
}
\`\`\`

パフォーマンス注意:
- 重いリソースは非同期でロード
- 不要になったイベントリスナーとオブジェクトは適切に破棄
- 画面外のオブジェクトは更新・描画から除外`;

module.exports = {
  designStyle,
  codingRules,
  gameDesignRules,
  touchControlRules,
  cameraSystemRules,
  movementRules,
  audioRules,
  prohibitions,

  // Combined rules for system prompt
  getBaseRules() {
    // EXPERIMENT: Disable design style to test if skills work
    // return `${designStyle}
    return `[実験モード] デザインスタイルはスキルから読み込んでください。

${codingRules}

${gameDesignRules}

${touchControlRules}

${cameraSystemRules}

${movementRules}

${audioRules}

${prohibitions}`;
  }
};
