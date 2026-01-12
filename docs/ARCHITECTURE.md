# GameCreatorMVP-v2 アーキテクチャ

チャットベースでブラウザゲームを生成するAIプラットフォーム。

## システム概要図

```
┌─────────────────────────────────────────────────────────┐
│ CLIENT (Browser SPA)                                    │
│  ├─ index.html / app.js                                │
│  ├─ WebSocket接続 (リアルタイム通信)                    │
│  └─ Game iframe (生成されたゲームのプレビュー)          │
└──────────────────────┬──────────────────────────────────┘
                       │ JSON messages
                       ▼
┌─────────────────────────────────────────────────────────┐
│ SERVER (Node.js + Express)                              │
│  ├─ WebSocket Handler    ← チャット、ジョブ更新         │
│  ├─ REST API             ← 画像生成、アセット管理       │
│  ├─ Game File Serving    ← /game/:visitorId/:projectId/ │
│  │                                                       │
│  ├─ claudeRunner.js      ← Claude CLI + Gemini実行      │
│  ├─ userManager.js       ← ユーザー・プロジェクト管理   │
│  ├─ jobManager.js        ← 非同期ジョブキュー           │
│  └─ database.js          ← SQLite永続化                 │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ File System  │ │ .claude/     │ │ External API │
│  users/      │ │  skills/     │ │  Gemini      │
│  assets/     │ │  SYSTEM_*    │ │  (画像生成)  │
│  data/       │ └──────────────┘ └──────────────┘
└──────────────┘
```

## ディレクトリ構成

```
GameCreatorMVP-v2/
├── public/                   # フロントエンド
│   ├── index.html            # SPA テンプレート
│   ├── app.js                # クライアントアプリ (GameCreatorApp)
│   └── style.css             # グローバルスタイル
│
├── server/                   # バックエンド
│   ├── index.js              # Express + WebSocket サーバー
│   ├── claudeRunner.js       # Claude CLI / Gemini 実行エンジン
│   ├── database.js           # SQLite スキーマ・クエリ
│   ├── userManager.js        # ユーザー・プロジェクト・Git管理
│   ├── jobManager.js         # 非同期ジョブキュー
│   ├── geminiClient.js       # Gemini API (画像生成)
│   ├── stylePresets.js       # ビジュアルスタイル定義
│   ├── styleImageCache.js    # スタイルプレビュー画像キャッシュ
│   │
│   ├── prompts/              # プロンプトテンプレート
│   │   ├── baseRules.js      # KAWAIIデザイン・コーディング規約
│   │   ├── createPrompt.js   # 新規ゲーム作成用プロンプト
│   │   ├── updatePrompt.js   # ゲーム更新用プロンプト
│   │   └── planPrompt.js     # インテント検出用
│   │
│   └── analyzer/             # ゲーム解析モジュール
│       ├── gameTypeAnalyzer.js  # 2D/3D 自動検出
│       └── skillSelector.js     # スキル自動選択
│
├── .claude/                  # Claude Code CLI 設定
│   ├── SYSTEM_PROMPT.md      # マスターシステムプロンプト
│   └── skills/               # 30+ 再利用可能スキル
│       ├── p5js-*/           # 2D (P5.js) 関連
│       ├── threejs-*/        # 3D (Three.js) 関連
│       ├── kawaii-*/         # KAWAIIデザインシステム
│       └── ...
│
├── users/                    # ユーザーゲームプロジェクト
│   ├── .git/                 # アクティビティログ (メインリポジトリ)
│   └── {visitorId}/
│       └── {projectId}/
│           ├── .git/         # プロジェクト別バージョン管理
│           ├── index.html    # ゲームコード
│           ├── specs/        # 仕様書 (game.md, mechanics.md)
│           └── assets/       # 生成画像
│
├── data/                     # ランタイムデータ
│   └── gamecreator.db        # SQLite データベース
│
└── deploy/                   # デプロイ設定
    ├── ecosystem.config.js   # PM2 設定
    └── nginx.conf            # Nginx リバースプロキシ
```

## コアモジュール

### 1. claudeRunner.js - AI ゲーム生成エンジン

**責務:** Claude CLI と Gemini Flash 2.0 を使ったコード生成のオーケストレーション

```javascript
// 主要関数
runClaudeAsJob(visitorId, projectId, userMessage, debugOptions)
clearClaudeCache()           // プロジェクト間データ漏洩防止
collectSkillMetadata()       // 利用可能スキルの収集
detectIntent(message)        // インテント分類 (chat/edit/restore)
```

**スキル統合フロー:**
1. `gameTypeAnalyzer` で 2D/3D を判定
2. `skillSelector` で適切なスキルを選択
3. Claude CLI 実行時にスキルをシステムプロンプトに含める

### 2. userManager.js - ユーザー・プロジェクト管理

**責務:** ファイルシステム操作、Git バージョン管理、プロジェクトデータ

```javascript
// 主要関数
getOrCreateUser(visitorId)
createProject(userId, name) / deleteProject() / renameProject()
getProjectDir(visitorId, projectId)  // パス解決
ensureProjectDir(visitorId, projectId)  // Git初期化
getConversationHistory(projectId)
readProjectFile() / writeProjectFile()
createVersionSnapshot(message)  // Git コミット
```

**Git 戦略:**
- メインリポジトリ: `users/.git/` (全体アクティビティログ)
- プロジェクト別: `users/{visitorId}/{projectId}/.git/` (バージョン履歴)

### 3. jobManager.js - 非同期ジョブキュー

**責務:** 長時間実行タスクのトラッキング

```
Job状態: pending → processing → completed/failed/cancelled
```

```javascript
createJob(userId, projectId)
updateProgress(jobId, progress, message)
completeJob(jobId, result) / failJob(jobId, error)
subscribeToJob(jobId, callback)  // リアルタイム通知
```

### 4. database.js - SQLite データベース

**テーブル構成:**
- `users` - 訪問者識別
- `projects` - ゲームプロジェクト
- `chat_history` - 会話ログ
- `assets` - アップロード/生成画像
- `jobs` - 非同期処理キュー

### 5. analyzer/ - ゲーム解析

**gameTypeAnalyzer.js:**
- キーワードスコアリングで 2D/3D を判定
- 3D キーワード: 3d, three.js, fps, モデル (重み: 5)
- 2D キーワード: p5, canvas, shooter (重み: 1)

**skillSelector.js:**
- gameType + genre に基づきスキルを選択
- 2D: p5js-setup, p5js-input, visual-polish-2d
- 3D: threejs-setup, threejs-input, kawaii-3d

## 通信パターン

### WebSocket メッセージ (リアルタイム)

**Client → Server:**
| メッセージ | 用途 |
|-----------|------|
| `init` | 訪問者登録、プロジェクト一覧取得 |
| `createProject` | 新規プロジェクト作成 |
| `selectProject` | プロジェクト選択、履歴読み込み |
| `message` | ユーザー入力 (ゲーム生成/更新) |
| `subscribeJob` | ジョブ進捗購読 |

**Server → Client:**
| メッセージ | 用途 |
|-----------|------|
| `jobStarted` | ジョブ開始通知 |
| `jobUpdate` | 進捗更新 (progress, message) |
| `stream` | Claude出力のストリーミング |
| `gameUpdated` | ゲーム生成完了 |
| `styleOptions` | スタイル選択UI表示 |

### REST API

| エンドポイント | 用途 |
|---------------|------|
| `POST /api/generate-image` | Gemini 画像生成 |
| `POST /api/assets/upload` | ファイルアップロード |
| `GET /api/assets` | アセット一覧 |
| `GET /api/jobs/:jobId` | ジョブ状態取得 |
| `GET /game/:visitorId/:projectId/*` | ゲームファイル配信 |

## スキルシステム

### スキル構造

```
.claude/skills/{skill-name}/
├── SKILL.md      # フロントマター + ドキュメント
├── CODE.md       # (オプション) コードスニペット
└── SPEC.md       # (オプション) 詳細仕様
```

### スキルカテゴリ

| カテゴリ | スキル |
|---------|--------|
| 2D フレームワーク | p5js-setup, p5js-input, p5js-collision |
| 3D フレームワーク | threejs-setup, threejs-input, threejs-lighting, threejs-water |
| ビジュアル | kawaii-colors, kawaii-3d, kawaii-ui, visual-polish-2d/3d |
| アニメーション | tween-animation, particles-* |
| オーディオ | game-audio, audio-synth |
| AI | game-ai (Yuka.js) |
| 画像生成 | image-generation, nanobanana |

### スキル読み込みフロー

```
1. claudeRunner.collectSkillMetadata()
   └─ .claude/skills/*/SKILL.md をスキャン

2. analyzer で gameType (2D/3D) + genre を判定

3. skillSelector で必要なスキルを選択

4. Claude CLI 実行時にスキル内容をコンテキストに含める
```

## ゲーム生成フロー詳細

### プロンプト構造

システムには複数のプロンプトソースがあり、用途に応じて組み合わせられる:

```
┌─────────────────────────────────────────────────────────────┐
│ .claude/SYSTEM_PROMPT.md                                    │
│   └─ Claude CLI 用マスタープロンプト                        │
│      (viewport, タッチ入力, パフォーマンス, UIパターン等)   │
└─────────────────────────────────────────────────────────────┘
                            ↓ 参照
┌─────────────────────────────────────────────────────────────┐
│ server/prompts/baseRules.js                                 │
│   └─ getBaseRules() で以下を結合:                           │
│      • designStyle (KAWAIIデザイン規約)                     │
│      • codingRules (HTML5/CSS/JS, CDN)                      │
│      • gameDesignRules (操作, フィードバック)               │
│      • touchControlRules (仮想ジョイスティック)             │
│      • cameraSystemRules (Yaw/Pitch カメラ)                 │
│      • movementRules (カメラ相対移動)                       │
│      • audioRules (BGM, 効果音)                             │
│      • resultScreenRules (GSAP リザルト画面)                │
│      • prohibitions (禁止事項)                              │
└─────────────────────────────────────────────────────────────┘
                            ↓ 組み込み
┌─────────────────────────────────────────────────────────────┐
│ createPrompt.js / updatePrompt.js                           │
│   └─ getSystemPrompt() = baseRules + 出力形式 + モード判定  │
└─────────────────────────────────────────────────────────────┘
```

### 新規作成フロー (Create)

```
User Message: "かわいい猫のシューティングゲームを作って"
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. processJob() 開始                                        │
│    └─ claudeRunner.js:1128                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. インテント判定 (Claude CLI Haiku)                        │
│    └─ detectIntent(): chat / edit / restore                 │
│    └─ restore なら即座に確認ダイアログを返す                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Gemini 生成試行 (tryGeminiGeneration)                    │
│    ├─ 新規プロジェクト判定 (Welcome page チェック)          │
│    ├─ Claude CLI キャッシュクリア (データ漏洩防止)          │
│    └─ 2D/3D 判定 (detectDimension)                          │
│        ├─ 明示的 "2D"/"3D" → 即決定                         │
│        └─ 不明 → "unclear" → ユーザーに確認                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. スキル選択 (detectSkillsWithAI)                          │
│    ├─ スキルリスト構築 (collectSkillMetadata)               │
│    ├─ Claude CLI Haiku でスキル選択                         │
│    │   Input: ユーザーメッセージ + コンテキスト             │
│    │   Output: ["p5js-setup", "kawaii-colors", ...]         │
│    └─ フォールバック: dimension ベースの選択                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. スキル内容読み込み (getSkillContentForGemini)            │
│    ├─ 優先順位でソート (kawaii-colors → setup → others)    │
│    ├─ 最大10スキル選択                                      │
│    └─ SKILL.md 内容を結合 (最大15000文字)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Gemini API 呼び出し (geminiClient.generateCode)          │
│                                                             │
│    System Prompt (createPrompt.getSystemPrompt):            │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ あなたはスマートフォン向けブラウザゲーム開発の専門家  │  │
│    │                                                     │  │
│    │ ${baseRules.getBaseRules()}                         │  │
│    │                                                     │  │
│    │ [出力形式] JSON: mode, files, images, summary       │  │
│    │ [画像生成について - 2Dゲームのみ]                   │  │
│    └─────────────────────────────────────────────────────┘  │
│                                                             │
│    User Message:                                            │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ [プロジェクト名: xxx]                               │  │
│    │ [ゲームタイプ: 2D]                                  │  │
│    │ [自動判定: 2Dゲーム (確信度: 85%)]                  │  │
│    │                                                     │  │
│    │ かわいい猫のシューティングゲームを作って            │  │
│    │                                                     │  │
│    │ [必須ガイドライン - 以下を必ず適用すること]         │  │
│    │ ## p5js-setup                                       │  │
│    │ (スキル内容...)                                     │  │
│    │ ## kawaii-colors                                    │  │
│    │ (スキル内容...)                                     │  │
│    └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. レスポンス処理                                           │
│    ├─ mode: "chat" → 会話応答を返す                        │
│    ├─ mode: "create" → ファイル書き込み                    │
│    └─ mode: "restore" → 確認ダイアログ                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. ファイル適用 (applyGeminiResult)                         │
│    ├─ 画像生成 (2Dのみ, images配列がある場合)              │
│    │   └─ analyzeImageDirection() で向き決定               │
│    │   └─ geminiClient.generateImage()                     │
│    ├─ ファイル書き込み (index.html等)                      │
│    └─ Git コミット (createVersionSnapshot)                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. 仕様書作成 (createInitialSpecFromCode) [非同期]          │
│    └─ Gemini で生成コードを分析                            │
│    └─ specs/game.md, mechanics.md, progress.md 作成        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. 完了通知                                                │
│     ├─ jobManager.completeJob()                            │
│     ├─ WebSocket: gameUpdated                              │
│     └─ クライアント: iframe 更新                           │
└─────────────────────────────────────────────────────────────┘
```

### アップデートフロー (Update)

```
User Message: "敵の動きをもっと速くして"
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. processJob() 開始                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. インテント判定 (Claude CLI Haiku)                        │
│    └─ "速くして" → edit                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Gemini 生成試行 (tryGeminiGeneration)                    │
│    ├─ 既存コード読み込み (index.html等)                    │
│    ├─ 既存仕様書読み込み (specs/*.md)                      │
│    ├─ フレームワーク検出 (detectFrameworkFromCode)         │
│    │   └─ Three.js / P5.js / unknown                       │
│    └─ スキル選択 (フレームワークに基づく)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Gemini API 呼び出し (geminiClient.generateCode)          │
│                                                             │
│    System Prompt (updatePrompt.getSystemPrompt):            │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ あなたはスマートフォン向けブラウザゲーム開発の専門家  │  │
│    │                                                     │  │
│    │ ${baseRules.getBaseRules()}                         │  │
│    │                                                     │  │
│    │ [最重要：ユーザー意図の判断]                        │  │
│    │ ■ chat モード（質問・確認・相談）                   │  │
│    │ ■ edit モード（修正依頼）                           │  │
│    │ ■ restore モード（元に戻す）                        │  │
│    │                                                     │  │
│    │ [出力形式]                                          │  │
│    │ ● chatモード: { mode, message, suggestions }        │  │
│    │ ● editモード: { mode, edits[], images[], summary }  │  │
│    │ ● restoreモード: { mode, message, confirmLabel }    │  │
│    │                                                     │  │
│    │ [最重要：既存仕様の維持]                            │  │
│    │ - 依頼された内容のみ変更する                        │  │
│    └─────────────────────────────────────────────────────┘  │
│                                                             │
│    User Message:                                            │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ [現在のゲーム仕様 - これを維持すること]             │  │
│    │ (specs/*.md の内容)                                 │  │
│    │                                                     │  │
│    │ [現在のコード]                                      │  │
│    │ (index.html の内容)                                 │  │
│    │                                                     │  │
│    │ [修正依頼]                                          │  │
│    │ 敵の動きをもっと速くして                            │  │
│    │                                                     │  │
│    │ [必須ガイドライン]                                  │  │
│    │ (選択されたスキル内容)                              │  │
│    └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. レスポンス処理                                           │
│    ├─ mode: "chat" → 会話応答のみ                          │
│    ├─ mode: "edit" → 差分適用                              │
│    │   edits: [                                            │
│    │     { path, old_string, new_string }                  │
│    │   ]                                                   │
│    └─ mode: "restore" → 確認ダイアログ                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. 差分適用 (applyGeminiResult)                             │
│    ├─ 各 edit の old_string を new_string に置換           │
│    ├─ 画像生成 (2Dのみ, images配列がある場合)              │
│    └─ Git コミット                                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. 仕様書更新 (updateSpec) [非同期]                         │
│    ├─ detectRelevantSpecs() で更新対象を判定               │
│    │   └─ 「敵の動き」→ ["mechanics", "progress"]         │
│    └─ 該当する specs/*.md のみ更新                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. 完了通知                                                 │
└─────────────────────────────────────────────────────────────┘
```

### Claude CLI フォールバック

Gemini が失敗した場合、Claude CLI (Opus) にフォールバック:

```
┌─────────────────────────────────────────────────────────────┐
│ Claude CLI 実行                                             │
│                                                             │
│ spawn('claude', [                                           │
│   '--model', 'opus',                                        │
│   '--verbose',                                              │
│   '--output-format', 'stream-json',                         │
│   '--dangerously-skip-permissions'                          │
│ ], { cwd: projectDir })                                     │
│                                                             │
│ stdin に書き込むプロンプト:                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ スマートフォン向けブラウザゲームを作成してください。    │ │
│ │                                                         │ │
│ │ 作業ディレクトリ: /path/to/project                      │ │
│ │                                                         │ │
│ │ [必須] 以下のスキルファイルを読んで適用:                │ │
│ │ - .claude/skills/p5js-setup/SKILL.md                    │ │
│ │ - .claude/skills/kawaii-colors/SKILL.md                 │ │
│ │                                                         │ │
│ │ ユーザーの指示: かわいい猫のシューティングゲームを作って │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ※ Claude CLI は .claude/skills/ を自動で参照可能           │
│ ※ SYSTEM_PROMPT.md も自動で読み込まれる                    │
└─────────────────────────────────────────────────────────────┘
```

### モード別出力形式

| モード | 出力形式 | 用途 |
|--------|----------|------|
| `create` | `{ mode, files[], images[], summary }` | 新規ゲーム作成 |
| `edit` | `{ mode, edits[], images[], summary }` | 既存ゲーム修正 |
| `chat` | `{ mode, message, suggestions[] }` | 質問への回答 |
| `restore` | `{ mode, message, confirmLabel, cancelLabel }` | バージョン戻し確認 |

### スキルの組み込み位置

```
新規作成 (createPrompt):
├─ System Prompt: baseRules (デザイン、コーディング規約)
└─ User Message: スキル内容 (「必須ガイドライン」として)

アップデート (updatePrompt):
├─ System Prompt: baseRules + モード判定ルール
├─ User Message: 既存コード + 仕様書 + スキル内容
└─ ※ スキルは「必須ガイドライン」としてユーザーメッセージに含める
```

## デザインシステム (KAWAII)

### ビジュアルスタイル

- **コンセプト:** ゆめかわいい (日本のKAWAII文化)
- **カラー:** パステル + ネオンアクセント
  - 背景: Lavender Blush (#FFF0F5)
  - プライマリ: Hot Pink (#FF69B4), Pastel Purple (#9370DB)
- **形状:** 丸みのある形 (球、カプセル、角丸長方形)
- **マテリアル:** トゥーンシェーディング、ソフトシャドウ
- **カメラ:** 正投影 (3D) - ミニチュア感

### スタイルプリセット (stylePresets.js)

```
stylePresets[dimension][genre][styleId]
```

- **2D:** kawaii, retro, neon, minimal
- **3D:** kawaii, lowpoly, toon, realistic

## エラーハンドリング

### クライアントサイドエラー検出

生成されたゲームHTMLに注入されるスクリプト:

```javascript
window.onerror                    // JavaScript エラー
window.onunhandledrejection       // Promise 拒否
console.error override            // console.error 呼び出し
```

### エラーレポートフロー

```
1. ゲーム iframe でエラー発生
2. window.parent.postMessage({ type: 'gameError', errors: [...] })
3. クライアントがエラーパネルに表示
4. "Auto Fix" ボタン → Claude にエラー情報を送信
5. Claude が問題箇所を再生成
```

## モバイルファースト設計

- **Viewport:** `width=device-width, maximum-scale=1.0, user-scalable=no`
- **タッチ入力:** 仮想ジョイスティック (identifier トラッキング)
- **Safe Area:** `env(safe-area-inset-*)` でノッチ対応
- **画面:** ポートレート専用、`100dvh` (動的ビューポート高さ)
- **パフォーマンス:** 60 FPS ターゲット

## 主要ファイルパス

| ファイル | 役割 |
|---------|------|
| `server/index.js` | メインサーバー |
| `server/claudeRunner.js` | ゲーム生成エンジン |
| `server/userManager.js` | ユーザー・プロジェクト管理 |
| `server/jobManager.js` | ジョブキュー |
| `server/database.js` | DB スキーマ |
| `server/prompts/baseRules.js` | デザイン規約 |
| `server/analyzer/gameTypeAnalyzer.js` | 2D/3D 判定 |
| `public/app.js` | クライアントアプリ |
| `.claude/SYSTEM_PROMPT.md` | マスタープロンプト |
| `.claude/skills/` | スキル定義 (30+) |
