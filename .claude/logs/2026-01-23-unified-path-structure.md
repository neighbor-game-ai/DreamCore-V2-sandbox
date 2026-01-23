# 統一パス構造リファクタリング

**日付:** 2026-01-23
**ブランチ:** refactor/unified-path-structure
**コミット:** 9f30409

## 概要

プロジェクトとアセットのパス構造を統一し、レガシーコードとドキュメントを整理。

## 実施内容

### 1. config.js パス関数統一

**削除したもの:**
- `PROJECTS_DIR` 定数（dev/prodで不整合があった）
- `ASSETS_DIR` 定数
- `getProjectPathV2()` 関数
- `getUserAssetsPathV2()` → `getUserAssetsPath()` に統合

**変更後の構造:**
```javascript
getProjectPath(userId, projectId)
// → USERS_DIR/userId/projects/projectId

getUserAssetsPath(userId)
// → USERS_DIR/userId/assets

getGlobalAssetsPath(category)
// → GLOBAL_ASSETS_DIR/category
```

### 2. 参照箇所の更新

- `server/index.js`: `getUserAssetsPathV2` → `getUserAssetsPath`
- `server/userManager.js`: 未使用import削除、ドキュメント更新
- `server/index.js`: 一時アップロードディレクトリを `UPLOAD_TEMP_DIR` に明確化

### 3. ドキュメント整理

**削除:**
- `ARCHITECTURE.md` - MVP時代の古いドキュメント（visitorId使用）
- `SPECIFICATION.md` - MVP時代の古い仕様書

**更新:**
- `README.md`: legacy mode記述削除、パス構造更新
- `CLAUDE.md`: 統一パス構造を追記

## 新しいパス構造

```
/data/users/{userId}/
  ├── projects/
  │   └── {projectId}/
  │       ├── index.html
  │       └── specs/
  └── assets/
      └── {filename}

/data/assets/global/
  └── {category}/
```

## 影響

- **新規プロジェクト**: 正常動作
- **既存プロジェクト**: 旧パス（`users/{userId}/{projectId}`）にあるため表示されない
  - ローンチ前ポリシーに従い、移行は不要

## 変更ファイル

| ファイル | 変更 |
|---------|------|
| server/config.js | -53行 / パス関数統一 |
| server/index.js | -16行 / import修正、temp dir明確化 |
| server/userManager.js | -20行 / import削除、doc更新 |
| CLAUDE.md | +9行 / 統一パス構造追記 |
| README.md | +39行 / legacy削除、パス更新 |
| ARCHITECTURE.md | 削除 |
| SPECIFICATION.md | 削除 |

## 学び

- パス構造の変更は既存データに影響する
- 計画を実装する前に既存データとの整合性を確認すべき
- 「整理された構造」は長期的な管理コスト削減に寄与
