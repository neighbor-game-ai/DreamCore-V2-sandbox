/**
 * ゲームタイプ自動判定モジュール
 * ユーザーのリクエストから2D/3Dを判定
 */

/**
 * 3D特性を持つキーワード
 */
const KEYWORDS_3D = [
  // 視点・カメラ関連
  '3d', '3d化', '立体', 'モデル', 'ジオメトリ', 'メッシュ',
  '俯瞰', 'fps', 'tps',

  // Three.js関連
  'three', 'three.js', 'webgl', 'gpu',

  // 環境・ライティング
  'ライティング', '陰影', 'シェーダー', 'マテリアル', 'テクスチャ',
  '空間', '環境', 'ステージ', 'ワールド',

  // 物理・オブジェクト
  'ブロック', 'キューブ', 'ボール', '球', 'コリジョン',
  '物理演算', 'gravity', '重力',

  // 移動・移動操作
  'wasd', 'カメラ回転', '自由移動', 'パース',

  // ジャンル
  'マインクラフト', 'マイクラ', 'ボクセル',
  'ダンジョン', 'ラビリンス', 'ローグライク'
];

/**
 * 2D特性を持つキーワード
 */
const KEYWORDS_2D = [
  // ライブラリ
  'p5', 'p5.js', 'canvas', 'webgl 2d',

  // グラフィック
  '平面', '2d', '2次元',

  // スプライト・レイアウト
  'スプライト', 'キャラ', 'キャラクター', 'アニメーション',
  'シューティング', 'シュート', 'バレット',
  'スクロール', 'スクロール背景',

  // ジャンル固有
  'パズル', 'シューティング', 'シューティングゲーム',
  'プラットフォーマー', 'アクション', 'アドベンチャー',
  'clicker', 'クリッカー', 'タップ', 'タップゲーム',
  'マッチ3', 'マッチング', 'トリプルマッチ',
  'カーレース', 'レーシング', 'バイク',
  'フライト', 'フライングゲーム', '鳥',

  // UI・フロー
  'ボタン', 'メニュー', 'スコア', 'ゲージ'
];

/**
 * ゲームタイプを判定するスコア
 */
const SCORE_3D = 5;
const SCORE_2D = 1;

/**
 * ユーザーのリクエストからゲームタイプを分析
 * @param {string} userMessage - ユーザーのリクエスト
 * @returns {Object} { gameType: 'game-2d' | 'game-3d', confidence: 0-1, details: {...} }
 */
function analyzeGameType(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return {
      gameType: 'game-2d',
      confidence: 0.5,
      reason: 'リクエストが空です',
      details: { score3d: 0, score2d: 5 }
    };
  }

  const lowerMessage = userMessage.toLowerCase();

  // 3Dと2Dの指標スコアを計算
  let score3d = 0;
  let score2d = 0;
  const matched3d = [];
  const matched2d = [];

  // 3Dキーワードをチェック
  for (const keyword of KEYWORDS_3D) {
    if (lowerMessage.includes(keyword)) {
      score3d += SCORE_3D;
      matched3d.push(keyword);
    }
  }

  // 2Dキーワードをチェック
  for (const keyword of KEYWORDS_2D) {
    if (lowerMessage.includes(keyword)) {
      score2d += SCORE_2D;
      matched2d.push(keyword);
    }
  }

  // 追加の分析ロジック
  const additional3dFeatures = analyzeAdditional3dFeatures(lowerMessage);
  const additional2dFeatures = analyzeAdditional2dFeatures(lowerMessage);

  score3d += additional3dFeatures.score;
  score2d += additional2dFeatures.score;

  if (additional3dFeatures.matched.length > 0) {
    matched3d.push(...additional3dFeatures.matched);
  }
  if (additional2dFeatures.matched.length > 0) {
    matched2d.push(...additional2dFeatures.matched);
  }

  // 判定
  const total = score3d + score2d;
  const gameType = score3d > score2d ? 'game-3d' : 'game-2d';
  const confidence = total > 0 ? Math.max(score3d, score2d) / total : 0.5;

  return {
    gameType,
    confidence: Math.min(confidence, 1),
    reason: confidence > 0.7
      ? `${gameType === 'game-3d' ? '3D' : '2D'}ゲームと判定（確信度: ${(confidence * 100).toFixed(0)}%）`
      : `${gameType === 'game-3d' ? '3D' : '2D'}ゲームと判定（判定が曖昧：${(confidence * 100).toFixed(0)}%）`,
    details: {
      score3d,
      score2d,
      matched3d: [...new Set(matched3d)],  // 重複を削除
      matched2d: [...new Set(matched2d)],
      total
    }
  };
}

/**
 * 追加の3D特性を分析
 */
function analyzeAdditional3dFeatures(message) {
  const matched = [];
  let score = 0;

  // 視点パターン
  if (/(first.?person|fpv|一人称|fps|tps|三人称)/.test(message)) {
    matched.push('視点（一人称/三人称）');
    score += 3;
  }

  // オブジェクト操作パターン
  if (/(rotate|rotation|回転|pitch|yaw|roll)/.test(message)) {
    matched.push('3D回転操作');
    score += 3;
  }

  // 環境構築パターン
  if (/(build|建築|ブロック配置|アニメーション)/.test(message)) {
    matched.push('環境構築');
    score += 2;
  }

  // 深度感のパターン
  if (/(depth|z軸|前後|奥行き|perspective|パースペクティブ)/.test(message)) {
    matched.push('深度・パースペクティブ');
    score += 2;
  }

  return { matched, score };
}

/**
 * 追加の2D特性を分析
 */
function analyzeAdditional2dFeatures(message) {
  const matched = [];
  let score = 0;

  // タップ/クリック操作
  if (/(tap|click|click|タップ|クリック)/.test(message)) {
    matched.push('タップ/クリック操作');
    score += 2;
  }

  // スクロール・横スクロール
  if (/(scroll|horizontal|vertical|スクロール|横|縦)/.test(message)) {
    matched.push('スクロール');
    score += 2;
  }

  // パズル的要素
  if (/(puzzle|match|drag|ドラッグ|パズル|マッチ)/.test(message)) {
    matched.push('パズル要素');
    score += 2;
  }

  // シンプルなゲームデザイン
  if (/(simple|シンプル|easy|楽しい|かわいい|cute)/.test(message)) {
    matched.push('シンプルデザイン');
    score += 1;
  }

  return { matched, score };
}

/**
 * 明示的な指定がある場合のオーバーライド判定
 * @param {string} userMessage - ユーザーのリクエスト
 * @param {Object} analysis - analyzeGameType() の結果
 * @returns {Object} オーバーライド済み分析結果
 */
function applyExplicitOverride(userMessage, analysis) {
  const lower = userMessage.toLowerCase();

  // 明示的な3D指定
  if (/(3d|three.?js|webgl|fps|tps)/.test(lower)) {
    return {
      ...analysis,
      gameType: 'game-3d',
      confidence: 1.0,
      reason: '明示的に3Dゲームが指定されています'
    };
  }

  // 明示的な2D指定
  if (/(2d|p5.?js|canvas|2次元|平面)/.test(lower)) {
    return {
      ...analysis,
      gameType: 'game-2d',
      confidence: 1.0,
      reason: '明示的に2Dゲームが指定されています'
    };
  }

  return analysis;
}

/**
 * ゲームの説明文からタイプ判定（高精度版）
 * @param {string} description - ゲーム説明
 * @returns {string} 'game-2d' | 'game-3d'
 */
function getGameType(description) {
  const analysis = analyzeGameType(description);
  return analysis.gameType;
}

module.exports = {
  analyzeGameType,
  applyExplicitOverride,
  getGameType
};
