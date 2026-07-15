# ♠ Texas Hold'em オンラインポーカー

友人とリアルタイムで遊べるテキサスホールデムポーカーアプリ。

## セットアップ

```bash
# 依存パッケージのインストール
npm run install:all

# クライアントのビルド
npm run build

# サーバー起動
npm start
```

ブラウザで `http://localhost:3000` を開いてプレイ。

## 遊び方

1. プレイヤー名を入力
2. 「ルームを作成」または「ルームに参加」を選択
3. ルームコードを友人にシェア
4. 全員が「準備完了」を押すとゲーム開始

## 技術スタック

- **バックエンド**: Node.js, Express, Socket.io
- **フロントエンド**: React, Vite
- **リアルタイム通信**: WebSocket (Socket.io)

## 同梱ツール

- [`interior-ai/`](./interior-ai/README.md) — AIインテリアデザイン提案ツール(図面・写真から市販家具のコーディネートを提案)
