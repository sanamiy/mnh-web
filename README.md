# Monday Night Hackathon

マンデーナイトハッカソンの解説・参考資料を公開する静的Webサイトです。Nuxtなどのフレームワークやビルドは不要です。

- サイト: https://monday-night-hackathon.pages.dev/
- BERTのしくみと使い方: https://monday-night-hackathon.pages.dev/bert/
- 形式検証のしくみと限界: https://monday-night-hackathon.pages.dev/formal-verification/

公開先は既存のCloudflare Pagesプロジェクト `monday-night-hackathon` です。新ドメインの選定は保留しています。

## 構成

- `public/index.html`: 資料の入口
- `public/bert/index.html`: BERTの解説
- `public/formal-verification/index.html`: 形式検証の解説
- `scripts/deploy.sh`: Cloudflare Pagesへの公開コマンド

図・スタイルは各HTML内に含まれ、フォントはGoogle Fontsから読み込みます。公開するファイルだけを `public/` に置きます。

## ローカル確認

```sh
python3 -m http.server 8000 --directory public
```

http://localhost:8000/ を開きます。

## 更新・公開

変更をGitにcommit・pushしてから、Cloudflareにログイン済みの端末で実行します。

```sh
./scripts/deploy.sh
```

このプロジェクトはDirect Upload方式です。GitへのpushだけではCloudflare Pagesは更新されません。認証情報はWranglerが端末側で管理し、リポジトリには含めません。

## 資料の管理

Web公開する解説の正本は、このリポジトリの `public/` です。開催運用・制作中の素材・非公開の登壇資料は、別の `monday-night-hackathon` フォルダで管理します。

BERTの登壇資料はそちらの `materials/bert/` に集約済みです。元の `chosa/BERT` の資料名は、正本へのシンボリックリンクとして残しています。

BERT解説は既存の `chosa/BERT/site/bert/index.html`、形式検証の解説は2026年11月3日に受け取った `formal-verification.html` から取り込みました。
