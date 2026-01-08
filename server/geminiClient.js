const https = require('https');
require('dotenv').config();

const createPrompt = require('./prompts/createPrompt');
const updatePrompt = require('./prompts/updatePrompt');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3-pro-preview';

class GeminiClient {
  constructor() {
    if (!GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not set - Gemini integration disabled');
    }
  }

  isAvailable() {
    return !!GEMINI_API_KEY;
  }

  /**
   * Generate game code with streaming
   * @param {Object} options
   * @param {string} options.userMessage - User's instruction
   * @param {string} options.currentCode - Current code (null for new games)
   * @param {Array} options.conversationHistory - Previous messages
   * @param {string} options.title - Project title
   * @param {string} options.gameType - Game type hint
   * @param {Array} options.attachments - Attached assets
   * @param {Function} options.onStream - Callback for streaming chunks
   */
  async generateCode(options) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API key not configured');
    }

    const {
      userMessage,
      currentCode,
      conversationHistory = [],
      title = '',
      gameType = '',
      attachments = [],
      onStream = null
    } = options;

    const isFirstMessage = !currentCode;

    // Build request using appropriate prompt builder
    let requestBody;
    if (isFirstMessage) {
      requestBody = createPrompt.buildRequest({
        userMessage,
        conversationHistory,
        title,
        gameType,
        attachments
      });
    } else {
      requestBody = updatePrompt.buildRequest({
        userMessage,
        currentCode,
        conversationHistory,
        attachments
      });
    }

    // Log what we're sending to Gemini
    console.log('\n========== Gemini Request ==========');
    console.log('Mode:', isFirstMessage ? 'CREATE' : 'UPDATE');
    console.log('User Message:', userMessage);
    console.log('Streaming:', onStream ? 'YES' : 'NO');
    console.log('System Prompt Length:', requestBody.systemInstruction.parts[0].text.length, 'chars');
    console.log('=====================================\n');

    // Use streaming endpoint
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);

      const reqOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(reqOptions, (res) => {
        let fullText = '';
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();

          // Process complete SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6);
              if (jsonStr.trim() === '[DONE]') continue;

              try {
                const data = JSON.parse(jsonStr);

                // Check for error
                if (data.error) {
                  reject(new Error(`Gemini API error: ${data.error.message}`));
                  return;
                }

                // Extract text from response
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  fullText += text;

                  // Call streaming callback
                  if (onStream) {
                    onStream({ type: 'text', content: text });
                  }
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        });

        res.on('end', () => {
          // Process any remaining buffer
          if (buffer.startsWith('data: ')) {
            const jsonStr = buffer.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                fullText += text;
              }
            } catch (e) {
              // Ignore
            }
          }

          // Parse the complete JSON response
          try {
            const result = JSON.parse(fullText);

            // Log Gemini output for debugging
            console.log('\n========== Gemini Response ==========');
            console.log('Mode:', result.mode);
            console.log('Summary:', result.summary);
            if (result.mode === 'create') {
              console.log('Files generated:', result.files?.length || 0);
            } else {
              console.log('Edits:', result.edits?.length || 0);
            }
            console.log('======================================\n');

            resolve(result);
          } catch (e) {
            console.error('Failed to parse Gemini response:', e.message);
            console.error('Raw response:', fullText.substring(0, 500));
            reject(new Error(`Failed to parse Gemini response: ${e.message}`));
          }
        });

        res.on('error', (e) => {
          reject(new Error(`Gemini response error: ${e.message}`));
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Gemini request failed: ${e.message}`));
      });

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }
}

module.exports = new GeminiClient();
