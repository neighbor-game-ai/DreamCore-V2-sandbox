/**
 * Prompt for updating existing games
 */
const { getBaseRules } = require('./baseRules');

/**
 * Build system prompt for game updates
 */
function getSystemPrompt() {
  return `あなたはスマートフォン向けブラウザゲーム開発の専門家です。

${getBaseRules()}

[タスク]
既存のゲームコードを修正してください。変更部分のみを差分形式で出力します。

[出力形式]
差分のみを出力してください。editsは変更箇所だけを含めます：
{
  "mode": "edit",
  "edits": [
    {
      "path": "index.html",
      "old_string": "置換前の文字列（既存コードから正確にコピー）",
      "new_string": "置換後の文字列"
    }
  ],
  "summary": "変更内容の日本語説明（1-2文）"
}

[重要な注意]
- old_string は既存コードに存在する文字列を正確にコピーすること
- 変更箇所が複数ある場合は edits 配列に複数追加
- 新規追加の場合は old_string に挿入位置の前後の文字列を指定
- 不要な変更は行わない（依頼された内容のみ修正）`;
}

/**
 * Build the full request for Gemini API
 * @param {Object} options
 * @param {string} options.userMessage - User's instruction
 * @param {string} options.currentCode - Current game code
 * @param {Array} options.conversationHistory - Previous messages [{role, content}]
 * @param {Array} options.attachments - Attached assets (optional)
 */
function buildRequest(options) {
  const {
    userMessage,
    currentCode,
    conversationHistory = [],
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

  // Build current user message with code context
  let currentMessage = `[現在のコード]
${currentCode}

[修正依頼]
${userMessage}`;

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
