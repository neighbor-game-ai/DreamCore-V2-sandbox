/**
 * Prompt for creating new games
 */
const { getBaseRules } = require('./baseRules');
const { analyzeGameType, applyExplicitOverride } = require('../analyzer/gameTypeAnalyzer');
const { generateSkillGuidelines } = require('../analyzer/skillSelector');

/**
 * Build system prompt for new game creation
 */
function getSystemPrompt() {
  return `あなたはスマートフォン向けブラウザゲーム開発の専門家です。

${getBaseRules()}

[出力形式]
必ず以下のJSON形式で出力してください：
{
  "mode": "create",
  "files": [
    {"path": "index.html", "content": "完全なHTMLコード"}
  ],
  "images": [
    {
      "name": "player.png",
      "prompt": "ビジュアルスタイルに合わせた画像の説明"
    }
  ],
  "summary": "作成内容の日本語説明（1-2文）",
  "suggestions": ["次にできそうな改善案1", "次にできそうな改善案2"]
}

[ビジュアルスタイルについて - 最重要]
ユーザーのメッセージに「ビジュアルスタイル指定」が含まれている場合、そのスタイルをゲーム全体に適用してください：
- コードで描く全ての要素（背景色、キャラクター、エフェクト、UI）
- 画像生成のプロンプト
- 色使い、デザインテイスト、雰囲気を統一

[画像生成について - 2Dゲームのみ]
**重要: 3Dゲーム（Three.js、WebGL）では画像生成は行わないこと。3Dはジオメトリとマテリアルで表現する。**

2Dゲームでキャラクター、敵、アイテムなどの画像が必要な場合のみ、imagesフィールドで指定:
- 最大3枚まで
- 画像は透過背景（PNG）で生成されます
- コード内では "assets/[name]" で参照できます
- promptにはビジュアルスタイルを反映した説明を書く（色、テイスト、雰囲気を含める）

**★向きの指定（SPEC.mdを参照）：**
- SPEC.mdの「スプライトの向き」セクションに従って向きを指定
- promptに "facing right" や "facing left" を明記すること
- 例：横スクロール(右進行) → プレイヤー: "facing right, side view"、敵: "facing left, side view"
- 例：縦スクロール(上進行) → プレイヤー: "facing up, top-down view"、敵: "facing down"

画像生成が必要な例（2Dのみ）：
- 「猫のシューティングゲーム」→ player.png, enemy.png を生成
- 「アイテム収集ゲーム」→ player.png, item.png を生成

画像が不要な場合：
- 3Dゲーム全般 → imagesフィールドを省略
- 幾何学的な図形のみ → imagesフィールドを省略`;
}

/**
 * Build the full request for Gemini API
 * @param {Object} options
 * @param {string} options.userMessage - User's instruction
 * @param {Array} options.conversationHistory - Previous messages [{role, content}]
 * @param {string} options.title - Project title (optional)
 * @param {string} options.gameType - Game type hint (optional)
 * @param {Array} options.attachments - Attached assets (optional)
 * @param {string} options.skillSummary - Skill summary from Claude CLI (optional)
 * @param {string} options.gameSpec - Game specification from SPEC.md (optional)
 */
function buildRequest(options) {
  const {
    userMessage,
    conversationHistory = [],
    title = '',
    gameType = '',
    attachments = [],
    skillSummary = null,
    gameSpec = null
  } = options;

  // ゲームタイプを自動判定
  const analysis = analyzeGameType(userMessage);
  const detectedGameType = applyExplicitOverride(userMessage, analysis).gameType;
  const finalGameType = gameType || detectedGameType;

  // Build conversation contents
  const contents = [];

  // Add conversation history
  for (const msg of conversationHistory) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  }

  // Build current user message with additional info
  let currentMessage = userMessage;

  if (title) {
    currentMessage = `[プロジェクト名: ${title}]\n\n${currentMessage}`;
  }

  if (gameType) {
    currentMessage = `[ゲームタイプ: ${gameType}]\n\n${currentMessage}`;
  }

  // Add auto-detected game type hint
  currentMessage += `\n\n[自動判定: ${finalGameType === 'game-3d' ? '3D' : '2D'}ゲーム (確信度: ${(analysis.confidence * 100).toFixed(0)}%)]`;
  if (analysis.details.matched3d.length > 0 || analysis.details.matched2d.length > 0) {
    currentMessage += `\n検出: ${[...analysis.details.matched3d, ...analysis.details.matched2d].join(', ')}`;
  }

  // Add game spec (CRITICAL - contains sprite directions for image generation)
  if (gameSpec) {
    currentMessage += `\n\n[ゲーム仕様書 - 画像の向きはこれに従うこと]\n${gameSpec}`;
  }

  // Add skill summary (CRITICAL - must follow these guidelines)
  if (skillSummary) {
    currentMessage += `\n\n[必須ガイドライン - 以下を必ず適用すること]\n${skillSummary}`;
  } else {
    // Generate skill guidelines based on game type
    const skillGuidelines = generateSkillGuidelines(finalGameType);
    currentMessage += `\n\n[必須ガイドライン]\n${skillGuidelines}`;
  }

  if (attachments.length > 0) {
    const assetList = attachments.map(a => `- ${a.name}: ${a.url}`).join('\n');
    currentMessage += `\n\n[使用可能なアセット]\n${assetList}`;
  }

  contents.push({
    role: 'user',
    parts: [{ text: currentMessage }]
  });

  return {
    systemInstruction: {
      parts: [{ text: getSystemPrompt() }]
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 32768,
      responseMimeType: "application/json"
    }
  };
}

/**
 * ユーザーメッセージからゲームタイプを分析
 * @param {string} userMessage - User's instruction
 * @returns {Object} { gameType, confidence, analysis }
 */
function analyzeAndReturnGameType(userMessage) {
  const analysis = analyzeGameType(userMessage);
  const result = applyExplicitOverride(userMessage, analysis);
  return {
    gameType: result.gameType,
    confidence: result.confidence,
    analysis: analysis
  };
}

module.exports = {
  getSystemPrompt,
  buildRequest,
  analyzeAndReturnGameType
};
