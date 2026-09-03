# Canonical migration roadmap

この文書は、Attack、通常のCheck、バックトラックの計算結果をcanonical resultへ段階的に移行するための設計判断と実装順序を記録する。移行中は既存のlegacy表示を比較用の安全網として残すが、完了時にはdebug panel、legacy計算、固定1024表示、legacy fallbackを削除し、既存チャート・サマリーの見た目だけを維持する。

## 現在地

- `RangePlanner` と `ResourceGuard` による実行前の範囲計画・資源制限があり、`DistributionResult` がsupport、explicit maximum、overflowを保持するcanonical境界になっている。
- Attackのproduction UIはcanonical batch/presentationを既定経路として、Score/Damage chartとSummaryへ接続済みである。production AttackのScore→Damageは`full-tail`で、Damage rangeはaction canonical Scoreの`outputMax`から計画し、reaction Scoreの大きさに依存しない。canonical metadata、support、overflow、通常の不確かさは通常UIへ明示せず、保証できないsummary値は`—`とする。CalculationClient legacy APIとclient-level比較fixtureはcleanup第2単位で削除した。legacy core、旧dense JSON、schema-v1、旧JS generator、旧Attack chart adapterもG7〜G10とRelease hardening closure follow-upで撤去済みであり、現行treeに残るのはcanonical core、公開schema-v2、Python generator、published-bucketやrounding aliasなどの参照・互換用fixtureと歴史記録である。
- Phase 1は`b72b709`、`4ad088e`、`26174a0`、`3df496c`で完了した。Check、バックトラック、canonical Attack batchが共通coordinatorの最新要求境界、入力snapshot、stale commit防止を共有している。
- 通常のCheck、バックトラック、Attackはcanonical resultを既存表示経路と既定経路へ接続済みである。Attackの初期計算、validated input、combo操作は同じlatest-wins canonical runnerを使い、`/attack` routeのpreloadは行わない。
- CheckのSummaryはcanonical typed summaryを既定表示経路とし、production Checkから1024 published projectionとlegacy `getScoreSummary`依存を除去した。Attackのcanonical summary formatterは共有presentation utilityとしてCheckでも再利用している。
- BacktrackとAttackのcanonical default化はPhase 7の実装単位として完了した。full-tail Attackのresource planning・cost model校正・Chrome desktop/CPU 4x受入は`8c7d10c`で完了し、action-only damage range assertionを`569c278`で整合させた。production warning/hard thresholdは50/200msを暫定維持する。PRをacceptance gateにしない現在のsolo developmentでは、repository workflow相当のローカルgateを最終HEADで実行する。Phase 7、Phase 8-1 inventory、Phase 8-2A〜2F、Phase 8-2G1〜2G6に加え、G7（legacy comparison/migration dependency consolidation）、G8（legacy calculation surface retirement）、G9（dense JSON・schema-v1・旧JS generator retirement）、G10（残存legacy/dead code監査とPhase 8 closure）も完了している。1024は事前計算・固定長配列由来の比較用上限であり、legacy/published-bucket比較境界であってcanonical schemaや最終production表示の上限とはしない。
- AttackのScore/Damage表示範囲は999上限を撤廃し、任意の非負safe integerを受け付ける。`0..100`、`0..999`、`0..1000`、`0..1023`、`0..1024`、`0..1200`、`1000..1200`、`0..20000`の入力・coverage・resource判定を回帰テストで固定し、単一点`min === max`も有効とした。表示点数・メモリ・計算量のresource plannerによるrejectは維持する。Runtime DRのrange/FFTとfull-tail Damage rangeもplannerから動的に導出し、202Dをproduction semantic capとして扱わない。`CalculationClient.planAttackCombo()`ではaction `dice=99`・`critical=2`から`scoreValueUpperBound=2271`、`maxDamageDice=228`、`rawSupportMax=2280`、`workingLength=1024`、`fftLength=4096`、`accepted=true`、拒否理由なしを観測した。
- `d30b3d1`ではfull-tail overflowの位置契約を修正し、Score尾部由来の位置不明massは`lowerBound=0`、Damage出力だけの右側overflowは最終出力境界をlower boundとするよう分離した。続く表示層の修正では、`projectionUncertainty.positionUnknownProbabilityUpperBound`を追加し、確率表示の半刻み`5e-4`以下の位置不明tailだけをUI表示精度内の誤差としてchart projectionから省略できるようにした。この閾値は丸め結果が常に完全一致することを意味しない。Damage出力overflowは別の`outputOverflowLowerBound`で保持し、表示windowと重なる場合は従来どおり再計算または`not-projectable`とする。Node integrationでは通常およびaction/reaction双方の`99D/critical=2`について`Damage 0..100`、`0..1200`がPMFでreadyとなり、PMF/upper-tailの小tail、resource rejection、mixed tailを回帰テストで確認した。2026-08-25のin-app Chromium実測では、通常AttackのPMF/upper-tail `0..100`、action/reaction双方`99D/critical=2`のPMF/upper-tail `0..100`とPMF `0..1200`、通常AttackのPMF `1000..1200`がcanvas 2・alertなし・console warn/error 0で表示できた。`0..20000`はresource rejection、`0..100`への復帰はcanvas 2・alertなしで確認した。
- Productionの`CalculationClient`はScore/Backtrackのcanonical計算コアを直接参照する。Score、Damage、Backtrackのdata calculator wrapperはPhase 8-2G6で削除し、全consumerをcoreと明示的なrepository依存へ移行した。
- 完了（R4 Check featureization、2026-09-03、実装最終 `8bf71ea`）: Check固有のsnapshot、presentation、controller、display orchestration、UIを`src/features/check`へ移し、`src/views/Check.vue`を薄いroute adapterにした。`useCheck`はCalculationClientを注入し、初期canonical計算、validated input、latest-wins、Abort、表示windowのREUSE／RECALCULATE／RESOURCE_REJECTED／NOT_PROJECTABLE、同一windowのloop guard、disposeを維持する。旧application・components path、広い`checkData` prop、旧import、modelの明示的な`any`は退役・禁止し、構造テストとfull gateで依存境界を固定した。production browser smokeでは対決ON／OFF、PMF／upper-tail、`99D/critical=2`、resource rejectionからの復帰まで確認した。詳細は[`refactoring-check-feature.md`](./refactoring-check-feature.md)を参照する。R5でCheckとAttackの入力validation・form contract共通化を完了した。
- 完了（R5 Shared Input Validation、2026-09-03、実装最終 `0d31e4f`）: `src/shared/validation`にVue非依存のIntegerRules、ScoreInputRules、DisplayRangeRules、LatestValidationGateを追加し、Check／AttackのScore・表示範囲validationと全フォームのasync latest-wins gateを移行した。InputDomainを数値domainとsafe-integer predicateの正本として再利用し、shared validationから`data/**`と`node:*`への依存を禁止した。yousei／shihai同時指定、負のskill、critical 2..11、single-point range、`0..20000`のform-valid／resource-rejected契約を維持し、構造テスト、production browser smoke、full project gateで確認した。詳細は[`refactoring-shared-validation.md`](./refactoring-shared-validation.md)を参照する。次はR6 Shared Probability Chart Infrastructureとする。
- 完了（R6 Shared Probability Chart Infrastructure、2026-09-03、実装最終 `811c9c4`）: Check Score、Attack Score、Attack DamageのChart.js登録、vue-chartjs Line wrapper、Vuetify breakpoint style、共通optionsを`src/shared/chart`へ集約し、Check固有の難易度annotationはfeature側に残した。0.1%表示丸めは`src/presentation/ChartPercentages.js`へ移し、CheckのFloat64ArrayとAttackのowned Array、既存props・data adapter、Backtrack Doughnutを維持した。shared chartの依存境界と3 consumerの直接依存禁止を構造テスト／ESLintで固定し、full project gateとproduction browser smokeを確認した。詳細は[`refactoring-shared-chart.md`](./refactoring-shared-chart.md)を参照する。次はR7 Attack featureizationとする。
- 完了（R7 Attack featureization、2026-09-03、実装最終 `32e2118`）: `src/features/attack`へAttackのcontroller、combo state、Page、UIを移し、`src/views/Attack.vue`を薄いroute adapterにした。`useAttack`が初期値、comboのadd／duplicate／remove、monotonic id、validated snapshot、表示request、canonical計算、feedback、presentation、lifecycleを所有し、入力変更だけを明示的に再計算する。UIからnested props mutation、`v-model="combo.name"`、広い`attackData` prop、旧`src/components/Attack` pathを撤去し、chartとsummaryには必要なcombos・presentationだけを渡す。既存のAttackCanonicalRunner、CalculationClient、latest-wins、Abort、resource planning、チャート／サマリー表示契約、Backtrack、計算coreは変更していない。構造テスト、full project gate、production browser smokeをGREENで確認した。詳細は[`refactoring-attack-feature.md`](./refactoring-attack-feature.md)を参照する。R7は`CLOSED / GREEN`とし、次はR8 `src/data/`のprobability math、theme、reference data責務分離の設計判断とする。
- 完了（R7 closure follow-up、2026-09-03、最終実装 `5b4ad75`）: `44c1b4f`でAttack controllerのreaction snapshot、表示reuse／recalculation／resource rejection、Score-only rejection時のDamage保持、latest-wins、dispose後stale抑止を直接テストし、`30febb2`でテストが示した凍結display requestのmutable snapshot初期化を最小修正した。`5b4ad75`でproduction browser smokeへaction／reaction入力とcombo add／rename／duplicate／removeを追加し、結果commit、canvas 2、schema-v2／D10 request 0、browser diagnostics 0を確認した。Follow-up後のfull gateはVitest 69 files／857 tests、data 32 assets、generator／simulation、Ruff、typecheck、ESLint、Markdown lint 32 files／0 issues、runtime DX 20,000 cases、build、production smoke、`git diff --check`のすべてGREENで、P0／P1／P2は0件である。詳細は[`refactoring-attack-feature.md`](./refactoring-attack-feature.md)を参照し、次はR8とする。

## Release hardening (RH1--RH6)

- RH1完了（`874119c`）: `docs/dice-rules.md`へ正規入力domainを追加し、`src/domain/InputDomain.js`で安全な整数、critical、残存ロイス、対応featureの検証を共有した。旧JSONやフォームの上限は正規domainから分離した。
- RH2完了（`21161f4`）: `src/calculation/D10Calculator.js`のruntime primitiveをAttackとBacktrackで共有し、productionのD10 JSON取得をなくした。公開assetは参照・比較用に保持する。
- RH3完了（`e512eec`）: DXの二項係数表と`dice=99`・`shihai=19`境界、DRの`202D`・`kazanari=9`境界、フォームの99/999上限を撤廃した。入力はsafe integer domainで受け付け、配列長、FFT長、推定時間・メモリ、二次計算量には絶対安全上限を設ける。`kazanari`は実際のダメージダイス数を超えた場合に同値な有効値へ正規化する。
- RH4完了（`687d14c`）: production consumerがない`DamageCalculator`のlegacy finalizerを削除した。published adapter、旧Attack chart adapter、rounding optionは比較・再生成用途のconsumerが残るため保持し、symbol単位の監査結果をPhase 8 inventoryへ追補した。旧Attack chart adapterはRelease hardening closure follow-upで退役した。
- RH5完了（`156b59e`）: D10全224ケースのasset equivalence、rule-validなresource-heavy入力のreject、100D級のproduction browser smokeを追加した。現行HEADでstatic auditとJavaScript・generatorの最終gateが成功している。
- RH6完了（`490988a`）: runtime防御D10の生成コストを`RangePlanner`のresource admissionへ統合した。`D10Calculator`と同じ`dice * size`式を共有helperで見積もり、必要support長、2本のFloat64 DP buffer、operation/time/memoryをdamage planと総resource estimateへ加算する。D10のabsolute length/operation limit超過は計算開始前に`defence-d10-length`／`defence-d10-generation`としてrejectし、calculator側のabsolute guardもdefence-in-depthとして維持する。

### Release hardening closure（RH6 follow-up、2026-08-31）

RH6の実装後に、resource admissionと実行時の要求ライフサイクルが一致することを追加確認した。`0d38320`では防御D10 providerまで`AbortSignal`を伝播し、生成中のキャンセルをcanonical Damageの既存latest-wins契約へ接続した。`0576c14`では`shihai >= dice`の決定論的shortcutを`RangePlanner`の配列・操作量見積りへ反映し、実際に確保しないDP stateを見積もらないようにした。`5b2a7c3`ではproduction browser smokeの100D Check／Attack／Backtrackケースについて、入力保持やcanvas存在だけでなく、新しい計算結果のcommit完了を待つ契約を追加した。Backtrackは100Dで表示バケットが変わらない場合があるため、入力保持・描画状態・browser error 0を組み合わせて完了を判定する。

`9787571`では互換surfaceをsymbol単位で再監査した。production・test・script・experimentから参照されない`getAttackScoreChartData`、`collapseDistribution`、`DISTRIBUTION_SIZE`は実装と自己検証を削除した。一方、`getAttackDamageChartData`と`clipData`／`range`は当時legacy shape fixtureのconsumerが残るため保持した。その後のRelease hardening closure follow-upでlegacy fixtureを削除し、`shiftDistribution`はcanonical Damage、`getUpperTailProbability`は既存chart fixture、published-bucket adapterはcanonical比較・RangePlanner境界、DX rounding aliasは互換fixtureのconsumerが残るため保持している。公開schema-v2 asset、Python generator、計算意味論、production chart contractは変更していない。

`c7c4b64`のRelease hardening closure follow-upでは、Backtrack smokeの現在侵蝕率を700に設定し、Eロイス100とその他減少量100の各入力で実際の結果commitを必須化した。残存していたlegacy Damage adapter、内部`clipData`、`Distribution.range`と専用legacy chart fixtureを削除し、canonical Damage adapter、coordinate/labels adapter、ChartPercentages golden testを代替根拠として残した。

このclosureでは、以下の最終gateを現行HEADで実行する。過去のRH5／G10の成功記録は履歴値として保持し、今回の結果で上書きしない。

```text
npm run check:node
npm run data:check
npm run data:verify-generator
npm test
npm run generator:test
npm run generator:test:simulation
npm run lint
npm run lint:markdown
npm run generator:lint
npm run build
npm run smoke:production
git diff --check
```

2026-08-31の実行結果は、Node.js 22.23.2、data verify 32 assets、Vitest 57 files / 772 tests、generator test 18 passed / 13 deselected、simulation 13 passed / 18 deselected、ESLint、Markdown lint（24 files / 0 issues）、Ruff、production build、production browser smoke、`git diff --check`のすべて成功だった。smokeではCheck／Attack／Backtrackの100D再計算完了、precomputed request 0、console warning/error 0、same-origin HTTP error 0を確認した。

## 表示範囲と明示coverageの移行対象

過去のlegacy経路では、`src/data/Distribution.js`の`range()`が1024要素の`OUTPUT_DISTRIBUTION_SIZE`に依存し、`src/components/Attack/LegacyChartSetter.js`のlegacy `clipData()`が固定長配列を`slice`していた。これらはRelease hardening closure follow-upで削除した。通常のCheckではPhase 4でdynamic display windowを接続し、`src/components/Check/SettingForm.vue`をcontrolled化して表示`min`/`max`の999上限を撤廃した。AttackのSettingForm系（`src/components/Attack/ScoreSettingForm.vue`、`src/components/Attack/DamageSettingForm.vue`）もP1で固定上限を撤廃し、計算上の1024/1022境界は比較用途として整理している。

数学的なsupport、canonical resultが明示的に保持するcoverage、ユーザーが選ぶ表示windowを分離する。`support`は結果が取り得る値の範囲であり、`explicitMax`は現在のresultに確率値が明示されている上限である。表示windowは非負safe integerの`min`/`max`を原則任意に指定でき、windowが明示coverage内ならresultを再利用する。windowがcoverage外でも有限supportの外側なら確率0として再計算せず、support内で明示値が不足する場合だけ計算範囲を拡張する。upper-tailを正確に得られない場合は拡張計算またはresource rejectionとする。safe integerでも配列長、メモリ、計算量、Chart.js描画負荷が問題になる場合は、preflight、`ResourceGuard`、`DisplayRangePlanner`で制限または拒否する。

chart dataは`min`/`max`の長さのlabels配列を無条件に生成せず、canonical座標を持つ点または必要範囲だけのtyped/sparse dataへ投影する。Chart.jsの`LinearScale`とcoordinate dataを基本とし、decimation・集約は確率の意味と既存の見た目を変えるため通常表示の既定手段にしない。描画点数がbudgetを超える場合は、明示的な別表示モードを追加するまでresource rejectionとする。PMFの範囲外は契約に従って0または省略し、upper-tailはtailの意味を保つ。表示用の確率パーセント1桁丸めとsummaryの既存見た目・丸めは維持する。

既存1024 comparisonは移行検証用fixtureとして残すが、本番表示・canonical schemaの上限とは扱わない。無制限とは仕様上の入力拒否をなくすことであり、メモリ不足や描画不能を放置することではない。

## 最終方針と不変条件

- 当面は静的SPAとブラウザ内計算を維持する。Cloudflare Workersの新規経路、HTTP API、MCPは今回実装せず、coreの契約と実測が安定した後の将来目標として再評価する。
- canonical resultのsupport、overflow、expected valueの意味は内部result/metadataで保持する。通常UIでは不確かさやboundを明示せず、exactな値を既存のチャート・サマリー形式へ渡す。Score尾部の位置不明上限が表示確率の半刻み`5e-4`以下で、Damage output overflowがwindow外にある場合だけ、表示精度を変えない安全なprojectionを許可する。それ以外の非exactな値は必要な範囲を再計算し、正確な表示モデルを作れない場合は既存のエラー・再入力案内へ接続する。特に`upper-bound`を一点の実確率や一点の期待値へ変換しない。
- 既存legacy表示との比較テストを移行中は維持する。canonicalが資源制限やエラーで実行できない場合は、移行中の比較ではlegacy fallbackを許すが、最終productionでは旧結果ではなく既存のエラー・再入力案内へ接続し、legacy fallbackを削除する。

## 三経路で共有する表示契約

Checkやバックトラックを個別の都合で実装する前に、Attackにも再利用できるcanonical display contractを定義する。producerが返す計算結果と、チャート・サマリーが受け取る有限の表示モデルを分離し、表示モデルへ変換できない場合のfallbackも契約の一部にする。

| 項目 | 共有契約で定義する内容 |
| --- | --- |
| Support | `finite`（`support.max`が示す既知の最大値）、`infinite`、`unknown`を区別し、resultの`explicitMax`やmetadataがある場合も`support.max`と同一視しない。有限性を確認できない結果を有限配列として扱わない。 |
| Overflow | `exact`と`upper-bound`を区別して保持する。各overflowにある`lowerBound`はoverflow位置の下限であり、overflow.kindに`lower-bound`を追加したり、異なるkindを同じ一点値に正規化したりしない。Score tailの位置不明上限とDamage output overflowを表示用metadataで分離し、表示精度未満の位置不明tailだけを省略可能とする。 |
| Expected value | `exact`、`bounded`、`lower-bound`、`unavailable`を区別する。有限で検証済みの`exact`だけがlegacy互換の一点表示候補であり、`bounded`や`lower-bound`は内部に保持する。通常UIでboundを表示せず、再計算してもexactにならない場合はerror/re-input案内へ接続する。 |
| Published/display buckets | 現在の1024 published bucket（`0..1022`と`1023`の上側tail）は比較用fixtureとして定義し、canonical表示ではユーザーのdisplay window、bucket境界、`explicitMax`、tailの意味を別フィールドで持つ。 |
| Tail | `upperTailProbability`が表す範囲と、exact overflowを集約できる条件を明記する。上限だけのtailを実在する一点の確率として描画しない。 |
| Drawing points | 描画点数、表示範囲、配列長の上限をplanner/resource budgetと整合させ、固定labelsや巨大なprobabilities配列を無条件に生成・列挙しない。 |
| Fallback | 移行中は`not-ready`、`not-projectable`、validation error、resource rejectionを識別可能にしてlegacy比較へ戻せるようにする。最終productionではcanonicalのerror/re-input案内へ接続し、legacy fallbackを残さない。 |

この契約では、core producerがまだ供給していない意味を暗黙に補わない。特にoverflowの`lowerBound`やlower-bound expected valueの範囲がどの計算から得られるか、表示できる最小情報、計算不能時の文言はPhase 2で確定する。

## 入力データフローと要求ライフサイクルの現状と方針

- `src/components/Check/DfcltyForm.vue`、`src/components/Check/ScoreForm.vue`、`src/components/Backtrack/BacktrackForm.vue`、`src/components/Attack/AttackForm.vue`、`src/components/Attack/DefenceForm.vue`はlocal reactive draftをwatchし、非同期の`form.validate()`が完了した最新世代だけvalidated snapshotを発行する。Attackは`ComboForm.vue`がside paramsを一括置換し、親のAttack-level canonical runnerがvalidated eventを同じlatest-wins laneへ渡す。showDetailsは明示eventで親へ渡し、snapshot aliasを防ぎ、Defenceのmode正規化を維持する。
- Attackの入力formは`eb043a9`でcontrolled化を完了した。validation gateはunmount時にdisposeし、破棄後のemitを抑止する。legacy combo/total runnerと初期legacy計算はproduction接続から削除し、canonical Attack batch laneが初期計算、入力、combo追加・削除・複製・並べ替えを担当する。
- Checkとバックトラックのviewはvalidated eventを受けて親stateを更新し、`CheckInputSnapshot`または`BacktrackInputSnapshot`を作って計算へ渡す。canonical Attackは`AttackCanonicalState`でcombo順、id、計算paramsだけをsubmit時にsnapshotし、結果・表示状態を入力へ含めない。
- `createCalculationRequestCoordinator`と`createLatestCalculationRunner`はrevision、snapshot、`AbortSignal`、commit guardを共有し、各laneを実行中1件と最新の待機1件に制限する。staleなresult/error/planは破棄し、`CalculationFeedback`のloading、ready、idle、rejected、errorへ対応させる。
- `ResourceGuard`は`maxActive=4`、`maxQueued=32`のFIFO queueを持ち、queued要求はabort時にqueueから除去する。`RuntimeDamageRollClient`はsingletonのブラウザWeb Workerと`pendingById`を持ち、既に`postMessage`した処理はabortしても停止しない。`RuntimeDamageRollWorker`は同期計算でcancel protocolを持たないため、旧Worker計算は完了後に破棄され、結果がcacheへ再利用される場合がある。
- したがって、UIのlatest-wins、ResourceGuardのFIFO待ち行列、Workerのpending計算は別の層であり、「最新要求のみ実計算」と同一ではない。legacy fallbackの採否はこの要求ライフサイクルとは別の表示・移行判断として扱う。

対話的SPAの通常要求はCheck、Attack、バックトラックともlatest-winsを基本方針とする。latest-winsは、古い結果をcommitしないこと、未開始の古い要求を新しい要求で置き換えること、実行中の古い計算を停止することに分けて管理する。Phase 1では各request laneについて「実行中1件と最新の待機1件」を上限とし、未開始の要求を無制限にブラウザWeb Workerへ送信しない。実行中の旧Worker計算は現状では完了後に破棄してcache再利用を許し、terminateやcancel protocolは実測後の別判断とする。初期化計算、Attack全combo batchのatomic commit、共有可能なasset/cacheはrequest laneのlatest-winsから分離した。

共通`CalculationRequestCoordinator`と`createLatestCalculationRunner`を、snapshot、revision、`AbortSignal`、commit guard、`idle/pending/running/success/error/cancelled/resource-rejected`状態とともに実装した。Form側はdraftからnormalize/validationを経てsnapshotを作り、async validationの競合を世代で防止する。ResourceGuardは資源のFIFO予約だけを担い、coordinatorのlatest-wins queueとは責務を分離した。連続入力、未開始要求の置換、Worker境界、stale commit、unmount、combo追加・削除、初期化、atomic batch、共有asset/cache例外をテストで確認した。

表示範囲plannerでは`DisplayRequest`を計算snapshotと分け、calculation keyが同じで明示coverageが足りる場合はprojectionだけを更新する。coverageが不足する場合だけcoordinatorへ拡張計算を要求する。入力snapshotと要求状態を先に整え、その後にcanonical表示契約とdynamic chart adapterを実装する。

## 推奨フェーズ

### Phase 0: 現在のAttack safe pathをレビュー・コミットする

- 現在の作業単位にはcanonical batch、`CanonicalAttackPanel`、`canonicalOptIn`、安全なlegacy projection、契約テストがすでに存在するため、このPhaseでは新しい表示機能を追加せず、差分レビュー、検証、統合、コミットを行う。
- 成果物: canonical batch、`CanonicalAttackPanel`、`canonicalOptIn`、Attack表示projectionと契約テストの現状レビュー、および既存チャート・サマリーの見た目を維持する接続方針。
- 完了条件: exact finiteの投影、upper-bound・unsafe exactの拒否、canonical resultのmetadata、legacy比較、cancel/stale/error/resource rejectionの挙動を確認し、debug panel・toggle・安全投影を本番へ残さない境界を明文化する。
- 対象外: Check/バックトラックの接続、表示window planner、既定経路の切替、JSON削除、計算パラメータ入力上限変更、ブラウザWeb Worker protocol変更、Cloudflare Workers/API/MCP。

Phase 0を先に行うのは、後続の比較結果が未レビューのAttack差分や既存UIの変更と混ざるのを防ぐためである。現行の安全投影とdebug表示は移行の完成ではなく、共通契約へ移す前の参照実装として扱う。

### Phase 1: 入力データフローとlatest-wins coordinatorを整える（完了）

- 実装: `CalculationRequestCoordinator`と既存feedback adapterで、snapshot、revision、AbortSignal、commit guard、`idle/pending/running/success/error/cancelled/resource-rejected`を共通化し、実行中1件と最新待機1件へ制限した。Checkとバックトラックはcontrolled input、normalize、async validation世代管理、unmount disposeを接続し、canonical Attackはsubmit-time combo snapshot、入力世代guard、atomic batch commit、combo追加・削除・並べ替えを接続した。
- 検証: `calculationRequestCoordinator.test.js`と`calculationFeedback.test.js`でlatest queued置換、snapshot alias防止、stale result/error/plan抑止、unmount、初期化成功・reject、feedback対応を固定した。`checkInputSnapshot.test.js`と`backtrackInputSnapshot.test.js`でcontrolled event、snapshot alias防止、async validation世代、unmountを固定し、`attackCanonicalState.test.js`でbatch、atomic commit、stale/disable/dispose、combo順・追加削除・並べ替えを固定した。`resourceGuard.test.js`、`runtimeDamageRollClient.test.js`、`canonicalAttackRuntimeWorkerContract.test.js`でFIFO資源予約、asset/Worker例外、cache/dedup、Worker postMessage境界を確認した。
- 対象外: 実行中ブラウザWeb Workerの強制停止、cancel protocol、新しいWorker protocol、canonical display UI、legacy fallbackの最終削除、表示windowのdynamic chart実装、JSON整理、入力上限変更、Cloudflare Workers/API/MCP。legacy Attackフォーム全体のcontrolled input移行はPhase 1当時の対象外であり、後続のPhase 5で完了した。

Phase 1を表示範囲plannerとcanonical display contractの前提として完了した。表示範囲plannerは要求snapshotと再計算・再利用状態を必要とし、canonical display contractは安定したcommit/error/cancel境界を必要とするため、Phase 2以降ではこの責務境界を再利用する。

### Phase 2: 共通canonical display contractを設計する（完了）

- 成果物: 三経路共通の型・状態・validation規則、supportと明示coverageの表現、overflow/expected valueの表現、display windowとcanonical coverageの境界、tailと描画点数のbudget、fallback理由の契約、Attack/Check/バックトラックのgolden fixture。
- 完了条件: exact/upper-bound overflowと各`lowerBound`、lower-bound expected value、finite/infinite、明示coverage、safe integer window、not-ready、resource rejectionを含む契約テストがあり、入力配列やcanonical envelopeのaliasを作らず、legacy比較の期待値が固定される。
- 対象外: Check/バックトラックの本実装、production debug panel、既定UIの置換、計算パラメータ入力上限やJSONの整理、Cloudflare Workers/API/MCPの採用判断。

display contractが未確定のままCheckやバックトラックを個別実装すると、経路ごとにoverflowと期待値の意味が分裂し、後から共通化する際に表示上の損失を隠すことになる。したがってPhase 2の完了をPhase 3以降の依存条件にする。

#### 現在の実装状態（完了）

`presentCanonicalDistribution`を三経路で再利用できるUI非依存の成功表示契約として採用し、finite/infinite support、`explicit.offset` と `explicitMax` による明示coverage、`null`/`exact`/`upper-bound` overflow、各overflowの`lowerBound`と`errorBound`、mass、`exact`/`bounded`/`lower-bound` expected value、warnings、JSON-safeな防御コピーを既存の単一validation層で検証する。任意の`displayWindow`は非負safe integerの`min`/`max`だけを受け付け、canonicalの明示coverageを切り詰めず要求境界として保持する。表示範囲の再計算・projection・resource budgetはここでは行わない。

Phase 2の共通canonical display contract、golden fixture、契約テストは完了した。Phase 3の`DisplayRangePlanner`/Chart adapterとPhase 4の通常Check接続でこの契約を再利用している。Attack/バックトラックのcanonical producer接続と、三経路全体の既定化・legacy削除は後続Phaseに残る。

### Phase 3: 共通display range plannerとChart adapterを作る

- 成果物: Check、Attack Score、Attack Damageで共有する`DisplayRangePlanner`相当の設計・実装、canonical coverageとdisplay windowの再計算/再利用規則、Chart.jsへのcoordinate/typed/sparse data adapter、contract test。
- 完了条件: 非負safe integerの任意windowを受け取り、明示coverage内なら再利用し、coverage不足かつsupport内なら再計算し、有限support外は再計算せず扱える。window長、配列長、メモリ、計算量、描画点数をpreflight/`ResourceGuard`で検証できる。PMFとupper-tail、従来の丸め、既存1024 fixtureの比較が固定される。
- 対象外: productionのcanonical debug panel追加、Attack/バックトラックのcanonical producer接続、三経路全体の既定経路切替、legacy計算/fallback削除。

Phase 3を先に行うことで、固定`range()`、legacy `clipData()`、各経路に残る固定上限を、経路ごとに別の暫定上限へ置き換えずに済む。無制限の入力を許可することと、無制限の配列・描画を実行することを分離する。

#### Phase 3第1単位: 共通DisplayRangePlanner（実装済み）

`src/presentation/DisplayRangePlanner.js`を追加し、`presentCanonicalDistribution`が返すdisplay payloadの`explicit.offset`、`explicitMax`、`support`、`overflow`と要求`displayWindow`をUI非依存に判定できるようにした。明示coverage内は`reuse`、finite supportの右側だけを既知0で補える場合は`explicit-coverage-with-known-zero`、coverage不足でfinite/infinite support内の値が必要な場合は`recalculate`、window全体がfinite supportより右側なら`finite-support-outside`として`known-zero`とする。overflowは一点の確率へ変換せず、upper-boundもcoverageの代わりにはしない。

windowの`max - min + 1`、explicit coverageの終端、Float64Array相当の最小メモリ見積りをsafe integerとして事前検証し、`pointCount`、`float64Bytes`、`chartPoints`をfreeze済みの`estimates`へ返す。係数値の検証はversioned `presentCanonicalDistribution`の責務とし、plannerはArray/Float64Arrayの種別、length、offset/explicitMaxの整合だけをO(1)で検証する。返却rootは`version`、`kind`、`status`、`accepted`、`decision`、`reason`、`displayWindow`、`coverage`、`estimates`、`warnings`、`rejectionReasons`だけを持ち、同じ意味のtop-level/resource入れ子aliasは作らない。`pointCount`は配列長、`chartPoints`は描画負荷という別budgetであり、現在は1座標1描画点の保守的見積りのため数値が同じでもpolicy warningは独立に判定する。既定のwarning/hard thresholdは999/1000のlegacy表示上限ではなく、差し替え可能な資源policyであり、hard超過は`resource-rejected`として返す。ResourceGuardとの接続、計算RangePlannerへの拡張要求、実際の配列・Chart.jsデータ生成はまだ行わない。

`DistributionResult`は`explicit.offset`未満を暗黙に0と保証していないため、低側windowの不足は再計算扱いにする。この判断をテストで固定し、低側を根拠なく既知0へ補完しない。既存1024 coverageでは`0..999`と`0..1023`の再利用をfixtureで固定した。Phase 3単位ではproductionのCheck接続を変更していないが、通常Checkのcanonical producer、既定UI、Chart/Summary接続はPhase 4で実装した。

#### Phase 3第2単位: canonical chart series adapter（実装済み）

`src/presentation/CanonicalChartSeriesAdapter.js`の`createCanonicalChartSeries(display, plan, { mode })`は、plannerのacceptedな`reuse`または`known-zero`だけを、整数座標の`displayWindow`と所有する`Float64Array values`へ変換するpure adapterである。ready結果の公開shapeは`version`、`kind`、`status`、`mode`、`displayWindow`、`values`だけであり、座標の開始値と点数は`displayWindow.min`/`pointCount`から導く。adapterはdisplayの確率配列から独立した新規`Float64Array`を1本だけ作り、windowごとの`labels`、`{x, y}` point object列、確率値の百分率化・丸めを行わない。外側の結果はfreezeするがtyped array自体はfreezeできないため、`values`はcallerがread-only契約で扱う。`explicit.offset`未満は補完せず、plannerの`recalculate`と`resource-rejected`は確率を作らない`not-ready`結果として返す。finite supportの右側だけはplannerの`knownZero`を根拠に0を生成する。

`mode: 'pmf'`は各座標の`P(X = x)`、`mode: 'upper-tail'`は既存`getUpperTailProbability`と同じ`P(X >= x)`である。offsetが0のupper-tailは既存の「1から下側PMFを順に減算する」計算順を保ち、offset付きwindowでは明示suffixから計算を開始する。activeなexact overflowがwindowの`max`以下にある場合、lowerBoundは分布一点を意味しないため`not-projectable`とする。lowerBoundが全thresholdより上のexact overflowだけはsuffixへmassを含められる。activeなupper-bound overflowはupper-tailへ変換せず、PMFでもwindowに重なる場合は拒否する。finite support外の既知0だけはoverflowの種類に関係なく0として投影できる。

Chart.js 4.5.1のローカル実装はtyped arrayをarrayとして認識する一方、`parsing: false`のline dataには内部形式の座標が必要であるため、canonical seriesと最終materializerを分離した。`materializeCanonicalChartJsData`はCategoryScaleへ接続する最後の境界でのみ数値labelsを生成し、datasetにはseriesが所有する同じ`Float64Array`を`data`としてread-only参照し、`parsing: true`を渡す。これはdisplay入力とのaliasではなく、Chart.js用の二重コピーを避ける意図的なseries-to-Chart.js viewである。ローカル実装は数値要素を変更せず配列監視用のmetadataだけを扱うため、materialize後もcallerは`series.values`を変更しない。Phase 3単位ではproduction接続を変更していないが、通常Checkのproducer接続、既定UI、Chart/Summary供給はPhase 4で実装した。Attack/バックトラックのproducer接続とlegacy fallbackの最終削除は後続Phase 5〜7で完了した。この段落はPhase 3時点のhistorical recordである。

この単位でPhase 3全体が完了したわけではない。通常Checkのproducer接続、Chart/Summaryへの供給、ブラウザ確認はPhase 4で完了した。残る作業はAttack/バックトラックのproducer接続、各経路の表示供給、三経路全体の既定化、およびlegacy fallback削除である。

### Phase 4: 通常のCheckをcanonical化（完了）

- 成果物（完了）: Checkのcanonical result producer、Phase 3 adapterとの接続、既存Checkチャート・サマリーへの表示供給、legacyとの同一入力・同一条件の比較テスト。
- 完了: `ef14744`、`dfe25fe`、`cdef582`、`b0bede7`、`fac55bb`で、通常Checkのcanonical producer、presentation/chart/summary接続、既定Check接続、dynamic display window、controlled SettingForm、999上限撤廃、coverage再利用・不足時latest-wins再計算、resource拒否時のclient未呼出、upper-bound terminal、legacy fallbackなしを実装した。
- 検証: 全715テスト、lint、Markdown、buildが成功した。2026-08-20のin-app browserで`/check`を確認し、初期`0..30`、`0..1200`への拡張、`0..20000`のdisplay resource rejection（警告表示）、`30`への復旧、canvas 1、console warn/error 0を確認した。
- 対象外: Check専用debug panelをproductionへ残すこと、Attack/バックトラックの本接続、三経路全体の既定canonical化、JSON削除、Cloudflare Workers/API/MCP。

通常CheckはAttack固有のcomboやdamage totalに依存しないため、共通display range plannerとChart adapterを実データで検証する先になり、resource拒否と再入力案内まで確認してPhase 4を完了した。Phase 5ではAttackのScore/Damageをdynamic displayへ接続した。バックトラックのcanonical化と三経路全体の既定化はさらに後続である。

### Phase 5: AttackのScore/Damageをdynamic displayへ接続する（完了）

- 成果物: Attack Score/Damageのcanonical producerとPhase 3 adapterの接続、既存ScoreChart/DamageChart/SummaryTableへの表示供給、canonical total、任意display window、legacy比較fixtureとブラウザ実測。
- 成果（完了）: `c457b5c`でDamage/Totalのdisplay coverage拡張、`b305eb7`でcanonical Attack Scoreの表示接続、`1401695`でAttack Scoreのdisplay coverage拡張、`ffb7785`でcanonical total damage aggregationの`errorBound > 0` tailにおける`lowerBound`保持と既定Damage `0..100`のcoverage誤判定修正、`00b5b3f`でScore期待値tail certificate・両側tail成功率区間・丸め安定時だけの既存サマリー表示、`eb043a9`でAttack入力のcontrolled化、`c26d511`でproduction公開CalculationClientを通すlegacy比較fixtureを実装した。
- 入力データフロー（完了）: `AttackForm.vue`と`DefenceForm.vue`はlocal draftから最新async validationのvalidated snapshotだけをemitし、`ComboForm.vue`はside paramsを一括置換して1 eventにつきcanonical latest-wins runnerを1回だけ発火する。showDetailsは明示eventとし、validation gateとrunnerをunmount時にdisposeして破棄後のemit/runを抑止する。snapshot alias防止、Defence mode正規化、latest ticket/disposeは`tests/attackInputSnapshot.test.js`で固定した。canonical batch laneの既存submit-time snapshot/latest-wins、canonical runner、表示は変更していない。
- 実装済みの表示契約: ScoreとDamageを独立laneで扱い、coverage内はreuse、finite support外はknown-zero、coverage不足時はlatest-winsでcanonical batchを再計算する。resource reject時はclientを呼ばず、Score-only rejectではDamageを保持し、legacy fallbackは行わない。
- legacy比較fixture（完了・履歴）: 最終比較では`tests/attackCanonicalLegacyFixture.test.js`を使い、同じordered 2-combo入力をlegacy `calculateAttackCombo`/`calculateTotalDamage`とcanonical `calculateAttackCanonicalBatch`へ通して比較した。fixed正負、防御、`kazanari > 0`、failure/fumble、input snapshot/order、Score action/reaction、各Damage、multi-combo Totalを確認し、DX/DR JSONには依存せずD10 assetだけを使用した。最終比較完了後、このclient-level fixtureはcleanup第2単位で削除し、下位core比較・migration fixtureへ責務を残した。
- ブラウザ受入（2026-08-22、in-app Chromium / Vite local）: canonical opt-inの既定入力でScore/Damage各`0..100`は計算完了、2 chart、alertなし。各`0..1200`も計算完了、2 chart、alertなし。Score `0..20000`ではScoreだけ描画点数resource rejectとなりDamage chartを保持した。`0..100`へ戻すと2 chartが復旧しalertはなかった。`00b5b3f`後の既定サマリーは達成値期待値`6`、命中率`45.5%`、ダメージ期待値`3.1`となり、新規セッションのconsole warn/errorは0件だった。
- 追加ブラウザ受入（2026-08-23、in-app Chromium / Vite local、canonical opt-in）: action diceを`2→20→3`と連続入力すると最終値`3`だけが残り、サマリーは達成値期待値`9.7`、命中率`71%`、ダメージ期待値`5.5`、chart 2だった。入力`99`直後にcomboを削除しても削除済み結果は復活せず、新規comboは既定dice `1`、サマリーは`6`、`45.5%`、`3.1`、chart 2だった。《妖精の手》`2`を設定後に詳細設定を閉じ、再度開くと`0`へ戻り、サマリーも既定値へ復帰した。console warning/errorとJavaScript dialogは0件だった。action dice `3`では、boundedなcanonicalダメージ期待値を安定した丸め値として表示する既存契約に伴い、「canonicalの期待値が正確値でない」という画面内の注意を確認した。明示的なresource warningは対象外とした。一時server/tabを終了し、port `3000`を解放したため、追加ブラウザ実測は完了とした。
- 完了条件: 1024を超えるsupportを固定配列へ黙って切り詰めず、exact overflowだけが定義済み条件で内部集約され、upper-bound overflowの`lowerBound`やbounded/lower-bound expected valueを一点表示しない。既存チャート・サマリーの見た目、丸め、コンポーネントを維持する。
- Score期待値表示契約（完了）: 無限supportでScore期待値certificateが未対応の`skill<0`、`yousei>0`、`shihai>0`は、内部expected valueをlower-boundのまま保持し、通常UIの達成値期待値を`—`とする。これは期待値の保証範囲に限る契約であり、canonical分布・chart・計算自体の失敗を意味しない。successRateは独立したcertificate/区間規則に従い、丸めが確定すれば表示し、Damage/Totalも各自の契約で表示を継続する。`dice<=shihai`の自動失敗や`critical=11`などfinite supportでgeneric summaryがexactになる場合は従来どおり数値表示する。
- 将来拡張TODO: 未対応の無限supportは恒久的な非対応とはせず、負の`skill`（clampを含むshifted tail-sum）、`yousei`（exact-youseiのfirst-moment residual）、`shihai`（DPに対応するtail first-moment certificate）の順に検討する。canonical既定化、debug panel/toggle削除、legacy計算・fallback削除はPhase 7で扱う。
- 対象外: `CanonicalAttackPanel`や`canonicalOptIn`のproduction残置、1024へ無条件collapseするlegacy projection、既定経路の切替、legacy計算/fallback削除、JSON整理、Cloudflare Workers/API/MCP。

Attackでは1024比較用のsafe projectionを残したまま、Phase 5の成果としてScore/Damageのdynamic displayを`canonicalOptIn`付きで接続した。Score期待値の未対応infinite support条件は内部lower-bound保持と`—`表示の契約として確定し、finite exceptionと独立したsuccessRate、chart、Damage/Totalの表示継続を確認した。ScoreとDamageを共通plannerで扱い、totalのsupport・tail・expected valueを別計算の丸めや平均で作らない方針は維持する。

### Phase 6: バックトラックをcanonical化する（完了）

- 成果物（完了）: バックトラックのcanonical result producer、資産coverageとsupportを含むPhase 2/3 adapter、既存バックトラック表示への供給、asset不足・resource rejection・overflowの比較テスト。
- 完了条件（達成）: 既存のバックトラック入力と資産条件でcanonical/legacy比較が再現でき、finite support、明示coverage不足、overflowを区別し、非投影可能な結果を一点値へ押し込まない。バックトラックのカテゴリ表示に表示windowが必要かは経路固有のadapterで判断し、不要なmin/max計算を要求しない。エラー時は旧結果ではなくerror/re-input案内へ接続する。
- 対象外: Backtrack固有の新しいJSON形式、production debug panel、他経路のlegacy削除、計算パラメータ入力上限とJSONの同時変更、Cloudflare Workers/API/MCP。

第1実装単位では、既存のVue・表示・`calculateBacktrack`を変更せず、明示opt-inの`calculateBacktrackCanonical`、完全finite supportを持つ`single`/`double`/`second`の`DistributionResult`、canonicalは常時on-demand・legacyは従来assetを維持する計画分離、ResourceGuardのcanonical専用防御コピー見積もり、signed `offset`の共通契約だけを接続する。現行の疎assetは完全supportのcanonical sourceに使わない。既存表示へ渡すカテゴリadapterとproduction接続は後続単位に残す。

第2実装単位では、`src/presentation/BacktrackCanonicalPresentation.js`にBacktrack専用adapterを追加し、canonicalの実最終侵蝕率をsigned coordinateのまま走査してlegacy ChartSetter用のsingle/double/secondカテゴリへ集約する。finite supportの明示coverage一致、`overflow: null`、3キーを必須とし、標準・悪夢・負値・全Dロイスの境界を0.1%表示契約で検証する。Vue、ChartSetter、既存runner、`CalculationClient`、legacy計算経路は接続せず、generic PMF/display-window adapterも経由しない。

第3実装単位では、バックトラック条件パネルに`canonicalOptIn=false`を既定とする一時的な「canonical検証経路（Phase 7で削除予定）」toggleをcontrolled eventとして追加する。legacyでは既存`calculateBacktrack`、canonicalでは`calculateBacktrackCanonical`から`createBacktrackCanonicalPresentation`を経て`finalEncroachment`だけを既存ChartPanel/ChartSetterへ渡す。同じ入力snapshot、RangePlanner通知、ResourceGuard、abort、latest-wins、feedback、unmount disposeを共有し、canonicalの失敗・resource reject・abortではlegacy fallbackせず結果をclearする。productionの既定canonical化、legacy計算削除、routerのasset preload削除、見た目変更はPhase 7まで行わない。

2026-08-24のブラウザ受入（in-app Chromium / Vite local、新規セッション）では、既定の`canonicalOptIn=false`で3 chart、alertなし、JavaScript dialogなし、console warn/error 0を確認した。canonicalへ切り替えた後、現在侵蝕率を90→140→105と連続入力して最終値105が保持され、3 chart・alertなしだった。《不死者・悪夢》へ変更しても3 chart・alertなしで、legacyへ戻すとtoggleはuncheckedとなり、105とDロイスを保持したまま3 chart・alertなしだった。初回起動時は古いVite依存cacheがVuetify仮想moduleを参照して空白になったが、server停止後に`--force`で再最適化した新規セッションでは再発しなかった。これは受入結果とは区別すべき環境復旧事項であり、一時tab/serverは終了してport 3000を解放済みである。

production formの上限では最大diceは223、最大working lengthは約2231、canonical屍人の最大見積りは約0.5 MiBであり、既定ResourceGuardの64 MiB未満なので、通常ブラウザ操作からdeterministicなresource rejectionは発生させられない。resource rejectionはdebug hookを追加せずintegration境界で検証し、通常成功経路は2026-08-24のブラウザ受入で確認した。このためPhase 6のproducer、adapter、opt-in接続、error/re-input契約、基本browser受入の成果物と完了条件を満たしたものとしてPhase 6を完了とする。resource rejectionの実ブラウザ再現は未実施だがPhase 6の必須条件とはせず、Phase 7第1実装単位でバックトラックのcanonical既定化、toggle削除、legacy計算を残したままのrouter asset preload削除を完了した。

バックトラックは資産coverage、範囲計画、結果の集約条件がAttackやCheckと異なる可能性がある。共通display contractを再利用しつつ、asset不足をoverflowや確率ゼロと誤認しない固有validationを追加する。

### Phase 7: canonicalを既定化し、legacy計算とfallbackを削除する

- 成果物: 三経路の比較結果、ブラウザ実測、性能・資源・cancel/stale・error確認、既存コンポーネントへcanonicalを渡す既定経路、`CanonicalAttackPanel`/`canonicalOptIn`/debug表示の削除、production legacy計算経路・固定1024 projection・legacy fallbackの削除。
- 完了条件: 主要fixtureで数値、support、明示coverage、tail、expected valueの意味、任意display window、表示点数、資源拒否、error/re-input案内がレビュー済みで、既存チャート・サマリーの見た目を保ったままcanonicalが既定になる。canonical計算の失敗時に旧結果を表示しないことを確認する。
- 対象外: この段階での計算パラメータ入力上限の再設計、既存JSONの削除、Cloudflare Workers新規経路、HTTP API、MCP。

第1実装単位（完了）では、バックトラックの初期計算・再計算を`createBacktrackCanonicalRunner`へ統合し、`calculateBacktrackCanonical`から`createBacktrackCanonicalPresentation`を通る既定経路へ切り替えた。条件パネルの一時`canonicalOptIn` toggleを削除し、初期計算も`onMounted`から同じlatest-wins runnerで実行した。canonicalのresource rejection・error・abortでは旧結果へfallbackせず結果をclearし、retry、latest-wins、disposeを維持した。routeのlegacy preload削除とCalculationClient legacy API削除は第2実装単位で完了した。

- ブラウザ受入（2026-08-24、in-app browser / Vite local `--force`）: `/backtrack`で一時canonical toggleは表示されず、初回からcanvas 3、alertなしを確認した。侵蝕率を`90→140→105`と連続入力した後は最終値`105`、canvas 3、alertなしだった。Dロイスを「なし」「不死者・悪夢」「屍人」に変更した各ケースでもcanvas 3、alertなしだった。完全Vue mountはNode test環境制約で未実施だが、runner behavior/router module testで補完した。検証用tab/serverは終了し、port `3000`を解放した。
- Attack実装単位（完了）: Attackの初期計算、validated input、combo追加・削除・複製・並べ替えを`createAttackCanonicalRunner`の一つのlatest-wins laneへ統合し、unmount dispose、clear/no fallback、presentation errorからのretryを維持した。ScoreChart、DamageChart、Summary、totalはcanonical presentationだけを参照し、temporary `CanonicalAttackPanel`と`canonicalOptIn`を削除した。保証できないScore/Damage/Total期待値は`—`とし、通常の不確かさ・approximation warningは表示しない。
- Attack route/依存境界（完了）: `/attack` routeのpreload guardを削除し、cleanup第2単位で`CalculationClient.prepare`と`prepareCalculation`も削除した。canonical防御D10のlazy asset、`RuntimeDamageRollWorker`、legacy core/assetsは維持した。Attack表示フォームの999上限は撤廃済みで、任意の非負safe integer入力を受け付け、表示点数・メモリ・計算量はresource plannerで制御する。production full-tailのDamage rangeはaction Scoreの`outputMax`から動的に計画し、reaction Scoreの上限を混ぜない。1024/1022は比較・legacy境界としてのみ残している。
- Attack検証（完了）: canonical runnerの初期既定実行、latest-wins、abort、dispose、stale抑止、resource/range/generic/presentation error時のclear/no fallback/retry、canonical-only表示契約、route preloadなしをNode/Vitestで確認した。Vue完全mountは既存Node test環境制約により実施していない。
- legacy削除前の最終比較（2026-08-24、Node/Vitest）: Check/Attack/Backtrackのcomparison・migration・asset・runtime rule・range関連15ファイル229テストを実行し全件成功した。Checkはdice 0/1/99、critical 2/10/11、skill正負、yousei/shihai、failure/fumble、tail certificateを、Attackは既存2-combo fixtureと追加境界fixtureでdice 0/1/2/99、critical 2/11、skill正負、yousei/shihai、defence、fixed damage、kazanariを、Backtrackは7種Dロイス、標準/悪夢境界、負値、asset/on-demand境界をlegacyと比較した。比較可能なScore/Damageは既存のexactまたはtolerance契約で成功し、同じ境界fixtureのcritical 11/dice 0・99のfinite-support subsetではcanonical batchの個別DamageとTotalをlegacy per-combo→legacy totalへ直接比較して成功した。critical 2/youseiを含むfull boundary batchのTotalは`not-comparable`（`total-overflow`）とoverflow certificateを確認し、canonical tailを0扱いせず、legacy total API削除前の残余ギャップとして記録した。
- Phase 7 legacy cleanup第1単位（完了）: 最終比較完了後、productionからimportされないtest-only legacy display adaptersと専用テストを削除した。当時は実計算比較fixture、`LegacyCanonicalComparison`、`CalculationClient` legacy API、legacy core/wrappers、legacy assets/JSON/generatorを後続まで維持した。
- Phase 7 legacy cleanup第2単位（完了）: `CalculationClient`の`calculateCheck`、`calculateAttackCombo`、`calculateTotalDamage`、`calculateBacktrack`、legacy score/damage/backtrack依存注入、legacy fallback、route `prepare`を削除した。`/check`を含む全計算routeからpreload guardを外し、canonical Check/Attack/Backtrack、D10 lazy asset、RuntimeDamageRollWorker、RangePlanner、ResourceGuardを維持した。production Attackの`published-bucket`変換は使用せず、AttackのScore→Damageは`full-tail`で実行する。`published-bucket`は比較・互換用の明示policyとして残し、client-level legacy比較fixtureと専用client/prepareテストは削除・canonical契約へ移植した。下位legacy core/wrapper、比較・migration・asset・JSON/generatorはPhase 8まで維持する。
- Attackブラウザ受入（2026-08-24、in-app browser / Vite local、`d30b3d1`前の履歴）: 初回はcanvas 2、Summary `コンボ1 6 / 45.5% / 3.1`、alert 0、一時switch 0、canonical/support/overflow debug text 0を確認した。action dice `2→20→3`の連続入力後は最終値3、canvas 2、alert 0、Summary `9.7 / 71% / 5.5`だった。combo追加で2 combos・合計8.6、複製で3 combos、削除で2 combosへ戻り、各状態でcanvas 2・alert 0だった。現在の位置不明tail契約を反映した最終受入とは分けて扱う。
- Attackブラウザ受入（続き、`d30b3d1`前の履歴）: 《妖精の手》等を1にすると達成値期待値は単独`—`、命中率95.9%、damage 12.8となり、uncertainty warning/alertは観測されなかった。振り直せるダメージダイス1ではdamage 15、合計18.1、alert 0だった。Score/Damage双方をX以上表示へ切り替えてもcanvas 2・alert 0だった。初回の`--force`依存最適化reload中だけdynamic import warningが一時発生したが画面は復旧し、最適化後のserver/new tab再起動では初回2 canvas・Summary・alert 0と追加server warningなしを確認した。tabs/serverは終了し、port `3000`を解放した。現在の位置不明tail契約を反映した最終受入とは分けて扱う。
- 現在の状態: BacktrackとAttackのcanonical default化、CalculationClient legacy API/route preload cleanup、full-tail Attack resource計測、cost model校正、Chrome desktop/CPU 4x受入、production threshold 50/200msの暫定維持判断、主要Attack表示windowのin-app Chromium受入、最終HEAD full gateは完了した。Phase 7、Phase 8-1 inventory、Phase 8-2A ChartSetter split、Phase 8-2B dependency contract、Phase 8-2C production browser smokeは完了している。legacy core/wrapper・assets/JSON/generatorの整理は後続作業とする。低速実機・Firefox/WebKitのthreshold再評価は後続作業とする。

既定化は実装完了ではなく、三経路の比較・ブラウザ実測・resource/cancel/error確認後の受入判断である。既存チャート・サマリーの見た目を残すことは互換UIの維持であり、legacy計算や固定1024を残すことではない。

### Phase 8-0: cleanup前のre-baseline（完了）

- 状態: done（Phase 7の最終HEAD `7457c0e`を基準に、削除前の状態分類、依存関係、gate、公開asset契約を再定義した）。
- 目的: Phase 8-1で正しいproduction経路、比較・再生成用資産、migration残存、削除候補を混同せず、削除後も同等以上の検証を再現できるようにする。
- 状態分類: `open`（現行実装に対する未完了）、`done`（完了）、`obsolete`（現行方針では実施しない）、`historical`（過去の実装・判断の記録）。
- Phase 8-1の開始条件: legacy calculation core、`src/data/` wrapper、precomputed JSON、runtime asset、generator、migration/comparison test、`published-bucket` compatibility codeを、production使用中、comparison/regression用、generator/regeneration用、migration残存、dead/削除候補の5分類でsymbol/export単位まで棚卸しする。Phase 8-0では分類本体や削除を開始しない。
- Gate: docs-only変更として`npm run lint:markdown`（23 files、0 issues）と`git diff --check`を最終HEADで成功させる。production code、generator、asset、依存関係は変更しないためfull code gateとbrowser acceptanceは再実行対象外とする。

#### Phase 8-1 inventoryの表形式

Phase 8-1ではファイル単位の一括判定を避け、mixed-use moduleのsymbol/export単位で次の列を埋める。

| 列 | 記録内容 |
| --- | --- |
| `path` | 対象ファイルのパス |
| `symbol/export` | mixed-useの場合に対象となるexportまたはsymbol |
| `category` | 5分類のいずれか |
| `production importer` | production codeからの参照元 |
| `test/reference importer` | test・比較・referenceからの参照元 |
| `runtime/deploy dependency` | fetch、public asset、Worker、cacheなどの実行・配布依存 |
| `regeneration dependency` | generator、reference data、再生成手順との関係 |
| `replacement evidence` | 代替済みの独立test、oracle、schema、runtime実装 |
| `proposed action` | `keep` / `split` / `move` / `delete` |
| `prerequisite` | 削除・分離前に満たす条件 |
| `acceptance` | 変更後に確認するgate、runtime smoke、asset URLなど |

#### Phase 8-1のsplit候補

- `src/components/Attack/ChartSetter.js`: Phase 8-2Aでproduction canonical adapterを残し、legacy 1024-array helperは`LegacyChartSetter.js`へsplit済み。legacy APIは削除条件が整うまで保持する。
- `src/data/PrecomputedDataRepository.js`: Phase 8-1ではproductionで使うD10 lazy asset経路と、DX・DR・livingdead loader、comparison cacheが同居するsplit候補だった。Phase 8-2Dでsourceを分離し、Phase 8-2G5でcompatibility facade自体を削除した。
- `src/data/Distribution.js`、`src/data/FFT.js`: canonical calculation coreからも使用中であり、`src/data/`全体をlegacy扱いしない。production symbolとlegacy/reference symbolを分離して判定する。

#### `data:check`から後継gateへの対応

| 現行gate | 保証している内容 | Phase 8-1での後継gate | 削除前の条件 |
| --- | --- | --- | --- |
| `npm run data:check` | 旧dense `src/data/*.json`の形状・確率・旧形式からschema-v1 referenceへの変換 | generatorのschema/manifest validation、`generator:test`のnumerical audit・exhaustive reference・current asset equivalenceへ保証を移す | 旧dense JSONと変換スクリプトをreference fixtureとして保持し、同じsemanticの独立検証を確認する |
| `npm run data:verify-generator` | Python generatorがpublic schema-v2/revision-1 assetsを再生成できること | 同じgateをgeneratorの再生成・manifest検証の基準として維持する | 全assetの再生成、manifest、SHA-256、配布先の一致を確認する |
| `npm run generator:test` | generatorの分布、数値監査、独立全列挙、current asset equivalence | 同じgateを独立oracleとして維持し、必要なschema validationを追加する | `src/data/*.json`なしで同等のboundaryとreferenceを保護できることを確認する |
| `npm run generator:test:simulation` | 乱数シミュレーションとの統計的一致 | 同じsimulation gateを維持する | 代表入力のsimulationがreference assetに依存せず成功することを確認する |
| `npm test`のlegacy/migration test | 旧実装・旧assetとの回帰比較 | canonical rule、range、presentation、runtime integration testとoracle coverage mapへ移す | semanticごとに独立testが同等以上に保護し、比較test削除後も全gateが成功することを確認する |

この表は後継gateの設計であり、Phase 8-0では`data:check`、legacy JSON、比較コードを削除しない。

#### Phase 8-1へ引き継ぐ不変条件

- canonical Check、Attack、Backtrackのproduction経路を維持する。
- D10 lazy asset、`RuntimeDamageRollWorker`、`RangePlanner`、`ResourceGuard`を削除・置換しない。
- `published-bucket`はcomparison/compatibility用途として残り得る。1024/1022境界testは用途を確認するまで削除しない。
- canonical resultのexpected value契約を維持する。exactでないDamage/Total等は`—`とし、Scoreもcertificateが保証できない場合は`—`とする。小さいprobability tailを理由にexpected valueの不確かさを無視しない。
- Attack chartのprobability表示は`ChartPercentages.js`で内部確率を百分率へ変換し、`Math.round(probability * 1000) / 10`で0.1 percentage pointへ丸める。`0 → 0`、`0.12349 → 12.3`、`0.1235 → 12.4`、`0.12351 → 12.4`、`1 → 100`などの境界はPhase 8-2Aでgolden testを固定した。Check/Backtrack summaryの丸めへglobalに適用せず、新しい確率単位も導入しない。
- JSON、runtime asset、generatorは一括削除せず、production import graph、公開URL、再生成手順を個別に確認する。

#### `LegacyCanonicalComparison`削除前のoracle coverage map

| semantic | 独立oracle / boundary test |
| --- | --- |
| Score（dice、critical、positive/negative skill、yousei、shihai、failure/fumble、tail certificate） | `tests/canonicalCheck.test.js`、`tests/dxOnDemand.test.js`、`tests/runtimeRuleValidation.test.js`（独立expectedとcanonical actual） |
| Damage（fixed damage、defence、kazanari、reaction、output overflow、positional Score tail、mixed tail） | `tests/canonicalDamageOnDemand.test.js`、`tests/runtimeDamageOnDemand.test.js`、`tests/canonicalChartSeriesAdapter.test.js`、`tests/runtimeRuleValidation.test.js`（独立expectedとcanonical actual） |
| Total（aggregation、overflow、multiple combos） | `tests/canonicalDamageAggregation.test.js`、`tests/canonicalTotalDamageClient.test.js` |
| Backtrack（supported D-lois、normal/nightmare、negative values、finite support） | `tests/backtrackCanonical.test.js`、`tests/backtrackCanonicalIntegration.test.js`、`tests/runtimeRuleValidation.test.js`（独立expectedとcanonical actual） |
| Presentation（PMF、upper-tail、expected-value certificate、unavailable `—`） | `tests/canonicalChartSeriesAdapter.test.js`、`tests/attackCanonicalDisplayIntegration.test.js`、`tests/attackScoreDisplayAdapter.test.js`、`tests/attackDamageDisplayAdapter.test.js`、`tests/checkSummaryTable.test.js` |

legacy comparisonを削除できるのは、対応するsemanticがこの表の独立oracle・boundary testで同等以上に保護され、比較testを外した最終gateが成功した場合だけとする。テスト総数だけを根拠にしない。

`tests/runtimeRuleValidation.test.js`は独立したexpected/reference logicを含み、actual側は`src/calculation/`のcanonical Score、Damage、Backtrack coreを直接使う。公開assetの整合性は`tests/precomputedAssets.test.js`とgeneratorで別に検証するため、このテストはlegacy wrapperやasset登録に依存しないruntime rule oracleとして扱う。

#### 公開assetとruntime smokeの方針

`public/data/schema-v2/revision-1/`は公開後immutableとし、同一revision内のファイルをGit cleanupと同時に削除しない。productionで不要になったassetを減らす場合は新しいrevisionを作成し、旧revisionの保持期間とretirement条件を別途決める。Git上のcleanupと公開URLの削除は別の判断である。

Phase 8-1で、Node/Vitestで検証するdependency contract testと、Vite build/preview上の実browserで検証するproduction browser smokeを別gateとして定義した。Phase 8-2Bでは前者を`tests/productionDependencyContract.test.js`として実装し、通常Check、Attackの防御ダイス0/1以上、Backtrack、legacy fallback 0、runtime DR provider、D10 readiness失敗時のlease解放をmock/stubで固定した。Production browser smokeはreal asset URL、404なし、canvas/chart rendering、console warning/error 0、D10 lazy fetch成功、DX/DR/livingdeadのunexpected fetch 0を確認する後続gateであり、Phase 8-2Cで実行済みである。

Phase 8-1ではfull verificationを1コマンドで再現できる状態（候補: `npm run verify`）を目標にするが、Phase 8-0ではCI triggerや既存scriptを変更しない。

### Phase 8-1: 事前計算JSONとlegacy資産を整理する（インベントリ完了）

- 状態: done（削除前のsymbol/export単位インベントリを[`phase8-inventory.md`](./phase8-inventory.md)に記録し、runtimeRuleValidationのoracle位置付け、dependency contract/browser smokeの分離、revision-1 asset表記、manifest/barrel分類を実装実態に合わせて最終補正した。cleanupそのもの、公開URLのretirement、JSONの削除はPhase 8-2以降で別途判断する）。
- 成果物: canonical既定化後のproduction import graph、既存JSON・公開asset・再生成コード・legacy/comparison testの分類、1022/1023/1024境界とrounding coverageの棚卸しを[`phase8-inventory.md`](./phase8-inventory.md)に記録した。
- closure補正: `runtimeRuleValidation.test.js`は独立expected/reference logicを持つがactual側のcanonical移植前であり、Node/Vitestのdependency contract testと実browserのproduction smokeを別gateとして定義した。Phase 8-2Bではclient境界テストを追加し、実browser smokeはPhase 8-2Cで完了した。revision-1は32 data assets + `manifest.json`で、manifestはruntime fetchではなくgenerator/deploy contract、`src/calculation/index.js`はG3完了時点でproduction・tests・scripts・experimentsから参照されない互換barrelとして分類した。
- 完了条件: productionが不要な事前計算JSONに依存しないことを確認し、必要なasset fetch、再生成、失敗時のerror/re-input案内、配布サイズ、削除前の独立oracleを個別に比較できる。Phase 8-1では削除を行わない。
- 対象外: 計算パラメータ入力上限の変更、表示windowの契約変更、Cloudflare Workers/API/MCP、既存履歴の削除。

JSON整理はブラウザ内canonical計算と表示契約が安定した後に独立して行う。Phase 8-1では[`phase8-inventory.md`](./phase8-inventory.md)で、legacy calculation core、`src/data/` wrapper、precomputed JSON、runtime asset、generator、migration/comparison test、`published-bucket` compatibility codeを、productionで使用中、comparison/regression用、generator/regeneration用、migration残存、dead/削除候補の5分類で棚卸しした。Phase 8-2A〜2FではChart adapter分離、CalculationClient dependency contract、production browser smoke、precomputed repositoryのproduction/reference source split、reference/legacy importer auditとD10 validator closure、runtimeRuleValidation actual migrationを追加し、Phase 8-2G1ではcompatibility facadeのtest importer、Phase 8-2G2ではscripts/experimentsのfacade importer、Phase 8-2G3ではcalculation barrelのimporterを所有moduleへ直接移行し、Phase 8-2G4ではbarrel自体、Phase 8-2G5ではcompatibility facadeと専用testを削除した。production import graphと再生成用途を維持したまま、分類結果に基づく後続cleanup候補を記録している。JSON、asset、generatorは一括削除しない。入力上限を変える変更と既存JSONを削除する変更は、原因と影響を切り分けるため同一コミット・同一受入条件にしない。

### Phase 8-2A: Attack chart adapter分離（完了）

- `ChartSetter.js`をcanonical adapter、options、style専用とし、legacy `getAttackScoreChartData`、`getAttackDamageChartData`、`clipData`、`range`依存を`LegacyChartSetter.js`へ移した。
- `ChartPercentages.js`とrounding golden testを追加した。production Vueからlegacy moduleへのimportはない。
- 公開asset、JSON、generator、計算意味論、入力・表示windowは変更していない。

### Phase 8-2B: production dependency contract（完了）

- `tests/productionDependencyContract.test.js`で、Checkがprecomputed loaderを要求しないこと、Attackの防御ダイス0/1以上におけるD10 readiness境界、runtime DR/D10 getterの受け渡し、D10失敗時のDamage未開始とresource lease解放、Backtrackのpublic D10/livingdead loader非依存、legacy dependency/fallback未使用を固定した。
- production code、public asset、JSON、generator、Worker protocol、RangePlanner、ResourceGuardは変更していない。
- browser network smokeはPhase 8-2Cで実装・実行し、実配布物のD10 lazy fetchと不要revision-1 asset request 0を確認した。PrecomputedDataRepository splitはPhase 8-2Dで判断する。

### Phase 8-2C: production browser smoke（完了）

- `scripts/production-browser-smoke.mjs`と`npm run smoke:production`を追加し、必ず`vite build`した成果物を空きportの`vite preview`で配信してからPlaywright Chromiumで検証するようにした。既存のexperiment runnerは変更していない。
- Check、Attack、Backtrackをそれぞれfresh browser contextで確認し、Attackでは同一context内で防御ダイス0から1へ変更してD10 lazy fetchを連続操作で確認した。Checkはcanvas 1、Attackは初期・変更後ともcanvas 2、Backtrackはcanvas 3だった。
- Check、Attack初期、Backtrackではrevision-1 asset request 0を確認した。Attackで防御ダイスを1へ変更した場合だけ`/data/schema-v2/revision-1/d10.json`を1回（HTTP 200）取得し、DX、DR、livingdead、manifestなど他のrevision-1 asset requestは0だった。
- 全ケースでsame-origin HTTP error 0、console warning/error 0、pageerror 0、same-origin requestfailed 0を確認した。revision-1 public assetの削除・URL変更、UI/計算意味論の変更は行っていない。PrecomputedDataRepositoryのsource splitはPhase 8-2Dで実施した。

### Phase 8-2D: PrecomputedDataRepositoryのproduction/reference分離（完了）

- 開始条件: Phase 8-2B dependency contract、Phase 8-2C production browser smoke、D10 lazy fetch/readiness contractが完了していること。revision-1 public URLはimmutableとして維持する。
- 対象: D10 production loader/cacheと、DX・DR・livingdeadのcomparison/reference loaderをsymbol単位で分離する。public assetとgeneratorの削除・revision変更はこの単位に含めない。
- 実装: `PrecomputedDataSchema.js`へschema/revision/base path/sparse validatorを分離し、`D10PrecomputedDataRepository.js`へproduction D10 loader/cache、`ReferencePrecomputedDataRepository.js`へDX/DR/livingdead loader/cacheを移した。`PrecomputedDataRepository.js`は互換re-exportと全cache clearだけを担うfacadeとして保持し、CalculationClientと比較・migration用data wrapperは直接のsplit moduleを参照する。
- 挙動維持: D10 lazy fetch、pending request dedupe、失敗後retry、sparse validation、finite-support expansion、DX/DR/livingdead reference API、DR LRU 3件、全cache clearを既存テストと直接repositoryテストで確認した。
- 完了条件: production import graphがD10経路だけを保持し、reference/migration testが明示したloaderへ移行され、full JS gateとproduction browser smokeが再び成功することを満たした。公開asset、JSON、generator、計算意味論は変更していない。次はPhase 8-2Eの監査結果に基づくruntimeRuleValidation actual側移行である。

### Phase 8-2E: reference/legacy importer再監査（完了）

- 対象: 互換facade、legacy core、migration/comparison、benchmark、asset fixture、公開JSONの参照元を再監査し、独立oracleへ移行できる単位と保持期間を確定した。
- 対象外: production D10 loader、canonical計算意味論、revision-1公開URL、JSONの削除、Cloudflare Workers/API/MCP。
- 完了条件: 削除候補ごとにproduction importer 0、独立oracle coverage、公開asset保持条件、再生成手順を[`phase8-inventory.md`](./phase8-inventory.md)へ記録し、今回の監査ではdelete-readyなし、runtimeRuleValidation actual側移行を次段階とした。D10 repositoryのschema、dataset、distribution count、probability、success cacheの直接テストも追加した。

### Phase 8-2F: runtimeRuleValidation canonical actual migration（完了）

- 対象: `tests/runtimeRuleValidation.test.js`のactual側を`src/data/` wrapperから`src/calculation/` canonical coreへ移行し、expected側の独立ルール計算をoracleとして維持する。
- 対象外: legacy core、compatibility facade、dense JSON、public revision-1 asset、generatorの削除。これらはactual移行と独立oracle coverageが成立した後のPhase 8-2Gで個別に判断する。
- 実装: Scoreは`calculateScoreCanonical`／`getCanonicalScoreSummary`、Damageは`calculateCanonicalDamageOnDemand`／`generateMixedDamageDistribution`／独立D10 provider、Backtrackは`calculateFinalEncroachmentCanonical`／`createBacktrackCanonicalPresentation`へ接続した。Score envelopeの`result`／`metadata`とcanonical finite supportをテスト側で明示し、legacyの1024 bucketや公開asset登録を使わない。
- 完了条件: `runtimeRuleValidation.test.js`から`src/data/ScoreCalculator.js`、`DamageCalculator.js`、`BacktrackCalculator.js`、`PrecomputedDataRepository.js`へのimportが0であり、canonical actualとindependent expectedの一致、全JS/data/generator gateが成功することを確認した。これはリポジトリ全体のlegacy wrapper importer 0を意味しない。

### Phase 8-2G: legacy/reference importerの個別cleanup（完了）

- 対象: `calculator.test.js`、migration/comparison test、calculation barrel、compatibility facade、legacy core、dense JSONについて、Phase 8 inventoryのA/B/C/D分類に従って参照移行・保持・削除候補化を個別に判断する。
- 対象外: production canonical core、D10 repository、revision-1公開asset、generator、Cloudflare Workers/API/MCP。
- 状態: Phase 8-2G1〜2G6のimporter・facade整理に続き、G7（legacy comparison/migration dependency consolidation）、G8（legacy calculation surface retirement）、G9（dense JSON・schema-v1・旧JS generator retirement）、G10（残存legacy/dead code監査とPhase 8 closure）まで完了している。Phase 8のcleanup条件、独立oracle、再生成手順、最終gateを満たした。
- 完了条件: 各削除候補に独立oracle coverage、公開asset保持条件、再生成手順、full JS/data/generator gateを記録し、global wrapper/barrel importerの削除範囲を明示する。

### Phase 8-2G1: compatibility facade test importer移行（完了）

- `tests/`のfacade importを実測し、単なるre-export利用だった8テストを`D10PrecomputedDataRepository.js`または`ReferencePrecomputedDataRepository.js`へ直接移行した。
- `tests/precomputedDataRepository.test.js`だけはfacade compatibility regressionとして残した。legacy calculator、migration/comparisonの意味、public JSON、production `src/`は変更していない。
- `scripts/benchmark-calculators.mjs`、`scripts/benchmark-phase2h.mjs`、`scripts/benchmark-full-tail-attack.mjs`、`experiments/**`のfacade参照はPhase 8-2G2で直接repositoryへ移行した。
- `tests/`のfacade importがcompatibility testだけであること、targeted/full JS gate、lint、Markdown lint、build、`git diff --check`の成功を確認した。

### Phase 8-2G2: scripts/experiments facade importer移行（完了）

- `scripts/benchmark-calculators.mjs`、`scripts/benchmark-phase2h.mjs`、`scripts/benchmark-full-tail-attack.mjs`、`experiments/runtime-dr/damage.js`、`experiments/phase2h-browser/browser-benchmark.js`、`experiments/dynamic-distribution-ranges/browser-benchmark.js`の6件を直接repositoryへ移行した。full-tail benchmarkはD10だけをロードし、その他は必要なD10/Reference repositoryを分けてロードする。
- benchmark case、測定条件、legacy/canonical比較、report schema、public revision-1 asset pathは変更していない。facade本体、tests、production code、calculation barrelは変更していない。
- `src`、`tests`、`scripts`、`experiments`の対象範囲でfacade importerが`tests/precomputedDataRepository.test.js`だけになったことを確認した。

### Phase 8-2G3: calculation barrel importer移行（完了）

- `src/calculation/index.js`を利用していたtests、comparison、benchmark、browser experimentを、利用symbolのowner moduleへ直接importする形へ移行した。barrel本体、canonical/legacyの意味論、比較fixture、benchmark条件、public asset、generatorは変更していない。
- `src`、`tests`、`scripts`、`experiments`のbarrel importerとcalculation barrelのSSR loadが0件であることを`rg`で確認した。dynamic importやpackage exportの参照もなく、`src/calculation/index.js`はG4で単独削除した。

### Phase 8-2G4: calculation barrel削除（完了）

- G3でowner moduleへ移行したこと、global/dynamic/package importer 0、barrelに副作用がないことを確認したうえで、`src/calculation/index.js`を単独削除した。
- facade、data wrapper、legacy core、`LegacyCanonicalComparison`、JSON、asset、generator、benchmark caseは変更していない。full JS/build gateを削除後のHEADで再確認した。

### Phase 8-2G5: PrecomputedDataRepository compatibility facade削除（完了）

- G5開始時点でfacade importerは`tests/precomputedDataRepository.test.js`だけだった。専用testに残っていたDXのconcurrent shard load dedupe/cacheとdata revision mismatchの2ケースを`tests/referencePrecomputedDataRepository.test.js`へ移植した。
- 既存のDX retry、D10 finite-support、livingdead finite-support coverageは各direct repository testで保持し、`tests/precomputedDataRepository.test.js`と`src/data/PrecomputedDataRepository.js`を削除した。
- `D10PrecomputedDataRepository.js`、`ReferencePrecomputedDataRepository.js`、`PrecomputedDataSchema.js`、public asset、generator、計算意味論は変更していない。削除後の旧facade importerと`clearPrecomputedDataCache`は0件である。

### Phase 8-2G6: canonical data wrapper retirement（完了）

- `src/data/ScoreCalculator.js`、`DamageCalculator.js`、`BacktrackCalculator.js`の全consumerを監査し、coreと明示的なrepository依存へ直接移行した。
- 3つのdata calculator wrapperを削除した。テストlocal helperは既存のCalculationClient依存シグネチャや比較fixtureを保つために各consumer内へ限定し、新しい共有adapter moduleは追加していない。
- legacy calculation core、`LegacyCanonicalComparison`、dense JSON、public asset、generator、benchmark条件、計算意味論は変更していない。wrapper参照のglobal/static/SSR検索は0件である。
- G6C closure（2026-08-28）として、G5/G6対象のrepository・assetテスト22件、`benchmark:calculators`、`benchmark:phase2h -- --iterations 1 --warmup 0`、全Vitest（64 files / 908 tests）、ESLint、Markdown lint（24 files / 0 issues）、production build、`git diff --check`がすべて成功した。wrapperのimport・SSR load・文字列参照0件も再確認し、`dynamic-distribution-ranges/benchmark-phase2e.mjs`も全ケースをエラーなしで完了した。

### Phase 8-2G7: legacy comparison/migration dependency consolidation（完了）

- legacy core、migration/comparison test、dense JSON、公開reference assetの依存関係を再監査し、独立oracle coverageと再生成手順を保ったまま削除・保持単位を判断した。
- legacy比較の意味論、fixture、許容誤差を維持したまま、migration test・legacy rule oracle・legacy-only benchmarkを独立したcanonical/runtime/generator検証へ移行した。JSON、公開asset、Python generator、比較utilityなど保持対象は変更していない。

### Phase 9: Cloudflare Workers、HTTP API、MCPを将来目標として再評価する

- 成果物: static SPAとブラウザ内計算を維持したまま、Cloudflare Workers移行の必要範囲、HTTP API/MCPの要件、security、資源、serialization、運用責任を別設計として判断する記録。
- 完了条件: coreのcanonical/display contract、表示window、資源制限、error、cancel/stale、asset境界が安定し、外部境界を追加する価値とリスクをユーザーが判断できる。
- 対象外: 今回の移行でのCloudflare Workers新規経路、HTTP API、MCPの実装、測定なしのブラウザWeb Worker protocol追加、静的SPAの置換。

Cloudflare Workers/API/MCPは今回決めず、canonical移行の完了後に実測と運用要件から再評価する。外部境界を追加する場合も、既存のcore契約とdisplay contractを再利用し、UI移行や入力上限変更と同時に進めない。

### Release hardening / publication（Phase 8とは別checkpoint）

- 状態: open。Phase 8のcleanupと同時にrepository historyや公開URLを変更せず、release時に別途受入する。
- 対象: canonical release sourceの決定、clean-history release strategy、default branch、CI policy、Cloudflare Pages source、LICENSE、公開ドキュメント、supported browser/device、最終resource threshold。
- 原則: Git cleanupと公開済みasset URLのretirementを分離し、`public/data/schema-v2/revision-1/`を同一revision内で削除しない。release前にproduction dependency smokeとfull local gateを実行し、実際に確認した環境・結果だけを記録する。
- 現在の公開状態: repositoryはすでにpublicで、default branchは`main`、LICENSEは未設定である。clean-history release strategyは新しいrelease repositoryを作る場合の方針であり、既存のpublic historyを非公開化・rewrite・削除することを意味しない。

## ブランチとコミット単位の推奨

- Phase 0は現行Attack safe pathの実装・契約テスト・文書をレビューしてコミットする作業単位とする。debug panel、toggle、安全projectionは検証用として残すが、本番採用の作業とは分離する。
- Phase 1は入力・要求ライフサイクル専用ブランチ（例: `codex/input-request-coordinator`）、Phase 2はcanonical display contract（例: `codex/canonical-display-contract`）、Phase 3はdisplay range planner/Chart adapter（例: `codex/display-range-planner`）に分け、各経路の本接続を混ぜない。
- Phase 4〜6は経路ごとのブランチ（例: `codex/check-canonical-display`、`codex/attack-canonical-display`、`codex/backtrack-canonical-display`）で、producer、adapter、既存表示への供給、比較テスト、文書をレビュー可能な小さなコミットに分ける。Attackではcanonical batchを主対象とし、削除予定のlegacy combo/totalへ新しいcoordinatorを重複実装しない。
- Phase 7の既定化とproduction legacy経路/fallback削除、Phase 8のJSON・assets・generator整理、Phase 9のCloudflare Workers/API/MCP判断は、それぞれ独立した承認可能なコミットにする。計算パラメータ入力上限、表示window、JSON、ブラウザWeb Worker protocol、Cloudflare Workers境界の変更を一つの移行コミットへ集約しない。

## リスクと判断ポイント

- overflowのkindを失うと、上限やoverflowの`lowerBound`を実在する確率・damageとして表示する。`exact`と`upper-bound`の集約条件、overflowの`lowerBound`、expected valueの範囲をfixtureで検証する。
- 1024 published bucketは比較fixtureであり、dynamic windowやfull-tailと同じ表示ではない。safe integer windowの長さ、bucket境界、上側tail、描画点数、メモリを測定し、`ResourceGuard`で制限できることを確認する。
- combo別結果とtotalの期待値・supportが一致しない可能性がある。totalをcombo値の単純な丸めや平均として作らず、canonical producerの結果を表示契約で検証する。
- Check、Attack、バックトラックは数値の意味、資産、入力範囲、UIの比較対象が異なる。共通契約の共有と経路固有のvalidationを分離する。
- ブラウザWeb Workerの実cancelは計算時間だけでなく、生成、message往復、transfer、cancel/stale、asset fetch、エラー診断を含めて判断する。Cloudflare Workersの採用はPhase 9で別途判断し、測定結果だけで新しいprotocolやUI切替を正当化しない。
- legacy fallbackは移行中の比較用に限り、canonicalとの差を隠す仕組みではない。Phase 7ではlegacy計算とfallbackを削除し、資源制限・error時は旧結果ではなく既存のerror/re-input案内へ接続する。

## 決定済みの方針

- 表示windowは非負safe integerの`min`/`max`を原則受け入れ、window長・メモリ・Chart.js描画負荷が問題になる場合だけpreflight/resource guardで拒否する。
- 本番のチャート・サマリーは既存の見た目、ラベル、確率1桁丸め、summary丸めを維持する。不確かさやboundは通常UIへ明示しない。
- `CanonicalAttackPanel`、`canonicalOptIn`、canonical debug表示、1024固定projection、production legacy計算、production legacy fallbackはPhase 7で削除済みである。canonical resource/error時は旧結果へfallbackせず、既存のerror/re-input案内へ接続する。下位legacy core、reference asset、比較・migration testは後続cleanupの前提が整うまで維持する。
- 静的SPAとブラウザ内計算を今回の公開形態として維持し、Cloudflare Workers、HTTP API、MCPはcanonical移行完了後の将来目標として再評価する。
- 通常の対話操作はlatest-winsを基本とし、初期化、Attack全combo batchのatomic commit、共有asset/cacheは別のライフサイクルとして扱う。実行中ブラウザWeb Workerのcancelは今回の移行対象外とする。

## 後続release hardeningと保留中の設計判断

- done: resource rejectionの見積り式、window長・描画点数のbudget、memory/capacity rejection、error/re-input案内はRangePlanner、ResourceGuard、既存browser acceptanceで確定した。warning/hard thresholdは50/200msを暫定維持する。
- done: latest-winsでは計算中に直前の成功結果へfallbackせず、失敗・reject・stale時に結果をclearしてinput世代を混在させない契約を採用した。
- done: 表示window変更時は明示coverage内ならprojectionを再利用し、不足時はcanonical再計算する。finite support外の既知0、位置不明Score tail、Damage-output overflowは別のcertificateとして扱う。
- done: Check、Attack、Backtrackの比較、browser acceptance、resource/cancel/error確認、canonical default化、最終HEAD gateを完了した。
- open（release hardening）: 低速実機を含むthreshold再評価、supported browser/deviceの明文化、最終resource policy、full verificationの単一コマンド化を行う。production dependency smokeはPhase 8-2B/2Cで完了しており、これらはPhase 7完了を取り消す未決定事項ではない。
- done（Phase 8-1）: [symbol/export単位のinventory](./phase8-inventory.md)を作成し、保持・split・move・delete-candidateを個別判断した。実際のcleanupはPhase 8-2以降で行う。
- done（Phase 8-2A）: Attackの`ChartSetter.js`からlegacy array adapterを`LegacyChartSetter.js`へ分離し、canonical adapter、options、styleのproduction importを維持した。`ChartPercentages.js`を追加してcanonical/legacy Attack chartの表示丸めを共有し、`0`、`0.12349`、`0.1235`、`0.12351`、`1`のgolden testとTypedArrayのowned Array変換を固定した。公開asset、JSON、generator、計算意味論、入力・表示windowは変更していない。`npm test`、ESLint、Markdown lint、build、`git diff --check`をgateとする。
- done（Phase 8-2B）: `tests/productionDependencyContract.test.js`でCalculationClientのproduction dependency boundaryを固定した。Checkはprecomputed loaderを要求せず、AttackはD10 readinessを防御ダイス>0でのみ要求し、Damageへruntime DR providerとD10 getterを渡す。D10失敗時のDamage未開始・lease解放、Backtrackのpublic asset非依存、legacy dependency/fallback未使用も確認した。production code、asset、JSON、generator、Worker protocol、RangePlanner、ResourceGuardは変更していない。
- done（Phase 8-2C）: `scripts/production-browser-smoke.mjs`で`vite build`成果物を`vite preview`からPlaywright Chromiumへ配信し、Check、Attack初期、Attack防御ダイス1、Backtrackのcanvas・revision-1 asset request・D10 status・same-origin HTTP/console/page/request failureを確認した。public asset削除、revision変更、UI/計算意味論の変更は行っていない。
- done（Phase 8-2D）: `PrecomputedDataSchema.js`、`D10PrecomputedDataRepository.js`、`ReferencePrecomputedDataRepository.js`へsourceを分離し、productionのprecomputed importerをD10へ限定した。互換facadeはre-exportと全cache clearに縮小し、D10直接テスト、reference直接テスト、既存facadeテスト、full JS/data/generator/browser smoke gateを通過させた。公開asset、JSON、generator、revision-1 URL、計算意味論は変更していない。
- done（Phase 8-2E）: `tests/d10PrecomputedDataRepository.test.js`へschema mismatch、dataset mismatch、distribution count mismatch、invalid probability、成功後のpersistent cacheを追加し、Phase 8-2Dのvalidator/cache closureを完了した。`docs/phase8-inventory.md`へ`rg`実測に基づくsymbol/export/importer監査表を追加し、compat facade、legacy wrapper/core、comparison/migration、benchmark/experiment、dense/public/reference asset、generatorのreplacement target、blocker、次 action、削除予定単位を記録した。今回の段階ではsource、asset、JSON、generatorを削除せず、runtimeRuleValidation actual側移行をPhase 8-2Fへ送った。

## Phase 8-2G7: legacy comparison / migration responsibility consolidation（完了）

- migration-onlyの`dxDataMigration.test.js`、`damageMigration.test.js`、`backtrackMigration.test.js`とlegacy rule oracleの`calculator.test.js`を削除した。
- Backtrack presentation/producer testsからlegacy結果比較を除去し、境界値・ルール表・canonical finite-supportを直接検証する形へ整理した。
- Attack display adapter testsからlegacy Score spyを除去し、production clientがcanonical Scoreだけを呼ぶ契約を維持した。
- legacy専用の`benchmark-calculators.mjs`とpackage scriptを削除した。canonical/runtime/full-tailの測定は別のbenchmark laneで保持する。
- 削除前のcase replacementは`docs/phase8-inventory.md`へ記録した。legacy計算source、`LegacyCanonicalComparison`、dense JSON、schema-v1、公開schema-v2 revision-1 asset、Python generatorはこの段階では保持する。
- 次はG8としてlegacy calculation surfaceと比較utilityを削除し、その後G9で旧dense JSONとschema-v1 JS pipelineを削除する。

### Phase 8-2G8: legacy calculation surfaceの撤去（完了）

- Score、Damage、Backtrackのlegacy public APIを削除し、canonical producer／summary／on-demand経路だけを残した。
- `LegacyCanonicalComparison`、専用比較テスト、`tests/legacy/LegacyCalculator.js`を削除した。canonical damageテストはcanonical score envelopeを入力し、Backtrack生成テストは独立した完全support生成器を直接検証する。
- legacy比較を含むPhase 2-H core benchmarkを退役し、canonical Attack／full-tail resource benchmarkへ測定責務を集約した。canonical Playwright runnerの既定targetもcanonical Attackへ変更した。
- 検証: `npm test`（57 files / 766 tests）、`npm run lint`、`npm run lint:markdown`（24 files / 0 issues）、`npm run build`、`git diff --check`が成功した。
- 次はG9としてdense JSON、旧JS生成script、schema-v1 reference treeをPython generatorへ一本化して削除する。公開schema-v2 revision-1は変更しない。

### Phase 8-2G9: dense JSONとschema-v1生成系の撤去（完了）

- `src/data/`の旧dense JSON 4本、旧JS生成script、dense-data test、`reference-data/schema-v1`を削除した。
- `data:generate`／`data:check`のコマンド名は維持し、Python generatorの`generate`／`verify`へ委譲した。generatorのcurrent-asset testは公開schema-v2 revision-1を照合する。
- 公開`public/data/schema-v2/revision-1/**`は変更していない。旧ファイルはGit履歴から参照できるため、再生成用の現行ソースはPython generatorに一本化された。
- 検証: `npm run data:check`（32 assets）、`npm run generator:test`（18 passed / 13 deselected）、`npm run generator:lint`、`npm test`（56 files / 763 tests）が成功した。
- 次はG10として、G7〜G9で自然にdeadになった実験・互換コードを監査し、Phase 8のretained/deleted一覧を確定する。

### Phase 8-2G10: 残存legacy/dead code監査とPhase 8 closure（完了）

- `src`、`tests`、`scripts`のlegacy計算API importerを再監査し、production importer 0を確認した。published-bucket adapter、旧チャート形状、Reference/D10 repositoryは利用箇所が残るため保持した。
- G8後に実行不能となったdynamic-distribution-rangesのPhase 2-E／2-F Node・ブラウザハーネスと、未参照の`experiments/runtime-dr/damage.js`を削除した。planner、benchmark、decision、resultsは歴史資料として保持し、現行測定はcanonical/full-tail benchmarkへ集約した。
- packageから`benchmark:dynamic-distribution-ranges:browser`を削除し、壊れたlegacy harnessを現行コマンドから到達不能にした。旧API、dense JSON、schema-v1、旧JS generatorはG8／G9で退役済みである。
- 公開`public/data/schema-v2/revision-1/**`は変更していない。G10の残存コード分類と削除理由は[`phase8-inventory.md`](./phase8-inventory.md)へ記録した。
- 最終gate: `npm run check:node`、`npm test`（56 files / 763 tests）、`npm run generator:test`（18 passed / 13 deselected）、`npm run generator:test:simulation`（13 passed / 18 deselected）、`npm run generator:lint`、`npm run lint`、`npm run lint:markdown`（24 files / 0 issues）、`npm run build`、`npm run smoke:production`、`npm run data:check`（32 assets）、`git diff --check`が成功した。
- Phase 8は、canonical production、必要なpublished-bucket互換、公開schema-v2 asset、Python generator、独立検証資料だけを保持する状態で完了した。Cloudflare Worker/API/MCPは従来どおり将来目標とする。

## 参照文書

- [todo.md](./todo.md): RangePlanner/ResourceGuard、canonical Attack、既定経路、JSON整理、外部境界に関する作業履歴。
- [runtime-calculation-algorithms.md](./runtime-calculation-algorithms.md): DistributionResult、canonical Attackの実測、diagnostic UI、安全なlegacy projectionの記録。
- [dynamic-distribution-ranges decision.md](../experiments/dynamic-distribution-ranges/decision.md): published bucket、full-tail、support、overflow、資源制限に関する既存判断。
- [architecture.md](./architecture.md): core、CalculationClient、SPA、Worker/API境界の構成方針。
- [runtime-rule-validation.md](./runtime-rule-validation.md): runtime rule、validation、legacyとcanonicalの意味を混同しないための契約。
