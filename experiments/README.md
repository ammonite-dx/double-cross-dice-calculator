# 実験・監査ツール

`experiments/`には、production計算の正本ではない測定・比較・prototypeを保存します。実験コードはproduction sourceへ結果や設定を自動反映しません。

## 現行の監査・再現可能なbenchmark

- `r23-damage-summary-precision/`: Damage/Totalのcertificateと表示丸めを監査する。package scriptは`npm run audit:damage-precision`と`npm run audit:damage-tail`
- `r22-numerical-performance/`: 現行runtimeの数値・性能を同一条件で再測定する。必要な場合はREADMEのNode/Playwrightコマンドを直接実行する
- `phase2h-browser/`: Attackのfull-tail resourceとWorker境界を測定する。canonical Attackの受入に必要なrunnerだけpackage scriptへ残している
- `runtime-dr/`: DR reference/optimized実装を比較する。`npm run test:runtime-dr:full`から実行する

## 履歴実験

- `r19-worker-architecture/`: generalized Workerを採用しない判断の再現用測定
- `r20-conservative-rendering/`: Chart.js描画方式を変更しない判断の再現用測定
- `r23-ui-review/`: Product Ownerのvisual reviewとprototype capture
- `dynamic-distribution-ranges/`: 動的範囲plannerへ移行する前の設計・測定記録。現在のruntime契約は`docs/runtime-calculation-algorithms.md`を参照する

履歴実験のrunnerは、現在のnpm command surfaceからは削除しています。再現する場合は各READMEに記載した`node experiments/...`コマンドを直接実行してください。履歴資料は[`docs/archive/`](../docs/archive/)にあり、当時のパス、入力範囲、測定値は現在のproduction仕様を定義しません。
