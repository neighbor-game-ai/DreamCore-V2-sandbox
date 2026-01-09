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
  "images": [
    {
      "name": "player.png",
      "prompt": "cute cat character, game sprite, front view",
      "style": "kawaii"
    }
  ],
  "summary": "作成内容の日本語説明（1-2文）"
}

[画像生成について]
ゲームにキャラクター、敵、背景、アイテムなどの画像が必要な場合、imagesフィールドで指定してください。
- 最大3枚まで
- 画像は透過背景（PNG）で生成されます
- コード内では "assets/[name]" で参照できます
- style: pixel, anime, kawaii, realistic, watercolor, flat から選択

画像生成が必要な例：
- 「猫のシューティングゲーム」→ player.png, enemy.png を生成
- 「アイテム収集ゲーム」→ player.png, item.png を生成

画像が不要な場合（幾何学的な図形のみ等）はimagesフィールドを省略してください。`;
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
 */
function buildRequest(options) {
  const {
    userMessage,
    conversationHistory = [],
    title = '',
    gameType = '',
    attachments = [],
    skillSummary = null
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

  // Add skill summary (CRITICAL - must follow these guidelines)
  if (skillSummary) {
    currentMessage += `\n\n[必須ガイドライン - 以下を必ず適用すること]\n${skillSummary}`;
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
