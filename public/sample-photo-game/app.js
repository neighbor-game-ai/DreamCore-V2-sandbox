/**
 * Photo Game Creator - Sample App
 * 写真をアップロードしてゲームを作るフローのプロトタイプ
 */

class PhotoGameCreator {
  constructor() {
    // State
    this.originalImage = null;      // アップロードされた元画像
    this.processedImage = null;     // 処理後の画像
    this.cropMode = null;           // 'full' | 'face'
    this.gameType = null;           // 'shooting' | 'action' | 'puzzle' | 'custom'
    this.customRequest = '';        // カスタムリクエスト
    this.faceApiLoaded = false;     // face-api.js モデル読み込み済みフラグ

    // DOM Elements
    this.uploadArea = document.getElementById('uploadArea');
    this.fileInput = document.getElementById('fileInput');
    this.previewContainer = document.getElementById('previewContainer');
    this.previewImage = document.getElementById('previewImage');
    this.changePhotoBtn = document.getElementById('changePhotoBtn');

    this.stepUpload = document.getElementById('step-upload');
    this.stepCrop = document.getElementById('step-crop');
    this.stepGame = document.getElementById('step-game');
    this.stepResult = document.getElementById('step-result');

    this.processingStatus = document.getElementById('processingStatus');
    this.processingText = document.getElementById('processingText');
    this.processedPreview = document.getElementById('processedPreview');
    this.originalThumb = document.getElementById('originalThumb');
    this.processedThumb = document.getElementById('processedThumb');
    this.confirmCropBtn = document.getElementById('confirmCropBtn');
    this.retryCropBtn = document.getElementById('retryCropBtn');

    this.customInput = document.getElementById('customInput');
    this.customRequestTextarea = document.getElementById('customRequest');

    this.resultImage = document.getElementById('resultImage');
    this.resultCropMode = document.getElementById('resultCropMode');
    this.resultGameType = document.getElementById('resultGameType');
    this.generatedPrompt = document.getElementById('generatedPrompt');
    this.createGameBtn = document.getElementById('createGameBtn');
    this.startOverBtn = document.getElementById('startOverBtn');

    this.init();
  }

  init() {
    // Upload handlers
    this.uploadArea.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.changePhotoBtn.addEventListener('click', () => this.resetToUpload());

    // Drag & drop
    this.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadArea.classList.add('dragover');
    });
    this.uploadArea.addEventListener('dragleave', () => {
      this.uploadArea.classList.remove('dragover');
    });
    this.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        this.loadImage(file);
      }
    });

    // Crop option handlers
    document.querySelectorAll('.crop-option').forEach(btn => {
      btn.addEventListener('click', () => this.selectCropMode(btn.dataset.mode));
    });

    this.confirmCropBtn.addEventListener('click', () => this.confirmCrop());
    this.retryCropBtn.addEventListener('click', () => this.retryCrop());

    // Game option handlers
    document.querySelectorAll('.game-option').forEach(btn => {
      btn.addEventListener('click', () => this.selectGameType(btn.dataset.type));
    });

    this.customRequestTextarea.addEventListener('input', (e) => {
      this.customRequest = e.target.value;
    });

    // Result handlers
    this.createGameBtn.addEventListener('click', () => this.createGame());
    this.startOverBtn.addEventListener('click', () => this.startOver());

    // Preload face-api models
    this.preloadFaceApiModels();
  }

  async preloadFaceApiModels() {
    // Wait for face-api.js to load
    if (typeof faceapi === 'undefined') {
      console.log('Waiting for face-api.js to load...');
      await this.waitForFaceApi();
    }

    try {
      console.log('Loading face-api.js models...');
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
      ]);

      this.faceApiLoaded = true;
      console.log('Face-api.js models loaded successfully');
    } catch (error) {
      console.error('Failed to load face-api.js models:', error);
    }
  }

  waitForFaceApi() {
    return new Promise((resolve) => {
      const check = () => {
        if (typeof faceapi !== 'undefined') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      this.loadImage(file);
    }
  }

  loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.originalImage = e.target.result;
      this.previewImage.src = this.originalImage;
      this.uploadArea.classList.add('hidden');
      this.previewContainer.classList.remove('hidden');

      // Show crop step
      this.stepCrop.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  resetToUpload() {
    this.originalImage = null;
    this.processedImage = null;
    this.fileInput.value = '';
    this.uploadArea.classList.remove('hidden');
    this.previewContainer.classList.add('hidden');
    this.stepCrop.classList.add('hidden');
    this.processingStatus.classList.add('hidden');
    this.processedPreview.classList.add('hidden');

    // Reset crop selection
    document.querySelectorAll('.crop-option').forEach(btn => {
      btn.classList.remove('selected');
    });
  }

  async selectCropMode(mode) {
    this.cropMode = mode;

    // Update UI
    document.querySelectorAll('.crop-option').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.mode === mode);
    });

    // Start processing
    await this.processImage(mode);
  }

  async processImage(mode) {
    this.processingStatus.classList.remove('hidden');
    this.processedPreview.classList.add('hidden');

    try {
      if (mode === 'full') {
        this.processingText.textContent = '背景を除去中...';
        this.processedImage = await this.removeBackground(this.originalImage);
      } else if (mode === 'face') {
        this.processingText.textContent = '顔を検出中...';
        this.processedImage = await this.detectAndCropFace(this.originalImage);
      }

      // Show result
      this.originalThumb.src = this.originalImage;
      this.processedThumb.src = this.processedImage;
      this.processingStatus.classList.add('hidden');
      this.processedPreview.classList.remove('hidden');

    } catch (error) {
      console.error('Processing error:', error);
      this.processingText.textContent = 'エラー: ' + error.message;
    }
  }

  async removeBackground(imageDataUrl) {
    // TODO: BRIA RMBG API を呼び出す
    // 現在はモック実装（元画像をそのまま返す）
    console.log('Background removal - mock implementation');
    console.log('実際の実装では /api/remove-background を呼び出します');

    // モック: 少し待ってから元画像を返す
    await this.sleep(1500);
    return imageDataUrl;
  }

  async detectAndCropFace(imageDataUrl) {
    // Ensure face-api is loaded
    if (!this.faceApiLoaded) {
      this.processingText.textContent = 'モデルを読み込み中...';
      await this.preloadFaceApiModels();

      if (!this.faceApiLoaded) {
        throw new Error('顔検出モデルの読み込みに失敗しました');
      }
    }

    // Create image element
    const img = await this.createImageElement(imageDataUrl);

    this.processingText.textContent = '顔を検出中...';

    // Detect face
    const detection = await faceapi.detectSingleFace(
      img,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 })
    ).withFaceLandmarks(true);

    if (!detection) {
      throw new Error('顔が検出できませんでした。別の写真を試してください。');
    }

    console.log('Face detected:', detection.detection.box);

    // Crop face with padding
    const box = detection.detection.box;
    const padding = Math.max(box.width, box.height) * 0.5; // 50% padding for context

    const cropX = Math.max(0, box.x - padding);
    const cropY = Math.max(0, box.y - padding);
    const cropWidth = Math.min(img.width - cropX, box.width + padding * 2);
    const cropHeight = Math.min(img.height - cropY, box.height + padding * 2);

    // Make it square (use the larger dimension)
    const size = Math.max(cropWidth, cropHeight);
    const centerX = cropX + cropWidth / 2;
    const centerY = cropY + cropHeight / 2;
    const squareX = Math.max(0, centerX - size / 2);
    const squareY = Math.max(0, centerY - size / 2);
    const squareSize = Math.min(
      size,
      img.width - squareX,
      img.height - squareY
    );

    // Create canvas and crop
    const canvas = document.createElement('canvas');
    const outputSize = 256; // Output size for game sprite
    canvas.width = outputSize;
    canvas.height = outputSize;

    const ctx = canvas.getContext('2d');

    // Draw cropped face
    ctx.drawImage(
      img,
      squareX, squareY, squareSize, squareSize, // Source
      0, 0, outputSize, outputSize              // Destination
    );

    // Optional: Make it circular with transparent background
    const circularCanvas = this.makeCircular(canvas);

    return circularCanvas.toDataURL('image/png');
  }

  makeCircular(sourceCanvas) {
    const canvas = document.createElement('canvas');
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext('2d');

    // Create circular clip
    ctx.beginPath();
    ctx.arc(
      canvas.width / 2,
      canvas.height / 2,
      canvas.width / 2,
      0,
      Math.PI * 2
    );
    ctx.closePath();
    ctx.clip();

    // Draw the image
    ctx.drawImage(sourceCanvas, 0, 0);

    return canvas;
  }

  createImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  confirmCrop() {
    // Show game type selection
    this.stepGame.classList.remove('hidden');

    // Scroll to game step
    this.stepGame.scrollIntoView({ behavior: 'smooth' });
  }

  retryCrop() {
    this.processedPreview.classList.add('hidden');
    document.querySelectorAll('.crop-option').forEach(btn => {
      btn.classList.remove('selected');
    });
    this.cropMode = null;
    this.processedImage = null;
  }

  selectGameType(type) {
    this.gameType = type;

    // Update UI
    document.querySelectorAll('.game-option').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === type);
    });

    // Show/hide custom input
    if (type === 'custom') {
      this.customInput.classList.remove('hidden');
      this.customRequestTextarea.focus();
    } else {
      this.customInput.classList.add('hidden');
      // Auto proceed to result
      this.showResult();
    }
  }

  showResult() {
    // Update result summary
    this.resultImage.src = this.processedImage;
    this.resultCropMode.textContent = this.cropMode === 'full' ? '人物全体' : '顔だけ';
    this.resultGameType.textContent = this.getGameTypeLabel();

    // Generate prompt
    const prompt = this.generatePrompt();
    this.generatedPrompt.textContent = prompt;

    // Show result step
    this.stepResult.classList.remove('hidden');
    this.stepResult.scrollIntoView({ behavior: 'smooth' });
  }

  getGameTypeLabel() {
    const labels = {
      shooting: 'シューティング',
      action: 'アクション',
      puzzle: 'パズル',
      custom: 'その他: ' + (this.customRequest || '未入力')
    };
    return labels[this.gameType] || this.gameType;
  }

  generatePrompt() {
    const cropDescription = this.cropMode === 'full'
      ? 'アップロードされた人物画像（背景除去済み）'
      : 'アップロードされた顔画像（丸く切り取り済み）';

    const gameDescriptions = {
      shooting: '敵を撃って倒すシューティングゲーム',
      action: 'ジャンプして障害物を避けるアクションゲーム',
      puzzle: '頭を使って解くパズルゲーム',
      custom: this.customRequest || 'カスタムゲーム'
    };

    const gameDescription = gameDescriptions[this.gameType];

    return `以下の条件でゲームを作成してください：

【使用画像】
${cropDescription}をプレイヤーキャラクターとして使用

【ゲームタイプ】
${gameDescription}

【要件】
- アップロードされた画像をプレイヤーキャラクターのスプライトとして使用
- スマートフォンで遊べるタッチ操作対応
- シンプルで楽しいゲーム性

【添付画像】
[player.png として添付]`;
  }

  createGame() {
    // TODO: 実際のゲーム作成処理
    alert('ゲーム作成機能は DreamCore 本体に統合後に実装されます。\n\n生成されるプロンプトを確認してください。');
    console.log('Creating game with:', {
      originalImage: this.originalImage ? 'set' : 'not set',
      processedImage: this.processedImage ? 'set' : 'not set',
      cropMode: this.cropMode,
      gameType: this.gameType,
      customRequest: this.customRequest,
      prompt: this.generatePrompt()
    });
  }

  startOver() {
    // Reset all state
    this.originalImage = null;
    this.processedImage = null;
    this.cropMode = null;
    this.gameType = null;
    this.customRequest = '';

    // Reset UI
    this.fileInput.value = '';
    this.uploadArea.classList.remove('hidden');
    this.previewContainer.classList.add('hidden');
    this.stepCrop.classList.add('hidden');
    this.stepGame.classList.add('hidden');
    this.stepResult.classList.add('hidden');
    this.processingStatus.classList.add('hidden');
    this.processedPreview.classList.add('hidden');
    this.customInput.classList.add('hidden');
    this.customRequestTextarea.value = '';

    // Reset selections
    document.querySelectorAll('.crop-option, .game-option').forEach(btn => {
      btn.classList.remove('selected');
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PhotoGameCreator();
});
