# Modal Sandbox 統合 - エンジニア向け引き継ぎメッセージ

## 概要

DreamCore-V2 に Modal Sandbox を統合する作業の引き継ぎです。
既存の `DreamCore-V2-modal` 実装を再利用し、Express + WebSocket のUXを完全維持します。

---

## 最重要ポイント

1. **フロントエンドは一切変更しない** - WebSocket通信はそのまま維持
2. **既存Modal実装を再利用** - `modal/app.py` をそのまま使用
3. **DB操作はExpress集約** - ModalにSupabase認証情報を渡さない
4. **`USE_MODAL=true/false`** で即ロールバック可能

---

## 参照ドキュメント（すべて確認必須）

### メイン引き継ぎ文書
```
/Users/admin/DreamCore-V2-sandbox/docs/ENGINEER-HANDOFF.md
```
↑ **これを最初に読んでください**（アーキテクチャ図、SSE→WS変換ルール、実装詳細）

### 移行計画・設計書
| ドキュメント | パス |
|-------------|------|
| 移行計画書 | `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-MIGRATION-PLAN.md` |
| 技術設計書 | `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-DESIGN.md` |
| V2アーキテクチャ | `/Users/admin/DreamCore-V2-sandbox/docs/ARCHITECTURE-V2.md` |

### Modal固有の参照資料
| ドキュメント | パス |
|-------------|------|
| Modalアーキテクチャ | `/Users/admin/DreamCore-V2-sandbox/docs/modal-architecture/MODAL-SANDBOX-ARCHITECTURE.md` |
| クイックリファレンス | `/Users/admin/DreamCore-V2-sandbox/docs/modal-architecture/QUICK-REFERENCE.md` |

### 既存Modal実装（再利用）
```
/Users/admin/DreamCore-V2-modal/modal/app.py
```

### 現行Express実装（改修対象）
| ファイル | パス |
|----------|------|
| Claude実行 | `/Users/admin/DreamCore-V2-sandbox/server/claudeRunner.js` |
| ジョブ管理 | `/Users/admin/DreamCore-V2-sandbox/server/jobManager.js` |
| 認証 | `/Users/admin/DreamCore-V2-sandbox/server/authMiddleware.js` |
| 設定 | `/Users/admin/DreamCore-V2-sandbox/server/config.js` |
| DB操作 | `/Users/admin/DreamCore-V2-sandbox/server/database-supabase.js` |

---

## アーキテクチャ

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

## SSE → WS 変換ルール（固定）

Modal からの SSE:
```
data: {"type":"status","message":"..."}
data: {"type":"stream","content":"..."}
data: {"type":"done","success":true}
data: {"type":"error","error":"..."}
```

Express での変換:
| SSE data.type | WS message type |
|---------------|-----------------|
| `status` | `progress` |
| `stream` | `stream` |
| `done` | `completed` |
| `error` | `failed` |

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

## 環境変数

### Express側（追加）
```bash
USE_MODAL=true
MODAL_ENDPOINT=https://xxx.modal.run/generate
MODAL_INTERNAL_SECRET=your-shared-secret
```

### Modal側
```bash
modal secret create dreamcore-secrets \
  ANTHROPIC_API_KEY=sk-ant-xxx \
  MODAL_INTERNAL_SECRET=your-shared-secret
```

**注意**: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Modal に渡さない

---

## 質問があれば

詳細は引き継ぎ文書を参照:
```
/Users/admin/DreamCore-V2-sandbox/docs/ENGINEER-HANDOFF.md
```
