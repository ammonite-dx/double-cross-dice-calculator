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
- Cloudflare Worker/API/MCP連携。canonical result contractが安定するまで着手しない。
- 教科書の《支配の領域》関連章。runtimeの最終計算方式が確定してから本文を更新する。

## 完了した直近の作業

- **R25-M: reaction score resolution separation**: 防御入力のraw snapshot、`rolled-score`／`fixed-score`／`forced-failure`のplanner・producer分離、BigIntによる《イベイジョン》固定値導出、疎な固定点分布、safe-integer終端境界を実装した。詳細は[`archive/r25-m-reaction-score-resolution-separation.md`](./archive/r25-m-reaction-score-resolution-separation.md)を参照する。
- **R26-A: result contracts and calculation semantic boundaries**: 汎用の`DistributionResult`、Score、Damage、Calculationのresult contractを`src/domain/`へ集約し、Scoreのcertificate・outcome・statistics、Damageのrequest・statistics・expectation certificate、DXのworking shapeを責務ごとに分離した。closure follow-upで新設semantic moduleをdomain/planner contractへ型接続し、Damage expectation certificateのruntime shapeと型を一致させ、typecheck regressionを追加した。数値計算、UI、advanced settings、Worker protocol、resource policy、schema versionは変更していない。詳細は[`archive/r26-a-result-contracts-calculation-semantic-boundaries.md`](./archive/r26-a-result-contracts-calculation-semantic-boundaries.md)を参照する。
- **R26-B: calculation execution decomposition**: `DamageAggregation`をcommon/error、envelope inspection、resource planning、opaque plan store、FFT execution、metadata/certificateへ分離し、`BacktrackCalculator`を通常D10・《屍人》生成器、計画検証、最終侵蝕率のorchestratorへ整理した。既存の公開export、位置引数互換性、計算式、resource estimate、Abort semantics、完全supportを維持し、型契約とarchitecture regressionを追加した。詳細は[`archive/r26-b-calculation-execution-decomposition.md`](./archive/r26-b-calculation-execution-decomposition.md)を参照する。
- **R26-C: shihai order-statistic simplification**: 正の`shihai`のruntime DXをダイス数状態DPから、完全な1DX結果の`(shihai + 1)`番目の順序統計量へ置き換えた。二項上側確率は短い側を対数空間で評価し、producerと`ScoreRangePlanner`が項数・CPU workを共有する。`dice <= shihai`、support、overflow、tail certificate、Python reference generatorと既存assetは維持し、ダイス数に依存しない作業配列へ整理した。詳細は[`archive/r26-c-shihai-order-statistic-simplification.md`](./archive/r26-c-shihai-order-statistic-simplification.md)を参照する。
- **R26-D: shihai exact-tail closure**: 正の`shihai`の境界をraw DX値1のファンブルとしてScoreの強制失敗へ正しく伝え、planner・producer・tail certificate・期待値certificateをexact order-statistic tailへ統一した。旧max支配上界への暗黙fallbackは削除し、有限な一次モーメント上界を構成できない場合はcertificateを返さずfail-closedとする。通常DXのCPU見積りをworking length基準へ揃え、runtimeアルゴリズムと結果契約を更新した。詳細は[`archive/r26-d-shihai-exact-tail-closure.md`](./archive/r26-d-shihai-exact-tail-closure.md)を参照する。
- **R27-A: advanced settings semantic boundary**: `showDetails`をfeature modelが所有する`advancedSettingsEnabled`へ置き換え、高度な設定がOFFのときに特殊効果が計算へ流れない不変条件をCheck・Attack双方へ導入した。OFF時のsanitizeと必要な再計算をmodel境界へ移し、OFFからONへ戻しても過去のhidden valueを復元しない。対象Vueコンポーネントのprops/emitsを型付き契約へ変更し、checkbox自身のaccessible labelとsemantic eventの回帰テストを追加した。詳細は[`archive/r27-a-advanced-settings-semantic-boundary.md`](./archive/r27-a-advanced-settings-semantic-boundary.md)を参照する。
- **R27-B1: typed CalculationClient injection / feature controller contracts**: Vue固有のCalculationClient DI keyを`src/plugins/`へ移し、runtimeからframework依存とDI責務を除去した。bootstrapとCheck・Attack・Backtrack PageをTypeScriptへ移行し、3 feature controllerの名前付き公開契約とprovider/injectのcompile-time回帰テストを追加した。`checkJs:false`とfeature rootのpage-only surfaceは維持している。詳細は[`archive/r27-b1-typed-client-feature-boundaries.md`](./archive/r27-b1-typed-client-feature-boundaries.md)を参照する。
- **R27-B2a: typed request coordination / feedback runtime**: `CalculationRequestCoordinator`と`CalculationFeedback`をTypeScriptへ移行し、one-running plus latest-queued、abort composition、stale suppression、feedback lifecycleを維持した。request、runner、snapshot failure、synthetic cancellationのcontextを実装形状に合わせて分離し、request status union、構造的なplan/error処理、genericなfeedback表示と初期計算の契約を追加した。当時のCalculationClient実装、ResourceGuard実装、Worker実装、`checkJs:false`は変更していない。詳細は[`archive/r27-b2a-typed-request-coordination.md`](./archive/r27-b2a-typed-request-coordination.md)を参照する。
- **R27-B2b: typed CalculationClient implementation**: `CalculationClient.ts`へ移行し、raw inputとnormalized input、operation別range plan、partial dependency injection、runtime DX LRU cache、sync/async ResourceLease、Total Damageのsnapshotとplan identity、Backtrackの歴史的位置引数を明示型へ接続した。既存の計算式、range policy、resource policy、latest-wins、Worker境界、`checkJs:false`、JS計算依存は変更していない。詳細は[`archive/r27-b2b-typed-calculation-client.md`](./archive/r27-b2b-typed-calculation-client.md)を参照する。
- **R27-B2c1: typed ResourceGuard runtime**: `ResourceGuard.ts`へ移行し、partial policyと`capacity` alias、AbortSignal-like入力、policy/request normalization、reservation計算、FIFO queue、queued abort、active lease ownership、snapshot契約を明示型へ接続した。`acquire()`の常時Promise、`acquireLease()`／`acquirePlan()`の即時lease、invalid requestのrejected Promiseを維持し、`ResourceGuard.js`は削除した。詳細は[`archive/r27-b2c1-typed-resource-guard.md`](./archive/r27-b2c1-typed-resource-guard.md)を参照する。
- **R27-B2c2: typed RuntimeDamageRollClient**: productionのRuntime Damage Roll clientを`RuntimeDamageRollClient.ts`へ移行し、Worker本体はJSのまま維持した。production lifecycle suiteを正本として1 active + FIFO queue、pending/queued dedup、subscriber単位Abort、Worker tokenによるstale event抑制、Worker再生成、LRU cache、defensive copy、caller optionsとWorker wire optionsの分離を回帰テストと型で固定した。旧実装と重複するexperiment client testは削除し、ResourceGuardのlease所有権と既存Worker protocolは変更していない。詳細は[`archive/r27-b2c2-typed-runtime-damage-roll-client.md`](./archive/r27-b2c2-typed-runtime-damage-roll-client.md)を参照する。
- **R27-B2c3: typed CheckRangePolicy**: Checkのrange policy snapshotを`CheckRangePolicy.ts`へ移行し、display requestのown-property・座標・mode検証、policyのcycle-safe clone／deep freeze、retired key拒否、malformed root拒否を既存のruntime error contractのまま型付けした。表示座標はpolicyへコピーせずplanner requestとして分離し、CalculationClientのdisplay request有無による既存の伝播意味論を維持した。詳細は[`archive/r27-b2c3-typed-check-range-policy.md`](./archive/r27-b2c3-typed-check-range-policy.md)を参照する。
