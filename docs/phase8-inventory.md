# Phase 8-1 inventory

この文書は、canonical resultをproductionの既定経路にした後のPhase 8-1として、legacy計算、事前計算データ、公開asset、再生成コード、比較用テストの依存関係を棚卸しする。今回のclosure補正では、実装実態に合わせてoracle、smoke、asset、barrelの分類を更新する。Phase 8-2AではAttackのchart adapter、Phase 8-2Bではproduction dependency contract、Phase 8-2Cではproduction browser smoke、Phase 8-2Dでは事前計算データrepositoryのproduction/reference境界、Phase 8-2Eではreference/legacy importer監査とD10 validator closure、Phase 8-2Fではruntime rule validationのcanonical actual移行、Phase 8-2G1ではcompatibility facadeのtest importer移行、Phase 8-2G2ではbenchmark/experiment importer移行、Phase 8-2G3ではcalculation barrel importer移行、Phase 8-2G4ではcalculation barrel削除、Phase 8-2G5ではcompatibility facade削除、Phase 8-2G6ではdata calculator wrapper削除、G7～G9ではlegacy比較・旧データ生成系の退役、G10では残存コード監査とclosureを整理した。公開schema-v2/revision-1 asset、generator、計算意味論は維持し、旧dense JSONとschema-v1だけを削除した。

## 判定範囲と分類

Phase 8-1の調査時点はブランチ`codex/canonical-default-migration`のHEAD `752b3d9`である。Phase 8-2A以降の変更は、このinventoryの分類を更新する追補として扱う。production importerは`src/`の実行時importと、production bundleから到達するWorkerを指す。テスト、ベンチマーク、移行スクリプト、reference-dataからの参照はproduction importerに含めない。

| category | 意味 |
| --- | --- |
| `production` | 現在の静的SPA、ブラウザ内計算、Worker、公開assetの実行経路が必要とするもの。 |
| `comparison-regression` | legacyとcanonicalの比較、境界値回帰、表示互換性を検証するために保持するもの。 |
| `generator-regeneration` | 現行schema-v2 assetの再生成、manifest検証、独立oracle、simulationを担うもの。 |
| `migration` | 旧dense JSON、旧形式変換、旧revision、旧実装からの移行を再現するために保持するもの。 |
| `dead-candidate` | 現在のproduction、テスト、生成、移行の参照が確認できず、前提を満たした後に削除候補となるもの。 |

`proposed action`は、各Phaseの調査時点における操作候補を示す。過去Phaseの表はその時点のsnapshotであり、現行のretain/deleted判定は末尾のG10 closureを正とする。

## production import graph

productionの入口は`src/main.js`からrouter、各計算viewへ続く。Checkは`CalculationClient.calculateCheckCanonical`とcanonical presentation、Attackはcanonical batch runnerとcanonical presentation、Backtrackはcanonical client/runnerを利用する。productionの`CalculationClient`は`src/calculation/`のDX、Score、Damage、Backtrack、RangePlanner、ResourceGuardを直接参照し、`src/data/D10PrecomputedDataRepository.js`からはD10のlazy loaderとgetterだけを参照する。互換facadeの`src/data/PrecomputedDataRepository.js`はPhase 8-2G5で削除済みであり、production graphにも残っていない。

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
| `src/data/D10PrecomputedDataRepository.js` | D10 loader/cache、`loadD10Asset`、`getD10Distribution` | `production` | `CalculationClient`の防御D10 lazy経路 | integration、asset、repository tests、比較用data wrapper | `public/data/schema-v2/revision-1/d10.json`、fetch、cache | schema/manifestのrevision契約 | D10 lazy asset smoke、asset hash test | `keep` | revision-1 URLを削除しない | asset test、browser smoke |

## Attack chart modules

Phase 8-2Aで、production canonical adapterと旧1024要素配列adapterを別moduleへ分離した。`ChartSetter.js`にはcanonical adapter、options、styleだけを残し、旧APIと`clipData`、`range`依存は`LegacyChartSetter.js`へ移した。両経路のAttack chart表示丸めは`ChartPercentages.js`で共有するが、CheckやBacktrackのsummary丸めには適用しない。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/components/Attack/LegacyChartSetter.js` | `getAttackScoreChartData` | `dead-candidate` | なし | なし。compatibility APIとしてsplit後も一時保持 | 旧1024配列と`range()`に依存するがproduction bundleから呼ばれない | なし | `getCanonicalAttackScoreChartData`とcanonical presentation tests | `keep`（split済み） | 外部利用と動的参照を再確認し、独立oracle移行後に削除を判断 | full JS gate、legacy importer 0 |
| `src/components/Attack/ChartSetter.js` | `getCanonicalAttackScoreChartData` | `production` | Attack ScoreChart | `attackScoreDisplayAdapter.test.js`、canonical chart tests | Chart.js用labels/data、`ChartPercentages.js`による表示単位変換 | なし | canonical presentation and chart tests | `keep` | canonical chart contractを維持 | JS tests、browser smoke |
| `src/components/Attack/ChartSetter.js` | `getAttackScoreChartOptions` | `production` | Attack ScoreChart | chart adapter tests | Chart.js options | なし | existing chart smoke | `keep` | 見た目互換を維持 | build、browser smoke |
| `src/components/Attack/ChartSetter.js` | `getAttackScoreChartStyle` | `production` | Attack ScoreChart | component tests | Chart layout style | なし | existing browser acceptance | `keep` | 見た目互換を維持 | build、browser smoke |
| `src/components/Attack/LegacyChartSetter.js` | `getAttackDamageChartData` | `comparison-regression` | なし | `attackDamageDisplayAdapter.test.js`のlegacy shape fixture | 旧1024配列、旧total表示に依存 | なし | `getCanonicalAttackDamageChartData`とcanonical damage tests | `keep`（split済み） | legacy fixtureをcomparisonとして維持し、独立oracle移行後に削除を判断 | full JS gate、legacy importer 0の確認 |
| `src/components/Attack/ChartSetter.js` | `getCanonicalAttackDamageChartData` | `production` | Attack DamageChart | `attackDamageDisplayAdapter.test.js`、canonical chart tests | Chart.js用canonical damage/total series、`ChartPercentages.js`による表示単位変換 | なし | canonical damage presentation tests | `keep` | total chart contractを維持 | JS tests、browser smoke |
| `src/components/Attack/ChartSetter.js` | `getAttackDamageChartOptions` | `production` | Attack DamageChart | chart adapter tests | Chart.js options | なし | existing chart smoke | `keep` | 見た目互換を維持 | build、browser smoke |
| `src/components/Attack/ChartSetter.js` | `getAttackDamageChartStyle` | `production` | Attack DamageChart | component tests | Chart layout style | なし | existing browser acceptance | `keep` | 見た目互換を維持 | build、browser smoke |
| `src/components/Attack/LegacyChartSetter.js` | 内部`clipData`、`range` import | `comparison-regression` | なし | legacy chart testsと旧adapter | 1024固定配列のsliceと丸め | なし | canonical adapterはこの経路を通らない | `keep`（split済み） | 旧配列の互換挙動を維持し、共有丸めgoldenを保つ | full JS gate、legacy moduleのimport graph確認 |

**Phase 8-2A完了:** `ChartSetter.js`からlegacy array helperを`LegacyChartSetter.js`へ分離した。production canonical exports、options、styleと既存の表示挙動を保護し、`PrecomputedDataRepository`、公開asset、JSON、generatorには触れていない。Phase 8-2CでD10 lazy fetchのproduction smokeを完了し、Phase 8-2Dでrepositoryのproduction/reference分離を完了した。

## split modules: precomputed data repositories

Phase 8-2Dで、productionのD10 lazy asset経路と、DX・DR・livingdeadのcomparison/reference経路を別moduleへ分離した。共有schema validatorは`PrecomputedDataSchema.js`へ移し、互換facadeの`PrecomputedDataRepository.js`はfacade compatibility testと、Phase 8-2G2開始前まで残っていたbenchmark/experiment向けの互換re-exportを担っていた。Phase 8-2G2でbenchmark/experimentの直接移行を完了し、Phase 8-2G5でfacade専用テストのDX coverageをreference repository testへ移したうえでfacade本体と専用テストを削除した。公開asset、JSON、generator、計算意味論は変更していない。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/data/PrecomputedDataSchema.js` | schema/revision constants、base path、共通sparse validator | `production` | D10 repository、reference repository | repository/asset tests | schema-v2 revision-1 public URL | manifest/schema validation | `precomputedAssets.test.js` | `keep` | schema契約を変更しない | asset test、full JS gate |
| `src/data/D10PrecomputedDataRepository.js` | D10 loader/cache、`loadD10Asset`、`getD10Distribution` | `production` | `CalculationClient`、Damage/Backtrack data wrapper | integration、asset、repository tests | `public/.../d10.json`、fetch、expanded cache | generator d10 output/manifest | D10 lazy asset tests、browser smoke | `keep` | production D10経路とrevision-1 URLを保持 | asset hash、browser smoke |
| `src/data/ReferencePrecomputedDataRepository.js` | `createDxRepository`、`getDxDistribution`、`loadDxAsset`、`registerDxAsset` | `comparison-regression` | なし | dx migration、repository、calculator、benchmark tests | 公開DX shard URL、reference cache | public DX shardとgenerator output | exhaustive/reference、repository tests | `keep`（reference split済み） | production graphへ戻さない | migration/asset tests、bundle import確認 |
| `src/data/ReferencePrecomputedDataRepository.js` | `loadLivingdeadAsset`、`registerLivingdeadAsset`、`getLivingdeadDistribution` | `comparison-regression` | なし。canonical Backtrackはon-demand生成 | backtrack migration/canonical、rule、repository tests | 公開livingdead assetはreference fetch用 | generator livingdead output | `calculateLivingdeadDistributions`と独立reference | `keep`（reference split済み） | asset fixtureの保持期間を別途判断する | tests without production import、asset policy確認 |
| `src/data/ReferencePrecomputedDataRepository.js` | `registerDrAsset`、`loadDrAsset`、`getDrDamageDistributions` | `comparison-regression` | なし。DRはRuntimeDamageRollWorker | damage migration、runtime on-demand、repository、benchmark tests | 公開DR shard URLは比較/reference用 | generator DR output/manifest | runtime DR independent generator、simulation | `keep`（reference split済み） | runtime/reference testをasset-independentへ移行する | runtime tests、public URL policy確認 |
| `src/data/PrecomputedDataRepository.js` | re-export facade、`clearPrecomputedDataCache` | `deleted in Phase 8-2G5` | なし | なし（G5で専用testも削除） | 下位repositoryのAPI互換 | なし | direct repository tests、full import graph | `deleted` | なし。D10/Reference repositoryを直接利用する | targeted repository tests、full JS gate |

**Phase 8-2D完了:** `PrecomputedDataSchema.js`、`D10PrecomputedDataRepository.js`、`ReferencePrecomputedDataRepository.js`を追加し、productionの`src/`からD10以外のprecomputed repositoryへ到達しないimport graphへ整理した。既存facadeは互換用に維持し、cache、retry、sparse validation、finite-support expansion、DRのLRU 3件制限を保持した。Phase 8-2Eではreference/legacy importerを再監査し、削除候補の独立oracleと公開asset保持条件を確認した。G5ではfacade利用を0にしたうえでfacade本体と専用テストを削除し、下位repositoryの挙動はdirect testへ集約した。

## Phase 8-2E reference / legacy importer audit

Phase 8-2Eでは、Phase 8-2D後のHEAD `e048d90`（`codex/canonical-default-migration`）を対象に、`rg`で実際のimporterを再確認した。ここでいうproduction importerは`src/main.js`からproduction bundleへ到達する実行時importであり、テスト、migration、benchmark、experiment、generatorからの参照は含めない。表の`—`は、対象symbolへの該当する実importが確認できなかったことを示す。

この監査ではファイル単位で一括削除を決めず、mixed-use moduleのsymbol/exportと、実際の参照目的を分けて記録する。Phase 8-2E時点では`runtimeRuleValidation.test.js`のexpected側は独立したルール計算を持つ一方、actual側はdata wrapperを呼んでいた。Phase 8-2Fでactual側をcanonical coreへ移行したため、同テストは独立expectedとcanonical actualを比較するoracleになった。

### Phase 8 cleanupの集約

| 区分 | 現在の主な対象 | 現在までの扱い | 次の段階 |
| --- | --- | --- | --- |
| A: deleted | `src/calculation/index.js`（G3でimporter 0、G4で削除）、`src/data/PrecomputedDataRepository.js`（G5で削除）、3つのdata calculator wrapper（G6で削除） | Phase 8-2G3/G4でcalculation barrel、G5でcompatibility facade、G6でdata calculator wrapperを単独削除 | Phase 8-2G7でlegacy comparison/migration dependencyを再監査 |
| B: migration-small | 直接置換可能な参照 | Phase 8-2G1〜G3でfacade/barrel importerをowner moduleへ移行し、G5/G6でfacadeとdata calculator wrapperを削除 | legacy comparison/migration依存をsymbol単位で監査 |
| C: oracle-migration-required | `calculator.test.js`のrule coverage、`LegacyCanonicalComparison`、migration tests、legacy core、dense JSON | `runtimeRuleValidation.test.js`のactual側をCから外し、migration testは比較責務を保持 | 独立oracleと比較責務を確認してから個別移行 |
| D: retention-required | production D10 repository、canonical core、revision-1公開asset、generator、runtimeRuleValidationのcanonical-vs-independent rule oracle | 保持 | production・再生成・公開URL・独立oracleの契約を維持 |

| path | symbol/export | production importer | rule/oracle importer | migration importer | comparison importer | benchmark importer | generator dependency | asset dependency | replacement target | blocker | next action | deletion phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/data/PrecomputedDataRepository.js` | re-export facade、`clearPrecomputedDataCache` | —（G5で削除） | —（専用testをReference direct testへ移植） | —（G1でdirect repositoryへ移行） | — | —（G2でdirect repositoryへ移行） | — | `D10PrecomputedDataRepository.js`または`ReferencePrecomputedDataRepository.js`の直接import | なし | DXのconcurrent dedupe/cacheとrevision mismatchを`referencePrecomputedDataRepository.test.js`へ移植 | G5でfacade本体と`tests/precomputedDataRepository.test.js`を削除 | Phase 8-2G5 |
| `src/data/ScoreCalculator.js` | `getScoreSummary`、`calculateScore`、`getScore` | —（G6で削除） | 直接core＋Reference repositoryへ移行 | 直接core＋Reference repositoryへ移行 | legacy comparisonはcoreを直接参照 | benchmarkはcoreとrepositoryを直接load | — | dense DX、reference DX | `src/calculation/ScoreCalculator.js`と`getDxDistribution` | wrapper importer 0 | G6で直接移行後に削除 | Phase 8-2G6（完了） |
| `src/data/ScoreCalculator.js` | `getCanonicalScoreSummary`、`calculateScoreCanonical` | —（G6で削除） | canonicalCheck、display adapter、integration testsを直接coreへ移行 | — | canonical comparison tests | benchmarkはcoreを直接load | — | なし | `src/calculation/ScoreCalculator.js` | wrapper importer 0 | G6でCalculationClient依存シグネチャをtest-local helperへ限定 | Phase 8-2G6（完了） |
| `src/data/DamageCalculator.js` | `getDamage`、`getDamageSummary`、`getTotalDamage` | —（G6で削除） | 直接core＋D10/Reference repositoryへ移行 | 直接core＋repositoryへ移行 | legacy comparisonはcoreを直接参照 | benchmark/experimentsはcoreとrepositoryを直接load | — | dense DR、D10、public DR reference | `src/calculation/DamageCalculator.js` | wrapper importer 0 | G6で全consumerを直接移行後に削除 | Phase 8-2G6（完了） |
| `src/data/BacktrackCalculator.js` | `getFinalEncroachment`、`getFinalEncroachmentCanonical` | —（G6で削除） | 直接core＋D10/livingdead repositoryへ移行 | 直接core＋repositoryへ移行 | legacy comparisonはcoreを直接参照 | experimentsはcoreとrepositoryを直接load | — | dense/public D10、屍人 reference | `src/calculation/BacktrackCalculator.js` | wrapper importer 0 | G6で全consumerを直接移行後に削除 | Phase 8-2G6（完了） |
| `src/calculation/ScoreCalculator.js` | `calculateScore`、`getScoreSummary` | — | legacy fixtureとrule compatibility tests | migration tests | `LegacyCanonicalComparison` | calculators benchmark | — | dense DX/reference | `calculateScoreCanonical`と独立oracle | 固定1024 legacy比較をまだ保持 | 比較fixture移行後にlegacy exportを削除候補化 | Phase 8-2G |
| `src/calculation/ScoreCalculator.js` | `calculateScoreCanonical`、`calculateCanonicalScoreSuccessProbability`、`calculateCanonicalScoreSuccessProbabilityInterval`、`getCanonicalScoreSummary` | `CalculationClient`、Check/Attack presentationから間接到達 | canonical、rule、range、summary tests | canonical migration tests | canonical comparison tests | phase2h/full-tail benchmark | generator DXは独立oracle | runtime DXのみ | production CalculationClientとcanonical presentation | canonical summaryの`—`・tail certificate契約 | keep、契約を変更しない | 保持 |
| `src/calculation/DamageCalculator.js` | `createDamageRollRequest`、`calculateDamageOnDemand`、`calculateDamage`、`getDamageSummary`、`getTotalDamage` | — | legacy calculator、rule compatibility tests | damage migration | legacy/canonical comparison | calculators benchmark | — | dense/public DR/D10/DX | canonical damage and aggregation APIs | legacy fixed projectionと旧asset依存 | 移行比較を独立oracleへ移して削除候補化 | Phase 8-2G |
| `src/calculation/DamageCalculator.js` | `createCanonicalDamageRollRequest`、`finalizeOnDemandDamage`、`calculateCanonicalDamageOnDemand`、`getCanonicalDamageSummary` | `CalculationClient`、DR Worker adapterから到達 | canonical damage、aggregation、range tests | canonical migration tests | canonical comparison tests | full-tail benchmark | generator assetsは比較oracle | runtime DR、D10、full-tail Score | production canonical damage path | output overflowとScore tailの意味契約 | keep、canonical resultを唯一のproduction経路とする | 保持 |
| `src/calculation/BacktrackCalculator.js` | `calculateD10Distributions`、`calculateLivingdeadDistributions`、`calculateFinalEncroachmentCanonical` | `CalculationClient`から到達 | backtrack canonical、rule、simulation対応tests | backtrack migration | canonical comparison | experiment benchmark | generator D10/屍人は独立oracle | —（productionはon-demand） | production canonical backtrack | finite supportとResourceGuard契約 | keep、asset loaderへ戻さない | 保持 |
| `src/calculation/BacktrackCalculator.js` | `calculateFinalEncroachment` | — | legacy rule compatibility tests | `tests/backtrackMigration.test.js` | `tests/legacyCanonicalComparison.test.js` | `tests/calculator.test.js` | — | dense/public D10、屍人 | canonical backtrackと独立reference | migrationとruntime rule actualのlegacy依存 | actual側移行後にlegacy exportを削除候補化 | Phase 8-2G |
| `src/calculation/LegacyCanonicalComparison.js` | thresholds、error classes、`compareLegacyAndCanonicalDistributions`、`compareLegacyAndCanonicalDamage`、`compareLegacyAndCanonicalTotalDamage`、aliasと判定helper | — | — | migration comparisonの共通判定 | `tests/legacyCanonicalComparison.test.js` | benchmark comparison | — | dense/public reference | independent oracle coverage map | 旧・新の差分を説明する比較fixture | semantic coverageを確認してから削除判断 | Phase 8-2G |
| `src/calculation/index.js` | canonical re-export: `calculateFinalEncroachmentCanonical`、`calculateD10Distributions`、`calculateLivingdeadDistributions`、`calculateCanonicalDamageOnDemand`、`createCanonicalDamageRollRequest`、`finalizeOnDemandDamage`、`getCanonicalDamageSummary`、canonical aggregation、`calculateScoreCanonical`、`calculateCanonicalScoreSuccessProbabilityInterval`、`getCanonicalScoreSummary`、DX/RuntimeDamageRoll/RangePlanner API | — | —（G3完了後はowner moduleを直接import） | — | — | — | — | 下位moduleのowner export | owner moduleへの直接import | G3でimporter 0、G4でbarrel削除済み。owner moduleのAPIを保持 | — | Phase 8-2G4（完了） |
| `src/calculation/index.js` | legacy re-export: `calculateFinalEncroachment`、`calculateDamage`、`calculateDamageOnDemand`、`createDamageRollRequest`、`getDamageSummary`、`getTotalDamage`、`calculateScore`、`getScoreSummary`、`LegacyCanonicalComparison` exports | — | — | — | — | — | — | 下位moduleのowner export | owner moduleへの直接import | G3でimporter 0、G4でbarrel削除済み。legacy utilityの意味論は各owner moduleで保持 | — | Phase 8-2G4（完了） |
| `src/components/Attack/LegacyChartSetter.js` | `getAttackScoreChartData`、`getAttackDamageChartData`、内部`clipData` | — | — | — | `tests/attackDamageDisplayAdapter.test.js` | — | — | legacy 1024配列 | `ChartSetter.js` canonical adapter | legacy表示fixtureとcompatibility API | split済みのまま保持し、外部参照0を再確認 | Phase 8-2G |
| `src/data/Distribution.js` | `range` | — | `tests/attackDamageDisplayAdapter.test.js` | — | legacy display comparison | — | — | 1024 legacy array | canonical coordinate/labels adapter | legacy chart API | LegacyChartSetter削除時に同時削除を判断 | Phase 8-2G |
| `tests/runtimeRuleValidation.test.js` | 独立expected/referenceとcanonical actual | — | independent D10/livingdead、Score/Damage/Backtrack canonical core | — | rule cross-check | — | — | public assetは`precomputedAssets.test.js`とgeneratorで検証 | independent oracleとcanonical actual | actual側のwrapper・asset依存を除去済み | 独立oracleとして保持 | 保持 |
| `tests/precomputedDataRepository.test.js` | facade compatibility、loader/cache/retry/revision | —（G5で削除） | — | — | — | — | — | `referencePrecomputedDataRepository.test.js`、`d10PrecomputedDataRepository.test.js` | なし | DXの2ケースをReference direct testへ移植し、既存D10/DR/livingdead coverageは既存direct testで保持 | G5で専用testを削除 | Phase 8-2G5 |
| `tests/dxDataMigration.test.js` | dense DXとcanonical/referenceの移行比較 | — | — | 旧dense DX、public shard、canonical core | legacy/canonical comparison | — | generator DXを独立oracleにする | `src/data/dx.json`、public DX | generator exhaustive/referenceとcanonical test | dense JSONとwrapper import | 独立oracleへ移行後に削除候補 | Phase 8-2G |
| `tests/damageMigration.test.js` | dense/public DRとcanonical damage移行比較 | — | — | 旧dense DR、public DR、canonical damage | legacy/canonical comparison | — | generator DR、runtime reference | dense DR、public DR/D10 | runtime DRとcanonical damage tests | 旧assetとwrapper依存 | 独立oracle・runtime contractへ分割 | Phase 8-2G |
| `tests/backtrackMigration.test.js` | D10/屍人のlegacy/canonical移行比較 | — | — | dense/public D10、屍人、canonical backtrack | legacy/canonical comparison | — | generator D10/屍人 | dense/public reference asset | canonical backtrackと独立reference | wrapperとasset依存 | canonical rule testへ移行 | Phase 8-2G |
| `tests/calculator.test.js` | legacy calculatorのrule/境界回帰 | — | ルール・境界のcompatibility oracle | — | legacy comparison | — | — | dense/public reference | canonical rule testsとindependent oracle | wrapper/facade import | symbol単位でcanonicalへ移行 | Phase 8-2G |
| `tests/legacy/LegacyCalculator.js` | `getScore`、`getDamage`、`getTotalDamage`、`getFinalEncroachment`等 | — | — | migration fixtureのlegacy source | comparison tests | — | — | dense JSONとpublic asset | independent legacy fixtureまたは比較データ | dense JSONへの強い依存 | migration coverage移行後に削除候補 | Phase 8-2G |
| `tests/legacyCanonicalComparison.test.js` | legacy/canonical distribution、damage、total比較 | — | — | migration comparison | test自身 | — | dense/public reference | legacy core、canonical core | semantic別のindependent oracle | 比較対象のcoverage | oracle coverage確認後に削除候補 | Phase 8-2G |
| `tests/runtimeDamageOnDemand.test.js`、`tests/runtimeDamageRollExperiment.test.js` | 旧asset/runtime実験比較 | — | runtime rule補助 | migration/experiment | legacy/runtime comparison | — | public DR reference、独立runtime | public DR、Worker runtime | production Worker contractとsimulation | 実験fixtureのasset依存 | production contract testへ整理 | Phase 8-2G |
| `scripts/generate-precomputed-data.mjs` | dense JSONからschema-v1 reference-dataを生成 | — | — | 旧形式変換の再現 | — | — | `src/data/*.json` | dense JSON、schema-v1 reference | Python `dx-precompute generate/verify` | 旧revision再現要件 | 旧revision保持期間を決めてから移行・削除 | Phase 8-2G |
| `scripts/benchmark-calculators.mjs`、`benchmark-phase2h.mjs`、`benchmark-full-tail-attack.mjs` | legacy/canonical性能fixture | — | — | — | 比較・性能測定 | script自身とexperiments | optional public reference asset | public/reference assetとVite SSR | canonical runtime benchmark | 再現可能な測定環境と履歴 | benchmark結果を保存し、参照先を明示 | Phase 8-2G |
| `src/data/dx.json` | dense DX table全体 | — | `tests/precomputedData.test.js`、`tests/legacy/LegacyCalculator.js` | `tests/dxDataMigration.test.js` | legacy comparison | — | `scripts/generate-precomputed-data.mjs` | dense DX | Python generator、exhaustive/reference、simulation | 旧dense shapeを読むtest | migration移行後にreference fixture化または削除 | Phase 8-2G |
| `src/data/dr.json` | dense DR table全体 | — | `tests/precomputedData.test.js`、`tests/legacy/LegacyCalculator.js` | `tests/damageMigration.test.js` | legacy comparison | — | `scripts/generate-precomputed-data.mjs` | dense DR | Python DR generator、runtime reference、simulation | 旧transformとmigration test | 独立oracle移行後にreference fixture化または削除 | Phase 8-2G |
| `src/data/d10.json` | dense D10 table全体 | —（productionはpublic sparse D10をlazy fetch） | `tests/precomputedData.test.js`、legacy calculator | damage/backtrack migration | legacy comparison | — | `scripts/generate-precomputed-data.mjs` | dense D10、public sparse D10 | D10 repository smokeとcanonical backtrack | production assetとlegacy fixtureの混同 | public asset smokeとmigration fixtureを分離 | Phase 8-2G |
| `src/data/livingdead.json` | dense屍人 table全体 | —（canonical Backtrackはon-demand） | `tests/precomputedData.test.js`、rule/migration tests | backtrack migration | legacy comparison | — | `scripts/generate-precomputed-data.mjs` | dense屍人、public reference | independent exhaustive/reference、simulation | canonical rule testのasset依存 | canonical actual移行後にreference fixture化または削除 | Phase 8-2G |
| `public/data/schema-v2/revision-1/manifest.json` | manifest、hash、bytes、dataset metadata | —（runtime repositoryはmanifestをfetchしない） | `tests/precomputedAssets.test.js`、generator current asset tests | — | asset comparison | — | Python assets/manifest writer | revision-1配布契約 | generator verifyとdeploy integrity | 公開URLのimmutable契約 | keep、retirementは別release判断 | Phase 8 release |
| `public/data/schema-v2/revision-1/d10.json` | 224 sparse D10 distributions | `CalculationClient`の防御D10 lazy fetch | repository、asset、integration tests | — | asset equivalence | — | generator D10、manifest | current production asset | D10 lazy smoke、repository validator | revision-1 URL保持 | keep、同一revisionから削除しない | Phase 8 release |
| `public/data/schema-v2/revision-1/dx/shihai-{0..19}.json` | 20 DX shards | —（productionはruntime DX） | asset、migration、repository tests | — | asset equivalence | — | generator DX、manifest | comparison/reference asset | runtime DX、generator exhaustive/simulation | 旧URLを参照する比較test | 新revisionとretirementを別判断 | Phase 8 release |
| `public/data/schema-v2/revision-1/dr/kazanari-{0..9}.json` | 10 DR shards | —（productionはDR Worker） | asset、migration、runtime experiment | — | asset equivalence | — | generator DR、manifest | comparison/reference asset | RuntimeDamageRollCalculator、simulation | 旧URLを参照する比較test | Worker経路を維持しつつ保留 | Phase 8 release |
| `public/data/schema-v2/revision-1/livingdead.json` | 224 sparse屍人 distributions | —（productionはon-demand Backtrack） | asset、migration、rule tests | — | asset equivalence | — | generator屍人、manifest | comparison/reference asset | independent backtrack core/reference | asset fixtureとrule actualの依存 | 新revisionとretirementを別判断 | Phase 8 release |
| `reference-data/schema-v1/revision-1/` | 33 JSON files、旧schema reference | — | `generator/tests/test_current_assets.py`のD10/屍人fixture | scripts生成物 | migration comparison | — | 旧dense変換 | schema-v1 reference | schema-v2 generator/reference | revision-1 fixtureの利用 | 保持期間を明示してから削除候補 | Phase 8-2G |
| `reference-data/schema-v1/revision-2/` | 33 JSON files、旧revision | — | — | historical reference | migration comparison | — | 旧dense変換 | schema-v1 historical asset | 現行generator audit | 直接import未確認だが履歴価値あり | historical retentionを判断 | Phase 8-2G |
| `reference-data/schema-v1/revision-3/` | 33 JSON files、旧revision | — | — | historical reference | migration comparison | — | 旧dense変換 | schema-v1 historical asset | 現行generator audit | 直接import未確認だが履歴価値あり | historical retentionを判断 | Phase 8-2G |
| `generator/src/dx_precompute/{constants,polynomials,d10,livingdead,dx,dr,assets,cli}.py` | 再生成、sparse serializer、manifest、独立計算 | — | generator exhaustive、numerical、simulation、asset tests | — | current asset equivalence | — | generator package自身 | public schema-v2 revision-1 | 現行配信assetの再生成と検証 | 独立oracle・再生成手順として必要 | keep、cleanup対象外 | 保持 |
| `generator/tests/reference_rolls.py`、`simulation_rolls.py`、`test_*.py` | 独立全列挙、simulation、数値・asset audit | — | test自身 | — | — | — | generator modules/public asset | current asset/reference | production coreと別実装 | generator gateの再現性 | keep、旧dense削除の前提にする | 保持 |

### 監査結果とPhase 8-2Gへの接続

production importerが0であっても、直ちに削除できるとは限らない。migration test、`LegacyCanonicalComparison`、dense/reference asset、generatorの独立oracleが相互に削除条件となるため、今回の結論は「保留理由を明示したkeepまたはmigrate」である。G5ではfacade専用coverageをdirect repository testへ移し、`PrecomputedDataRepository.js`を削除した。D10 production repositoryとreference repositoryのsource splitは逆戻りさせない。

Phase 8-2Fでは`tests/runtimeRuleValidation.test.js`のactual側を`src/calculation/`のcanonical APIへ置換した。expected側の独立ルール計算を保持したまま、Score、Damage、Backtrackのcanonical actualと照合し、同テストからdata wrapper、compatibility asset登録、公開JSONへの依存を除去している。Phase 8-2G3では`src/calculation/index.js`の全importerをowner moduleへ移行し、G4でbarrelを削除した。G5では残ったfacade専用coverageをReference direct testへ移植し、facade本体と専用testを削除した。

## Phase 8-2F/Gの進捗

Phase 8-2Fは完了した。`tests/runtimeRuleValidation.test.js`のactual側を`src/data/{ScoreCalculator,DamageCalculator,BacktrackCalculator}.js`から`src/calculation/`のcanonical coreへ移行し、expected/reference側の独立実装はルール整合性のoracleとして保持した。canonical Scoreは`result`／`metadata` envelope、Damageはruntime D10 providerと混合DR生成、Backtrackは完全finite supportとpresentation adapterを通して検証している。完了条件は、同テストから`src/data/ScoreCalculator.js`、`DamageCalculator.js`、`BacktrackCalculator.js`、`PrecomputedDataRepository.js`をimportしないことと、asset検証を`tests/precomputedAssets.test.js`およびgeneratorへ分離することである。これはリポジトリ全体のlegacy wrapper importer 0を意味しない。

Phase 8-2Gは、`calculator.test.js`、migration/comparison test、calculation barrel、compatibility facade、legacy core、dense JSONの参照を同じ分類表に従って個別に移行・保持判断する段階である。Phase 8-2G1とG2ではfacadeのtest、scripts、experimentsの参照移行を完了し、G3ではcalculation barrelの参照移行、G4ではbarrel削除、G5ではfacade削除、G6ではdata calculator wrapper削除を完了した。公開asset、generator、production D10 repositoryは引き続き保持し、次はG7でlegacy comparison/migration依存を整理する。

## Phase 8-2G1: compatibility facade test importer移行（完了）

実装前の`rg`では、`tests/`にfacade importerが9件あり、`tests/precomputedDataRepository.test.js`以外は単なるre-export利用だった。D10系は`D10PrecomputedDataRepository.js`へ、DX・DR・livingdead系は`ReferencePrecomputedDataRepository.js`へ直接移行した。`tests/precomputedDataRepository.test.js`だけはfacade compatibility regressionとして意図的に残している。

移行対象は`tests/calculator.test.js`、`tests/dxDataMigration.test.js`、`tests/damageMigration.test.js`、`tests/backtrackMigration.test.js`、`tests/backtrackCanonical.test.js`、`tests/backtrackCanonicalPresentation.test.js`、`tests/calculationClientIntegration.test.js`、`tests/runtimeDamageOnDemand.test.js`である。legacy calculator、migration/comparisonの意味、public JSON、production `src/`は変更していない。

実装後の`tests/`におけるfacade importは`tests/precomputedDataRepository.test.js`だけであった。Phase 8-2G2では、`scripts/benchmark-calculators.mjs`、`scripts/benchmark-phase2h.mjs`、`scripts/benchmark-full-tail-attack.mjs`、`experiments/runtime-dr/damage.js`、`experiments/phase2h-browser/browser-benchmark.js`、`experiments/dynamic-distribution-ranges/browser-benchmark.js`のfacade参照を、benchmark/experimentの再現性を保ったまま直接repositoryへ移行した。G5で残った専用testを削除し、facade importerを0件とした。

完了条件は、テストのfacade importをcompatibility testだけに限定し、direct repository import、targeted test、full JS gate、lint、Markdown lint、build、`git diff --check`を成功させることである。facade本体、data wrapper、calculation barrel、public asset、generatorは削除しない。

Phase 8-2G2では、scripts/experimentsのfacade importerを保持せず、benchmark/experiment自体を残したまま直接repositoryへ移行した。`scripts/benchmark-calculators.mjs`、`scripts/benchmark-phase2h.mjs`、`scripts/benchmark-full-tail-attack.mjs`、`experiments/runtime-dr/damage.js`、`experiments/phase2h-browser/browser-benchmark.js`、`experiments/dynamic-distribution-ranges/browser-benchmark.js`の6件を対象とした。benchmark case、測定条件、legacy/canonical比較、report schema、public revision-1 asset pathは変更していない。full-tail benchmarkはD10 repositoryだけをロードし、他のbenchmarkは必要なD10/reference repositoryをそれぞれ直接ロードする。

実装後の`src`、`tests`、`scripts`、`experiments`におけるfacade importerは`tests/precomputedDataRepository.test.js`だけである。facade本体は削除せず、Phase 8-2G3で`src/calculation/index.js`のlegacy/canonical barrel importerを独立して監査・移行した。

## Phase 8-2G3: calculation barrel importer移行（完了）

`rg`で確認したbarrel importerを、利用symbolのowner moduleへ直接移行した。`src/calculation/index.js`自体は変更せず、canonical／legacy export、比較utility、limits、RangePlanner、runtime DRの意味論と公開dependency名は維持している。

| importer | 主な利用symbol | 直接import先 |
| --- | --- | --- |
| `tests/calculationCore.test.js` | Backtrack、Backtrack limits、legacy Damage、legacy Score | `BacktrackCalculator.js`、`BacktrackLimits.js`、`DamageCalculator.js`、`ScoreCalculator.js` |
| `tests/canonicalCheck.test.js`、`tests/checkSummaryTable.test.js` | DX、canonical Score、summary、range planner | `DxCalculator.js`、`ScoreCalculator.js`、`RangePlanner.js` |
| `tests/canonicalDamageSummary.test.js` | canonical Damage summary、期待値 summary | `DamageCalculator.js`、`DistributionResult.js` |
| `tests/canonicalDamageOnDemand.test.js`、`tests/runtimeDamageOnDemand.test.js` | canonical／legacy Damage、request、runtime DR、range planner | `DamageCalculator.js`、`RuntimeDamageRollCalculator.js`、`RangePlanner.js` |
| `tests/canonicalDamageAggregation.test.js` | aggregation constants、planner、sum | `CanonicalDamageAggregation.js` |
| `tests/runtimeDamageRollProduction.test.js` | runtime DR constants、validation、mixed distribution | `RuntimeDamageRollCalculator.js` |
| `tests/legacyCanonicalComparison.test.js` | Damage、Backtrack、DX、Score、comparison、runtime DR、range、aggregation | 各owner module（`DamageCalculator.js`、`BacktrackCalculator.js`、`DxCalculator.js`、`ScoreCalculator.js`、`LegacyCanonicalComparison.js`、`RuntimeDamageRollCalculator.js`、`RangePlanner.js`、`CanonicalDamageAggregation.js`） |
| `tests/dxOnDemand.test.js` | DX constants、on-demand distribution | `DxCalculator.js` |
| `scripts/benchmark-phase2h.mjs` | Damage、Score、runtime DR、aggregation、comparison、summary、range | 各owner moduleをVite SSRで直接load |
| `scripts/benchmark-full-tail-attack.mjs` | Damage、DX、Score、runtime DR、range、aggregation | 各owner moduleをVite SSRで直接load。D10 repositoryのみ併用 |
| `experiments/phase2h-browser/browser-benchmark.js` | Damage、comparison、summary、runtime DR、Score、range、aggregation | 各owner moduleをbrowser bundleへ直接import |

G3完了後、`src`、`tests`、`scripts`、`experiments`のbarrel importerとcalculation barrelのSSR loadは0件である。`src/calculation/index.js`はdynamic importやpackage exportの参照もなく、Phase 8-2G4でbarrel単独の削除を実施した。G3のclosureは、`npx vitest run tests/legacyCanonicalComparison.test.js`、`npm run benchmark:calculators`、`npm run benchmark:phase2h -- --iterations 1 --warmup 0`、`npm run benchmark:phase2h:browser:playwright:short`、`npm run benchmark:full-tail-attack -- --iterations 1 --warmup 0`、`npm test`、`npm run lint`、`npm run lint:markdown`、`npm run build`、`git diff --check`がすべて成功したことと、barrel importer 0を確認したことで完了した。

## Phase 8-2G4: calculation barrel削除（完了）

Phase 8-2G3で全importerをowner moduleへ移行したことを前提に、`src/calculation/index.js`を削除した。削除前後のglobal/static/dynamic/SSR検索でbarrel参照0、`package.json`の`exports`なし、`private: true`を確認している。owner calculation module、計算意味論、facade、data wrapper、`LegacyCanonicalComparison`、migration/comparison test、JSON、公開asset、generator、benchmark caseは変更していない。次はPhase 8-2G5として`PrecomputedDataRepository.js` compatibility facadeのretirementを独立して判断する。

## Phase 8-2G5: PrecomputedDataRepository compatibility facade削除（完了）

G5開始時点でcompatibility facadeのimporterは`tests/precomputedDataRepository.test.js`だけだった。facade testに残っていたDXのconcurrent shard load dedupe/cacheとdata revision mismatchの2ケースを`tests/referencePrecomputedDataRepository.test.js`へ移植し、既存のDX retry、D10 finite-support、livingdead finite-support coverageはそれぞれのdirect repository testで保持した。そのうえで`tests/precomputedDataRepository.test.js`と`src/data/PrecomputedDataRepository.js`を削除した。

`D10PrecomputedDataRepository.js`、`ReferencePrecomputedDataRepository.js`、`PrecomputedDataSchema.js`、public asset、generator、計算意味論は変更していない。削除後の旧facade importerと`clearPrecomputedDataCache`は`src`、`tests`、`scripts`、`experiments`で0件である。次はPhase 8-2G6として、canonical data wrapperを全consumerから削除する。

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
| `src/calculation/index.js` | canonical reexports | `deleted in Phase 8-2G4` | なし。production、tests、scripts、experimentsから参照なし | — | — | なし | owner moduleの直接import | `deleted` | Phase 8-2G3でimporter 0を実測し、G4で削除 | full JS gate、dynamic reference 0 |
| `src/calculation/index.js` | legacy calculation/comparison reexports | `deleted in Phase 8-2G4` | production、tests、scripts、experimentsから参照なし | — | — | なし | owner moduleの直接import | `deleted` | Phase 8-2G3でimporter 0を実測し、G4でbarrel単独削除 | full JS gate、dynamic reference 0 |

## data wrapper

`src/data/ScoreCalculator.js`、`DamageCalculator.js`、`BacktrackCalculator.js`は、Phase 8-2G6で削除したproduction非依存の互換wrapperである。削除前はcanonical相当のexportを含んでいても、productionは`src/calculation/`を直接参照していたため、wrapper全体をproductionとは判定しなかった。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/data/ScoreCalculator.js` | `getScoreSummary`、`calculateScore`、`getScore` | `deleted in Phase 8-2G6` | なし | 直接core＋Reference repositoryへ移行 | repository DX loaderとlegacy fixed projection | dense DX/reference | `src/calculation/ScoreCalculator.js`と`getDxDistribution` | `deleted` | G6で全consumerを直接core化 | full JS gate、no wrapper import |
| `src/data/ScoreCalculator.js` | `getCanonicalScoreSummary`、`calculateScoreCanonical` | `deleted in Phase 8-2G6` | なし | canonicalCheck、display adapter、integration testsを直接coreへ移行 | canonical runtime provider | なし | `src/calculation/ScoreCalculator.js` | `deleted` | G6でCalculationClient依存シグネチャをtest-local adapterへ限定 | full JS gate、no wrapper import |
| `src/data/DamageCalculator.js` | `getDamageSummary`、`getTotalDamage`、`getDamage` | `deleted in Phase 8-2G6` | なし | 直接core＋D10/DR repositoryへ移行 | D10/DR repositoryとlegacy damage | dense/public DR/D10 assets | `src/calculation/DamageCalculator.js` | `deleted` | G6でmigration、runtime、benchmark consumerを直接core化 | full JS gate、no wrapper import |
| `src/data/BacktrackCalculator.js` | `getFinalEncroachment`、`getFinalEncroachmentCanonical` | `deleted in Phase 8-2G6` | なし | 直接core＋D10/livingdead repositoryへ移行 | public D10/livingdead repository | dense/public reference assets | `src/calculation/BacktrackCalculator.js` | `deleted` | G6でpresentation、migration、client consumerを直接core化 | full JS gate、no wrapper import |

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
| `public/data/schema-v2/revision-1/dx/shihai-{0..19}.json` | 20 DX shards | `comparison-regression` | productionはDX loaderを要求しない。repository APIは下位test/benchmark用 | dx migration、repository、asset tests | 公開URLは比較/referenceとして存在 | generator DX、manifest | runtime DX、generator exhaustive/simulation | `keep` | 新revision/URL retirementを別判断にする | asset equivalence、no production fetch smoke |
| `public/data/schema-v2/revision-1/dr/kazanari-{0..9}.json` | 10 DR shards | `comparison-regression` | productionはDR loaderを要求しない。DRはWorker生成 | damage migration、runtime experiment、asset tests | 公開URLは比較/referenceとして存在 | generator DR、manifest | RuntimeDamageRollCalculator、reference/simulation | `keep` | Worker経路を維持しつつURLを削除しない | runtime smoke、asset equivalence |
| `public/data/schema-v2/revision-1/livingdead.json` | 224 sparse 屍人 distributions | `comparison-regression` | productionはpublic屍人 loaderを要求しない。Backtrackはon-demand | backtrack migration/rule、asset tests | 公開URLは比較/referenceとして存在 | generator livingdead、manifest | independent backtrack core/reference | `keep` | 新revision/retirementを別判断にする | asset equivalence、backtrack smoke |

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

`src/calculation/index.js`のlegacy reexportはPhase 8-2G4で削除済みである。`tests/legacyCanonicalComparison.test.js`、各migration test、benchmark scriptはproduction bundleの実行経路ではなく比較・移行・性能測定のために残る。これらを先に削除すると、legacy削除後の数値差を説明できなくなる。

| path | symbol/export | category | production importer | test/reference importer | runtime/deploy dependency | regeneration dependency | replacement evidence | proposed action | prerequisite | acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tests/legacyCanonicalComparison.test.js` | legacy/canonical distribution、damage、total comparison | `comparison-regression` | なし | test自身 | CI only | dense/public reference inputs | roadmap oracle coverage map、canonical rule/presentation tests | `delete-candidate` | comparison対象ごとの独立oracleが同等以上になること | comparison removal run、full JS gate |
| `tests/precomputedData.test.js` | dense JSON dimensions/normalization | `migration` | なし | test自身 | CI only | dense JSON shape | generator numerical audit/current assets | `move` | schema-v2 validationへ移行し、旧形式をreference fixture化 | JS/generator gate |
| `tests/precomputedDataRepository.test.js` | loader/cache/retry/revision validation | `comparison-regression` | なし | test自身 | repository APIs | public schema-v2 assets | D10 smoke、reference loader tests | `split` | D10 production smokeとreference loader testを分離 | full JS gate |
| `tests/precomputedAssets.test.js` | manifest、hash、bytes、asset support | `generator-regeneration` | なし | test自身 | deploy asset contract | generator assets/manifest | current asset equivalence | `keep` | revision-1 public filesをimmutableに検証 | asset test、verify |
| `tests/runtimeRuleValidation.test.js` | rule cross-check | `comparison-regression` | なし | test自身 | CI only | — | independent expected/referenceとcanonical actual | `keep` | asset checksは`precomputedAssets.test.js`とgeneratorへ分離済み | JS/generator gate |
| `scripts/benchmark-calculators.mjs`、`benchmark-phase2h.mjs`、`benchmark-full-tail-attack.mjs` | legacy/canonical performance fixtures | `comparison-regression` | なし | manual benchmark | local Vite/SSR module loading | optional public assets | canonical runtime benchmark | `move` | benchmark対象と結果の保存場所を明記 | benchmark smoke when changed |

`tests/runtimeRuleValidation.test.js`は、`independentD10Sum`、`independentLivingdead`などの独立したexpected/reference logicと、`src/calculation/`のcanonical Score、Damage、Backtrack actualを持つ。公開assetの整合性は`precomputedAssets.test.js`とgeneratorへ分離しているため、このテストはasset登録やdata wrapperに依存しないruntime rule oracleとして扱う。Phase 8-2Bのdependency contract testは引き続き別のclient境界テストである。

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

Node/Vitestで検証できるdependency contract testと、Vite preview上の実browserで検証するproduction browser smokeは別のgateである。Phase 8-2Bでは前者を追加し、Phase 8-2Cでは後者を実装・実行した。

### Dependency contract test

`tests/productionDependencyContract.test.js`で、mock/stub dependencyとCalculationClient境界を検証する。実network fetchや実Workerではなく、次の依存関係、legacy fallback 0、期待するclient/result contractを固定する。

1. 通常Check: precomputed DX loader dependencyを要求しない。
2. Attack、防御ダイス0: D10 readiness loaderを要求せず、Damageへruntime DR providerを渡す。
3. Attack、防御ダイス1以上: clientがD10 readiness loaderを要求し、DR runtime providerを渡す。repositoryのnetwork fetchまたはcache hitはbrowser smokeで確認する。
4. Backtrack: public D10 / livingdead loader dependencyを要求しない。

このテストはmock/stubによる依存関係の境界を検証するもので、実network requestの回数は保証しない。実配布物でのrequest 0またはD10のlazy request 1回は、Phase 8-2Cのproduction browser smokeで確認した。

### Production browser smoke

`scripts/production-browser-smoke.mjs`は`vite build`成果物を空きportの`vite preview`で配信し、Playwright Chromiumのfresh contextでCheck、Attack、Backtrackを確認する。Check、Attack、Backtrackはそれぞれ独立したfresh contextで起動し、Attackでは同一context内で防御ダイス0から1へ変更してD10 lazy fetchを連続操作で確認する。2026-08-26の実行では、Checkはcanvas 1・revision-1 asset request 0、Attack初期（防御ダイス0）はcanvas 2・revision-1 asset request 0、Attackで防御ダイスを1へ変更した後はcanvas 2・`d10.json` request 1（HTTP 200）・その他のrevision-1 asset request 0、Backtrackはcanvas 3・revision-1 asset request 0だった。全ケースでsame-origin HTTP error 0、console warning/error 0、pageerror 0、same-origin requestfailed 0を確認した。

Phase 8-2AのChartSetter splitはasset依存に触れないためbrowser smokeを必須gateにしていない。Phase 8-2Bのdependency contract testとPhase 8-2Cのproduction browser smokeを別々に完了したため、PrecomputedDataRepository splitやpublic asset整理へ進む前提が揃った。

## Phase 8-2へ渡す判断

Phase 8-2Aでは、証拠が最も局所的で本番asset契約を変えない`src/components/Attack/ChartSetter.js`のlegacy helper分離を完了した。production canonical exports、options、styleを残し、`getAttackScoreChartData`、`getAttackDamageChartData`、`clipData`、旧`range`依存を`LegacyChartSetter.js`へ移した。丸めgolden testは`ChartPercentages.js`のAttack表示境界に置いている。

Phase 8-2Eではreference/legacy importerを再監査し、D10 validator/cacheの直接テストを追加した。Phase 8-2DでD10 production loaderとDX/DR/livingdead reference loaderを分離したため、公開revision-1 URLを変更せずにtest/reference importの責務を確認できた。Phase 8-2FではruntimeRuleValidationのactual側をcanonical coreへ移行した。Phase 8-2G1/G2/G3ではfacadeとcalculation barrelの利用者をowner moduleへ直接移行した。legacy wrapper、dense JSON、`LegacyCanonicalComparison`の削除は、独立oracle coverage mapと公開asset保持条件を再確認してから個別に判断する。

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

- dependency contract test: 完了（`tests/productionDependencyContract.test.js`）。
- production browser smoke: 完了（`scripts/production-browser-smoke.mjs`）。実配布物のnetwork契約を確認した。
- D10 lazy fetch/readiness contract: 完了（防御ダイス1で`d10.json`を1回、HTTP 200）。
- revision-1 public URLを変更しない。

### PrecomputedDataRepository split完了条件

- `src/`のproduction importerは`D10PrecomputedDataRepository.js`だけをprecomputed repositoryとして参照する。
- DX、DR、livingdeadのreference loaderは`ReferencePrecomputedDataRepository.js`へ移り、compatibility facadeはPhase 8-2G5で削除済みである。
- schema/revision/sparse validatorは`PrecomputedDataSchema.js`へ集約し、cache、retry、sparse expansion、DR LRUの挙動を維持する。
- `npm test`、data gate、generator gate、lint、build、production browser smoke、`git diff --check`が成功する。

### Phase 8-2G legacy wrapper削除開始条件

- `runtimeRuleValidation.test.js`などのactual側をcanonical coreへ移植済みにする。
- independent oracle coverageを再確認する。
- 対象とするwrapper/barrel importerの範囲を個別に明示する。Phase 8-2Fの完了条件は`runtimeRuleValidation.test.js`からの4つのdata module import 0、Phase 8-2G3の完了条件はcalculation barrel importer 0、Phase 8-2G6の完了条件は3つのdata calculator wrapper importer 0である。

### Phase 8-2G6: data calculator wrapper削除（完了）

`src/data/ScoreCalculator.js`、`src/data/DamageCalculator.js`、`src/data/BacktrackCalculator.js`を削除した。`tests`、`scripts`、`experiments`の全consumerは、それぞれの`src/calculation/` owner moduleと必要なD10/Reference repositoryを直接importする形へ移行した。CalculationClientへ注入する旧引数形状が必要なテストでは、共有moduleを追加せずfile-local helperで依存を明示した。

削除前後の`src`、`tests`、`scripts`、`experiments`におけるwrapper import、SSR load、文字列参照は0件である。legacy core、`LegacyCanonicalComparison`、migration/comparison fixture、dense JSON、public asset、generator、benchmark条件、production UI、計算意味論は変更していない。次はPhase 8-2G7としてlegacy comparison/migration依存を整理する。

G5/G6 closure（2026-08-28）では、repository・asset対象テスト22件、`benchmark:calculators`、`benchmark:phase2h -- --iterations 1 --warmup 0`、全Vitest（64 files / 908 tests）、ESLint、Markdown lint（24 files / 0 issues）、production build、`git diff --check`を実行し、すべて成功した。`dynamic-distribution-ranges/benchmark-phase2e.mjs`も全ケースをエラーなしで完了した。

## 完了条件と現時点の結論

- production import graph、mixed-use moduleのsymbol/export、legacy core、wrapper、dense JSON、公開asset、generator、migration/comparison testを5分類で記録した。
- `runtimeRuleValidation.test.js`は独立expected/reference logicとcanonical actualを持ち、Score、Damage、Backtrackのruntime rule oracleとしてwrapper・公開asset登録から分離した。
- dependency contract testとproduction browser smokeを別gateとして定義した。
- `1022`、`1023`、`1024`、`published-bucket`の意味を用途別に分離した。
- `ChartPercentages.js`を追加し、Attack chartのrounding golden 5点とTypedArray変換を固定した。
- D10以外の公開revision-1 assetは削除せず、32 data assetsと`manifest.json`の旧URLretirementを別revision・別release判断へ分離した。
- Phase 8-2AとしてChartSetter split、Phase 8-2DとしてPrecomputedDataRepository split、Phase 8-2Eとしてreference/legacy importer監査とD10 validator/cache closure、Phase 8-2FとしてruntimeRuleValidation actual移行、Phase 8-2G1/G2/G3としてfacadeとcalculation barrelのimporter移行、Phase 8-2G4としてcalculation barrel削除、Phase 8-2G5としてcompatibility facadeと専用test削除、Phase 8-2G6として3つのdata calculator wrapper削除を完了し、legacy core/JSON/comparison削除を後続へ送った。
- Phase 8-2G1/G2/G3/G6では、tests・benchmark・experimentのrepository、calculation barrel、data calculator wrapper参照を各owner moduleへ直接移行し、G4ではcalculation barrel、G5ではcompatibility facadeと専用test、G6では3つのdata calculator wrapperを削除した。inventory、roadmap、todoのdocsも更新したが、production計算、generator、JSON、asset、Worker、API、MCP、入力上限、表示windowは変更していない。次はG7のlegacy comparison/migration依存整理である。

## Phase 8-2G7: legacy comparison / migration responsibility consolidation

G7では、canonical production経路を変更せず、legacy実装を必要とする比較・移行consumerを整理した。開始時点のproduction legacy importerは0件であり、legacy参照はテスト、ベンチマーク、実験だけに限定されていた。

### importer map and replacement coverage

| legacy consumer | classification | replacement or disposition |
| --- | --- | --- |
| `tests/calculator.test.js` | historical rule oracle | 削除。固定値、失敗、対決、Damage、Backtrackのcoverageは`canonicalCheck.test.js`、`canonicalDamage*.test.js`、`backtrackCanonical*.test.js`、`runtimeRuleValidation.test.js`へ集約した。 |
| `tests/dxDataMigration.test.js` | migration comparison | 削除。DXのexhaustive/reference、generator、simulation、canonical Score/rule testsをreplacementとする。 |
| `tests/damageMigration.test.js` | migration comparison | 削除。canonical Damage、RuntimeDamageRoll、generator、simulation、runtime rule testsをreplacementとする。 |
| `tests/backtrackMigration.test.js` | migration comparison | 削除。canonical finite-support、7種Dロイス rule oracle、generator D10/livingdead tests、simulationをreplacementとする。 |
| `tests/backtrackCanonical*.test.js`のlegacy比較 | migration comparison | 削除。presentationは明示的な境界値と`BACKTRACK_RULES`の契約だけを検証する。 |
| `tests/attackScoreDisplayAdapter.test.js`のlegacy score spy | fallback guard | 削除。production clientがcanonical Scoreだけを呼ぶ契約を検証する。 |
| `scripts/benchmark-calculators.mjs` | legacy-only benchmark | 削除し、package scriptも削除した。過去性能値はgit履歴と既存のruntime/full-tail benchmark記録で保持する。 |
| `tests/runtimeDamageOnDemand.test.js` | mixed legacy/runtime contract | canonical on-demandとRuntimeDamageRollのテストへ責務を集約し、legacy baselineを新しいoracleとして追加しない。 |
| `tests/legacyCanonicalComparison.test.js`、`src/calculation/LegacyCanonicalComparison.js` | dedicated comparison utility | G7では保持。G8でconsumerを削除してからutilityと専用testを削除する。 |

G7で削除したmigration testのcaseは、削除前のcoverage mapを上表のreplacement欄へ記録した。canonical actualとlegacy actualを新たなrule oracleとして比較するテストは追加していない。公開`public/data/schema-v2/revision-1/**`、dense JSON、legacy calculation source、Python generatorはG7では保持する。

G7の次段階は、専用comparison utilityとlegacy calculation APIを削除するG8である。G8ではG7で整理したreplacementがcanonical/runtime/generator側に存在することを前提に、sourceのlegacy exportを一括撤去する。

## Phase 8-2G8: legacy calculation surfaceの撤去（完了）

`ScoreCalculator.js`の`calculateScore`／`getScoreSummary`、`DamageCalculator.js`のlegacy request・on-demand・summary・total API、`BacktrackCalculator.js`の`calculateFinalEncroachment`を削除した。canonical API、runtime DR、D10／《屍人》生成器、published-bucket adapterは保持している。

legacy比較utility、専用比較テスト、`tests/legacy/LegacyCalculator.js`、旧core damageテストを削除し、canonical damage envelopeと独立したD10／《屍人》生成テストへ責務を移した。旧core Phase 2-H Node／browser benchmarkはlegacy比較を含むため退役し、canonical Attackおよびfull-tail resource benchmarkへ集約した。

G8後のproduction、test、benchmarkにlegacy計算APIのimporterはない。`runtime-dr/damage.js`の独立実験実装はG10のdead-code auditで扱う。公開`public/data/schema-v2/revision-1/**`、dense JSON、schema-v1、Python generatorはG8では保持する。

## Phase 8-2G9: dense JSONとschema-v1生成系の撤去（完了）

`src/data/dx.json`、`dr.json`、`d10.json`、`livingdead.json`、旧`tests/precomputedData.test.js`、`scripts/generate-precomputed-data.mjs`、`reference-data/schema-v1/`を削除した。これらはG8までの比較・移行証跡としてGit履歴に残り、現行の実行経路には含まれない。

`data:generate`と`data:check`は既存のコマンド名を保ったまま、`data:regenerate`／`data:verify-generator`を介してPython generatorへ委譲した。generatorのcurrent-asset testはschema-v2 revision-1を照合先とし、旧schema-v1には依存しない。公開`public/data/schema-v2/revision-1/**`は削除・変更していない。

G9検証: `npm run data:check`（32 assets）、`npm run generator:test`（18 passed / 13 deselected）、`npm run generator:lint`、`npm test`（56 files / 763 tests）が成功した。simulation、lint、build、smokeはG9最終gateで実行し、結果を次のclosure節へ記録する。

## Phase 8-2G10: 残存legacy/dead code監査とPhase 8 closure（完了）

G10では、G8・G9で削除されたAPI、dense JSON、schema-v1、変換scriptへのproduction importerが0件であることを再確認した。`src/calculation/DistributionResult.js`のpublished-bucket adapter、`src/components/Attack/LegacyChartSetter.js`の旧チャート形状、`src/data/Distribution.js`の`range`・collapse・shiftは、互換表示テストと既存利用箇所が残るため保持した。`src/data/ReferencePrecomputedDataRepository.js`と`src/data/D10PrecomputedDataRepository.js`も、それぞれ独立asset検証とproduction AttackのD10 lazy loadに必要なため保持した。Distribution/FFTの混在モジュールを、利用者不在という理由だけで分割・削除していない。

G8後にlegacy APIを参照していた動的範囲Phase 2-E／2-FのNode・ブラウザハーネス（`benchmark-phase2e.mjs`、`browser-benchmark.*`、`playwright-runner.mjs`、`vite.config.mjs`）と、未参照の`experiments/runtime-dr/damage.js`を退役した。planner、Nodeベースライン、`decision.md`、`results.json`は設計判断と実測の履歴資料として保持し、現行測定はcanonical Attack／full-tail benchmarkへ集約した。`benchmark:dynamic-distribution-ranges:browser`のpackage commandも削除したため、公開・開発コマンドから壊れたlegacy harnessを呼び出さない。

### G10の残存コード分類

| 分類 | 対象 | 判断 |
| --- | --- | --- |
| production keep | canonical Score／Damage／Backtrack、RuntimeDamageRoll Worker、RangePlanner、ResourceGuard、D10 repository | 現行UIとcanonical計算の実行経路。削除しない。 |
| compatibility keep | `DistributionResult`のpublished-bucket adapter、`LegacyChartSetter.js`、`Distribution.js`の互換symbol | `tests/attackDamageDisplayAdapter.test.js`とadapter testsが利用。利用者を移行してから別単位で削除する。 |
| reference keep | `ReferencePrecomputedDataRepository.js`、公開schema-v2/revision-1、Python generator、runtime-dr reference/optimized実装 | 独立検証、asset照合、再生成、性能測定に必要。公開assetは同一revision内で変更しない。 |
| historical keep | `experiments/dynamic-distribution-ranges/planner.mjs`、`benchmark.mjs`、`decision.md`、`results.json` | 過去の設計判断・測定を再現する資料。production import graphへ接続しない。 |
| deleted | legacy calculation API、比較utility、旧migration tests、dense JSON、schema-v1、旧JS generator、旧Phase 2-E／2-F harness、未参照runtime-dr統合prototype | 現行経路から到達不能またはG8／G9後に実行不能となったためGit履歴へ退役。 |

G10の最終監査では、`src`、`tests`、`scripts`のlegacy calculation API参照を0件（canonical名の部分一致とUIの`getTotalDamageExpectedValue`を除く）とし、`public/data/schema-v2/revision-1/**`に差分がないことを確認した。dynamic-rangeの旧コマンド参照は履歴文書内だけに限定し、現行package command、production build、test importerから除去した。

最終gate: `npm run check:node`、`npm test`（56 files / 763 tests）、`npm run generator:test`（18 passed / 13 deselected）、`npm run generator:test:simulation`（13 passed / 18 deselected）、`npm run generator:lint`、`npm run lint`、`npm run lint:markdown`（24 files / 0 issues）、`npm run build`、`npm run smoke:production`、`git diff --check`、`npm run data:check`（32 assets）が成功した。Phase 8ではcanonical production、公開schema-v2 asset、Python generator、必要なpublished-bucket互換だけを保持し、legacy計算・旧データ生成・壊れた実験経路を残さない状態になった。
