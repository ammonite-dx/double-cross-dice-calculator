# TODO

このファイルは、現行の実装と今後の判断だけを記録する。完了済みの移行記録と詳細な作業日誌は [`archive/todo-history.md`](./archive/todo-history.md) に保存する。

## 現在の方針

- 公開サイトは静的SPAとして維持し、確率計算はブラウザ内のruntimeを正本とする。
- 旧来の確率JSONは [`tooling/reference-data/assets/`](../tooling/reference-data/assets/) に参照用として保持し、公開成果物へは含めない。
- `published-bucket` はproductionの計算・表示モードではなく、[`tooling/reference-data/PublishedBucketCompatibility.js`](../tooling/reference-data/PublishedBucketCompatibility.js)に置く歴史的比較・互換adapterとして維持する。
- `RangePlanner`の既定`calculationMax=1022`と`PUBLISHED_OVERFLOW_INDEX=1023`は、今回のR25-Kでは変更しない。これは入力・表示上限ではなく、既存比較と資源計画の境界である。
- 結果契約、資源ガード、latest-wins、Worker境界、数値許容誤差を変更する場合は、先に対応するテストと文書を更新する。

## 次に行う作業

1. **R12: 計算coreの責務分割**: R25-Kで整理したcanonical result境界を前提に、Score、Damage、Backtrack、結果契約の依存方向を再評価する。
2. **1022境界の再評価**: 実測した計算量・メモリと利用実態を確認し、`calculationMax`を維持するか、別の資源計画へ置き換えるかを決める。変更時は表示上限と混同しないようにする。
3. **公開準備**: ライセンス、出典、公開範囲、再生成手順を確認し、ソース公開に必要なファイルだけを現行ツリーへ残す。

## 保留

- 実測に基づくruntimeの性能・メモリ上限の再調整。
- Cloudflare Worker/API/MCP連携。canonical result contractが安定するまで着手しない。
- 教科書の《支配の領域》関連章。runtimeの最終計算方式が確定してから本文を更新する。
