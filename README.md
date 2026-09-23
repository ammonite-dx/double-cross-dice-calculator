# Double Cross Dice Calculator

TRPG『ダブルクロス The 3rd Edition』のダイスロールについて、達成値・ダメージ・バックトラック結果の確率分布を計算し、グラフで可視化するWebアプリです。

公開サイト: [Double Cross Dice Calculator](https://double-cross-dice-calculator.pages.dev/)

## 主な機能

- 一般判定の達成値分布、期待値、成功率の計算
- 攻撃の命中率、ダメージ分布、期待値の計算
- 複数コンボの合計ダメージ分布の計算
- バックトラック後の侵蝕率分布の計算
- 《妖精の手》《支配の領域》《絶対支配》《風鳴りの爪》、Dロイス《屍人》など、一部エフェクト・Dロイスの反映

ダイスロールの解釈と対応する入力domainは[`docs/dice-rules.md`](./docs/dice-rules.md)に記載しています。計算結果は`DistributionResult`としてsupport、明示済み範囲、overflowを保持します。`RangePlanner`と`ResourceGuard`は要求された表示窓と数学的supportに応じて必要な計算範囲を動的に計画します。有限supportは全体を扱い、無限supportは明示範囲にtail certificateとoverflow情報を付けて表します。旧1024要素のpublished-bucket形式は、[`tooling/reference-data/PublishedBucketCompatibility.js`](./tooling/reference-data/PublishedBucketCompatibility.js)にある歴史的な比較・互換境界です。インデックス1023への集約は、現在の計算結果や表示範囲の上限ではありません。

## 技術構成

- Production: Vue 3 / TypeScript / Vuetify 3 / Chart.js / vue-chartjs / Vite / Cloudflare Pages
- Reference tooling: Python 3.12 / NumPy（historical fixtureの生成・検証）

バックエンドを持たない静的SPAです。確率計算はブラウザ内で完結します。

## 開発環境

Node.jsのバージョンは [`.node-version`](./.node-version) の `22.23.2` に固定しています。`npm run check:node` は固定値、`package.json` の `engines.node`、実行中のNode.jsの整合を確認します。

```sh
npm ci
npm run dev
```

開発サーバーは既定で `http://localhost:3000` を使用します。

## 品質確認

通常の開発中は、変更に応じて個別のlintやテストを実行します。検証はproductionと参照資産を分けて実行でき、Node.jsだけで完結する`npm run verify:core`、本番ビルドをChromiumで確認する`npm run verify:browser`、事前計算データ・generator・シミュレーション・参照テストを確認する`npm run verify:reference`を使い分けます。

```sh
npm run lint
npm test
```

`npm run lint:fix` はESLintで自動修正可能な箇所を更新します。

`npm test`は本番計算とアプリケーションのテストだけを実行し、`tests/reference/`にある過去の公開データとの比較テストは除外します。参照テストは`npm run test:reference`で単独実行できます。リリース用のproduction gateは`npm run verify:release`（`verify:core`とproduction browser smoke）で、参照資産まで含めた全検証は`npm run verify:all`で実行します。`verify:reference`だけを実行する場合はuvとPython 3.12が必要です。

`tooling/reference-data/assets/schema-v2/revision-1/`、`tooling/reference-data/`、`generator/`および`tests/reference/`は、現在のブラウザ実行経路そのものではなく、過去に生成した分布の再現性・生成器・互換境界を検証する参照領域です。revision-1 JSONはproduction deployから配信せず、published-bucket adapterも参照領域に置いています。これらの検証をproduction gateから分離しても、歴史的な互換仕様とテストを削除したことにはなりません。

実行時の判定・ダメージ・バックトラックの計算方法は[`docs/runtime-calculation-algorithms.md`](./docs/runtime-calculation-algorithms.md)、その独立テストは[`docs/runtime-rule-validation.md`](./docs/runtime-rule-validation.md)に記載しています。参照fixture自体の検証とproduction gateから分離した手順は[`docs/reference/precomputation-validation.md`](./docs/reference/precomputation-validation.md)を参照してください。CIではproduction、browser smoke、referenceの検証を目的別に分けています。

Attack runtimeのstress・resource benchmarkは`npm run benchmark:attack-runtime`で実行できます。絶対時間は実行環境に依存するため、性能変更の前後を同じ環境で比較してください。

Damage期待値は、Score tail first moment certificateとDamage expectation certificateに基づく`exact`・`bounded`・`lower-bound`の区別を保ち、semantic uncertainty（証明できる範囲）とnumerical diagnostics（数値計算上の診断）を分離します。複数コンボのTotal Damageでは、各componentの期待値区間を合計へ伝播します。現行の結果契約は[`docs/result-contract.md`](./docs/result-contract.md)を参照してください。過去の証明書設計と調査過程は[`docs/archive/`](./docs/archive/)に履歴資料として残しています。

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

事前計算データの形式、生成方法、更新手順は[`docs/reference/precomputed-data.md`](./docs/reference/precomputed-data.md)、各データセットの計算アルゴリズムは[`docs/reference/precomputation-algorithms.md`](./docs/reference/precomputation-algorithms.md)、ブラウザ内の合成処理は[`docs/runtime-calculation-algorithms.md`](./docs/runtime-calculation-algorithms.md)を参照してください。確率分布、動的計画法、順序統計量、FFTを具体例から学ぶための入門は[`docs/probability-calculation-tutorial.md`](./docs/probability-calculation-tutorial.md)に記載しています。

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
  views/       Homeページ
tooling/reference-data/  参照用スキーマ、リポジトリ、歴史的アセット
tooling/reference-data/assets/  productionに同梱しないrevision-1 fixture
generator/     Python製の参照fixture生成器
experiments/   runtime計算・性能検証の参照実装と履歴資料
schemas/       事前計算データのJSON Schema
scripts/       browser smoke、runtime benchmark、検証スクリプト
tests/         behavior、依存グラフ、runtime、Worker、repository contractのテスト
```

参照fixtureと履歴的な実験は専用のtest suiteに分け、通常の`npm test`とは別に実行します。

アプリケーションのモジュール境界とデータ読込の流れは[`docs/architecture.md`](./docs/architecture.md)を参照してください。

## コントリビューション

不具合報告や変更提案を歓迎します。開発を始める前に [CONTRIBUTING.md](./CONTRIBUTING.md) を確認してください。

セキュリティ上の問題は公開Issueに詳細を書かず、[SECURITY.md](./SECURITY.md) の手順で報告してください。

## 権利表記

本作は、「矢野俊策」「有限会社F.E.A.R.」が権利を有する『ダブルクロス The 3rd Edition』の二次創作物です。

© 矢野俊策 / F.E.A.R.

ソースコードのライセンスは現在整理中です。ライセンスが明示されるまでは、既定の著作権法が適用されます。
