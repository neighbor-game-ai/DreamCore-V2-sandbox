/**
 * Prompt for generating modification plans
 * Gemini generates a plan, Claude CLI executes it
 */

/**
 * Build system prompt for plan generation
 */
function getSystemPrompt() {
  return `あなたはコード修正の計画を立てる専門家です。

[タスク]
ユーザーの修正依頼を分析し、具体的な修正計画を日本語で作成してください。

[出力形式]
以下の形式で修正計画を出力してください：

## 修正概要
（1-2文で修正内容を要約）

## 修正箇所
1. **ファイル名**: 修正内容の説明
   - 変更前: （該当コードの説明）
   - 変更後: （どう変更するか）

2. **ファイル名**: 修正内容の説明
   - 変更前: （該当コードの説明）
   - 変更後: （どう変更するか）

## 注意事項
（修正時の注意点があれば記載）

[重要]
- コードそのものは書かないでください
- 修正内容を自然言語で具体的に説明してください
- ファイルパス、関数名、変数名は正確に記載してください
- 修正の順序が重要な場合は順番を明記してください`;
}

/**
 * Build the request for Gemini API (plan generation)
 * @param {Object} options
 * @param {string} options.userMessage - User's modification request
 * @param {string} options.currentCode - Current game code
 * @param {Array} options.conversationHistory - Previous messages
 */
function buildRequest(options) {
  const {
    userMessage,
    currentCode,
    conversationHistory = []
  } = options;

  // Build conversation contents
  const contents = [];

  // Add conversation history (limited to last 3 for context)
  const recentHistory = conversationHistory.slice(-3);
  for (const msg of recentHistory) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  }

  // Build current user message with code context
  const currentMessage = `[現在のコード]
${currentCode}

[修正依頼]
${userMessage}

上記の修正依頼に対する修正計画を作成してください。`;

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
      temperature: 0.3,  // Lower temperature for more focused plans
      maxOutputTokens: 2048  // Plans should be concise
    }
  };
}

module.exports = {
  getSystemPrompt,
  buildRequest
};
