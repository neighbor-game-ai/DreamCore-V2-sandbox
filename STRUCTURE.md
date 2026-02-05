# DreamCore V2 Sandbox - プロジェクト構造

最終更新: 2026-02-05

## 概要

AI でブラウザゲームを作成するプラットフォーム。Modal Sandbox で Claude CLI を実行。

---

## コアディレクトリ

| フォルダ | 目的 | 備考 |
|---------|------|------|
| `server/` | Express バックエンド | WebSocket、API、ゲーム生成 |
| `public/` | フロントエンド静的ファイル | HTML、CSS、JS |
| `modal/` | Modal Sandbox 統合 | Claude CLI 実行環境 |
| `supabase/` | データベース | マイグレーション、Edge Functions |
| `docs/` | ドキュメント | API リファレンス、設計書 |

---

## サーバー (`server/`)

| フォルダ | 目的 |
|---------|------|
| `server/analyzer/` | ゲームタイプ分析、スキル選択 |
| `server/middleware/` | 認証、アップロード、アクセス制御 |
| `server/modules/` | 機能モジュール（profile等） |
| `server/prompts/` | AI プロンプトテンプレート |
| `server/routes/` | API ルート定義 |
| `server/tools/` | ユーティリティツール |
| `server/utils/` | 共通ユーティリティ |

---

## フロントエンド (`public/`)

| フォルダ | 目的 |
|---------|------|
| `public/admin/` | 管理者ページ |
| `public/css/` | スタイルシート |
| `public/demo/` | デモページ（系譜表示等） |
| `public/images/` | 静的画像 |
| `public/js/` | JavaScript モジュール |
| `public/lib/` | サードパーティライブラリ |
| `public/locales/` | 多言語翻訳ファイル (i18n) |
| `public/sample-photo-game/` | Photo Game Creator サンプル（2026-02-05） |

---

## Modal 統合 (`modal/`)

| フォルダ | 目的 |
|---------|------|
| `modal/scripts/` | Python スクリプト（画像生成等） |
| `modal/skills/` | Claude Code Skills |
| `modal/tests/` | テストスクリプト |
| `modal/.claude/` | Modal 内 Claude 設定 |

---

## CLI Deploy (`cli-deploy/`)

外部 Claude Code からのゲームデプロイ機能。

| フォルダ | 目的 |
|---------|------|
| `cli-deploy/server/` | デプロイ API サーバー |
| `cli-deploy/public/` | 認証 UI |
| `cli-deploy/cloudflare-worker/` | ゲーム配信 Worker |
| `cli-deploy/skills/` | Claude Code Skills |

---

## Supabase (`supabase/`)

| フォルダ | 目的 |
|---------|------|
| `supabase/migrations/` | SQL マイグレーション |
| `supabase/functions/` | Edge Functions（waitlist-email等） |

---

## 動画生成

| フォルダ | 目的 | 備考 |
|---------|------|------|
| `game-video/` | ゲームプロモ動画生成 | Remotion |
| `intro-video/` | イントロ動画生成 | Remotion |

---

## デプロイ (`deploy/`)

| フォルダ | 目的 |
|---------|------|
| `deploy/api-proxy/` | API キープロキシ（GCE 用） |

---

## データ（ローカル開発用）

| フォルダ | 目的 |
|---------|------|
| `data/` | ローカルデータストレージ |
| `users/` | ユーザープロジェクトファイル |
| `assets/global/` | グローバルアセット |
| `uploads_temp/` | 一時アップロード |

---

## 開発ツール

| フォルダ | 目的 |
|---------|------|
| `.claude/` | Claude Code 設定・ログ・計画 |
| `scripts/` | 移行・ユーティリティスクリプト |
| `screenshots/` | E2E テストスクリーンショット |

---

## AI エージェント設定

複数の AI エージェント用設定（同一形式）:

| フォルダ | エージェント |
|---------|------------|
| `.claude/` | Claude Code |
| `.cursor/` | Cursor |
| `.codex/` | Codex |
| `.gemini/` | Gemini |
| `.agent/` | Generic Agent |
| `.agents/` | Multi-Agent |
| `.opencode/` | OpenCode |

各フォルダに `skills/` サブフォルダあり。

---

## 主要ファイル（ルート）

| ファイル | 目的 |
|---------|------|
| `CLAUDE.md` | プロジェクト固有の Claude 指示 |
| `TODO.md` | タスク・作業履歴 |
| `STRUCTURE.md` | このファイル |
| `package.json` | Node.js 依存関係 |
| `.env` | 環境変数（git 除外） |
| `.env.example` | 環境変数テンプレート |

---

## 関連ドキュメント

- `/Users/admin/DreamCore-V2-sandbox/docs/ENGINEER-HANDOFF.md` - Modal 統合引き継ぎ
- `/Users/admin/DreamCore-V2-sandbox/docs/API-REFERENCE.md` - API 仕様
- `/Users/admin/DreamCore-V2-sandbox/docs/WAITLIST.md` - ウェイトリスト機能
- `/Users/admin/DreamCore-V2-sandbox/.claude/docs/database-schema.md` - DB スキーマ
