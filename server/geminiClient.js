const https = require('https');
const sharp = require('sharp');
require('dotenv').config();

const createPrompt = require('./prompts/createPrompt');
const updatePrompt = require('./prompts/updatePrompt');

/**
 * Remove magenta background from image
 * Based on nanobanana skill: R>180, G<100, B>100 → transparent
 * Includes 1px erosion to remove edge artifacts
 * @param {string} base64Image - Base64 encoded image (with or without data URI prefix)
 * @returns {Promise<string>} - Base64 encoded PNG with transparent background
 */
async function removeMagentaBackground(base64Image) {
  try {
    // Extract base64 data
    const base64Data = base64Image.includes(',')
      ? base64Image.split(',')[1]
      : base64Image;

    const inputBuffer = Buffer.from(base64Data, 'base64');

    // Get image info and raw pixel data
    const image = sharp(inputBuffer);
    const { width, height } = await image.metadata();

    // Ensure we have RGBA
    const rawBuffer = await image
      .ensureAlpha()
      .raw()
      .toBuffer();

    // Process pixels - make magenta pixels transparent
    const pixels = new Uint8Array(rawBuffer);
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Check if pixel is magenta (R>180, G<100, B>100)
      if (r > 180 && g < 100 && b > 100) {
        pixels[i + 3] = 0; // Set alpha to 0 (transparent)
      }
    }

    // Create image with transparency
    let outputBuffer = await sharp(Buffer.from(pixels), {
      raw: { width, height, channels: 4 }
    })
      .png()
      .toBuffer();

    // Apply 1px erosion to remove edge artifacts
    // Re-read the image and erode edges where alpha transitions
    const erodedImage = sharp(outputBuffer);
    const erodedRaw = await erodedImage.ensureAlpha().raw().toBuffer();
    const erodedPixels = new Uint8Array(erodedRaw);

    // Simple erosion: if any neighbor is transparent, check if this edge pixel should be removed
    const originalAlpha = new Uint8Array(pixels.length / 4);
    for (let i = 0; i < pixels.length; i += 4) {
      originalAlpha[i / 4] = erodedPixels[i + 3];
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (erodedPixels[idx + 3] > 0) {
          // Check if this pixel is on an edge (has transparent neighbor)
          let hasTransparentNeighbor = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (originalAlpha[nIdx] === 0) {
                  hasTransparentNeighbor = true;
                  break;
                }
              }
            }
            if (hasTransparentNeighbor) break;
          }
          if (hasTransparentNeighbor) {
            erodedPixels[idx + 3] = 0; // Make edge pixel transparent
          }
        }
      }
    }

    // Create final image with trim to remove transparent borders
    outputBuffer = await sharp(Buffer.from(erodedPixels), {
      raw: { width, height, channels: 4 }
    })
      .trim()  // Auto-crop transparent borders
      .png()
      .toBuffer();

    console.log('Magenta background removed with 1px erosion and trimmed');
    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error) {
    console.error('Error removing background:', error);
    // Return original image if processing fails
    return base64Image.includes(',') ? base64Image : `data:image/png;base64,${base64Image}`;
  }
}

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
      visualStyle = null,  // Visual style from STYLE.md
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
        skillSummary,  // Pass to prompt builder
        gameSpec  // Pass game spec for sprite directions
      });
    } else {
      requestBody = updatePrompt.buildRequest({
        userMessage,
        currentCode,
        conversationHistory,
        attachments,
        skillSummary,  // Pass to prompt builder
        gameSpec,  // Pass game spec to preserve existing specs
        visualStyle  // Pass visual style to maintain design consistency
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
            // Sanitize control characters that may break JSON parsing
            // This handles cases where Gemini outputs unescaped control chars in strings
            const sanitizedText = fullText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            const result = JSON.parse(sanitizedText);

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
   * @param {string} options.prompt - Image description (should include style from visual guideline)
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

    // Apply style hints for manual image generation from editor
    let enhancedPrompt = prompt;
    if (style) {
      const styleHints = {
        pixel: 'pixel art style, 8-bit retro',
        anime: 'anime style, Japanese animation',
        kawaii: 'kawaii style, cute, rounded design',
        realistic: 'realistic style, high quality',
        watercolor: 'watercolor painting style, soft touch',
        flat: 'flat design, simple, minimal'
      };
      if (styleHints[style]) {
        enhancedPrompt = `${prompt}, ${styleHints[style]}`;
      }
    }

    // Add solid magenta background for transparent processing
    if (transparent) {
      enhancedPrompt = `${enhancedPrompt}, on a solid magenta (#FF00FF) background, isolated game sprite, centered, clean edges, no shadows`;
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
            // Sanitize control characters
            const sanitizedData = data.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            const response = JSON.parse(sanitizedData);

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

                  // Remove magenta background if transparent was requested
                  if (transparent) {
                    console.log('Removing magenta background...');
                    removeMagentaBackground(`data:${mimeType};base64,${imageData}`)
                      .then(processedImage => {
                        console.log('Background removed successfully');
                        resolve({
                          success: true,
                          image: processedImage,
                          prompt: enhancedPrompt
                        });
                      })
                      .catch(err => {
                        console.error('Magenta background removal failed:', err);
                        resolve({
                          success: true,
                          image: `data:${mimeType};base64,${imageData}`,
                          prompt: enhancedPrompt
                        });
                      });
                  } else {
                    resolve({
                      success: true,
                      image: `data:${mimeType};base64,${imageData}`,
                      prompt: enhancedPrompt
                    });
                  }
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
