# 動的分布範囲の調査記録

このディレクトリは、入力範囲、DXの尾部、ダメージの有限support、作業分布、FFT長、表示範囲、計算時間、メモリ量を検討した過去の調査記録です。調査結果とplannerの境界は現在の`RangePlanner`、`ResourceGuard`、canonical計算の設計根拠として残しています。

## 現在も参照するファイル

- [`planner.mjs`](./planner.mjs)は、score、check、attack、backtrackの作業範囲、FFT長、概算資源量、warning、hard rejectを返す調査用plannerです。
- [`planner.node-test.mjs`](./planner.node-test.mjs)はtail cutoff、単調性、有限support、FFT長、warning、hard rejectの境界を検証します。
- [`benchmark.mjs`](./benchmark.mjs)は、調査時点のNodeベースラインを再現する歴史的な測定スクリプトです。
- [`decision.md`](./decision.md)と[`results.json`](./results.json)は、Phase 2-Aから2-Fまでの判断と実測値を保持する履歴資料です。

## 退役したファイル

Phase 2-E／2-FのNode・ブラウザハーネスは、削除済みのlegacy計算APIへ依存していたため、Phase 8-2G10で退役しました。現行の計算を測定する場合は、[`experiments/phase2h-browser/`](../phase2h-browser/)のcanonical Attack／full-tail resource benchmark、または[`scripts/benchmark-full-tail-attack.mjs`](../../scripts/benchmark-full-tail-attack.mjs)を使用してください。

退役したハーネスの実測値と設計判断はGit履歴、`decision.md`、`results.json`から参照できます。公開サイトのbuildやproduction import graphには、このディレクトリの歴史的測定コードを含めません。

## Plannerテスト

```shell
node --test experiments/dynamic-distribution-ranges/planner.node-test.mjs
```

`.node-version`のNode `22.23.2`を選択して実行してください。plannerの入力上限やresource policyを変更した場合は、canonical計算テスト、resource guardテスト、production smokeと合わせて検証します。
