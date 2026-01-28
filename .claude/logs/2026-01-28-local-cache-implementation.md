# ローカルキャッシュ実装（Modal→ローカル同期）

**日付:** 2026-01-28
**作業者:** Claude

## 背景

Modal 統合後、プレビュー表示と履歴復元が非常に遅くなっていた。

**原因:**
- 毎回のファイルリクエストが Modal API を経由（50-150ms/ファイル）
- 1プレビューあたり 5-20 ファイルのリクエスト
- 合計で数秒の遅延が発生

## 実施内容

### 1. syncFromModal() 関数の追加

`server/userManager.js` に Modal Volume → ローカルファイルシステムへの同期関数を実装。

```javascript
const syncFromModal = async (userId, projectId) => {
  // Modal から全ファイルを取得してローカルに保存
  const files = await client.listFiles(userId, projectId);
  for (const filename of files) {
    const content = await client.getFile(userId, projectId, filename);
    fs.writeFileSync(localPath, content);
  }
};
```

### 2. 同期タイミングの設定

以下のタイミングで同期を実行:

| タイミング | ファイル | 行 |
|-----------|---------|-----|
| Claude Modal 完了後 | `claudeRunner.js` | ~1865 |
| 履歴復元後 | `index.js` | restoreVersion ハンドラー内 |

### 3. ローカルファースト配信

`/game/:userId/:projectId/*` ルートを修正:

1. まずローカルファイルシステムを確認
2. ローカルに存在すれば即座に返却（高速）
3. 存在しなければ Modal にフォールバック

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `server/userManager.js` | `syncFromModal()` 関数追加、exports に追加 |
| `server/claudeRunner.js` | Modal 完了後に `syncFromModal()` 呼び出し |
| `server/index.js` | ローカルファースト配信、復元後の同期追加 |

## 期待される効果

| 操作 | 改善前 | 改善後 |
|------|--------|--------|
| プレビュー表示 | 数秒（Modal API × N ファイル） | ほぼ即座（ローカル読み込み） |
| 履歴復元後の表示 | 数秒 | ほぼ即座 |

## 技術的詳細

### 同期の特性

- **非同期実行**: Claude 完了後に await で同期を待つ
- **エラー耐性**: 個別ファイルの失敗は無視し、可能な限り同期を継続
- **バイナリ対応**: Buffer と文字列の両方をサポート

### フォールバック設計

ローカルにファイルがない場合でも Modal から取得できるため、同期に失敗しても機能は維持される。

## デプロイ

```bash
# GCE へのデプロイ
git push origin feature/sandbox-runtime
ssh notef@dreamcore-v2 "cd ~/DreamCore-V2-sandbox && git pull && pm2 restart dreamcore-sandbox"
```

**コミット:** `3ac9db0 feat: ローカルキャッシュ実装（Modal→ローカル同期）`

## 関連する以前の修正

同セッションで実施した関連修正:

1. **プレビュー未更新問題**: `/game/*` が Modal Volume を参照するよう修正
2. **Git dubious ownership**: Modal の git コマンドに `safe.directory` オプション追加
3. **Cache-Control ヘッダー**: Modal の `get_file` にキャッシュ制御ヘッダー追加
