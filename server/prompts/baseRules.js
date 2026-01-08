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
- チュートリアルまたは操作説明`;

module.exports = {
  designStyle,
  codingRules,
  gameDesignRules,

  // Combined rules for system prompt
  getBaseRules() {
    return `${designStyle}

${codingRules}

${gameDesignRules}`;
  }
};
