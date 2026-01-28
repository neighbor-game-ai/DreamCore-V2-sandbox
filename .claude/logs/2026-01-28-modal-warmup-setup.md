# Modal ウォームアップ設定

**日付:** 2026-01-28

## 概要

Modal 関数コンテナのコールドスタートを軽減するため、5分ごとに `list_files` エンドポイントを叩く cron ジョブを GCE に設定した。

## 背景

- Modal のサーバーレス関数は、しばらく使われないとコンテナがスリープ状態になる
- 次回呼び出し時にコールドスタートが発生し、数秒の遅延が生じる
- 定期的に軽いリクエストを送ることでコンテナをウォーム状態に保つ

**注意:** gVisor Sandbox 自体は毎回起動するため、この対策ではサンドボックス起動時間は改善されない。

## 実装内容

### 1. ウォームアップ用プロジェクト作成

DreamCore で専用プロジェクトを作成:
- 名前: `__warmup__`
- ID: `bdcc77af-3423-43b9-9e91-d599a336ba2b`
- ユーザー: `ed58dfd0-03c8-4617-ae86-f28df6f562ff`

全ゼロ UUID は `validate_ids()` に弾かれる可能性があるため、実在する UUID を使用。

### 2. GCE にウォームアップスクリプト設置

```
パス: /home/notef/bin/modal-warmup.sh
```

スクリプト内容:
- `.env` から `MODAL_INTERNAL_SECRET` を読み込み
- `list_files` エンドポイントにリクエスト
- 200/404 以外の場合のみエラーログ出力

### 3. cron ジョブ設定

```bash
*/5 * * * * /home/notef/bin/modal-warmup.sh
```

5分ごとに実行。cron パッケージは今回インストール（Ubuntu にデフォルトで入っていなかった）。

### 4. ドキュメント更新

- `scripts/modal-warmup.sh` - ローカルにもスクリプト保存
- `docs/MODAL-WARMUP-SETUP.md` - セットアップ手順書
- `.claude/skills/gce-deploy/SKILL.md` - GCE 接続情報を更新
- `CLAUDE.md` - GCE 本番環境セクション追加

## GCE 接続情報（確定）

| 項目 | 値 |
|------|-----|
| Instance | `dreamcore-v2` |
| Zone | `asia-northeast1-a` |
| User | `notef` |
| IP | `35.200.79.157` |
| Port | `3005` |
| App Dir | `/home/notef/DreamCore-V2-sandbox` |

SSH コマンド:
```bash
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="コマンド"
```

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `scripts/modal-warmup.sh` | 新規作成 |
| `docs/MODAL-WARMUP-SETUP.md` | 新規作成 |
| `.claude/skills/gce-deploy/SKILL.md` | 全面更新（正しい接続情報） |
| `CLAUDE.md` | GCE 本番環境セクション追加 |

## GCE 上の変更

| パス | 内容 |
|------|------|
| `/home/notef/bin/modal-warmup.sh` | ウォームアップスクリプト |
| `/home/notef/logs/modal-warmup.log` | エラーログ（エラー時のみ） |
| crontab | `*/5 * * * *` ジョブ追加 |

## 検証結果

- 手動実行テスト: OK
- cron 登録確認: OK

## 学び・注意点

1. **GCE インスタンスが2台ある**
   - `dreamcorecode` (34.84.28.42) - 古い GameCreatorMVP
   - `dreamcore-v2` (35.200.79.157) - DreamCore-V2-sandbox（本番）

2. **gce-deploy スキルは古かった**
   - 古い GameCreatorMVP 用の情報だった
   - プロジェクト専用スキルとして更新

3. **Ubuntu に cron がデフォルトで入っていない**
   - `apt install cron` が必要だった
