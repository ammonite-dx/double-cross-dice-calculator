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

1. **R26-B: 残存core/application境界の整理**: R26-Aで確定したdomain result contractとScore/Damage境界を前提に、残るruntime/application adapterの依存方向と公開型を再評価する。数値計算、UI、Worker protocol、resource policyは変更しない。
2. **公開準備**: ライセンス、出典、公開範囲、再生成手順を確認し、ソース公開に必要なファイルだけを現行ツリーへ残す。
3. **実測に基づくresource policy調整**: 動的範囲の代表ケースを計測し、必要ならCPU・メモリの警告閾値を調整する。入力・表示の固定上限を復活させない。

## 保留

- 実測に基づくruntimeの性能・メモリ上限の再調整。
- Cloudflare Worker/API/MCP連携。canonical result contractが安定するまで着手しない。
- 教科書の《支配の領域》関連章。runtimeの最終計算方式が確定してから本文を更新する。

## 完了した直近の作業

- **R25-M: reaction score resolution separation**: 防御入力のraw snapshot、`rolled-score`／`fixed-score`／`forced-failure`のplanner・producer分離、BigIntによる《イベイジョン》固定値導出、疎な固定点分布、safe-integer終端境界を実装した。詳細は[`archive/r25-m-reaction-score-resolution-separation.md`](./archive/r25-m-reaction-score-resolution-separation.md)を参照する。
- **R26-A: result contracts and calculation semantic boundaries**: 汎用の`DistributionResult`、Score、Damage、Calculationのresult contractを`src/domain/`へ集約し、Scoreのcertificate・outcome・statistics、Damageのrequest・statistics・expectation certificate、DXのworking shapeを責務ごとに分離した。数値計算、UI、advanced settings、Worker protocol、resource policy、schema versionは変更していない。詳細は[`archive/r26-a-result-contracts-calculation-semantic-boundaries.md`](./archive/r26-a-result-contracts-calculation-semantic-boundaries.md)を参照する。
