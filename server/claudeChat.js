/**
 * Claude Chat Client for handling chat mode with Claude Haiku
 * Uses Modal Haiku endpoint (via modalClient)
 */
const config = require('./config');
const { getModalClient } = require('./modalClient');

class ClaudeChat {
  constructor() {
    this.available = this.checkAvailability();
  }

  checkAvailability() {
    // Available if Modal is configured
    if (config.USE_MODAL && config.MODAL_ENDPOINT) {
      console.log('Claude Chat client initialized (using Modal Haiku)');
      return true;
    }
    console.warn('Modal not configured, Claude Chat will not be available');
    return false;
  }

  isAvailable() {
    return this.available;
  }

  /**
   * Detect if a message is a chat request (question/consultation)
   * @param {string} message - User's message
   * @returns {boolean} - True if it's a chat request
   */
  isChatRequest(message) {
    const chatPatterns = [
      /ですか[？?]?$/,        // 〜ですか？
      /って何[？?]?$/,        // 〜って何？
      /とは[？?]?$/,          // 〜とは？
      /どう(なって|して)/,    // どうなってる？どうして？
      /確認(したい|して)/,    // 確認したい
      /教えて/,               // 教えて
      /説明して/,             // 説明して
      /わからない/,           // わからない
      /なぜ/,                 // なぜ
      /どこ/,                 // どこ
      /いつ/,                 // いつ
      /何が/,                 // 何が
      /どんな/,               // どんな
      /^(どう|なに|何を|どれ)/, // 疑問詞で始まる
      /[？?]$/,               // 疑問符で終わる
    ];

    const editPatterns = [
      /して(ください)?$/,     // 〜してください
      /に(変えて|して)/,      // 〜に変えて
      /を(追加|削除|修正)/,   // 〜を追加
      /作って/,               // 作って
      /直して/,               // 直して
      /つけて/,               // つけて
      /入れて/,               // 入れて
      /消して/,               // 消して
      /増やして/,             // 増やして
      /減らして/,             // 減らして
      /変更して/,             // 変更して
      /実装して/,             // 実装して
    ];

    // Check edit patterns first (higher priority for action requests)
    for (const pattern of editPatterns) {
      if (pattern.test(message)) {
        return false;
      }
    }

    // Check chat patterns
    for (const pattern of chatPatterns) {
      if (pattern.test(message)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handle chat request with Claude Haiku via Modal
   * @param {Object} options
   * @param {string} options.userMessage - User's question
   * @param {string} options.projectDir - Project directory (not used for Modal)
   * @param {string} options.gameSpec - SPEC.md content (optional)
   * @param {string} options.currentCode - Current game code (optional, for context)
   * @param {Array} options.conversationHistory - Previous messages
   * @returns {Promise<Object>} - { message, suggestions }
   */
  async handleChat(options) {
    const {
      userMessage,
      gameSpec = null,
      conversationHistory = []
    } = options;

    if (!this.isAvailable()) {
      throw new Error('Claude Chat not available');
    }

    console.log('[claudeChat] Calling Modal chat_haiku...');
    const startTime = Date.now();

    try {
      const client = getModalClient();
      const result = await client.chatHaiku({
        message: userMessage,
        game_spec: gameSpec || '',
        conversation_history: conversationHistory,
      });

      const elapsed = Date.now() - startTime;
      console.log(`[claudeChat] Modal Haiku responded in ${elapsed}ms`);
      console.log(`[claudeChat] Suggestions: ${JSON.stringify(result.suggestions)}`);

      return {
        message: result.message || '',
        suggestions: result.suggestions || [],
      };
    } catch (error) {
      console.error('[claudeChat] Modal error:', error.message);
      throw error;
    }
  }
}

module.exports = new ClaudeChat();
