# アセット管理設計書

## 概要

DreamCoreにおけるアセット（画像等）の管理方式を定義する。
Remix（フォーク）機能と外部IP連携を見据え、**参照方式**を採用する。

## 背景・要件

### 解決すべき課題

1. **Remix後の削除問題**
   - ユーザーAがゲームを公開
   - ユーザーBがRemix
   - Aが「画像を削除したい」→ Bのプロジェクトから削除できない

2. **外部IP連携**
   - ゲーム会社がキャラクターを期間限定で提供
   - キャンペーン終了後に使用停止したい
   - 全プロジェクトから一括で削除/非表示にする必要がある

### 要件

- 元の所有者がいつでもアセットを削除/非公開にできる
- 削除されたアセットは、Remix先を含む全プロジェクトで非表示になる
- 外部IPパートナーが期間限定でアセットを提供できる
- ストレージ効率が良い（同じ画像を複数回保存しない）

## 設計

### ディレクトリ構造

```
assets/
├── {userId}/
│   ├── {assetId}.png
│   ├── {assetId}.jpg
│   └── ...
├── {ipPartnerId}/          # 外部IPパートナー
│   └── {assetId}.png
└── system/                  # システム共通アセット
    └── placeholder.png      # 削除済み画像の代替表示
```

**例:**
```
assets/
├── login-notef-cc416d9f/
│   ├── 550e8400-e29b-41d4-a716-446655440001.png
│   └── 550e8400-e29b-41d4-a716-446655440002.png
├── login-creator01-410b35c5/
│   └── 550e8400-e29b-41d4-a716-446655440003.png
├── ip-nintendo/
│   └── mario-character-001.png
└── system/
    └── placeholder.png
```

### データベース設計

```sql
-- アセットテーブル
CREATE TABLE assets (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL,                  -- 所有者（ユーザーID or IPパートナーID）
  filename TEXT NOT NULL,                 -- 元のファイル名（player.png）
  path TEXT NOT NULL,                     -- 保存パス（assets/{userId}/{assetId}.png）
  mime_type TEXT,                         -- image/png, image/jpeg
  size INTEGER,                           -- ファイルサイズ（bytes）
  is_public BOOLEAN DEFAULT FALSE,        -- 公開フラグ
  is_deleted BOOLEAN DEFAULT FALSE,       -- 論理削除フラグ
  available_from TEXT,                    -- 公開開始日（期間限定用）
  available_until TEXT,                   -- 公開終了日（期間限定用）
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- プロジェクトとアセットの紐付け
CREATE TABLE project_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  usage_type TEXT DEFAULT 'image',        -- image, audio, etc.
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, asset_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

-- インデックス
CREATE INDEX idx_assets_user_id ON assets(user_id);
CREATE INDEX idx_assets_is_public ON assets(is_public);
CREATE INDEX idx_project_assets_project_id ON project_assets(project_id);
CREATE INDEX idx_project_assets_asset_id ON project_assets(asset_id);
```

### API設計

#### アセットアップロード
```
POST /api/assets/upload
Authorization: required
Content-Type: multipart/form-data

Request:
  - file: 画像ファイル
  - is_public: boolean (default: false)

Response:
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "path": "assets/login-notef-cc416d9f/550e8400-e29b-41d4-a716-446655440001.png",
    "url": "/api/assets/550e8400-e29b-41d4-a716-446655440001"
  }
```

#### アセット取得
```
GET /api/assets/{assetId}
Authorization: optional

Response:
  - 200: 画像バイナリ
  - 403: 非公開アセットへの不正アクセス
  - 404: 削除済みまたは存在しない
  - 410: 公開期間外
```

#### アセット削除（論理削除）
```
DELETE /api/assets/{assetId}
Authorization: required (所有者のみ)

Response:
  - 200: 削除成功
  - 403: 権限なし
```

#### ユーザーのアセット一覧
```
GET /api/users/{userId}/assets
Authorization: required

Response:
  {
    "assets": [
      {
        "id": "...",
        "filename": "player.png",
        "url": "/api/assets/...",
        "is_public": true,
        "usage_count": 5  // 使用プロジェクト数
      }
    ]
  }
```

### フロントエンドでの参照方法

#### 現在（プロジェクト内保存）
```html
<img src="assets/player.png">
```

#### 変更後（API経由）
```html
<img src="/api/assets/550e8400-e29b-41d4-a716-446655440001">
```

または、パフォーマンスのためCDN経由：
```html
<img src="https://cdn.dreamcore.com/assets/550e8400-e29b-41d4-a716-446655440001">
```

### Remix時の挙動

1. **Remix実行時**
   - プロジェクトのコードをコピー
   - `project_assets` に参照を追加（アセット実体はコピーしない）

2. **アセットが削除/非公開になった場合**
   - APIが404または403を返す
   - フロントエンドはプレースホルダー画像を表示
   - ユーザーに「このアセットは利用できなくなりました」と通知

3. **公開期間が終了した場合**
   - APIが410を返す
   - フロントエンドはプレースホルダー画像を表示

### 画像生成時の保存フロー

```
1. AI画像生成リクエスト
2. 画像生成（Gemini/外部API）
3. assets/{userId}/{newAssetId}.png に保存
4. assetsテーブルにレコード追加
5. project_assetsに紐付け追加
6. プロジェクトのコード内で /api/assets/{assetId} を参照
```

### セキュリティ考慮

1. **アクセス制御**
   - 非公開アセット: 所有者のみアクセス可
   - 公開アセット: 誰でもアクセス可
   - 削除済み: 誰もアクセス不可

2. **assetIdの推測防止**
   - UUIDv4を使用（推測不可能）

3. **ファイルアップロード検証**
   - MIMEタイプチェック
   - ファイルサイズ上限
   - 画像ファイルのみ許可

4. **パストラバーサル防止**
   - ファイル名にUUIDのみ使用
   - ユーザー入力のファイル名は使用しない

## 外部IP連携（将来拡張）

### IPパートナー用の追加機能

```sql
-- IPパートナーテーブル
CREATE TABLE ip_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                     -- Nintendo, etc.
  api_key TEXT UNIQUE,                    -- API認証用
  is_active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- アセット利用ログ（IPパートナー向けレポート用）
CREATE TABLE asset_usage_log (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  action TEXT NOT NULL,                   -- view, remix, etc.
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (asset_id) REFERENCES assets(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### IPパートナー用ダッシュボード（将来）

- 提供アセットの一覧
- 利用状況（何プロジェクトで使用中か）
- 期間設定（公開開始日・終了日）
- 一括非公開/削除

## 移行計画

### Phase 1: 基盤構築
- [ ] DBテーブル作成
- [ ] アセットAPI実装
- [ ] 画像生成時の保存先変更

### Phase 2: 既存データ移行
- [ ] 既存プロジェクトの画像をassetsフォルダに移動
- [ ] project_assetsに紐付け追加
- [ ] プロジェクト内の画像参照をAPI経由に変更

### Phase 3: 公開/Remix対応
- [ ] 公開設定UI
- [ ] Remix時のアセット参照継承
- [ ] 削除/非公開時の通知

### Phase 4: 外部IP連携
- [ ] IPパートナー管理
- [ ] 期間限定公開
- [ ] 利用レポート

## 注意事項

- 既存のプロジェクト内保存方式からの移行が必要
- 移行中は両方式をサポートする過渡期が必要
- パフォーマンスのためCDN導入を検討
