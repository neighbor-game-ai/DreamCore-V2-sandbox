/**
 * ゲームタイプに基づいて適切なスキルを選択・ロード
 */

const fs = require('fs');
const path = require('path');

/**
 * 2Dゲーム用スキルマッピング
 */
const GAME_2D_SKILLS = [
  'p5js-setup',      // P5.js基本セットアップ
  'p5js-input',      // 入力処理
  'p5js-collision',  // 当たり判定
  'visual-polish-2d' // ビジュアルポーリッシュ
];

/**
 * 3Dゲーム用スキルマッピング
 */
const GAME_3D_SKILLS = [
  'threejs-setup',     // Three.js基本セットアップ
  'threejs-lighting',  // ライティング
  'kawaii-3d',         // KAWAIIスタイル3D
  'visual-polish-3d'   // ビジュアルポーリッシュ3D
];

/**
 * 共通スキル（全ゲームで使用可能）
 */
const COMMON_SKILLS = [
  'tween-animation',     // GSAP アニメーション
  'particles',           // パーティクルエフェクト
  'game-audio'          // ゲーム音声
];

/**
 * 特殊なジャンルに基づくスキル追加マッピング
 */
const GENRE_SKILLS = {
  'クリッカー': ['tween-animation'],
  'パズル': ['p5js-collision'],
  'シューティング': ['particles-explosion'],
  'レーシング': ['game-ai'],
  'ダンジョン': ['game-ai', 'threejs-lighting'],
  'ボクセル': ['threejs-setup']
};

/**
 * ゲームタイプに応じたスキルをロード
 * @param {string} gameType - 'game-2d' | 'game-3d'
 * @param {string} genre - ゲームジャンル（オプション）
 * @returns {Array} スキル配列
 */
function selectSkills(gameType, genre = '') {
  let skills = [...COMMON_SKILLS];

  if (gameType === 'game-3d') {
    skills.push(...GAME_3D_SKILLS);
  } else {
    skills.push(...GAME_2D_SKILLS);
  }

  // ジャンル固有のスキルを追加
  if (genre) {
    for (const [genreKeyword, genreSkills] of Object.entries(GENRE_SKILLS)) {
      if (genre.toLowerCase().includes(genreKeyword.toLowerCase())) {
        skills.push(...genreSkills);
      }
    }
  }

  // 重複を削除
  return [...new Set(skills)];
}

/**
 * スキルファイルが存在するか確認
 * @param {string} skillName - スキル名
 * @returns {boolean}
 */
function skillExists(skillName) {
  const skillPath = path.join(__dirname, '../../.claude/skills', skillName, 'SKILL.md');
  return fs.existsSync(skillPath);
}

/**
 * スキルのSUMMARYを読み込む（存在する場合のみ）
 * @param {string} skillName - スキル名
 * @returns {string|null}
 */
function loadSkillSummary(skillName) {
  const skillPath = path.join(__dirname, '../../.claude/skills', skillName, 'SKILL.md');

  if (!fs.existsSync(skillPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(skillPath, 'utf-8');

    // SUMMARY セクションを抽出
    const summaryMatch = content.match(/## SUMMARY\n([\s\S]*?)(?=\n## |\Z)/);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }

    return null;
  } catch (error) {
    console.error(`Failed to load skill summary for ${skillName}:`, error);
    return null;
  }
}

/**
 * ゲームタイプに基づいて統合されたスキルガイドラインを生成
 * @param {string} gameType - 'game-2d' | 'game-3d'
 * @param {string} genre - ゲームジャンル（オプション）
 * @returns {string} スキルガイドラインテキスト
 */
function generateSkillGuidelines(gameType, genre = '') {
  const skills = selectSkills(gameType, genre);
  let guideline = '';

  guideline += `[スキルガイドライン - ${gameType === 'game-3d' ? '3D' : '2D'}ゲーム]\n\n`;

  // 適用されるスキル情報を記載
  guideline += '**以下のスキルを適用します**:\n';

  for (const skill of skills) {
    if (skillExists(skill)) {
      const summary = loadSkillSummary(skill);
      if (summary) {
        guideline += `\n### ${skill}\n`;
        guideline += summary + '\n';
      } else {
        guideline += `- ${skill}\n`;
      }
    } else {
      guideline += `- ${skill} （利用可能）\n`;
    }
  }

  return guideline;
}

/**
 * ゲームタイプ判定結果に基づいてスキルを推奨
 * @param {Object} analysis - analyzeGameType() の結果
 * @returns {string} スキル推奨テキスト
 */
function recommendSkillsFromAnalysis(analysis) {
  const gameType = analysis.gameType;
  const confidence = analysis.confidence;

  let recommendation = '';

  if (confidence > 0.8) {
    // 確信度が高い場合
    recommendation = `判定: **${gameType === 'game-3d' ? '3D' : '2D'}ゲーム** (確信度: ${(confidence * 100).toFixed(0)}%)\n\n`;
  } else if (confidence > 0.5) {
    // 判定が曖昧な場合
    recommendation = `判定: **${gameType === 'game-3d' ? '3D' : '2D'}ゲーム** (判定が曖昧: ${(confidence * 100).toFixed(0)}%)\n`;
    recommendation += `※2Dと3Dどちらのゲームにもなり得ます\n\n`;
  } else {
    // 完全に曖昧な場合
    recommendation = `判定: **${gameType === 'game-3d' ? '3D' : '2D'}ゲーム** (デフォルト)\n\n`;
  }

  // 詳細情報を追加
  if (analysis.details.matched3d.length > 0) {
    recommendation += `3D検出キーワード: ${analysis.details.matched3d.join(', ')}\n`;
  }
  if (analysis.details.matched2d.length > 0) {
    recommendation += `2D検出キーワード: ${analysis.details.matched2d.join(', ')}\n`;
  }

  return recommendation;
}

module.exports = {
  selectSkills,
  skillExists,
  loadSkillSummary,
  generateSkillGuidelines,
  recommendSkillsFromAnalysis,
  GAME_2D_SKILLS,
  GAME_3D_SKILLS,
  COMMON_SKILLS,
  GENRE_SKILLS
};
