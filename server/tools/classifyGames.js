#!/usr/bin/env node
/**
 * ゲームリクエスト分類CLI
 * 使用方法:
 *   node classifyGames.js --format html --output report.html
 *   node classifyGames.js --format json --output games.json
 *   node classifyGames.js --format csv --output games.csv
 *   node classifyGames.js --console
 */

const { classifyGameRequests } = require('./gameClassifier');
const path = require('path');
const fs = require('fs');

// コマンドライン引数をパース
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    format: 'json',      // json, html, csv
    output: null,        // 出力ファイルパス
    console: false,      // コンソール出力
    confidence: 0        // 最小確信度（0-1）
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--format' && args[i + 1]) {
      options.format = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === '--console') {
      options.console = true;
    } else if (arg === '--confidence' && args[i + 1]) {
      options.confidence = parseFloat(args[++i]);
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
ゲームリクエスト分類ツール
========================

使用方法:
  node classifyGames.js [オプション]

オプション:
  --format <format>       出力形式 (json, html, csv) デフォルト: json
  --output <path>         出力ファイルパス
  --console               コンソールに出力
  --confidence <0-1>      最小確信度フィルタ (0.0-1.0) デフォルト: 0
  --help, -h              このヘルプを表示

例:
  # HTMLレポートを出力
  node classifyGames.js --format html --output report.html

  # JSONで出力
  node classifyGames.js --format json --output games.json

  # CSVで出力
  node classifyGames.js --format csv --output games.csv

  # 高い確信度（0.8以上）のゲームのみ表示
  node classifyGames.js --confidence 0.8 --console

  # コンソールに表示
  node classifyGames.js --console
  `);
}

async function main() {
  const options = parseArgs();

  try {
    console.log('🔍 ゲームリクエストを分析中...');

    const result = await classifyGameRequests({
      outputFormat: options.format,
      outputPath: options.output,
      minConfidence: options.confidence
    });

    if (!result.success) {
      console.error('❌ エラーが発生しました:', result.error);
      process.exit(1);
    }

    // 結果を表示
    console.log('\n✅ 分類が完了しました！');
    console.log(`📊 合計: ${result.total}個のゲーム`);
    console.log(`   - 2Dゲーム: ${result.count2d}個`);
    console.log(`   - 3Dゲーム: ${result.count3d}個`);

    if (options.output) {
      console.log(`💾 ファイルに保存されました: ${options.output}`);
    }

    // コンソール出力が要求されている場合
    if (options.console) {
      if (typeof result.data === 'string') {
        console.log('\n📄 出力内容:\n');
        console.log(result.data);
      } else {
        console.log('\n📄 JSON出力:\n');
        console.log(JSON.stringify(result.data, null, 2));
      }
    }

    // JSON形式の場合は詳細情報を表示
    if (options.format === 'json' && !options.console && Array.isArray(result.data)) {
      console.log('\n📋 最初の5個のゲーム:');
      for (let i = 0; i < Math.min(5, result.data.length); i++) {
        const game = result.data[i];
        const typeLabel = game.gameType === 'game-3d' ? '3D' : '2D';
        console.log(
          `  ${i + 1}. [${typeLabel}] ${game.projectName} (確信度: ${(game.confidence * 100).toFixed(0)}%)`
        );
      }
      if (result.data.length > 5) {
        console.log(`  ... 他 ${result.data.length - 5} 件`);
      }
    }

  } catch (error) {
    console.error('❌ 予期しないエラーが発生しました:', error.message);
    process.exit(1);
  }
}

main();
