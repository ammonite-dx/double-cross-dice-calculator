# R27-B2a: Typed request coordination / feedback runtime

## 目的

R27-B1で確定したDIとfeature controllerの型境界を利用し、計算要求のlatest-wins制御と計算範囲フィードバックをTypeScriptのstrict typecheck対象へ移行した。CalculationClient本体や計算アルゴリズムの変更はこの作業へ混ぜていない。

## 変更点

- `src/runtime/CalculationRequestCoordinator.js`を`CalculationRequestCoordinator.ts`へ移行した。内部のrequest item、active/queued state、success/error/cancelled outcome、Promiseのresolve callback、Abort cleanupを明示型で表現した。
- one-running plus latest-queued、queued snapshot、新しい要求によるactive abort、stale result・plan・errorの抑制、commit中に始まった要求の優先、external AbortSignalの合成、resource-rejected status、`invalidate()`、`dispose()`の動作を維持した。
- request contextとfull runner contextを分離した。`execute`、`commit`、`onPlan`、`onCommitted`は`onRangePlan`を含むfull contextを受け取り、`onStart`はrequest contextを受け取る。
- `snapshotRequest()`の失敗には、runner signalや`onRangePlan`を持たないsnapshot failure contextを渡すよう型付けした。失敗した要求が最新revisionを所有し、active workをabortし、queued workを破棄する既存の動作も回帰テストで固定した。
- `invalidate()`と`dispose()`のsynthetic cancellationは`request: null`、`signal: null`、`options: {}`として表現し、実要求由来のabortとは別のunion memberにした。
- generic coordinator optionsへcustom fieldsと`signal`、`onRangePlan`を同時に持たせ、request statusを`idle`、`pending`、`running`、`success`、`error`、`cancelled`、`resource-rejected`のunionへ狭めた。
- deep snapshotはJSON cloneへ置き換えず、AbortSignalとPromise-likeのidentityを保ち、Date、RegExp、ArrayBuffer、DataView、TypedArray、Map、Set、配列、enumerable object、循環参照を複製する型安全な実装を維持した。
- `src/runtime/CalculationFeedback.js`を`CalculationFeedback.ts`へ移行した。公開export名とfeedback lifecycleを維持し、plan・warning・errorをstructural guardで処理するようにした。
- `formatRangeFeedback()`はCalculationRangePlanに限定せず、display feedback planの共通形状も受け取り、戻り値の`type`、`title`、`reasons`、`metrics.memory`、`overflow`、`action`を明示契約にした。`runInitialCalculation()`はplan型と結果型をgenericに推論し、`Promise<TResult | null>`を返す。

## 非対象

`src/runtime/CalculationClient.js`、`src/runtime/ResourceGuard.js`、`src/runtime/RuntimeDamageRollClient.js`、`src/runtime/RuntimeDamageRollWorker.js`は今回TypeScriptへ移行していない。`checkJs: false`を維持し、Vue、Vuetify、router、feature、UI、Worker protocol、計算結果、計算式、resource policyの意味論も変更していない。

## 回帰テストと検証

- coordinatorのlatest-wins、stale suppression、external abort、dispose、resource-rejected、defensive snapshotの既存テストを維持した。
- deep snapshotの特殊オブジェクト、`invalidate()`／`dispose()`のsynthetic cancellation、実要求abortのnon-null request、snapshot failure contextを追加検証した。
- `tests/typecheck/runtime-contracts.ts`へrequest status union、execute context、onStart、snapshot error、synthetic cancellation、latest runner inferenceのcompile-time検証を追加した。
- runtime architecture testを新しい`.ts`パスへ更新し、旧`.js`ファイルが残らないことを確認する。

最終検証は`npm run verify:all`、`npm run verify:browser`、`npm run benchmark:full-tail-attack`の全てで成功した。Vitestは104 files / 1099 tests、Markdown lintは86 files / 0 issues、production buildは458 modulesだった。production browser smokeはCheck、Attack、Backtrackの全経路で成功し、precomputed requests 0件、AttackのD10 requests 0件、browser diagnostics 0件を確認した。reference verificationは32 assets、reference Vitest 7 files / 53 tests、generator通常18 tests、simulation 13 tests、Ruff、runtime DX 20,000 casesが成功した。runtime DXの比較許容誤差は`0.000001000001`、最大絶対差は`8.999999999999999e-7`、最大総和誤差は`1.4432899320127035e-15`、非有限値と負値は0件だった。full-tail Attack benchmarkは全ケース成功し、result digestは`989000341.161962`、errorは全件`-`だった。

検証後の作業ツリーはcleanである。

## 次の作業

次はR27-B2bとして、typed request coordinationとfeedback runtimeを利用し、`CalculationClient.js`の型付けを行う。planner、DX provider、damage aggregation、ResourceGuard、Backtrackの依存契約を先に確認し、runtime計算の意味論を変更しない。
