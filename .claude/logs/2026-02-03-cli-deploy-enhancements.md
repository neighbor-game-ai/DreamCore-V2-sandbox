# CLI Deploy 機能拡張

**日付:** 2026-02-03
**作業者:** Claude

## 実施内容

### 1. Skills 自動更新機能

ユーザーが手動でスキルを再インストールする必要をなくすため、自動更新機能を実装。

- `/skills/dreamcore-deploy/version.json` - バージョン情報配信
- `/skills/dreamcore-deploy/SKILL.md` - スキルファイル配信
- Step 0 でバージョン比較 → 更新確認 → ダウンロード・再インストール
- インストール先の自動判定（ローカル / グローバル）

### 2. メタデータ編集 API

ファイルを再アップロードせずにメタデータのみを更新する機能。

- `PATCH /api/cli/projects/:id` エンドポイント追加
- `validateMetadataUpdate()` - ホワイトリスト方式のバリデーション
- 許可フィールド: title, description, howToPlay, tags, visibility, allowRemix
- Rate limit: 30 req/min

### 3. CodeRabbit 指摘対応

| 指摘 | 対応 |
|------|------|
| cli_projects 更新エラー無視 | エラーチェック追加、失敗時は500で中断 |
| cli_published_games 0件 | `.select('id')` で行数チェック、0件なら404 |
| SKILL.md curl例が全項目 | 最小例に修正 |
| CLI-ARCHITECTURE.md 簡潔 | API-REFERENCE.md への参照リンク追加 |

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/index.js` | `/skills/` 静的配信エンドポイント追加 |
| `cli-deploy/server/routes.js` | PATCH エンドポイント追加、エラーハンドリング強化 |
| `cli-deploy/server/upload.js` | `validateMetadataUpdate()` 追加 |
| `cli-deploy/skills/dreamcore-deploy/SKILL.md` | v1.2.0（自動更新、メタデータ編集フロー） |
| `cli-deploy/skills/dreamcore-deploy/version.json` | バージョン管理ファイル新規作成 |
| `docs/API-REFERENCE.md` | CLI Deploy API セクション追加 |
| `docs/CLI-ARCHITECTURE.md` | PATCH エンドポイント、参照リンク追加 |
| `cli-deploy/README.md` | API 一覧に PATCH 追加 |
| `server/modules/profile/routes.js` | プロファイルモジュール追加（未コミットだったファイル） |

## コミット履歴

1. `0ea77c6` - feat(skills): add auto-update mechanism for DreamCore Deploy skill
2. `f3d84ba` - feat(profile): add profile module routes, service, validators
3. `4d650d7` - feat(cli): add metadata editing API (PATCH /projects/:id)
4. `adb2b13` - fix(cli): handle cli_projects update errors and empty results

## 検証結果

- Skills エンドポイント動作確認: `https://v2.dreamcore.gg/skills/dreamcore-deploy/version.json`
- PATCH エンドポイント認証チェック: 401 返却確認
- GCE デプロイ: 正常稼働確認

## 学び・注意点

- 未コミットファイルがあるとデプロイ後にサーバーがクラッシュする（profile/routes.js の件）
- DB 更新のエラーハンドリングは必ず行う（部分更新防止）
- curl 例とドキュメントの説明は一貫性を保つ
