---
name: modal-deploy
description: Modal へのデプロイを実行するスキル。スキルアップロードとアプリデプロイを順番に実行し、作業ログに記録します。
---

# Modal Deploy Skill

Modal へのデプロイを実行するスキル。

## トリガー

以下のような依頼で実行:
- 「Modalにデプロイして」
- 「Modal更新して」
- 「スキルをアップロードして」
- 「app.pyをデプロイして」

## 前提条件

- Modal CLI がインストール済み (`pip install modal`)
- Modal にログイン済み (`modal token new`)
- 作業ディレクトリ: `/Users/admin/DreamCore-V2-modal/modal`

## デプロイ手順

### 1. スキルのアップロード（必要な場合）

スキルファイルを Modal Volume にアップロード:

```bash
cd /Users/admin/DreamCore-V2-modal/modal
modal run upload_skills.py
```

### 2. アプリのデプロイ

```bash
cd /Users/admin/DreamCore-V2-modal/modal
modal deploy app.py
```

### 3. デプロイ確認

```bash
# ログ確認
modal logs dreamcore --follow

# 特定エンドポイントのみ
modal logs dreamcore --filter="generate_game"
```

## 作業記録（必須）

デプロイ実行後、必ず以下を記録:

### 1. 作業ログに追記

`.claude/logs/YYYY-MM-DD-modal-deploy.md` に記録:

```markdown
# Modal Deploy

**日付:** YYYY-MM-DD HH:MM
**コミット:** (git rev-parse --short HEAD の結果)

## 実行コマンド

- `modal run upload_skills.py` (実行した場合)
- `modal deploy app.py`

## 結果

- 成功 / 失敗
- エラーがあれば内容

## 変更内容

- 変更したファイル一覧
```

### 2. コミットメッセージに明記（変更がある場合）

```
deploy: Modal app.py デプロイ (コミット abc1234)
```

## トラブルシューティング

### Modal 認証エラー

```bash
modal token new
```

### Volume が見つからない

```bash
modal volume list
# dreamcore-data, dreamcore-global が存在するか確認
```

### デプロイが反映されない

1. `modal logs dreamcore` でエラー確認
2. Vercel の環境変数 `MODAL_ENDPOINT` が正しいか確認

## 注意事項

- Git push だけでは Modal は更新されない（手動デプロイ必須）
- スキル変更時は `upload_skills.py` を先に実行
- 本番環境に影響するため、テスト後にデプロイすること
