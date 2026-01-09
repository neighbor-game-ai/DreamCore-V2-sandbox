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
      skillSummary = null,  // Skill summary from Claude CLI
      gameSpec = null,  // Game specification from SPEC.md
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
        attachments,
        skillSummary  // Pass to prompt builder
      });
    } else {
      requestBody = updatePrompt.buildRequest({
        userMessage,
        currentCode,
        conversationHistory,
        attachments,
        skillSummary,  // Pass to prompt builder
        gameSpec  // Pass game spec to preserve existing specs
      });
    }

    // Log what we're sending to Gemini
    console.log('\n========== Gemini Request ==========');
    console.log('Mode:', isFirstMessage ? 'CREATE' : 'UPDATE');
    console.log('User Message:', userMessage);
    console.log('Streaming:', onStream ? 'YES' : 'NO');
    console.log('System Prompt Length:', requestBody.systemInstruction.parts[0].text.length, 'chars');

    // Log skill summary content (CRITICAL - verify it's being passed)
    if (skillSummary) {
      console.log('--- Skill Summary (PASSED TO GEMINI) ---');
      console.log(skillSummary);
      console.log('--- End Skill Summary ---');
    } else {
      console.log('Skill Summary: NONE');
    }

    // Check if skill summary is in user content
    const lastContent = requestBody.contents[requestBody.contents.length - 1];
    const userContent = lastContent.parts[0].text;
    const hasSkillSection = userContent.includes('[必須ガイドライン');
    console.log('Skill in User Content:', hasSkillSection ? 'YES' : 'NO');
    console.log('User Content Length:', userContent.length, 'chars');
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

  /**
   * Generate image using Gemini Native Image Generation (Nano Banana)
   * Uses gemini-2.5-flash-image model with generateContent endpoint
   * @param {Object} options
   * @param {string} options.prompt - Image description
   * @param {string} options.style - Optional style hint (pixel, anime, kawaii, etc.)
   * @param {string} options.size - Image size (default: 512x512)
   */
  async generateImage(options) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API key not configured');
    }

    const {
      prompt,
      style = '',
      size = '512x512',
      transparent = true  // Default to transparent background for game assets
    } = options;

    // Build enhanced prompt with style
    let enhancedPrompt = prompt;
    if (style) {
      const styleHints = {
        pixel: 'ピクセルアート風、8ビットスタイル、ドット絵',
        anime: 'アニメ風、日本のアニメスタイル',
        kawaii: 'かわいい、キュート、丸みのあるデザイン',
        realistic: '写実的、リアル、高品質',
        watercolor: '水彩画風、柔らかいタッチ',
        flat: 'フラットデザイン、シンプル、ミニマル'
      };
      if (styleHints[style]) {
        enhancedPrompt = `${prompt}, ${styleHints[style]}`;
      }
    }

    // Add transparent background instruction for game assets
    if (transparent) {
      enhancedPrompt = `${enhancedPrompt}, transparent background, PNG format with alpha channel, isolated game asset, no background, clean edges`;
    }

    // Parse size to determine aspect ratio
    const [width, height] = size.split('x').map(Number);
    let aspectRatio = '1:1';
    if (width > height) {
      aspectRatio = width / height >= 1.7 ? '16:9' : '4:3';
    } else if (height > width) {
      aspectRatio = height / width >= 1.7 ? '9:16' : '3:4';
    }

    // Use Gemini 2.5 Flash Image model (Nano Banana)
    const IMAGE_MODEL = 'gemini-2.5-flash-image';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: `Generate an image: ${enhancedPrompt}` }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['Text', 'Image'],
        responseMimeType: 'text/plain'
      }
    };

    console.log('\n========== Image Generation Request ==========');
    console.log('Model:', IMAGE_MODEL);
    console.log('Prompt:', enhancedPrompt);
    console.log('Aspect Ratio:', aspectRatio);
    console.log('===============================================\n');

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
        let data = '';

        res.on('data', (chunk) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);

            if (response.error) {
              console.error('Gemini Image API error:', response.error);
              reject(new Error(`Image generation failed: ${response.error.message}`));
              return;
            }

            // Extract image from response
            const candidates = response.candidates;
            if (candidates && candidates.length > 0) {
              const parts = candidates[0].content?.parts || [];

              // Find the image part in the response
              for (const part of parts) {
                if (part.inlineData) {
                  const imageData = part.inlineData.data;
                  const mimeType = part.inlineData.mimeType || 'image/png';

                  console.log('Image generated successfully');
                  resolve({
                    success: true,
                    image: `data:${mimeType};base64,${imageData}`,
                    prompt: enhancedPrompt
                  });
                  return;
                }
              }

              // No image found, check for text response
              const textPart = parts.find(p => p.text);
              if (textPart) {
                reject(new Error(`Model returned text instead of image: ${textPart.text.substring(0, 100)}`));
              } else {
                reject(new Error('No image in response'));
              }
            } else {
              console.error('Unexpected response structure:', JSON.stringify(response).substring(0, 500));
              reject(new Error('No candidates in response'));
            }
          } catch (e) {
            console.error('Failed to parse Gemini response:', e.message);
            console.error('Raw response:', data.substring(0, 500));
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });

        res.on('error', (e) => {
          reject(new Error(`Image generation error: ${e.message}`));
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Image generation request failed: ${e.message}`));
      });

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }
}

module.exports = new GeminiClient();
