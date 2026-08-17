# Canonical migration roadmap

この文書は、Attack、通常のCheck、バックトラックの計算結果をcanonical resultへ段階的に移行するための設計判断と実装順序を記録する。移行中は既存のlegacy表示を比較用の安全網として残すが、完了時にはdebug panel、legacy計算、固定1024表示、legacy fallbackを削除し、既存チャート・サマリーの見た目だけを維持する。

## 現在地

- `RangePlanner` と `ResourceGuard` による実行前の範囲計画・資源制限があり、`DistributionResult` がsupport、explicit maximum、overflowを保持するcanonical境界になっている。
- Attackにはcanonical batch、`CanonicalAttackPanel`、`canonicalOptIn`、exact finite caseだけを既存1024 published bucketへ安全に投影するdisplay adapterがある。これらのpanel、toggle、診断表示、安全投影は移行中の検証用であり、本番移行完了時には削除する。
- Checkとバックトラックはcanonical resultを既存表示経路へ接続していない。core側に蓄積された範囲・資源・計算機能の有無と、canonical表示経路へ接続済みであることは別の状態として扱う。
- 既定経路は現時点ではlegacy計算、legacy UI、1024要素のpublished distributionである。1024と表示UIの上限1000未満（`max=999`）は事前計算・固定長配列由来の暫定制限であり、canonical schemaや最終production表示の上限とは扱わない。

## 表示範囲と明示coverageの移行対象

現行コードでは、`src/data/Distribution.js`の`range()`が`DISTRIBUTION_SIZE=1024`に依存し、`src/components/Check/ChartSetter.js`と`src/components/Attack/ChartSetter.js`の`clipData()`が固定長配列を`slice`している。Check/AttackのSettingForm系（`src/components/Check/SettingForm.vue`、`src/components/Attack/ScoreSettingForm.vue`、`src/components/Attack/DamageSettingForm.vue`）も表示`min`/`max`を999以下（1000未満）に固定している。これらは現状の事実として移行比較に残すが、最終表示の上限にはしない。

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

- `src/components/Check/InputForm.vue`はdifficulty/action/reactionをwatchし、`src/components/Backtrack/InputForm.vue`はparams全体をwatchする。`src/components/Attack/ComboForm.vue`はscore、damage、reaction modeをwatchし、Attackのtotal計算はcombo結果のready状態をwatchして別Runnerを起動する。
- 各Formはlocal reactive mirrorを持ち、`v-model.number`で入力を受け、非同期の`form.validate()`が成功した後だけprops内の親stateへ値をコピーする。入力制約と正規化・validationは各Formへ分散しており、async validationの世代管理はまだ共通化されていない。今後は入力途中の`draft`、検証済みでimmutableな`CalculationInputSnapshot`、計算結果を投影する`DisplayRequest`を分離し、Formが親のnested stateを直接変更しないcontrolled inputへ移行する。
- `createLatestCalculationRunner`はrevisionと`AbortController`で旧要求のresult/error/plan commitを防ぐが、debounceはなく、有効な親state変更ごとに要求を発火する。UIのcommitはlatest-winsだが、実計算がlatest-onlyになることは保証しない。
- `ResourceGuard`は`maxActive=4`、`maxQueued=32`のFIFO queueを持ち、queued要求はabort時にqueueから除去する。`RuntimeDamageRollClient`はsingletonのブラウザWeb Workerと`pendingById`を持ち、既に`postMessage`した処理はabortしても停止しない。`RuntimeDamageRollWorker`は同期計算でcancel protocolを持たないため、旧Worker計算は完了後に破棄され、結果がcacheへ再利用される場合がある。
- したがって、UIのlatest-wins、ResourceGuardのFIFO待ち行列、Workerのpending計算は別の層であり、「最新要求のみ実計算」と同一ではない。legacy fallbackの採否はこの要求ライフサイクルとは別の表示・移行判断として扱う。

対話的SPAの通常要求はCheck、Attack、バックトラックともlatest-winsを基本方針とする。latest-winsは、古い結果をcommitしないこと、未開始の古い要求を新しい要求で置き換えること、実行中の古い計算を停止することに分けて管理する。Phase 1では各request laneについて「実行中1件と最新の待機1件」を上限とし、未開始の要求を無制限にブラウザWeb Workerへ送信しない。実行中の旧Worker計算は現状では完了後に破棄してcache再利用を許し、terminateやcancel protocolは実測後の別判断とする。初期化計算、Attack全combo batchのatomic commit、共有可能なasset/cacheはrequest laneのlatest-winsから分離する。

共通`CalculationRequestCoordinator`または`createLatestCalculationRunner`を置き換える同等のstate machineを、snapshot、revision、`AbortSignal`、commit guard、`idle/pending/running/success/error/cancelled/resource-rejected`状態とともに設ける。別のstate machineを並列に増やさず、既存の`CalculationFeedback`との対応を定義する。Form側はdraftから純粋なnormalize/validationを経てsnapshotを作り、async validationの競合を世代で防止する。実装順はCheck、バックトラック、canonical Attack batchとし、削除予定のlegacy Attack combo/totalへ新しいライフサイクルを重複実装しない。ResourceGuardのFIFO queueとは責務を分離する。連続入力、未開始要求の置換、Worker postMessage数、stale commit、unmount、combo追加・削除を完了条件に含める。

表示範囲plannerでは`DisplayRequest`を計算snapshotと分け、calculation keyが同じで明示coverageが足りる場合はprojectionだけを更新する。coverageが不足する場合だけcoordinatorへ拡張計算を要求する。入力snapshotと要求状態を先に整え、その後にcanonical表示契約とdynamic chart adapterを実装する。

## 推奨フェーズ

### Phase 0: 現在のAttack safe pathをレビュー・コミットする

- 現在の作業単位にはcanonical batch、`CanonicalAttackPanel`、`canonicalOptIn`、安全なlegacy projection、契約テストがすでに存在するため、このPhaseでは新しい表示機能を追加せず、差分レビュー、検証、統合、コミットを行う。
- 成果物: canonical batch、`CanonicalAttackPanel`、`canonicalOptIn`、`CanonicalLegacyDisplayAdapter`、Attack表示adapterと契約テストの現状レビュー、および既存チャート・サマリーの見た目を維持する接続方針。
- 完了条件: exact finiteの投影、upper-bound・unsafe exactの拒否、canonical resultのmetadata、legacy比較、cancel/stale/error/resource rejectionの挙動を確認し、debug panel・toggle・安全投影を本番へ残さない境界を明文化する。
- 対象外: Check/バックトラックの接続、表示window planner、既定経路の切替、JSON削除、計算パラメータ入力上限変更、ブラウザWeb Worker protocol変更、Cloudflare Workers/API/MCP。

Phase 0を先に行うのは、後続の比較結果が未レビューのAttack差分や既存UIの変更と混ざるのを防ぐためである。現行の安全投影とdebug表示は移行の完成ではなく、共通契約へ移す前の参照実装として扱う。

### Phase 1: 入力データフローとlatest-wins coordinatorを整える

- 成果物: Check、バックトラック、canonical Attack batchへ適用できる共通request coordinator/state machine、draftからの入力snapshot、純粋normalize/validation境界、async validation世代管理、ResourceGuard queueとの責務分離。
- 完了条件: 最新要求だけがUIへcommitされ、旧要求のresult/error/planがcommitされない。各request laneで未開始要求が最新要求へ置き換わり、実行中1件と最新待機1件を超えてWorkerへ送信しない。連続入力、Worker postMessage数、stale commit、unmount、combo追加・削除、初期化、atomic batch、共有asset/cacheの例外をテストで確認し、既存`CalculationFeedback`との対応を保ったまま状態を整理する。
- 対象外: ブラウザWeb Workerのterminate、cancel protocol、新しいWorker protocol、canonical表示UI、legacy fallbackの最終削除、表示windowのdynamic chart実装、削除予定のlegacy Attack combo/totalへの新coordinator重複実装。

Phase 1を表示範囲plannerとcanonical display contractの前提にする。表示範囲plannerは要求snapshotと再計算・再利用状態を必要とし、canonical display contractは安定したcommit/error/cancel境界を必要とするため、Phase 1を完了せずにPhase 2以降の表示接続へ進めない。

### Phase 2: 共通canonical display contractを設計する

- 成果物: 三経路共通の型・状態・validation規則、supportと明示coverageの表現、overflow/expected valueの表現、display windowとcanonical coverageの境界、tailと描画点数のbudget、fallback理由の契約、Attack/Check/バックトラックのgolden fixture。
- 完了条件: exact/upper-bound overflowと各`lowerBound`、lower-bound expected value、finite/infinite、明示coverage、safe integer window、not-ready、resource rejectionを含む契約テストがあり、入力配列やcanonical envelopeのaliasを作らず、legacy比較の期待値が固定される。
- 対象外: Check/バックトラックの本実装、production debug panel、既定UIの置換、計算パラメータ入力上限やJSONの整理、Cloudflare Workers/API/MCPの採用判断。

display contractが未確定のままCheckやバックトラックを個別実装すると、経路ごとにoverflowと期待値の意味が分裂し、後から共通化する際に表示上の損失を隠すことになる。したがってPhase 2の完了をPhase 3以降の依存条件にする。

### Phase 3: 共通display range plannerとChart adapterを作る

- 成果物: Check、Attack Score、Attack Damageで共有する`DisplayRangePlanner`相当の設計・実装、canonical coverageとdisplay windowの再計算/再利用規則、Chart.jsへのcoordinate/typed/sparse data adapter、contract test。
- 完了条件: 非負safe integerの任意windowを受け取り、明示coverage内なら再利用し、coverage不足かつsupport内なら再計算し、有限support外は再計算せず扱える。window長、配列長、メモリ、計算量、描画点数をpreflight/`ResourceGuard`で検証できる。PMFとupper-tail、従来の丸め、既存1024 fixtureの比較が固定される。
- 対象外: productionのcanonical debug panel追加、Check/Attack/バックトラックのcanonical producer接続、既定経路切替、legacy計算/fallback削除。

Phase 3を先に行うことで、固定`range()`、`clipData()`、999以下のSettingForm制約を、経路ごとに別の暫定上限へ置き換えずに済む。無制限の入力を許可することと、無制限の配列・描画を実行することを分離する。

### Phase 4: 通常のCheckをcanonical化する

- 成果物: Checkのcanonical result producer、Phase 3 adapterとの接続、既存Checkチャート・サマリーへの表示供給、legacyとの同一入力・同一条件の比較テスト。
- 完了条件: exact finiteとsupport/明示coverage/overflow付き結果がdisplay contractどおりに扱われ、upper-boundを一点値化せず、display window変更の再計算/再利用、資源拒否、cancel/stale、error/re-input案内が確認できる。既存UIの見た目と丸めは変えない。
- 対象外: Check専用debug panelをproductionへ残すこと、Attack/バックトラックの本接続、既定canonical化、JSON削除、Cloudflare Workers/API/MCP。

CheckはAttack固有のcomboやdamage totalに依存しないため、共通display range plannerとChart adapterを実データで検証する先になる。ここでresource拒否と再入力案内を確認してからAttackへ進む。

### Phase 5: AttackのScore/Damageをdynamic displayへ接続する

- 成果物: Attack Score/Damageのcanonical producerとPhase 3 adapterの接続、既存ScoreChart/DamageChart/SummaryTableへの表示供給、canonical total、任意display window、legacy比較fixtureとブラウザ実測。
- 完了条件: 1024を超えるsupportを固定配列へ黙って切り詰めず、exact overflowだけが定義済み条件で内部集約され、upper-bound overflowの`lowerBound`やbounded/lower-bound expected valueを一点表示しない。既存チャート・サマリーの見た目、丸め、コンポーネントを維持する。
- 対象外: `CanonicalAttackPanel`や`canonicalOptIn`のproduction残置、1024へ無条件collapseするlegacy projection、既定経路の切替、legacy計算/fallback削除、JSON整理、Cloudflare Workers/API/MCP。

Attackの現在のsafe projectionは1024比較を成立させる移行用の参照であり、dynamic displayの完成ではない。ScoreとDamageを共通plannerで扱い、totalのsupport・tail・expected valueを別計算の丸めや平均で作らないことを確認する。

### Phase 6: バックトラックをcanonical化する

- 成果物: バックトラックのcanonical result producer、資産coverageとsupportを含むPhase 2/3 adapter、既存バックトラック表示への供給、asset不足・resource rejection・overflowの比較テスト。
- 完了条件: 既存のバックトラック入力と資産条件でcanonical/legacy比較が再現でき、finite support、明示coverage不足、overflowを区別し、非投影可能な結果を一点値へ押し込まない。バックトラックのカテゴリ表示に表示windowが必要かは経路固有のadapterで判断し、不要なmin/max計算を要求しない。エラー時は旧結果ではなくerror/re-input案内へ接続する。
- 対象外: Backtrack固有の新しいJSON形式、production debug panel、他経路のlegacy削除、計算パラメータ入力上限とJSONの同時変更、Cloudflare Workers/API/MCP。

バックトラックは資産coverage、範囲計画、結果の集約条件がAttackやCheckと異なる可能性がある。共通display contractを再利用しつつ、asset不足をoverflowや確率ゼロと誤認しない固有validationを追加する。

### Phase 7: canonicalを既定化し、legacy計算とfallbackを削除する

- 成果物: 三経路の比較結果、ブラウザ実測、性能・資源・cancel/stale・error確認、既存コンポーネントへcanonicalを渡す既定経路、`CanonicalAttackPanel`/`canonicalOptIn`/debug表示の削除、legacy計算・固定1024 projection・legacy fallbackの削除。
- 完了条件: 主要fixtureで数値、support、明示coverage、tail、expected valueの意味、任意display window、表示点数、資源拒否、error/re-input案内がレビュー済みで、既存チャート・サマリーの見た目を保ったままcanonicalが既定になる。canonical計算の失敗時に旧結果を表示しないことを確認する。
- 対象外: この段階での計算パラメータ入力上限の再設計、既存JSONの削除、Cloudflare Workers新規経路、HTTP API、MCP。

既定化は実装完了ではなく、三経路の比較・ブラウザ実測・resource/cancel/error確認後の受入判断である。legacy表示コンポーネントを残すことは互換UIの維持であり、legacy計算や固定1024を残すことではない。

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
