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

[最重要：ユーザー意図の判断]
まずユーザーのメッセージを分析し、適切なモードを選択してください：

■ chat モード（質問・確認・相談）
- 「〜ですか？」「〜って何？」「どうなってる？」「確認したい」など
- 現状の説明、仕様の確認、アドバイスを求めている
- → コードは変更せず、会話で応答 + 改善アイデアを提案

■ edit モード（修正依頼）
- 「〜して」「〜に変えて」「〜を追加」「〜を直して」など
- 明確にコード変更を求めている
- → コードを修正

■ restore モード（元に戻す）
- 「元に戻して」「もとに戻して」「戻して」「取り消して」「前の状態に」「さっきのに戻して」「undo」「やっぱり戻して」「やめて戻して」など
- ひらがな・漢字どちらでも認識する
- 語尾に「よ」「ね」「ください」「ちょうだい」など何がついても認識する
- 直前の変更を取り消したい、以前の状態に戻したい
- → リストア確認を返す

[出力形式]

● chatモードの場合：
{
  "mode": "chat",
  "message": "質問への回答や現状の説明",
  "suggestions": ["改善アイデア1", "改善アイデア2"]
}

● editモードの場合：
{
  "mode": "edit",
  "edits": [
    {
      "path": "index.html",
      "old_string": "置換前の文字列（既存コードから正確にコピー）",
      "new_string": "置換後の文字列"
    }
  ],
  "images": [
    {
      "name": "player.png",
      "prompt": "cute cat character, game sprite, front view",
      "style": "kawaii"
    }
  ],
  "summary": "変更内容の日本語説明（1-2文）"
}

[画像生成について - 2Dゲームのみ]
**重要: 3Dゲーム（Three.js、WebGL使用中）では画像生成は行わないこと。**

2Dゲームでのみ、キャラクター等の画像が必要な場合にimagesフィールドで指定:
- 最大3枚まで
- 画像は透過背景（PNG）で生成されます
- コード内では "assets/[name]" で参照できます
- style: pixel, anime, kawaii, realistic, watercolor, flat から選択

**★向きの指定（SPEC.mdを参照）：**
- 現在のゲーム仕様の「スプライトの向き」セクションに従う
- promptに "facing right" や "facing left" を必ず明記
- 例：横スクロール → プレイヤー: "facing right, side view"、敵: "facing left, side view"
- 例：縦スクロール → プレイヤー: "facing up"、敵: "facing down"

画像生成が必要な例（2Dのみ）：
- 「猫のキャラクターで」→ player.png を生成
- 「敵を追加して」→ enemy.png を生成

画像が不要な場合（imagesフィールドを省略）：
- 現在のコードがThree.jsや3Dを使用している場合
- 幾何学的な図形のみの場合

● restoreモードの場合：
{
  "mode": "restore",
  "message": "直前の変更を取り消して、前の状態に戻しますか？",
  "confirmLabel": "戻す",
  "cancelLabel": "キャンセル"
}

[最重要：既存仕様の維持]
- 依頼された内容のみ変更する
- 依頼されていない部分は絶対に変更しない
- 色、デザイン、操作方法、ゲームルールなど既存の仕様を勝手に変えない
- 「ついでに改善」「より良くするために」などの勝手な変更は禁止

[重要な注意]
- 迷ったらchatモードを選択（勝手にコードを変更しない）
- old_string は既存コードに存在する文字列を正確にコピーすること
- 変更箇所が複数ある場合は edits 配列に複数追加
- 新規追加の場合は old_string に挿入位置の前後の文字列を指定`;
}

/**
 * Build the full request for Gemini API
 * @param {Object} options
 * @param {string} options.userMessage - User's instruction
 * @param {string} options.currentCode - Current game code
 * @param {Array} options.conversationHistory - Previous messages [{role, content}]
 * @param {Array} options.attachments - Attached assets (optional)
 * @param {string} options.skillSummary - Skill summary from Claude CLI (optional)
 * @param {string} options.gameSpec - Game specification from SPEC.md (optional)
 */
function buildRequest(options) {
  const {
    userMessage,
    currentCode,
    conversationHistory = [],
    attachments = [],
    skillSummary = null,
    gameSpec = null
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
  let currentMessage = '';

  // Add game spec if available (CRITICAL - must preserve these specs)
  if (gameSpec) {
    currentMessage += `[現在のゲーム仕様 - これを維持すること]\n${gameSpec}\n\n`;
  }

  currentMessage += `[現在のコード]
${currentCode}

[修正依頼]
${userMessage}`;

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
