/**
 * ゲームリクエスト分類ツール
 * データベースからゲームリクエストを取得し、2D/3Dに分類してレポートを生成
 */

const Database = require('better-sqlite3');
const path = require('path');
const { analyzeGameType } = require('../analyzer/gameTypeAnalyzer');

const DB_PATH = path.join(__dirname, '../../data/gamecreator.db');

/**
 * ゲームリクエストを2D/3Dに分類
 * @param {Object} options - オプション設定
 * @returns {Promise<Object>} 分類結果
 */
async function classifyGameRequests(options = {}) {
  const {
    outputFormat = 'json', // 'json' | 'html' | 'csv'
    outputPath = null,
    minConfidence = 0
  } = options;

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // チャット履歴からゲームリクエストを取得
    const chatHistories = db.prepare(`
      SELECT
        ch.id,
        ch.project_id,
        p.name,
        p.created_at as project_created_at,
        p.updated_at as project_updated_at,
        ch.role,
        ch.message,
        ch.created_at as message_created_at
      FROM chat_history ch
      JOIN projects p ON ch.project_id = p.id
      ORDER BY p.created_at DESC, ch.created_at ASC
    `).all();

    db.close();

    // プロジェクトごとにゲームリクエストを分析
    const classifiedGames = analyzeAndClassifyGames(chatHistories, minConfidence);

    // 出力形式に応じてフォーマット
    let output;
    if (outputFormat === 'html') {
      output = generateHTMLReport(classifiedGames);
    } else if (outputFormat === 'csv') {
      output = generateCSVReport(classifiedGames);
    } else {
      output = classifiedGames;
    }

    // ファイルに出力する場合
    if (outputPath) {
      const fs = require('fs');
      if (outputFormat === 'json') {
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
      } else {
        fs.writeFileSync(outputPath, output, 'utf-8');
      }
      console.log(`✓ 分類結果を保存しました: ${outputPath}`);
    }

    return {
      success: true,
      format: outputFormat,
      total: classifiedGames.length,
      count2d: classifiedGames.filter(g => g.gameType === 'game-2d').length,
      count3d: classifiedGames.filter(g => g.gameType === 'game-3d').length,
      data: output
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * チャット履歴からゲームリクエストを分析・分類
 */
function analyzeAndClassifyGames(chatHistories, minConfidence = 0) {
  const gamesByProject = {};

  // プロジェクトごとにチャット履歴をグループ化
  for (const chat of chatHistories) {
    if (!gamesByProject[chat.project_id]) {
      gamesByProject[chat.project_id] = {
        projectId: chat.project_id,
        name: chat.name,
        createdAt: chat.project_created_at,
        updatedAt: chat.project_updated_at,
        messages: []
      };
    }
    gamesByProject[chat.project_id].messages.push(chat);
  }

  // 各プロジェクトを分析
  const classified = [];
  for (const [projectId, project] of Object.entries(gamesByProject)) {
    // ユーザーのメッセージのみを抽出
    const userMessages = project.messages
      .filter(m => m.role === 'user')
      .map(m => m.message);

    if (userMessages.length === 0) continue;

    // 最初のユーザーメッセージ（初期リクエスト）を主要な分析対象とする
    const mainRequest = userMessages[0];

    // すべてのユーザーメッセージを結合して分析
    const combinedMessage = userMessages.join('\n');

    // 分析実行
    const analysis = analyzeGameType(combinedMessage);

    // 確信度フィルタ
    if (analysis.confidence < minConfidence) continue;

    classified.push({
      projectId,
      projectName: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      gameType: analysis.gameType,
      confidence: analysis.confidence,
      reason: analysis.reason,
      mainRequest: mainRequest.substring(0, 200), // 最初の200文字
      analysis: {
        score2d: analysis.details.score2d,
        score3d: analysis.details.score3d,
        matched2d: analysis.details.matched2d,
        matched3d: analysis.details.matched3d
      },
      messageCount: userMessages.length,
      allMessages: userMessages
    });
  }

  // ゲームタイプでソート（3D優先）
  return classified.sort((a, b) => {
    const typeOrder = { 'game-3d': 0, 'game-2d': 1 };
    const typeCompare = typeOrder[a.gameType] - typeOrder[b.gameType];
    if (typeCompare !== 0) return typeCompare;
    return b.confidence - a.confidence;
  });
}

/**
 * HTMLレポートを生成
 */
function generateHTMLReport(classifiedGames) {
  const count2d = classifiedGames.filter(g => g.gameType === 'game-2d').length;
  const count3d = classifiedGames.filter(g => g.gameType === 'game-3d').length;
  const total = classifiedGames.length;

  let html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ゲームリクエスト分類レポート</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
      padding: 40px 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    .header p {
      font-size: 1.1em;
      opacity: 0.9;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 40px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }
    .stat-card {
      background: white;
      padding: 30px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .stat-card .number {
      font-size: 3em;
      font-weight: bold;
      margin: 10px 0;
    }
    .stat-card.type-2d .number {
      color: #667eea;
    }
    .stat-card.type-3d .number {
      color: #764ba2;
    }
    .stat-card.type-total .number {
      color: #333;
    }
    .games-section {
      padding: 40px;
    }
    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
      gap: 30px;
      margin-top: 30px;
    }
    .game-card {
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      transition: all 0.3s ease;
    }
    .game-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      border-color: #667eea;
    }
    .game-card.type-2d {
      border-left: 6px solid #667eea;
    }
    .game-card.type-3d {
      border-left: 6px solid #764ba2;
    }
    .game-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: bold;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .game-badge.type-2d {
      background: #e0e8ff;
      color: #667eea;
    }
    .game-badge.type-3d {
      background: #f3e5ff;
      color: #764ba2;
    }
    .game-name {
      font-size: 1.3em;
      font-weight: bold;
      margin: 10px 0;
      color: #333;
    }
    .game-meta {
      font-size: 0.9em;
      color: #666;
      margin-top: 8px;
    }
    .confidence-bar {
      width: 100%;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      margin-top: 12px;
      overflow: hidden;
    }
    .confidence-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      transition: width 0.3s ease;
    }
    .game-request {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
      margin-top: 12px;
      font-size: 0.9em;
      color: #555;
      border-left: 3px solid #667eea;
    }
    .details {
      margin-top: 15px;
      font-size: 0.85em;
      color: #666;
    }
    .keyword-list {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .keyword {
      background: #f0f0f0;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 0.85em;
    }
    .keyword.matched-2d {
      background: #e0e8ff;
      color: #667eea;
    }
    .keyword.matched-3d {
      background: #f3e5ff;
      color: #764ba2;
    }
    .footer {
      padding: 20px 40px;
      text-align: center;
      color: #666;
      font-size: 0.9em;
      background: #f8f9fa;
      border-top: 1px solid #e0e0e0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎮 ゲームリクエスト分類レポート</h1>
      <p>2D/3D自動分類システム</p>
    </div>

    <div class="stats">
      <div class="stat-card type-2d">
        <div>2Dゲーム</div>
        <div class="number">${count2d}</div>
        <div>${((count2d / total) * 100).toFixed(1)}%</div>
      </div>
      <div class="stat-card type-3d">
        <div>3Dゲーム</div>
        <div class="number">${count3d}</div>
        <div>${((count3d / total) * 100).toFixed(1)}%</div>
      </div>
      <div class="stat-card type-total">
        <div>合計</div>
        <div class="number">${total}</div>
        <div>プロジェクト</div>
      </div>
    </div>

    <div class="games-section">
      <h2 style="font-size: 1.5em; margin-bottom: 20px;">📊 ゲーム一覧</h2>
      <div class="games-grid">
`;

  // ゲームカードを生成
  for (const game of classifiedGames) {
    const typeLabel = game.gameType === 'game-3d' ? '3D' : '2D';
    const typeClass = game.gameType === 'game-3d' ? 'type-3d' : 'type-2d';
    const confidencePercent = (game.confidence * 100).toFixed(0);

    html += `
        <div class="game-card ${typeClass}">
          <div class="game-badge ${typeClass}">${typeLabel}</div>
          <div class="game-name">${escapeHtml(game.projectName)}</div>
          <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${game.confidence * 100}%"></div>
          </div>
          <div class="game-meta">
            確信度: ${confidencePercent}%
            <br>作成日: ${formatDate(game.createdAt)}
          </div>
          <div class="game-request">
            <strong>初期リクエスト:</strong><br>
            ${escapeHtml(game.mainRequest)}...
          </div>
          <div class="details">
            <strong>キーワード分析:</strong>
            <div class="keyword-list">
`;

    // マッチしたキーワードを表示
    if (game.analysis.matched2d.length > 0) {
      for (const keyword of game.analysis.matched2d) {
        html += `<span class="keyword matched-2d">${escapeHtml(keyword)}</span>`;
      }
    }
    if (game.analysis.matched3d.length > 0) {
      for (const keyword of game.analysis.matched3d) {
        html += `<span class="keyword matched-3d">${escapeHtml(keyword)}</span>`;
      }
    }

    html += `
            </div>
            <div style="margin-top: 10px;">
              <strong>スコア:</strong> 2D: ${game.analysis.score2d} | 3D: ${game.analysis.score3d}
              <br>
              <strong>メッセージ数:</strong> ${game.messageCount}
            </div>
          </div>
        </div>
`;
  }

  html += `
      </div>
    </div>

    <div class="footer">
      <p>レポート生成日: ${new Date().toLocaleString('ja-JP')}</p>
      <p>GameCreator MVP - 自動分類システム</p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * CSVレポートを生成
 */
function generateCSVReport(classifiedGames) {
  const headers = [
    'プロジェクトID',
    'プロジェクト名',
    'ゲームタイプ',
    '確信度',
    '作成日',
    '更新日',
    '初期リクエスト',
    '2Dスコア',
    '3Dスコア',
    'マッチ2D',
    'マッチ3D',
    'メッセージ数'
  ];

  let csv = headers.join(',') + '\n';

  for (const game of classifiedGames) {
    const row = [
      game.projectId,
      `"${game.projectName.replace(/"/g, '""')}"`,
      game.gameType,
      game.confidence.toFixed(2),
      game.createdAt,
      game.updatedAt,
      `"${game.mainRequest.replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      game.analysis.score2d,
      game.analysis.score3d,
      `"${game.analysis.matched2d.join('; ')}"`,
      `"${game.analysis.matched3d.join('; ')}"`,
      game.messageCount
    ];
    csv += row.join(',') + '\n';
  }

  return csv;
}

/**
 * HTML特殊文字をエスケープ
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 日付をフォーマット
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP');
}

module.exports = {
  classifyGameRequests
};
