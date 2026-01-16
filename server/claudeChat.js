/**
 * Claude Chat Client for handling chat mode with Claude Haiku
 * Uses Claude CLI (same as skill detection)
 */
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class ClaudeChat {
  constructor() {
    this.available = this.checkAvailability();
  }

  checkAvailability() {
    try {
      execSync('which claude', { encoding: 'utf-8' });
      console.log('Claude Chat client initialized (using Claude CLI)');
      return true;
    } catch {
      console.warn('Claude CLI not found, Claude Chat will not be available');
      return false;
    }
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
   * Get git history for a project
   * @param {string} projectDir - Project directory path
   * @returns {string} - Git log summary
   */
  getGitHistory(projectDir) {
    try {
      const gitDir = path.join(projectDir, '.git');
      if (!fs.existsSync(gitDir)) {
        return '';
      }

      // Get recent commits (last 10)
      const log = execSync(
        `git log --oneline -10 --format="%h %s" 2>/dev/null || echo ""`,
        { cwd: projectDir, encoding: 'utf-8', timeout: 5000 }
      ).trim();

      return log || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Get recent git diff for a project
   * @param {string} projectDir - Project directory path
   * @returns {string} - Recent changes summary
   */
  getRecentChanges(projectDir) {
    try {
      const gitDir = path.join(projectDir, '.git');
      if (!fs.existsSync(gitDir)) {
        return '';
      }

      // Get diff of last commit
      const diff = execSync(
        `git diff HEAD~1 HEAD --stat 2>/dev/null | head -20 || echo ""`,
        { cwd: projectDir, encoding: 'utf-8', timeout: 5000 }
      ).trim();

      return diff || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Handle chat request with Claude Haiku via CLI
   * @param {Object} options
   * @param {string} options.userMessage - User's question
   * @param {string} options.projectDir - Project directory
   * @param {string} options.gameSpec - SPEC.md content (optional)
   * @param {string} options.currentCode - Current game code (optional, for context)
   * @param {Array} options.conversationHistory - Previous messages
   * @returns {Promise<Object>} - { message, suggestions }
   */
  async handleChat(options) {
    const {
      userMessage,
      projectDir,
      gameSpec = null,
      // currentCode and conversationHistory not used - Haiku reads files itself
    } = options;

    if (!this.isAvailable()) {
      throw new Error('Claude Chat not available');
    }

    // Build prompt - give Haiku context and let it explore as needed
    let prompt = `あなたはゲーム開発のアシスタントです。ユーザーが作成中のブラウザゲームについての質問に答えてください。

## 現在のディレクトリ
このプロジェクトのディレクトリで実行されています。必要に応じてファイルを読んでください：
- index.html: メインのゲームコード
- SPEC.md: ゲーム仕様書
- STYLE.md: ビジュアルスタイル
- .git: 変更履歴（git logで確認可能）

## あなたの役割
- ユーザーの質問に的確に答える
- 必要な情報は自分でファイルを読んで確認する
- 改善案やアイデアを提案する

## 回答のルール
- 簡潔で分かりやすい日本語で回答
- 技術的な内容は噛み砕いて説明
- 改善案やアイデアは**3つまで**に厳選（多すぎると選べない）

## suggestionsのルール
- 本文で提案した内容と対応させる（本文3つ→サジェスト3つ）
- 「〜して」という依頼形式で書く

`;

    // Include full SPEC.md - it's small and always needed for game questions
    if (gameSpec) {
      prompt += `## ゲーム仕様書（SPEC.md）
${gameSpec}

`;
    }

    prompt += `## ユーザーの質問
${userMessage}

## 出力形式（必ず守ること）
JSON形式で出力。suggestionsは本文と関連した次のアクションを「〜して」形式で2-3個：
{"message": "回答本文", "suggestions": ["関連するアクション1", "関連するアクション2"]}`;

    return new Promise((resolve, reject) => {
      console.log('Calling Claude Haiku for chat via CLI in:', projectDir);
      const startTime = Date.now();

      // Use haiku model with verbose JSON output to capture token usage
      // Run in project directory so Haiku can access files directly
      const claude = spawn('claude', [
        '--print',
        '--model', 'haiku',
        '--verbose',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectDir,  // Run in project directory!
        env: { ...process.env }
      });

      // Write prompt to stdin
      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      let errorOutput = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claude.on('close', (code) => {
        const elapsed = Date.now() - startTime;

        // Parse JSON lines to extract result and usage
        let resultText = '';
        let usage = null;
        let costUSD = null;

        try {
          const lines = output.split('\n').filter(l => l.trim());
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.type === 'result') {
                resultText = json.result || '';
                usage = json.usage;
                costUSD = json.total_cost_usd;
              }
            } catch (e) {
              // Skip non-JSON lines
            }
          }

          // Log token usage
          if (usage) {
            console.log(`Claude Haiku responded in ${elapsed}ms`);
            console.log(`  Input tokens: ${usage.input_tokens || 0}`);
            console.log(`  Cache read: ${usage.cache_read_input_tokens || 0}`);
            console.log(`  Cache creation: ${usage.cache_creation_input_tokens || 0}`);
            console.log(`  Output tokens: ${usage.output_tokens || 0}`);
            console.log(`  Cost: $${costUSD?.toFixed(6) || 'unknown'}`);
          } else {
            console.log(`Claude Haiku responded in ${elapsed}ms (no usage info)`);
          }

          // Try to extract JSON from result
          const jsonMatch = resultText.match(/\{[\s\S]*"message"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('  Parsed suggestions:', JSON.stringify(parsed.suggestions));

            // Clean up suggestions - remove line breaks within each suggestion
            let cleanSuggestions = [];
            if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
              cleanSuggestions = parsed.suggestions.map(s =>
                typeof s === 'string' ? s.replace(/\n/g, ' ').trim() : s
              ).filter(s => s && s.length > 0);
            }

            resolve({
              message: parsed.message || resultText,
              suggestions: cleanSuggestions
            });
            return;
          }

          // If no JSON found, return raw result text
          if (resultText.trim()) {
            resolve({
              message: resultText.trim(),
              suggestions: []
            });
            return;
          }

          reject(new Error('Empty response from Claude'));
        } catch (e) {
          console.error('Failed to parse Claude response:', e.message);
          // Return raw result text if parsing fails
          if (resultText.trim()) {
            resolve({
              message: resultText.trim(),
              suggestions: []
            });
          } else {
            reject(new Error('Failed to parse response'));
          }
        }
      });

      claude.on('error', (err) => {
        console.error('Claude CLI error:', err.message);
        reject(err);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        claude.kill();
        reject(new Error('Claude chat timeout after 30s'));
      }, 30000);
    });
  }
}

module.exports = new ClaudeChat();
