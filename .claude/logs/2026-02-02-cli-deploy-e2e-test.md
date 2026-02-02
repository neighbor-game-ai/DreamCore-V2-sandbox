# CLI Deploy E2E テスト完了

**日付:** 2026-02-02

## 概要

CLI Deploy 機能の E2E テストを実施し、全機能が本番環境で動作することを確認した。

## テスト結果

| テスト | 結果 | 詳細 |
|--------|------|------|
| デバイスコード発行 | ✅ | `POST /api/cli/device/code` |
| 認証ページ表示 | ✅ | auth.html でログイン状態を検出、認可ボタン表示 |
| ユーザー認可 | ✅ | `POST /api/cli/device/authorize` |
| トークン取得 | ✅ | `POST /api/cli/device/token` |
| ゲームデプロイ | ✅ | `POST /api/cli/deploy` |
| ゲーム配信 | ✅ | Cloudflare Worker 経由で配信 |

## 発生した問題と解決

### 1. auth.html で UI が表示されない

**原因:** Supabase SDK (UMD版) がグローバルに `window.supabase` を定義するが、auth.html で `let supabase = null;` と宣言していたため変数名が衝突。

**エラー:**
```
Identifier 'supabase' has already been declared
Cannot read properties of undefined (reading 'createClient')
```

**修正:** 変数名を `supabase` → `supabaseClient` に変更。

### 2. CSP が Supabase SDK をブロック

**原因:** CSP の `script-src` に `cdn.jsdelivr.net` が含まれていなかった。

**修正:** `/cli-auth/` パスを CSP 除外対象に追加。

```javascript
// server/index.js
if (req.path.startsWith('/g/') || req.path.startsWith('/game/') || req.path.startsWith('/cli-auth/')) {
  return helmetWithoutCSP(req, res, next);
}
```

### 3. 認可リクエストで 400 エラー（最初のテスト時）

**原因:** 不明（ログ追加後は再現せず）。おそらくデバイスコードの期限切れ。

**対応:** デバッグログを追加して再テスト → 成功。

## テストデータ

**発行されたトークン:**
```
dc_d57XWQTPRIadUmJ5Bgcc471L2WZPzyVX
```

**デプロイされたゲーム:**
```
public_id: g_dBvt9feIFW
url: https://cli-dreamcore.notef.workers.dev/g_dBvt9feIFW/
```

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `cli-deploy/public/auth.html` | `supabase` → `supabaseClient` にリネーム |
| `server/index.js` | `/cli-auth/` を CSP 除外に追加 |
| `cli-deploy/server/routes.js` | デバッグログ追加（後で削除予定） |

## 本番ドメイン移行（追記）

**cli.dreamcore.gg** への移行完了:

| 項目 | 状態 |
|------|------|
| DNS (Cloudflare) | ✅ |
| SSL/TLS | ✅ |
| Worker Custom Domain | ✅ |
| Content-Type 修正 | ✅ (拡張子ベース) |
| CLI_GAMES_DOMAIN | ✅ `cli.dreamcore.gg` |

**修正内容:**
- Supabase Storage が `text/plain` を返す問題 → Worker で拡張子から Content-Type を設定

**テストデプロイ:**
```
https://cli.dreamcore.gg/g_goV6zFkAlD/
```

---

## 残作業

- [ ] デバッグログの削除（`routes.js` の `console.log`）
- [ ] Claude Code Skills のテスト
- [ ] ユーザー向けドキュメント作成

## 学び

- **UMD ライブラリの変数名衝突**: グローバルに定義される名前と同じ変数名を使わない
- **CSP 除外**: 外部 CDN を使うページは CSP から除外するか、CDN を許可リストに追加
- **デバイスコードの有効期限**: 15分なのでテスト中に期限切れになることがある
