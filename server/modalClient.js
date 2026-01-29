/**
 * Modal API Client
 *
 * Provides HTTP client for Modal Sandbox API with SSE parsing and event conversion.
 * Used when USE_MODAL=true to route Claude CLI execution to Modal.
 *
 * Features:
 * - SSE stream parsing for Modal endpoints
 * - SSE → WebSocket event type conversion
 * - All Modal API methods (generate, files, intent/skill detection)
 * - Git operations (log, diff, restore) via apply_files endpoint
 *
 * @module modalClient
 */

const config = require('./config');

/**
 * Derive endpoint URL from base endpoint
 * @param {string} baseEndpoint - Base MODAL_ENDPOINT
 * @param {string} endpointName - Target endpoint name (e.g., 'get_file')
 * @returns {string} Full endpoint URL
 */
function deriveEndpoint(baseEndpoint, endpointName) {
  if (!baseEndpoint) return null;
  // Replace the function name in the URL
  // e.g., https://xxx--dreamcore-generate-game.modal.run → https://xxx--dreamcore-get-file.modal.run
  return baseEndpoint.replace(/generate[_-]game/i, endpointName.replace(/_/g, '-'));
}

/**
 * Get endpoint URL with fallback to derived URL
 * @param {string} explicitEndpoint - Explicitly configured endpoint (may be undefined)
 * @param {string} baseEndpoint - Base MODAL_ENDPOINT
 * @param {string} endpointName - Target endpoint name
 * @returns {string} Endpoint URL
 */
function getEndpoint(explicitEndpoint, baseEndpoint, endpointName) {
  return explicitEndpoint || deriveEndpoint(baseEndpoint, endpointName);
}

/**
 * SSE → WebSocket event type mapping
 */
const SSE_TO_WS_TYPE_MAP = {
  'status': 'progress',
  'stream': 'stream',
  'done': 'completed',
  'error': 'failed',
  'result': 'result',
  'log': 'log',
  'debug': 'debug',
  'warning': 'warning',
};

class ModalClient {
  constructor() {
    this.baseEndpoint = config.MODAL_ENDPOINT;
    this.secret = config.MODAL_INTERNAL_SECRET;
  }

  /**
   * Get common headers for Modal API requests
   * @returns {Object} Headers object
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Modal-Secret': this.secret,
    };
  }

  /**
   * Parse SSE stream from Modal API response
   * Yields parsed JSON objects from 'data:' lines
   * @param {Response} response - Fetch response object
   * @yields {Object} Parsed event data
   */
  async *parseSSEStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const jsonStr = trimmed.slice(6); // Remove 'data: ' prefix
              if (jsonStr) {
                yield JSON.parse(jsonStr);
              }
            } catch (e) {
              // JSON parse error - skip this line
              console.warn('[modalClient] SSE parse error:', e.message, 'Line:', trimmed.slice(0, 100));
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim().startsWith('data: ')) {
        try {
          const jsonStr = buffer.trim().slice(6);
          if (jsonStr) {
            yield JSON.parse(jsonStr);
          }
        } catch (e) {
          // Ignore final buffer parse errors
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Convert SSE event to WebSocket event format
   * @param {Object} sseData - SSE event data with 'type' field
   * @returns {Object} WebSocket-compatible event
   */
  convertSseToWsEvent(sseData) {
    const wsType = SSE_TO_WS_TYPE_MAP[sseData.type] || sseData.type;

    return {
      ...sseData,
      type: wsType,
    };
  }

  /**
   * Generate game code using Claude CLI on Modal
   * @param {Object} params
   * @param {string} params.user_id - User ID (UUID)
   * @param {string} params.project_id - Project ID (UUID)
   * @param {string} params.prompt - Full prompt for Claude CLI
   * @param {AbortSignal} [params.signal] - Optional AbortSignal for cancellation
   * @param {string} [params._test_error] - Test error type (timeout, general, sandbox, network, rate_limit)
   * @yields {Object} WebSocket-compatible events (progress, stream, completed, failed)
   */
  async *generateGame({ user_id, project_id, prompt, signal, _test_error }) {
    const url = this.baseEndpoint;
    if (!url) {
      throw new Error('MODAL_ENDPOINT is not configured');
    }

    const body = { user_id, project_id, prompt };
    if (_test_error) {
      body._test_error = _test_error;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal,  // Pass AbortSignal for cancellation support
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal API error: ${response.status} - ${errorText}`);
    }

    for await (const sseData of this.parseSSEStream(response)) {
      yield this.convertSseToWsEvent(sseData);
    }
  }

  /**
   * Get file content from Modal Volume
   * @param {string} user_id - User ID (UUID)
   * @param {string} project_id - Project ID (UUID)
   * @param {string} filePath - File path relative to project directory
   * @returns {Promise<string|Buffer|null>} File content or null if not found
   */
  async getFile(user_id, project_id, filePath) {
    const endpoint = getEndpoint(
      config.MODAL_GET_FILE_ENDPOINT,
      this.baseEndpoint,
      'get_file'
    );
    if (!endpoint) {
      throw new Error('Modal get_file endpoint is not configured');
    }

    const url = new URL(endpoint);
    url.searchParams.set('user_id', user_id);
    url.searchParams.set('project_id', project_id);
    url.searchParams.set('path', filePath);

    const response = await fetch(url, {
      headers: { 'X-Modal-Secret': this.secret },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal get_file error: ${response.status} - ${errorText}`);
    }

    // Check content type for binary vs text
    const contentType = response.headers.get('content-type') || '';
    const isText = contentType.includes('text') ||
                   contentType.includes('json') ||
                   contentType.includes('javascript') ||
                   contentType.includes('html') ||
                   contentType.includes('css');

    if (isText) {
      return await response.text();
    } else {
      return Buffer.from(await response.arrayBuffer());
    }
  }

  /**
   * List files in project directory on Modal Volume
   * @param {string} user_id - User ID (UUID)
   * @param {string} project_id - Project ID (UUID)
   * @returns {Promise<string[]>} Array of file paths
   */
  async listFiles(user_id, project_id) {
    const endpoint = getEndpoint(
      config.MODAL_LIST_FILES_ENDPOINT,
      this.baseEndpoint,
      'list_files'
    );
    if (!endpoint) {
      throw new Error('Modal list_files endpoint is not configured');
    }

    const url = new URL(endpoint);
    url.searchParams.set('user_id', user_id);
    url.searchParams.set('project_id', project_id);

    const response = await fetch(url, {
      headers: { 'X-Modal-Secret': this.secret },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return []; // Project not found = no files
      }
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal list_files error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  /**
   * Apply files to project directory on Modal Volume
   * @param {Object} params
   * @param {string} params.user_id - User ID (UUID)
   * @param {string} params.project_id - Project ID (UUID)
   * @param {Array} params.files - Array of {path, content, action?} objects
   * @param {string} [params.commit_message] - Git commit message
   * @yields {Object} Progress events
   */
  async *applyFiles({ user_id, project_id, files, commit_message = 'Update via API' }) {
    const endpoint = getEndpoint(
      config.MODAL_APPLY_FILES_ENDPOINT,
      this.baseEndpoint,
      'apply_files'
    );
    if (!endpoint) {
      throw new Error('Modal apply_files endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id, project_id, files, commit_message }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal apply_files error: ${response.status} - ${errorText}`);
    }

    for await (const sseData of this.parseSSEStream(response)) {
      yield this.convertSseToWsEvent(sseData);
    }
  }

  /**
   * Consume apply_files stream and return final result
   * Utility method that waits for completion
   * @param {Object} params - Same as applyFiles
   * @returns {Promise<Object>} Final result with written files
   */
  async applyFilesSync(params) {
    let result = null;
    let error = null;

    for await (const event of this.applyFiles(params)) {
      if (event.type === 'result') {
        result = event;
      } else if (event.type === 'failed' || event.type === 'error') {
        error = event.message || event.error || 'Unknown error';
      }
    }

    if (error) {
      throw new Error(error);
    }

    return result;
  }

  /**
   * Detect user intent using Haiku on Modal
   * @param {string} message - User message
   * @returns {Promise<string>} Intent: 'restore' | 'chat' | 'edit'
   */
  async detectIntent(message) {
    const endpoint = getEndpoint(
      config.MODAL_DETECT_INTENT_ENDPOINT,
      this.baseEndpoint,
      'detect_intent'
    );
    if (!endpoint) {
      throw new Error('Modal detect_intent endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal detect_intent error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.intent || 'edit';
  }

  /**
   * Detect relevant skills using Haiku on Modal
   * @param {string} message - User message
   * @param {string} [dimension='2d'] - Game dimension ('2d' | '3d')
   * @param {string} [existing_code=''] - Current project code
   * @returns {Promise<string[]>} Array of skill names
   */
  async detectSkills(message, dimension = '2d', existing_code = '') {
    const endpoint = getEndpoint(
      config.MODAL_DETECT_SKILLS_ENDPOINT,
      this.baseEndpoint,
      'detect_skills'
    );
    if (!endpoint) {
      throw new Error('Modal detect_skills endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message, dimension, existing_code }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal detect_skills error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.skills || [];
  }

  /**
   * Get skill content from Modal global volume
   * @param {string[]} skill_names - Array of skill names
   * @returns {Promise<Object>} Map of skill_name → content
   */
  async getSkillContent(skill_names) {
    const endpoint = getEndpoint(
      config.MODAL_GET_SKILL_CONTENT_ENDPOINT,
      this.baseEndpoint,
      'get_skill_content'
    );
    if (!endpoint) {
      throw new Error('Modal get_skill_content endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ skill_names }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal get_skill_content error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.skills || {};
  }

  /**
   * Handle chat using Haiku on Modal
   * @param {Object} params
   * @param {string} params.message - User's question
   * @param {string} [params.game_spec] - SPEC.md content
   * @param {Array} [params.conversation_history] - Previous messages
   * @returns {Promise<Object>} { message, suggestions }
   */
  async chatHaiku({ message, game_spec = '', conversation_history = [] }) {
    const endpoint = getEndpoint(
      null, // No explicit config, derive from base
      this.baseEndpoint,
      'chat_haiku'
    );
    if (!endpoint) {
      throw new Error('Modal chat_haiku endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message, game_spec, conversation_history }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal chat_haiku error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      message: data.message || '',
      suggestions: data.suggestions || [],
    };
  }

  /**
   * Generate code using Gemini on Modal (fast path)
   * @param {Object} params
   * @param {string} params.user_id - User ID (UUID)
   * @param {string} params.project_id - Project ID (UUID)
   * @param {string} params.prompt - Prompt for Gemini
   * @yields {Object} WebSocket-compatible events
   */
  async *generateGemini({ user_id, project_id, prompt }) {
    const endpoint = getEndpoint(
      config.MODAL_GEMINI_ENDPOINT,
      this.baseEndpoint,
      'generate_gemini'
    );
    if (!endpoint) {
      throw new Error('Modal generate_gemini endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id, project_id, prompt }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal generate_gemini error: ${response.status} - ${errorText}`);
    }

    for await (const sseData of this.parseSSEStream(response)) {
      yield this.convertSseToWsEvent(sseData);
    }
  }

  /**
   * Generate publish info (title, description, howToPlay, tags) using Haiku on Modal
   * @param {Object} params
   * @param {string} params.user_id - User ID (UUID)
   * @param {string} params.project_id - Project ID (UUID)
   * @param {string} params.project_name - Project name
   * @returns {Promise<Object>} { title, description, howToPlay, tags }
   */
  async generatePublishInfo({ user_id, project_id, project_name }) {
    const endpoint = getEndpoint(
      null, // No explicit config, derive from base
      this.baseEndpoint,
      'generate_publish_info'
    );
    if (!endpoint) {
      throw new Error('Modal generate_publish_info endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id, project_id, project_name }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal generate_publish_info error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  // ========================================================================
  // Git Operations (via apply_files endpoint with action parameter)
  // ========================================================================

  /**
   * Get git log (version history) for a project
   * @param {string} user_id - User ID (UUID)
   * @param {string} project_id - Project ID (UUID)
   * @param {number} [limit=50] - Max commits to return
   * @returns {Promise<Array>} Array of {hash, message, date} objects
   */
  async gitLog(user_id, project_id, limit = 50) {
    const endpoint = getEndpoint(
      config.MODAL_APPLY_FILES_ENDPOINT,
      this.baseEndpoint,
      'apply_files'
    );
    if (!endpoint) {
      throw new Error('Modal apply_files endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        action: 'git_log',
        user_id,
        project_id,
        limit,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal git_log error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.commits || [];
  }

  /**
   * Get git diff for a specific commit
   * @param {string} user_id - User ID (UUID)
   * @param {string} project_id - Project ID (UUID)
   * @param {string} commit - Git commit hash
   * @returns {Promise<string>} Unified diff text
   */
  async gitDiff(user_id, project_id, commit) {
    const endpoint = getEndpoint(
      config.MODAL_APPLY_FILES_ENDPOINT,
      this.baseEndpoint,
      'apply_files'
    );
    if (!endpoint) {
      throw new Error('Modal apply_files endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        action: 'git_diff',
        user_id,
        project_id,
        commit,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal git_diff error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.diff || '';
  }

  /**
   * Restore project to a specific git commit
   * @param {string} user_id - User ID (UUID)
   * @param {string} project_id - Project ID (UUID)
   * @param {string} commit - Git commit hash to restore to
   * @returns {Promise<Object>} Result with success flag and restored_files
   */
  async gitRestore(user_id, project_id, commit) {
    const endpoint = getEndpoint(
      config.MODAL_APPLY_FILES_ENDPOINT,
      this.baseEndpoint,
      'apply_files'
    );
    if (!endpoint) {
      throw new Error('Modal apply_files endpoint is not configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        action: 'git_restore',
        user_id,
        project_id,
        commit,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Modal git_restore error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: data.success || false,
      restored_files: data.restored_files || [],
      error: data.error,
    };
  }

  /**
   * Check if Modal is properly configured and reachable
   * @returns {Promise<boolean>} True if Modal is available
   */
  async healthCheck() {
    if (!this.baseEndpoint || !this.secret) {
      return false;
    }

    try {
      // Try to list files for a non-existent project (should return 404, not auth error)
      const endpoint = getEndpoint(
        config.MODAL_LIST_FILES_ENDPOINT,
        this.baseEndpoint,
        'list_files'
      );
      const url = new URL(endpoint);
      url.searchParams.set('user_id', '00000000-0000-0000-0000-000000000000');
      url.searchParams.set('project_id', '00000000-0000-0000-0000-000000000000');

      const response = await fetch(url, {
        headers: { 'X-Modal-Secret': this.secret },
      });

      // 404 is expected (project doesn't exist), 401 means auth failed
      return response.status !== 401;
    } catch (e) {
      console.error('[modalClient] Health check failed:', e.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new ModalClient();
