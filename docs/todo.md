# TODO

このファイルは、現行の実装と今後の判断だけを記録する。完了済みの移行記録と詳細な作業日誌は [`archive/todo-history.md`](./archive/todo-history.md) に保存する。

## 現在の方針

- 公開サイトは静的SPAとして維持し、確率計算はブラウザ内のruntimeを正本とする。
- 旧来の確率JSONは [`tooling/reference-data/assets/`](../tooling/reference-data/assets/) に参照用として保持し、公開成果物へは含めない。
- `published-bucket` はproductionの計算・表示モードではなく、[`tooling/reference-data/PublishedBucketCompatibility.js`](../tooling/reference-data/PublishedBucketCompatibility.js)に置く歴史的比較・互換adapterとして維持する。
- productionの計算範囲に`calculationMax=1022`や`PUBLISHED_OVERFLOW_INDEX=1023`を置かない。これらは`tooling/reference-data/`にある歴史的な比較形式の定数としてのみ保持する。入力・表示範囲は要求されたwindowと数学的supportから計画し、resource guardで安全性を判定する。
- DXの直接APIは暗黙の既定配列長を持たず、呼び出し側が`workingLength`を明示する。通常のproduction呼び出しでは`ScoreRangePlanner`がtail certificateと要求windowから値を決める。
- DRのFFT長と出力長は、明示指定がない限り入力の有限supportから動的に導出する。Backtrackは通常D10・Dロイス《屍人》ともon-demand生成し、歴史的assetのcoverage metadataをproduction planへ持ち込まない。
- 結果契約、資源ガード、latest-wins、Worker境界、数値許容誤差を変更する場合は、先に対応するテストと文書を更新する。

## 次に行う作業

1. **公開準備**: ライセンス、出典、公開範囲、再生成手順を確認し、ソース公開に必要なファイルだけを現行ツリーへ残す。
2. **実測に基づくresource policy調整**: 動的範囲の代表ケースを計測し、必要ならCPU・メモリの警告閾値を調整する。入力・表示の固定上限を復活させない。

## 保留

- 実測に基づくruntimeの性能・メモリ上限の再調整。
- Cloudflare Worker/API/MCP連携。結果契約と公開境界が安定するまで着手しない。
- 教科書の《支配の領域》関連章。runtimeの最終計算方式が確定してから本文を更新する。

## 完了した直近の作業

- **R29-I: architecture convergence closure**: R29-A〜Hの計算・runtime・presentation・参照境界と検証責務を監査し、旧移行用語を整理した。全体ゲートが成功し、R29を`CLOSED / GREEN`とした。詳細は[`archive/r29-i-architecture-convergence-closure.md`](./archive/r29-i-architecture-convergence-closure.md)を参照する。
- **R29-H: active documentation and naming cleanup**: production presentation DTO、Attack runtime benchmark、現行用語とドキュメントを整理し、active Markdown link contractを追加した。詳細は[`archive/r29-h-active-documentation-naming-cleanup.md`](./archive/r29-h-active-documentation-naming-cleanup.md)を参照する。
