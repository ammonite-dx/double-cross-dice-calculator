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

R26-Aの各実装単位で、`npm run typecheck`、`npm run lint`、Score関連テスト、Damage関連テスト、DX関連テスト、architecture testsを実行して成功した。最終closureでは`npm run verify:core`、`npm run verify:browser`、`npm run verify:reference`、`npm run benchmark:full-tail-attack`、`npm run verify:all`、`git diff --check`を実行し、既存のbenchmark digest `1245155.511306`を維持する。

## 次の作業

R26-A後は、残存するruntime/application adapterの依存方向と公開型を整理するR26-Bへ進む。Cloudflare Worker、HTTP API、MCP化は引き続き将来目標であり、今回の作業には含めない。
