# DreamCore V2 アーキテクチャ設計書

**プロダクト名:** DreamCore V2
**ドメイン:** v2.dreamcore.gg（V1: dreamcore.gg）
**最終更新:** 2026-01-22

---

## 目次

1. [DreamCore V2とは](#1-dreamcore-v2とは)
2. [V1とV2の関係](#2-v1とv2の関係)
3. [V2アーキテクチャ概要](#3-v2アーキテクチャ概要)
4. [Creator Sandbox（制作環境）](#4-creator-sandbox制作環境)
5. [Player Sandbox（プレイ環境）](#5-player-sandboxプレイ環境)
6. [データアーキテクチャ](#6-データアーキテクチャ)
7. [認証・認可フロー](#7-認証認可フロー)
8. [V1との連携](#8-v1との連携)
9. [新規構築計画](#9-新規構築計画)
10. [コスト見積もり](#10-コスト見積もり)
11. [セキュリティチェックリスト](#11-セキュリティチェックリスト)
12. [監視・監査設計](#12-監視監査設計)
13. [将来の拡張](#13-将来の拡張)

---

## 1. DreamCore V2とは

DreamCore V2は、**AIとチャットするだけでブラウザゲームが作れる**プラットフォームの次世代版です。

### コンセプト
> 「プログラミング知識ゼロでも、アイデアを話すだけでゲームが完成する」

### V2の新機能

| 機能 | V1 | V2 |
|------|----|----|
| AI制作 | Gemini API | Claude CLI（高品質） |
| バージョン管理 | なし | Git（プロジェクト単位） |
| Sandbox隔離 | なし | AI生成コードを隔離実行 |
| スケーラビリティ | 限定的 | コンテナベースで柔軟 |

### ユーザーストーリー

**Phase 1（ゲーム作成のみ）:**
```
1. ユーザーがv2.dreamcore.ggにアクセス
2. Googleアカウントでログイン
3. 「宇宙を舞台にしたシューティングゲームを作りたい」とチャット
4. AIがコードを自動生成、リアルタイムでプレビュー表示
5. 「敵をもっと強くして」「BGMを追加して」と対話で改良
6. プロジェクトを保存（公開機能はPhase 2で実装）
```

**Phase 2（ゲーム配信追加）:**
```
1-5. （Phase 1と同じ）
6. 完成したら「公開」ボタンで公開
7. play.v2.dreamcore.ggでゲームをプレイ可能に
```

---

## 2. V1とV2の関係

### 概要

V2はV1とは**完全に独立したシステム**として構築します。API連携は行いません。

```
┌─────────────────────────────────────────────────────────────────┐
│                        ユーザー                                   │
│                          │                                       │
│              同じGoogleアカウントで利用可能                        │
│                          │                                       │
│            ┌─────────────┴─────────────┐                        │
│            ▼                           ▼                        │
│   ┌─────────────────┐         ┌─────────────────┐              │
│   │   DreamCore V1  │         │   DreamCore V2  │              │
│   │  dreamcore.gg   │         │ v2.dreamcore.gg │              │
│   │                 │  独立   │                 │              │
│   │  - Vercel       │         │  - GCE          │              │
│   │  - Supabase A   │         │  - Supabase B   │              │
│   │  - R2           │         │  - GCS          │              │
│   └─────────────────┘         └─────────────────┘              │
│                                                                  │
│   ※ 相互連携なし（将来オプションとして検討可能）                    │
└─────────────────────────────────────────────────────────────────┘
```

### V1の構成（既存）

| 項目 | 技術 |
|------|------|
| フロントエンド | Next.js 15 (Vercel) |
| 認証 | Supabase Auth + Google OAuth |
| データベース | Supabase PostgreSQL |
| ストレージ | Cloudflare R2 |
| ゲーム配信 | R2上のHTMLを直接配信 |

### V2の構成（新規）

| 項目 | 技術 | 備考 |
|------|------|------|
| フロントエンド/API | Express + Vite (GCE) | |
| 認証 | Supabase Auth + Google OAuth | V1とは別インスタンス |
| データベース | Supabase PostgreSQL | |
| ストレージ | Google Cloud Storage | |
| AI制作 | Claude CLI | サーバー側で実行 |
| ゲーム配信 | play.v2.dreamcore.gg | Phase 2で実装 |

### なぜ独立させるか

| 理由 | 詳細 |
|------|------|
| 自由な設計 | V1のテーブル構造に縛られない |
| 障害分離 | V2がダウンしてもV1に影響しない |
| 段階的リリース | 一部ユーザーのみV2に招待可能 |
| 将来の移行 | V2が安定したら全ユーザーをV2に統合しやすい |

---

## 3. V2アーキテクチャ概要

### 初期リリースの構成（モノリス）

V2は**モノリス構成**で構築します。Docker Sandboxは初期リリースでは不要です。

```
┌─────────────────────────────────────────────────────────────────┐
│                     初期リリースの構成                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    GCE Instance                              ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │                 Main Server (モノリス)               │    ││
│  │  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │    ││
│  │  │  │ Express  │  │WebSocket │  │    Claude CLI     │ │    ││
│  │  │  │   API    │  │  Server  │  │   (コード生成)     │ │    ││
│  │  │  └──────────┘  └──────────┘  └───────────────────┘ │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  └─────────────────────────────────────────────────────────────┘│
│          │                                                      │
│          ▼                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │  Supabase   │  │GCE永続ﾃﾞｨｽｸ │  │     GCS     │            │
│  │  (認証/DB)  │  │  (正本)     │  │ (ﾊﾞｯｸｱｯﾌﾟ)  │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                  │
│  ※ Docker Sandbox なし（生成コードはクライアントiframeで実行）    │
│  ※ 公開機能なし（Phase 2で実装）                                 │
│  ※ 通常読み込みはGCE永続ディスクのみ（GCSはバックアップ専用）     │
└─────────────────────────────────────────────────────────────────┘
```

### 将来の構成（Docker Sandbox追加時）

> **注意:** この構成はV2一本化時またはサーバーサイド実行が必要になった場合に実装します。

```
┌─────────────────────────────────────────────────────────────────┐
│                     将来の構成（参考）                            │
│                                                                  │
│  GCE Instance                                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Main Server (モノリス)                   │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐ │ │
│  │  │ Express  │  │WebSocket │  │ Sandbox  │  │Claude CLI │ │ │
│  │  │   API    │  │  Server  │  │Orchestr. │  │           │ │ │
│  │  └──────────┘  └──────────┘  └────┬─────┘  └───────────┘ │ │
│  └───────────────────────────────────┼──────────────────────┘ │
│                                      ▼                         │
│                             ┌─────────────────┐                │
│                             │ Docker Sandbox  │                │
│                             │   Containers    │                │
│                             └─────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### なぜモノリスか

| マイクロサービス | モノリス |
|-----------------|---------|
| 複雑、開発遅い | シンプル、開発速い |
| 初期から分散システムの課題 | 必要になったら分割 |
| 小規模チームには過剰 | 1人でも運用可能 |

### ドメイン構成

| ドメイン | 用途 | Phase 1 | Phase 2 |
|----------|------|---------|---------|
| v2.dreamcore.gg | V2メインサイト、エディタ | ✅ 必要 | ✅ 必要 |
| play.v2.dreamcore.gg | ゲーム配信（iframe隔離） | ❌ 不要 | ✅ 必要 |
| api.v2.dreamcore.gg | API（将来的に分離する場合） | ❌ 不要 | ❌ 不要 |

### Phase 1: Creator（ゲーム作成のみ）

> **配信機能なし** - ゲームを作成・保存できるが、公開はできない

```
┌─────────────────────────────────────────────────────────────────┐
│                      Phase 1: Creator                            │
│                                                                  │
│  V2 (v2.dreamcore.gg)                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │                  GCE Instance                     │           │
│  │                                                   │           │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  │           │
│  │  │ Claude CLI │  │ WebSocket  │  │   Express  │  │           │
│  │  │ コード生成  │  │  Server    │  │    API     │  │           │
│  │  └────────────┘  └────────────┘  └────────────┘  │           │
│  │                                                   │           │
│  │  ┌────────────────────────────────────────────┐  │           │
│  │  │           エディタ + プレビュー              │  │           │
│  │  │   (sandbox iframe で自分のコードを実行)     │  │           │
│  │  └────────────────────────────────────────────┘  │           │
│  └──────────────────────────────────────────────────┘           │
│          │                        │                              │
│          ▼                        ▼                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │  Supabase   │  │GCE永続ﾃﾞｨｽｸ │  │     GCS     │            │
│  │  (認証/DB)  │  │  (正本)     │  │ (ﾊﾞｯｸｱｯﾌﾟ)  │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                  │
│  ※ 公開機能なし（「公開はもう少しお待ちください」と表示）          │
│  ※ V1との連携なし                                                │
│  ※ 通常読み込みはGCE永続ディスクのみ                              │
└─────────────────────────────────────────────────────────────────┘
```

**Phase 1の機能:**

| 機能 | 状態 | 備考 |
|------|------|------|
| ゲーム制作（エディタ） | ✅ 利用可能 | Claude CLI + GCE永続ディスク |
| エディタ内プレビュー | ✅ 利用可能 | sandbox属性付きiframe |
| プロジェクト保存・読み込み | ✅ 利用可能 | GCE永続ディスク（GCSにバックアップ） |
| ゲーム公開・配信 | ❌ 未実装 | Phase 2で実装 |

**エディタ内プレビューの隔離条件:**

```html
<!-- エディタ内プレビューのiframe -->
<iframe
  srcdoc="..."
  sandbox="allow-scripts"
></iframe>
```

| 属性 | 設定 | 理由 |
|------|------|------|
| sandbox | あり | 基本的な隔離を適用 |
| allow-scripts | ✓ | ゲーム実行に必要 |
| allow-same-origin | **✗** | セッショントークン・APIアクセスを遮断 |
| allow-forms | ✗ | フォーム送信を防止 |

**セキュリティ上の注意:**
- `allow-same-origin` なし → 親ウィンドウのCookie/localStorage/APIにアクセス不可
- `allow-forms` なし → `<form>` による送信は不可
- **ただし** fetch/img/WebSocket による外部通信は可能（sandbox属性では防げない）

**なぜ初期リリースでこれを許容するか:**
- 自分のコードを自分で実行 → 外部送信しても被害者は自分
- セッショントークンは `allow-same-origin` なしで保護済み
- Remix機能なし → 他人のコードを読み込むリスクなし

**将来、外部送信も防ぎたい場合:**
srcdoc内にCSPを埋め込む（`connect-src 'none'` 等）

**Phase 2で実装するもの:**
- play.v2.dreamcore.gg（V2独自のゲーム配信）
- Player Sandbox（別ドメイン + CSP）
- 公開・共有機能

---

## 4. Creator Sandbox（制作環境）【将来オプション】

> **注意:** このセクションは将来の拡張オプションです。
> 初期リリースでは、生成コードはクライアントのiframeで実行されるため、
> Docker Sandboxは不要です。

### 目的（将来実装する場合）
- AI生成コードの隔離実行
- ユーザー間のデータ分離
- システムリソースの保護

### Claude CLI アーキテクチャ

**重要な設計判断:** Claude CLI は Sandbox 内で実行しない

```
┌─────────────────────────────────────────────────────────────┐
│                    アーキテクチャ選択                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ❌ 案A: Sandbox内でCLI実行                                 │
│     - APIキーをSandboxに渡す必要 → セキュリティリスク        │
│     - 生成コードがAPIキーにアクセス可能                      │
│                                                             │
│  ✅ 案B: Orchestrator経由でCLI実行（採用）                  │
│     - APIキーはOrchestrator内のみ                           │
│     - Sandboxは生成されたコードの実行環境のみ                │
│     - AIとファイルシステムの分離                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**採用アーキテクチャ:**

```
┌─────────────┐     ┌─────────────────────────────────────────┐
│   Browser   │     │              GCE Instance                │
└──────┬──────┘     │  ┌─────────────────────────────────┐    │
       │            │  │        Main Server               │    │
       │ WS         │  │  ┌───────────┐  ┌────────────┐  │    │
       │            │  │  │ Claude CLI│  │ API Keys   │  │    │
       └───────────▶│  │  │ Runner    │  │ (安全に保持)│  │    │
                    │  │  └─────┬─────┘  └────────────┘  │    │
                    │  └────────┼────────────────────────┘    │
                    │           │ ファイル書き込み             │
                    │           ▼                             │
                    │  ┌─────────────────────────────────┐    │
                    │  │     Sandbox Container            │    │
                    │  │  ┌───────────────────────────┐  │    │
                    │  │  │ /project/                 │  │    │
                    │  │  │  - index.html             │  │    │
                    │  │  │  - script.js              │  │    │
                    │  │  │  (生成されたコード)        │  │    │
                    │  │  └───────────────────────────┘  │    │
                    │  │  - プレビューサーバー            │    │
                    │  │  - APIキーなし                  │    │
                    │  └─────────────────────────────────┘    │
                    └─────────────────────────────────────────┘
```

### 処理フロー

```
1. ユーザーがチャットでリクエスト送信
2. Main Server が Claude CLI を実行（APIキー使用）
3. Claude がコードを生成
4. Main Server が生成コードを Sandbox のボリュームに書き込み
5. Sandbox がプレビューを更新
6. 結果をユーザーにストリーミング
```

### CLI実行制御（運用ガード）

| 制御 | 値 | 理由 |
|------|-----|------|
| リクエストタイムアウト | 5分 | 無限ループ・暴走防止 |
| 同時実行数（ユーザーあたり） | 1 | リソース独占防止 |
| 同時実行数（システム全体） | 10 | GCEリソース保護 |
| 1回あたりトークン上限 | 10万トークン | 異常リクエスト防止 |
| 最大出力サイズ | 1MB | メモリ保護 |

### 利用制限（ユーザー向け）

| 項目 | 値 | 備考 |
|------|-----|------|
| 週間チャット回数 | 50回 | 毎週月曜リセット |
| 超過時 | エラーメッセージ表示 | 「今週の利用上限に達しました」 |
| 将来調整 | データを見て検討 | 利用パターン分析後に最適化 |

**V2案内時の説明:** 「週50回くらいのチャット制限があります」

### ネットワーク設計

```
┌─────────────────────────────────────────────────────────────┐
│                  Sandbox ネットワーク設計                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  許可する通信:                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Main Server ↔ Sandbox (内部ネットワーク)             │   │
│  │ - WebSocket通信                                      │   │
│  │ - ファイル同期                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  禁止する通信:                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Sandbox → インターネット                             │   │
│  │ Sandbox → GCS（直接アクセス禁止）                    │   │
│  │ Sandbox → 他のSandbox                               │   │
│  │ Sandbox → Anthropic API                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Sandbox コンテナ設計

```dockerfile
# sandbox/Dockerfile
FROM node:20-slim

# 最小限の依存関係（AIなし、実行環境のみ）
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 非rootユーザー
RUN useradd -m -s /bin/bash -u 1000 sandbox
USER sandbox

WORKDIR /home/sandbox/project

# プレビューサーバーのみ
COPY --chown=sandbox:sandbox preview-server.js /home/sandbox/

CMD ["node", "/home/sandbox/preview-server.js"]
```

### リソース制限

| リソース | 制限値 | 実装方法 |
|----------|--------|----------|
| CPU | 1 core | `--cpus=1` |
| Memory | 512MB | `--memory=512m` |
| Disk | 100MB | tmpfs + サイズ制限 |
| Network | 内部のみ | internal network |
| プロセス | 50 | `--pids-limit=50` |

### コンテナライフサイクル

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Created │───▶│ Running │───▶│ Paused  │───▶│ Removed │
└─────────┘    └────┬────┘    └────┬────┘    └─────────┘
                    │              │              ▲
               アイドル5分     再アクセス      30分後
                    │              │              │
                    └──────────────┴──────────────┘
```

---

## 5. Player Sandbox（プレイ環境）【Phase 2で実装】

> **Phase 2で実装予定**
> Phase 1ではゲーム公開機能はありません。
> Phase 2でplay.v2.dreamcore.ggを構築し、V2で作成したゲームをV2で配信します。

### 目的
- ゲームコードからのXSS防止
- 親ウィンドウへのアクセス遮断
- Cookie/LocalStorage隔離

### ドメイン分離

```
メインサイト:    v2.dreamcore.gg
ゲーム配信:      play.v2.dreamcore.gg  ← 完全に別ドメイン（Phase 2で構築）
```

### iframe実装

```html
<!-- v2.dreamcore.gg/game.html -->
<iframe
  src="https://play.v2.dreamcore.gg/games/{gameId}/"
  sandbox="allow-scripts allow-pointer-lock"
  allow="gamepad; fullscreen"
  referrerpolicy="no-referrer"
></iframe>
```

### sandbox属性

| 属性 | 設定 | 理由 |
|------|------|------|
| allow-scripts | ✓ | ゲーム実行に必要 |
| allow-pointer-lock | ✓ | FPSゲームなどに必要 |
| allow-same-origin | ✗ | 親サイトへのアクセス禁止 |
| allow-forms | ✗ | フォーム送信禁止 |
| allow-popups | ✗ | ポップアップ禁止 |

### CSP設定

```nginx
add_header Content-Security-Policy "
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval'
        https://cdn.jsdelivr.net
        https://cdnjs.cloudflare.com
        https://unpkg.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https://storage.googleapis.com;
    media-src 'self' blob: https://storage.googleapis.com;
    connect-src 'self' https://storage.googleapis.com;
    frame-ancestors https://v2.dreamcore.gg;
" always;
```

---

## 6. データアーキテクチャ

### GCSバケット構成

**セキュリティのためバケットを分離:**

```
dreamcore-v2-projects/              # 非公開バケット（Phase 1から使用）
├── {userId}/
│   └── {projectId}/
│       ├── index.html
│       ├── script.js
│       └── assets/
└── (Uniform access: 非公開、サーバー経由でのみアクセス)

dreamcore-v2-games/                 # 公開バケット（Phase 2で作成）
├── {gameId}/
│   ├── index.html
│   ├── script.js
│   └── assets/
├── thumbnails/
│   └── {gameId}.webp
└── movies/
    └── {gameId}.mp4
└── (Uniform access: 公開、play.v2.dreamcore.ggから直接配信)
```

**なぜバケット分離か:**
- projects/が誤って公開されるリスクを排除
- games/は全公開でシンプルに運用
- ACL管理の複雑さを回避
- **制作環境と公開環境の独立**: 公開後に制作側で編集しても公開ゲームに影響しない

### GCS同期タイミング（非同期バックアップ）

**同期方式:** 非同期バックアップ（通常運用ではGCSを読み込まない）

| タイミング | 処理 |
|-----------|------|
| プロジェクト作成時 | GCE永続ディスクにディレクトリ作成、GCSへは非同期でバックアップ |
| コード生成時 | Claude CLIの出力をGCE永続ディスクに即時保存 → 非同期でGCSにバックアップ |
| 公開時（Phase 2） | GCE永続ディスク → gamesバケットにコピー（公開専用）|

**バックアップ間隔:** ファイル保存後1分以内（非同期ジョブで実行）

### ゲーム公開フロー【Phase 2で実装】

> Phase 1では公開機能はありません。Phase 2で以下のフローを実装します。

```
┌─────────────────────────────────────────────────────────────────┐
│                   公開フロー（Phase 2）                          │
│                                                                 │
│  V2 (v2.dreamcore.gg)                                          │
│  ┌─────────────┐                                               │
│  │ 1. 公開ボタン│                                               │
│  │    クリック  │                                               │
│  └──────┬──────┘                                               │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────────┐      ┌──────────────────┐               │
│  │ GCE永続ディスク   │      │ dreamcore-v2-    │               │
│  │ (正本)           │ ───▶ │ games (公開)     │               │
│  └──────────────────┘ コピー└────────┬─────────┘               │
│                                      │                         │
│                                      ▼                         │
│                        ┌─────────────────┐                    │
│                        │ play.v2.dream   │                    │
│                        │   core.gg       │                    │
│                        │ でゲーム配信     │                    │
│                        └─────────────────┘                    │
│                                                                │
│  ※ GCE（正本）から直接コピー（GCSバックアップ完了を待たない）     │
└─────────────────────────────────────────────────────────────────┘
```

**公開APIの実装例（Phase 2）:**

```javascript
// V2: POST /api/projects/:projectId/publish
app.post('/api/projects/:projectId/publish', authenticate, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const { title, description } = req.body;

  // 1. GCE永続ディスク（正本）→ gamesバケットにコピー
  //    ※ GCSバックアップ完了を待たない（正本から直接コピー）
  const gameId = generateId();
  const projectPath = `/data/projects/${userId}/${projectId}`;
  await copyToGamesBucket(projectPath, gameId);

  // 2. gamesテーブルに記録
  await supabase.from('games').insert({
    id: gameId,
    project_id: projectId,
    user_id: req.user.id,
    title,
    game_url: `https://play.v2.dreamcore.gg/games/${gameId}/`,
  });

  res.json({ gameUrl: `https://play.v2.dreamcore.gg/games/${gameId}/` });
});
```

### クライアントへのファイル配信

```
┌─────────────────────────────────────────────────────────────────┐
│                     ファイル配信フロー                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  【リアルタイムプレビュー】（Phase 1）                            │
│  Claude CLI → GCE保存 → WS通知 → API再取得 → iframe             │
│  ※ WebSocketは通知のみ、HTML/アセットはAPI経由（認可チェック付き）│
│                                                                 │
│  【プロジェクト再開時】（Phase 1）                                │
│  クライアント → サーバーAPI → GCE永続ディスク → クライアント      │
│  ※ 前回のプロジェクト状態を読み込む（GCSは経由しない）            │
│                                                                 │
│  【公開ゲーム】（Phase 2）                                       │
│  play.v2.dreamcore.gg → dreamcore-v2-games バケットから配信    │
│  ※ Phase 1では公開機能なし                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**なぜ署名URLや複雑な配信設計が不要か:**
- リアルタイムプレビューはWS通知 → API再取得（認可付き）
- プロジェクト再開時はAPIプロキシ方式（下記参照）
- 公開ゲームはGCSから直接配信（Phase 2）

**プロジェクト再開時の認可（APIプロキシ方式）:**

```javascript
// GET /api/projects/:projectId/files
app.get('/api/projects/:projectId/files', authenticate, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  // 1. プロジェクト所有者チェック
  const { data: project } = await supabase
    .from('projects')
    .select()
    .eq('id', projectId)
    .eq('user_id', userId)  // 自分のプロジェクトのみ
    .single();

  if (!project) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 2. GCE永続ディスクからファイル一覧取得
  const projectPath = `/data/projects/${userId}/${projectId}`;
  const files = await fs.promises.readdir(projectPath, { recursive: true });

  // 3. ファイル一覧を返却（内容は別APIで取得）
  res.json({ files });
});
```

- クライアントは直接ストレージにアクセスしない
- サーバーがSupabase RLSで所有者チェック → GCE永続ディスク取得 → 返却
- シンプルで認可漏れが起きにくい

**バージョン管理:** 既存実装のGitベースのスナップショット管理を継続。
プロジェクトごとに`.git`を持ち、明示的な復元ポイントを作成できます。
- **保存先:** GCE永続ディスク（`/data/projects/{userId}/{projectId}/.git`）
- **注意:** ディスク障害時はデータ消失。重要なプロジェクトはGCSにも保存済み
- **将来の移行:** Gitリポジトリはファイルの集合なので、外部サーバーへの移行が可能
  - 移行先候補: 専用Gitサーバー / GCS（git bundle） / GitHub等
  - 移行を容易にするため、Git操作は抽象化レイヤーを設けることを推奨

**プレビュー時のアセット供給:** 現行MVPの方式を踏襲（APIプロキシ方式）。
- HTML: `GET /game/{userId}/{projectId}/index.html` でHTMLを返す
  - URLパスと物理パス（`/data/projects/{userId}/{projectId}/`）を直接マッピング
  - 認可: URLのuserIdとログインユーザーのidが一致するか確認
- アセット: `GET /api/assets/:id` でファイルを返す（DBのassetsテーブルでID→storage_path解決）
- WebSocketは**通知のみ**（`gameUpdated`イベント）、HTML/アセットは常にAPI経由

**パストラバーサル対策（必須）:**
```javascript
// GET /game/:userId/:projectId/*
app.get('/game/:userId/:projectId/*', authenticate, (req, res) => {
  const { userId, projectId } = req.params;
  const filePath = req.params[0] || 'index.html';

  // 1. パラメータ形式検証（UUID形式のみ許可）
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId) || !uuidRegex.test(projectId)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // 2. パス正規化でトラバーサル防止
  const baseDir = `/data/projects/${userId}/${projectId}`;
  const resolvedPath = path.resolve(baseDir, filePath);

  // 3. 解決後のパスがbaseDir内に収まっているか確認
  //    ※ 末尾スラッシュ付きで比較（/data/projects/u と /data/projects/u2 の誤判定防止）
  const normalizedBase = baseDir + '/';
  if (!resolvedPath.startsWith(normalizedBase) && resolvedPath !== baseDir) {
    return res.status(403).json({ error: 'Path traversal detected' });
  }

  // 4. 認可チェック
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 5. ファイル配信
  res.sendFile(resolvedPath);
});
```

| 対策 | 説明 |
|------|------|
| UUID形式検証 | `../`等の不正文字を含むIDを拒否 |
| path.resolve | 相対パスを絶対パスに正規化 |
| startsWith検証 | 正規化後のパスがプロジェクトディレクトリ外を指していないか確認 |
| 末尾スラッシュ正規化 | `/data/u` と `/data/u2` の誤判定を防止 |
| 認可チェック | URLのuserIdとログインユーザーの一致を確認 |

**リアルタイムプレビューフロー（統一パターン）:**
```
1. Claude CLIがコード生成 → GCE永続ディスクに保存
2. サーバーがWebSocketで通知送信: { event: "gameUpdated" }
3. クライアントが通知を受信
4. クライアントがAPIでHTML再取得: GET /game/{userId}/{projectId}/index.html
5. iframeをリロード（srcdoc更新）
```
※ WebSocketでHTMLを直接送信しない（大きなファイル対応、認可チェック統一のため）

**正本の定義（制作環境 / projectsバケット）:**
- **正本: GCE永続ディスク（Git含む）** - 通常運用時の唯一の参照先
- **GCS projectsバケット: バックアップ専用** - 通常運用では読み込まない、障害復旧時のみ使用
- **同期方向:**
  - コード更新時: GCE → GCS（自動同期、バックアップ目的）
  - 障害復旧時: GCS → GCE（管理者が手動リストア）
- **通常の読み込み経路:** クライアント → サーバー → GCE永続ディスク（GCSは経由しない）

**公開環境 / gamesバケット（Phase 2）:**
- **GCS gamesバケット: プライマリ配信元** - 公開ゲームはGCSから直接配信
- **GCE永続ディスク:** 公開時のコピー元（正本）、公開後は参照しない
- **読み込み経路:** play.v2.dreamcore.gg → GCS gamesバケット（直接配信）

### Supabase スキーマ（V2専用）

```sql
-- ユーザー（Supabase Auth連携）
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- プロジェクト（制作中）
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  game_type TEXT NOT NULL,  -- '2d' | '3d'
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 公開ゲーム（Phase 2で使用）
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  game_url TEXT NOT NULL,       -- play.v2.dreamcore.gg/games/{id}/
  thumbnail_url TEXT,
  play_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  visibility TEXT DEFAULT 'public',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- アセット（画像・音声等）
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT,
  storage_path TEXT NOT NULL,   -- GCE永続ディスク上のパス
  mime_type TEXT,
  size INTEGER,
  is_public BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  tags TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- プロジェクトとアセットの紐付け
CREATE TABLE project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  usage_type TEXT DEFAULT 'image',  -- 'image' | 'audio' | 'other'
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, asset_id)
);

-- RLS有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assets ENABLE ROW LEVEL SECURITY;

-- ポリシー
CREATE POLICY users_own ON users FOR ALL USING (auth.uid() = id);
CREATE POLICY projects_own ON projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY games_read ON games FOR SELECT USING (visibility = 'public' OR user_id = auth.uid());
CREATE POLICY games_write ON games FOR ALL USING (auth.uid() = user_id);
CREATE POLICY assets_own ON assets FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY assets_public ON assets FOR SELECT USING (is_public = TRUE);
CREATE POLICY project_assets_own ON project_assets FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
```

**アセットのHTML内埋め込み:**
Claude CLIが生成するコード内で `/api/assets/{id}` を参照。
サーバーがassetsテーブルでID→storage_pathを解決してファイルを返す。

---

## 7. 認証・認可フロー

### 認証方式

V2はV1とは**別のSupabaseインスタンス**を使用し、同じGoogle OAuthで認証します。

```
ユーザー: Googleアカウント (example@gmail.com)
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌────────┐         ┌────────┐
│  V1    │         │  V2    │
│Supabase│         │Supabase│
│User: A │         │User: X │ ← 別のユーザーレコード
└────────┘         └────────┘
```

### メリット

- **実装コスト**: ゼロ（自然とこうなる）
- **独立性**: V2は完全に独立
- **紐付け**: 同じemailで後から連携可能

### 認可レベル

| レベル | 権限 |
|--------|------|
| Guest | ゲーム閲覧・プレイ |
| User | 制作・公開（招待制） |
| Admin | 全権限 |

### visitorIdからの移行

現行MVPでは`visitorId`（ブラウザ識別子）で匿名ユーザーを識別していますが、
V2ではSupabase Authの`user.id`に置き換えます。

| 項目 | 現行MVP | V2 |
|------|---------|-----|
| ユーザー識別 | visitorId（ブラウザFP） | Supabase Auth user.id |
| 保存場所 | localStorage | Supabase Session |
| 認証方式 | なし（匿名） | Google OAuth |

---

## 8. V1との連携【将来オプション】

> **現在の方針:** V2はV1と完全に独立して運用します。
> V1との連携は将来のオプションとして残しておきます。

### 現在の方針

**Phase 1:**
```
┌─────────────────────────────────────────────────────────────────┐
│                      V1/V2 独立運用（Phase 1）                    │
│                                                                  │
│   V1 (dreamcore.gg)              V2 (v2.dreamcore.gg)           │
│   ┌────────────────┐             ┌────────────────┐             │
│   │ 既存ユーザー     │             │ 新規ユーザー     │             │
│   │ V1で作成した     │             │ V2でゲーム作成   │             │
│   │ ゲーム          │             │ （公開機能なし）  │             │
│   └────────────────┘             └────────────────┘             │
│          │                                                       │
│          ▼                                                       │
│   dreamcore.gg/play/*                                           │
│                                                                  │
│   ※ V2は作成のみ、配信機能はPhase 2で実装                         │
└─────────────────────────────────────────────────────────────────┘
```

**Phase 2:**
```
┌─────────────────────────────────────────────────────────────────┐
│                      V1/V2 独立運用（Phase 2）                    │
│                                                                  │
│   V1 (dreamcore.gg)              V2 (v2.dreamcore.gg)           │
│   ┌────────────────┐             ┌────────────────┐             │
│   │ 既存ユーザー     │             │ 新規ユーザー     │             │
│   │ V1で作成した     │             │ V2で作成した     │             │
│   │ ゲーム          │             │ ゲーム          │             │
│   └────────────────┘             └────────────────┘             │
│          │                              │                        │
│          ▼                              ▼                        │
│   dreamcore.gg/play/*         play.v2.dreamcore.gg/*           │
│                                                                  │
│   ※ 相互連携なし（完全に独立）                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 将来の連携オプション

V2が安定し、V1にV2ゲームを表示したくなった場合：

```javascript
// V2: /api/public/games（将来実装）
app.get('/api/public/games', async (req, res) => {
  const games = await supabase
    .from('games')
    .select('id, title, description, game_url, thumbnail_url, play_count, like_count, created_at')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(100);

  res.json({
    source: 'v2',
    games: games.data
  });
});
```

### ユーザー紐付け（将来オプション）

同じGoogleアカウント（email）で紐付け可能：

```sql
-- V1からV2ユーザーを参照
SELECT * FROM v2_users WHERE email = 'example@gmail.com';
```

---

## 9. 新規構築計画

### 概要

V2は**完全に新規構築**します。V1からの移行は不要です。

### リリースフェーズ

```
┌─────────────────────────────────────────────────────────────────┐
│                    リリースフェーズ                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Creator（ゲーム作成のみ）                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✅ ゲーム作成（Claude CLI）                              │   │
│  │ ✅ プレビュー（sandbox iframe）                          │   │
│  │ ✅ プロジェクト保存・読み込み（GCE永続ディスク）            │   │
│  │ ❌ 公開機能 → 「公開はもう少しお待ちください」             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  Phase 2: Player Sandbox（ゲーム配信）                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✅ Phase 1の全機能                                       │   │
│  │ ✅ ゲーム公開（play.v2.dreamcore.gg）                    │   │
│  │ ✅ ゲーム一覧・共有                                       │   │
│  │ ✅ Player Sandbox（CSP、別ドメイン隔離）                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1 スケジュール

| Day | 作業 | 詳細 |
|-----|------|------|
| 1 | 環境構築 | Supabase設定、GCSバケット作成、GCEインスタンス起動 |
| 2 | コード対応 | 既存MVPコードのSupabase/GCS対応（※V1からのデータ移行は不要） |
| 3-4 | 統合・調整 | 認証連携、ファイル保存、プレビュー確認 |
| 5 | デプロイ・検証 | 本番デプロイ、動作確認 |

**Phase 1 合計: 5日間**

### Phase 2 スケジュール（Phase 1リリース後）

| Day | 作業 | 詳細 |
|-----|------|------|
| 1 | DNS設定 | play.v2.dreamcore.gg → GCE |
| 2 | GCS静的配信 | games/ バケットの公開設定、CORS |
| 3 | Player Sandbox | CSPヘッダー、iframe埋め込み |
| 4 | 公開API | POST /publish、ゲーム一覧API |
| 5 | UI実装 | 公開ボタン、ゲーム一覧ページ |

**Phase 2 合計: 5日間**

> **注:** Docker Sandboxの実装はPhase 1/2ともに不要（クライアントiframeで隔離済み）

### Day 1: 環境構築

```bash
# Supabase
- プロジェクト作成（東京リージョン）
- Google OAuth設定
- テーブル作成（users, projects, games）

# GCS（Phase 1）
- バケット作成: dreamcore-v2-projects（非公開）
- サービスアカウント作成
# ※ dreamcore-v2-games（公開）はPhase 2で作成

# GCE
- インスタンス作成: e2-standard-2
- Docker, Docker Compose インストール
- ドメイン設定: v2.dreamcore.gg
```

### Day 2: コード対応

既存MVPコードをSupabase認証/GCE永続ディスク保存に修正します。
**V1からのデータ移行は不要**（V2は新規ユーザーのみ）

```javascript
// Before: SQLite
const db = require('better-sqlite3')('data.db');
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

// After: Supabase
const { data: user } = await supabase.from('users').select().eq('id', id).single();
```

```javascript
// Before: Local FS
fs.writeFileSync(`users/${userId}/${projectId}/index.html`, html);

// After: GCE永続ディスク（正本）
const projectPath = `/data/projects/${userId}/${projectId}`;
await fs.promises.writeFile(`${projectPath}/index.html`, html);
// → 非同期でGCSにバックアップ
await backupToGCS(projectPath);
```

### Day 3-4: 統合・調整

- 認証フロー（Supabase Auth + Google OAuth）
- ファイル保存・読み込み（GCE永続ディスク + GCSバックアップ）
- プレビュー表示（クライアントiframe）
- 「公開はもう少しお待ちください」メッセージ表示

### 【将来オプション】Docker Sandbox実装

初期リリースでは不要ですが、将来実装する場合の設定例：

```yaml
# docker-compose.yml（将来のSandbox実装時）
version: '3.8'

services:
  main:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
    networks:
      - external
      - sandbox-internal

  # Sandboxコンテナは動的に生成される
  # sandbox:
  #   image: dreamcore-sandbox:latest
  #   networks:
  #     - sandbox-internal  # 内部のみ、外部接続不可

networks:
  external:
    driver: bridge
  sandbox-internal:
    driver: bridge
    internal: true  # 外部接続を完全に遮断
```

### Day 5: デプロイ（Phase 1）

```bash
# GCEにデプロイ
gcloud compute scp --recurse ./* dreamcore-v2:~/app/
gcloud compute ssh dreamcore-v2 --command="cd ~/app && docker-compose up -d"

# DNS設定（Phase 1）
v2.dreamcore.gg -> GCE IP
# play.v2.dreamcore.gg はPhase 2で構築
```

---

## 10. コスト見積もり

### 月額コスト（初期: 100 DAU想定）

| サービス | 用途 | 月額（USD） |
|----------|------|-------------|
| GCE (e2-standard-2) | メインサーバー + Sandbox | ~$50 |
| Supabase Pro | DB + Auth | $25 |
| GCS (50GB) | ストレージ | ~$5 |
| ドメイン | v2.dreamcore.gg | $0（既存） |
| **合計** | | **~$80/月** |

### V1との比較

| | V1 | V2 |
|---|---|---|
| Vercel | ~$20 | $0 |
| Supabase | $25 | $25 |
| R2 / GCS | ~$5 | ~$5 |
| GCE | $0 | ~$50 |
| **合計** | ~$50 | ~$80 |

V2はGCEが必要なため若干高いが、Sandbox隔離による安全性向上のトレードオフ。

---

## 11. セキュリティチェックリスト

### Creator Sandbox

- [ ] 非rootユーザーで実行
- [ ] リソース制限（CPU/メモリ/ディスク/プロセス）
- [ ] ネットワーク隔離（外部接続禁止）
- [ ] 実行時間制限（5分）
- [ ] APIキー非共有（Sandboxに渡さない）

### Player Sandbox

- [ ] 別ドメインで配信（play.v2.dreamcore.gg）
- [ ] iframe sandbox属性
- [ ] 厳格なCSP
- [ ] Cookie/LocalStorage隔離

### API / インフラ

- [ ] HTTPS必須
- [ ] JWT検証
- [ ] レート制限
- [ ] 入力バリデーション
- [ ] RLSポリシー
- [ ] パストラバーサル対策（UUID検証 + path.resolve + startsWith検証）

---

## 12. 監視・監査設計

### メトリクス

| メトリクス | 閾値 | アラート |
|-----------|------|----------|
| CPU使用率 | > 80% | Warning |
| メモリ使用率 | > 85% | Warning |
| コンテナ数 | > 30 | Warning |
| エラー率 | > 5% | Critical |

### ログ

```javascript
const log = {
  timestamp: new Date().toISOString(),
  level: 'info',
  userId: user.id,
  action: 'sandbox.create',
  duration: 1234,
};
```

---

## 13. 将来の拡張

### 短期（Phase 2リリース後）

| 機能 | 説明 |
|------|------|
| V1連携 | V1にV2ゲームを表示（オプション） |
| Pro Plan | 有料プランの導入 |
| Next.js移行 | Vite + React → Next.js（SSR/SEO対応） |

### 中期

| 機能 | 説明 |
|------|------|
| マルチプレイヤー | WebRTC対戦 |
| アセットマーケット | ユーザー間共有 |
| Docker Sandbox | AI生成コードのサーバーサイド隔離実行 |

### 長期

| 機能 | 説明 |
|------|------|
| モバイルアプリ | iOS/Android |
| 収益化 | ゲーム内広告、課金 |

### フロントエンド移行計画（Vite → Next.js）

初期リリースはVite + Reactで構築し、安定後にNext.jsへ移行予定。

| 項目 | 現状（Vite） | 将来（Next.js） |
|------|-------------|----------------|
| SSR | なし | あり |
| SEO | 弱い | 強い |
| ホスティング | GCE | Vercel最適化 |
| 移行タイミング | - | V2安定後、SEOが必要になったら |

**移行が容易な理由:**
- Reactコンポーネントはほぼそのまま使える
- 主な変更はルーティングとAPI部分のみ

### マイクロサービス化（将来アーキテクチャ）

スケールが必要になった場合、モノリスからマイクロサービスへ分離。

> **注意:** この将来アーキテクチャでは、Cloud Run（ステートレス）を使用するため、
> GCSがプライマリストレージとなります（現行Phase 1/2のGCE永続ディスク方式とは異なる）。

**将来のアーキテクチャ図:**

```
                                    ┌─────────────────┐
                                    │   Cloudflare    │
                                    │   (CDN + WAF)   │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
           ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
           │v2.dreamcore.gg│      │play.v2.dream  │      │api.v2.dream   │
           │               │      │   core.gg     │      │   core.gg     │
           │  Cloud Run    │      │  Cloud Run    │      │  Cloud Run    │
           │  or Vercel    │      │  (静的配信)   │      │  (API)        │
           │               │      │               │      │               │
           │ - Landing     │      │ - ゲーム実行  │      │ - REST API    │
           │ - Dashboard   │      │ - iframe内    │      │ - WebSocket   │
           │ - Editor UI   │      │ - CSP適用     │      │   Proxy       │
           └───────┬───────┘      └───────────────┘      └───────┬───────┘
                   │                                              │
                   │              ┌───────────────┐               │
                   └──────────────┤   Supabase    ├───────────────┘
                                  │               │
                                  │ - PostgreSQL  │
                                  │ - Auth        │
                                  │ - Realtime    │
                                  └───────┬───────┘
                                          │
                                  ┌───────┴───────┐
                                  ▼               ▼
                         ┌──────────────┐ ┌──────────────┐
                         │     GCS      │ │   GCE        │
                         │   Storage    │ │  Sandbox     │
                         │              │ │  Cluster     │
                         │ - projects/  │ │              │
                         │ - games/     │ │ ┌─────────┐  │
                         │ - assets/    │ │ │Sandbox A│  │
                         └──────────────┘ │ ├─────────┤  │
                                          │ │Sandbox B│  │
                                          │ └─────────┘  │
                                          └──────────────┘
```

**サービス分離の基準:**

| タイミング | 分離するサービス | 理由 |
|-----------|-----------------|------|
| DAU 500+ | API Gateway | API負荷分散 |
| DAU 1000+ | WebSocket Proxy | 同時接続数増加 |
| サーバーサイド実行が必要 | Sandbox Orchestrator | セキュリティ隔離 |

**分離時のサービス一覧:**

| サービス | 役割 | 技術 |
|----------|------|------|
| Web Frontend | UI表示 | Next.js (Vercel) |
| API Gateway | リクエスト処理 | Cloud Run |
| WebSocket Proxy | リアルタイム通信 | Cloud Run / GCE |
| Sandbox Orchestrator | コンテナ管理 | GCE + Dockerode |
| Play Server | ゲーム配信 | Cloud Run (静的) |

**なぜ最初からマイクロサービスにしないか:**

| 観点 | モノリス | マイクロサービス |
|------|---------|-----------------|
| 開発速度 | 速い | 遅い |
| デバッグ | 簡単 | 複雑 |
| 運用コスト | 低い | 高い |
| チーム規模 | 1人でOK | 複数人向け |

→ **初期はモノリスで素早くリリースし、必要になったら分離**

---

## 付録

### 技術スタック一覧

| カテゴリ | 技術 | 備考 |
|----------|------|------|
| Backend | Node.js 20 + Express | |
| Frontend | Vite + React | 将来Next.jsに移行予定 |
| Database | Supabase (PostgreSQL) | |
| Storage | Google Cloud Storage | |
| Container | Docker | Sandbox隔離は将来オプション |
| AI | Claude CLI | |

### 参考リンク

- [Supabase Docs](https://supabase.com/docs)
- [Docker Security](https://docs.docker.com/engine/security/)
- [CSP Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
