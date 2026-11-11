# Monday Night Hackathon

マンデーナイトハッカソンの解説・参考資料を公開する静的Webサイトです。Nuxtなどのフレームワークやビルドは不要です。

- サイト: https://monday-night-hackathon.pages.dev/
- BERTのしくみと使い方: https://monday-night-hackathon.pages.dev/bert/
- 形式検証のしくみと限界: https://monday-night-hackathon.pages.dev/formal-verification/

公開先は既存のCloudflare Pagesプロジェクト `monday-night-hackathon` です。新ドメインの選定は保留しています。

## 構成

- `public/index.html`: トップページ（海に沈んだ街へスクロールで潜る3Dサイト。three.js＋GSAP＋Lenis）
- `public/events.json`: 開催日データ。運用フォルダの `scripts/export_web_events.py` で書き出す（手編集しない）。カレンダーと「次回」はこのJSONから、閲覧時の日時を基準にブラウザ側で自動判定して表示する
- `public/labs.json`: 「開催回で扱った技術の解説」カードの一覧（題名・説明・リンク）。解説ページを足したらここに追記する
- `public/og.jpg`: URLを貼ったときのサムネイル（1200×630）。`/?og=1` を開くとHUDなしの画面になるので、それを撮って差し替える
- `public/scene/`・`public/assets/`: 3Dシーンの追加オブジェクトと素材（出典は `public/assets/models/CREDITS.md`）
- `public/fonts/`: Webフォント（すべてSIL Open Font License）
- `DESIGN.md`: デザインシステム（色・文字・余白・動き・コンポーネント）
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

`main` に push すると、GitHub Actions（`.github/workflows/deploy.yml`）が `public/` をCloudflare Pagesへ自動で公開します。`public/` 以下に変更がない push では動きません。Actionsタブの「Deploy to Cloudflare Pages」から手動実行もできます。

必要なGitHubのSecrets（Settings → Secrets and variables → Actions）:

- `CLOUDFLARE_API_TOKEN`: 権限「Account → Cloudflare Pages → Edit」のAPIトークン
- `CLOUDFLARE_ACCOUNT_ID`: CloudflareのアカウントID

手元から直接公開したいときは、Cloudflareにログイン済みの端末で実行します。

```sh
./scripts/deploy.sh
```

このプロジェクトはDirect Upload方式です（CloudflareのGit連携ではなく、ActionsからWranglerでアップロードします）。認証情報はWranglerが端末側で管理し、リポジトリには含めません。

## 資料の管理

Web公開する解説の正本は、このリポジトリの `public/` です。開催運用・制作中の素材・非公開の登壇資料は、別の `monday-night-hackathon` フォルダで管理します。

BERTの登壇資料はそちらの `materials/bert/` に集約済みです。元の `chosa/BERT` の資料名は、正本へのシンボリックリンクとして残しています。

BERT解説は既存の `chosa/BERT/site/bert/index.html`、形式検証の解説は2026年11月3日に受け取った `formal-verification.html` から取り込みました。
