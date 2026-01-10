# ゲームリクエスト分類システム

GameCreator MVPのすべてのゲームリクエストを自動的に2D/3Dに分類するシステムです。

## 概要

ユーザーのゲーム作成リクエストをデータベースから取得し、キーワード分析と機械学習ベースのアルゴリズムを使用して、各ゲームを2D（P5.js）または3D（Three.js）に分類します。

### 分類精度

- **平均確信度**: 86.9%
- **高確信度 (≥80%)**: 97件 (76.4%)
- **判定可能率**: 100%（未分類なし）

## 構成ファイル

### メインツール

```
server/tools/
├── gameClassifier.js        # メイン分類エンジン
├── classifyGames.js         # CLIエントリーポイント
└── analyzeClassification.js # 統計分析ツール
```

### 出力形式

分類結果は3つの形式で出力されます：

1. **HTML レポート** (`game_classification_report.html`)
   - インタラクティブなWebレポート
   - グラフィカルな表示
   - 全ゲームの詳細情報

2. **JSON データ** (`game_classification_report.json`)
   - プログラマティックアクセス用
   - 詳細な分析メタデータ
   - パイプライン統合に最適

3. **CSV スプレッドシート** (`game_classification_report.csv`)
   - Excelで開く可能
   - データ分析ツールとの互換性
   - レガシーシステム連携

## 使用方法

### 簡単な実行方法

```bash
# すべてのレポートを生成
npm run classify:all

# 個別形式で生成
npm run classify:html    # HTMLレポートのみ
npm run classify:json    # JSONレポートのみ
npm run classify:csv     # CSVレポートのみ

# 統計分析を表示
npm run analyze
```

### CLIでの直接実行

```bash
# HTMLレポート
node server/tools/classifyGames.js --format html --output report.html

# JSONレポート
node server/tools/classifyGames.js --format json --output games.json

# CSVレポート
node server/tools/classifyGames.js --format csv --output games.csv

# コンソール出力
node server/tools/classifyGames.js --console

# 高い確信度（0.8以上）のゲームのみ
node server/tools/classifyGames.js --confidence 0.8 --console

# ヘルプ表示
node server/tools/classifyGames.js --help
```

## 分類アルゴリズム

### 3D特性キーワード

3Dゲームとして検出される主なキーワード：

- **ライブラリ**: Three.js, WebGL, Babylon.js
- **視点**: FPS, TPS, 一人称, 三人称
- **オブジェクト**: ブロック, キューブ, ボール, メッシュ
- **環境**: ライティング, 陰影, テクスチャ, マテリアル
- **物理**: 重力, コリジョン, 物理演算
- **ジャンル**: マインクラフト, ダンジョン, ボクセル

### 2D特性キーワード

2Dゲームとして検出される主なキーワード：

- **ライブラリ**: P5.js, Canvas, 2D
- **スプライト**: キャラクター, アニメーション
- **ジャンル**: シューティング, パズル, クリッカー, プラットフォーマー
- **UI**: ボタン, メニュー, スコア, ゲージ
- **操作**: タップ, クリック, スクロール

### スコアリングシステム

```
3Dキーワード検出: +5点/キーワード
2Dキーワード検出: +1点/キーワード

確信度 = max_score / (3d_score + 2d_score)
```

**判定ルール**:
- `3d_score > 2d_score` → 3Dゲーム
- `2d_score > 3d_score` → 2Dゲーム
- 同点 → デフォルト2Dゲーム

## 統計情報

### 現在のデータセット（2026年1月10日）

```
合計ゲーム数:     127
├─ 2Dゲーム:      58 (45.7%)
└─ 3Dゲーム:      69 (54.3%)

確信度分布:
├─ 高確信度 (90-100%):  62件 (48.8%)
├─ 中確信度 (70-89%):   49件 (38.6%)
├─ 低確信度 (50-69%):   16件 (12.6%)
└─ 不確定 (<50%):       0件 (0.0%)

2D検出キーワード TOP5:
1. ボタン (82.8%)
2. シューティング (67.2%)
3. シューティングゲーム (63.8%)
4. シンプルデザイン (12.1%)
5. キャラ/キャラクター (12.1%)

3D検出キーワード TOP5:
1. 3d (81.2%)
2. three (21.7%)
3. tps (15.9%)
4. 視点（一人称/三人称）(15.9%)
5. three.js (13.0%)
```

### インサイト

- **3D優位**: ユーザーは3Dゲーム作成を好む傾向（11件多い）
- **高精度分類**: 97件が高確信度で分類可能
- **キーワード明確性**: 3D識別キーワードがより明確（81.2% vs 82.8%）

## 出力データ構造

### JSON形式の例

```json
{
  "projectId": "5b8d47e7-a811-454d-9535-dc7813ffdfa5",
  "projectName": "New Game",
  "createdAt": "2026-01-10 06:12:52",
  "updatedAt": "2026-01-10 06:15:31",
  "gameType": "game-3d",
  "confidence": 1.0,
  "reason": "3Dゲームと判定（確信度: 100%）",
  "mainRequest": "Three.jsでリアルな湖を作成...",
  "analysis": {
    "score2d": 0,
    "score3d": 15,
    "matched2d": [],
    "matched3d": ["3d", "three", "three.js"]
  },
  "messageCount": 3,
  "allMessages": [...]
}
```

### HTML レポート

- プロジェクト統計（円グラフ）
- 確信度ビジュアルバー
- キーワード強調表示
- ホバーアニメーション
- レスポンシブデザイン

## APIプログラマティック使用

```javascript
const { classifyGameRequests } = require('./server/tools/gameClassifier');

// レポート生成
const result = await classifyGameRequests({
  outputFormat: 'json',  // 'json' | 'html' | 'csv'
  outputPath: './reports/games.json',
  minConfidence: 0.8     // 0-1 確信度フィルタ
});

console.log(result);
// {
//   success: true,
//   format: 'json',
//   total: 127,
//   count2d: 58,
//   count3d: 69,
//   data: [...]
// }
```

## トラブルシューティング

### データベースが見つからない

```bash
# データベースが作成されていることを確認
ls -la data/gamecreator.db

# サーバーを一度起動してDBを初期化
npm start
```

### メモリ不足

大量のゲーム（1000件以上）を処理する場合：

```bash
# Node.jsメモリ制限を増やす
node --max-old-space-size=4096 server/tools/classifyGames.js
```

### 確信度が低い場合

いくつかのゲームの判定が不確実な場合、以下の改善方法があります：

1. キーワードリストを拡張（gameTypeAnalyzer.js）
2. ユーザーガイドを提供（2D/3D明示指定）
3. 追加パラメータを実装（フレームワーク自動検出など）

## 今後の改善案

- [ ] 深層学習モデルの統合（より高精度な分類）
- [ ] ゲームエンジン自動検出（Three.js, P5.js, Babylon.js等）
- [ ] リアルタイム分類（チャット送信時に動的分類）
- [ ] 言語モデルによる説明文解析
- [ ] ユーザーフィードバックの学習ループ
- [ ] キーワード重要度の動的調整

## ファイルサイズ

生成されるレポートのサイズ目安：

- HTML: ~143KB
- JSON: ~153KB
- CSV: ~32KB

ストレージ効率性を考慮して、使用目的に応じた形式を選択してください。

## ライセンス

GameCreator MVP の一部。MITライセンス。

---

**最終更新**: 2026年1月10日
**バージョン**: 1.0.0
