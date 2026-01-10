# Game Creator MVP - 仕様書

## プロジェクト概要

ブラウザゲーム作成プラットフォームのMVP（Minimum Viable Product）。
ユーザーがチャット形式で指示を送ると、サーバーサイドで Claude Code CLI または Gemini Flash 2.0 が自動的にゲームコードを生成・更新します。

### 主な特徴
- チャットベースのゲーム作成インターフェース
- リアルタイムプレビュー
- AI による Skills 自動選択（ユーザーは意識不要）
- Git ベースのバージョン管理
- 複数プロジェクト管理
- 2D/3D ゲーム対応（自動判定 or ユーザー選択）
- AI 画像生成機能（Gemini Nano Banana）
- SQLite データベースによるデータ管理

---

## システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│  クライアント（ブラウザ）                                         │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │    チャット UI       │  │      ゲームプレビュー (iframe)    │   │
│  │  - メッセージ入力    │  │      /game/{userId}/{projectId}  │   │
│  │  - 履歴表示         │  │                                  │   │
│  │  - ストリーミング表示 │  │                                  │   │
│  │  - 画像生成ボタン    │  │                                  │   │
│  └─────────────────────┘  └─────────────────────────────────┘   │
│            │ WebSocket                    │ HTTP                │
└────────────┼──────────────────────────────┼─────────────────────┘
             │                              │
             ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  サーバー (Node.js + Express)              Port: 3000            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  index.js                                                   ││
│  │  - WebSocket サーバー                                        ││
│  │  - 静的ファイル配信                                          ││
│  │  - ゲームファイル配信 (/game/:visitorId/:projectId/*)        ││
│  │  - 画像生成 API                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│            │                              │                     │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐│
│  │   claudeRunner.js   │    │       userManager.js            ││
│  │  - Claude CLI 実行   │    │  - ユーザー管理                  ││
│  │  - Gemini Flash 2.0 │    │  - プロジェクト管理               ││
│  │  - Skills 自動選択   │    │  - Git バージョン管理            ││
│  │  - 2D/3D 判定        │    │                                 ││
│  │  - Spec 管理         │    │                                 ││
│  └──────────┬──────────┘    └─────────────────────────────────┘│
│             │                              │                     │
│  ┌──────────┴──────────┐    ┌─────────────────────────────────┐│
│  │  geminiClient.js    │    │       database.js               ││
│  │  - Gemini API       │    │  - SQLite 管理                   ││
│  │  - 画像生成          │    │  - チャット履歴                  ││
│  └─────────────────────┘    │  - プロジェクト情報              ││
│                              └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  ファイルシステム                                                │
│  users/                                                         │
│  ├── .git/                    ← 全ユーザー活動ログ               │
│  └── {visitorId}/                                               │
│      └── {projectId}/                                           │
│          ├── .git/            ← プロジェクト版バージョン管理      │
│          ├── index.html       ← ゲームコード                     │
│          ├── specs/           ← ゲーム仕様（3ファイル）           │
│          │   ├── game.md      ← 概要・デザイン                   │
│          │   ├── mechanics.md ← キャラ・ルール・操作             │
│          │   └── progress.md  ← 実装状況                        │
│          └── assets/          ← 生成された画像                   │
│                                                                 │
│  data/                                                          │
│  └── gamecreator.db           ← SQLite データベース             │
└─────────────────────────────────────────────────────────────────┘
```

---

## ファイル構成

```
GameCreatorMVP-v2/
├── package.json              # プロジェクト設定・依存関係
├── SPECIFICATION.md          # 本仕様書
├── .gitignore                # Git 除外設定
│
├── server/                   # バックエンド
│   ├── index.js              # メインサーバー（Express + WebSocket）
│   ├── claudeRunner.js       # Claude CLI / Gemini 実行・Skills 管理
│   ├── geminiClient.js       # Gemini Flash 2.0 クライアント
│   ├── database.js           # SQLite データベース管理
│   ├── userManager.js        # ユーザー・プロジェクト・Git 管理
│   ├── jobManager.js         # 非同期ジョブ管理
│   ├── prompts/              # プロンプトテンプレート
│   │   ├── baseRules.js      # 共通ルール
│   │   ├── createPrompt.js   # 新規作成用
│   │   ├── updatePrompt.js   # 更新用
│   │   └── planPrompt.js     # プランニング用
│   ├── analyzer/             # ゲーム分析ツール
│   │   ├── gameTypeAnalyzer.js
│   │   └── skillSelector.js
│   └── tools/                # CLI ツール
│       ├── classifyGames.js
│       └── gameClassifier.js
│
├── public/                   # フロントエンド
│   ├── index.html            # メイン HTML
│   ├── style.css             # スタイルシート
│   └── app.js                # クライアント JavaScript
│
├── .claude/                  # Claude Code 設定
│   ├── SYSTEM_PROMPT.md      # システムプロンプト
│   └── skills/               # Skills ライブラリ（28種）
│       ├── p5js-setup/       # P5.js 基本セットアップ
│       ├── p5js-input/       # P5.js 入力処理
│       ├── p5js-collision/   # P5.js 当たり判定
│       ├── threejs-setup/    # Three.js 基本セットアップ
│       ├── threejs-lighting/ # Three.js ライティング
│       ├── threejs-water/    # Three.js 水面シェーダー
│       ├── game-audio/       # Howler.js 音声
│       ├── game-ai/          # Yuka.js AI
│       ├── particles-setup/  # tsParticles 基本
│       ├── particles-effects/# パーティクルプリセット
│       ├── particles-explosion/ # 爆発エフェクト
│       ├── tween-animation/  # GSAP アニメーション
│       ├── kawaii-design/    # KAWAII デザインガイド
│       ├── kawaii-colors/    # カラーパレット
│       ├── kawaii-3d/        # 3D KAWAII スタイル
│       ├── kawaii-ui/        # UI デザイン
│       ├── visual-polish-2d/ # 2D ビジュアルポリッシュ
│       ├── visual-polish-3d/ # 3D ビジュアルポリッシュ
│       ├── image-generation/ # AI 画像生成
│       ├── sprite-sheet/     # スプライトシート
│       ├── nanobanana/       # Gemini 画像生成ツール
│       └── ...
│
├── deploy/                   # デプロイ設定
│   ├── setup-gce.sh          # GCE セットアップスクリプト
│   ├── ecosystem.config.js   # PM2 設定
│   └── nginx.conf            # Nginx 設定
│
├── docs/                     # ドキュメント
│   ├── GAME_CLASSIFICATION.md
│   └── GAME_TYPE_ANALYSIS.md
│
└── users/                    # ユーザーデータ（Git 管理外）
    └── {visitorId}/{projectId}/
```

---

## 使用技術

### バックエンド
| 技術 | バージョン | 用途 |
|-----|-----------|------|
| Node.js | 22.x | ランタイム |
| Express | 4.18.x | HTTP サーバー |
| ws | 8.14.x | WebSocket サーバー |
| better-sqlite3 | 11.x | SQLite データベース |
| uuid | 9.x | ユニーク ID 生成 |
| Claude Code CLI | latest | コード生成エンジン |
| Gemini Flash 2.0 | latest | 高速コード生成・画像生成 |
| Git | - | バージョン管理 |

### フロントエンド
| 技術 | 用途 |
|-----|------|
| Vanilla JavaScript | クライアントロジック |
| WebSocket API | リアルタイム通信 |
| CSS3 | ダークテーマ UI |

### AI モデル
| モデル | 用途 |
|-------|------|
| Claude Code CLI (Sonnet) | メインコード生成 |
| Claude Haiku | 2D/3D 判定、Spec 更新判定 |
| Gemini Flash 2.0 | 高速コード生成（フォールバック） |
| Gemini Nano Banana | AI 画像生成 |

### Skills（ゲームライブラリ）
| ライブラリ | CDN | 用途 |
|-----------|-----|------|
| P5.js | jsdelivr 1.11.0 | 2D ゲーム |
| Three.js | jsdelivr 0.170.0 | 3D ゲーム |
| Howler.js | jsdelivr 2.2.4 | 音声 |
| Yuka.js | jsdelivr 0.7.8 | 敵 AI |
| tsParticles | jsdelivr 2.12.0 | パーティクル |
| GSAP | jsdelivr 3.12.5 | アニメーション |
| cannon-es | jsdelivr | 物理エンジン |

---

## 機能一覧

### ゲーム作成機能
| 機能 | 説明 |
|-----|------|
| チャット入力 | 自然言語でゲームの指示を送信 |
| 2D/3D 自動判定 | Haiku が次元を判定、不明時はユーザーに確認 |
| Skills 自動選択 | メッセージから最適なライブラリを選択 |
| リアルタイムプレビュー | iframe で即時表示 |
| ストリーミング表示 | 生成過程をリアルタイム表示 |
| 日本語 IME 対応 | 変換確定前の Enter で送信されない |

### Spec 管理機能（NEW）
| 機能 | 説明 |
|-----|------|
| 3ファイル分割 | game.md / mechanics.md / progress.md |
| 選択的更新 | Haiku が必要な Spec のみ更新 |
| game.md | ゲーム概要、デザインスタイル、世界観 |
| mechanics.md | キャラクター、アイテム、ルール、操作 |
| progress.md | 実装済み機能、次の目標 |

### 画像生成機能（NEW）
| 機能 | 説明 |
|-----|------|
| AI 画像生成 | Gemini Nano Banana で画像生成 |
| 透過 PNG | 背景透過画像対応 |
| スプライトシート | アニメーション用連番画像 |
| 自動組み込み | 生成画像をゲームに自動反映 |

### バージョン管理機能
| 機能 | 説明 |
|-----|------|
| 自動コミット | コード更新時に Git で自動保存 |
| バージョン履歴 | 過去のバージョン一覧表示 |
| バージョン復元 | 任意のバージョンに戻す |

### データベース機能（NEW）
| 機能 | 説明 |
|-----|------|
| SQLite | better-sqlite3 による高速 DB |
| チャット履歴 | 会話履歴の永続化 |
| プロジェクト情報 | メタデータ管理 |
| アセット管理 | 生成画像の管理 |

---

## デプロイ

### ローカル開発
```bash
npm install
npm start
# http://localhost:3000
```

### GCE 本番環境
```bash
# GCE インスタンス: dreamcorecode (asia-northeast1-b)
# IP: 34.84.28.42
# PM2 でプロセス管理

# デプロイ手順
rsync -avz --exclude='node_modules' ... user@34.84.28.42:/path/
ssh user@34.84.28.42 "pm2 restart gamecreator"
```

---

## 環境変数

| 変数名 | デフォルト | 説明 |
|-------|-----------|------|
| `PORT` | `3000` | サーバーのリッスンポート |
| `GEMINI_API_KEY` | - | Gemini API キー |
| `USE_GEMINI` | `true` | Gemini 使用フラグ |

---

## 更新履歴

| 日付 | バージョン | 内容 |
|-----|-----------|------|
| 2026-01-11 | v0.5.0 | Spec 3ファイル分割、threejs-setup 安定性向上（Canvas事前配置、jsdelivr CDN） |
| 2026-01-10 | v0.4.0 | 2D/3D 判定改善（Haiku 完全委任）、画像生成機能、スキル追加 |
| 2026-01-09 | v0.3.0 | Gemini Flash 2.0 統合、GCE デプロイ、SQLite 導入 |
| 2026-01-08 | v0.2.0 | Skills 自動選択、Git バージョン管理 |
| 2026-01-08 | v0.1.0 | 初版作成 |

---

## ライセンス

MIT License
