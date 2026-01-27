---
name: architecture-check
description: CLAUDE.md の原則に沿っているか確認するスキル。MVP思考や機能削減を検出し、製品版品質を維持します。
---

# Architecture Check Skill

CLAUDE.md の原則に沿っているか確認するスキル。

## トリガー

以下のような依頼で実行:
- 「アーキテクチャ確認して」
- 「原則違反ないか見て」
- 「CLAUDE.mdに沿ってるか確認」
- 「設計レビューして」

## チェック項目

### 1. MVP思考の検出（禁止）

以下のパターンがコードやコメントにないか確認:

| 禁止パターン | 理由 |
|-------------|------|
| `// TODO: 後で実装` | 後回しは許容されない |
| `// 簡易版` | 簡易版は存在しない |
| `// とりあえず` | 「とりあえず」は禁止 |
| `// MVP` | MVP思考は禁止 |
| `// Phase 2 で対応` | 機能削減は禁止 |
| `throw new Error('Not implemented')` | 未実装は許容されない |

```bash
# 検出コマンド
grep -rn "TODO\|FIXME\|簡易\|とりあえず\|後で\|MVP\|Phase 2" --include="*.js" --include="*.ts" server/ public/
```

### 2. 機能の完全性確認

DreamCore-V2 にある機能がすべて実装されているか:

- [ ] プロジェクト CRUD（作成・読取・更新・削除）
- [ ] コード生成（Claude CLI 経由）
- [ ] リアルタイムプレビュー
- [ ] アセット管理（アップロード・削除・検索）
- [ ] 認証（Google OAuth + Supabase Auth）
- [ ] 所有者チェック（RLS + API レベル）
- [ ] WebSocket 通信
- [ ] エラーハンドリング

### 3. UX 変更の検出（禁止）

フロントエンドの変更がないか確認:

```bash
# public/ ディレクトリの変更を検出
git diff --name-only origin/main -- public/
```

変更がある場合、Modal 統合に必要な最小限の変更か確認。

### 4. API 契約の維持確認

WebSocket メッセージ形式、REST API の形式が変更されていないか:

```bash
# WebSocket メッセージタイプ
grep -rn "type:" server/ | grep -E "send\(|emit\("

# REST API レスポンス形式
grep -rn "res\.json\|res\.status" server/
```

### 5. エラーハンドリング確認

適切なエラーハンドリングがあるか:

```bash
# try-catch の存在確認
grep -rn "try {" server/
grep -rn "catch" server/

# エラーレスポンスの確認
grep -rn "res\.status(4\|res\.status(5" server/
```

### 6. セキュリティ確認

- [ ] UUID 検証が統一形式か
- [ ] 認証ミドルウェアが適用されているか
- [ ] RLS ポリシーが有効か
- [ ] 環境変数がハードコードされていないか

```bash
# ハードコードされた秘密情報の検出
grep -rn "sk-\|key.*=.*['\"]" --include="*.js" --include="*.ts" server/ public/
```

## 出力形式

```markdown
## アーキテクチャチェック結果

**実行日時:** YYYY-MM-DD HH:MM
**対象:** DreamCore-V2-sandbox

### MVP思考の検出
- 状態: OK / 検出あり
- 検出箇所: (あれば)

### 機能の完全性
- 状態: 完全 / 不足あり
- 不足機能: (あれば)

### UX 変更
- 状態: 変更なし / 変更あり
- 変更ファイル: (あれば)

### API 契約
- 状態: 維持 / 変更あり

### エラーハンドリング
- 状態: 適切 / 不足

### セキュリティ
- 状態: OK / 問題あり

### 総合判定
- OK: 原則に準拠
- NG: 要修正（理由）
```

## 根幹原則（再掲）

> **これは MVP ではありません。**
>
> DreamCore-V2-sandbox は、本番稼働中の DreamCore-V2 の**完全なクローン**に Modal Sandbox を統合するプロジェクトです。機能削減、簡略化、「とりあえず動く版」は一切許容されません。
