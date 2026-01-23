# Asset Architecture V2 実装ログ

**日付:** 2026-01-23
**ブランチ:** fix/image-loading → main にマージ済み

---

## 概要

アセットURLをUUIDベースからエイリアスベースに変更し、AIが正しいURLを直接生成できるようにする「Zero Replacement」アーキテクチャを実装。

---

## 実施内容

### 1. DBマイグレーション (005_asset_v2.sql)

新規カラム追加:
- `alias` - ユーザーフレンドリーなファイル名 (NOT NULL)
- `hash` - SHA256ハッシュ (NOT NULL)
- `hash_short` - ハッシュ先頭8文字 (GENERATED)
- `original_asset_id` - リミックス元参照
- `created_in_project_id` - 生成元プロジェクト
- `is_remix_allowed` - リミックス許可フラグ
- `is_global` - グローバルアセットフラグ
- `category` - カテゴリ（グローバル用）

制約:
- `UNIQUE(owner_id, alias)` - ユーザー内でエイリアス一意
- `CHECK(is_global=TRUE AND owner_id IS NULL OR is_global=FALSE AND owner_id IS NOT NULL)`
- 部分インデックス: `UNIQUE(alias) WHERE is_global = TRUE`

### 2. 新エンドポイント

```
GET /user-assets/:userId/:alias   - ユーザーアセット配信
GET /global-assets/:category/:alias - グローバルアセット配信
```

### 3. バックエンド更新

**server/config.js:**
- `getUserAssetsPathV2()` - 新ディレクトリ構造
- `getProjectPathV2()` - V2プロジェクトパス
- `getGlobalAssetsPath()` - グローバルアセットパス

**server/database-supabase.js:**
- `aliasExists()` - エイリアス存在チェック（is_deleted条件なし）
- `getAssetByAliasAdmin()` - エイリアスでアセット取得
- `getGlobalAssetAdmin()` - グローバルアセット取得
- `createAssetV2()` - V2形式でアセット作成

**server/index.js:**
- `/api/assets/upload` - V2形式対応（alias, hash生成）
- アセット一覧のURL形式を `/user-assets/{userId}/{alias}` に変更
- サムネイルエンドポイントを公開化

**server/userManager.js:**
- `saveGeneratedImage()` - V2形式対応

### 4. フロントエンド更新

**public/app.js:**
- `getAuthenticatedAssetUrl()` - 非推奨化（URLをそのまま返す）

**public/publish.js:**
- `getAuthenticatedUrl()` - 非推奨化

---

## 専門家レビュー対応

### P0: alias再利用とUNIQUE制約衝突
- **問題:** `aliasExists()`が`is_deleted=false`でフィルタしていたため、削除済みaliasを再利用するとUNIQUE制約に衝突
- **対応:** `is_deleted`条件を削除

### P1: alias/filenameサニタイズ不足
- **問題:** 日本語・特殊文字がURLに入る可能性
- **対応:** `replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)` + 空の場合'image'フォールバック

### P1: DB失敗時の孤児ファイル
- **問題:** `fs.writeFileSync`後に`createAssetV2`が失敗するとファイルが残る
- **対応:** try-catchで失敗時に`fs.unlinkSync()`

### 運用改善: alias競合ログ
- 競合発生時のみログ出力
- `[assets] alias collision: user=... base=... tried=...`
- `[assets] alias resolved: user=... final=...`

---

## テスト結果

| テスト項目 | 結果 |
|-----------|------|
| アップロード画像の表示 | ✅ |
| AI生成画像のDB登録 | ✅ |
| AI生成画像のゲーム内表示 | ✅ |
| 同名画像の自動採番 (player.png → player_2.png) | ✅ |
| alias競合ログ出力 | ✅ |
| DB失敗時の孤児ファイル削除 | ✅ |

---

## コミット履歴

```
02b6f81 fix: Address P0/P1 issues in V2 asset handling
3a8a625 fix: Update saveGeneratedImage to use V2 asset format
1b20913 feat: Implement Asset Architecture V2 with alias-based URLs
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `supabase/migrations/005_asset_v2.sql` | 新規作成 - DBスキーマ変更 |
| `.claude/plans/asset-architecture-v2.md` | 新規作成 - 設計ドキュメント |
| `server/config.js` | V2パスヘルパー追加 |
| `server/database-supabase.js` | V2アセット関数追加 |
| `server/index.js` | V2エンドポイント、upload更新 |
| `server/userManager.js` | saveGeneratedImage V2対応 |
| `public/app.js` | 認証URL関数非推奨化 |
| `public/publish.js` | 認証URL関数非推奨化 |

---

## 設計判断

1. **is_public=true デフォルト:** ゲーム公開プラットフォームなので、アセットは公開前提
2. **Zero Replacement:** AIが`/user-assets/{userId}/{alias}`を直接生成、HTML置換不要
3. **alias競合時は採番:** `player.png` → `player_2.png` → `player_3.png`
4. **物理ファイル名にハッシュ含む:** `player_0e853434.png`（重複管理）

---

## 次のステップ

- [ ] Phase 2: 公開機能の設計・実装
- [ ] `/discover` ページ実装
- [ ] グローバルアセット機能（季節素材等）
