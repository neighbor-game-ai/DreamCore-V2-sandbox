# DreamCore-V2 Sandbox 化 - 新担当向けオンボーディング

**作成日**: 2026-01-27

---

## はじめに

DreamCore-V2-sandbox プロジェクトへようこそ。

このプロジェクトは、本番稼働中の **DreamCore-V2** に **Modal Sandbox** を統合し、
Claude CLI の実行を安全な隔離環境で行えるようにするものです。

**最も重要なこと**: これは MVP ではありません。完全な製品版です。

---

## 最初に読むべきドキュメント（この順番で）

### 1. プロジェクトの根幹ルール
```
/Users/admin/DreamCore-V2-sandbox/CLAUDE.md
```
- プロジェクトの絶対原則
- 禁止事項
- Supabase 設定（DreamCore-V2 と共有）
- 環境変数

### 2. Modal 統合の引き継ぎ文書
```
/Users/admin/DreamCore-V2-sandbox/docs/ENGINEER-HANDOFF.md
```
- アーキテクチャ図
- SSE → WebSocket 変換ルール
- 実装すべきコンポーネント
- セキュリティ要件
- 環境変数設定
- テスト計画

### 3. 移行計画
```
/Users/admin/DreamCore-V2-sandbox/docs/MODAL-MIGRATION-PLAN.md
```
- 6フェーズの移行計画
- 4層防御アーキテクチャ
- ロールバック計画

### 4. 技術設計
```
/Users/admin/DreamCore-V2-sandbox/docs/MODAL-DESIGN.md
```
- modalClient.js の実装詳細
- claudeRunner.js の修正内容
- SSE パース実装

---

## 絶対に守るべき原則

| 原則 | 説明 |
|------|------|
| **機能の完全継承** | DreamCore-V2 の全機能をそのまま引き継ぐ |
| **UX の完全維持** | ユーザー体験は一切変えない。フロントエンドは変更しない |
| **API 契約の維持** | WebSocket / REST API の形式は一切変更しない |
| **Supabase 共有** | DreamCore-V2 と同じ Supabase を使用。新規作成禁止 |

### 変更してよいのは「実行基盤」のみ

```
【変更OK】
- Claude CLI の実行場所: ローカル → Modal Sandbox
- ファイルの保存場所: ローカル → Modal Volume

【変更NG】
- フロントエンドのコード
- WebSocket のメッセージ形式
- REST API のエンドポイント・形式
- 認証フロー
- Supabase の設定・スキーマ
```

---

## アーキテクチャ概要

```
Browser (WebSocket・変更なし)
    ↓
Express Server【UX/API契約の本体】
    - 認証（JWT検証・Supabase Auth）
    - WebSocket管理
    - DB操作（Supabase）
    - アセット管理（/api/assets）
    - SSE→WS変換
    ↓ HTTP + SSE (X-Modal-Internal-Secret)
Modal Sandbox【実行専用】
    - Claude CLI ✅動作確認済み
    - Python ✅動作確認済み
    - Git ✅動作確認済み
    ↓
Modal Volume
    - /data: ユーザーデータ
    - /global: 共有スキル・スクリプト
```

---

## SSE → WebSocket 変換ルール（固定）

| SSE data.type | WS message type |
|---------------|-----------------|
| `status` | `progress` |
| `stream` | `stream` |
| `done` | `completed` |
| `error` | `failed` |

---

## 参照すべきコードベース

### DreamCore-V2-sandbox（作業対象）
```
/Users/admin/DreamCore-V2-sandbox/
```

### DreamCore-V2（参照元・正）
```
/Users/admin/DreamCore-V2/
```
迷ったらこちらの実装に合わせる。

### 既存 Modal 実装（再利用）
```
/Users/admin/DreamCore-V2-modal/modal/app.py
```

---

## 環境変数

### Supabase（DreamCore-V2 からコピー）
```
/Users/admin/DreamCore-V2/.env
```
から以下をコピー:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Modal 統合（新規追加）
```bash
USE_MODAL=true
MODAL_ENDPOINT=https://xxx.modal.run/generate
MODAL_INTERNAL_SECRET=your-shared-secret
```

---

## Supabase 設定

| 項目 | 値 |
|------|-----|
| プロジェクトID | `tcynrijrovktirsvwiqb` |
| リージョン | Northeast Asia (Tokyo) |
| スキーマ定義 | `/Users/admin/DreamCore-V2/.claude/docs/database-schema.md` |

**禁止**: 新規 Supabase プロジェクト作成、テーブル変更、RLS 変更

---

## 命名規則（DreamCore-V2-modal に統一）

| 項目 | 値 |
|------|-----|
| Modal ファイル | `modal/app.py` |
| 環境変数 | `MODAL_INTERNAL_SECRET` |
| Volume マウント | `/global` |
| SSE イベント | `data: {"type":"..."}` |

---

## 実装タスク（優先順）

| # | タスク | 状態 | 担当 |
|---|--------|------|------|
| 1 | Modal app.py 基本実装 | ✅ 動作確認済み | Modal側 |
| 2 | modalClient.js 実装 | 未着手 | Express側 |
| 3 | claudeRunner.js 統合 | 未着手 | Express側 |
| 4 | SSE→WS変換テスト | 未着手 | 統合 |
| 5 | Volume永続化テスト | 未着手 | Modal側 |
| 6 | アセット管理復活 | 未着手 | Express側 |
| 7 | 本番デプロイ・監視設定 | 未着手 | 両方 |

---

## 安全策

```bash
# 問題発生時は即座にローカル実行に戻せる
USE_MODAL=false
```

---

## 全ドキュメント一覧（絶対パス）

### 必読
| ドキュメント | パス |
|-------------|------|
| プロジェクトルール | `/Users/admin/DreamCore-V2-sandbox/CLAUDE.md` |
| 引き継ぎ文書 | `/Users/admin/DreamCore-V2-sandbox/docs/ENGINEER-HANDOFF.md` |
| 移行計画 | `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-MIGRATION-PLAN.md` |
| 技術設計 | `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-DESIGN.md` |

### 参考
| ドキュメント | パス |
|-------------|------|
| V2アーキテクチャ | `/Users/admin/DreamCore-V2-sandbox/docs/ARCHITECTURE-V2.md` |
| CLI Deploy アーキテクチャ | `/Users/admin/DreamCore-V2-sandbox/docs/CLI-ARCHITECTURE.md` |
| Modal アーキテクチャ | `/Users/admin/DreamCore-V2-sandbox/docs/modal-architecture/MODAL-SANDBOX-ARCHITECTURE.md` |
| Modal クイックリファレンス | `/Users/admin/DreamCore-V2-sandbox/docs/modal-architecture/QUICK-REFERENCE.md` |
| アセット管理 | `/Users/admin/DreamCore-V2-sandbox/docs/ASSET_MANAGEMENT.md` |
| DB スキーマ | `/Users/admin/DreamCore-V2/.claude/docs/database-schema.md` |

### Express 実装（改修対象）
| ファイル | パス |
|----------|------|
| Claude実行 | `/Users/admin/DreamCore-V2-sandbox/server/claudeRunner.js` |
| ジョブ管理 | `/Users/admin/DreamCore-V2-sandbox/server/jobManager.js` |
| 認証 | `/Users/admin/DreamCore-V2-sandbox/server/authMiddleware.js` |
| 設定 | `/Users/admin/DreamCore-V2-sandbox/server/config.js` |
| DB操作 | `/Users/admin/DreamCore-V2-sandbox/server/database-supabase.js` |

### Modal 実装（再利用）
| ファイル | パス |
|----------|------|
| Modal App | `/Users/admin/DreamCore-V2-modal/modal/app.py` |

---

## 判断に迷ったら

1. `/Users/admin/DreamCore-V2/` の実装を確認
2. **それと完全に同じ動作** を実装
3. 「機能を削る」方向ではなく「同じにする」方向で判断

---

## 質問があれば

ドキュメントで解決しない場合は、以下を参照してください:
- CLAUDE.md の原則に立ち返る
- DreamCore-V2 の実装を確認する

**ゴール**: DreamCore-V2 のユーザーが、何の違和感もなく使える状態
