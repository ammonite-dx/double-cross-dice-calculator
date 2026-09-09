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
| `src/runtime/AttackBatchInput.js` | runtime request boundary | `CalculationClient.js`がimportする。`useAttack`はincremental APIを使い、直接batchを呼ばない | `attackBatchClient.test.js`、integration test、phase2h browser benchmark | B | 検証・reference boundaryとして保持する |
| `src/runtime/CalculationClient.js` | calculation runtime facade | Check、Attack、Backtrackのproduction client。batch methodも同じfacadeに残る | runtime contract、integration、browser smoke | A / B | facade全体を維持し、batch-only削除は別判断にする |
| `src/runtime/CalculationClientTypes.ts` | TypeScript client contract | production clientの型。`calculateAttackBatch`を含む | typecheckとclient tests | A / B | 現行runtime facadeと検証境界の型を維持する |
| `tests/attackBatchClient.test.js` | batch compatibility test | production featureからは直接呼ばれない | Vitest、batch入力snapshot・total・Abort・resource契約 | B | batch APIの検証境界として保持する |
| `tests/attackFeatureArchitecture.test.js`、`attackContract.test.js` | Attack boundary tests | production featureのincremental ownershipを検査する | Vitest、batch依存をfeatureから排除する回帰 | B | 内部helper名ではなくfeatureのobservable contractを守る |
| `tests/productionDependencyContract.test.js`、`runtimePresentationArchitecture.test.js`、`dataResponsibilitiesArchitecture.test.js`、`namingArchitecture.test.js` | architecture and dependency tests | production境界を検査する | Vitest、source import・命名・asset requestの回帰 | B | semantic boundaryを残し、実装文字列だけを固定するassertionを監査する |
| `tests/releaseVerificationContract.test.js` | release gate contract | CIと`verify:release`の関係を検査する | Vitest、package script・workflow・README・差分検査 | B | release commandの役割を維持し、重複だけを整理する |
| `src/calculation/planning/RangePolicy.js`、`ScoreRangePlanner.js`、`DamageCalculator.js` | calculation core | production Attackは`full-tail`を選択する | range、damage、runtime rule、comparison test | A | `published-bucket`を機械削除せず、意味を下記の互換監査で確定する |
| `published-bucket` | explicit compatibility semantic | production defaultではなく、比較・互換計画で明示指定する | range planner、damage on-demand、integration、reference fixture | B / C | 公開assetと比較結果に必要かを確認し、必要なら境界をdocsとtestで固定する |
| `full-tail` | current production semantic | production AttackのScoreからDamageへの伝播に使用する | full-tail benchmark、range・runtime・rule tests | A / B | `published-bucket`へ置換せず、現行意味論を維持する |
| `experiments/r19-worker-architecture/` | architecture decision evidence | production importなし | Workerとhybrid clientの比較測定 | C | R19の判断根拠として保持する |
| `experiments/r20-conservative-rendering/` | rendering decision evidence | production importなし | Line chart負荷とmarker variantの測定 | C | R20の採否判断として保持する |
| `experiments/phase2h-browser/` | browser benchmark | production importなし | canonical Attack、full-tail resource、Playwright測定 | C / B候補 | 現行benchmark baselineと再現性の必要性を確認する |
| `experiments/dynamic-distribution-ranges/` | historical planner record | production importなし | planner test、results、Phase 2の設計履歴 | C | 設計判断と測定の履歴として保持する |
| `experiments/runtime-dr/`、`experiments/runtime-dx/` | historical runtime experiments | production importなし | 旧最適化・ブラウザ調査。DX検証は別のrelease scriptへ移行済み | C | 数値比較とWorker採否の歴史的証拠として保持する |
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

### R21-3監査結果（2026-09-09）

`src/calculation/planning/RangePolicy.js`の`DEFAULT_POLICY`は、直接plannerを使う既存比較との互換性のため`published-bucket`を既定値として保持する。一方、`src/runtime/CalculationClient.js`のAttack経路は、range policyが未指定または`scorePropagation`を含まない場合に`full-tail`を明示し、productionのScoreからDamageへの尾部伝播を維持する。呼び出し側が`scorePropagation: 'published-bucket'`を明示すれば、比較・互換用の計画を再現できる。

`published-bucket`のconsumerは`RangePolicy`、`ScoreRangePlanner`、`DamageCalculator`、CalculationClient integration、range・damage・runtime rule tests、dynamic-distribution-rangesのplannerと結果記録である。READMEも、インデックス1023への集約が計算結果や最終表示の上限ではなく、互換比較だけの形式であることを説明している。`full-tail`はproduction Attack、full-tail resource benchmark、runtimeとbrowser回帰で使用される。

以上から、R21-3の判定は`KEEP — explicit compatibility boundary`とする。`published-bucket`を`full-tail`へ機械置換したり、`DEFAULT_POLICY`から削除したりすると、旧形式との比較、reference fixture、既存のplanner契約を同時に変更してしまう。R21では両semanticの役割を文書とテストで固定し、public asset・generator・比較fixtureの形式を変更しない。

## 検証資産とarchitecture test

`verify:release`は、Node、data、Vitest、generator、simulation、Ruff、typecheck、runtime DX、ESLint、Markdown lint、build、production smoke、差分検査を順序付きで実行する。このrelease gateと`verify-runtime-dx`は、historical experimentではなく現行の検証資産として保持する。

architecture testは、禁止依存、production asset request 0、Worker境界、計算・presentation分離、feature ownership、protected areaを守るassertionを残す。特定helper名やsource文字列だけを存在させるassertionは、同じobservable contractを別のbehavior testで守れるかを確認してから弱める。テスト数を維持することではなく、意味のある契約coverageを維持することを基準にする。

### R21-4監査結果（2026-09-09）

現行のarchitecture testを確認した結果、`runtimePresentationArchitecture.test.js`と`dataResponsibilitiesArchitecture.test.js`のpath・依存方向assertionは、現在の`src/runtime`、`src/shared/presentation`、`src/core/probability`、`src/shared/theme`のownerと一致している。`sharedChartArchitecture.test.js`はChart.jsの所有箇所、accessible name、Backtrack Doughnutの種類を検査し、`sharedValidationArchitecture.test.js`は共有入力規則の単一ownerを検査している。これらは実装名の固定ではなく、R8〜R20で合意した境界を守るため、現時点では維持する。

`namingArchitecture.test.js`のretired identifier検査と、`attackFeatureArchitecture.test.js`・`attackContract.test.js`のfeatureからbatchを呼ばない検査は、migration-only surfaceの再流入を検知する意味がある。release、production dependency、browser smokeのcontractも、CIと現行公開経路を守るために必要である。今回の監査では、代替behavior testなしに削除できるsource-string assertionを特定できなかったため、R21-4でtest変更は行わない。将来内部名を変更する場合は、assertionが守るsemantic boundaryを先にbehavior testへ移す。

## Experimentとreference assetの扱い

R19とR20のexperimentは直近のarchitecture・product decisionの証拠であり、現時点では保持する。旧experimentを削除する場合も、判断がADR・live docsへ転記済みで、release gate・current baseline・production oracle・必須docs参照のすべてがないことを確認する。raw `results.json`などのartifactは、文書に必要な結果が転記され、再現性を失わない場合だけ削除候補とする。

`public/data/schema-v2/**`、`schemas/**`、`generator/**`、`tooling/reference-data/**`は、reference・再生成・比較の責務を持つprotected areaである。reference assetであることだけを理由に削除しない。公開済みURLのretirementやschema変更は、外部互換性を含む別のrelease decisionへ送る。

### R21-5監査結果（2026-09-09）

`experiments/r19-worker-architecture/`と`experiments/r20-conservative-rendering/`は、直近のWorker・描画判断を再現するためのdecision evidenceであり、対応するVitest contractとpackage commandがあるため保持する。`experiments/phase2h-browser/`もcanonical Attackとfull-tail resourceの現行benchmarkを提供し、Playwright runnerのcontract testとpackage commandから参照されるため保持する。

`experiments/runtime-dr/`は`verify-runtime-dr-experiment.mjs`、`benchmark-runtime-dr-experiment.mjs`、runtime damageのtestから参照され、reference・optimized実装の数値比較に使われるため保持する。`experiments/dynamic-distribution-ranges/`はproduction importを持たないが、planner、decision、benchmark、resultsが入力範囲・working range・`published-bucket`と`full-tail`の設計履歴を構成するため、現時点ではCとして保持する。

`experiments/runtime-dx/`はproduction import、package script、release gateから参照されず、`scripts/verify-runtime-dx.mjs`へ検証が移行済みである。ただしREADMEに記録されたブラウザ測定値は、Worker採否の歴史的証拠として再利用できる。R21-5では削除せず、測定結果をlive docsへ移したうえで、再現性を失わないかを確認してからD候補の最終判断を行う。

### R21-6・R21-7監査結果（2026-09-09）

READMEは、静的SPA、ブラウザ内計算、schema-v2の位置づけ、`verify:release`、full-tail benchmark、generatorとreference-dataの役割を説明しており、現行の`docs/architecture.md`および`CONTRIBUTING.md`と整合している。`docs/architecture.md`はproduction runtimeが公開schema-v2 assetを計算時に取得せず、schema-v2をgenerator照合と独立検証用に保持すること、`published-bucket`と`full-tail`の役割、DX・D10・DR Worker・Backtrackの実行境界、API・MCPをdeferred goalとする方針を記録している。

R2〜R19のrefactoring documentには、当時のpathやmigration用語を含むhistorical recordがある。これらを現行説明へ機械置換すると過去の判断と現在の実装の対応関係を失うため、R21では書き換えない。live documentationに現行と矛盾する記述は確認できず、R21-7のREADME・architecture docs変更は不要と判断する。

reference assetの公開URL、schema、generator出力は変更しない。READMEやarchitecture docsへ将来のAPI・MCP・Cloudflare Worker実装を先取りして追加せず、R24のrelease auditまで現在の静的SPA方針を正本とする。

## 次の作業単位

1. R21-2: `AttackBatchInput`、`calculateAttackBatch`、batch-only typeとtestのconsumerを再検索し、保持または削除候補の根拠を確定する。
2. R21-3: `published-bucket`のcompatibility boundaryをdocsとarchitecture testで固定するか、production runtimeから局所化する。
3. R21-4: architecture testをsemantic boundaryとhistorical implementation detailに分け、不要なsource-string assertionだけを整理する。
4. R21-5: experiment、benchmark、package scriptの依存を分類し、削除可能なraw artifactと孤立commandを確認する。
5. R21-6: reference asset、generator、schema、README、architecture docsの責務と説明を最終整合させる。

各作業単位の前後で、UI凍結対象に差分がないこと、`npm run verify:release`または変更範囲に応じた検証が成功すること、`git diff --check`が成功することを確認する。

## R21の判定

R21は`CLOSED / GREEN`とする。R21-1のインベントリ、R21-2のbatch surface、R21-3の`published-bucket`、R21-4のarchitecture test、R21-5のexperiment、R21-6のreference asset、R21-7のlive documentationを確認した結果、現時点で削除条件を満たすD分類の資産はなかった。したがって、UI、計算core、runtime、公開asset、generator、test、experimentを削除せずに保持することが今回の最終判断である。

この判定は将来の削除を禁止するものではない。公開API、release gate、再現性、外部URLの影響が変わった場合は、対象を個別に再監査し、consumer移行と検証を含む独立コミットで扱う。R22は任意の数値・性能レビュー、R23はユーザー監督下のUI/UXレビュー、R24は最終release auditとする。
