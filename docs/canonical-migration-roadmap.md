# Canonical migration roadmap

この文書は、Attack、通常のCheck、バックトラックの計算結果をcanonical resultへ段階的に移行するための設計判断と実装順序を記録する。移行中は既存のlegacy表示を比較用の安全網として残すが、完了時にはdebug panel、legacy計算、固定1024表示、legacy fallbackを削除し、既存チャート・サマリーの見た目だけを維持する。

## 現在地

- `RangePlanner` と `ResourceGuard` による実行前の範囲計画・資源制限があり、`DistributionResult` がsupport、explicit maximum、overflowを保持するcanonical境界になっている。
- Attackのproduction UIはcanonical batch/presentationを既定経路として、Score/Damage chartとSummaryへ接続済みである。canonical metadata、support、overflow、通常の不確かさは通常UIへ明示せず、保証できないsummary値は`—`とする。CalculationClient legacy APIとclient-level比較fixtureはcleanup第2単位で削除し、legacy core/assets、下位比較fixture、既存1024境界は移行検証用に残している。
- Phase 1は`b72b709`、`4ad088e`、`26174a0`、`3df496c`で完了した。Check、バックトラック、canonical Attack batchが共通coordinatorの最新要求境界、入力snapshot、stale commit防止を共有している。
- 通常のCheck、バックトラック、Attackはcanonical resultを既存表示経路と既定経路へ接続済みである。Attackの初期計算、validated input、combo操作は同じlatest-wins canonical runnerを使い、`/attack` routeのpreloadは行わない。
- CheckのSummaryはcanonical typed summaryを既定表示経路とし、production Checkから1024 published projectionとlegacy `getScoreSummary`依存を除去した。Attackのcanonical summary formatterは共有presentation utilityとしてCheckでも再利用している。
- BacktrackとAttackのcanonical default化はPhase 7の実装単位として完了した。Phase 7全体のlegacy計算・fallback削除、表示範囲拡張、JSON整理は未完了である。1024は事前計算・固定長配列由来の比較用上限として扱い、canonical schemaや最終production表示の上限とはしない。
- AttackのScore/Damage表示範囲は999上限を撤廃し、任意の非負safe integerを受け付ける。表示点数・メモリ・計算量のresource plannerによるrejectは維持する。
- Productionの`CalculationClient`はScore/Backtrackのcanonical計算コアを直接参照し、`src/data/ScoreCalculator.js`と`src/data/BacktrackCalculator.js`のdata wrapperは比較・migration用に維持する。

## 表示範囲と明示coverageの移行対象

現行のlegacy経路では、`src/data/Distribution.js`の`range()`が`DISTRIBUTION_SIZE=1024`に依存し、`src/components/Attack/ChartSetter.js`の`clipData()`が固定長配列を`slice`している。通常のCheckではPhase 4でdynamic display windowを接続し、`src/components/Check/SettingForm.vue`をcontrolled化して表示`min`/`max`の999上限を撤廃した。AttackのSettingForm系（`src/components/Attack/ScoreSettingForm.vue`、`src/components/Attack/DamageSettingForm.vue`）もP1で固定上限を撤廃し、残るlegacy経路と計算上の1024/1022境界は後続で整理する。

数学的なsupport、canonical resultが明示的に保持するcoverage、ユーザーが選ぶ表示windowを分離する。`support`は結果が取り得る値の範囲であり、`explicitMax`は現在のresultに確率値が明示されている上限である。表示windowは非負safe integerの`min`/`max`を原則任意に指定でき、windowが明示coverage内ならresultを再利用する。windowがcoverage外でも有限supportの外側なら確率0として再計算せず、support内で明示値が不足する場合だけ計算範囲を拡張する。upper-tailを正確に得られない場合は拡張計算またはresource rejectionとする。safe integerでも配列長、メモリ、計算量、Chart.js描画負荷が問題になる場合は、preflight、`ResourceGuard`、`DisplayRangePlanner`で制限または拒否する。

chart dataは`min`/`max`の長さのlabels配列を無条件に生成せず、canonical座標を持つ点または必要範囲だけのtyped/sparse dataへ投影する。Chart.jsの`LinearScale`とcoordinate dataを基本とし、decimation・集約は確率の意味と既存の見た目を変えるため通常表示の既定手段にしない。描画点数がbudgetを超える場合は、明示的な別表示モードを追加するまでresource rejectionとする。PMFの範囲外は契約に従って0または省略し、upper-tailはtailの意味を保つ。表示用の確率パーセント1桁丸めとsummaryの既存見た目・丸めは維持する。

既存1024 comparisonは移行検証用fixtureとして残すが、本番表示・canonical schemaの上限とは扱わない。無制限とは仕様上の入力拒否をなくすことであり、メモリ不足や描画不能を放置することではない。

## 最終方針と不変条件

- 当面は静的SPAとブラウザ内計算を維持する。Cloudflare Workersの新規経路、HTTP API、MCPは今回実装せず、coreの契約と実測が安定した後の将来目標として再評価する。
- canonical resultのsupport、overflow、expected valueの意味は内部result/metadataで保持する。通常UIでは不確かさやboundを明示せず、exactな値だけを既存のチャート・サマリー形式へ渡す。非exactな値は必要な範囲を再計算し、正確な表示モデルを作れない場合は既存のエラー・再入力案内へ接続する。特に`upper-bound`を一点の実確率や一点の期待値へ変換しない。
- 既存legacy表示との比較テストを移行中は維持する。canonicalが資源制限やエラーで実行できない場合は、移行中の比較ではlegacy fallbackを許すが、最終productionでは旧結果ではなく既存のエラー・再入力案内へ接続し、legacy fallbackを削除する。

## 三経路で共有する表示契約

Checkやバックトラックを個別の都合で実装する前に、Attackにも再利用できるcanonical display contractを定義する。producerが返す計算結果と、チャート・サマリーが受け取る有限の表示モデルを分離し、表示モデルへ変換できない場合のfallbackも契約の一部にする。

| 項目 | 共有契約で定義する内容 |
| --- | --- |
| Support | `finite`（`support.max`が示す既知の最大値）、`infinite`、`unknown`を区別し、resultの`explicitMax`やmetadataがある場合も`support.max`と同一視しない。有限性を確認できない結果を有限配列として扱わない。 |
| Overflow | `exact`と`upper-bound`を区別して保持する。各overflowにある`lowerBound`はoverflow位置の下限であり、overflow.kindに`lower-bound`を追加したり、異なるkindを同じ一点値に正規化したりしない。 |
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

Phase 3を先に行うことで、固定`range()`、`clipData()`、各経路に残る固定上限を、経路ごとに別の暫定上限へ置き換えずに済む。無制限の入力を許可することと、無制限の配列・描画を実行することを分離する。

#### Phase 3第1単位: 共通DisplayRangePlanner（実装済み）

`src/presentation/DisplayRangePlanner.js`を追加し、`presentCanonicalDistribution`が返すdisplay payloadの`explicit.offset`、`explicitMax`、`support`、`overflow`と要求`displayWindow`をUI非依存に判定できるようにした。明示coverage内は`reuse`、finite supportの右側だけを既知0で補える場合は`explicit-coverage-with-known-zero`、coverage不足でfinite/infinite support内の値が必要な場合は`recalculate`、window全体がfinite supportより右側なら`finite-support-outside`として`known-zero`とする。overflowは一点の確率へ変換せず、upper-boundもcoverageの代わりにはしない。

windowの`max - min + 1`、explicit coverageの終端、Float64Array相当の最小メモリ見積りをsafe integerとして事前検証し、`pointCount`、`float64Bytes`、`chartPoints`をfreeze済みの`estimates`へ返す。係数値の検証はversioned `presentCanonicalDistribution`の責務とし、plannerはArray/Float64Arrayの種別、length、offset/explicitMaxの整合だけをO(1)で検証する。返却rootは`version`、`kind`、`status`、`accepted`、`decision`、`reason`、`displayWindow`、`coverage`、`estimates`、`warnings`、`rejectionReasons`だけを持ち、同じ意味のtop-level/resource入れ子aliasは作らない。`pointCount`は配列長、`chartPoints`は描画負荷という別budgetであり、現在は1座標1描画点の保守的見積りのため数値が同じでもpolicy warningは独立に判定する。既定のwarning/hard thresholdは999/1000のlegacy表示上限ではなく、差し替え可能な資源policyであり、hard超過は`resource-rejected`として返す。ResourceGuardとの接続、計算RangePlannerへの拡張要求、実際の配列・Chart.jsデータ生成はまだ行わない。

`DistributionResult`は`explicit.offset`未満を暗黙に0と保証していないため、低側windowの不足は再計算扱いにする。この判断をテストで固定し、低側を根拠なく既知0へ補完しない。既存1024 coverageでは`0..999`と`0..1023`の再利用をfixtureで固定した。Phase 3単位ではproductionのCheck接続を変更していないが、通常Checkのcanonical producer、既定UI、Chart/Summary接続はPhase 4で実装した。

#### Phase 3第2単位: canonical chart series adapter（実装済み）

`src/presentation/CanonicalChartSeriesAdapter.js`の`createCanonicalChartSeries(display, plan, { mode })`は、plannerのacceptedな`reuse`または`known-zero`だけを、整数座標の`displayWindow`と所有する`Float64Array values`へ変換するpure adapterである。ready結果の公開shapeは`version`、`kind`、`status`、`mode`、`displayWindow`、`values`だけであり、座標の開始値と点数は`displayWindow.min`/`pointCount`から導く。adapterはdisplayの確率配列から独立した新規`Float64Array`を1本だけ作り、windowごとの`labels`、`{x, y}` point object列、確率値の百分率化・丸めを行わない。外側の結果はfreezeするがtyped array自体はfreezeできないため、`values`はcallerがread-only契約で扱う。`explicit.offset`未満は補完せず、plannerの`recalculate`と`resource-rejected`は確率を作らない`not-ready`結果として返す。finite supportの右側だけはplannerの`knownZero`を根拠に0を生成する。

`mode: 'pmf'`は各座標の`P(X = x)`、`mode: 'upper-tail'`は既存`getUpperTailProbability`と同じ`P(X >= x)`である。offsetが0のupper-tailは既存の「1から下側PMFを順に減算する」計算順を保ち、offset付きwindowでは明示suffixから計算を開始する。activeなexact overflowがwindowの`max`以下にある場合、lowerBoundは分布一点を意味しないため`not-projectable`とする。lowerBoundが全thresholdより上のexact overflowだけはsuffixへmassを含められる。activeなupper-bound overflowはupper-tailへ変換せず、PMFでもwindowに重なる場合は拒否する。finite support外の既知0だけはoverflowの種類に関係なく0として投影できる。

Chart.js 4.5.1のローカル実装はtyped arrayをarrayとして認識する一方、`parsing: false`のline dataには内部形式の座標が必要であるため、canonical seriesと最終materializerを分離した。`materializeCanonicalChartJsData`はCategoryScaleへ接続する最後の境界でのみ数値labelsを生成し、datasetにはseriesが所有する同じ`Float64Array`を`data`としてread-only参照し、`parsing: true`を渡す。これはdisplay入力とのaliasではなく、Chart.js用の二重コピーを避ける意図的なseries-to-Chart.js viewである。ローカル実装は数値要素を変更せず配列監視用のmetadataだけを扱うため、materialize後もcallerは`series.values`を変更しない。Phase 3単位ではproduction接続を変更していないが、通常Checkのproducer接続、既定UI、Chart/Summary供給はPhase 4で実装した。Attack/バックトラックのproducer接続とlegacy fallbackの最終削除は未完了である。

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

- 成果物: 三経路の比較結果、ブラウザ実測、性能・資源・cancel/stale・error確認、既存コンポーネントへcanonicalを渡す既定経路、`CanonicalAttackPanel`/`canonicalOptIn`/debug表示の削除、legacy計算・固定1024 projection・legacy fallbackの削除。
- 完了条件: 主要fixtureで数値、support、明示coverage、tail、expected valueの意味、任意display window、表示点数、資源拒否、error/re-input案内がレビュー済みで、既存チャート・サマリーの見た目を保ったままcanonicalが既定になる。canonical計算の失敗時に旧結果を表示しないことを確認する。
- 対象外: この段階での計算パラメータ入力上限の再設計、既存JSONの削除、Cloudflare Workers新規経路、HTTP API、MCP。

第1実装単位（完了）では、バックトラックの初期計算・再計算を`createBacktrackCanonicalRunner`へ統合し、`calculateBacktrackCanonical`から`createBacktrackCanonicalPresentation`を通る既定経路へ切り替えた。条件パネルの一時`canonicalOptIn` toggleを削除し、初期計算も`onMounted`から同じlatest-wins runnerで実行した。canonicalのresource rejection・error・abortでは旧結果へfallbackせず結果をclearし、retry、latest-wins、disposeを維持した。routeのlegacy preload削除とCalculationClient legacy API削除は第2実装単位で完了した。

- ブラウザ受入（2026-08-24、in-app browser / Vite local `--force`）: `/backtrack`で一時canonical toggleは表示されず、初回からcanvas 3、alertなしを確認した。侵蝕率を`90→140→105`と連続入力した後は最終値`105`、canvas 3、alertなしだった。Dロイスを「なし」「不死者・悪夢」「屍人」に変更した各ケースでもcanvas 3、alertなしだった。完全Vue mountはNode test環境制約で未実施だが、runner behavior/router module testで補完した。検証用tab/serverは終了し、port `3000`を解放した。
- Attack実装単位（完了）: Attackの初期計算、validated input、combo追加・削除・複製・並べ替えを`createAttackCanonicalRunner`の一つのlatest-wins laneへ統合し、unmount dispose、clear/no fallback、presentation errorからのretryを維持した。ScoreChart、DamageChart、Summary、totalはcanonical presentationだけを参照し、temporary `CanonicalAttackPanel`と`canonicalOptIn`を削除した。保証できないScore/Damage/Total期待値は`—`とし、通常の不確かさ・approximation warningは表示しない。
- Attack route/依存境界（完了）: `/attack` routeのpreload guardを削除し、cleanup第2単位で`CalculationClient.prepare`と`prepareCalculation`も削除した。canonical防御D10のlazy asset、`RuntimeDamageRollWorker`、legacy core/assetsは維持した。Attack表示フォームの999上限は撤廃済みで、任意の非負safe integer入力を受け付け、表示点数・メモリ・計算量はresource plannerで制御する。計算上の1024/1022境界は変更していない。
- Attack検証（完了）: canonical runnerの初期既定実行、latest-wins、abort、dispose、stale抑止、resource/range/generic/presentation error時のclear/no fallback/retry、canonical-only表示契約、route preloadなしをNode/Vitestで確認した。Vue完全mountは既存Node test環境制約により実施していない。
- legacy削除前の最終比較（2026-08-24、Node/Vitest）: Check/Attack/Backtrackのcomparison・migration・asset・runtime rule・range関連15ファイル229テストを実行し全件成功した。Checkはdice 0/1/99、critical 2/10/11、skill正負、yousei/shihai、failure/fumble、tail certificateを、Attackは既存2-combo fixtureと追加境界fixtureでdice 0/1/2/99、critical 2/11、skill正負、yousei/shihai、defence、fixed damage、kazanariを、Backtrackは7種Dロイス、標準/悪夢境界、負値、asset/on-demand境界をlegacyと比較した。比較可能なScore/Damageは既存のexactまたはtolerance契約で成功し、同じ境界fixtureのcritical 11/dice 0・99のfinite-support subsetではcanonical batchの個別DamageとTotalをlegacy per-combo→legacy totalへ直接比較して成功した。critical 2/youseiを含むfull boundary batchのTotalは`not-comparable`（`total-overflow`）とoverflow certificateを確認し、canonical tailを0扱いせず、legacy total API削除前の残余ギャップとして記録した。
- Phase 7 legacy cleanup第1単位（完了）: 最終比較完了後、productionからimportされないtest-only legacy display adaptersと専用テストを削除した。当時は実計算比較fixture、`LegacyCanonicalComparison`、`CalculationClient` legacy API、legacy core/wrappers、legacy assets/JSON/generatorを後続まで維持した。
- Phase 7 legacy cleanup第2単位（完了）: `CalculationClient`の`calculateCheck`、`calculateAttackCombo`、`calculateTotalDamage`、`calculateBacktrack`、legacy score/damage/backtrack依存注入、legacy fallback、route `prepare`を削除した。`/check`を含む全計算routeからpreload guardを外し、canonical Check/Attack/Backtrack、D10 lazy asset、RuntimeDamageRollWorker、RangePlanner、ResourceGuard、published-bucket propagationは維持した。client-level legacy比較fixtureと専用client/prepareテストを削除・canonical契約へ移植し、下位legacy core/wrapper、比較・migration・asset・JSON/generatorはPhase 8まで維持する。
- Attackブラウザ受入（2026-08-24、in-app browser / Vite local）: 初回はcanvas 2、Summary `コンボ1 6 / 45.5% / 3.1`、alert 0、一時switch 0、canonical/support/overflow debug text 0を確認した。action dice `2→20→3`の連続入力後は最終値3、canvas 2、alert 0、Summary `9.7 / 71% / 5.5`だった。combo追加で2 combos・合計8.6、複製で3 combos、削除で2 combosへ戻り、各状態でcanvas 2・alert 0だった。
- Attackブラウザ受入（続き）: 《妖精の手》等を1にすると達成値期待値は単独`—`、命中率95.9%、damage 12.8となり、uncertainty warning/alertは観測されなかった。振り直せるダメージダイス1ではdamage 15、合計18.1、alert 0だった。Score/Damage双方をX以上表示へ切り替えてもcanvas 2・alert 0だった。初回の`--force`依存最適化reload中だけdynamic import warningが一時発生したが画面は復旧し、最適化後のserver/new tab再起動では初回2 canvas・Summary・alert 0と追加server warningなしを確認した。tabs/serverは終了し、port `3000`を解放した。
- 現在の状態: BacktrackとAttackのcanonical default化、CalculationClient legacy API/route preload cleanup、ブラウザ受入は完了したが、Phase 7全体は未完了である。legacy core/wrapper・assets/JSON/generatorの整理、任意表示範囲拡張、最終受入は後続作業とする。

既定化は実装完了ではなく、三経路の比較・ブラウザ実測・resource/cancel/error確認後の受入判断である。既存チャート・サマリーの見た目を残すことは互換UIの維持であり、legacy計算や固定1024を残すことではない。

### Phase 8: 事前計算JSONを整理する

- 成果物: canonical既定化後のruntime検証に基づく、既存JSONの保持・参照用化・削除と再生成コードの範囲を記録した判断。
- 完了条件: productionが不要な事前計算JSONに依存せず、必要なasset fetch、再生成、失敗時のerror/re-input案内、配布サイズを確認する。削除対象と保持対象を個別に比較できる。
- 対象外: 計算パラメータ入力上限の変更、表示windowの契約変更、Cloudflare Workers/API/MCP、既存履歴の削除。

JSON整理はブラウザ内canonical計算と表示契約が安定した後に独立して行う。入力上限を変える変更と既存JSONを削除する変更は、原因と影響を切り分けるため同一コミット・同一受入条件にしない。

### Phase 9: Cloudflare Workers、HTTP API、MCPを将来目標として再評価する

- 成果物: static SPAとブラウザ内計算を維持したまま、Cloudflare Workers移行の必要範囲、HTTP API/MCPの要件、security、資源、serialization、運用責任を別設計として判断する記録。
- 完了条件: coreのcanonical/display contract、表示window、資源制限、error、cancel/stale、asset境界が安定し、外部境界を追加する価値とリスクをユーザーが判断できる。
- 対象外: 今回の移行でのCloudflare Workers新規経路、HTTP API、MCPの実装、測定なしのブラウザWeb Worker protocol追加、静的SPAの置換。

Cloudflare Workers/API/MCPは今回決めず、canonical移行の完了後に実測と運用要件から再評価する。外部境界を追加する場合も、既存のcore契約とdisplay contractを再利用し、UI移行や入力上限変更と同時に進めない。

## ブランチとコミット単位の推奨

- Phase 0は現行Attack safe pathの実装・契約テスト・文書をレビューしてコミットする作業単位とする。debug panel、toggle、安全projectionは検証用として残すが、本番採用の作業とは分離する。
- Phase 1は入力・要求ライフサイクル専用ブランチ（例: `codex/input-request-coordinator`）、Phase 2はcanonical display contract（例: `codex/canonical-display-contract`）、Phase 3はdisplay range planner/Chart adapter（例: `codex/display-range-planner`）に分け、各経路の本接続を混ぜない。
- Phase 4〜6は経路ごとのブランチ（例: `codex/check-canonical-display`、`codex/attack-canonical-display`、`codex/backtrack-canonical-display`）で、producer、adapter、既存表示への供給、比較テスト、文書をレビュー可能な小さなコミットに分ける。Attackではcanonical batchを主対象とし、削除予定のlegacy combo/totalへ新しいcoordinatorを重複実装しない。
- Phase 7の既定化とlegacy完全削除、Phase 8のJSON整理、Phase 9のCloudflare Workers/API/MCP判断は、それぞれ独立した承認可能なコミットにする。計算パラメータ入力上限、表示window、JSON、ブラウザWeb Worker protocol、Cloudflare Workers境界の変更を一つの移行コミットへ集約しない。

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
- `CanonicalAttackPanel`、`canonicalOptIn`、canonical debug表示、1024固定projection、legacy計算、legacy fallbackは移行完了時に削除する。canonical resource/error時は旧結果へfallbackせず、既存のerror/re-input案内へ接続する。
- 静的SPAとブラウザ内計算を今回の公開形態として維持し、Cloudflare Workers、HTTP API、MCPはcanonical移行完了後の将来目標として再評価する。
- 通常の対話操作はlatest-winsを基本とし、初期化、Attack全combo batchのatomic commit、共有asset/cacheは別のライフサイクルとして扱う。実行中ブラウザWeb Workerのcancelは今回の移行対象外とする。

## 残っている受入判断

- resource rejectionの見積り式、window長・描画点数のbudget、メモリ不足時のerror/re-input文言を確定する。
- 最新要求の計算中に、直前の成功結果を保持して表示するか、現在の実装どおり一時的に結果を消すかを決める。どちらを選んでもresultとinputの世代が混在しないことを契約にする。
- 表示window変更時に再計算せずprojectionだけ更新できる条件、明示coverageを拡張する条件、finite support外を0と扱う条件をgolden fixtureで固定する。
- 三経路の比較、ブラウザ実測、resource/cancel/error確認を満たしたと判断するfixture、engine、実行条件と、canonical既定化の受入条件を確定する。

## 参照文書

- [todo.md](./todo.md): RangePlanner/ResourceGuard、canonical Attack、既定経路、JSON整理、外部境界に関する作業履歴。
- [runtime-calculation-algorithms.md](./runtime-calculation-algorithms.md): DistributionResult、canonical Attackの実測、diagnostic UI、安全なlegacy projectionの記録。
- [dynamic-distribution-ranges decision.md](../experiments/dynamic-distribution-ranges/decision.md): published bucket、full-tail、support、overflow、資源制限に関する既存判断。
- [architecture.md](./architecture.md): core、CalculationClient、SPA、Worker/API境界の構成方針。
- [runtime-rule-validation.md](./runtime-rule-validation.md): runtime rule、validation、legacyとcanonicalの意味を混同しないための契約。
