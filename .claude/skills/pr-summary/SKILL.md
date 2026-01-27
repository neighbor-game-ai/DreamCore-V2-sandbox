---
name: pr-summary
description: PR 用のサマリーを生成するスキル。変更内容を分析し、レビュアーが理解しやすい説明を作成します。
---

# PR Summary Skill

PR 用のサマリーを生成するスキル。

## トリガー

以下のような依頼で実行:
- 「PRの説明を書いて」
- 「PRサマリー作成して」
- 「マージリクエストの説明を書いて」

## 生成手順

### 1. 変更内容の収集

```bash
# 変更ファイル一覧
git diff --name-only origin/main

# 変更の統計
git diff --stat origin/main

# コミット履歴
git log --oneline origin/main..HEAD
```

### 2. 変更の分類

| カテゴリ | 対象ファイル |
|---------|-------------|
| フロントエンド | `public/`, `next/src/app/`, `next/src/components/` |
| バックエンド | `server/`, `next/src/app/api/` |
| Modal | `modal/` |
| 設定 | `package.json`, `.env*`, `CLAUDE.md` |
| ドキュメント | `docs/`, `*.md` |
| テスト | `test-*.js`, `*.test.ts` |

### 3. サマリー生成

## PR テンプレート

```markdown
## Summary

<!-- 1-3 bullet points describing the changes -->
-
-
-

## Changes

### Added
-

### Changed
-

### Removed
-

## Test plan

<!-- How to verify these changes work correctly -->
- [ ]
- [ ]

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## Checklist

- [ ] CLAUDE.md の原則に準拠している
- [ ] DreamCore-V2 との互換性を維持している
- [ ] テストが PASS している
- [ ] エラーハンドリングが適切
- [ ] セキュリティ上の問題がない

---
Generated with Claude Code
```

## DreamCore 固有のチェックポイント

PR を作成する前に確認:

### 1. V2 互換性
- [ ] フロントエンドの変更は最小限か
- [ ] API エンドポイントの形式は維持されているか
- [ ] WebSocket メッセージ形式は変更されていないか

### 2. Modal 統合
- [ ] Modal デプロイは必要か（必要なら手順を記載）
- [ ] 環境変数の追加は必要か

### 3. セキュリティ
- [ ] 認証が適切に実装されているか
- [ ] RLS ポリシーが有効か
- [ ] 秘密情報がハードコードされていないか

## 出力例

```markdown
## Summary

- Modal Sandbox からのファイル取得 API を実装
- プレビュー配信をサブパス方式に変更
- エラーハンドリングを強化

## Changes

### Added
- `next/src/app/api/preview/[projectId]/[...path]/route.ts` - プレビューファイル配信

### Changed
- `modal/app.py` - get_file エンドポイント追加
- `next/src/app/api/generate/route.ts` - エラーハンドリング改善

### Removed
- なし

## Test plan

- [ ] 新規プロジェクト作成後、プレビューが表示されること
- [ ] サブパス（CSS, JS）が正しく読み込まれること
- [ ] 存在しないファイルへのアクセスで 404 が返ること

## Checklist

- [x] CLAUDE.md の原則に準拠している
- [x] DreamCore-V2 との互換性を維持している
- [ ] テストが PASS している
- [x] エラーハンドリングが適切
- [x] セキュリティ上の問題がない

---
Generated with Claude Code
```
