# DreamCore 翻訳ガイド

## プロダクトの理解

### ビジョン
DreamCoreは「AIと対話しながらゲームを作る」プラットフォーム。
バイブコーディング（Vibe Coding）の体験を提供する。

### ターゲットユーザー
- AIコーディングツール（Claude Code, Cursor, Codex等）を使う開発者
- プログラミング初心者でゲームを作りたい人
- アイデアをすぐ形にしたいクリエイター

### トーンとスタイル
- **フレンドリー**: 堅苦しくない、親しみやすい表現
- **ワクワク感**: ゲーム作りの楽しさを伝える
- **シンプル**: 専門用語を避け、誰でもわかる言葉を使う
- **アクション志向**: ユーザーに行動を促す表現

---

## 用語集（Glossary）

### コア用語

| 日本語 | English | 中文 | 備考 |
|--------|---------|------|------|
| DreamCore | DreamCore | DreamCore | ブランド名（翻訳しない） |
| ゲームクリエイター | Game Creator | 游戏创作者 | アプリ名として使用 |
| バイブコーディング | Vibe Coding | Vibe编程 | そのまま使用、カタカナ/英語で |

### ナビゲーション

| 日本語 | English | 中文 | 備考 |
|--------|---------|------|------|
| つくる / 作る | Create | 创作 | メインアクション |
| 発見 | Discover | 探索 | 他のゲームを見つける |
| 通知 | Notifications | 通知 | |
| マイ / マイページ | My Page | 我的 | プロフィールページ |
| 次へ | Next | 下一个 | ザッピング機能 |

### アクション

| 日本語 | English | 中文 | 備考 |
|--------|---------|------|------|
| ログイン | Sign in | 登录 | |
| ログアウト | Sign out | 退出登录 | |
| キャンセル | Cancel | 取消 | |
| 変更 | Change / Save | 保存 | 文脈による |
| 削除 | Delete | 删除 | |
| 公開 | Publish | 发布 | ゲームを公開 |
| 編集 | Edit | 编辑 | |

### ゲーム関連

| 日本語 | English | 中文 | 備考 |
|--------|---------|------|------|
| 新しいゲーム | New Game | 新游戏 | |
| ゲームの名前 | Game Name | 游戏名称 | |
| 下書き | Draft | 草稿 | 未公開のゲーム |
| 公開中 | Published | 已发布 | 公開済みのゲーム |

### 統計

| 日本語 | English | 中文 | 備考 |
|--------|---------|------|------|
| games | games | 游戏 | 作品数 |
| plays | plays | 播放 | プレイ数 |
| likes | likes | 喜欢 | いいね数 |

### エラー・ステータス

| 日本語 | English | 中文 | 備考 |
|--------|---------|------|------|
| 読み込み中... | Loading... | 加载中... | |
| 接続中 | Connecting | 连接中 | |
| エラーが発生しました | An error occurred | 发生错误 | |
| ログインに失敗しました | Sign in failed | 登录失败 | |
| 再試行 | Retry | 重试 | |

---

## スタイルガイド

### 日本語
- **敬語レベル**: です・ます調（丁寧すぎない）
- **カタカナ**: 外来語は適度に使用（ログイン、ゲーム等）
- **長さ**: 簡潔に。長い説明は避ける
- **例**: 「チャットでゲームを作ろう」（命令形でなく提案形）

### English
- **Person**: 2nd person (you, your)
- **Voice**: Active voice preferred
- **Tone**: Casual but professional
- **Capitalization**: Title Case for headings, Sentence case for descriptions
- **Example**: "Create games by chatting" (simple, direct)

### 中文（简体）
- **语气**: 口语化，亲切
- **人称**: 第二人称（你）
- **长度**: 简洁明了
- **例子**: "用聊天创作游戏"（动词开头，行动导向）

---

## 翻訳時の注意点

### やること
- プロダクトの文脈を理解してから翻訳する
- 各言語のネイティブ表現を使う
- UIの長さを考慮する（ボタンは短く）
- 用語集の一貫性を保つ

### やらないこと
- 機械翻訳をそのまま使わない
- 直訳しない（意味が通じる自然な表現に）
- 専門用語を多用しない
- 文化的に不適切な表現を使わない

---

## キー命名規則

```
page.{pageName}.{element}   ページ固有テキスト
common.{element}            共通テキスト
nav.{item}                  ナビゲーション
button.{action}             ボタンラベル
error.{type}                エラーメッセージ
status.{state}              ステータス表示
modal.{modalName}.{element} モーダル内テキスト
```

### 例
```json
{
  "common": {
    "appName": "DreamCore",
    "loading": "Loading..."
  },
  "nav": {
    "create": "Create",
    "discover": "Discover",
    "notifications": "Notifications",
    "myPage": "My Page",
    "next": "Next"
  },
  "button": {
    "signIn": "Sign in with Google",
    "signOut": "Sign out",
    "cancel": "Cancel",
    "delete": "Delete",
    "create": "Create"
  },
  "page": {
    "index": {
      "title": "DreamCore - Create games by chatting",
      "subtitle": "Create games by chatting"
    },
    "create": {
      "title": "Create - Game Creator"
    }
  },
  "modal": {
    "newGame": {
      "title": "New Game",
      "nameLabel": "Game Name",
      "namePlaceholder": "e.g., Space Shooter",
      "nameHint": "You can change this later"
    }
  },
  "error": {
    "signInFailed": "Sign in failed",
    "systemError": "A system error occurred"
  }
}
```
