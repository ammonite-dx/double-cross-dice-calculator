# R21: 互換性・検証資産・リポジトリ整理インベントリ

## 目的

R21では、ユーザーに見える画面、計算の意味論、実行時の責務を変更せずに、現行production、release verification、historical experiment、reference assetの境界を整理する。削除や公開URLの変更は、このインベントリでconsumerと互換性への影響を確認した後の独立した作業単位で行う。

## 開始点と制約

R20のdocs-only closure後のR21開始点は`15d3b2d0cd88c93c41d64b1c286e95f6135609b5`である。R21では次の領域を変更しない。

- UIのlayout、順序、CSS、色、チャート形式、アニメーション、marker、tooltip、入力controls、responsive behavior
- DX、Score、Damage、Total Damage、Backtrackの計算意味論、tailとoverflowのcertificate、`CertifiedValue`、`CertifiedProbability`
- `ResourceGuard`、`RuntimeDamageRollWorker`、R17のincremental Attack execution、R18のpresentation ownership、R19のhybrid Worker判断
- 公開済みschema-v2 asset、generator出力、reference-dataの形式、公開URL

最初のR21実装単位では削除、rename、source変更、package変更を行わない。この文書は、後続の監査と削除判断の基準となる現状スナップショットである。

## 分類方法

候補は次の4分類で扱う。分類は現時点の暫定判断であり、削除を許可するものではない。

- **A: production-required** — 現行feature、runtime、公開計算clientが必要とするもの
- **B: release-verification-required** — release gate、architecture test、browser smoke、数値回帰に必要とするもの
- **C: historical/reference-only** — 過去の設計判断、再現可能な調査、再生成・比較のために保持するもの
- **D: removable candidate** — consumer、公開互換性、再現性の価値がないことを確認した後に削除を検討できるもの

各候補は、production importの有無とproduction featureの実利用を分けて記録する。runtimeにimportされていても、featureが使わない比較・互換APIなら、直ちにAとは判断しない。

## 調査方法

削除候補ごとに、symbolとfilenameの両方を検索する。

```text
git grep -n "<symbol>"
git grep -n "<filename>"
```

検索結果は、production consumer、test consumer、experiment consumer、docs-only、consumerなしに分ける。package script、CI workflow、公開assetのmanifest、READMEやADRからの参照も確認し、consumerが別の削除候補を経由していないかを追跡する。

## 現行インベントリ

| 対象 | owner | production import / consumer | 検証・実験consumer | 暫定分類 | 次の判断 |
| --- | --- | --- | --- | --- | --- |
| `src/runtime/AttackBatchInput.js` | runtime request boundary | `CalculationClient.js`がimportする。`useAttack`はincremental APIを使い、直接batchを呼ばない | `attackBatchClient.test.js`、integration test、phase2h browser benchmark | B / D候補 | R21-2で公開API、release gate、benchmark依存を個別に確認する |
| `src/runtime/CalculationClient.js` | calculation runtime facade | Check、Attack、Backtrackのproduction client。batch methodも同じfacadeに残る | runtime contract、integration、browser smoke | A（batch部分はD候補） | facade全体とbatch-only surfaceを分離して監査する |
| `src/runtime/CalculationClientTypes.ts` | TypeScript client contract | production clientの型。`calculateAttackBatch`を含む | typecheckとclient tests | A（batch部分はD候補） | batchを削除できる場合だけ型から同時に外す |
| `tests/attackBatchClient.test.js` | batch compatibility test | production featureからは直接呼ばれない | Vitest、batch入力snapshot・total・Abort・resource契約 | B / D候補 | batch APIを保持する根拠がなくなるまで削除しない |
| `tests/attackFeatureArchitecture.test.js`、`attackContract.test.js` | Attack boundary tests | production featureのincremental ownershipを検査する | Vitest、batch依存をfeatureから排除する回帰 | B | 内部helper名ではなくfeatureのobservable contractを守る |
| `tests/productionDependencyContract.test.js`、`runtimePresentationArchitecture.test.js`、`dataResponsibilitiesArchitecture.test.js`、`namingArchitecture.test.js` | architecture and dependency tests | production境界を検査する | Vitest、source import・命名・asset requestの回帰 | B | semantic boundaryを残し、実装文字列だけを固定するassertionを監査する |
| `tests/releaseVerificationContract.test.js` | release gate contract | CIと`verify:release`の関係を検査する | Vitest、package script・workflow・README・差分検査 | B | release commandの役割を維持し、重複だけを整理する |
| `src/calculation/planning/RangePolicy.js`、`ScoreRangePlanner.js`、`DamageCalculator.js` | calculation core | production Attackは`full-tail`を選択する | range、damage、runtime rule、comparison test | A | `published-bucket`を機械削除せず、意味を下記の互換監査で確定する |
| `published-bucket` | explicit compatibility semantic | production defaultではなく、比較・互換計画で明示指定する | range planner、damage on-demand、integration、reference fixture | B / C | 公開assetと比較結果に必要かを確認し、必要なら境界をdocsとtestで固定する |
| `full-tail` | current production semantic | production AttackのScoreからDamageへの伝播に使用する | full-tail benchmark、range・runtime・rule tests | A / B | `published-bucket`へ置換せず、現行意味論を維持する |
| `experiments/r19-worker-architecture/` | architecture decision evidence | production importなし | Workerとhybrid clientの比較測定 | C | R19の判断根拠として保持する |
| `experiments/r20-conservative-rendering/` | rendering decision evidence | production importなし | Line chart負荷とmarker variantの測定 | C | R20の採否判断として保持する |
| `experiments/phase2h-browser/` | browser benchmark | production importなし | canonical Attack、full-tail resource、Playwright測定 | C / B候補 | 現行benchmark baselineと再現性の必要性を確認する |
| `experiments/dynamic-distribution-ranges/` | historical planner record | production importなし | planner test、results、Phase 2の設計履歴 | C / D候補 | docsで必要な結果が保存済みか確認し、raw artifactだけを削除候補にする |
| `experiments/runtime-dr/`、`experiments/runtime-dx/` | historical runtime experiments | production importなし | 旧最適化・ブラウザ調査。DX検証は別のrelease scriptへ移行済み | C / D候補 | ADRとREADMEへの参照、再現性、package script依存を確認する |
| `scripts/verify-runtime-dx.mjs` | runtime verification | `verify:release`から実行する | runtime DX 20,000ケースの数値検証 | B | historical experimentと混同せず維持する |
| `scripts/benchmark-full-tail-attack.mjs` | current resource benchmark | production importなし | `benchmark:full-tail-attack`、full-tail resource回帰 | B / C | 現行resource判断のbaselineかどうかを確認する |
| `public/data/schema-v2/revision-1/**` | public reference asset | canonical runtimeはD10をon-demand生成し、静的asset requestはproduction smokeで0を確認する | data verification、generator、manifest、reference comparison | B / C | 公開URLを削除せず、外部互換性を別decisionに送る |
| `schemas/**` | schema contract | production bundleの計算経路ではない | generatorとdata validator | B / C | schema-v2の再生成・検証契約を維持する |
| `generator/**` | regeneration tool | production bundleには含めない | `data:check`、generator test、simulation、Ruff | B / C | Python generatorを正本として保持し、環境依存だけを整理する |
| `tooling/reference-data/**` | reference repository and validator | production bundleには含めない | schema、reference ingestion、asset contract | B / C | public assetとreference comparisonの責務を維持する |
| `package.json`のrelease・benchmark scripts | project tooling | `verify:release`はCIと開発者手順から利用する | release verification、benchmark contract | B | experimentを削除する場合だけ孤立scriptを同時整理する |

## Attack batch surfaceの現状

`useAttack`と`AttackIncrementalExecution`は、コンボ単位の`calculateAttack`と合計の`calculateTotalDamage`を使う。したがって、`calculateAttackBatch`がproduction featureの計算経路ではないことはarchitecture testとsource searchで確認できる。一方、`CalculationClient`はbatch methodを公開し、`AttackBatchInput`はその入力snapshot、id重複、options、Abort、total aggregation optionsを検証する。testsとphase2h browser benchmarkがこの境界を利用しているため、R21-1では削除しない。

batch surfaceを削除できると判断するには、少なくとも次をすべて満たす必要がある。

- production feature、runtime内部、公開READMEや型定義に必要なconsumerがない
- release gate、architecture test、browser smoke、current benchmarkが独立して必要としない
- experimentだけが使う場合、そのexperimentをhistorical-onlyとして保持する理由がない、またはlocal helperへ移せる
- batchを削除してもR17のincremental Attack回帰（変更コンボだけの再計算、total再計算、latest-wins、presentation-only retry）が失われない

条件を満たさない間は`KEEP — <specific reason>`としてこの文書へ追記し、source削除を行わない。

### R21-2監査結果（2026-09-09）

`git grep`で確認したproduction source上のbatch importは`src/runtime/CalculationClient.js`から`AttackBatchInput.js`へのものだけである。`useAttack`と`AttackIncrementalExecution`は`calculateAttack`と`calculateTotalDamage`を使い、`calculateAttackBatch`を呼ばない。したがって、batchは現行Attack featureの計算経路ではないが、CalculationClientの公開runtime facadeには残っている。

batchのtest consumerは`tests/attackBatchClient.test.js`、`tests/calculationClient.test.js`、`tests/calculationClientIntegration.test.js`、`tests/attackRuntimeWorkerContract.test.js`、`tests/attackScoreDisplayAdapter.test.js`、`tests/attackDisplayIntegration.test.js`などである。`tests/attackFeatureArchitecture.test.js`と`tests/attackContract.test.js`は、production featureがbatchへ依存しないことを回帰として検査する。experiment側では`experiments/phase2h-browser/`が、productionの公開batch境界を測定対象として明示している。

READMEとCONTRIBUTINGにはbatch APIを外部サポートAPIとして説明する記述はない。しかし、現行のrelease・benchmark・architecture回帰はbatch入力snapshot、Worker provider、total aggregationの境界を通じて検証されている。よって、R21-2の判定は`KEEP — verification/reference boundary`とする。`AttackBatchInput`、batch method、batch-only type、batch専用testを削除するには、これらの検証をincremental経路または別の最小helperへ移し、公開runtime facadeからの参照を0にする独立作業が必要である。R21-2ではその移行と削除を行わない。

## `published-bucket`と`full-tail`の互換監査

`published-bucket`は旧1024 bucketを表す互換semanticで、`full-tail`はproduction Attackの尾部をDamageへ伝播する現行semanticである。両者は確率分布の近似精度とDamage rangeの意味が異なるため、名称だけを置換してはならない。

監査では、`RangePolicy`、`DamageCalculator`、`CalculationClient`、range・damage・runtime rule tests、benchmark、README、experiment docsを対象に、次の問いへ答える。

- productionで選択されるか、比較・reference専用か
- schema-v2 assetやgeneratorの出力形式に必要か
- 外部から利用される公開contractか、内部fixtureだけか
- `published-bucket`の削除または局所化で、既存の数値比較・再生成・release verificationが壊れないか

監査が終わるまで、public asset、generator、reference fixture、`full-tail`の意味は変更しない。

## 検証資産とarchitecture test

`verify:release`は、Node、data、Vitest、generator、simulation、Ruff、typecheck、runtime DX、ESLint、Markdown lint、build、production smoke、差分検査を順序付きで実行する。このrelease gateと`verify-runtime-dx`は、historical experimentではなく現行の検証資産として保持する。

architecture testは、禁止依存、production asset request 0、Worker境界、計算・presentation分離、feature ownership、protected areaを守るassertionを残す。特定helper名やsource文字列だけを存在させるassertionは、同じobservable contractを別のbehavior testで守れるかを確認してから弱める。テスト数を維持することではなく、意味のある契約coverageを維持することを基準にする。

## Experimentとreference assetの扱い

R19とR20のexperimentは直近のarchitecture・product decisionの証拠であり、現時点では保持する。旧experimentを削除する場合も、判断がADR・live docsへ転記済みで、release gate・current baseline・production oracle・必須docs参照のすべてがないことを確認する。raw `results.json`などのartifactは、文書に必要な結果が転記され、再現性を失わない場合だけ削除候補とする。

`public/data/schema-v2/**`、`schemas/**`、`generator/**`、`tooling/reference-data/**`は、reference・再生成・比較の責務を持つprotected areaである。reference assetであることだけを理由に削除しない。公開済みURLのretirementやschema変更は、外部互換性を含む別のrelease decisionへ送る。

## 次の作業単位

1. R21-2: `AttackBatchInput`、`calculateAttackBatch`、batch-only typeとtestのconsumerを再検索し、保持または削除候補の根拠を確定する。
2. R21-3: `published-bucket`のcompatibility boundaryをdocsとarchitecture testで固定するか、production runtimeから局所化する。
3. R21-4: architecture testをsemantic boundaryとhistorical implementation detailに分け、不要なsource-string assertionだけを整理する。
4. R21-5: experiment、benchmark、package scriptの依存を分類し、削除可能なraw artifactと孤立commandを確認する。
5. R21-6: reference asset、generator、schema、README、architecture docsの責務と説明を最終整合させる。

各作業単位の前後で、UI凍結対象に差分がないこと、`npm run verify:release`または変更範囲に応じた検証が成功すること、`git diff --check`が成功することを確認する。
