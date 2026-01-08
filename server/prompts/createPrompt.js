/**
 * Prompt for creating new games
 */
const { getBaseRules } = require('./baseRules');

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
  "summary": "作成内容の日本語説明（1-2文）"
}`;
}

/**
 * Build the full request for Gemini API
 * @param {Object} options
 * @param {string} options.userMessage - User's instruction
 * @param {Array} options.conversationHistory - Previous messages [{role, content}]
 * @param {string} options.title - Project title (optional)
 * @param {string} options.gameType - Game type hint (optional)
 * @param {Array} options.attachments - Attached assets (optional)
 */
function buildRequest(options) {
  const {
    userMessage,
    conversationHistory = [],
    title = '',
    gameType = '',
    attachments = []
  } = options;

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

module.exports = {
  getSystemPrompt,
  buildRequest
};
