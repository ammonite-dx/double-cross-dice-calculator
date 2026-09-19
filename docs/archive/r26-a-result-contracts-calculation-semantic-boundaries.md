# R26-A: Result contracts and calculation semantic boundaries

R26-Aでは、canonical resultがproductionの唯一経路になったことをコードの責務配置へ反映した。目的は、計算結果の汎用契約、ScoreとDamage固有の意味論、計算producer、runtime adapterを相互に混在させず、次のリファクタリングで依存方向を判断しやすくすることである。

## 実装結果

- `src/domain/DistributionResultTypes.ts`、`ScoreResultTypes.ts`、`DamageResultTypes.ts`、`CalculationResultTypes.ts`をresult contractの正本とした。presentation側はこれらをtype-only importし、同じ形の型を再宣言しない。
- `ScoreCertificates.ts`へScore tail・moment・expectation certificateの生成と検証を移した。
- `ScoreOutcome.ts`へforced failureとregular scoreの分解、疎なbucket走査、対決成功確率の区間計算を移した。
- `ScoreStatistics.ts`へScoreの期待値・固定難易度・対決成功率の統計値構築を移し、`ScoreCalculator.js`はScore producerとresolution dispatchに限定した。
- `DamageRollRequest.ts`へScore envelopeからDamage weightsを作る処理を移し、`DamageStatistics.ts`へDamageとTotal Damageの統計値構築を移した。
- `DamageExpectationCertificate.js`がScore tail certificateからDamage期待値certificateを作る責務を持つ。`DistributionResult.js`はDamage固有の統計やcertificateへ依存しない。
- `DxWorkingShape.js`へYousei block lengthとFFT lengthの規則を移し、`ScoreRangePlanner.js`が`DxCalculator.js`へ依存しない構造にした。

## 変更しなかった契約

数値計算、Float64Array内部表現、Score/Damage/Backtrackの公開result shape、UI、advanced settings、Worker protocol、ResourceGuard、schema version、published-bucket互換境界は変更していない。`CalculationClient`の公開結果は従来どおり`score`、`scoreStatistics`、`damage`、`damageStatistics`、`totalDamage`、`totalDamageStatistics`を返す。

## 検証

R26-Aのclosure follow-upでは、5つのsemantic moduleから暗黙の`any`を除去し、domain/planner contractへのtype-only dependencyを追加した。`DamageExpectationCertificate`のruntime生成項目も型へ反映し、`tests/typecheck/calculation-semantic-contracts.ts`でfactoryの戻り値、Score outcome/statistics、Damage request/statistics、malformed certificateのcompile-time契約を固定した。

最終検証では、`npm run verify:all`、`npm run benchmark:full-tail-attack`、`git diff --check`を実行して成功した。Vitestは104 files / 1067 tests、generatorは通常18 tests・simulation 13 tests、runtime DXは20,000ケースで成功し、benchmark digestは`1245155.511306`を維持した。production browser smoke、typecheck、ESLint、Markdown lint、build、reference/generator検証も成功した。

## 次の作業

R26-A後は、`DamageAggregation`のplanner / executor / metadata-certificate分離と、`BacktrackCalculator`の通常D10 wrapper・《屍人》分布生成・orchestration分離を行うR26-Bへ進む。runtime/application adapterの依存方向と公開型、UI semanticsはR27へ回す。Cloudflare Worker、HTTP API、MCP化は引き続き将来目標であり、今回の作業には含めない。
