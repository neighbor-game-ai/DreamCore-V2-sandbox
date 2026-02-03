# マイページ プロフィールレイアウト刷新

**日付:** 2026-02-04

## 背景

マイページは自分用だけでなく、他人から見たときは「プロフィールページ」として表示される。現在のデザインでは編集ボタンの配置や全体のレイアウトを再考する必要があった。

## 実施内容

### 1. プロトタイプ作成

2種類の静的HTMLプロトタイプを作成:

| ファイル | 用途 |
|----------|------|
| `prototype-mypage-own.html` | 自分のマイページ（編集 + シェアボタン） |
| `prototype-profile-public.html` | 他人のプロフィールページ（フォロー + シェアボタン） |

**デザイン方針:** Instagram スタイル
- アバター（左）+ 統計（games/plays/likes）（右）を横並び
- 名前・Bio は縦に配置
- SNS アイコンは名前/Bio の下
- アクションボタン（編集/シェア or フォロー/シェア）は最下部

### 2. 本番実装

`mypage.html` と関連 CSS を更新:

**HTML 構造:**
```
profile-section
├── profile-header (avatar + stats - 横並び)
├── profile-info (name + bio - 縦並び)
├── social-links (SNS アイコン)
└── action-buttons (編集 + シェア)
```

**追加機能:**
- Web Share API によるシェア機能（モバイル）
- Clipboard API によるフォールバック（デスクトップ）
- シェアボタンのフィードバックアニメーション

### 3. レイアウト修正

**問題1: 統計の縦方向整列**
- 原因: `align-items: flex-start` により上揃え
- 修正: `align-items: center` に変更

**問題2: SNS アイコンが中央揃え**
- 原因: `profile.css` で `justify-content: center` が設定されていた
- 修正: `justify-content: flex-start` に変更（左寄せ）

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `public/mypage.html` | Instagram スタイルのプロフィールセクション |
| `public/mypage.js` | シェア機能、統計要素の追加 |
| `public/style.css` | プロフィールセクションのスタイル |
| `public/css/modules/profile.css` | SNS アイコン左寄せ修正 |
| `public/prototype-mypage-own.html` | プロトタイプ（自分用）新規作成 |
| `public/prototype-profile-public.html` | プロトタイプ（他人用）新規作成 |

## CSS 修正詳細

### profile.css (line 460-465)

```css
/* Before */
.mypage-social-links {
  display: flex;
  justify-content: center;  /* 中央揃え */
  gap: 8px;
  margin-top: 16px;
}

/* After */
.mypage-social-links {
  display: flex;
  justify-content: flex-start;  /* 左寄せ */
  gap: 8px;
  margin-top: 16px;
}
```

## 今後の作業

- [ ] 他人のプロフィールページ実装（`/u/:userId` ルート）
- [ ] フォローボタン機能実装
- [ ] plays/likes の実際の値取得（現在は 0 固定）

## 参考

- プロトタイプ確認: http://localhost:3000/prototype-mypage-own.html
- 本番確認: http://localhost:3000/mypage.html
