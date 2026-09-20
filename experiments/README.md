# 実験・監査ツール

`experiments/`には、production計算の正本ではない測定・比較・prototypeを保存します。実験コードはproduction sourceへ結果や設定を自動反映しません。

## 現行の監査・再現可能なbenchmark

- `r23-damage-summary-precision/`: Damage/Totalのcertificateと表示丸めを監査する。package scriptは`npm run audit:damage-precision`と`npm run audit:damage-tail`
- `r22-numerical-performance/`: 現行runtimeの数値・性能を同一条件で再測定する。`npm run benchmark:numerical:node`、`npm run benchmark:numerical:browser`、またはREADMEの短縮・cross-engineコマンドを使う
- `phase2h-browser/`: Attackのfull-tail resourceとWorker境界を測定する。`npm run benchmark:attack-worker`、`npm run benchmark:attack-resource:short`などの目的名commandを使う
- `runtime-dr/`: DR reference/optimized実装を比較する。`npm run verify:damage-roll-optimized`、`npm run verify:damage-roll-reference`、`npm run benchmark:damage-roll`から実行する

## 履歴実験

- `r19-worker-architecture/`: generalized Workerを採用しない判断の再現用測定
- `r20-conservative-rendering/`: Chart.js描画方式を変更しない判断の再現用測定
- `r23-ui-review/`: Product Ownerのvisual reviewとprototype capture
- `dynamic-distribution-ranges/`: 動的範囲plannerへ移行する前の設計・測定記録。現在のruntime契約は`docs/runtime-calculation-algorithms.md`を参照する

履歴実験のtest suiteは`npm run test:experiments`でproduction regression suiteと分離して実行します。履歴資料は[`docs/archive/`](../docs/archive/)にあり、当時のパス、入力範囲、測定値は現在のproduction仕様を定義しません。
