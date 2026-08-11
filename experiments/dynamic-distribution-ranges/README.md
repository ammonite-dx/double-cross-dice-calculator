# 動的分布範囲 Phase 2-E ベンチマーク基盤

このディレクトリは、入力範囲、DXの尾部打ち切り、ダメージの有限support、作業分布、FFT長、表示範囲、計算時間、メモリ量を一体で評価する調査用基盤です。本番の計算コード、UI、配信JSONは変更せず、現行ケースと拡張候補ケースをNodeとブラウザで測定します。

## ファイル

- [`planner.mjs`](./planner.mjs)は、`score`、`check`、`attack`、`backtrack`の作業範囲、FFT長、概算資源量、warning、hard rejectを返す参照plannerです。
- [`benchmark.mjs`](./benchmark.mjs)は、Phase 2-Aから2-DまでのNodeベースラインです。既存の[`results.json`](./results.json)はその履歴として扱います。
- [`benchmark-phase2e.mjs`](./benchmark-phase2e.mjs)は、Phase 2-EのNodeケースを測定し、結果を標準出力へJSONで出します。ファイルへ結果を書き込みません。
- [`browser-benchmark.html`](./browser-benchmark.html)と[`browser-benchmark.js`](./browser-benchmark.js)は、同じケースをブラウザのmain threadとWorkerで測定するページです。Worker対象はDRとattackです。
- [`vite.config.mjs`](./vite.config.mjs)は、ブラウザベンチ専用の開発サーバーと専用buildを定義します。
- [`decision.md`](./decision.md)は、Phase 2-Eの実測値、入力上限の暫定判断、未完の検証を記録します。

## 前提

`.node-version`のNode `22.23.2`を選択してから実行してください。`node`が別のバージョンを指している場合は、fnmなどで`22.23.2`へ切り替えるか、同じNode実行ファイルで以下のコマンドを実行します。

## Nodeベンチマーク

```shell
node --version
node experiments/dynamic-distribution-ranges/benchmark-phase2e.mjs
```

Nodeベンチは2回のwarmup後に7回のwarm測定を行い、現行ケース、Worker対象の入力、plannerのみのケースを区別します。Nodeの時間はブラウザのWorker転送、イベントループ遅延、端末差を含まないベースラインです。

## ブラウザベンチマーク

専用Viteサーバーを起動します。

```shell
node node_modules/vite/bin/vite.js --config experiments/dynamic-distribution-ranges/vite.config.mjs --host 127.0.0.1 --port 3000
```

Chromeで<http://127.0.0.1:3000/experiments/dynamic-distribution-ranges/browser-benchmark.html>を開き、ページに表示されたJSONを確認します。ブラウザベンチは`browser: true`のケースだけを測定し、ページエラー、Long Task、数値異常、Resource Timingの利用可否も結果に含めます。`mainThreadTimerDelayApproxMilliseconds`は処理のCPU時間ではなく、処理中に登録したzero-delay timerが発火するまでの遅延近似です。Workerのcold測定はWorker生成と初回要求を含みます。

## buildの分離

通常buildと専用buildは別コマンドと出力先を使います。

```shell
npm run build
node node_modules/vite/bin/vite.js build --config experiments/dynamic-distribution-ranges/vite.config.mjs
```

通常buildの出力先は`dist/`で、ブラウザベンチページを含みません。専用buildの出力先は`dist-dynamic-distribution-ranges/`で、`.gitignore`によりGit追跡対象外です。ベンチ用エントリは通常アプリのimport graphへ接続していません。

## 結果の保存方針

Phase 2-EのNode結果は標準出力、ブラウザ結果はページ内JSONを正とし、実測JSONをリポジトリへ保存したりGit追跡したりしません。必要な再測定結果はローカルで一時保存し、コミットへ追加しないでください。既存の`results.json`は過去Phaseの追跡済み履歴であり、Phase 2-Eの新しい結果置き場ではありません。

## plannerテスト

```shell
node --test experiments/dynamic-distribution-ranges/planner.node-test.mjs
```

plannerテストはtail cutoffの境界と単調性、`critical=11`・`dice=0`、`exact-yousei`、有限DR support、FFT長、warning/hard境界、`published-bucket`と`full-tail`の差を対象にします。
