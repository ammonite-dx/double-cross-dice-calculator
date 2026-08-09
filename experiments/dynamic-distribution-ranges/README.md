# 動的分布範囲planner実装前調査

このディレクトリは、入力範囲、DXの尾部打ち切り、ダメージの有限support、作業分布、FFT長、表示範囲、計算時間、メモリ量を一体で計画するための実装前調査です。本番の`src`、配信JSON、UI入力制約は変更していません。

## ファイル

- [`planner.mjs`](./planner.mjs)は、`score`、`check`、`attack`、`backtrack`について、`shihai=0`の`exact-max`/`exact-yousei` tail certificate、`shihai>0`の保守bound、有限support、作業範囲、FFT長、概算資源量、警告とhard rejectを返す参照plannerです。将来の本番APIの候補を実行可能な形で記録しています。
- [`benchmark.mjs`](./benchmark.mjs)は、現行DX・DR計算、可変supportのDX参照計算、可変FFT長のD10混合、FFT、planner代表ケースをNodeで測定します。
- [`results.json`](./results.json)は、最後にベンチを実行した結果です。`generatedAt`、Node、CPU、OS、反復回数、理論上の`Float64Array`容量を含みます。
- [`decision.md`](./decision.md)は、現行境界、数式、API案、推奨しきい値、責務分担、実装段階、テスト計画、未解決事項を記録します。

## 実行

リポジトリの要求Nodeは`.node-version`に記録された`22.23.2`です。実測環境でそのバージョンが利用できない場合も、スクリプトは実行したNodeバージョンを結果へ記録します。

```shell
node experiments/dynamic-distribution-ranges/benchmark.mjs --write-results
```

`--write-results`を省略すると、結果を標準出力だけへ出します。ベンチは現行の`dr`最適化実装を`kazanari=0/9`で測定し、拡張ケースの`kazanari=0`は有限D10多項式の可変FFT参照実装で測定します。拡張`kazanari>0`の実ブラウザ性能は、既存の[`runtime-dr`](../runtime-dr/README.md)実験と、将来のブラウザWorker測定で確定します。

## 専用テスト

plannerの境界条件はNode標準の`node:test`で検証します。

```shell
node --test experiments/dynamic-distribution-ranges/planner.node-test.mjs
```

テストはtail cutoffの境界と単調性、`critical=11`・`dice=0`、`exact-yousei`の境界、tail model名、互換入力reject、有限DR support、FFT長、warning/hard境界、FFT係数、`published-bucket`と`full-tail`の差を対象にします。
