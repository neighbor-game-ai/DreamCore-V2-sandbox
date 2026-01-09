#!/bin/bash
# GameCreatorMVP 全自動セットアップスクリプト
# 使い方: curl -fsSL https://raw.githubusercontent.com/notef-neighbor/GameCreatorMVP/feature/skill-improvement/deploy/setup-gce.sh | bash

set -e

echo ""
echo "========================================="
echo "  GameCreatorMVP 自動セットアップ開始"
echo "========================================="
echo ""

# 古いインストールを削除
echo "[1/8] 古いファイルをクリーンアップ..."
sudo rm -rf /opt/gamecreator 2>/dev/null || true
sudo rm -rf ~/dreamcore* 2>/dev/null || true
sudo rm -rf ~/GameCreator* 2>/dev/null || true

# システム更新
echo "[2/8] システム更新中..."
sudo apt update -qq

# Node.js 20 インストール
echo "[3/8] Node.js 20 インストール中..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
sudo apt install -y nodejs build-essential python3 git nginx -qq

# PM2 インストール
echo "[4/8] PM2 インストール中..."
sudo npm install -g pm2 > /dev/null 2>&1

# アプリディレクトリ作成
echo "[5/8] アプリケーションをダウンロード中..."
sudo mkdir -p /opt/gamecreator
sudo chown $USER:$USER /opt/gamecreator
cd /opt/gamecreator

# GitHubからクローン
git clone -b feature/skill-improvement https://github.com/notef-neighbor/GameCreatorMVP.git . 2>/dev/null

# 依存関係インストール
echo "[6/8] 依存関係インストール中..."
npm install --silent 2>/dev/null

# 環境変数ファイル作成
echo "[7/8] 設定ファイル作成中..."
cp deploy/.env.example .env

# Nginx設定
echo "[8/8] Nginx 設定中..."
sudo cp deploy/nginx.conf /etc/nginx/sites-available/gamecreator
sudo ln -sf /etc/nginx/sites-available/gamecreator /etc/nginx/sites-enabled/default
sudo nginx -t > /dev/null 2>&1
sudo systemctl reload nginx

echo ""
echo "========================================="
echo "  セットアップ完了！"
echo "========================================="
echo ""
echo "あと2つだけ設定が必要です："
echo ""
echo "1. Gemini APIキーを設定:"
echo "   nano /opt/gamecreator/.env"
echo "   → GEMINI_API_KEY=あなたのキー を入力"
echo "   → Ctrl+X → Y → Enter で保存"
echo ""
echo "2. アプリを起動:"
echo "   cd /opt/gamecreator && pm2 start server/index.js --name gamecreator"
echo ""
echo "完了したら http://$(curl -s ifconfig.me) でアクセス！"
echo ""
