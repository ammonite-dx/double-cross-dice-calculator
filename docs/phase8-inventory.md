# Phase 8-1 inventory

この文書は、canonical resultをproductionの既定経路にした後のPhase 8-1として、legacy計算、事前計算データ、公開asset、再生成コード、比較用テストの依存関係を棚卸しする。今回のclosure補正では、実装実態に合わせてoracle、smoke、asset、barrelの分類を更新する。Phase 8-2Aでは、この棚卸しに基づいてAttackのchart adapterだけを分離し、公開asset、JSON、generator、計算意味論は変更しない。

## 判定範囲と分類

Phase 8-1の調査時点はブランチ`codex/canonical-default-migration`のHEAD `752b3d9`である。Phase 8-2Aの変更はこのinventoryの分類を更新する追補として扱う。production importerは`src/`の実行時importと、production bundleから到達するWorkerを指す。テスト、ベンチマーク、移行スクリプト、reference-dataからの参照はproduction importerに含めない。

| category | 意味 |
| --- | --- |
| `production` | 現在の静的SPA、ブラウザ内計算、Worker、公開assetの実行経路が必要とするもの。 |
| `comparison-regression` | legacyとcanonicalの比較、境界値回帰、表示互換性を検証するために保持するもの。 |
| `generator-regeneration` | 現行schema-v2 assetの再生成、manifest検証、独立oracle、simulationを担うもの。 |
| `migration` | 旧dense JSON、旧形式変換、旧revision、旧実装からの移行を再現するために保持するもの。 |
| `dead-candidate` | 現在のproduction、テスト、生成、移行の参照が確認できず、前提を満たした後に削除候補となるもの。 |

`proposed action`は、現時点の操作ではなく、後続cleanupでの候補を示す。`delete-candidate`は独立oracle、テスト移行、公開assetの保持条件が満たされるまで削除しないことを意味する。

## production import graph

productionの入口は`src/main.js`からrouter、各計算viewへ続く。Checkは`CalculationClient.calculateCheckCanonical`とcanonical presentation、Attackはcanonical batch runnerとcanonical presentation、Backtrackはcanonical client/runnerを利用する。productionの`CalculationClient`は`src/calculation/`のDX、Score、Damage、Backtrack、RangePlanner、ResourceGuardを直接参照し、`src/data/PrecomputedDataRepository.js`からはD10のlazy loaderとgetterだけを参照する。

Attackのcanonical chartは`src/components/Attack/ChartSetter.js`のcanonical adapter、options、styleと、Attack chart専用の`ChartPercentages.js`を利用する。旧配列adapterは`LegacyChartSetter.js`へ分離し、productionの`src/`からはimportしない。DRは`RuntimeDamageRollClient`から`RuntimeDamageRollWorker`へ渡され、Worker内の`RuntimeDamageRollCalculator`がオンデマンド生成する。productionの`src/`から`src/data/dx.json`、`dr.json`、`d10.json`、`livingdead.json`を直接importする経路はない。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/application/CalculationClient.js` | canonical client、`createCalculationClient`、`calculationClient` | `production` | Check、Attack、Backtrackの各viewとrouterの計算経路 | integration、canonical、range、presentation tests | DX/Score/Damage/Backtrack、D10 lazy asset、ResourceGuard、DR Worker | なし | canonical integrationとbrowser受入が完了 | `keep` | canonical契約を変更しない | `npm test`、build、production smoke |
| `src/application/RuntimeDamageRollClient.js` | `createRuntimeDamageRollClient` | `production` | `CalculationClient`のDR依存 | runtime damage tests | Worker生成、cancel、latest request | なし | runtime DR production tests | `keep` | Worker protocolを別作業にしない | runtime damage testsとbrowser smoke |
| `src/application/RuntimeDamageRollWorker.js` | Worker entrypoint | `production` | `RuntimeDamageRollClient` | worker integration tests | 静的bundleからWorkerを配布 | なし | production runtime DR test | `keep` | Worker URLとcancel契約を維持 | build、runtime smoke |
| `src/calculation/DxCalculator.js` | `calculateDxDistribution`、DX limits/options | `production` | `CalculationClient` | dx、canonical、range tests | メインスレッドでオンデマンドDX | Python generatorは独立検証のみ | exhaustive referenceとsimulation | `keep` | 入力・resource契約を変更しない | JS tests、generator tests |
| `src/calculation/RuntimeDamageRollCalculator.js` | `generateMixedDamageDistribution`、runtime limits | `production` | DR Worker | runtime DR tests、experiment tests | Worker内FFTと可変support | generator DRはasset比較用 | independent referenceとsimulation | `keep` | DRのasset経路をproductionへ戻さない | JS tests、simulation |
| `src/calculation/ScoreCalculator.js` | `calculateScoreCanonical`、canonical summary helpers | `production` | `CalculationClient`、Check/Attack presentation | canonical、rule、range tests | `DistributionResult`とFFT、可変working length | generator DXをoracleとして使用 | dx exhaustive/reference、canonical tests | `keep` | score tail certificateを維持 | JS tests、presentation tests |
| `src/calculation/DamageCalculator.js` | `createCanonicalDamageRollRequest`、`calculateCanonicalDamageOnDemand`、canonical summary | `production` | `CalculationClient` | canonical damage、aggregation、runtime tests | DX score、DR Worker、D10、FFT、overflow metadata | generator assetsは比較用 | canonical damage/total tests | `keep` | `full-tail`のoverflow意味を維持 | JS tests、browser smoke |
| `src/calculation/BacktrackCalculator.js` | `calculateD10Distributions`、`calculateLivingdeadDistributions`、`calculateFinalEncroachmentCanonical` | `production` | `CalculationClient` | backtrack canonical/rule tests | ブラウザ内完全support生成、ResourceGuard | generator d10/livingdeadは比較用 | exhaustive reference、simulation | `keep` | D10/livingdeadをasset fetchへ戻さない | JS tests、browser smoke |
| `src/calculation/CanonicalDamageAggregation.js` | canonical total planning/sum/error exports | `production` | `CalculationClient` | aggregation、total tests | FFT、resource limits、cancel | なし | canonical total tests | `keep` | component/FFT/resource limitsを維持 | JS tests |
| `src/calculation/RangePlanner.js` | range planning、tail certificate、`DEFAULT_POLICY` | `production` | `CalculationClient`、canonical cores | range、display、integration tests | working length、FFT length、memory/time guard | generator limitsとの対応をdocsで確認 | range boundary tests | `keep` | `published-bucket`と`full-tail`の意味を混同しない | JS tests、resource smoke |
| `src/calculation/DistributionResult.js` | canonical result constructors、validation、summary | `production` | canonical cores、presentation | distribution result、comparison tests | support、explicit coverage、overflowの内部表現 | なし | canonical presentation tests | `keep` | exact/bounded/lower-bound契約を維持 | JS tests |
| `src/components/Attack/ChartSetter.js` | canonical adapter、options、style exports | `production` | Attack Score/Damage chart components | canonical display adapter tests | Chart.jsへcanonical seriesを供給 | なし | canonical chart adapter tests | `keep` | legacy helper分離と同時にAPIを壊さない | full JS gate、browser smoke |
| `src/data/PrecomputedDataRepository.js` | D10 loader/cache、`loadD10Asset`、`getD10Distribution` | `production` | `CalculationClient`の防御D10 lazy経路 | integration、asset、repository tests | `public/data/schema-v2/revision-1/d10.json`、fetch、cache | schema/manifestのrevision契約 | D10 lazy asset smoke、asset hash test | `keep` | revision-1 URLを削除しない | asset test、browser smoke |

## Attack chart modules

Phase 8-2Aで、production canonical adapterと旧1024要素配列adapterを別moduleへ分離した。`ChartSetter.js`にはcanonical adapter、options、styleだけを残し、旧APIと`clipData`、`range`依存は`LegacyChartSetter.js`へ移した。両経路のAttack chart表示丸めは`ChartPercentages.js`で共有するが、CheckやBacktrackのsummary丸めには適用しない。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/components/Attack/LegacyChartSetter.js` | `getAttackScoreChartData` | `dead-candidate` | なし | 旧APIの比較・参照用途 | 旧1024配列と`range()`に依存するがproduction bundleから呼ばれない | なし | `getCanonicalAttackScoreChartData`とcanonical presentation tests | `keep`（split済み） | 外部利用と動的参照を再確認し、独立oracle移行後に削除を判断 | full JS gate、legacy importer 0 |
| `src/components/Attack/ChartSetter.js` | `getCanonicalAttackScoreChartData` | `production` | Attack ScoreChart | `attackScoreDisplayAdapter.test.js`、canonical chart tests | Chart.js用labels/data、`ChartPercentages.js`による表示単位変換 | なし | canonical presentation and chart tests | `keep` | canonical chart contractを維持 | JS tests、browser smoke |
| `src/components/Attack/ChartSetter.js` | `getAttackScoreChartOptions` | `production` | Attack ScoreChart | chart adapter tests | Chart.js options | なし | existing chart smoke | `keep` | 見た目互換を維持 | build、browser smoke |
| `src/components/Attack/ChartSetter.js` | `getAttackScoreChartStyle` | `production` | Attack ScoreChart | component tests | Chart layout style | なし | existing browser acceptance | `keep` | 見た目互換を維持 | build、browser smoke |
| `src/components/Attack/LegacyChartSetter.js` | `getAttackDamageChartData` | `comparison-regression` | なし | `attackDamageDisplayAdapter.test.js`のlegacy shape fixture | 旧1024配列、旧total表示に依存 | なし | `getCanonicalAttackDamageChartData`とcanonical damage tests | `keep`（split済み） | legacy fixtureをcomparisonとして維持し、独立oracle移行後に削除を判断 | full JS gate、legacy importer 0の確認 |
| `src/components/Attack/ChartSetter.js` | `getCanonicalAttackDamageChartData` | `production` | Attack DamageChart | `attackDamageDisplayAdapter.test.js`、canonical chart tests | Chart.js用canonical damage/total series、`ChartPercentages.js`による表示単位変換 | なし | canonical damage presentation tests | `keep` | total chart contractを維持 | JS tests、browser smoke |
| `src/components/Attack/ChartSetter.js` | `getAttackDamageChartOptions` | `production` | Attack DamageChart | chart adapter tests | Chart.js options | なし | existing chart smoke | `keep` | 見た目互換を維持 | build、browser smoke |
| `src/components/Attack/ChartSetter.js` | `getAttackDamageChartStyle` | `production` | Attack DamageChart | component tests | Chart layout style | なし | existing browser acceptance | `keep` | 見た目互換を維持 | build、browser smoke |
| `src/components/Attack/LegacyChartSetter.js` | 内部`clipData`、`range` import | `comparison-regression` | なし | legacy chart testsと旧adapter | 1024固定配列のsliceと丸め | なし | canonical adapterはこの経路を通らない | `keep`（split済み） | 旧配列の互換挙動を維持し、共有丸めgoldenを保つ | full JS gate、legacy moduleのimport graph確認 |

**Phase 8-2A完了:** `ChartSetter.js`からlegacy array helperを`LegacyChartSetter.js`へ分離した。production canonical exports、options、styleと既存の表示挙動を保護し、`PrecomputedDataRepository`、公開asset、JSON、generatorには触れていない。次はD10 lazy fetchのsmokeを追加したうえで、PrecomputedDataRepositoryの分離を検討する。

## mixed-use module: `PrecomputedDataRepository.js`

D10のlazy assetだけが現在のproduction fetch経路である。DX、DR、livingdeadのloader/cacheは下位wrapper、migration、benchmark、asset testが参照するため、現時点では不要に見えても一括削除しない。one-dimensional cacheはD10とlivingdeadを共有するため、将来はD10 production loaderとreference loaderを分離する候補である。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/data/PrecomputedDataRepository.js` | schema/revision constants、`basePath`、共通sparse validator | `production` | D10 loaderを含むrepository module | repository/asset tests | schema-v2 revision-1 public URL | manifest/schema validation | `precomputedAssets.test.js` | `keep` | D10とrevision契約を維持 | asset test、browser smoke |
| `src/data/PrecomputedDataRepository.js` | `createDxRepository`、`getDxDistribution`、`loadDxAsset`、`registerDxAsset` | `comparison-regression` | なし | dx migration、repository、calculator、benchmark tests | 公開DX shard URLを読み込めるがproductionはruntime DX | public DX shardと旧dense DX | `calculateDxDistribution`、generator exhaustive/reference | `split` | 参照専用repositoryをproduction D10経路から分離 | migration/asset tests、bundle import確認 |
| `src/data/PrecomputedDataRepository.js` | one-dimensional shared cache、`loadOneDimensionalAsset`、`registerOneDimensionalAsset` | `production` | D10の`loadD10Asset`/getter | livingdead、backtrack、repository tests | D10 fetch/cache、sparse expansion | d10/livingdead asset schema | D10 smoke、canonical Backtrack tests | `split` | D10経路の単独テストとreference loader移行 | D10 fetch/cache smoke、full JS gate |
| `src/data/PrecomputedDataRepository.js` | `loadD10Asset`、`registerD10Asset`、`getD10Distribution` | `production` | `CalculationClient`はload/get、test/benchmarkはregister | calculation integration、asset、damage tests | `public/.../d10.json`、fetch、expanded cache | generator d10 output/manifest | D10 lazy asset tests | `keep` | 同一revisionの公開URLを保持 | asset hash、browser smoke |
| `src/data/PrecomputedDataRepository.js` | `loadLivingdeadAsset`、`registerLivingdeadAsset`、`getLivingdeadDistribution` | `comparison-regression` | なし。canonical Backtrackはon-demand生成 | backtrack migration/canonical、rule、repository tests | 公開livingdead assetはreference fetch用 | generator livingdead output | `calculateLivingdeadDistributions`と独立reference | `move` | canonical rule testsへ参照を移し、asset fixtureの保持期間を決める | tests without production import、asset policy確認 |
| `src/data/PrecomputedDataRepository.js` | `registerDrAsset`、`loadDrAsset`、`getDrDamageDistributions` | `comparison-regression` | なし。DRはRuntimeDamageRollWorker | damage migration、runtime on-demand、repository、benchmark tests | 公開DR shard URLは比較/reference用 | generator DR output/manifest | runtime DR independent generator、simulation | `move` | runtime/reference testをasset-independentに移行 | runtime tests、public URL policy確認 |
| `src/data/PrecomputedDataRepository.js` | `clearPrecomputedDataCache` | `dead-candidate` | なし | 直接importの参照なし。内部検証対象 | なし | なし | repositoryの個別cache testsで代替可能 | `delete-candidate` | 全dynamic import/API利用とtest helperを再確認 | full JS gate、bundle import確認 |

## distribution、FFT、canonical/legacy core

`src/data/Distribution.js`と`src/data/FFT.js`は、ディレクトリ名だけを根拠にlegacy扱いしない。FFTと配列操作の大部分はcanonical production coreが使用している。legacy候補は`LegacyChartSetter.js`が使う`range`だけである。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/data/Distribution.js` | `OUTPUT_DISTRIBUTION_SIZE`、`WORKING_DISTRIBUTION_SIZE`、`DISTRIBUTION_SIZE` | `production` | repository、Score/Damage/Backtrack、RangePlanner | numerical and boundary tests | 1024 output、2048 workingの内部契約 | generator schema sizesとの対応 | canonical range/resource tests | `keep` | 1024をcanonical表示上限と解釈しない文書を維持 | full JS gate |
| `src/data/Distribution.js` | `range` | `comparison-regression` | `LegacyChartSetter.js`だけ | legacy chart tests | 1024 array labels helper | なし | canonical charts use coordinate/labels from presentation | `keep`（split済み） | 旧ChartSetter APIの削除判断まで維持 | chart tests、legacy import graph |
| `src/data/Distribution.js` | `expandSparseDistribution`、`collapseDistribution`、`shiftDistribution`、`getExpectedValue`、`getUpperTailProbability` | `production` | repository、Score/Damage/Backtrack、RangePlanner | distribution/FFT/canonical tests | sparse asset expansion、support、tail計算 | generator sparse serialization is compatible | canonical and numerical tests | `keep` | sparse/canonical semanticsを維持 | JS tests |
| `src/data/FFT.js` | `getConvolutionFftLength`、`convolveDistributions`、`sumDistribution`、`subDistribution` | `production` | Score、Damage、CanonicalDamageAggregation | fft、distribution、canonical tests | dynamic FFT、Score/Damage/total computation | generator polynomial operations are independent | FFT and canonical numeric tests | `keep` | FFT length/resource contractを維持 | full JS gate、benchmark on future changes |
| `src/calculation/DistributionResult.js` | canonical constructors、validation、summary helpers | `production` | canonical cores、presentation | canonical result tests | support、explicit values、overflow metadata | なし | canonical presentation tests | `keep` | exact/bounded/lower-boundを保持 | JS tests |
| `src/calculation/DistributionResult.js` | `LEGACY_PUBLISHED_BUCKET_LENGTH`、`LEGACY_PUBLISHED_OVERFLOW_INDEX`、`fromPublishedBucketDistribution`、`toPublishedBucketDistribution` | `comparison-regression` | production plannerが互換policyを受理するが、Attack canonical表示はfull-tail | legacy comparison、canonicalCheck、distributionResult、range tests | 1024 published adapterと旧fixture | schema-v1/reference compatibility | `DistributionResult` adapter testsとcanonical display tests | `move` | productionでの互換policy利用箇所を明示し、代替後に削除判断 | comparison gate、published fixture coverage |
| `src/calculation/ScoreCalculator.js` | `calculateScore`、`getScoreSummary` | `comparison-regression` | なし | data wrapper、legacy/migration、benchmark tests | 固定1024 legacy projection | dense DX/reference data | `calculateScoreCanonical`、DxCalculator、canonical summary tests | `delete-candidate` | comparison testsを独立oracleへ移行 | full JS gate、legacy import 0 |
| `src/calculation/ScoreCalculator.js` | `calculateScoreCanonical`、canonical success probability/summary helpers | `production` | CalculationClient、presentation | canonical/rule/range tests | DX runtime、FFT、DistributionResult | generator DX independent oracle | canonical check/attack tests | `keep` | expected value `—` contractを維持 | full JS gate |
| `src/calculation/DamageCalculator.js` | `createDamageRollRequest`、`calculateDamageOnDemand`、`calculateDamage`、`getDamageSummary`、`getTotalDamage` | `comparison-regression` | なし | data wrapper、migration、runtime on-demand、benchmark tests | legacy fixed/asset path、published projection | dense DR/D10/DX reference | canonical damage/aggregation APIs | `delete-candidate` | legacy callersをcomparison fixtureまたはindependent testへ移行 | full JS gate、legacy import 0 |
| `src/calculation/DamageCalculator.js` | `createCanonicalDamageRollRequest`、`finalizeOnDemandDamage`、`calculateCanonicalDamageOnDemand`、`getCanonicalDamageSummary` | `production` | CalculationClient、DR Worker adapter | canonical damage/total/range tests | full-tail score、runtime DR、D10、overflow | generator assetsはoracle | canonical damage and total tests | `keep` | output overflowとScore tailを分離 | full JS gate、browser smoke |
| `src/calculation/BacktrackCalculator.js` | `calculateD10Distributions`、`calculateLivingdeadDistributions`、`calculateFinalEncroachmentCanonical` | `production` | CalculationClient canonical adapter | backtrack canonical/rule/integration tests | on-demand complete support、resource guard | generator d10/livingdead independent oracle | exhaustive reference and simulation | `keep` | canonical backtrackのasset非依存を維持 | JS tests、browser smoke |
| `src/calculation/BacktrackCalculator.js` | `calculateFinalEncroachment` | `comparison-regression` | なし | data wrapper、backtrack migration、runtime rule tests | legacy public D10/livingdead provider | dense/public reference asset | canonical backtrack and rule tests | `delete-candidate` | migration testsを独立oracleへ移行 | full JS gate、legacy import 0 |
| `src/calculation/LegacyCanonicalComparison.js` | thresholds、error classes、`compareLegacyAndCanonical*`一式 | `comparison-regression` | なし | `legacyCanonicalComparison.test.js`とcomparison barrel | 1024 legacy arrays、canonical adapter | 旧dense JSONとpublic assetsを比較入力にする | oracle coverage mapをroadmapに記録済み | `delete-candidate` | semanticごとの独立oracle、比較依存の削除、最終gate | comparison removal run、full JS gate |
| `src/calculation/index.js` | canonical reexports | `comparison-regression` | なし。production sourceは個別moduleを直接import | tests、benchmarks | tooling/test API surface | なし | canonical modules/testsと個別import | `keep` | production runtime dependencyとtooling APIを混同しない | full JS gate |
| `src/calculation/index.js` | legacy calculation/comparison reexports | `comparison-regression` | production sourceから参照なし | migration、comparison、benchmark tests | 旧APIのbarrel import | なし | direct canonical imports and oracle tests | `split` | test/benchmark importを明示moduleへ移行 | full JS gate、barrel legacy import 0 |

## data wrapper

`src/data/ScoreCalculator.js`、`DamageCalculator.js`、`BacktrackCalculator.js`はproductionからimportされない互換wrapperである。canonical相当のexportを含んでいても、productionは`src/calculation/`を直接参照するため、wrapper全体をproductionと判定しない。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/data/ScoreCalculator.js` | `getScoreSummary`、`calculateScore`、`getScore` | `comparison-regression` | なし | calculator、migration、rule、benchmark tests | repository DX loaderとlegacy fixed projection | dense DX/reference | canonical Score API、dx oracle | `delete-candidate` | testsをcanonical coreまたは独立oracleへ移行 | full JS gate、no production import |
| `src/data/ScoreCalculator.js` | `getCanonicalScoreSummary`、`calculateScoreCanonical` | `comparison-regression` | なし | canonicalCheck、display adapter、integration tests | wrapper経由のcanonical compatibility | なし | CalculationClientの直接core adapter | `delete-candidate` | test importsを直接coreへ移行 | full JS gate、no wrapper import |
| `src/data/DamageCalculator.js` | `getDamageSummary`、`getTotalDamage`、`getDamage` | `comparison-regression` | なし | calculator、migration、rule、runtime on-demand tests | D10/DR repositoryとlegacy damage | dense/public DR/D10 assets | canonical Damage/aggregation APIs | `delete-candidate` | migration and rule testsの依存移行 | full JS gate、no wrapper import |
| `src/data/BacktrackCalculator.js` | `getFinalEncroachment`、`getFinalEncroachmentCanonical` | `comparison-regression` | なし | backtrack canonical/presentation/migration tests | public D10/livingdead repository | dense/public reference assets | CalculationClient canonical adapter | `delete-candidate` | presentation and migration testsの直接core化 | full JS gate、no wrapper import |

## dense JSON、旧実装、migration

`src/data/*.json`はViteのproduction import graphに入らないが、旧実装と移行比較が読み込むため、現時点では削除候補であって削除対象ではない。サイズは`dx.json`約9.4 MB、`dr.json`約10.2 MB、`d10.json`約0.5 MB、`livingdead.json`約0.5 MBである。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/data/dx.json` | dense DX table全体 | `migration` | なし | `LegacyCalculator`、`precomputedData.test.js`、`dxDataMigration.test.js` | Vite production chunkには入らない。test import時だけ必要 | `scripts/generate-precomputed-data.mjs`がschema-v1 referenceを生成 | Python DX generator、exhaustive/reference、simulation | `move` | migration testをgenerator/referenceへ移行し、旧hash/shapeの保持期間を決める | `data:check`代替gate、generator test、full JS gate |
| `src/data/dr.json` | dense DR table全体 | `migration` | なし | `LegacyCalculator`、`precomputedData.test.js`、damage/runtime migration | production DRはWorker生成 | 旧JS transformと比較fixture | Python DR generator、runtime reference、simulation | `move` | DR migration比較の独立oracle化 | generator test、runtime test |
| `src/data/d10.json` | dense D10 table全体 | `migration` | なし。productionはpublic sparse D10をlazy fetch | `LegacyCalculator`、precomputedData、damage/backtrack tests | production URLはpublic schema-v2のみ | old transform、generator d10 | Python d10 generator、backtrack exhaustive/reference | `move` | D10 public asset smokeとmigration fixture分離 | asset test、browser smoke、full JS gate |
| `src/data/livingdead.json` | dense 屍人 table全体 | `migration` | なし。canonical Backtrackはon-demand | `LegacyCalculator`、precomputedData、backtrack/rule tests | production URLではない | old transform、generator livingdead | independent exhaustive/reference、simulation | `move` | canonical backtrack testsからasset依存を外す | JS/generator gate |
| `tests/legacy/LegacyCalculator.js` | legacy `getScore`、`getDamage`、`getTotalDamage`、`getFinalEncroachment`等 | `comparison-regression` | なし | dx/damage/backtrack migration、comparison tests | 固定1024とdense JSON/public asset | 旧実装の再現oracle | canonical core、generator independent oracle | `delete-candidate` | semanticごとの比較test移行とlegacy import 0 | full JS gate、独立oracle gate |
| `scripts/generate-precomputed-data.mjs` | 旧dense JSONからschema-v1 referenceへの変換 | `migration` | なし | data migration scripts/tests、README/docs | 配布物を直接生成しない | `src/data/*.json`、schema-v1 reference-data | Python `dx-precompute generate/verify` | `move` | 旧revision/referenceの保持期間とdata:check後継を決める | generator verify、migration gateの記録 |
| `reference-data/schema-v1/revision-{1,2,3}/` | 旧schemaのreference asset | `migration` | なし | migration/asset comparison、変換結果の確認 | 公開runtime URLではない | 旧JS transformの出力 | schema-v2 generator/reference tests | `move` | revisionごとの必要性を個別確認 | migration tests、削除後の再現性確認 |
| `tests/dxDataMigration.test.js`、`damageMigration.test.js`、`backtrackMigration.test.js` | dense/public assetとcanonicalの移行比較 | `comparison-regression` | なし | 各test自身 | CI/test only | 旧dense/public asset | canonical rule、generator exhaustive、simulation | `delete-candidate` | replacement coverage mapと比較なしの最終gate | full JS gate |
| `tests/runtimeDamageOnDemand.test.js`、`tests/runtimeDamageRollExperiment.test.js` | 旧asset/on-demand/runtime実験比較 | `comparison-regression` | なし | test自身 | CI/test only | public DR assets、reference implementation | production Worker tests、generator reference/simulation | `delete-candidate` | production contractを直接検証するtestへ移行 | full JS/generator/simulation gate |

## public schema-v2 revision-1 assets

`public/data/schema-v2/revision-1/`は公開済みURLであり、同一revisionのファイルをこの棚卸しで削除しない。manifestに列挙される32 data assetsと`manifest.json`自身のJSON files 33個を、revision-1のimmutable配布契約として扱う。D10だけがcurrent production lazy assetで、DX、DR、livingdeadはcomparison/reference assetである。不要assetを減らす場合は新revisionを作り、旧URLのretirementを別のrelease判断にする。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `public/data/schema-v2/revision-1/manifest.json` | manifest、hash、bytes、dataset metadata | `generator-regeneration` | なし。runtime repositoryはmanifestをfetchしない | `precomputedAssets.test.js`、generator current asset tests | deploy integrity、asset inventory、hash/bytes contract | Python assets/manifest writer | hash/bytes equivalence tests | `keep` | revision-1 immutable contractを維持 | asset test、deploy smoke |
| `public/data/schema-v2/revision-1/d10.json` | 224 sparse D10 distributions | `production` | `CalculationClient.loadD10Asset`のlazy fetch | repository、damage、integration tests | 防御ダイスが1以上のときfetch、cache hit可 | generator d10、manifest | asset equivalence、D10 smoke | `keep` | fetch 1/cache hit、load failure案内を維持 | browser smoke、asset hash |
| `public/data/schema-v2/revision-1/dx/shihai-{0..19}.json` | 20 DX shards | `comparison-regression` | current production fetch 0。repository APIは下位test/benchmark用 | dx migration、repository、asset tests | 公開URLは比較/referenceとして存在 | generator DX、manifest | runtime DX、generator exhaustive/simulation | `keep` | 新revision/URL retirementを別判断にする | asset equivalence、no production fetch smoke |
| `public/data/schema-v2/revision-1/dr/kazanari-{0..9}.json` | 10 DR shards | `comparison-regression` | current production fetch 0。DRはWorker生成 | damage migration、runtime experiment、asset tests | 公開URLは比較/referenceとして存在 | generator DR、manifest | RuntimeDamageRollCalculator、reference/simulation | `keep` | Worker経路を維持しつつURLを削除しない | runtime smoke、asset equivalence |
| `public/data/schema-v2/revision-1/livingdead.json` | 224 sparse 屍人 distributions | `comparison-regression` | current production fetch 0。Backtrackはon-demand | backtrack migration/rule、asset tests | 公開URLは比較/referenceとして存在 | generator livingdead、manifest | independent backtrack core/reference | `keep` | 新revision/retirementを別判断にする | asset equivalence、backtrack smoke |

## generator、再生成、独立検証

Python generatorは現行配信assetの再生成元であり、旧dense JSONとは独立して実装されている。`generator/README.md`のoffline手順、`uv run --project generator dx-precompute verify`、全generator testsを後継gateとして維持する。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `generator/src/dx_precompute/constants.py` | schema/revision、distribution sizes、accepted ranges、limits | `generator-regeneration` | なし | 全generator tests | なし | 全generator modules、manifest | current public asset equivalence | `keep` | JS plannerとの意味対応をdocsで維持 | `generator:test`、verify |
| `generator/src/dx_precompute/polynomials.py` | convolution、shift、overflow、rounding helpers | `generator-regeneration` | なし | distribution/numerical/exhaustive tests | なし | d10、livingdead、dx、dr生成 | independent reference and audit | `keep` | rounding/normalization invariantを維持 | generator tests |
| `generator/src/dx_precompute/d10.py`、`livingdead.py` | raw/rounded one-dimensional generators | `generator-regeneration` | なし | exhaustive、numerical、simulation、asset tests | なし | reference rolls、current asset equivalence | exhaustive/reference、asset equivalence | `keep` | asset count/supportを維持 | generator tests、verify |
| `generator/src/dx_precompute/dx.py` | shihai raw/rounded generation | `generator-regeneration` | なし | exhaustive、numerical、simulation、asset tests | なし | independent reference rolls、current assets | exhaustive/reference、asset equivalence | `keep` | 20 shard契約を維持 | generator tests、verify |
| `generator/src/dx_precompute/dr.py` | kazanari raw/rounded generation | `generator-regeneration` | なし | exhaustive、numerical、simulation、asset tests | なし | independent reference rolls、current assets | exhaustive/reference、asset equivalence | `keep` | 10 shard契約を維持 | generator tests、verify |
| `generator/src/dx_precompute/assets.py` | sparse serializer、manifest、hash/bytes、`generate_assets` | `generator-regeneration` | なし | current asset tests、CLI tests | なし | all dataset modules、public output | manifest/hash equivalence | `keep` | published revisionを上書きしない | verify、current asset tests |
| `generator/src/dx_precompute/cli.py` | `generate`、`verify`、dataset selection | `generator-regeneration` | なし | CLI/README、generator tests | なし | output/reference dirs、schema-v2 | `generator:verify` | `keep` | offline commandを維持 | CLI help、verify |
| `generator/tests/reference_rolls.py` | independent exhaustive enumeration | `generator-regeneration` | なし | exhaustive reference tests | なし | test oracle only | production coreと別実装 | `keep` | production helperをoracleに流用しない | exhaustive tests |
| `generator/tests/simulation_rolls.py`、`test_simulation.py` | random simulation、DKW/chi-square cases | `generator-regeneration` | なし | simulation tests | なし | generated/reference distributions | statistical agreement | `keep` | 13 casesの統計gateを維持 | simulation marker |
| `generator/tests/test_distributions.py`、`test_numerical_audit.py`、`test_exhaustive_reference.py`、`test_current_assets.py` | algebra、normalization/support、exhaustive、asset equivalence | `generator-regeneration` | なし | test自身 | なし | all generators/public revision-1 | independent audit and manifest | `keep` | dense JSONなしで同等gateが通ることを確認してからcleanup | `generator:test`、verify |
| `generator/README.md`、`generator/pyproject.toml` | setup、offline運用、ranges、CLI | `generator-regeneration` | なし | contributor/docs | Python/uv environment only | generator package | documented regeneration procedure | `keep` | local Python environment issueを別に記録 | docs lint、generator gate |

## migration/comparison barrelとbenchmark

`src/calculation/index.js`のlegacy reexport、`tests/legacyCanonicalComparison.test.js`、各migration test、benchmark scriptは、production bundleの実行経路ではなく比較・移行・性能測定のために残る。これらを先に削除すると、legacy削除後の数値差を説明できなくなる。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tests/legacyCanonicalComparison.test.js` | legacy/canonical distribution、damage、total comparison | `comparison-regression` | なし | test自身 | CI only | dense/public reference inputs | roadmap oracle coverage map、canonical rule/presentation tests | `delete-candidate` | comparison対象ごとの独立oracleが同等以上になること | comparison removal run、full JS gate |
| `tests/precomputedData.test.js` | dense JSON dimensions/normalization | `migration` | なし | test自身 | CI only | dense JSON shape | generator numerical audit/current assets | `move` | schema-v2 validationへ移行し、旧形式をreference fixture化 | JS/generator gate |
| `tests/precomputedDataRepository.test.js` | loader/cache/retry/revision validation | `comparison-regression` | なし | test自身 | repository APIs | public schema-v2 assets | D10 smoke、reference loader tests | `split` | D10 production smokeとreference loader testを分離 | full JS gate |
| `tests/precomputedAssets.test.js` | manifest、hash、bytes、asset support | `generator-regeneration` | なし | test自身 | deploy asset contract | generator assets/manifest | current asset equivalence | `keep` | revision-1 public filesをimmutableに検証 | asset test、verify |
| `tests/runtimeRuleValidation.test.js` | rule/asset cross-check | `comparison-regression` | なし | test自身 | CI only | public assets and data wrappers | independent expected/reference logic exists; canonical actual migration pending | `split` | asset checksとruntime rule checksを分離し、legacy wrapper削除前にactual側をcanonical coreへ移植 | JS/generator gate |
| `scripts/benchmark-calculators.mjs`、`benchmark-phase2h.mjs`、`benchmark-full-tail-attack.mjs` | legacy/canonical performance fixtures | `comparison-regression` | なし | manual benchmark | local Vite/SSR module loading | optional public assets | canonical runtime benchmark | `move` | benchmark対象と結果の保存場所を明記 | benchmark smoke when changed |

`tests/runtimeRuleValidation.test.js`は、`independentD10Sum`、`independentLivingdead`などの独立したexpected/reference logicを持つ一方、actual側は`src/data/ScoreCalculator.js`、`DamageCalculator.js`、`BacktrackCalculator.js`のwrapperに依存する。したがってScore、Damage、Backtrackのreplacement evidenceとしては条件付きであり、legacy wrapper削除前にactual側をcanonical coreへ移植する必要がある。今回の作業ではtest codeを変更しない。

## 1022、1023、1024、`published-bucket`の監査

数値は同じ意味で使われていない。次のように、productionの技術的なworking/output boundary、legacyのpublished bucket、fixtureの境界を区別する。

| 表記 | 現在の意味 | 使用箇所 | 分類 | 後続方針 |
| --- | --- | --- | --- | --- |
| `1024` | 1024要素output、legacy published length、D10/livingdead asset length、KiB/MiB換算の単位、またはテストfixtureの長さ | `Distribution.js`、`DistributionResult.js`、repository、RangePlanner、legacy calculator、tests | productionとcomparisonの混在 | symbol/用途ごとに保持し、canonical表示上限とはしない |
| `1023` | 1024要素配列の最後のpublished overflow bucket、またはlegacy exact index | `DistributionResult` adapter、legacy calculator、comparison/display boundary tests | comparison-regression | `toPublishedBucketDistribution`の安全条件を比較用に維持し、canonical値へ逆輸入しない |
| `1022` | published bucketへ安全に明示できる最後の値、またはcoverage fixtureのexplicit max | `RangePlanner`、display range、canonical chart、comparison tests | production boundaryとcomparison fixtureの混在 | range plannerのresource/coverage境界として用途を文書化し、入力上限とはしない |
| `published-bucket` | 旧1024形状への明示projection policy。tailを最終bucketへ折り畳める条件が必要 | `RangePlanner`、`DamageCalculator`、`DistributionResult` adapters、comparison tests | comparison-regression寄りの互換API | Attack productionは`full-tail`。残るgeneric policy/fixtureを整理してから削除判断 |
| `full-tail` | canonical score tailとdamage output supportを保持するproduction propagation | `CalculationClient`、canonical Damage、Attack presentation | production | 既定production経路として維持 |

入力表示の任意windowと計算内部の1024/2048、公開assetのdistributionSizeは別契約である。`0..1023`や`0..1024`のtestは旧bucketの存在を示すだけで、ユーザー入力やcanonical chartの上限を復活させる根拠にはならない。

## probability rounding golden coverage

Attack chartの表示丸めは`ChartPercentages.js`の`Math.round(probability * 1000) / 10`で、0.1 percentage point単位である。canonical adapterと`LegacyChartSetter.js`はこのhelperを共有する。一方、CheckやBacktrackのsummary丸めは別の契約であり、このhelperを全体へ適用しない。

| input probability | expected percentage | 現在のcoverage | 次の作業 |
| ---: | ---: | --- | --- |
| `0` | `0` | `tests/attackChartPercentages.test.js` | 完了 |
| `0.12349` | `12.3` | `tests/attackChartPercentages.test.js` | 完了 |
| `0.1235` | `12.4` | `tests/attackChartPercentages.test.js` | 完了 |
| `0.12351` | `12.4` | `tests/attackChartPercentages.test.js` | 完了 |
| `1` | `100` | `tests/attackChartPercentages.test.js` | 完了 |

5点は同じformatterへ直接適用するgolden testで固定し、TypedArray入力が通常のowned Arrayになることも確認する。新しい丸め方式や確率単位は導入していない。

## dependency contract testとproduction browser smoke

Node/Vitestで検証できるdependency contract testと、Vite preview上の実browserで検証するproduction browser smokeは別のgateである。今回のPhase 8-1 closureでは仕様を分離するだけで、test codeやPlaywright suiteは追加しない。

### Dependency contract test

候補は`tests/productionDependencyContract.test.js`または既存integration testへの追加である。mock/stub fetchとCalculationClient levelで、次の依存関係、legacy fallback 0、期待するclient/result contractを検証する。

1. 通常Check: DX public asset fetch 0。
2. Attack、防御ダイス0: D10 fetch 0、DR fetch 0。
3. Attack、防御ダイス1以上: D10 fetch 1またはcache hit、DR fetch 0。
4. Backtrack: D10 fetch 0、livingdead fetch 0。

### Production browser smoke

`vite build`と`vite preview`を使う実browser smokeでは、real asset URL、404なし、canvas/chart rendering、console error 0、console warning 0、D10 lazy fetch成功、DX/DR/livingdeadのunexpected fetch 0を確認する。既存のin-app browser受入はこのgateの手動実行例として残す。

Phase 8-2AのChartSetter splitはasset依存に触れないためbrowser smokeを必須gateにしていない。PrecomputedDataRepository splitやpublic asset整理へ進む前には、dependency contract testとproduction browser smokeの両方を必須前提とする。

## Phase 8-2へ渡す判断

Phase 8-2Aでは、証拠が最も局所的で本番asset契約を変えない`src/components/Attack/ChartSetter.js`のlegacy helper分離を完了した。production canonical exports、options、styleを残し、`getAttackScoreChartData`、`getAttackDamageChartData`、`clipData`、旧`range`依存を`LegacyChartSetter.js`へ移した。丸めgolden testは`ChartPercentages.js`のAttack表示境界に置いている。

次点は`PrecomputedDataRepository.js`のD10 production loaderとDX/DR/livingdead reference loaderの分離である。D10 lazy fetch/cache smokeを先に固定し、公開revision-1 URLを変更せずにtest/reference importを移す。legacy wrapper、dense JSON、`LegacyCanonicalComparison`の削除は、その後にoracle coverage mapを実行してから行う。

### ChartSetter split開始条件

- production canonical chart exports、options、styleを保持する。
- legacy helperの参照元を確認済みにする。
- rounding golden 5点を追加する。
- public assetと`PrecomputedDataRepository.js`には触れない。

### ChartSetter split完了条件

- `ChartSetter.js`のcanonical exports、options、styleを維持する。
- `src/`から`LegacyChartSetter.js`へのproduction importがない。
- legacy chart fixtureとcanonical chart fixtureがそれぞれ同じ丸めhelperの契約を検証する。
- `npm test`、lint、build、`git diff --check`が成功する。

### PrecomputedDataRepository split開始条件

- dependency contract testを先に実装する。
- production browser smokeを実行可能にする。
- D10 lazy fetch/cache contractを固定する。
- revision-1 public URLを変更しない。

### legacy wrapper削除開始条件

- `runtimeRuleValidation.test.js`などのactual側をcanonical coreへ移植する。
- independent oracle coverageを再確認する。
- legacy wrapper importerを0にする。

## 完了条件と現時点の結論

- production import graph、mixed-use moduleのsymbol/export、legacy core、wrapper、dense JSON、公開asset、generator、migration/comparison testを5分類で記録した。
- `runtimeRuleValidation.test.js`は独立expected/reference logicを持つが、actual側のcanonical移植前であることを記録した。
- dependency contract testとproduction browser smokeを別gateとして定義した。
- `1022`、`1023`、`1024`、`published-bucket`の意味を用途別に分離した。
- `ChartPercentages.js`を追加し、Attack chartのrounding golden 5点とTypedArray変換を固定した。
- D10以外の公開revision-1 assetは削除せず、32 data assetsと`manifest.json`の旧URLretirementを別revision・別release判断へ分離した。
- Phase 8-2AとしてChartSetter splitを完了し、PrecomputedDataRepository split、wrapper/JSON/comparison削除を後続へ送った。
- この作業ではAttack chart adapterとtests/docsだけを変更し、generator、JSON、asset、Worker、API、MCP、入力上限、表示windowは変更していない。
