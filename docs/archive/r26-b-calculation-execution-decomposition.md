# R26-B: Calculation execution decomposition

R26-Bでは、R26-Aで確定した結果契約を前提に、計算コアの実行責務を分離した。目的は数値アルゴリズムやresource policyを変更せず、入力検査、計画、実行、metadata生成、ルール固有の分布生成を独立に検証できる構造にすることである。

## DamageAggregation

`DamageAggregation.js`は公開facadeとして維持し、既存のerror export、limit定数、`validateDamageAggregationOptions`、`planDamageAggregation`、`sumDamage`をそのまま公開する。入力検査とcaller-owned配列のsnapshotは`DamageAggregationInspection.js`、FFT長・畳み込みstep・CPU work・resource estimateは`DamageAggregationPlanner.js`、private `WeakMap` registryは`DamageAggregationPlanStore.js`、承認済みplanのFFT実行・数値正規化・overflow生成は`DamageAggregationExecutor.js`、component descriptor・projection uncertainty・期待値certificate・aggregate metadataは`DamageAggregationMetadata.js`、共有error/options契約は`DamageAggregationCommon.js`へ分離した。

`planDamageAggregation`は入力の分布とmetadataを一度検査して係数列を所有copyし、公開planとprivate recordを作る。`sumDamage`がそのplanを受け取る場合は、入力identity、resource limits、Abort状態、private registryを確認したうえでexecutorへ渡す。公開planを似た形で作っただけのオブジェクト、別の入力配列、別のlimitで作ったplanは従来どおり拒否する。0 componentの恒等分布、1 componentのcopy、empty explicit values、exact／upper-bound／mixed overflow、FFT mass drift、Kahan相当の期待値区間加算も変更していない。

## Backtrack

`BacktrackCalculator.js`は入力正規化、range plan検証、生成器呼び出し、最終侵蝕率への変換だけを担当する。通常D10のwrapperと生成modeのdispatchは`BacktrackDistributionGenerator.js`、《屍人》の状態DPは`BacktrackLivingdeadDistribution.js`、計画と入力の整合性検証は`BacktrackPlanValidation.js`へ移した。既存の`calculateD10Distributions`、`calculateLivingdeadDistributions` export、第三引数のdependencies、計画を第三引数へ渡す位置引数互換性、Abort間隔、103個の既存回帰ケースを含むon-demand完全support生成は維持した。

## 型と検証

`DamageAggregationTypes.ts`へ実行時plan stepの実形状（`resultLength`）とaggregate metadata、inspection record、internal plan、executor diagnosticsの型を追加した。`BacktrackRangePlan`には実際のplannerが公開する`baseFloat64Bytes`と`resultFloat64Bytes`を追加し、生成器・検証済みplanの境界型も定義した。`tests/corePlanningArchitecture.test.js`はDamageのinspection／planner／executor／metadata境界と、Backtrackのgenerator／livingdead／validation境界を固定する。

## 変更しなかったもの

確率計算式、FFT実装、丸め・許容誤差、resource上限、ResourceGuard、CalculationClientのsnapshot・lease・Abort・release lifecycle、UI、Worker protocol、公開APIの名前と引数、参照JSONは変更していない。R27ではruntime/application adapterの型境界と、高度な設定が計算へ及ぼす効果を整理する。

## 検証実績

R26-Bのclosure follow-upでは、以下を実行してすべて成功した。

- `npm run verify:all`
- Vitest 104 files / 1071 tests
- generator通常テスト18件、simulation 13件
- runtime DX 20,000ケース
- production browser smoke（Check／Attack／Backtrack）
- TypeScript型検査、ESLint、Markdown lint、production build
- full-tail attack benchmark（エラー0件、digest `1245155.511306`）
- `git diff --check`

作業ツリーもcleanである。103個の既存回帰ケースを含むon-demand完全support生成、DamageAggregationとBacktrackの依存境界テスト、《屍人》のn=0／n=1およびn=2独立オラクルも通過した。
