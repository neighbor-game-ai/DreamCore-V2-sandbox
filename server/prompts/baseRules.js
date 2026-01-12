/**
 * Base rules for game generation
 * Minimal set of rules - technical details are delegated to skills
 *
 * Removed (delegated to skills):
 * - codingRules (CDN settings) → p5js-setup, threejs-setup
 * - touchControlRules → p5js-input, threejs-input
 * - cameraSystemRules → threejs-setup
 * - movementRules → threejs-setup
 * - resultScreenRules → tween-animation
 *
 * Visual style is determined by user selection and stored in STYLE.md
 */

const gameDesignRules = `[ゲームデザインルール]
- 直感的な操作（タップ、スワイプ、ドラッグ）
- 明確なフィードバック（視覚・音声）
- スコアやプログレスの表示
- ゲームオーバー・リトライ機能
- ゲームは即座に開始（タイトル画面やスタート画面は不要）`;

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
  gameDesignRules,
  audioRules,
  prohibitions,

  // Combined rules for system prompt
  getBaseRules() {
    return `${gameDesignRules}

${audioRules}

${prohibitions}`;
  }
};
