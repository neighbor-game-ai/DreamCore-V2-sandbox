const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const userManager = require('./userManager');
const jobManager = require('./jobManager');
const db = require('./database');
const geminiClient = require('./geminiClient');

// Game type bundles - automatically include related skills
const GAME_TYPE_BUNDLES = {
  // 2D/3D detection (most important - determines visual polish)
  '2d': {
    keywords: ['2d', '2次元', '二次元', 'p5', 'canvas', 'キャンバス'],
    includeSkills: ['visual-polish-2d', 'game-audio']
  },
  '3d': {
    keywords: ['3d', '3次元', '三次元', 'three', '立体', 'webgl'],
    includeSkills: ['visual-polish-3d', 'visual-polish-2d', 'game-audio']  // 3D games also need 2D polish for UI
  },
  // Game type specific skills
  'shooting': {
    keywords: ['シューティング', 'shooting', 'shooter', '弾', 'bullet', '撃つ', 'shoot', 'シューター'],
    includeSkills: ['particles']  // Shooting games need explosions
  },
  'racing': {
    keywords: ['レース', 'race', 'racing', 'ドライブ', 'drive', '車', 'car'],
    includeSkills: ['vehicle-physics']
  }
};

// Skills configuration with keywords for auto-detection
const SKILLS_CONFIG = {
  'p5js': {
    // Default for 2D games (don't include generic "game" here - handled separately)
    keywords: ['2d', '2次元', '二次元', 'p5', 'キャンバス', 'canvas', 'シューティング', 'shooting',
      'アクション', 'action', 'ブロック崩し', 'breakout', 'パドル', 'paddle', 'スプライト', 'sprite',
      '当たり判定', 'collision', 'ゲームループ', 'game loop', 'クリエイティブ',
      'タップ', 'tap', 'クリック', 'click', 'スコア', 'score',
      '避ける', 'dodge', '集める', 'collect', 'パズル', 'puzzle', 'マッチ', 'match',
      'フリック', 'flick', 'スワイプ', 'swipe', 'ドラッグ', 'drag', 'タッチ', 'touch'],
    priority: 2,
    isDefault: true,  // Use as default when no specific skill detected
    excludeIf: ['3d', '3次元', '三次元', 'three', '立体', 'webgl']  // Don't use if 3D is requested
  },
  'threejs': {
    keywords: ['3d', '3次元', '三次元', 'three', '立体', 'キューブ', 'cube', '球', 'sphere',
      'カメラ', 'camera', 'ライト', 'light', 'レーシング', 'racing', 'fps', 'ファーストパーソン',
      '回転', 'rotate', 'オブジェクト', 'object', 'メッシュ', 'mesh', 'シーン', 'scene',
      'ワールド', 'world', '空間', 'space', 'webgl', 'レンダリング', 'rendering',
      '3dゲーム', '立体的'],
    priority: 1,  // Higher priority than p5js
    excludeIf: ['2d', '2次元', '二次元']  // Don't use if 2D is explicitly requested
  },
  'game-audio': {
    keywords: ['音', 'sound', 'サウンド', 'bgm', '効果音', 'se', 'music', '音楽', 'オーディオ', 'audio',
      'howler', '鳴る', '鳴らす', 'play sound', '音を出す', 'ピコピコ', '爆発音', 'ジャンプ音'],
    priority: 3
  },
  'game-ai': {
    keywords: ['ai', '敵', 'enemy', 'npc', '追いかけ', 'chase', '逃げる', 'flee',
      'パスファインディング', 'pathfinding', 'ステートマシン', 'state machine', '巡回', 'patrol',
      'yuka', '自動', 'auto', '知能', 'intelligent', '追跡', 'track', '攻撃', 'attack'],
    priority: 4
  },
  'tween-animation': {
    keywords: ['アニメーション', 'animation', 'tween', 'gsap', 'イージング', 'easing',
      'フェード', 'fade', 'スライド', 'slide', 'スコア演出', 'ui animation', '滑らか',
      'smooth', '動き', 'motion', 'バウンス', 'bounce', '揺れ', 'shake'],
    priority: 5
  },
  'particles': {
    keywords: ['パーティクル', 'particle', '爆発', 'explosion', '紙吹雪', 'confetti',
      '花火', 'firework', '雪', 'snow', '火', 'fire', '火花', 'spark', 'エフェクト', 'effect',
      'tsparticles', 'キラキラ', 'sparkle', '光', 'glow'],
    priority: 6
  },
  'vehicle-physics': {
    keywords: ['車', 'car', '車両', 'vehicle', 'ドライブ', 'drive', 'driving',
      'レース', 'race', 'racing', 'ハンドル', 'steering', 'アクセル', 'accelerate',
      'ブレーキ', 'brake', 'ドリフト', 'drift', 'タイヤ', 'tire', 'wheel',
      'サスペンション', 'suspension', 'トラック', 'truck', 'バイク', 'bike', 'motorcycle',
      'カーレース', 'カーゲーム'],
    priority: 7
  },
  'visual-polish-2d': {
    keywords: ['演出', 'エフェクト', 'effect', 'パーティクル', 'particle', 'シェイク', 'shake',
      'フラッシュ', 'flash', 'トレイル', 'trail', 'グロー', 'glow', 'juice', 'ジューシー',
      '見栄え', '派手', 'かっこいい', 'cool', 'ポリッシュ', 'polish'],
    priority: 8,
    excludeIf: ['3d', '3次元', '三次元', 'three', '立体']
  },
  'visual-polish-3d': {
    keywords: ['演出', 'エフェクト', 'effect', 'シェーダー', 'shader', 'トゥーン', 'toon',
      'ブルーム', 'bloom', 'ポストプロセス', 'postprocess', 'アウトライン', 'outline',
      '見栄え', '派手', 'かっこいい', 'cool', 'ポリッシュ', 'polish', 'セル', 'cel'],
    priority: 8,
    excludeIf: ['2d', '2次元', 'p5']
  }
};

// Keywords that indicate a game creation request (triggers default skill)
const GAME_KEYWORDS = ['ゲーム', 'game', '作って', '作成', 'create', 'make', '開発', 'develop', '遊べる', 'playable'];

class ClaudeRunner {
  constructor() {
    this.runningProcesses = new Map();
    this.skillsDir = path.join(__dirname, '..', '.claude', 'skills');
    this.availableSkills = this.listAvailableSkills();
  }

  // List available skills (for detection purposes only - CLI reads content)
  listAvailableSkills() {
    try {
      if (!fs.existsSync(this.skillsDir)) {
        console.log('Skills directory not found:', this.skillsDir);
        return new Set();
      }

      const skillFolders = fs.readdirSync(this.skillsDir).filter(f => {
        const skillPath = path.join(this.skillsDir, f, 'SKILL.md');
        return fs.existsSync(skillPath);
      });

      console.log(`Available skills: ${skillFolders.join(', ')}`);
      console.log('(Claude Code CLI will read skill content as needed)');
      return new Set(skillFolders);
    } catch (error) {
      console.error('Error listing skills:', error);
      return new Set();
    }
  }

  // Auto-detect which skills to use based on user message
  detectSkills(userMessage, conversationHistory = []) {
    const detectedSkills = [];
    const bundledSkills = new Set();  // Track skills added via bundles
    const messageLower = userMessage.toLowerCase();

    // Also check recent conversation history
    const recentHistory = conversationHistory.slice(-5).map(h => h.content.toLowerCase()).join(' ');
    const fullContext = messageLower + ' ' + recentHistory;

    // Check if this is a game creation request
    const isGameRequest = GAME_KEYWORDS.some(keyword => fullContext.includes(keyword.toLowerCase()));

    // First, check game type bundles to auto-include related skills
    for (const [bundleName, bundle] of Object.entries(GAME_TYPE_BUNDLES)) {
      const matchesBundle = bundle.keywords.some(keyword =>
        fullContext.includes(keyword.toLowerCase())
      );
      if (matchesBundle) {
        console.log(`Game type detected: ${bundleName}, auto-including: ${bundle.includeSkills.join(', ')}`);
        for (const skillName of bundle.includeSkills) {
          bundledSkills.add(skillName);
        }
      }
    }

    for (const [skillName, config] of Object.entries(SKILLS_CONFIG)) {
      if (!this.availableSkills.has(skillName)) continue;

      // Check if this skill should be excluded based on context
      if (config.excludeIf) {
        const shouldExclude = config.excludeIf.some(keyword =>
          fullContext.includes(keyword.toLowerCase())
        );
        if (shouldExclude) {
          console.log(`Excluding ${skillName} due to exclusion keywords`);
          continue;
        }
      }

      const matchCount = config.keywords.filter(keyword =>
        fullContext.includes(keyword.toLowerCase())
      ).length;

      // Include if matched by keywords OR included via bundle
      if (matchCount > 0 || bundledSkills.has(skillName)) {
        detectedSkills.push({
          name: skillName,
          matchCount: matchCount + (bundledSkills.has(skillName) ? 10 : 0),  // Boost bundled skills
          priority: config.priority,
          isDefault: config.isDefault || false
        });
      }
    }

    // Sort by priority (asc) first, then match count (desc)
    // This ensures 3D gets priority when explicitly requested
    detectedSkills.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.matchCount - a.matchCount;
    });

    // If game request but no specific skills detected, use default (p5js)
    // But only if 3D wasn't requested
    const is3DRequest = ['3d', '3次元', '三次元', 'three', '立体'].some(k => fullContext.includes(k));

    if (isGameRequest && detectedSkills.length === 0) {
      if (is3DRequest && this.availableSkills.has('threejs')) {
        detectedSkills.push({
          name: 'threejs',
          matchCount: 1,
          priority: 1,
          isDefault: false
        });
        console.log('Using threejs for 3D game request');
      } else {
        const defaultSkill = Object.entries(SKILLS_CONFIG).find(([_, config]) => config.isDefault);
        if (defaultSkill && this.availableSkills.has(defaultSkill[0])) {
          detectedSkills.push({
            name: defaultSkill[0],
            matchCount: 1,
            priority: 1,
            isDefault: true
          });
          console.log('Using default skill for game request:', defaultSkill[0]);
        }
      }
    }

    // Remove duplicates
    const uniqueSkills = [...new Set(detectedSkills.map(s => s.name))];

    // Auto-add visual polish based on engine
    if (uniqueSkills.includes('p5js') && !uniqueSkills.includes('visual-polish-2d')) {
      uniqueSkills.push('visual-polish-2d');
    }
    if (uniqueSkills.includes('threejs')) {
      if (!uniqueSkills.includes('visual-polish-3d')) {
        uniqueSkills.push('visual-polish-3d');
      }
      if (!uniqueSkills.includes('visual-polish-2d')) {
        uniqueSkills.push('visual-polish-2d');  // For UI elements
      }
    }

    // Auto-add game-audio for all games
    if ((uniqueSkills.includes('p5js') || uniqueSkills.includes('threejs')) &&
        !uniqueSkills.includes('game-audio')) {
      uniqueSkills.push('game-audio');
    }

    // Limit to 4 most important skills to keep prompt small
    const limitedSkills = uniqueSkills.slice(0, 4);
    console.log('Detected skills:', limitedSkills.length > 0 ? limitedSkills.join(', ') : 'none');
    return limitedSkills;
  }

  // Skills are now handled by Claude Code CLI natively
  // We just provide hints about which skills might be relevant
  getSkillHints(skillNames) {
    if (skillNames.length === 0) return '';
    return `\n参考スキル: ${skillNames.join(', ')} (.claude/skills/ 参照)`;
  }

  // Read raw skill contents
  readSkillContents(skillNames) {
    const contents = [];
    for (const skillName of skillNames) {
      const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        try {
          const content = fs.readFileSync(skillPath, 'utf-8');
          // Truncate very long skills
          const truncated = content.length > 3000
            ? content.substring(0, 3000) + '\n...(truncated)'
            : content;
          contents.push(`## ${skillName}\n${truncated}`);
        } catch (e) {
          console.error(`Failed to load skill ${skillName}:`, e.message);
        }
      }
    }
    return contents.join('\n\n');
  }

  // Use Claude Code CLI to summarize skills for Gemini
  async summarizeSkillsWithClaude(userMessage, detectedSkills) {
    if (detectedSkills.length === 0) {
      return null;
    }

    // Read skill contents ourselves
    const rawSkillContent = this.readSkillContents(detectedSkills);
    if (!rawSkillContent) {
      return null;
    }

    const prompt = `以下のスキル情報を、Gemini APIに渡すための簡潔なガイドライン（300文字程度）に要約してください。

## ユーザーのタスク
${userMessage}

## スキル情報
${rawSkillContent}

## 出力形式
- 必要なCDNリンク（URLそのまま）
- デザインガイドライン（色、フォント、形状）
- 重要なコードパターン
のみを箇条書きで出力。説明文は不要。`;

    return new Promise((resolve) => {
      const args = [
        '--print',
        '--dangerously-skip-permissions',
        '--max-turns', '1',
        '--output-format', 'text',
        prompt
      ];

      const child = spawn('claude', args, {
        cwd: this.skillsDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0 && output.trim()) {
          console.log('Skills summarized by Claude:', output.trim().length, 'chars');
          resolve(output.trim());
        } else {
          console.log('Skill summarization failed, using raw content');
          // Fallback: use truncated raw content
          resolve(rawSkillContent.substring(0, 1500));
        }
      });

      child.on('error', () => {
        resolve(rawSkillContent.substring(0, 1500));
      });

      // Timeout after 20 seconds
      setTimeout(() => {
        child.kill();
        resolve(rawSkillContent.substring(0, 1500));
      }, 20000);
    });
  }

  // Build prompt for Claude - minimal, let CLI handle the rest
  buildPrompt(visitorId, projectId, userMessage) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const history = userManager.getConversationHistory(visitorId, projectId);
    const detectedSkills = this.detectSkills(userMessage, history);
    const skillHints = this.getSkillHints(detectedSkills);

    // Simple prompt - let Claude Code CLI do its thing
    const prompt = `スマートフォン向けブラウザゲームを作成してください。

作業ディレクトリ: ${projectDir}
${skillHints}

.claude/skills/ にゲーム開発用のスキル（CDNリンク、サンプルコード）があります。
必要に応じて参照し、ベストプラクティスに従ってください。

過去のコードやgit履歴も参考にできます。

ユーザーの指示: ${userMessage}`;

    return { prompt, detectedSkills };
  }

  // Build prompt without skills (for debug mode)
  buildPromptWithoutSkills(visitorId, projectId, userMessage) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);

    const prompt = `スマートフォン向けブラウザゲームを作成してください。

作業ディレクトリ: ${projectDir}

[DEBUG] スキル無効モード - スキルを参照せずに基本的な実装を行ってください。

ユーザーの指示: ${userMessage}`;

    return prompt;
  }

  // Try Gemini first for code generation
  async tryGeminiGeneration(visitorId, projectId, userMessage, jobId, debugOptions = {}) {
    if (!geminiClient.isAvailable()) {
      console.log('Gemini not available, using Claude Code');
      return null;
    }

    try {
      const history = userManager.getConversationHistory(visitorId, projectId);

      // Get current code (null for new projects)
      const files = userManager.listProjectFiles(visitorId, projectId);
      const currentCode = files.length > 0
        ? files.map(f => {
            const content = userManager.readProjectFile(visitorId, projectId, f);
            return `--- ${f} ---\n${content}`;
          }).join('\n\n')
        : null;

      jobManager.updateProgress(jobId, 20, 'Gemini APIでコード生成中...');
      console.log('Calling Gemini API for code generation...');

      let streamedChars = 0;

      // Call Gemini with streaming
      const result = await geminiClient.generateCode({
        userMessage,
        currentCode,
        conversationHistory: history || [],
        onStream: (chunk) => {
          if (chunk.type === 'text') {
            streamedChars += chunk.content.length;
            // Update progress based on streamed content (estimate ~15000 chars for full response)
            const progress = Math.min(20 + Math.floor((streamedChars / 15000) * 30), 50);
            jobManager.updateProgress(jobId, progress, 'コード生成中...');
            // Send streaming content to frontend
            jobManager.notifySubscribers(jobId, { type: 'stream', content: chunk.content });
          }
        }
      });

      if (result && (result.files || result.edits)) {
        const isEdit = result.mode === 'edit';
        const changeCount = isEdit ? result.edits?.length : result.files?.length;
        console.log(`Gemini ${isEdit ? 'edit' : 'create'} mode: ${changeCount} ${isEdit ? 'edit(s)' : 'file(s)'}`);

        jobManager.updateProgress(jobId, 50, `コード生成完了（${changeCount}件の変更）`);

        // Send generated code to frontend
        jobManager.notifySubscribers(jobId, {
          type: 'geminiCode',
          mode: result.mode || 'create',
          files: result.files,
          edits: result.edits,
          summary: result.summary
        });

        return result;
      }

      return null;
    } catch (error) {
      console.error('Gemini generation failed:', error.message);
      jobManager.updateProgress(jobId, 25, 'Gemini失敗、Claude Codeにフォールバック...');
      return null;
    }
  }

  // Apply Gemini-generated result (create or edit mode)
  async applyGeminiResult(visitorId, projectId, geminiResult, jobId) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);

    try {
      if (geminiResult.mode === 'edit' && geminiResult.edits) {
        // Edit mode - apply diffs
        const totalEdits = geminiResult.edits.length;
        console.log(`Applying ${totalEdits} edit(s)...`);
        jobManager.updateProgress(jobId, 60, `${totalEdits}件の編集を適用中...`);

        for (let i = 0; i < geminiResult.edits.length; i++) {
          const edit = geminiResult.edits[i];
          const filePath = path.join(projectDir, edit.path);

          // Progress: 60% to 85%
          const progress = 60 + Math.floor((i / totalEdits) * 25);
          jobManager.updateProgress(jobId, progress, `編集中: ${edit.path}`);

          if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${edit.path}`);
            continue;
          }

          let content = fs.readFileSync(filePath, 'utf-8');

          if (!content.includes(edit.old_string)) {
            console.error(`old_string not found in ${edit.path}:`);
            console.error(`Looking for: "${edit.old_string.substring(0, 100)}..."`);
            // Try to continue with other edits
            continue;
          }

          content = content.replace(edit.old_string, edit.new_string);
          fs.writeFileSync(filePath, content, 'utf-8');
          console.log(`Edited: ${edit.path}`);
        }
      } else {
        // Create mode - write full files
        const files = geminiResult.files || [];
        jobManager.updateProgress(jobId, 60, `${files.length}件のファイルを作成中...`);

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filePath = path.join(projectDir, file.path);
          const dir = path.dirname(filePath);

          const progress = 60 + Math.floor((i / files.length) * 25);
          jobManager.updateProgress(jobId, progress, `作成中: ${file.path}`);

          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(filePath, file.content, 'utf-8');
          console.log('Written:', file.path);
        }
      }

      // Create git commit
      jobManager.updateProgress(jobId, 88, 'バージョン保存中...');
      userManager.createVersionSnapshot(visitorId, projectId, geminiResult.summary || 'Gemini generated code');

      jobManager.updateProgress(jobId, 95, 'ファイル適用完了');
      return true;
    } catch (error) {
      console.error('Failed to apply Gemini result:', error.message);
      return false;
    }
  }

  // Run Claude as an async job
  async runClaudeAsJob(visitorId, projectId, userMessage, debugOptions = {}) {
    // Get user from database
    const user = db.getUserByVisitorId(visitorId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check for existing active job
    const existingJob = jobManager.getActiveJob(projectId);
    if (existingJob) {
      return { job: existingJob, isExisting: true, startProcessing: () => {} };
    }

    // Create new job
    const job = jobManager.createJob(user.id, projectId);

    // Return job with a function to start processing (allows caller to subscribe first)
    return {
      job,
      isExisting: false,
      startProcessing: () => {
        this.processJob(job.id, visitorId, projectId, userMessage, debugOptions);
      }
    };
  }

  // Process job (runs in background)
  async processJob(jobId, visitorId, projectId, userMessage, debugOptions = {}) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);

    // Build prompt (optionally disable skills)
    let prompt, detectedSkills;
    if (debugOptions.disableSkills) {
      console.log('[DEBUG] Skills disabled');
      prompt = this.buildPromptWithoutSkills(visitorId, projectId, userMessage);
      detectedSkills = [];
    } else {
      const result = this.buildPrompt(visitorId, projectId, userMessage);
      prompt = result.prompt;
      detectedSkills = result.detectedSkills;
    }

    // Start the job
    jobManager.startJob(jobId);

    if (detectedSkills.length > 0) {
      jobManager.updateProgress(jobId, 10, `使用スキル: ${detectedSkills.join(', ')}`);
    }

    // Skip Gemini if useClaude is enabled
    if (!debugOptions.useClaude) {
      // Try Gemini first for code generation
      const geminiResult = await this.tryGeminiGeneration(visitorId, projectId, userMessage, jobId, debugOptions);

      if (geminiResult) {
        // Gemini succeeded - apply the result
        const applied = await this.applyGeminiResult(visitorId, projectId, geminiResult, jobId);

        if (applied) {
          const responseMessage = geminiResult.summary || 'Geminiでゲームを生成しました';
          userManager.addToHistory(visitorId, projectId, 'assistant', responseMessage);

          const currentHtml = userManager.readProjectFile(visitorId, projectId, 'index.html');
          jobManager.completeJob(jobId, {
            message: responseMessage,
            html: currentHtml,
            generator: 'gemini'
          });

          console.log('Job completed with Gemini:', jobId);
          return { success: true };
        }
      }
    } else {
      console.log('[DEBUG] Using Claude CLI (Gemini skipped)');
    }

    // Fall back to Claude Code CLI
    console.log('Using Claude Code CLI for job:', jobId, 'in:', projectDir);

    return new Promise((resolve) => {
      const claude = spawn('claude', [
        '--model', 'opus',
        '--verbose',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectDir,
        env: { ...process.env, PATH: process.env.PATH },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Register process for cancellation
      jobManager.registerProcess(jobId, claude, () => claude.kill());

      // Write prompt to stdin
      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      let errorOutput = '';
      let buffer = '';
      let progressEstimate = 20;
      let assistantText = '';  // Collect assistant's text response

      claude.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            let event = json;

            // Unwrap stream_event wrapper
            if (json.type === 'stream_event' && json.event) {
              event = json.event;
            }

            // Handle assistant message format: {"type":"assistant","message":{"content":[...]}}
            if (event.type === 'assistant' && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === 'text' && block.text) {
                  assistantText += block.text;  // Collect text
                  jobManager.notifySubscribers(jobId, { type: 'stream', content: block.text });
                } else if (block.type === 'tool_use') {
                  const toolName = block.name || 'unknown';
                  console.log('  Tool:', toolName);
                  progressEstimate = Math.min(progressEstimate + 15, 90);
                  jobManager.updateProgress(jobId, progressEstimate, `実行中: ${toolName}`);
                  jobManager.notifySubscribers(jobId, { type: 'stream', content: `\n[${toolName}]\n` });
                }
              }
            }

            // Tool usage - content_block_start
            if (event.type === 'content_block_start' && event.content_block) {
              if (event.content_block.type === 'tool_use') {
                const toolName = event.content_block.name;
                console.log('  Tool:', toolName);
                progressEstimate = Math.min(progressEstimate + 20, 90);
                jobManager.updateProgress(jobId, progressEstimate, `実行中: ${toolName}`);
                jobManager.notifySubscribers(jobId, { type: 'stream', content: `\n[${toolName}]\n` });
              } else if (event.content_block.type === 'text' && event.content_block.text) {
                jobManager.notifySubscribers(jobId, { type: 'stream', content: event.content_block.text });
              }
            }

            // Stream text/json content - content_block_delta
            if (event.type === 'content_block_delta' && event.delta) {
              if (event.delta.type === 'text_delta' && event.delta.text) {
                jobManager.notifySubscribers(jobId, { type: 'stream', content: event.delta.text });
              } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
                jobManager.notifySubscribers(jobId, { type: 'stream', content: event.delta.partial_json });
              }
            }

            // Result
            if (event.type === 'result' && event.result) {
              output = event.result;
            } else if (json.type === 'result' && json.result) {
              output = json.result;
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claude.on('close', (code) => {
        console.log('Claude job', jobId, 'exited with code:', code);

        if (code === 0) {
          // Read updated file
          const currentHtml = userManager.readProjectFile(visitorId, projectId, 'index.html');

          // Extract HTML from response if present
          const htmlMatch = output.match(/```html\n([\s\S]*?)```/);
          if (htmlMatch) {
            userManager.writeProjectFile(visitorId, projectId, 'index.html', htmlMatch[1]);
          }

          // Create version snapshot
          userManager.createVersionSnapshot(visitorId, projectId, userMessage.substring(0, 50));

          // Use collected assistant text or default message
          const responseMessage = assistantText.trim() || 'ゲームを更新しました';

          // Add to history
          userManager.addToHistory(visitorId, projectId, 'assistant', responseMessage);

          // Complete the job with the actual response
          jobManager.completeJob(jobId, {
            message: responseMessage,
            html: currentHtml
          });

          resolve({ success: true });
        } else {
          const errorMsg = errorOutput || output || 'Unknown error';
          jobManager.failJob(jobId, errorMsg);
          resolve({ success: false, error: errorMsg });
        }
      });

      claude.on('error', (err) => {
        jobManager.failJob(jobId, err.message);
        resolve({ success: false, error: err.message });
      });
    });
  }

  // Legacy sync method (kept for backward compatibility)
  async runClaude(visitorId, projectId, userMessage, onProgress) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const { prompt, detectedSkills } = this.buildPrompt(visitorId, projectId, userMessage);

    if (detectedSkills.length > 0) {
      console.log('Detected skills:', detectedSkills.join(', '));
      onProgress({ type: 'info', message: `使用スキル: ${detectedSkills.join(', ')}` });
    }

    return new Promise((resolve, reject) => {
      onProgress({ type: 'status', message: 'Claude Codeを実行中...' });

      console.log('Running Claude in:', projectDir);
      console.log('Prompt length:', prompt.length);

      const claude = spawn('claude', [
        '--model', 'opus',
        '--verbose',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectDir,
        env: { ...process.env, PATH: process.env.PATH },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      let errorOutput = '';
      let buffer = '';

      claude.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            let event = json;

            if (json.type === 'stream_event' && json.event) {
              event = json.event;
              if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                console.log('  Tool:', event.content_block.name);
                onProgress({ type: 'stream', content: `\n[${event.content_block.name}]\n` });
              }
            }

            if (event.type === 'assistant' && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === 'text' && block.text) {
                  onProgress({ type: 'stream', content: block.text });
                } else if (block.type === 'tool_use') {
                  const toolName = block.name || 'unknown';
                  onProgress({ type: 'stream', content: `\n[${toolName}]\n` });
                }
              }
            } else if (event.type === 'content_block_delta' && event.delta) {
              if (event.delta.type === 'text_delta' && event.delta.text) {
                onProgress({ type: 'stream', content: event.delta.text });
              } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
                onProgress({ type: 'stream', content: event.delta.partial_json });
              }
            } else if (event.type === 'content_block_start' && event.content_block) {
              if (event.content_block.type === 'text' && event.content_block.text) {
                onProgress({ type: 'stream', content: event.content_block.text });
              } else if (event.content_block.type === 'tool_use') {
                onProgress({ type: 'stream', content: `\n[${event.content_block.name || 'tool'}]\n` });
              }
            } else if (event.type === 'result' && event.result) {
              output = event.result;
            } else if (json.type === 'result' && json.result) {
              output = json.result;
            }
          } catch (e) {
            onProgress({ type: 'stream', content: line });
          }
        }
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log('Claude stderr:', data.toString());
      });

      claude.on('close', (code) => {
        console.log('Claude exited with code:', code);

        const processKey = `${visitorId}-${projectId}`;
        this.runningProcesses.delete(processKey);

        if (code === 0) {
          const currentHtml = userManager.readProjectFile(visitorId, projectId, 'index.html');

          const htmlMatch = output.match(/```html\n([\s\S]*?)```/);
          if (htmlMatch) {
            userManager.writeProjectFile(visitorId, projectId, 'index.html', htmlMatch[1]);
          }

          const responseMsg = output.trim() || 'ゲームを更新しました';
          onProgress({ type: 'complete', message: responseMsg });
          resolve({ success: true, output: currentHtml });
        } else {
          const errorMsg = errorOutput || output || 'Unknown error';
          onProgress({ type: 'error', message: `エラーが発生しました: ${errorMsg}` });
          reject(new Error(errorMsg));
        }
      });

      claude.on('error', (err) => {
        onProgress({ type: 'error', message: `プロセスエラー: ${err.message}` });
        reject(err);
      });

      this.runningProcesses.set(`${visitorId}-${projectId}`, claude);
    });
  }

  cancelRun(processKey) {
    const process = this.runningProcesses.get(processKey);
    if (process) {
      process.kill();
      this.runningProcesses.delete(processKey);
      return true;
    }
    return false;
  }

  cancelJob(jobId) {
    return jobManager.cancelJob(jobId);
  }
}

module.exports = {
  claudeRunner: new ClaudeRunner(),
  jobManager
};
