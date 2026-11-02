# Monday Night Hackathon

マンデーナイトハッカソンの解説・参考資料を公開する静的Webサイトです。

- サイト: https://sanamiy.github.io/mnh-web/
- BERTのしくみと使い方: https://sanamiy.github.io/mnh-web/bert/

## 構成

- `docs/index.html`: 資料の入口
- `docs/bert/index.html`: BERTの解説
- `docs/.nojekyll`: HTMLをそのまま配信するための設定

ビルドや依存パッケージは不要です。BERT解説の図・スタイルはHTML内に含まれ、フォントはGoogle Fontsから読み込みます。

## ローカル確認

```sh
python3 -m http.server 8000 --directory docs
```

http://localhost:8000/ を開きます。

## 更新・公開

`docs/` を編集して `main` にpushすると、GitHub Pagesが自動更新されます。
公開元は `main` ブランチの `/docs` です。

## 切り出し元

2026年11月2日に、既存の `chosa/BERT/site/bert/index.html` を内容を変えずに切り出しました。
解説サイトの管理は、このリポジトリで行います。
