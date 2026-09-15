# R25-E 型付きruntime contract

## 目的

R25-Eでは、計画、runtime実行、表示投影、feature stateの境界をTypeScriptの型として辿れるようにした。実装は既存のJavaScript runtimeを維持し、型のために計算結果、Worker protocol、ResourceGuard、latest-wins、表示値を変更していない。

## 実装単位

次の順で4コミットに分けた。

1. `bb97f04` — `refactor: type calculation planning contracts`
2. `313f89e` — `refactor: type runtime execution contracts`
3. `1e2ced0` — `refactor: type presentation and feature contracts`
4. `4cca1bb` — `refactor: remove feature runtime type casts`

## 型の配置

- `src/calculation/planning/RangePlannerTypes.ts`は、operation別のrange plan、policy、warning、resource estimateを定義する。`CalculationRangePlan`はoperationの判別共用体であり、`CalculationClientTypes.ts`のplan methodと`onRangePlan`へ接続する。
- `src/calculation/DamageAggregationTypes.ts`は、total damageのFFT、配列長、memory、component数、Abort callbackのoptionsを定義する。
- `src/runtime/CalculationClientTypes.ts`は、Check、Attack、Backtrack、Total Damageのoptionsと結果をoperation別に定義する。`rangePolicy`はnested partialの`RangePolicyInput`、plan methodは対応するrange plan、plan callbackは`CalculationRangePlan`を受け取る。
- `src/runtime/RuntimeDamageRollClientTypes.ts`は、caller側のAbortSignalを含むruntime DR clientと、Workerへ渡す最小surfaceを定義する。signalはWorker requestへ含めず、既存のrequest／success／failure protocolを維持する。
- `src/runtime/ResourceGuardTypes.ts`は、operationに依存しないresource reservationとleaseの最小契約を定義する。
- `src/runtime/CalculationFeedbackTypes.ts`は、feedback state、runner context、latest calculation runnerをplan/result/requestのgenericとして表す。
- `src/shared/presentation/DistributionProjectionTypes.ts`は、`ready`、`not-ready`、`not-projectable`を判別共用体で表す。`ReadyDistributionProjection`だけがowned `Float64Array`を持ち、Chart.js materializerもready型だけを受け取る。
- `src/features/check`と`src/features/attack`は、shared presentation contractとfeature固有のpresentation/state型を利用する。Attack runner、incremental execution、calculation record、validated side eventも個別の型へ接続した。

## JavaScriptとTypeScriptの共存

計算・Worker・runnerの既存JavaScriptを一括でTypeScriptへ変換せず、意味のある型をtype-only `.ts`へ集約し、公開JavaScript exportへJSDocで接続した。`tsconfig.json`の`allowJs: true`と`checkJs: false`は維持する。これにより、型を辿れるconsumer契約を得ながら、大きなruntime moduleの機械的変換や実行時の差分を避けている。

Attack runnerのpresentation factoryは、productionで使うdisplay presentationと、既定のUI非依存presentationの両方を型上で表現できるgeneric contractとした。入力検証イベントは`side`とsnapshotを対応付けた判別共用体とし、action snapshotをreaction eventへ渡す誤りをcompile-timeで拒否する。

## `unknown`を残す境界

`unknown`は除去率を上げるために一律削除していない。catchした外部例外、generic metadataの拡張値、未検証のraw input、warningの異種`value`／`limit`は、呼び出し時点で具体型を保証できないため`unknown`のままにする。一方、CalculationClientのpolicy、plan return、plan callback、Attack runner options、presentation projection、calculation record配列には意味的な型を与え、`as unknown as`による境界の迂回をなくした。

## 維持した契約

R25-Eでは、RangePlannerの値とresource threshold、Score tail、Damage／Total Damage、full-tail／published-bucket、Worker message、Worker preemption、ResourceGuard ownership、latest-wins、Attack incremental reuse、projection decision、Check／Attackのチャート値、Backtrack結果、UI挙動を変更していない。型は既存runtime object shapeに合わせており、型の都合で新しい互換shimやfallbackを追加していない。

## 検証

各実装コミットでtypecheck、ESLint、差分検査を実行した。最終HEADでは`npm run verify:release`が成功し、Node version check、公開32 assetのgenerator検証、Vitest 103ファイル／1049テスト、generator 18件、simulation 13件、Ruff、typecheck、runtime DX 20,000ケース、ESLint、Markdown lint 65ファイル／0 issues、production build（424 modules）、production browser smoke、`git diff --check`を確認した。追加の`npm run audit:r23:damage-precision`と`npm run audit:r23:damage-tail`も成功した。作業ツリーは文書コミット後にcleanとする。
