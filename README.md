# Double Cross Dice Calculator

TRPG『ダブルクロス The 3rd Edition』のダイスロールについて、達成値・ダメージ・バックトラック結果の確率分布を計算し、グラフで可視化するWebアプリです。

公開サイト: [Double Cross Dice Calculator](https://double-cross-dice-calculator.pages.dev/)

## 主な機能

- 一般判定の達成値分布、期待値、成功率の計算
- 攻撃の命中率、ダメージ分布、期待値の計算
- 複数コンボの合計ダメージ分布の計算
- バックトラック後の侵蝕率分布の計算
- 《妖精の手》《支配の領域》など、一部エフェクト・Dロイスの反映

対応範囲や計算上の制約は、今後 `docs/` 以下へ整理する予定です。現在の実装では確率分布を添字 `0` から `1023` の配列で表現し、上限を超える結果を `1023` に集約しています。

## 技術構成

- Vue 3
- Vuetify 3
- Chart.js / vue-chartjs
- Vite
- Cloudflare Pages

バックエンドを持たない静的SPAです。確率計算はブラウザ内で完結します。

## 開発環境

Node.jsのバージョンは [`.node-version`](./.node-version) に固定しています。

```sh
npm ci
npm run dev
```

開発サーバーは既定で `http://localhost:3000` を使用します。

## 品質確認

```sh
npm run lint
npm test
npm run build
```

`npm run lint:fix` はESLintで自動修正可能な箇所を更新します。

確率計算を変更する場合は、少なくとも次の不変条件を保つ必要があります。

- 確率分布の各要素が非負である
- 確率分布の総和が浮動小数点誤差の範囲で1になる
- 上側確率が単調非増加になる
- 配列長とオーバーフローの扱いが既存仕様と一致する

## ビルド

```sh
npm run build
npm run preview
```

事前計算データの形式、生成方法、更新手順は[`docs/precomputed-data.md`](./docs/precomputed-data.md)を参照してください。

本番用ファイルは `dist/` に生成されます。`dist/` と `.wrangler/` は生成物のためGit管理しません。

Cloudflare Pagesの基本設定:

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: `.node-version` に記載されたバージョン

## ディレクトリ構成

```text
src/
  components/  画面を構成するVueコンポーネント
  data/        データ取得・確率計算ロジック
  layouts/     共通レイアウト
  router/      ルーティング
  views/       ページ単位のコンポーネント
public/data/   バージョン管理された事前計算済み静的アセット
schemas/       事前計算データのJSON Schema
scripts/       事前計算データの生成・検証スクリプト
tests/legacy/  移行結果を比較するための旧計算実装
```

アプリケーションのモジュール境界とデータ読込の流れは[`docs/architecture.md`](./docs/architecture.md)を参照してください。

## コントリビューション

不具合報告や変更提案を歓迎します。開発を始める前に [CONTRIBUTING.md](./CONTRIBUTING.md) を確認してください。

セキュリティ上の問題は公開Issueに詳細を書かず、[SECURITY.md](./SECURITY.md) の手順で報告してください。

## 権利表記

本作は、「矢野俊策」「有限会社F.E.A.R.」が権利を有する『ダブルクロス The 3rd Edition』の二次創作物です。

© 矢野俊策 / F.E.A.R.

ソースコードのライセンスは現在整理中です。ライセンスが明示されるまでは、既定の著作権法が適用されます。
