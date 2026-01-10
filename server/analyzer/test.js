#!/usr/bin/env node

/**
 * ゲームタイプ分析テスト
 */

const { analyzeGameType, applyExplicitOverride } = require('./gameTypeAnalyzer');
const { generateSkillGuidelines, selectSkills } = require('./skillSelector');

// テストケース
const testCases = [
  {
    name: '2Dシューティングゲーム',
    message: 'シューティングゲームを作ってください。プレイヤーが画面下から敵を撃つゲーム'
  },
  {
    name: '3Dダンジョン探索',
    message: 'FPS風のダンジョン探索ゲーム。Three.jsで3D空間を作成して、カメラで移動'
  },
  {
    name: 'シンプルなパズルゲーム',
    message: 'パズルゲーム。マッチ3のような感じでタイルをドラッグして消す'
  },
  {
    name: 'クリッカーゲーム',
    message: '楽しいクリッカーゲーム。タップしてカウンターを増やす'
  },
  {
    name: 'マインクラフトライク',
    message: 'マイクラみたいなボクセルゲーム。ブロックを配置して建築'
  },
  {
    name: 'スクロールアクション',
    message: 'スクロール背景でキャラクターを左右移動させるアクションゲーム'
  },
  {
    name: '明示的な2D指定',
    message: 'p5.jsで2Dゲームを作ってください'
  },
  {
    name: '明示的な3D指定',
    message: 'Three.jsで3Dゲームを作ってください'
  }
];

console.log('='.repeat(80));
console.log('ゲームタイプ判定テスト');
console.log('='.repeat(80));

for (const testCase of testCases) {
  console.log(`\n【${testCase.name}】`);
  console.log(`入力: "${testCase.message}"`);

  const analysis = analyzeGameType(testCase.message);
  const result = applyExplicitOverride(testCase.message, analysis);

  console.log(`判定: ${result.gameType === 'game-3d' ? '3D' : '2D'}ゲーム`);
  console.log(`確信度: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`理由: ${result.reason}`);

  if (analysis.details.matched3d.length > 0) {
    console.log(`3D特性: ${analysis.details.matched3d.join(', ')}`);
  }
  if (analysis.details.matched2d.length > 0) {
    console.log(`2D特性: ${analysis.details.matched2d.join(', ')}`);
  }

  // スキル推奨
  const skills = selectSkills(result.gameType);
  console.log(`推奨スキル: ${skills.join(', ')}`);
}

console.log('\n' + '='.repeat(80));
console.log('テスト完了');
console.log('='.repeat(80));
