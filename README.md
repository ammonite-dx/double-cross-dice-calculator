# Double Cross Dice Calculator

TRPG『ダブルクロス The 3rd Edition』のダイスロールについて、達成値・ダメージ・バックトラック結果の確率分布を計算し、グラフで可視化するWebアプリです。

公開サイト: [Double Cross Dice Calculator](https://double-cross-dice-calculator.pages.dev/)

## 主な機能

- 一般判定の達成値分布、期待値、成功率の計算
- 攻撃の命中率、ダメージ分布、期待値の計算
- 複数コンボの合計ダメージ分布の計算
- バックトラック後の侵蝕率分布の計算
- 《妖精の手》《支配の領域》《絶対支配》《風鳴りの爪》、Dロイス《屍人》など、一部エフェクト・Dロイスの反映

ダイスロールの解釈、対応範囲、事前計算するダイス数の根拠は[`docs/dice-rules.md`](./docs/dice-rules.md)に記載しています。計算結果は`DistributionResult`としてsupport、明示済み範囲、overflowを保持し、必要なworking rangeは`RangePlanner`と`ResourceGuard`で要求window・supportに応じて動的に計画します。互換用のpublished-bucket形式ではインデックス1023に1023以上を集約しますが、これは計算結果や最終表示の上限ではありません。中間計算は要求されたwindowとsupportに合わせたworking rangeを使い、published-bucketへ投影するのは互換比較が必要な場合だけです。

## 技術構成

- Vue 3
- Vuetify 3
- Chart.js / vue-chartjs
- Vite
- Python 3.12 / NumPy（事前計算データ生成）
- Cloudflare Pages

バックエンドを持たない静的SPAです。確率計算はブラウザ内で完結します。

## 開発環境

Node.jsのバージョンは [`.node-version`](./.node-version) の `22.23.2` に固定しています。`npm run check:node` は固定値、`package.json` の `engines.node`、実行中のNode.jsの整合を確認します。

```sh
npm ci
npm run dev
```

開発サーバーは既定で `http://localhost:3000` を使用します。

## 品質確認

通常の開発中は、変更に応じて個別のlintやテストを実行します。Pull Request作成前やリリース前には、Node.js、事前計算データ、JavaScript・Pythonのテスト、型検査、runtime検証、lint、ビルド、production browser smoke、差分検査をまとめて実行する`npm run verify:release`を使用してください。

```sh
npm run lint
npm test
```

`npm run lint:fix` はESLintで自動修正可能な箇所を更新します。

事前計算後にブラウザで行う判定・ダメージ・バックトラックの計算方法は[`docs/runtime-calculation-algorithms.md`](./docs/runtime-calculation-algorithms.md)、その独立テストは[`docs/runtime-rule-validation.md`](./docs/runtime-rule-validation.md)に記載しています。事前計算器自体の検証は[`docs/precomputation-validation.md`](./docs/precomputation-validation.md)を参照してください。

Attackのfull-tail計算に関する参考ベンチマークは`npm run benchmark:full-tail-attack`で実行できます。絶対時間は実行環境に依存するため、性能変更の前後を同じ環境で比較してください。

確率計算を変更する場合は、少なくとも次の不変条件を保つ必要があります。

- 確率分布の各要素が許容誤差を超えて負にならない
- 正規化対象の確率分布の総和が浮動小数点誤差の範囲で1になる
- 上側確率が単調非増加になる
- 配列長、入力範囲、オーバーフローの扱いが[`docs/dice-rules.md`](./docs/dice-rules.md)の仕様と一致する

## ビルド

```sh
npm run build
npm run preview
```

事前計算データの形式、生成方法、更新手順は[`docs/precomputed-data.md`](./docs/precomputed-data.md)、各データセットの計算アルゴリズムは[`docs/precomputation-algorithms.md`](./docs/precomputation-algorithms.md)、ブラウザ内の合成処理は[`docs/runtime-calculation-algorithms.md`](./docs/runtime-calculation-algorithms.md)を参照してください。確率分布、動的計画法、順序統計量、FFTを具体例から学ぶための入門は[`docs/probability-calculation-tutorial.md`](./docs/probability-calculation-tutorial.md)に記載しています。

本番用ファイルは `dist/` に生成されます。`dist/` と `.wrangler/` は生成物のためGit管理しません。

Cloudflare Pagesの基本設定:

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: `.node-version` に記載された `22.23.2`

## ディレクトリ構成

```text
src/
  calculation/ 確率・範囲計画の計算コア
  core/        汎用的な確率計算primitive
  domain/      入力・結果などのドメイン契約
  features/    Check・Attack・Backtrackの画面と状態
  runtime/     非同期計算、資源制御、Worker境界
  shared/      検証、チャート、表示、テーマの共通処理
  components/  画面を構成するVueコンポーネント
  layouts/     共通レイアウト
  router/      ルーティング
  views/       ページ単位のroute adapter
tooling/reference-data/  参照用スキーマとデータリポジトリ
public/data/   バージョン管理された事前計算済み静的アセット
generator/     Python製の事前計算データ生成器
experiments/   runtime計算・性能検証の参照実装と履歴資料
schemas/       事前計算データのJSON Schema
scripts/       事前計算データの生成・検証スクリプト
tests/         runtime、ルール、asset、architecture、Workerのテスト
```

アプリケーションのモジュール境界とデータ読込の流れは[`docs/architecture.md`](./docs/architecture.md)を参照してください。

## コントリビューション

不具合報告や変更提案を歓迎します。開発を始める前に [CONTRIBUTING.md](./CONTRIBUTING.md) を確認してください。

セキュリティ上の問題は公開Issueに詳細を書かず、[SECURITY.md](./SECURITY.md) の手順で報告してください。

## 権利表記

本作は、「矢野俊策」「有限会社F.E.A.R.」が権利を有する『ダブルクロス The 3rd Edition』の二次創作物です。

© 矢野俊策 / F.E.A.R.

ソースコードのライセンスは現在整理中です。ライセンスが明示されるまでは、既定の著作権法が適用されます。
