# Monday Night Hackathon website

- 公開する静的サイトは `public/`。既存の Cloudflare Pages プロジェクト `monday-night-hackathon` に配信する。
- 公開URLは `https://monday-night-hackathon.pages.dev/`。別ドメインの選定は保留中。勝手に変更しない。
- トップは `public/index.html`。解説・資料は `public/<topic>/index.html` に追加し、トップからリンクする。
- BERT 解説の正本は `public/bert/index.html`。形式検証は `public/formal-verification/index.html`。
- 相対リンクを使い、目次のアンカー・スマートフォンでの表示を確認する。
- 開催運用データ、認証情報、Discord 内部記録はこの公開リポジトリに含めない。
- 公開は `./scripts/deploy.sh`。GitへのpushだけではCloudflare Pagesは更新されない。
