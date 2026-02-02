# Auto Login Skill

agent-browser で DreamCore V2 に自動ログインするスキル。Google OAuth をバイパスして Supabase Magic Link でログインします。

## 使用タイミング

ユーザーが以下のような依頼をした時に使用:
- 「ログインして」
- 「DreamCore にログインして」
- 「認証して」
- agent-browser でログインが必要なページにアクセスする時

## 前提条件

- `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が `.env` に設定されていること
- agent-browser がインストールされていること

## 実行手順

### 1. Magic Link を生成

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getMagicLink() {
  // ユーザーを取得（デフォルト: notef@neighbor.gg）
  const email = process.argv[2] || 'notef@neighbor.gg';

  const { data: linkData, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: email
  });

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(linkData.properties.action_link);
}

getMagicLink();
" "\$EMAIL"
```

### 2. agent-browser でログイン

```bash
# Magic Link を取得
MAGIC_LINK=$(node -e "..." 上記のスクリプト)

# ブラウザでアクセス
agent-browser open "\$MAGIC_LINK"

# リダイレクト完了を待つ
agent-browser wait --url "**/create" --timeout 10000

# または特定のページに移動
agent-browser open "https://v2.dreamcore.gg/create"
```

### 3. ログイン確認

```bash
agent-browser get url
# https://v2.dreamcore.gg/create などが返れば成功
```

## ワンライナー

```bash
# デフォルトユーザーでログイン
MAGIC_LINK=$(node -e "const{createClient}=require('@supabase/supabase-js');require('dotenv').config();const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);s.auth.admin.generateLink({type:'magiclink',email:'notef@neighbor.gg'}).then(r=>console.log(r.data.properties.action_link))") && agent-browser open "$MAGIC_LINK" && agent-browser wait 2000
```

## 別ユーザーでログイン

```bash
# メールアドレスを指定
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: 'other@example.com'
}).then(r => console.log(r.data.properties.action_link));
"
```

## 注意事項

- Magic Link は一度しか使えない（使用後は無効になる）
- セッションは agent-browser のセッションに保存される
- 新しいセッション（`--session`）では再度ログインが必要
- Service Role Key は管理者権限なので取り扱い注意

## トラブルシューティング

### ログインできない

1. `.env` の `SUPABASE_SERVICE_ROLE_KEY` を確認
2. ユーザーが Supabase Auth に存在するか確認
3. Magic Link の有効期限（数分）が切れていないか確認

### セッションが切れる

agent-browser のセッション名を指定して永続化:

```bash
agent-browser --session dreamcore open "$MAGIC_LINK"
agent-browser --session dreamcore open "https://v2.dreamcore.gg/create"
```
