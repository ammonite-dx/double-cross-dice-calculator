# Refactoring Baseline

この文書は、後続のフロントエンド・アプリケーション層リファクタリングで比較対象とする現行構成を固定する。R0ではproductionコード、公開asset、依存関係、コンポーネントAPI、計算アルゴリズムを変更せず、現状の責務、データフロー、保護すべき動作、構造上の負債だけを記録する。

## 1. Baseline

| 項目 | 値 |
| --- | --- |
| Baseline branch | codex/canonical-default-migration |
| Baseline commit | 2770c2c87000c7d878a5e1bd81698c4781d0bbce |
| Baseline commit message | docs: record integrated yousei closure |
| Baseline date | 2026-09-01 |
| Purpose | 現行production architectureとbehavioral/numerical contractを固定し、後続refactorの差分判定に使う |

このbaselineは、Y1（DX生成時の《妖精の手》統合）を閉じた直後のHEADである。R0の成果物は調査記録のみとし、見つかった改善候補はR1以降へ送る。

## 2. Current Repository Architecture

| Directory | 現在の責務 | 主なconsumer | R0での評価 |
| --- | --- | --- | --- |
| src/application/ | 入力snapshot、非同期runner、latest-wins、resource feedback、CalculationClient、canonical presentation調整 | src/views/、一部UI | feature固有処理とruntime共通処理が同居。R9候補 |
| src/assets/ | ロゴ・画像などの静的asset | Home/layout | 現状維持 |
| src/calculation/ | DX、D10、Score、Damage、Backtrack、RangePlanner、DistributionResultなどの確率計算core | CalculationClient、DR Worker、tests | framework依存なし。保護対象 |
| src/components/ | Vueフォーム、入力パネル、チャート、サマリー | src/views/ | feature別だがstate mutationが一部親stateへ直接到達。R3〜R7候補 |
| src/data/ | 分布展開、FFT、色、公開schema、reference repository | calculation、application、UI、tests | probability math・theme・reference dataが混在。R8候補 |
| src/domain/ | 入力domainとバックトラックルール | planner、calculation、snapshot、repository | framework非依存。保護対象 |
| src/layouts/ | App bar、main area、navigation drawer | App.vue | app shell |
| src/plugins/ | Vuetify、font loader、routerの登録 | src/main.js | app bootstrap |
| src/presentation/ | canonical分布の表示用validation、chart series、summary、表示範囲計画 | application、chart components | canonical表示契約を保持。R6/R9で再評価 |
| src/router/ | SPA routeとlazy import | src/plugins/、main.js | route定義の正本 |
| src/styles/ | Sass設定 | Vite/Vuetify | 現状維持 |
| src/views/ | route単位の状態、runner接続、UI composition | router | Pageとcontrollerの責務が大きい。R3/R4/R7候補 |

generator/はPython 3.12のschema-v2事前計算・検証器であり、scripts/はNodeベースの検証・benchmark・browser smokeである。tests/はJavaScriptのcore、application、presentation、integration、reference検証を担当し、公開配布物には含めない。

## 3. Entry / Route Graph

productionの起動経路は、src/main.js → createApp(App) → registerPlugins(app) → app.provide(CALCULATION_CLIENT_KEY, calculationClient) → app.mount('#app') → App.vue → MainArea、AppBarArea、NavigationDrawerAreaである。

routerはsrc/router/index.jsでcreateWebHistoryを使い、次の4 routeをlazy importする。

| Path | Component |
| --- | --- |
| / | src/views/Home.vue |
| /check | src/views/Check.vue |
| /attack | src/views/Attack.vue |
| /backtrack | src/views/Backtrack.vue |

CALCULATION_CLIENT_KEYはsrc/application/CalculationClient.jsで定義され、main.jsがdefault clientをprovideし、Check・Attack・Backtrackの各viewがinjectする。DR Workerはsrc/application/RuntimeDamageRollClient.jsが必要時にRuntimeDamageRollWorker.jsをmodule Workerとしてlazy生成する。

Chart.jsの登録は一元化されておらず、CheckのScoreChart.vue、AttackのScoreChart.vueとDamageChart.vue、BacktrackのFinalEncroachmentChart.vueがそれぞれ必要なscale/pluginを登録する。Vuetifyはsrc/plugins/vuetify.jsで一度登録する。

## 4. Dependency Direction

R0の静的監査結果は次のとおりである。

| 監査対象 | 観測結果 | 分類 |
| --- | --- | --- |
| src/calculation/ → Vue/Vuetify/Chart.js/router | importなし | 期待どおり |
| src/domain/ → Vue/Vuetify/Chart.js/router/DOM/fetch | import・参照なし | 期待どおり |
| src/calculation/ → browser global/DOM/fetch | 参照なし | 期待どおり |
| src/calculation/ → src/data/Distribution.js、src/data/FFT.js | Score、Damage、DX、RangePlannerなどから参照 | 計算primitiveとして必要だが、配置はR8/R12候補 |
| src/application/ → calculation/domain/data/Worker | CalculationClientとpresentation調整に必要 | 期待どおり。ただしfeatureとruntimeの混在はR9候補 |
| src/views/ → calculation core | 直接importなし。CalculationClientをinject | 保護すべき境界 |
| src/components/ → calculation core/domain | 直接importなし。snapshot、ColorSetter、application helperを参照 | 概ね期待どおり |
| CheckCanonicalPresentation → ColorSetter | 表示色をapplication層が直接取得 | presentation/shared themeの境界候補 |
| ReferencePrecomputedDataRepository → fetch | 公開assetを明示的に読むreference経路のみ | production経路外、asset検証用途 |
| RuntimeDamageRollClient → Worker | browser runtime adapterとして使用 | core外の期待されたbrowser依存 |

保護する依存方向は次のとおりである。

View / Vue
  ↓
CalculationClient / application boundary
  ↓
calculation core + domain

R0で確認した範囲では、計算coreとdomainにVue、Vuetify、Chart.js、router、DOM、HTTP/fetchへのproduction依存はない。src/data/のprobability primitiveがcoreへ参照される点は機能上正しいが、将来のdirectory再編候補として記録する。

## 5. Feature Flows

### Check

Check.vue / InputPanel
  ↓ local draft + Vuetify validation
ScoreForm / DfcltyForm / SettingForm
  ↓ validated event
Check.vue state（dfclty、params、displayRequest）
  ↓ createCheck*Snapshot
createLatestCalculationRunner
  ↓ latest-wins / AbortSignal
CalculationClient.calculateCheckCanonical
  ↓ RangePlanner + ResourceGuard
DxCalculator → ScoreCalculator
  ↓ canonical score + typed summary
CheckCanonicalPresentation / presentation utilities
  ↓
ChartPanel / ScoreChart / SummaryPanel

入力またはdifficultyが変わるとviewがsnapshotを作ってrunnerへ渡す。表示windowだけが変わった場合は、既存scoreのsupport・overflowで安全に投影できればpresentationだけを作り直し、coverage不足や不確かなtailがwindowに重なる場合はdisplay windowを含む再計算を要求する。ResourceGuardのreject時は計算を開始せずfeedbackを表示する。

### Attack

Attack.vue / InputPanel
  ↓ nested attackData.combos
Attack InputForm / ComboForm
  ↓ local draft + validated event（一部nested mutationあり）
Attack.vue reactive state
  ↓ snapshotCanonicalAttackEntries
AttackCanonicalRunner
  ↓ latest-wins / abort / stale commit抑止
CalculationClient.calculateAttackCanonicalBatch
  ↓ RangePlanner + ResourceGuard
ScoreCalculator → runtime DX
  ↓
CanonicalDamageAggregation
  ├─ runtime D10（防御側）
  └─ RuntimeDamageRollClient → RuntimeDamageRollWorker（DR FFT）
  ↓
combo score/damage + total batch result
  ↓
AttackCanonicalPresentation / ChartSetter / SummaryTable
  ↓
ScoreChartPanel / DamageChartPanel / SummaryPanel

action・reactionの入力、combo操作、Score表示window、Damage表示windowはAttack.vueが所有するreactive stateへ反映される。Score/Damageの表示window変更は、既存batchを再利用できる場合はpresentation refreshだけを行い、coverage不足またはresource rejectの場合は該当laneを無効化する。計算要求は一つのlatest-wins runnerへ集約され、古いbatchはcommitされない。

### Backtrack

Backtrack.vue / InputPanel
  ↓ local draft + validated event
Backtrack.vue backtrackData.params
  ↓ createBacktrackInputSnapshot
BacktrackCalculationRunner
  ↓ latest-wins / AbortSignal
CalculationClient.calculateBacktrackCanonical
  ↓ RangePlanner + ResourceGuard
BacktrackCalculator
  ↓ complete finite support（D10 / 《屍人》）
BacktrackCanonicalPresentation
  ↓
FinalEncroachmentChartPanel / FinalEncroachmentChart

Backtrackは、入力snapshot、runner、計算結果、presentation、chartが比較的直線的に分かれている。表示windowや複数comboの状態を持たず、後続R3でfeature composableを設計するときの参照実装にできる。一方、Backtrack.vue自身がstate初期化・inject・runner生成・lifecycle接続を担当している点は、完全に薄いPageではない。

## 6. State Ownership

### Check

| State | 現在のowner | 書き換え元 | Derived / stored |
| --- | --- | --- | --- |
| difficulty（dfclty） | Check.vueのcheckData | DfcltyFormのvalidated eventをview handlerが反映 | stored |
| action/reaction score input | Check.vueのcheckData.params | ScoreFormのvalidated eventをview handlerが反映 | stored |
| display range/mode | Check.vueのdisplayRequest | SettingFormのvalidated eventをview handlerが反映 | stored |
| score result | Check.vueのcheckData.score | runnerのcommitResult | stored calculation result |
| score summary | Check.vueのcheckData.scoreSummary | runnerのcommitResult | stored calculation result |
| range/display feedback | Check.vueのrangeFeedback、displayFeedback | view helper、runner、ResourceGuard結果 | stored feedback |
| latest request | createCalculationRequestCoordinator内部 | runnerのrun/invalidate | orchestration state |
| chart/presentation | Check.vueのcomputed presentation | checkData.scoreとdisplayRequestから導出 | derived |

### Attack

| State | 現在のowner | 書き換え元 | Derived / stored |
| --- | --- | --- | --- |
| combo list | Attack.vueのattackData.combos | InputForm.vueがprops objectを直接push/splice | stored; child mutationあり |
| combo name | attackData.combos[*].name | InputForm.vueのnested v-model | stored; child mutationあり |
| expanded/collapsed | combo.show | InputForm.vueのclick handler | UI state; child mutationあり |
| action/reaction input | combo.data.params | AttackForm/DefenceFormのlocal draft → ComboForm → replaceAttackSideSnapshot | stored; nested object mutationあり |
| score/damage display request | Attack.vueのdisplayRequest、scoreDisplayRequest | 各SettingFormのvalidated eventをview handlerが反映 | stored |
| canonical score/damage result | combo.data内canonical fields | AttackCanonicalRunnerとAttackCanonicalState | stored calculation result |
| total damage result | attackData.canonicalTotalDamagePresentation等 | runner/state commit | stored calculation result |
| range plan | combo canonical state、runner batch metadata | CalculationClient/RangePlanner | stored metadata |
| feedback | attackData.canonicalDisplayFeedback、canonicalScoreDisplayFeedback | view helperとrunner callbacks | stored feedback |
| latest request | AttackCanonicalRunner内のlatest runner/coordinator | run、invalidate、refreshPresentation | orchestration state |
| chart/presentation | Attack.vue computed presentation | canonical stateからpresentation adapterが導出 | derived/stored presentation |

Attackのbusiness stateと計算結果が同じattackData treeへ格納され、フォームの一部が親のnested objectを直接変更する。後続R7でcontroller/composableと入力eventの単一方向化を検討する。

### Backtrack

| State | 現在のowner | 書き換え元 | Derived / stored |
| --- | --- | --- | --- |
| input params | Backtrack.vueのbacktrackData.params | BacktrackFormのvalidated eventをview handlerが反映 | stored |
| final encroachment result | backtrackData.finalEncroachment | BacktrackCalculationRunnerのcommit | stored presentation |
| result readiness | backtrackData.resultReady | runnerのcommit/invalidate | stored |
| range feedback | backtrackData.rangeFeedback | runner/CalculationFeedback | stored feedback |
| latest request | runner内部のcreateLatestCalculationRunner | run/dispose | orchestration state |
| chart | FinalEncroachmentChartPanel以下 | finalEncroachmentからcomponentが導出 | derived |

## 7. Duplication Inventory

### Score入力・validation

| Rule | Domain正本 | Attack UI | Check UI | 観測 |
| --- | --- | --- | --- | --- |
| safe integer | InputDomain.isSafeInteger等 | AttackForm.vue、DefenceForm.vue、ScoreSettingForm | ScoreForm.vue | UI message/ruleを重複定義 |
| dice >= 0 | assertNonNegativeSafeIntegerの適用 | Attack/DefenceのdiceRule | ScoreFormのdiceRule | representation validationとdomain validationが別実装 |
| critical 2..11 | InputDomain.isCriticalValue | Attack/DefenceのcriticalRule | ScoreFormのcriticalRule | 同じ境界を3系統で記述 |
| yousei >= 0 | InputDomainのsupported feature assertion | Attack/DefenceのyouseiRule | ScoreFormのyouseiRule | 表示文言と同時利用制約をUI側で重複 |
| shihai >= 0 | InputDomainのsupported feature assertion | Attack/DefenceのshihaiRule | ScoreFormのshihaiRule | 同上 |
| yousei + shihai | assertSupportedScoreFeatures | Attack/Scoreの両UI | CheckのScoreForm | unsupported combinationをUIとcoreが別々に検証 |
| damage dice/value/kazanari | calculator/domain適用 | Attack/Defence forms | Checkにはなし | Attack側で同様のrule配列が重複 |

UIはVuetifyのv-formに対してローカルdraftを持ち、watchで非同期validateし、generationまたはcreateLatestValidationGateで古い結果を捨てる。CheckのScoreForm、DfcltyForm、SettingForm、AttackのAttackForm、DefenceForm、ScoreSettingForm、DamageSettingForm、BacktrackFormで同種のwatch・draft・validation generationが重複している。共通化はR5で行う。

### Attack child-to-parent mutation

R0で確認した具体的な箇所は次のとおりである。いずれもR0では修正しない。

| File | Mutation | 分類 |
| --- | --- | --- |
| src/components/Attack/InputForm.vue | props.attackData.combos.splice(...)、push(...) | props objectのnested mutation |
| src/components/Attack/InputForm.vue | combo.nameのv-model、combo.show = true/false | childから親owned combo propertyを直接変更 |
| src/components/Attack/InputForm.vue | combo.showDetails[side].value = value | nested UI state mutation |
| src/components/Attack/ComboForm.vue | replaceAttackSideSnapshot(props.comboData.params, side, snapshot) | props配下のparamsを関数経由で変更 |
| src/components/Attack/AttackForm.vue、DefenceForm.vue | local currentParamsを変更し、validated eventをemit | 望ましいlocal draft境界。ただし親側の受け取り先はnested object |

### Chart・presentation

CheckとAttackのLine chartは、Chart.register、vue-chartjs Line wrapper、tooltip/axis/options/style、確率表示変換を個別に持つ。BacktrackはDoughnut chartと別optionsを持つ。ChartSetter.jsもCheck、Attack、Backtrackで分かれ、色取得はsrc/data/ColorSetter.jsを複数箇所から参照する。共有化はR6候補だが、既存チャートの見た目を変えないことをAcceptanceにする。

### src/data responsibility

| File | 責務 | production importer | test/reference importer | 候補 |
| --- | --- | --- | --- | --- |
| ColorSetter.js | combo/side chart color | Attack/Check chart・入力、Check presentation | presentation test | shared/themeまたは現状維持 |
| Distribution.js | sparse展開、shift、upper-tail、legacy output size定数 | calculation/application/presentation | tests/experiments | core/probability。一括削除不可 |
| FFT.js | 分布のconvolution/subtraction | DX、Damage、Canonical aggregation、RangePlanner | FFT/runtime tests、experiments | core/probability。一括削除不可 |
| PrecomputedDataSchema.js | schema-v2 sparse asset検証 | productionから直接参照なし | Reference repository | tests/support/reference-data候補 |
| ReferencePrecomputedDataRepository.js | 公開assetのfetch、validation、cache、独立比較 | production clientへ注入なし | Backtrack/reference tests、明示的verification | tests/support/reference-data候補 |

### Canonical / Legacy terminology

Canonicalは現在のproduction result・presentation・runnerの意味を持つため、単なる古い名前ではない。AttackCanonical*、CheckCanonicalPresentation、BacktrackCanonicalPresentation、CanonicalDamageAggregationは現行契約としてR0では保持する。Legacy、published-bucket、fromPublishedBucketDistribution、toPublishedBucketDistributionは互換・比較・履歴境界を表す。productionの主経路では使わないが、schema/reference・boundary testに必要なものがあるため、R11でsymbol単位に再評価する。

## 8. Runtime / Worker Boundary

CalculationClientは入力snapshotを受け、RangePlannerで実行範囲とresource estimateを計画し、ResourceGuardでleaseを取得してからcoreを呼ぶ。DX、通常D10、Backtrackはruntime coreをメインスレッドで実行する。AttackのDR FFT本体だけが常駐RuntimeDamageRollClientを介してWorkerへ移る。

CalculationClient（main thread）
  ├─ runtime DX / Score
  ├─ runtime D10 / defence
  ├─ canonical Backtrack
  └─ RuntimeDamageRollClient
        └─ RuntimeDamageRollWorker
              └─ RuntimeDamageRollCalculator + RuntimeDamageRollFFT

Worker requestは{id, weights, kazanari, options}で、optionsにはfftLength、distributionLength、rawSupportMaxが含まれる。WorkerはFloat64Arrayをtransferし、client側で長さ、有限性、非負性、期待総和を検証する。clientは同一requestのpending dedupeと最大8件のLRU cacheを持つ。

RuntimeDamageRollClient.calculateはAbortSignalを受け取り、abort時はAbortErrorとして待機promiseだけをrejectする。Worker errorまたはmessageerror時はWorkerをterminateし、pending requestをrejectして次回要求時に再生成する。disposeでもcacheとWorkerを解放する。上位のlatest-wins coordinatorは新しい要求のcommitだけを許可し、古いrequestの結果がview stateへ戻らないようにする。Worker protocolとこのキャンセル境界は保護対象である。

## 9. Calculation Core Inventory

| Module | 主責務 | production consumer | framework dependency | 後続候補 |
| --- | --- | --- | --- | --- |
| DxCalculator.js | クリティカル判定のDX分布、yousei/shihai、tail certificate | CalculationClient、RangePlanner | なし | R12（大きいため必要箇所のみ分割） |
| D10Calculator.js | 通常D10合計の完全有限support | CalculationClient、Backtrack、Damage | なし | core維持 |
| ScoreCalculator.js | DXと技能値を合成したScore、success summary | CalculationClient | なし | R12候補 |
| DamageCalculator.js | canonical damage roll request、Score/D10/DR/fixed value合成、summary | CalculationClient | なし | R12候補 |
| CanonicalDamageAggregation.js | 複数combo Damageの計画・畳み込み・total | CalculationClient | なし | R12候補 |
| BacktrackCalculator.js | D10/《屍人》の完全有限supportと最終侵蝕率 | CalculationClient、runner | なし | R3参照後に必要なら分割 |
| DistributionResult.js | support、overflow、expected value、legacy projectionの契約 | application、calculation、presentation | なし | R12候補。canonical境界として保護 |
| RangePlanner.js | Score/Damage/Backtrackのworking range、FFT、resource estimate | CalculationClient、presentation | なし | R12候補。最初に分割しない |
| RuntimeDamageRollCalculator.js | kazanariを含むDR weightsのruntime生成 | DR Worker | なし | runtime contract維持 |
| RuntimeDamageRollLimits.js、BacktrackLimits.js | 絶対安全上限とestimate | calculators、RangePlanner | なし | policy整理は後続 |

計算coreはVueやDOMを参照しないが、Distribution.jsとFFT.jsがsrc/data/に置かれている。これは責務上の配置負債であり、計算意味論の変更を意味しない。

## 10. Asset Contract

公開assetはpublic/data/schema-v2/revision-1/に置かれている。R0時点でファイルは33個あり、32個のdata assetとmanifest.jsonで構成される。schema versionは2、data revisionは1である。

public/data/schema-v2/revision-1/
  d10.json
  livingdead.json
  manifest.json
  dx/shihai-0.json ... dx/shihai-19.json
  dr/kazanari-0.json ... dr/kazanari-9.json

現行production browser smokeでは、Check・Attack・Backtrackの全ケースでprecomputed asset requestが0、D10 asset requestが0だった。productionのCalculationClientはruntime DX/D10、DR Worker、Backtrack coreを使い、ReferencePrecomputedDataRepositoryはテスト・独立比較・明示的検証に限定される。assetをR0で削除しない。同じrevisionのassetを変更せず、変更時は新revisionを作る方針は維持する。

再生成と検証の正本はgenerator/のPython packageであり、次のscriptが使われる。

npm run data:regenerate
npm run data:check
npm run data:verify-generator
npm run generator:test
npm run generator:test:simulation
npm run generator:lint

## 11. Behavior Baseline

### Check

保護するbehaviorは、通常計算、PMF、upper-tail、対決判定、difficulty、display range変更、100D、resource rejectionとrecovery、《妖精の手》、critical=11、failure/fumbleである。主な安全網はcanonicalCheck.test.js、checkCanonicalPresentation.test.js、checkSummaryTable.test.js、calculationClientIntegration.test.js、production browser smokeである。

### Attack

保護するbehaviorはcomboの追加・複製・削除・名前変更・開閉、action/reaction、Score/DamageのPMF・upper-tail、total damage、表示範囲0..100・0..1200・1000..1200、99D/critical=2、100D、>202D、防御100D、《妖精の手》統合Score、resource rejectionとrecovery、latest-winsである。Score-only refresh、Damage refresh、total aggregation、DR Worker、D10 defenceのlease解放も含む。

### Backtrack

保護するbehaviorは通常ケース、残存ロイス0..7、Eロイス100、その他減少量100D、固定減少値、対応するDロイス7分類、chart表示、resource rejectionである。backtrackCanonical.test.js、backtrackCanonicalIntegration.test.js、runtimeRuleValidation.test.js、browser smokeが安全網である。

### Production browser smoke evidence

2026-09-01のnpm run smoke:productionでは、build済みVite previewをPlaywright Chromiumで確認した。

| Case | 結果 |
| --- | --- |
| Check初期・100D | canvas 1、precomputed request 0 |
| Attack defense=0・1 | 各canvas 2、precomputed request 0、D10 request 0 |
| Attack action/attack/defence dice=100 | canvas 2、precomputed request 0、D10 request 0 |
| Backtrack Eロイス/その他減少量=100 | canvas 3、precomputed request 0 |
| 全case | console warning/error 0、same-origin HTTP error 0、計算結果commitを確認 |

## 12. Input / Numerical Contracts

正規入力domainはsrc/domain/InputDomain.jsとsrc/domain/BacktrackRules.jsにある。現行契約は次のとおりである。

| 入力 | 契約 |
| --- | --- |
| critical | safe integer、2..11 |
| remaining Lois | integer、0..7 |
| dice counts | 非負safe integer。固定ゲーム上限はなく、RangePlanner/ResourceGuardが実行可能性を判定 |
| yousei、shihai、kazanari | 非負safe integer。yousei > 0とshihai > 0の同時利用は現行unsupported |
| skill、attack fixed、defence fixed | safe integer。負値を許容 |
| difficulty | 非負safe integer |
| current encroachment | safe integer。アプリ上は負値も許容 |
| Eロイス・その他減少量 | 非負safe integer |

表示・数値契約は次のとおりである。

- canonical coreはsupport、overflow、position uncertainty、numerical residual、first-moment/expected-value certificateを保持する。
- chartの確率表示は0.1 percentage pointを基本精度とし、DISPLAY_PROBABILITY_TOLERANCE = 5e-4を表示projectionの許容範囲として使う。
- 位置不明tailやDamage output overflowが表示windowと重なる場合、確率を0として隠さず、再計算またはnot-projectableとする。
- exactな期待値を保証できないScore/Damage/TotalはUIで—とし、coreの確率情報を破棄しない。
- legacy published bucketの長さ1024、overflow index 1023、旧比較境界1022/202Dはcanonical productionの入力・表示上限ではない。

詳細はdocs/dice-rules.md、docs/runtime-calculation-algorithms.md、docs/precomputation-validation.md、docs/adr/0001-expanded-working-distributions.mdを参照する。

## 13. Test Responsibility Matrix

| Refactor target | Primary safety tests |
| --- | --- |
| domain/rule contract | runtimeRuleValidation.test.js、checkInputSnapshot.test.js、Backtrack tests |
| numerical calculation core | calculationCore.test.js、dxOnDemand.test.js、d10Calculator.test.js、fft.test.js、canonicalDamageOnDemand.test.js |
| DX / Yousei | dxYousei.test.js、dxOnDemand.test.js、canonicalCheck.test.js、Attack integration |
| RangePlanner / ResourceGuard | rangePlanner.test.js、displayRangePlanner.test.js、resourceGuard.test.js |
| CalculationClient / orchestration | calculationClient.test.js、calculationClientIntegration.test.js、canonicalAttackBatchClient.test.js、canonicalTotalDamageClient.test.js |
| presentation | canonicalChartSeriesAdapter.test.js、distributionPresenter.test.js、checkCanonicalPresentation.test.js、backtrackCanonicalPresentation.test.js |
| Attack state flow | attackCanonicalDisplayIntegration.test.js、attackCanonicalDisplayPresentation.test.js、calculationClientIntegration.test.js、browser smoke |
| Worker/runtime | canonicalAttackRuntimeWorkerContract.test.js、runtimeDamageRollProduction.test.js、integration cancellation tests |
| Backtrack feature | backtrackCanonical.test.js、backtrackCanonicalIntegration.test.js、browser smoke |
| reference asset/generator | precomputedAssets.test.js、referencePrecomputedDataRepository.test.js、generator/tests/ |
| chart refactor | presentation tests、chart adapter tests、production browser smoke |

現行JavaScript test suiteは59 test files、790 testsである。Python generator suiteは通常18 passed / 13 deselected、simulationは13 passed / 18 deselectedである。テスト件数そのものではなく、各semanticに対応する独立oracleとboundary testを保護する。

## 14. Module Metrics

行数とbyte sizeは2026-09-01のbaseline treeで測定した。production importer countはsrc/内でmodule名を参照するファイル数の静的目安であり、分割の必要性を単独で決める指標ではない。

| Module | Lines | Bytes | Export declarations | Production importer files |
| --- | ---: | ---: | ---: | ---: |
| src/calculation/RangePlanner.js | 1,750 | 50,981 | 8 | 10 |
| src/calculation/CanonicalDamageAggregation.js | 1,642 | 47,497 | 12 | 1 |
| src/calculation/DistributionResult.js | 918 | 28,094 | 23 | 12 |
| src/calculation/DamageCalculator.js | 858 | 25,858 | 3 | 1 |
| src/calculation/ScoreCalculator.js | 843 | 23,815 | 4 | 1 |
| src/calculation/DxCalculator.js | 1,030 | 29,184 | 12 | 2 |
| src/views/Attack.vue | 432 | 16,732 | 0 | 1 route importer |
| src/views/Check.vue | 369 | 13,233 | 0 | 1 route importer |
| src/application/AttackCanonicalRunner.js | 645 | 21,372 | 2 | 2 |
| src/application/AttackCanonicalPresentation.js | 1,375 | 39,494 | 10 | 3 |

特にRangePlanner、CanonicalDamageAggregation、AttackCanonicalPresentationは大きいが、現時点では数値・resource契約を直接支えるためR0で分割しない。R12で責務境界とtest coverageを確認してから必要箇所だけ分割する。

## 15. Known Structural Debt

R0で発見した構造上の負債はすべてP2（計画済みrefactor debt）であり、baseline時点のP0/P1 correctness blockerはない。

| Debt | Evidence | Severity | Routing |
| --- | --- | --- | --- |
| Attack childが親owned reactive objectを直接mutation | InputForm.vueのcombo push/splice、nested v-model、ComboForm.vueのparams更新 | P2 | R7 |
| Check/Attack/BacktrackのPageがstateful controller化 | view内にsnapshot、feedback、runner、lifecycle、presentation接続が同居 | P2 | R3/R4/R7/R9 |
| Score入力・validationの重複 | Attack/Check formsでrule、draft、watch、generationが重複 | P2 | R5 |
| Chart登録・options・styleの重複 | Check/Attack/Backtrack各chart component/setter | P2 | R6 |
| src/data/の責務混在 | probability math、theme、schema、reference repositoryが同居 | P2 | R8 |
| application/presentationのfeature共通責務混在 | CalculationClient、runner、feedback、presentationが同一directoryに集中 | P2 | R9 |
| Canonical命名のmigration痕跡 | production唯一経路になった後もCanonical prefixが残る | P2 | R11 |
| 大型core module | RangePlanner等の責務が大きい | P2 | R12 |

## 16. Tooling Debt

### Native Node ESM verifier

対象はnpm run verify:runtime-dxとscripts/verify-runtime-dx.mjsである。入口scriptは拡張子付きimportを使うが、そこから参照されるproduction sourceに拡張子なしの内部ESM importがあり、native Node.jsではmodule resolution failureが発生する。失敗はDX計算の開始前であり、Y1の計算結果やbrowser bundleの失敗ではない。

native Node ESM
  ↓
verify-runtime-dx.mjs
  ↓
DxCalculator.js
  ↓
extensionless internal import
  ↓
module resolution failure
  ↓
runtime-DX verification未開始

R0では修正しない。R1でTypeScript moduleResolution、明示的.js extension、bundled runner、Node-compatible import policyのいずれを採用するか決める。verify:runtime-dxはR0のGREEN gateに含めない。

### Yousei helper duplication

DxCalculator.jsとRangePlanner.jsにはnegative-binomial、max geometric tail、exact-yousei modelに関する数学helperがそれぞれ存在する。現状は同じ入力を異なる責務で扱う正しい実装であり、correctness bugではない。共通probability helper候補としてR12で再評価する。

### DX provider positional API

runtime DX providerの内部呼び出しには、getDxDistribution(shihai, dice, critical, options, yousei)というmigration-shaped positional APIが残る。現状動作しているためR0では変更せず、R1/R9でobject API化の費用と境界を判断する。

## 17. R1-R12 Routing

| Phase | 送る課題 | R0での判断 |
| --- | --- | --- |
| R1 | TypeScript基盤、native Node ESM verifier、DX provider APIの型付き契約 | R0ではtypecheck導入・import一括変更をしない |
| R2 | app/core/runtime/sharedの依存方向をlint・directoryで固定 | 現在の依存監査のみ |
| R3 | Backtrackをroute composableへ移し、後続feature refactorの参照実装にする | 計算意味論とchart契約を維持 |
| R4 | Checkのstateful viewをcomposable/controllerへ分離 | display再利用・再計算契約を維持 |
| R5 | Score/Damage入力、validation、latest validation gateの共通化 | domain制約とUI文言を混同しない |
| R6 | Chart登録、options、series adapter、確率formatterの共通化 | 既存見た目と0.1%表示精度を維持 |
| R7 | Attack state ownership、props mutation、combo controllerの再設計 | Attackのlatest-wins/resource/cancelを保護 |
| R8 | src/data/のprobability math/theme/reference data分離 | assetと再生成手順を一括削除しない |
| R9 | application/とpresentation/のfeature/runtime責務整理 | CalculationClient境界を保護 |
| R10 | 内部objectの過剰reflection validationとruntime validationの整理 | 数値invariant、Worker、untrusted input検証は残す |
| R11 | Canonical prefixとmigration terminologyの段階的rename | directory/state移行の最後に行う |
| R12 | RangePlanner等のcore module分割、Yousei helper共通化 | numerical/resource contractと独立oracleを先に固定 |

公開assetのrevision更新、Cloudflare Worker、HTTP API、MCP、API専用viewer化はこのR0のrouting対象外であり、別のpublication/release判断とする。

## 18. Baseline Verification

2026-09-01にbaseline HEADで次のgateを実行し、すべて成功した。

| Gate | 結果 |
| --- | --- |
| npm run check:node | Node.js 22.23.2が.node-versionとengineに一致 |
| npm run data:check | 32 assets verified |
| npm run data:verify-generator | 32 assets verified |
| npm test -- --run | 59 files / 790 tests passed |
| npm run generator:test | 18 passed / 13 deselected |
| npm run generator:test:simulation | 13 passed / 18 deselected |
| npm run generator:lint | Ruff all checks passed |
| npm run lint | ESLint passed |
| npm run lint:markdown | 24 files / 0 issues |
| npm run build | Vite production build passed |
| npm run smoke:production | production browser smoke passed |
| git diff --check | passed |

npm run verify:runtime-dxは前述のnative Node ESM module-resolution debtのため、R0 GREEN gateには含めていない。R0ではnpm run typecheckもまだ導入していないため実行対象外であり、R1のTypeScript基盤タスクへ送る。

## R1 Handoff

Baseline SHA: 2770c2c87000c7d878a5e1bd81698c4781d0bbce

Full gate: GREEN（上記18節の記録を参照）

P0: 0

P1: 0

P2: Attack child mutation、入力validation重複、Chart重複、src/data/混在、Page/controller混在、Canonical命名、core module規模、native Node ESM verifier、Yousei helper重複、DX positional provider API

First TypeScript candidates: InputDomain、snapshot/request契約、DistributionResult、RangePlan、Worker request/response

Module-resolution debt: native Node ESM verifierが拡張子なし内部importで起動前に停止する。R1で方針決定する。

Dependency rules to enforce: ViewはCalculationClient/application boundaryを介してcoreを利用し、calculation/とdomain/はVue、Vuetify、Chart.js、router、DOM、HTTP/fetchを参照しない。

Protected behavioral contracts: Check/Attack/Backtrackの入力、latest-wins、resource rejection/recovery、AbortSignal、Score/Damage/Total/Backtrackのcanonical result、既存chartとsummary、production smokeのasset request 0。

Protected numerical contracts: support/overflow/position uncertaintyの保持、expected-value certificate、0.1%表示精度と5e-4 tolerance、legacy published-bucketはcompatibility用途のみ、計算coreの確率総和・非負性・有限性。
