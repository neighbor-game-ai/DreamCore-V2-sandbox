#!/usr/bin/env node
/**
 * 分類結果の統計分析スクリプト
 * 高度な統計情報とインサイトを生成
 */

const fs = require('fs');
const path = require('path');

function analyzeClassificationFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ファイルが見つかりません: ${filePath}`);
    process.exit(1);
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // 基本統計
    const total = data.length;
    const games2d = data.filter(g => g.gameType === 'game-2d');
    const games3d = data.filter(g => g.gameType === 'game-3d');

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║       📊 ゲームリクエスト分類 統計分析レポート         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // サマリー
    console.log('📈 基本統計');
    console.log('─'.repeat(60));
    console.log(`  合計ゲーム数:        ${total}`);
    console.log(`  2Dゲーム:            ${games2d.length} (${(games2d.length / total * 100).toFixed(1)}%)`);
    console.log(`  3Dゲーム:            ${games3d.length} (${(games3d.length / total * 100).toFixed(1)}%)`);
    console.log();

    // 確信度の統計
    console.log('🎯 確信度の統計');
    console.log('─'.repeat(60));
    const allConfidence = data.map(g => g.confidence);
    const avgConfidence = allConfidence.reduce((a, b) => a + b, 0) / allConfidence.length;
    const minConfidence = Math.min(...allConfidence);
    const maxConfidence = Math.max(...allConfidence);
    const medianConfidence = allConfidence.sort((a, b) => a - b)[Math.floor(allConfidence.length / 2)];

    console.log(`  平均確信度:          ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`  中央値:              ${(medianConfidence * 100).toFixed(1)}%`);
    console.log(`  最小値:              ${(minConfidence * 100).toFixed(1)}%`);
    console.log(`  最大値:              ${(maxConfidence * 100).toFixed(1)}%`);

    // 確信度の分布
    const confidenceBuckets = {
      '90-100%': 0,
      '70-89%': 0,
      '50-69%': 0,
      '0-49%': 0
    };

    for (const game of data) {
      const conf = game.confidence * 100;
      if (conf >= 90) confidenceBuckets['90-100%']++;
      else if (conf >= 70) confidenceBuckets['70-89%']++;
      else if (conf >= 50) confidenceBuckets['50-69%']++;
      else confidenceBuckets['0-49%']++;
    }

    console.log('\n  確信度の分布:');
    for (const [range, count] of Object.entries(confidenceBuckets)) {
      const pct = (count / total * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / total * 30));
      console.log(`    ${range.padEnd(10)} ${count.toString().padEnd(4)} (${pct.padEnd(5)}%) ${bar}`);
    }
    console.log();

    // 2D/3D別の分析
    console.log('🎮 2Dゲームの分析');
    console.log('─'.repeat(60));
    const avg2d = games2d.reduce((a, b) => a + b.confidence, 0) / games2d.length;
    console.log(`  数:                  ${games2d.length}`);
    console.log(`  平均確信度:          ${(avg2d * 100).toFixed(1)}%`);
    const highConfidence2d = games2d.filter(g => g.confidence >= 0.8).length;
    console.log(`  高確信度 (≥80%):     ${highConfidence2d} (${(highConfidence2d / games2d.length * 100).toFixed(1)}%)`);
    console.log();

    console.log('🎮 3Dゲームの分析');
    console.log('─'.repeat(60));
    const avg3d = games3d.reduce((a, b) => a + b.confidence, 0) / games3d.length;
    console.log(`  数:                  ${games3d.length}`);
    console.log(`  平均確信度:          ${(avg3d * 100).toFixed(1)}%`);
    const highConfidence3d = games3d.filter(g => g.confidence >= 0.8).length;
    console.log(`  高確信度 (≥80%):     ${highConfidence3d} (${(highConfidence3d / games3d.length * 100).toFixed(1)}%)`);
    console.log();

    // キーワード分析
    console.log('🔑 検出キーワードの分析');
    console.log('─'.repeat(60));

    const keyword2dCount = {};
    const keyword3dCount = {};

    for (const game of data) {
      for (const kw of game.analysis.matched2d) {
        keyword2dCount[kw] = (keyword2dCount[kw] || 0) + 1;
      }
      for (const kw of game.analysis.matched3d) {
        keyword3dCount[kw] = (keyword3dCount[kw] || 0) + 1;
      }
    }

    console.log('  2D特性キーワード（トップ10）:');
    const top2dKeywords = Object.entries(keyword2dCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [kw, count] of top2dKeywords) {
      const pct = (count / games2d.length * 100).toFixed(1);
      console.log(`    • ${kw.padEnd(20)} ${count.toString().padEnd(4)} 件 (${pct}%)`);
    }

    console.log('\n  3D特性キーワード（トップ10）:');
    const top3dKeywords = Object.entries(keyword3dCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [kw, count] of top3dKeywords) {
      const pct = (count / games3d.length * 100).toFixed(1);
      console.log(`    • ${kw.padEnd(20)} ${count.toString().padEnd(4)} 件 (${pct}%)`);
    }
    console.log();

    // スコア分析
    console.log('📊 スコア分析');
    console.log('─'.repeat(60));

    const all2dScores = data.map(g => g.analysis.score2d);
    const all3dScores = data.map(g => g.analysis.score3d);

    const avg2dScore = all2dScores.reduce((a, b) => a + b, 0) / all2dScores.length;
    const avg3dScore = all3dScores.reduce((a, b) => a + b, 0) / all3dScores.length;

    console.log(`  2D総スコア平均:      ${avg2dScore.toFixed(1)}`);
    console.log(`  3D総スコア平均:      ${avg3dScore.toFixed(1)}`);
    console.log();

    // 曖昧な判定
    console.log('⚠️  曖昧な判定');
    console.log('─'.repeat(60));
    const ambiguous = data.filter(g => g.confidence >= 0.4 && g.confidence < 0.7);
    console.log(`  低確信度ゲーム数:    ${ambiguous.length} (確信度: 40-69%)`);

    if (ambiguous.length > 0 && ambiguous.length <= 10) {
      console.log('\n  該当ゲーム:');
      for (const game of ambiguous.slice(0, 10)) {
        console.log(`    • ${game.projectName} (確信度: ${(game.confidence * 100).toFixed(0)}%)`);
      }
    }
    console.log();

    // メッセージ数の分析
    console.log('💬 会話の活発さ分析');
    console.log('─'.repeat(60));
    const messageCounts = data.map(g => g.messageCount);
    const avgMessages = messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length;
    const maxMessages = Math.max(...messageCounts);
    const minMessages = Math.min(...messageCounts);

    console.log(`  平均メッセージ数:    ${avgMessages.toFixed(1)}`);
    console.log(`  最大メッセージ数:    ${maxMessages}`);
    console.log(`  最小メッセージ数:    ${minMessages}`);

    const multiTurnGames = data.filter(g => g.messageCount >= 5);
    console.log(`  複数ターン (≥5):     ${multiTurnGames.length} (${(multiTurnGames.length / total * 100).toFixed(1)}%)`);
    console.log();

    // インサイト
    console.log('💡 インサイト');
    console.log('─'.repeat(60));

    if (games3d.length > games2d.length) {
      const diff = games3d.length - games2d.length;
      console.log(`  • ユーザーは3Dゲームを好む傾向（${diff}件多い）`);
    } else {
      const diff = games2d.length - games3d.length;
      console.log(`  • ユーザーは2Dゲームを好む傾向（${diff}件多い）`);
    }

    if (avg3d > avg2d) {
      console.log(`  • 3Dゲームの確信度が高い（${(avg3d * 100).toFixed(0)}% vs ${(avg2d * 100).toFixed(0)}%）`);
    }

    const mostCommon3dKeyword = top3dKeywords[0]?.[0];
    const mostCommon2dKeyword = top2dKeywords[0]?.[0];

    if (mostCommon3dKeyword) {
      console.log(`  • 最も一般的な3D機能: ${mostCommon3dKeyword}`);
    }
    if (mostCommon2dKeyword) {
      console.log(`  • 最も一般的な2D機能: ${mostCommon2dKeyword}`);
    }

    console.log();
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('❌ 分析中にエラーが発生しました:', error.message);
    process.exit(1);
  }
}

// メイン実行
const args = process.argv.slice(2);
const filePath = args[0] || './game_classification_report.json';

if (!filePath || args.includes('--help')) {
  console.log(`
使用方法: node analyzeClassification.js [ファイルパス]

デフォルト: ./game_classification_report.json

例:
  node analyzeClassification.js game_classification_report.json
  `);
  process.exit(args.includes('--help') ? 0 : 1);
}

analyzeClassificationFile(filePath);
