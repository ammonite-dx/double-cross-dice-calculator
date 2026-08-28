# TODO

リポジトリ内で判明している、後続作業が必要な技術課題と過去の判断を記録します。完了した項目も、対応したコミットまたはPull Requestを記録したうえで、必要に応じてhistorical recordとしてこの一覧に保持します。

状態ラベルは`open`（現行実装に対する未完了の課題）、`done`（現行実装で完了）、`obsolete`（現行方針では実施しない課題）、`historical`（過去の実装・判断を記録する項目）を用います。過去の作業記録に残る「未着手」「継続」「一部完了」は、現在の状態を示すラベルとして解釈しません。

canonical移行の横断的な実装順序と判断は [canonical-migration-roadmap.md](./canonical-migration-roadmap.md) を参照してください。

## 推奨実装順

大きな変更は以下の順に独立ブランチで実施します。各段階で現行実装との適合テストを維持し、オンデマンド計算、入力範囲の拡張、外部API公開を同時に導入しません。

1. 完了: `9571f08`で「不死者・悪夢」の100%境界バグを修正し、以後の構造変更に正しい期待値を持ち込んだ
2. 完了: `9beeea2`で現行の判定、ダメージ、バックトラック計算からVue、`fetch`、静的アセット取得への依存を除き、互換ラッパーで現行UIを維持した
3. 完了: `b29b4e0`で非同期の`CalculationClient`とローカルアダプターを導入し、UIから計算モジュールとデータリポジトリへの直接参照をなくした
4. 完了: 実験済みの混合分布アルゴリズムと常駐Web Workerを本番化し、現在の入力範囲で`dr`用JSON経路との一致を確立した
5. 完了: `codex/runtime-dx-production`で`dx`をオンデマンド化し、`shihai=0`の累積分布と`shihai>0`の動的計画法を別々に検証したうえで本番の通常判定へ統合した
6. 完了: `codex/dynamic-distribution-ranges`で入力、中間計算、FFT、表示の範囲を一体的に決めるcore plannerを追加し、`CalculationClient`のpreflight、warning通知、hard reject、DX/Scoreの可変workingLength、Score FFT、RuntimeDamageRollCalculator/Workerの可変FFT・出力長、DamageCalculatorの動的raw range、防御畳み込み、DamageRangePlan接続、バックトラックの完全support生成、既存戻り値維持、check/attack/backtrack UIへのwarning/reject表示まで接続した。Phase 2-Eでは本番コードを変更せずNode/Chromeベンチマーク基盤を追加・修正し、現行1024 published bucketのtotal damage集計を維持したまま、現行入力上限を変更しない暫定判断と追加実測の受入基準を確定した。resource guard、将来のdynamic output契約、入力拡張候補、JSON経路は次段階へ引き継ぐ
7. 完了: [Phase 8-1 inventory](./phase8-inventory.md)でオンデマンド経路、production import graph、legacy wrapper、JSON、公開asset、generator、migration/comparison testをsymbol/export単位で棚卸しし、runtimeRuleValidationのoracle位置付け、dependency contract/browser smokeの分離、revision-1の32 data assets + manifest、manifest/barrel分類を実装実態に合わせて最終補正した。削除、公開URLのretirement、cleanupはPhase 8-2以降の独立作業として残す
8. 完了（Phase 8-2A/2B/2C/2D/2E/2F/2G1/2G2/2G3/2G4/2G5/2G6）: Attackのlegacy chart adapterを`LegacyChartSetter.js`へ分離し、canonical adapterを`ChartSetter.js`へ集約した。`ChartPercentages.js`の表示丸めとgolden test、`tests/productionDependencyContract.test.js`のCalculationClient dependency contract、`scripts/production-browser-smoke.mjs`によるproduction network smokeを追加した。Checkはcanvas 1・revision-1 asset request 0、Attack初期はcanvas 2・request 0、防御ダイス1への変更後はcanvas 2・`d10.json` request 1（HTTP 200）・その他request 0、Backtrackはcanvas 3・request 0で、same-origin HTTP error、console warning/error、pageerror、same-origin requestfailedはいずれも0だった。続いて`PrecomputedDataSchema.js`、`D10PrecomputedDataRepository.js`、`ReferencePrecomputedDataRepository.js`へsourceを分離し、production importerをD10へ限定した。さらにD10 validatorのschema、dataset、distribution count、probability、success cacheを直接テストし、`docs/phase8-inventory.md`へsymbol/export単位のreference/legacy importer監査を追加した。`tests/runtimeRuleValidation.test.js`のactual側は`src/calculation/`のcanonical Score、Damage、Backtrackへ移行し、独立expectedを維持した。Phase 8-2G1ではtestsのfacade importを直接repositoryへ移行し、Phase 8-2G2ではscripts/experimentsのfacade importを直接repositoryへ移行した。Phase 8-2G3ではcalculation barrelの全importerを各owner moduleへ移行し、Phase 8-2G4では`src/calculation/index.js`を単独削除した。Phase 8-2G5ではDXのfacade専用coverageを`referencePrecomputedDataRepository.test.js`へ移植し、`src/data/PrecomputedDataRepository.js`と`tests/precomputedDataRepository.test.js`を削除した。Phase 8-2G6ではScore、Damage、Backtrackのdata calculator wrapperを削除し、全consumerを各owner moduleと明示的なrepository依存へ移行した。D10/Reference repository、公開asset、JSON、generator、計算意味論、benchmark条件は維持している。次はPhase 8-2G7としてlegacy comparison/migration依存を整理する
G6C closure（2026-08-28）: repository・asset対象テスト22件、`benchmark:calculators`、`benchmark:phase2h -- --iterations 1 --warmup 0`、全Vitest（64 files / 908 tests）、ESLint、Markdown lint（24 files / 0 issues）、production build、`git diff --check`を実行し、すべて成功した。wrapperのimport・SSR load・文字列参照0件も再確認した。
9. open: 計算コアの入出力、数値誤差、資源上限が安定した後にだけ独立API Workerを実験し、第三者向けAPIとMCPはその後に別途判断する

第6段階の実装前調査と参照plannerは[`experiments/dynamic-distribution-ranges/decision.md`](../experiments/dynamic-distribution-ranges/decision.md)に記録しています。本番coreの`src/calculation/RangePlanner.js`へ移植済みで、`DEFAULT_POLICY`は比較・互換用に`published-bucket`を保持しつつ、Attackのproduction `CalculationClient`は`full-tail`を明示的に選択します。DXの尾部certificate、Scoreの可変workingLengthと実畳み込みFFT長、finite support、推定時間・メモリによるwarning/rejectの契約を持ちます。`CalculationClient`のpreflightから計画とwarningを取得でき、hard rejectはアセット読込と計算開始より前に働きます。RuntimeDamageRollCalculator/Workerは`fftLength`、`distributionLength`、`rawSupportMax`を受け取り、DamageCalculatorと防御畳み込み、バックトラックの完全support計算も各RangePlanへ接続済みです。Phase 2-EのNode/Chrome測定とPhase 2-FのFirefox/WebKit/Chrome 4x測定では、case errorと数値異常を確認しなかった。full-tail Attackのresource計測・暫定threshold判断は下記Phase 7実装単位へ記録し、残るJSON経路、legacy整理、低速実機、入力拡張候補の追加受入は後続課題です。

## Canonical migration Phase 7 status

- 完了: Attackの初期計算、validated input、combo操作、Score/Damage chart、Summary、totalをcanonical batch/presentationと一つのlatest-wins runnerへ統合し、temporary `canonicalOptIn`、debug panel、legacy combo/total runner、route preloadをproduction接続から削除した。
- 完了: Check Summaryをcanonical typed summaryへ切り替え、production Checkから1024 published projectionとlegacy `getScoreSummary`依存を除去した。Attackのcanonical summary formatterを共有presentation utilityとして再利用している。
- 完了: AttackのScore/Damage表示フォームから999上限を撤廃し、任意の非負safe integerをcanonical display requestとして受け付ける。表示点数・メモリ・計算量のresource plannerによるrejectは維持している。
- 完了: `CalculationClient.prepare`、`calculateCheck`、`calculateAttackCombo`、`calculateTotalDamage`、`calculateBacktrack`とlegacy score/damage/backtrack dependency/fallbackを削除し、`/check`を含む全計算routeからpreload guardを外した。canonical防御D10のlazy asset、`RuntimeDamageRollWorker`、RangePlanner、ResourceGuardを維持している。production AttackのScore→Damageは`full-tail`で、Damage rangeはaction canonical Scoreの`outputMax`から計画し、reaction Scoreの大きさに依存しない。`published-bucket` propagationは比較・互換用の明示policyとして残している。
- 完了: productionの`CalculationClient`はScore/Backtrackのcanonical計算コアを直接参照し、Score、Damage、Backtrackのdata calculator wrapperはPhase 8-2G6で削除した。全consumerは各owner moduleと明示的なrepository依存を直接参照する。
- 維持: legacy core、比較・migration・rule・asset tests、legacy API相当の下位実装、JSON/assets/generator、legacy計算上の1024/1022境界。Attack表示フォームの999上限は撤廃済みで、未整理のlegacy core/assetsは維持する。
- 完了: full-tail Attackのresource planning・Node/Chrome受入・cost model校正・warning/hard thresholdの暫定維持判断を`8c7d10c`で記録し、action-only damage range assertionを`569c278`で整合させた。production warning/hard thresholdは50/200msを暫定維持する。PRをacceptance gateにしない現在のsolo developmentでは、repository workflow相当のローカルgateを最終HEADで実行する。202Dはlegacy/published-bucket由来の比較境界であり、production semantic capではない。runtime absolute safety ceilingは維持している。
- 完了: AttackのScore/Damage表示範囲について、`0..100`、`0..999`、`0..1000`、`0..1023`、`0..1024`、`0..1200`、`1000..1200`、`0..20000`の入力・coverage・resource判定を回帰テストへ追加した。単一点（`min === max`）は有効な表示windowとして扱い、非負safe integerの範囲を受け付ける契約を明文化した。`0..20000`はlegacy上限ではなくresource budget超過としてrejectする。Score/Damage独立更新、known-zero、coverage再計算、resource reject、stale/recoveryは既存integration testで維持する。
- 完了: `d30b3d1`でfull-tail overflowの位置契約を修正し、Score尾部由来の位置不明massは`lowerBound=0`、Damage出力だけの右側overflowは最終出力境界をlower boundとするよう分離した。続く表示層では`projectionUncertainty.positionUnknownProbabilityUpperBound`と`DISPLAY_PROBABILITY_TOLERANCE=5e-4`を導入し、位置不明確率の誤差をUI表示精度内に抑えられるtailだけをPMF/upper-tail projectionから省略できるようにした。この閾値は丸め結果が常に完全一致することを意味しない。Damage出力overflowは`outputOverflowLowerBound`で別に保持し、windowと重なる場合は安全側の再計算または`not-projectable`を維持する。
- 確認済み: 現行Attack入力フォームの上限とは独立に、production `CalculationClient.planAttackCombo()`はaction `dice=99`・`critical=2`から`scoreValueUpperBound=2271`、`maxDamageDice=228`、`rawSupportMax=2280`、`workingLength=1024`、`fftLength=4096`、`accepted=true`、拒否理由なしを導出した。Node integrationでは通常およびaction/reaction双方`99D/critical=2`の`Damage 0..100`、`0..1200`をcanonical chart readyとして確認し、PMF/upper-tail、mixed/output-only tail、resource rejection、latest-winsの既存回帰テストも維持している。2026-08-25のin-app Chromium実測では、通常AttackのPMF/upper-tail `0..100`、action/reaction双方`99D/critical=2`のPMF/upper-tail `0..100`とPMF `0..1200`、通常AttackのPMF `1000..1200`がcanvas 2・alertなし・console warn/error 0で表示できた。`0..20000`は描画点数resource reject、`0..100`への復帰はcanvas 2・alertなし・古いエラー表示なしで確認した。
- 完了（Phase 7 closure、2026-08-26、HEAD `82ea5be`）: canonical default化、production legacy API/fallback削除、full-tail overflow correctness、表示精度projection、任意display range、`>202D`計画・ブラウザ受入、resource reject/recoveryを確認した。最終HEADで`check:node`、data check/verify（各32 assets）、Vitest（61 files / 889 tests）、generator test（18 passed / 13 deselected）、simulation（13 passed / 18 deselected）、ESLint、Markdown lint、Ruff、build、`git diff --check`がすべて成功した。legacy core/wrapper、assets、JSON、generatorの棚卸し・削除はPhase 8へ移す。Vue完全mount制約、低速実機・Firefox/WebKitのthreshold再評価は後続検証とする。

Phase 8は削除から始めず、legacy calculation core、`src/data/` wrapper、precomputed JSON、runtime asset、generator、migration/comparison test、`published-bucket` compatibility codeを、productionで使用中、comparison/regression用、generator/regeneration用、migration残存、dead/削除候補の5分類で棚卸しする。production import graphと再生成用途を確認し、canonical Check/Attack/Backtrack、D10 lazy asset、`RuntimeDamageRollWorker`、`RangePlanner`、`ResourceGuard`、1024/1022境界テストの用途を維持したまま、分類結果に基づいて個別に保持・参照用化・削除を判断する。JSON、asset、generatorは一括削除しない。

### Phase 8-2G status

- 完了（Phase 8-2G1）: `tests/`の`PrecomputedDataRepository` facade importを実測し、単なるre-export利用だった8テストを`D10PrecomputedDataRepository.js`または`ReferencePrecomputedDataRepository.js`へ直接移行した。`tests/precomputedDataRepository.test.js`だけはG5までfacade compatibility regressionとして保持した。legacy calculator、migration/comparisonの意味、public JSON、production `src/`は変更していない。
- 完了（Phase 8-2G2）: `scripts/benchmark-calculators.mjs`、`scripts/benchmark-phase2h.mjs`、`scripts/benchmark-full-tail-attack.mjs`、`experiments/**`のfacade importerを、benchmark/experiment自体を保持したままD10/Reference repositoryへ直接移行した。benchmark case、測定条件、report schema、public revision-1 asset pathは変更していない。
- 完了（Phase 8-2G3）: `src/calculation/index.js`のlegacy/canonical barrel importerを、各symbolのowner moduleへ直接移行した。barrel本体は変更せず保持し、`src`、`tests`、`scripts`、`experiments`のimporter 0とdynamic/package reference 0を確認した。
- 完了（Phase 8-2G4）: G3後のglobal/static/dynamic/SSR/package importer 0とbarrelの副作用なしを再確認し、`src/calculation/index.js`を単独削除した。owner module、facade、data wrapper、legacy core、comparison、JSON、asset、generatorは変更していない。
- 完了（Phase 8-2G5）: facade importerが専用testだけになったことを確認し、DXのconcurrent dedupe/cacheとrevision mismatchを`referencePrecomputedDataRepository.test.js`へ移植した。`src/data/PrecomputedDataRepository.js`と`tests/precomputedDataRepository.test.js`を削除し、旧facade importerと`clearPrecomputedDataCache`を0件にした。D10/Reference repository、public asset、JSON、generatorは変更していない。
- 完了（Phase 8-2G6）: `src/data/ScoreCalculator.js`、`DamageCalculator.js`、`BacktrackCalculator.js`を削除し、tests、scripts、experimentsの全consumerを各`src/calculation/` owner moduleとD10/Reference repositoryへ直接移行した。新しい共有adapter moduleは追加していない。legacy core、JSON、asset、generator、計算意味論は変更していない。
- 次段階（Phase 8-2G7）: legacy comparison/migration依存を再監査し、独立oracle coverageと再生成手順を保ったまま個別の保持・削除単位を判断する。Phase 8-2G全体は完了扱いにしない。

第4段階では通常Checkのcontrolled SettingForm、999上限撤廃、dynamic display windowを実装し、resource rejectionで広い表示範囲を制御しました。Attack、バックトラック、三経路全体の入力・表示上限拡張は、誤差、計算時間、メモリ使用量、描画点数を同時に検証した後に判断します。

## 1023 overflow bucket UI（obsolete / compatibility-only historical requirement）

- 状態: obsolete
- 位置づけ: 1024要素のpublished bucketはlegacy comparison/compatibility用に残すが、canonical production UIの表示上限や未完了課題とはしない。

### 過去の仕様

旧公開分布ではインデックス1023が値1023以上をまとめたバケットであり、画面上の表示もこの形状に依存していました。現在はcanonical resultがsupport、overflow、display windowを分離して保持し、production UIは任意の非負safe integer windowをResourceGuardの範囲内で表示します。

### 互換用途

旧1024形状とインデックス1023の意味は、legacy comparison、schema-v1 reference、published-bucket policyの説明とテストでのみ維持します。canonical chartで最終バケットを特別表示する実装は追加しません。

## 計算コアを実行環境から分離する

- 状態: done（計算コアと`CalculationClient`の分離、`9beeea2`・`b29b4e0`、canonical runner、DR Worker接続）
- 実行場所: DXはメインスレッド、DRのFFT本体は`RuntimeDamageRollWorker`、Backtrackはruntime coreで実行する。全計算をWorkerへ移すことは現行要件ではない。
- 将来再評価: open（低速端末や新しい入力範囲でメインスレッド停止時間が許容できなくなった場合に、性能測定に基づき追加Worker化を判断する）
- 優先度: 高
- 判断記録: [`ADR 0002`](./adr/0002-separate-calculation-core.md)
- 対象:
  - `src/data/`
  - 判定・攻撃・バックトラック画面の計算呼び出し
  - 新規の計算コア、`CalculationClient`、ブラウザ内Web Workerアダプター
  - 計算コアの環境非依存テストとアダプター適合テスト

### 目的

計算ロジックをVue、DOM、`fetch`、Web Worker、Cloudflare固有APIに依存しないコアへ分離し、UIが計算の実行場所を知らずに結果を表示できる構成へ移行します。公開サイトは当面、静的SPAとブラウザ内計算を維持し、外部HTTP APIとMCPは同じコアを利用する後続の提供手段とします。

### 実装計画

1. 判定、ダメージ、バックトラックの入力、結果、エラー、キャンセルを表す内部契約を定義する
2. 完了: 計算コアからVue、静的アセット取得、ブラウザとCloudflare固有APIへの依存を除く
3. 完了: UIが利用する`CalculationClient`相当のインターフェースを定義する
4. historical: 全計算を標準Web Workerへ移す計画は現行方針では採用しない。DR専用Workerの契約は実装済み
5. done: 現行canonical経路、計算コア、DR Workerで同じ入力が同じ結果になる適合テストを追加した
6. オンデマンド計算と範囲決定処理を計算コアへ統合した後に、HTTP APIの入出力契約を設計する
7. HTTP APIの性能と運用を検証した後にだけ第三者公開を判断し、MCPは安定した契約を呼ぶ薄いアダプターとして最後に検討する

### 完了条件

- 計算コアがブラウザ、Vue、HTTP、Cloudflare固有APIを参照しない
- UIが計算モジュールや静的データリポジトリを直接参照しない
- DXメインスレッド、DR Worker、Backtrack runtime coreの実行境界が文書・テスト・production接続と一致する
- 現行の計算結果、ルールテスト、数値誤差、キャンセル動作が維持される
- APIやMCPを実装しなくても、同じ計算コアへ新しいアダプターを追加できる

## 旧生成元と移行専用テストを整理する

- 状態: open（Phase 8-1 inventoryで依存関係と保持・分離・削除を判断済み。Phase 8-2でcleanupを実施する）
- 優先度: 中
- 対象:
  - `src/data/*.json`
  - `scripts/generate-precomputed-data.mjs`
  - `tests/legacy/LegacyCalculator.js`
  - 移行比較専用テスト

### 問題

Python生成器への移行検証のため、旧密JSON、旧JavaScript変換処理、旧計算実装との比較テストを参照用に保持しています。独立した全列挙、全生成範囲の数値監査、乱数シミュレーション、schema-v2/revision-1生成物の検証が揃ったため、公開前に重複する生成元を整理できます。

### 検討事項

- 移行比較テストのうち、独立テストや境界値テストで代替済みの範囲を確認する
- `reference-data/`に旧revisionを残す期間と削除条件を決める
- 旧ノートブックをGit管理外の参照資料として残すかを決める

### 完了条件

- Python生成器だけから現行配信アセットを再生成できる
- 削除する移行テストと同等以上の境界値が独立テストで保護されている
- `src/data/*.json`と旧JavaScript生成処理が本番、テスト、ドキュメントから参照されない
- 削除後に生成物検証、全テスト、lint、本番ビルドが成功する

## `dx`をブラウザ内でオンデマンド生成する構成を検討する

- 状態: 本番統合と実ブラウザ検証を完了、現行入力範囲ではメインスレッド直接実行を採用
- 優先度: 中
- 対象:
  - `generator/src/dx_precompute/dx.py`
  - `src/calculation/DxCalculator.js`（旧facadeはPhase 8-2G5で削除済み）
  - `public/data/schema-v2/revision-1/dx/`
  - 新規のJavaScript判定分布生成器

### 目的

現在の`dx`分布は事前計算したJSONとして配信しています。ブラウザ内で必要な分布だけを高速に生成できれば、`dx`用JSONの削減、デプロイ対象の縮小、ダイス数上限の拡張が可能になります。

### 予備調査

- `shihai=0`では、1個のダイスによる判定結果の累積分布を $F_c(x)$ とすると $P(V_{n,c}\le x)=F_c(x)^n$ から対象の分布を $O(L)$ で計算できる
- `shihai>0`では、全ダイスがクリティカルする自己遷移を $d_x=a_x+q d_{x-10}$ で解き、ダイス数に関する動的計画法と組み合わせられる
- Node.jsのV8上でのJavaScript試作では、長さ2048、ダイス数99個まで、指定された1組のクリティカル値と`shihai`の分布列を約5～7 msで生成できた
- 予備調査では公開済みJSONとの最大差が約 $5.3\times10^{-7}$ であり、小数第6位への丸めで説明できる範囲だった
- `shihai>0`では上限200個で約30 ms、500個で約160～220 ms、1000個で約0.6～1.0秒を要したため、大幅な上限拡張にはアルゴリズムの追加改善またはWeb Workerが必要になる

### 検討事項

- Chrome、Firefox、Safariおよび低速なモバイル相当環境で実測する
- `shihai=0`の閉じた式と`shihai>0`の動的計画法を独立した実装とするか決める
- 同じ `(shihai, critical)` の中間分布をキャッシュし、ダイス数の増加時に差分だけを計算できる構成を検討する
- メインスレッドで計算する上限と、静的Pages構成を維持できるブラウザ内Web Workerへ切り替える条件を決める
- 実行時生成の数値誤差、オーバーフローバケット、キャッシュのメモリ上限をテストする
- 自己遷移の計算を等比級数のシフト加算から係数漸化式 $d_{n,c}(x)=a_{n,c}(x)+p_c^n d_{n,c}(x-10)$ へ変更した場合は、確率質量関数から動的計画法を導入する説明を主とし、確率母関数を再帰構造の要約として後から示すように教科書を書き換える
- 上記の実装変更時は、教科書だけでなく事前計算と実行時計算の開発者向けアルゴリズム文書も現行実装に合わせて更新する
- historical: 当時は`dr`と`kazanari`を本項目の対象外としていたが、現在はDRをRuntimeDamageRollWorkerでオンデマンド生成する。公開JSONはPhase 8-1 inventoryでcomparison/referenceに分類し、保持・retirementはPhase 8-2以降のrelease判断とする。

### 本番統合の判断

- `CalculationClient`は通常判定のDX分布を`calculateDxDistribution`から注入し、`dx` JSONをロードしない。反復入力に対して同一クライアント内の直近32分布をLRUキャッシュする。
- 実ブラウザ測定では現行最大ケースのメインスレッド実行がウォーム最大11.8 msで60 Hzの16.7 ms枠内に収まり、Long Taskも観測されなかったため、現時点でWeb Workerは本番導入しない。
- 公開済み`dx` JSONは参照・回帰検証用として残し、本番の配信経路から削除する判断は別変更で行う。

### 完了条件

- 現行入力範囲ではメインスレッド直接実行を採用し、対応範囲を拡張する場合にWorker切替条件を再評価する
- Python生成器および現行JSONとの全列挙比較テストを用意する
- `shihai`、クリティカル値、ダイス数の境界条件と数値誤差を検証する
- 採用した計算方法と教科書および開発者向けアルゴリズム文書の説明が一致している
- `dx`用JSONを参照・回帰検証用として維持する

## `dr`と`kazanari`をブラウザ内でオンデマンド計算する

- 状態: done（固定4096/2048の本番移植、可変FFT・出力長のRuntimeDamageRollCalculator/Worker、production AttackのDamage経路接続）
- 現行経路: production `CalculationClient`は`RuntimeDamageRollClient`/`RuntimeDamageRollWorker`でDRをオンデマンド生成し、`dr` JSONをロードしない。`dr` JSONはcomparison/referenceとasset equivalence用に保持するため、Phase 8-1 inventoryでは削除せず、配信assetのretirementはPhase 8-2以降のrelease判断とする。
- 優先度: 高
- 作業ブランチ: 実験・検証は`codex/runtime-dr-experiment`、本番移植は`codex/runtime-dr-production`
- 対象:
  - `src/data/DamageCalculator.js`
  - `src/data/FFT.js`
  - `src/application/RuntimeDamageRollWorker.js`（旧facadeはPhase 8-2G5で削除済み）
  - `generator/src/dx_precompute/dr.py`
  - `public/data/schema-v2/revision-1/dr/`
  - 新規のJavaScript実行時ダメージロール計算器とベンチマーク

### 目的

現在のアプリは、`kazanari`ごとにダイス数0～202個の`dr`分布203本をJSONから取得し、命中達成値から決まるダメージダイス数の確率で混合します。ブラウザ内計算では203本を再生成せず、この混合分布を直接求めることで、`dr`用JSONの削減と対応ダイス数の拡張可能性を検討します。

### 候補アルゴリズム

- ダメージダイス数が`n`個になる命中確率を $w_n$ とし、$W(s)=\sum_n w_ns^n$ を作る
- `kazanari=0`では、1D10の確率母関数を $D(z)$ として混合分布を $W(D(z))$ で直接計算する
- `kazanari>0`では、最後に振り直される元の出目 $t\in\{1,\ldots,5\}$ とそれより小さいダイス数で排他的に場合分けする
- $E_r(s)=W^{(r)}(s)/r!=\sum_{n\ge r}\binom{n}{r}w_ns^{n-r}$ を0階から`kazanari - 1`階まで拡張Horner法で同時に評価し、ダイス数ごとの二項係数付き混合をまとめる
- 既定長4096のFFT周波数点で上記の式を評価し、optionsで指定された有限supportを保持できる2の冪へ変更可能とする。最終的な混合分布だけを逆FFT 1回で復元する
- 実数分布の共役対称性を使って半分の周波数点だけを計算し、型付き配列の再利用と複素数演算のインライン化で一時オブジェクトを削減する

### 予備調査

- Node.jsのV8上での未最適化のJavaScript試作では、ダイス数0～202個の任意の重み付き混合分布を`kazanari=0`で約2.8 ms、`kazanari=3`で約32.5 ms、`kazanari=9`で約55.1 msで計算できた
- 型付き配列とインライン複素数演算を使う最適化版では、Node.js上で`kazanari=0`が約0.87 ms、`kazanari=3`が約20.55 ms、`kazanari=9`が約44.24 msとなった
- Windows x64のChrome 150ではメインスレッド中央値が`kazanari=0`で約0.9 ms、1で約15.1 ms、2で約16.9 ms、9で約44.5 msとなり、60 Hz表示の1フレームに相当する約16.7 msを`kazanari=2`から超えた
- 同じChrome環境のmodule Workerでは既定2048要素の分布転送を含む往復増分が中央値で概ね0.1～0.3 msに留まった。可変出力長でもtransferable配列とrequest単位のcache/dedup契約を維持する
- Workerクライアントの重複排除、LRUキャッシュ、呼び出し単位の中断、障害後の再生成を独立テストで検証し、`kazanari=0/3/9`では防御適用後の最終ダメージ分布も現行JSON経路と最大絶対差 $2\times10^{-6}$ 以内で一致した
- Codex In-app BrowserのVite production previewで`kazanari=0/3/9`、固定値の正負、防御ダイス、連続入力、一般判定、バックトラックを確認し、Workerチャンクの取得は同一URLの1件、`dr`用JSONの取得は0件、console warning/errorは0件だった
- 公開済みJSONから作った同じ混合分布との最大差は約 $1.4\times10^{-7}$ であり、個別分布の代表比較では約 $5.4\times10^{-7}$ だった
- FFT由来の負値は絶対値 $10^{-15}$ 程度に収まった
- 現行の`dr`アセットは10ファイルで非圧縮約4.02 MiB、gzip圧縮約0.83 MiBであり、1ファイルのJSON解析と転置は約2.3～2.5 msだった
- 読み込み済みJSONを使う現行方式よりCPU計算は重くなるが、初回のネットワーク取得、配信サイズ、キャッシュメモリを含めるとオンデマンド化に検討価値がある

### 実装計画

1. 文書作業と分離した`codex/runtime-dr-experiment`ブランチで、本番コードから独立した数式リファレンス実装、型付き配列による最適化実装、ベンチマークを追加する
2. 単一のダイス数だけに重みを置いた全組み合わせにより、`n=0～202`と`kazanari=0～9`の2030分布がPython生成器および現行JSONと許容誤差内で一致することを検証する
3. 複数のダイス数を含む混合分布、`kazanari>=n`、最大入力、総和、負値、オーバーフローバケットを独立にテストする
4. Chrome、Firefox、Safariと低速なモバイル相当環境で、`kazanari=0`、中間値、9の応答時間、メモリ、メインスレッドの停止時間を測定する
5. ブラウザ内Web Workerの必要性と切り替え条件を決め、必要な場合は静的Pages構成を維持したまま導入する
6. 現在の入力範囲を対象として、`DamageCalculator`を`dr`全体の表を参照する方式から、命中確率をダメージダイス数ごとに集約して混合分布生成器へ渡す方式へ変更する
7. 既存の実行時ルールテストと新旧経路の比較テストを成功させ、パフォーマンス目標を満たした後にだけ初期読込みと`dr`用JSONを削除する
8. 入力範囲を拡張する場合は、入力から表示範囲、中間計算範囲、FFT長、推定計算時間、推定メモリ使用量を求める範囲決定処理を追加する
9. 達成値を表示用の最終バケットへ集約する前にダメージダイス数ごとの重みへ変換し、広い分布の計算範囲とグラフの描画点数を分離する
10. 採用した式と実装に合わせて、教科書、事前計算アルゴリズム、実行時計算アルゴリズム、アーキテクチャの各文書を更新する

### 判断条件

- メインスレッドで許容できる最大応答時間、Web Workerを使う場合の最大応答時間、対応端末の性能下限を事前に定める
- 数値誤差、メモリ使用量、実装複雑度、配信サイズの比較に基づき、全オンデマンド化、`kazanari=0`だけのオンデマンド化、現行JSON維持のいずれかを選ぶ
- 対応ダイス数や固定値を拡張する場合は、[判断記録](../experiments/runtime-dr/decision.md#入力範囲と分布範囲に関する判断)に従い、入力範囲、表示範囲、中間計算範囲、FFT長を一体として設計する
- 判定の無限尾部に対する総打ち切り誤差と各計算段階への誤差予算を定め、固定長をより大きな固定長へ置き換えるだけの拡張は行わない
- 警告範囲と安全上限は、入力値そのものだけでなく、推定計算時間と推定メモリ使用量に基づいて決定する
- オンデマンド化を採用しない場合も、導出、ベンチマーク、不採用理由を開発者向け文書に残す

### 完了条件

- 全列挙比較、数値監査、実行時ルールテストが成功する
- 対応ブラウザと端末性能の下限でパフォーマンス目標を満たす
- Phase 8-2 prerequisite: 不要になったJSON、キャッシュ、初期読込み、スキーマ参照をPhase 8-1 inventoryとproduction import graphで確認し、削除または保持の判断を個別に記録する
- ゲームルール、数式、実装、テスト、教科書と開発者向け文書が同じ計算方法を説明している

### Damage dynamic range 第2-B

- 完了: `RangePlanner`と実験plannerのDamage境界、異長防御差分布のFFT、境界テスト、契約文書を更新した
- 完了: `DamageCalculator`と`CalculationClient`へ`DamageRangePlan`を接続し、raw分布長、provider options、防御support、`defenceFftLength`、公開1024要素へのcollapseを動的化した
- done: total damageのresource guard、canonical dynamic output契約、バックトラック配列のplan接続は完了した。done（Phase 8-1）: JSON経路のinventoryと保持・参照用化・削除判断。open（Phase 8-2）: 個別cleanup。入力上限の追加拡張はrelease hardeningで再評価する。

### Dynamic distribution range Phase 2-C

- 完了: `CalculationFeedback`の共通formatter/request runnerを追加し、`CalculationClient`の`onRangePlan`をUIへ伝播した
- 完了: check、attack、backtrackでwarningの理由、推定時間、推定メモリ、該当するoverflow下限を日本語表示し、hard rejectを結果なしの画面状態へ反映した
- 完了: request token、AbortError除外、アンマウント時の無効化により、連続入力の古いwarning/error/resultが新しい入力を上書きしないようにした
- 完了: attackの合計damageに専用generation/readyを持たせ、個別結果の追加・削除・reject、stale result、合計計算エラー、アンマウントで古い合計を表示しないようにした。未知の計算エラーは内部詳細を漏らさず日本語の再入力案内へ変換する
- 完了: `onRangePlan`を同期callback契約としてJSDoc、文書、実行順テストで固定し、UI runnerの外部`signal`はrunner所有signalと合成する
- テスト: component mount依存を増やさず、状態層テストで複数comboのaggregate ready、generic error、initial reject、stale/unmount、signal合成を固定した。残余リスクは実ブラウザでのVuetify/Chart.js描画と入力イベントの結合確認、およびresource guard・dynamic output契約である
- obsolete: 公開1024 bucketの最終ラベル・確率をcanonicalチャートで個別表示する要件はcompatibility-onlyとする。done（Phase 8-1）: JSON経路のinventory。open（Phase 8-2）: 個別cleanup。入力上限とresource guardの追加変更はrelease hardeningで再評価する。

### Dynamic distribution range Phase 2-D

- 完了: `RangePlanner.backtrack`の`workingMax`、`workingLength`、`fftLength`を`BacktrackCalculator`へ明示的に渡し、runtime optionsと計画を別引数として`CalculationClient`から伝播した
- 完了: 1024要素を超える計画では、通常D10の和を有限support DPで生成し、《屍人》は`sum - max + 1`の専用DPで生成する。1024要素以内は完全supportがアセット内に収まる場合だけ既存アセットを展開する
- 完了: 計画経路で末尾アセットbucketを下流の閾値判定へ流さず、有限support全体を分類してから既存の公開結果形状へ変換する。配列長、有限性、非負性、確率総和、事前に定義された`fftLength=0`を検証する
- 完了: 既存アセットのsupport境界は`assetOverflow`の静的coverage metadataとして計画に残し、完全supportを生成できるon-demand経路ではstatic asset warningを表示しない。実計算結果のoverflow、通常planner policy、core絶対安全上限を分離する
- 完了: planなし経路、1024要素の公開結果、既存入力範囲、cancel/staleのrequest runner契約を維持し、JSON削除、入力上限拡張、full-tail、total damageのdynamic outputは対象外とした

### Dynamic distribution range Phase 2-E

- 完了: `benchmark-phase2e.mjs`でNode `v22.23.2`の18ケースを測定し、13ケースを実測、5ケースをplanner-onlyまたはcore cap理由でskip、エラー0を確認した。warmup 2回、warm 7回の結果は[`experiments/dynamic-distribution-ranges/decision.md`](../experiments/dynamic-distribution-ranges/decision.md)へ記録した
- 完了: Chrome `151.0.0.0`相当のWindows環境でブラウザ12ケースを実測し、エラー0、Long Task 0、数値異常0、Worker resource timingの利用不可4件を診断上のunavailableとして分類した。DR/attackのWorker telemetryは各`createdCount=1`で、cold値に生成と初回要求を含めた
- 完了: `mainThreadTimerDelayApproxMilliseconds`をCPU時間ではなくzero-delay timer遅延の近似として文書化し、短時間ケースの約4–5 ms下限をtimer clamping・スケジューリングの特性として扱った
- 完了: 通常buildの`dist/`と専用buildの`dist-dynamic-distribution-ranges/`を分離し、Phase 2-Eの新規JSON結果を保存・Git追跡しない方針を[`experiments/dynamic-distribution-ranges/README.md`](../experiments/dynamic-distribution-ranges/README.md)へ記録した
- 完了: 現行入力上限はこの作業単位では変更しないと判断した。拡張はplanner warning/hard reject、dynamic outputと公開出力契約、resource guardを組み合わせ、複合入力の推定時間・メモリで段階的に制御する
- 引継ぎ: Firefox/WebKitのengine差とChrome 4xのrenderer CPU条件はPhase 2-Fで測定済み。低速実機、入力拡張候補のブラウザ実測、dynamic output/resource guard/JSON経路を検証した後に具体的なUI入力上限を判断する

### Dynamic distribution range Phase 2-F

- 完了: Playwright `1.62.1`をdevDependencyへ追加し、`package.json`と`package-lock.json`を更新した。指定Node `v22.23.2`で`npm install --save-dev playwright`を実行した
- 完了: `npx playwright install firefox webkit`でFirefox `153.0`（revision `v1538`）とWebKit `26.5`（revision `v2336`）だけを取得した。ダウンロード表示はFirefox 119.9 MiB、WebKit 59.6 MiBで、取得後directoryはFirefox 352,898,025 bytes、WebKit 177,304,497 bytes、合計530,202,522 bytes（505.6 MiB）だった
- 完了: [`playwright-runner.mjs`](../experiments/dynamic-distribution-ranges/playwright-runner.mjs)を追加し、専用Viteの起動・停止、Firefox、WebKit、Chrome channelの順次実行、ChromeだけのCDP 4x、page/context/profile/CDP cleanup、標準出力JSON、engine単位の明示的失敗を再現可能にした。`--no-sandbox`は使用していない
- 完了: Firefox `153.0`、WebKit `26.5`、Chrome `151.0.7922.108`で同じ`browser: true` 12ケースを各12/12成功させた。page errorと数値検証エラーは各0件、Firefox/WebKitはLong Task APIなし、Chrome 4xはLong Task 50件（最大154 ms）、Worker resource timing unavailableは4件だった
- 完了: 代表値はFirefoxのmain warm median/p95最大34/40 ms・Worker cold/warm p95最大56/36 ms、WebKitの15/24 ms・38/19 ms、Chrome 4xの129.5/132.8 ms・74.8/31.5 msだった。timer-delay warm p95最大は40/24/134.2 msで、CPU時間ではなくzero-delay timer遅延近似として記録した
- 完了: 入力拡張候補の`dx-two-x-planner-only`、`dx-large-planner-only`、`dx-hard-reject-planner-only`、`dr-over-core-cap`、`attack-two-x-planner-only`はcore capを変更せずplanner-onlyに維持し、`backtrack-large-normal-node-only`はNode-onlyとしてブラウザ測定から除外した
- done: dynamic outputとresource guardのproduction契約、3 engineの基準実測、配信JSONを変更しない暫定判断を完了した。open（release hardening）: 低速実機と入力拡張候補の追加受入。done（Phase 8-1）: JSON経路のinventory。open（Phase 8-2）: 個別cleanup。

## Dynamic distribution range Phase 2-G

- 完了: `src/application/ResourceGuard.js`にcapacity 64 MiB、maxActive 4、maxQueued 32、1.5倍切上げ予約、FIFO待機、queued abort、typed rejection、snapshot/diagnostics、idempotent lease releaseを実装し、`CalculationClient`のcheck、attack、backtrackとattack total damageへ共有guardを接続した
- 完了: preflight hard reject後かつアセット読込・計算開始前の予約、成功・cancel・stale・repository error・Worker error・同期例外の単一finally解放、複数CalculationClient共有、既存AbortSignalによるstale queued request除去をテストした
- 完了: `CalculationFeedback`と`RangePlanNotice`でresource rejectのcapacity超過・queue満杯を通常の未知エラーに隠さず表示する最小接続を追加した
- 対象外: owner replace policy、入力上限、RangePlanner hard policy、core absolute safety limit、JSON経路、dynamic output、RuntimeDamageRollClient内部の重複guardは変更しない

## Dynamic distribution range Phase 2-H

- 完了: `src/calculation/DistributionResult.js`にversion 1のcanonical distribution result、explicit max導出、finite/infinite support、exact/upper-bound overflow、centralized mass tolerance、typed validation errors、mass summaryを追加した
- 完了: factoryは入力ArrayLikeのvaluesを一度だけFloat64Arrayへコピーしてresult所有bufferを直接公開し、metadataをfreezeした。TypedArray要素はfreezeせず、書き込み可能なcopyは`copyDistributionValues(result)`で明示取得するため、copy-on-readのO(n)割り当てを行わない
- 完了: 現行1024 published bucketとのadapterを追加し、supportの明示要求、1023末尾bucketのexact overflow化、exact overflowの安全なfold、upper-bound projection拒否、欠落した個別値を復元できないlower bound投影のtyped拒否、offset・可変長・finite/infinite境界をテストした
- 完了: `tests/distributionResult.test.js`で正常系、invalid number、NaN、負値、mass、support、exact/upper-bound、mutation、round-trip、overflow folding、unsafe projection rejectionを固定した
- 対象外: 既存calculator、`CalculationClient`、UI戻り値、JSON asset経路、Worker serialization、入力上限、現行1024 bucketの解釈、metadata-aware演算、dynamic outputのproduction接続は変更しない
- 次段階: 各計算経路のcanonical result生成地点、support metadataとoverflow証明の伝播、JSON・Workerのserialization、公開結果とUIをcanonical契約へ切り替える条件を設計・検証する
- 完了: `calculateCanonicalDamageOnDemand`をopt-in pure calculation APIとして追加し、acceptedなtop-level attack planと`published-bucket` score propagationを必須化した。damage subplanだけの入力と未実装の`full-tail`は明示的に拒否する
- 完了: DR hit mass `H`を条件付き正規化せずproviderへ渡し、failure mass `F`と分離して、防御・fixed shift・failure合成後だけ`F + H = 1 ± 1e-8`と`DistributionResult`のmassを検証する。既存planned APIと共通のcollapse前helperを使い、provider、防御、shift、failure合成を一度だけ実行する
- 完了: published-bucket score由来のmodeled supportをfinite、未打切りDX sourceをinfiniteとしてmetadataで分離し、score tail certificateをoverflowへ加算せず防御コピー・freezeした。modeled support max式、最終damage座標のoverflow lower bound、末尾ゼロの除外、既知massとraw overflowのexact合算、null/exact overflowを専用テストで固定した
- 対象外: `CalculationClient`、UI、RuntimeDamageRoll Client/Worker protocol、cache、transfer、JSON、total damage、入力上限、full-tail、公開dynamic outputは変更しない
- 次段階: canonical resultのconsumer、Worker・JSON serialization、既存1024結果から公開結果・UIを切り替える互換境界を設計・検証する
- 完了: `createCalculationClient()`へopt-inの`calculateAttackCanonical(params, options = {})`を追加し、既存`calculateAttackCombo`の戻り値と既定動作を維持した
- 完了: canonical pathを既存attackと同じsnapshot、RangePlanner preflight、`onRangePlan`、ResourceGuard lease、abort/stale確認、score計算へ接続し、acceptedなtop-level attack plan、DR/D10 provider、`onFftLength`、runtime optionsを伝播した
- 完了: 第3単位時点のcanonical戻り値を`{ score, scoreSummary, canonicalDamage }`に限定し、pure APIのfreeze済み`{ result, metadata }`を保持した。第4単位で`canonicalDamageSummary`を追加したが、legacy calculator、`damage`、`damageSummary`、`getDamageSummary`はcanonical pathで呼び出さない
- 対象外: canonical consumerのUI接続、既存公開結果、RuntimeDamageRoll Client/Worker protocol、JSON serialization、`getTotalDamage`、入力上限、full-tail、公開dynamic outputは変更しない
- 次段階: canonical resultを利用するconsumer、Worker・JSON serialization、公開結果・UIへの移行条件、total damageとのsupport metadata境界を設計・検証する
- 完了: `DistributionResult.js`にoffset込みの明示一次モーメントとoverflow-awareな`getExpectedValueSummary`を追加し、exact・bounded・lower-boundのJSON-safe unionを返すようにした
- 完了: `overflow: null`、exact overflowのfinite/infinite support、`p=0`、`lowerBound === support.max`、upper-bound overflowの`q=0`、finite/infinite supportを期待値summaryの専用テストで固定した
- 完了: overflowの`errorBound`を期待値区間へ加算せず既存mass summaryのmetadataとして伝播し、summaryの再帰freeze、入力・values非変更、invalid入力をテストした
- 完了: `getCanonicalDamageSummary`をcanonical damage envelopeの薄いadapterとして追加し、`{ expectedValue, mass }`を返して`calculation/index.js`と`CalculationClient`の`canonicalDamageSummary`へ接続した。canonical pathからlegacy summary、legacy adapter、UI、Worker、JSON、total damageは呼び出さない
- 対象外: 既存`getDamageSummary`、legacy/UI/total damage/Worker/JSON protocol、canonical result自体のserialization契約は変更しない

### Dynamic distribution range Phase 2-H 第5単位

- 完了: `sumCanonicalDamage(canonicalDamages, options = {})`を追加し、canonical damage envelopeだけを独立和として加算するpure coreを実装した。0件はdamage 0のidentity、1件は不要なFFTを省略し、複数件だけ完全線形畳み込みを行う
- 完了: 明示`values`はoffsetを加算した座標のまま保持し、異長配列を含む完全畳み込みを行う。空の明示配列が一つでもあれば明示結果は空とし、overflowのlowerBoundを一点massへ変換しない
- 完了: finite modeled/source supportのsafe integer加算、infinite伝播、exact/null/upper-bound overflowの独立union、mixed時のexact-only lower bound、source errorBoundとFFT mass driftの補助metadataを実装した。upper-boundはFFT後の明示mass不足も上界へ含める
- 完了: `src/data/FFT.js`のprivate線形畳み込みを異長対応の公開`convolveDistributions` helperとして整理し、旧公開aliasは残さず、既存`sumDistribution`・`subDistribution`の公開挙動を維持した。`onFftLength`、AbortSignal、FFT stage境界のabort確認を伝播する
- 完了: result/metadataとcomponent descriptorsをfreezeし、入力envelope/result/valuesを変更しない。metadataには`aggregation: 'independent-sum'`、`independence: 'assumed'`、support、overflow lower bound、aggregation error boundを残す
- 完了: values/FFTは`1 << 20`、componentは`1 << 12`、resourceは512 MiBを絶対安全上限とし、persistent bytes（component、inspected、steps、descriptors、metadata、output）と各FFT peakの合計をguardする。canonical option名以外を拒否し、optionsで下げられるが緩和できないようにした。invalid envelope/options、index overflow、resource limit、numerical failure、abortをtyped error codeで識別する
- 対象外: `CalculationClient`、UI、legacy `getTotalDamage`、combo ViewModel、Worker/JSON protocol、display再集約、total summary、公開dynamic outputは変更しない

### Dynamic distribution range Phase 2-H 第6単位

- 完了: `planCanonicalDamageAggregation()`でcanonical damage配列の検証とFFT/resource見積りを一度だけ行い、freeze済みread-only planを公開した。planは入力係数列の所有copyを保持して呼び出し元の後続変更から分離し、そのmemoryも見積りへ含める。`plan.estimates.float64Bytes`等をResourceGuardの`acquirePlan()`へ渡し、偽造・改変planは内部識別で拒否する
- 完了: `sumCanonicalDamage()`が同一planを実行できるようにし、client側でFFT長・resource量を再実装しない。`getCanonicalTotalDamageSummary()`はupper-bound aggregateの`overflowProbabilityLowerBound × lowerBound`を期待値下限へ反映し、sourceMassDrift/errorBoundを区間へ加算しない
- 完了: `CalculationClient.calculateCanonicalTotalDamage()`をopt-inで追加し、入力snapshot、plan、単一lease、同一planのaggregation、summary、finally releaseの順序、abort/requestId/onFftLength、入力非変更・返却alias防止をテストした
- 対象外: 既存`calculateTotalDamage`、UI、combo ViewModel、Worker/JSON、display再集約、公開1024結果は変更しない

### Dynamic distribution range Phase 2-H 第7単位

- 完了: `src/presentation/DistributionPresenter.js`にsingle damageとtotal damageのcanonical envelopeを同じUI非依存display modelへ変換するopt-in presenterを追加し、`src/presentation/index.js`から公開した。`modeledDistribution === true`と`validateDistributionResult`を境界で要求し、metadata・summaryの必須値はown data propertyとして扱う
- 完了: 明示係数はoffsetと通常配列で全件保持し、0確率を残したまま`explicitMax`を導出する。overflow/tailを末尾へ加算せず、support・overflow union、caller提供のmass・expectedValue summary、structured warningを防御コピーして深くfreezeする。point object列は生成しない。JSON copyは循環・accessorをtyped errorで拒否し、深度64・総ノード数10,000、DAG memoを適用する。optionsの`null`等を拒否し、planner warningの`reject` severityをそのまま受理する
- 対象外: UI、ViewModel、Worker、JSON serialization、legacy calculator/adapter、既存consumer、公開結果の切替、canonical resultの生成・serialization、既存1024 bucketの解釈は変更しない

### Dynamic distribution range Phase 2-H 第8前半

- 完了: `createCalculationClient()`へopt-inの`calculateAttackCanonicalBatch(entries, options = {})`を追加し、entry順序・idを保持したcombo配列とcanonical total damage・summaryを一つの成功結果として返す。各entryは既存attack canonical経路を正確に1回通し、全combo成功後にcanonical total aggregationを正確に1回実行する
- 完了: batch専用validatorはentries、entry、id、paramsの構造・own enumerable data property境界とoptionsを開始時に検証し、stringまたはfinite number以外のid、重複id、構造不正な入力/optionsを`CalculationBatchInputError`でtyped rejectする。dice・critical等のゲーム入力leafは既存RangePlannerを唯一の検証元として維持し、空entriesは既存canonical aggregationのdamage 0 identityへ接続し、caller入力・返却combo配列のaliasを作らない
- 完了: batch optionsを開始時にsnapshotし、total aggregationのlimitと`entries.length <= maxComponents`をattack開始前に既存option validatorで検証した。batchを直列実行し、既存RangePlanner preflight、`onRangePlan`、attack/totalの個別ResourceGuard plan・lease・finally release、abort確認、signal・requestId・rangePolicy・onFftLength・runtime options伝播を再利用した。attack leasesをbatch全体で二重予約せず、partial resultを返さない失敗・abort・total失敗の解放順序をspyで固定した
- 対象外: Vue/UI、presentation import、legacy `calculateAttackCombo`・`calculateTotalDamage`、既存canonical単体APIのreturn shape、Worker/JSON protocol、公開1024 bucket、batch専用callback、full-tail、入力上限は変更しない

### Dynamic distribution range Phase 2-H 第8後半

- 完了: `src/application/AttackCanonicalPresentation.js`に`createAttackCanonicalPresentation(batchResult, rangePlans = [])`を追加し、canonical attack batchのcombos、single damage presentation、canonical total damage、total presentationをUI非依存payloadとして一括生成する。canonical envelopeとcaller提供summaryを保持し、再計算・legacy投影・partial payload返却を行わない
- 完了: `rangePlans`はbatchの`onRangePlan`呼出順かつcombo順と1:1で対応させ、count不一致・invalid batch shape・必須summary欠落をtyped application errorで拒否する。各comboには対応planのwarningを渡し、total warningはcombo順・warning順を維持したままdefensive copyへ`entryId`を付けてflat化する。summary/envelope内容の詳細検証は既存presenterのtyped errorへ委ねる
- 完了: combo/planの返却wrapperとmutableなscore/summary/plan内容を入力から分離し、canonical envelopeは既存freeze/defensive contractを保持する。score、scoreSummary、range plan snapshotはplain record・dense/sparse arrayのindexed entries・ArrayBuffer/DataView/TypedArrayに限定したsafe defensive cloneであり、accessor、symbol key、unknown class、cycle、深度/ノード上限超過、Proxy reflection failureをtyped rejectする。payload root、combo配列、combo、mutable snapshotをfreezeし、presenter既存契約によりexplicit probability、overflow/tail、exact・bounded・lower-bound summary、warningのdeep copy/freezeとJSON round-tripを維持する
- 対象外: Vue/template、Attack Viewのscript、legacy表示・`calculateAttackCombo`・`calculateTotalDamage`、Worker/JSON protocol、公開1024 bucket、batch計算経路、full-tail、既存入力上限は変更しない。専用runnerも追加せず、`onRangePlan`収集とstale/AbortSignal制御はcaller責務のまま残す
- 次段階: Attack Vue scriptへopt-in接続し、batch計算成功後に収集したplan配列とpresentation payloadを一回のstate commitへ渡す。必要ならその接続時にのみ、既存`onRangePlan`を保持する薄いrunnerを追加する

### Dynamic distribution range Phase 2-H 第9単位

- 完了: `attackData.canonicalOptIn`を既定falseのscript-only opt-inとして追加し、falseの初期watch、params変更、combo追加・複製・削除・並べ替えでは`calculateAttackCanonicalBatch`を呼ばないようにした。新規comboのcanonical fieldsはapplication helperで遅延初期化し、legacy fieldsと完全分離した
- 完了: opt-in true時は現在のcombo順の`[{ id, params }]`をnested aliasなしでsnapshotし、全comboのcanonical batchを最新runnerへ渡す。`onRangePlan`をentry順に収集し、成功時の`createAttackCanonicalPresentation`を一回に限定した
- 完了: batch開始時のordered entries snapshotとcommit直前の現在canonical入力をID・順序・全paramsで明示比較し、不一致の旧結果をcommitしないようにした。batch resultとpresentation payloadをgeneration/request検証後にatomic commitし、rapid changeのabort/stale抑止、disable中のabortとlate result無視、range/resource reject・error時のcanonical専用clear/feedbackをテストした。legacy resultReady、damage、totalDamage、legacy feedbackは変更しない
- 完了: empty combosではcanonical damage 0 identityをcommitし、combo追加・削除・複製・reorderのid順、plan warning mapping、入力snapshot alias防止をpure application testsで固定した
- 対象外: Vue template、Chart/Summary表示、InputForm/ComboForm template、legacy calculator/state、Worker、JSON、公開1024 bucket、canonical resultの表示切替は変更しない
- 次段階: canonical presentationの表示設計とlegacy結果との比較実測を行い、表示接続・移行条件・dynamic outputのproduction採用可否を決める

### Dynamic distribution range Phase 2-H 第10単位

- 完了: `src/calculation/LegacyCanonicalComparison.js`にUI非依存のlegacy/canonical数値比較coreを追加し、legacy 1024 published distributionとcanonical envelopeを既存`fromPublishedBucketDistribution()`・`toPublishedBucketDistribution()`で防御的に投影して比較する契約を固定した。legacy側はlength/indexed own data propertyを比較境界でsnapshotし、canonical既知schemaはown data propertyのplain snapshot境界を通す。両者の入力と`values`・metadata overflowを防御コピーし、legacy projectionのsupportは`infinite`であり、index 1023を有限maxとは解釈しない
- 完了: `comparable` / `not-comparable`のdiscriminated result、max absolute difference、L1 difference、mass difference、閾値、passedを追加した。暫定閾値はmass `1e-8`、max absolute `2e-6`、L1 `2e-4`とし、入力配列・canonical values・overflowを変更しない
- 完了: invalid legacy inputは既存`DistributionResultAdapterError`のtyped codeを維持し、optionsのaccessor/reflection failureは`LegacyCanonicalComparisonError(INVALID_OPTIONS)`へ変換した。component descriptor overflowはlowerBound・probability・probabilityUpperBound・errorBoundをcanonical overflowと同等に検証し、不正値を`INVALID_SCHEMA`へ変換する。validなupper-bound overflowまたは安全に1023へ投影できないexact overflowは`not-comparable`へ分け、exactは`probability > 0 || errorBound > 0`、upper-boundは潜在massがある場合だけtotal overflow関与とした。totalはactiveなcomponent/source overflowが関与する場合に直接一致を主張しない
- 完了: `tests/legacyCanonicalComparison.test.js`へ、実計算を使った固定値shift・防御、`kazanari > 0`、failure mass、multi-combo total、1023以上へ安全投影できるexact overflow、upper-bound、1023未満のexact overflow、入力非変更のfixtureを追加した。revoked Proxy、result/metadata/options/thresholds accessor、inactive overflow、active component overflow、閾値直上の`passed: false`も固定した
- 完了: expected valueは比較対象へ追加せず、canonicalのexact/bounded/lower-bound summaryとlegacyのraw moment・小数1桁表示丸めを混同しない方針を文書化した
- 対象外: canonical/UI表示切替、performance計測、browser cold/warm計測、Worker/JSON serialization、legacy/canonical return shape、入力上限、依存追加
- 次段階: 比較fixtureのブラウザ実測と表示接続・移行条件・dynamic output採用可否を別単位で判断する

### Dynamic distribution range Phase 2-H 第11単位

- 完了: `scripts/benchmark-phase2h.mjs`と`npm run benchmark:phase2h`を追加し、RangePlanner/preflight、legacy JSON damage、準備済みlegacy combo結果に対するlegacy total、canonical damage、canonical total aggregation、canonical presentation、legacy/canonical comparisonを既存API境界で分離計測した。legacy totalは`getTotalDamage`呼出しだけを計時し、planner・score・asset setupは区間外とした。内部helperへの侵入、公開経路の切替、UI/Worker/JSON変更は行っていない
- 完了: 小規模通常、fixed shift/defence、`kazanari=0`と`kazanari>0`、failure mass、3 combo total、warning-onlyの`planner-only`、明示hard rejectの`planner-rejected`をfixtureとして固定した。`planner-rejected`は`accepted=false`を検出した時点で重い計算へ進まない。各caseの入力、route、execution、executionReason、plan、反復数、warmup、結果digestと制約をJSONへ含めた
- 完了: `performance.now()`によるcold/warm分離、nearest-rank median/p95/min/max、machine/Node/local commit metadata、`--json`、`--iterations`、`--warmup`、結果を捨てないdigestを追加した。統計関数、出力shape、引数validationは軽量テストで固定した。JSONは`npm run --silent benchmark:phase2h -- --json`またはscript直接実行で機械可読stdoutになる
- 完了: Nodeのcold/warmはmodule/Vite load、fixture準備、共有asset登録、browser Worker、fetch/JSON、event-loop delay、Vue/Chart/Summary描画を含まないため、ブラウザ結果と混同せず、Node結果だけでcanonical/dynamic outputの採用判断をしないことを文書化した。Node結果は計算coreの比較基準に限定する
- 残作業: Chrome/Firefox/WebKitの同一fixture、低速実機/低速機相当、Worker起動・往復・cancel/error、fetch/JSON serializationとasset setup、Vue/Chart/Summary描画、fallback、canonical/dynamic outputの採用判断

### Dynamic distribution range Phase 2-H 第12単位

- 完了: `experiments/phase2h-browser/`へ、Node第11単位と同じ7 fixtureを現行公開APIと公開repositoryで測定するブラウザページ、専用Vite config、READMEを追加した。通常、fixed/defence、`kazanari=0/>0`、failure mass、3 combo total、`planner-only`、`planner-rejected`を同じcase idで保持し、production UIと既存srcは変更していない
- 完了: asset fetch、JSON parse、repository registrationをcase計算のwarmup前に独立cold/warm stageとして測定し、`performance.getEntriesByType('resource')`の`dx`/`dr`/`d10` data pathだけをreportへ残すようにした。URLはdata pathへ縮約し、外部URLや個人情報を含めない
- 完了: preflight、legacy damage/total、canonical on-demand damage/total aggregation、canonical presentation、legacy/canonical comparisonを個別stageで測り、main-thread invocation elapsed、queued zero-delay timer delay、cold/warm nearest-rank median/p95/min/max、numeric digest、Long Task supported/nullを保持する。comparisonは`comparable`/`not-comparable`をcase reportへ保存する
- 完了: `window.__phase2hBrowserBenchmarkResult`/`window.__phase2hBrowserBenchmarkError`と画面JSON、browser userAgent、viewport、case counts、pageErrors/unhandledrejections、resource fetch countを公開した。Workerは現行canonical Attack stateが未接続のため`not-connected`と記録し、Worker経路を偽装しない
- 完了: `iterations`/`warmup` query overrideに安全な上限を設け、`npm run benchmark:phase2h:browser`をローカルVite起動案内として追加した。npm testへブラウザ起動を追加せず、READMEへtimer delayがCPU時間ではないこと、Chrome実測後にFirefox/WebKit/低速機を検討すること、production切替対象外であることを記録した
- 完了: `experiments/phase2h-browser/playwright-runner.mjs`と`npm run benchmark:phase2h:browser:playwright`を追加した。Playwright管理のFirefox/WebKitを順次起動し、専用Vite、ページ完了待機、7ケースのstatus/count、page error、asset setup、numeric digest、cleanupを検証してJSONを標準出力へ出す。`--iterations`/`--warmup`を転送し、通常のnpm testへブラウザ起動を追加していない。ブラウザ未取得環境の導入手順は実験READMEへ記録した
- 完了: 親タスクで`npm run benchmark:phase2h:browser:playwright -- --iterations 3 --warmup 1`を実行した。Firefox 153.0とWebKit 26.5の両方で7ケース（measured 5、planner-only 1、planner-rejected 1、error 0）、page error 0、numeric validation成功、Vite/profile cleanup成功を確認した。canonical damage warm中央値最大値はFirefox 54 ms、WebKit 23 ms、legacy damageは両engine 2 ms、asset setupはFirefox 23 ms、WebKit 26 msだった。Chromeの親タスク実測と同じく、Workerは`not-connected`である
- 残作業: 低速実機・低速機相当、Workerが必要になった場合の別経路、Vue/Chart/Summary描画は別測定とする。結果だけでcanonical Worker接続、JSON削除、入力上限、production UI切替を行わない

### Dynamic distribution range Phase 2-H 第13単位

- 完了: `experiments/phase2h-browser/playwright-runner.mjs`を拡張し、既存のFirefox/WebKitと同じ7 fixtureをChrome channelでも測れるengineを追加した。ChromeだけCDPの`Emulation.setCPUThrottlingRate`へrate 4を設定し、通常Chromeは親タスク実測との重複を避けるため既定では省略する。`--include-chrome`で通常Chrome比較を明示的に追加できる
- 完了: CPU throttleの適用・rate 1への解除、CDP session、page、browser context、一時profile、専用ViteのcleanupをJSONへ記録し、page error、ページ側unhandled rejection、7ケースのstatus/count、case id、stage error、asset setup、numeric digest、Long Task、result sinkをrunner側で検証する。ブラウザ実測結果は標準出力だけへ出し、結果ファイルやdistを保存しない
- 完了: `npm run benchmark:phase2h:browser:playwright`を標準条件、`npm run benchmark:phase2h:browser:playwright:short`を`iterations=1`/`warmup=0`の短縮条件として追加し、個別の`--iterations`/`--warmup`転送も維持した。既存のplanner-only/planner-rejected、入力上限、core cap、production UI、Worker接続、既存APIは変更していない
- 完了: 親タスクで`npm run --silent benchmark:phase2h:browser:playwright`を実行した。Firefox 153.0、WebKit 26.5、Chrome channel 151.0.7922.138（CPU throttle rate 4）の全engineで7ケース（measured 5、planner-only 1、planner-rejected 1、error 0）、page error 0、numeric validation成功、Vite/profile/CDP cleanup成功を確認した。canonical damage warm中央値最大値はFirefox 46 ms、WebKit 22 ms、Chrome CPU 4x 143.3 ms、legacy damageは2 ms、1 ms、4.4 ms、asset setupは22 ms、20 ms、67.5 msだった
- 判断: CPU throttleは実CPU時間や低速実機のCPU・メモリを再現しないが、Chrome CPU 4xでcanonical計算が143.3 msまで増加したため、低速条件ではWorker接続を候補として優先する。低速実機・Worker往復・UI描画の実測を終えるまで、メインスレッド実行、JSON削除、入力上限、canonical/dynamic outputのproduction採用は決めない

### Dynamic distribution range Phase 2-H 第14単位

- 完了: canonical Attack batchのproduction依存を監査し、`CalculationClient`のdefault `getDamageRollDistribution`がmodule内singletonの`RuntimeDamageRollClient.calculate`であること、canonical damageのDR部分だけが既存`RuntimeDamageRollWorker`を利用すること、score/DX、D10 asset、固定値差、防御畳み込み、failure合成、canonical envelope/total aggregationはmain threadに残ることを確認した。`AttackCanonicalRunner`のstale/AbortSignal責務と、`Attack.vue`の`canonicalOptIn=false`・canonical template未接続も確認した
- 完了: `experiments/phase2h-browser/canonical-attack-worker-benchmark.html`と専用moduleを追加し、既存7 fixtureをpublic `calculateAttackCanonicalBatch`境界へ渡すproduction依存の実測ページを用意した。warning境界はpublic `planAttackCombo`、reject境界はpublic batch preflight rejectとして扱い、既存のcore直呼び出しPhase 2-Hページと区別した
- 完了: native Workerの薄い診断wrapperで生成、postMessage/message、transfer bytes、error/messageerror、terminateを、`fetch` wrapperとresource timingでdata asset fetchを記録するようにした。実AbortSignal cancelと既存`AttackCanonicalRunner`のstale二連続requestも診断し、Workerを意図的に壊すsynthetic errorは行わない
- 完了: `tests/canonicalAttackRuntimeWorkerContract.test.js`でFakeWorkerを使い、canonical batchが既存`RuntimeDamageRollClient` providerを介してWorkerへ到達する契約を固定した。`tests/canonicalAttackWorkerBenchmarkContract.test.js`で7 fixture idとpublic boundary、direct `calculateCanonicalDamageOnDemand`不使用を固定した
- 対象外: production `src`、既存Worker protocol、JSON serialization、入力上限、legacy経路、Attack template表示切替、追加依存、GUI、git commit
- 完了: In-app Chrome（Chromium 151.0.0.0、Windows）の標準条件（`iterations=3`、`warmup=1`）で7 casesを実測し、`measured=5`、`planner-only=1`、`planner-rejected=1`、`error=0`を確認した。canonical Attack batchのwarm invocation median最大は`combo-total-3`の2.4 ms、cold最大は40.9 ms、small case coldは25.3 msだった。短縮条件（`iterations=1`、`warmup=0`）も成功した
- 完了: production Workerは1 instance、8 postMessage/8 message、transfer 8回・12,992 bytes、worker error/messageerror 0、terminate 0だった。D10 asset fetchはstatus 200を1回、encodedBodySize 373,168 bytes、fetch elapsed 3.7 ms（resource 1.8 ms）で、pageErrors/unhandledRejectionsは0件だった。cancelは`abortSent=true`かつ`AbortError`、staleは`firstCommit=false`、`secondCommit=true`、`runnerErrors=0`でmeasuredだった
- 判断: 上記は単一ブラウザ・単一実行条件の結果であり、Worker接続は既存DR部分のみと確認した。score/DX、preflight、D10、固定値差、防御畳み込み、failure合成、canonical envelope/total aggregationはmain threadのままであり、新しいWorker protocol、score/DXのWorker移行、canonical UI表示切替はこの単位では行わない
- 次段階: ブラウザ間差・端末差を調べる場合、またはscore/DXをWorkerへ移す場合は別単位で設計・実測する。新しいWorker protocolを推測で追加しない

### Dynamic distribution range Phase 2-H 第15単位

- 完了: 既存`experiments/phase2h-browser/playwright-runner.mjs`へ`--target core|canonical-attack`の明示分岐を追加し、既定のcore target（`browser-benchmark.html`、既存結果global、既存report validation）は変更せず、canonical targetだけを`canonical-attack-worker-benchmark.html`へ向けた
- 完了: canonical targetでFirefox、WebKit、Chrome channel CPU 4xを順次実行し、`--include-chrome`時だけ通常Chrome channelを追加するengine構成を維持した。`--iterations`/`--warmup`、Node version check、専用Viteの空きport、temporary profile、engine/CDP/page/context/Vite cleanup、標準出力JSON、結果ファイルを保存しない方針を維持した
- 完了: canonical reportの`status=measured`、7 fixture id/count（measured 5、planner-only 1、planner-rejected 1、error 0）、pageErrors/unhandledRejections 0、`production-runtime-observed` Worker、Worker error/messageError 0、cancelのmeasured/AbortError、staleの`firstCommit=false`/`secondCommit=true`、D10 asset fetch status 200をrunner側で検証し、各engineのWorker countersとtiming summaryを出力へ残すようにした
- 修正: `runCancelProbe`のabortを`setTimeout(0)`から`CalculationClient`の同期`onRangePlan`通知内へ移し、preflight後かつWorker実行前に`AbortSignal`を発火するdeterministic cancellationへ変更した。reportへ`abortBoundary=onRangePlan-preflight`とinterpretationを残し、runnerのAbortError必須検証と`completed-before-abort`非許容は維持した
- 完了: `benchmark:phase2h:browser:playwright:canonical-attack`と短縮条件`...:canonical-attack:short`を追加し、既存core runnerの標準/short scriptは維持した。CLI args、canonical path/global、engine ids、report validationを`tests/canonicalAttackPlaywrightRunnerContract.test.js`で固定した。ブラウザ起動は`npm test`へ追加していない
- 対象外: production `src`、JSON、既存Worker protocol、UI、既存core runnerの測定対象、Phase 13のcore結論、Phase 14のIn-app Chrome結果、追加依存、外部アクセス、git commit
- 経緯: 初回親実測ではFirefoxとChrome CPU 4xのrunner validationは成功し、WebKitは処理完了が`setTimeout(0)`より先行して`completed-before-abort`となりvalidation失敗した。既存結果を捨てず、速度非依存のpreflight boundary cancellationへ修正した
- 完了: 親タスクの昇格実行`npm run --silent benchmark:phase2h:browser:playwright:canonical-attack -- --iterations 3 --warmup 1`（`resultsPersisted=false`）で修正後の3 engine実測を完了した。Firefox 153.0はcanonical warm invocation median最大3 ms、cold最大52 ms、WebKit 26.5はwarm最大2 ms、cold最大40 ms、Chrome channel 151.0.7922.138（CPU throttle 4x）はwarm最大7.4 ms、cold最大110.4 msだった。全engineでstatus measured、7 cases（measured 5、planner-only 1、planner-rejected 1、error 0）、case IDs、page/unhandled errors 0、D10 status 200、cancel/stale validation成功、cleanup成功を確認した
- 完了: 各engineでWorkerは1 instance、7 postMessage/7 message、transfer 7回・11,368 bytes、worker errors 0・messageErrors 0だった。cancelは`status=measured`、`AbortError`、`abortBoundary=onRangePlan-preflight`、staleは`firstCommit=false`/`secondCommit=true`で、ChromeもCDP resetを含めてcleanup成功した
- 判断: 結果は標準条件の単一実行であり、CPU throttleは実CPU・低速端末のCPU/メモリを再現しない。Worker接続は既存DR部分のみで、score/DX、preflight、D10、固定値差、防御畳み込み、failure合成、canonical envelope/total aggregationはmain threadに残る。実測だけで新しいWorker protocolやcanonical UI切替を決めない
- 次段階: 3 engine結果の数値・validation・cleanupを基準に、canonical UI接続やWorker範囲の変更可否を別単位で判断する。score/DXを含む新しいWorker経路やprotocolは推測で追加しない

### Dynamic distribution range Phase 2-H 第16単位

- 完了: `src/views/Attack.vue`に独立した`CanonicalAttackPanel`を接続し、`canonicalOptIn`を既定`false`として、トグル有効時だけcanonical計算と結果表示を行う。既存legacyチャート、サマリー、`resultsReady`、legacy fieldsは変更していない
- 完了: `RangePlanNotice`を再利用し、canonical expected value、support、explicitMax、overflowを欠損・非有限値に耐える純粋表示helperで安全に表示する。`exact`/`bounded`/`lower-bound`とoverflowの`exact`/`upper-bound`を区別し、巨大な`probabilities`配列をDOMへ列挙しない
- 完了: canonical panelの接続契約、legacy表示との分離、表示helperの安全なフォーマットをunit testで固定した
- 完了: canonical damage envelopeからlegacy chart互換の1024 bucketと上側確率を作る移行用projection boundaryを追加し、`DamageChartPanel`/`SummaryPanel`へ接続する前段としてcanonical overflowとpresentationを保持した。summaryの期待値丸めは行わない
- 完了: `upper-bound` overflowとlegacy bucketへ安全に投影できないexact overflowは`not-projectable`として理由を保持し、自動投影しない。上界を実確率として表示配列へ変換しない
- 完了: `canonicalOptIn=true`で全comboとtotalが安全なexact finite projectionに成功した場合だけderived display dataを既存`DamageChartPanel`/`SummaryPanel`へ渡し、それ以外はlegacy `attackData`へfallbackする。ScoreChart、InputPanel、レイアウト、既存コンポーネント、`resultsReady`は変更していない。これらのtest-only projection adaptersと専用テストは最終比較完了後のPhase 7 cleanup第1単位で削除した
- 対象外: canonical結果によるlegacyチャート・サマリーの無条件または全面置換、bounded/lower-boundの一点値化、dynamic outputの採用、新しいWorker protocolの追加・変更、score/DXのWorker移行
- 次段階: exact finite以外のcanonical表示範囲、legacyとの比較条件、Score/Worker範囲を別単位で判断する。実測だけで既存表示やprotocolを切り替えない

## Canonical migration Phase 4: 通常のCheck（完了）

- 完了: `ef14744`、`dfe25fe`、`cdef582`、`b0bede7`、`fac55bb`で、通常Checkのcanonical producer、presentation/chart/summary接続、既定Check接続、dynamic display window、controlled SettingForm、999上限撤廃、coverage再利用・不足時latest-wins再計算、resource拒否時のclient未呼出、upper-bound terminal、legacy fallbackなしを実装した。
- 検証: 全715テスト、lint、Markdown、buildが成功した。2026-08-20のin-app browserで`/check`を確認し、初期`0..30`、`0..1200`への拡張、`0..20000`のdisplay resource rejection（警告表示）、`30`への復旧、canvas 1、console warn/error 0を確認した。
- 状態: historical（Phase 5時点ではAttackのScore/Damageをdynamic displayへ接続した。後続のPhase 6〜7でAttack、Backtrack、Checkのcanonical default化とproduction legacy経路/fallback削除を完了した。）

## Canonical migration Phase 5: AttackのScore/Damageをdynamic displayへ接続する（完了）

- 成果（完了）: `c457b5c`でDamage/Total display coverage拡張、`b305eb7`でcanonical Attack Score表示接続、`1401695`でAttack Score display coverage拡張、`ffb7785`でcanonical total damage aggregationの`errorBound > 0` tailにおける`lowerBound`保持と既定Damage `0..100`のcoverage誤判定修正、`00b5b3f`でScore期待値tail certificate・両側tail成功率区間・丸め安定時だけの既存サマリー表示、`eb043a9`でAttack入力のcontrolled化、`c26d511`でproduction公開CalculationClientを通すlegacy比較fixtureを実装した。
- 入力データフロー（完了）: `AttackForm.vue`と`DefenceForm.vue`はlocal draftから最新async validationのvalidated snapshotだけをemitし、`ComboForm.vue`はside paramsを一括置換して1 validated eventにつきcanonical latest-wins runnerを1回だけ発火する。showDetailsは明示eventとし、validation gateとrunnerをunmount時にdisposeして破棄後のemit/runを抑止する。snapshot alias防止、Defence mode正規化、latest ticket/disposeは`tests/attackInputSnapshot.test.js`で固定した。canonical batch laneの既存submit-time snapshot/latest-wins、canonical runner、表示は変更していない。
- 実装済み: Score/Damageの独立lane、coverage内reuse、finite known-zero、coverage不足時latest-wins batch再計算、resource reject時のclient未呼出、Score-only reject時のDamage保持、legacy fallbackなしを確認した。
- legacy比較fixture（完了・履歴）: 最終比較では`tests/attackCanonicalLegacyFixture.test.js`で同じordered 2-combo入力をlegacy `calculateAttackCombo`/`calculateTotalDamage`とcanonical `calculateAttackCanonicalBatch`へ通して比較した。最終比較完了後、このclient-level fixtureはcleanup第2単位で削除し、下位core比較・migration fixtureへ責務を残した。
- ブラウザ受入（2026-08-22、in-app Chromium / Vite local）: canonical opt-in既定入力のScore/Damage各`0..100`と各`0..1200`で計算完了・2 chart・alertなし、Score `0..20000`の描画点数resource reject時はDamage chart保持、`0..100`復帰時は2 chart復旧・alertなしを確認した。`00b5b3f`後の既定サマリーは達成値期待値`6`、命中率`45.5%`、ダメージ期待値`3.1`となり、新規セッションconsole warn/error 0件だった。
- 追加ブラウザ受入（2026-08-23、in-app Chromium / Vite local、canonical opt-in）: action diceを`2→20→3`と連続入力すると最終値`3`だけが残り、サマリーは達成値期待値`9.7`、命中率`71%`、ダメージ期待値`5.5`、chart 2だった。入力`99`直後にcomboを削除しても削除済み結果は復活せず、新規comboは既定dice `1`、サマリーは`6`、`45.5%`、`3.1`、chart 2だった。《妖精の手》`2`を設定後に詳細設定を閉じ、再度開くと`0`へ戻り、サマリーも既定値へ復帰した。console warning/errorとJavaScript dialogは0件だった。action dice `3`では、boundedなcanonicalダメージ期待値を安定した丸め値として表示する既存契約に伴い、「canonicalの期待値が正確値でない」という画面内の注意を確認した。明示的なresource warningは対象外とした。一時server/tabを終了し、port `3000`を解放したため、追加ブラウザ実測は完了とした。
- Score期待値表示契約（完了）: 無限supportでScore期待値certificateが未対応の`skill<0`、`yousei>0`、`shihai>0`は、内部expected valueをlower-boundのまま保持し、通常UIの達成値期待値を`—`とする。これは期待値の保証範囲に限る契約であり、canonical分布・chart・計算自体の失敗を意味しない。successRateは独立したcertificate/区間規則に従い、丸めが確定すれば表示し、Damage/Totalも各自の契約で表示を継続する。`dice<=shihai`の自動失敗や`critical=11`などfinite supportでgeneric summaryがexactになる場合は従来どおり数値表示する。
- 将来拡張TODO: 未対応の無限supportは恒久的な非対応とはせず、負の`skill`（clampを含むshifted tail-sum）、`yousei`（exact-youseiのfirst-moment residual）、`shihai`（DPに対応するtail first-moment certificate）の順に検討する。canonical既定化、debug panel/toggle削除、legacy計算・fallback削除はPhase 7で扱う。

## Canonical migration Phase 7 第1実装単位: バックトラックcanonical default（完了）

- 完了: Backtrackの初期計算・再計算を`createBacktrackCanonicalRunner`の`calculateBacktrackCanonical`→`createBacktrackCanonicalPresentation`経路へ統合し、`Backtrack.vue`の初期計算も`onMounted`から同じrunnerで実行するようにした。
- 完了: `InputPanel.vue`と`Backtrack.vue`から一時`canonicalOptIn` toggle、snapshot mode、legacy branchを削除した。canonicalのpresentation error、ResourceGuard rejection、range rejection、abort、stale result、disposeでは結果をclearし、retryで復旧する。
- 完了（cleanup第2単位）: `/backtrack`を含む全計算routeの`prepareCalculation`/`beforeEnter` preloadと`CalculationClient.prepare`を削除した。legacy core/assets、下位比較テストは維持している。
- 検証: canonical adapter、resource rejectionのclear/no fallback、retry、abort/latest-wins、入力snapshotのtoggle削除、route preloadなしを`backtrackCanonicalIntegration.test.js`と`backtrackInputSnapshot.test.js`で固定した。
- ブラウザ受入（2026-08-24、in-app browser / Vite local `--force`）: `/backtrack`で一時canonical toggleは表示されず、初回からcanvas 3、alertなしを確認した。侵蝕率`90→140→105`の連続入力後は最終値`105`、canvas 3、alertなしだった。Dロイス「なし」「不死者・悪夢」「屍人」の各ケースでもcanvas 3、alertなしだった。完全Vue mountはNode test環境制約で未実施だが、runner behavior/router module testで補完した。検証用tab/serverは終了し、port `3000`を解放した。
- legacy削除前の最終比較（2026-08-24、Node/Vitest）: Check/Attack/Backtrackのcomparison・migration・asset・runtime rule・range関連15ファイル229テストを実行し全件成功した。Checkはdice 0/1/99、critical 2/10/11、skill正負、yousei/shihai、failure/fumble、tail certificateを、Attackは既存2-combo fixtureと追加境界fixtureでdice 0/1/2/99、critical 2/11、skill正負、yousei/shihai、defence、fixed damage、kazanariを、Backtrackは7種Dロイス、標準/悪夢境界、負値、asset/on-demand境界をlegacyと比較した。比較可能なScore/Damageは既存のexactまたはtolerance契約で成功し、同じ境界fixtureのcritical 11/dice 0・99のfinite-support subsetではcanonical batchの個別DamageとTotalをlegacy per-combo→legacy totalへ直接比較して成功した。critical 2/youseiを含むfull boundary batchのTotalは`not-comparable`（`total-overflow`）とoverflow certificateを確認し、canonical tailを0扱いせず、legacy total API削除前の残余ギャップとして記録した。
- legacy cleanup第1単位（完了）: 最終比較完了後、productionからimportされないtest-only legacy display adaptersと専用テストを削除した。実計算比較fixture、`LegacyCanonicalComparison`、`CalculationClient` legacy API、legacy core/wrappers、legacy assets/JSON/generatorは後続まで維持する。
- legacy cleanup第2単位（完了）: 最終比較完了後、`CalculationClient` legacy計算API、legacy score/damage/backtrack dependency、fallback、route `prepare`、全計算routeのpreload guardを削除した。client-level legacy比較fixtureと専用client/prepareテストを削除・canonical契約へ移植し、`LegacyCanonicalComparison`、下位core/migration/rule/asset tests、legacy JSON/assets/generatorは維持している。
- 状態: Phase 7のバックトラックとAttackのcanonical default化、ブラウザ受入、legacy削除前の最終比較、CalculationClient/route cleanup第2単位、任意表示範囲の最終受入、最終HEAD gateは完了した。Phase 8-1 inventoryとPhase 8-2A/2B/2C/2D/2E/2F/2G1/2G2/2G3/2G4/2G5/2G6（ChartSetter split、CalculationClient dependency contract、production browser smoke、precomputed repository source split、reference/legacy importer audit、runtimeRuleValidation actual migration、facade importer migration、calculation barrel importer migration・削除、compatibility facade・専用test削除、data calculator wrapper削除）も完了している。legacy core/assets/生成物/JSON、benchmark/experimentの個別cleanupは後続作業とし、次はG7のlegacy comparison/migration依存整理へ進む。

### Full-tail Attack resource benchmark

- 完了: `scripts/benchmark-full-tail-attack.mjs`と`benchmark:full-tail-attack`（`npm run --silent benchmark:full-tail-attack`）を追加し、DR単独の202/300/400/600/800D × `kazanari=0/1/9`と、full-tail Attackの99D通常、202/300/400/600D境界、`kazanari=1/9`、`yousei=9`、`shihai=19`を標準出力JSON/人間向け行形式で測定する契約を追加した。各caseはscore cutoff、maxDamageDice、rawSupportMax、workingLength、FFT長、distributionLength、kazanari、elapsed、RangePlannerのestimatedTimeMs/estimatedMemoryBytes、production/benchmark policyのaccepted/status/rejection、tail metadata、digestを記録する。
- 校正前の標準実測（Windows `win32/x64`、Node `v22.23.2`、Ryzen 7 9700X、warm=3、warmup=1）: DRのwarm中央値（kazanari=0/1/9）は202D=`1.30/7.60/21.65 ms`、300D=`1.16/22.22/64.74 ms`、400D=`1.54/29.33/85.88 ms`、600D=`4.17/88.74/282.91 ms`、800D=`5.95/118.14/378.26 ms`だった。高負荷Attackはscore cutoff=`2271/4261`、maxDamageDice=`427/626`、rawSupportMax=`4270/6260`、FFT=`8192`、estimatedTime=`401.98/566.72 ms`となり、現行hard `estimated-time=200 ms`により計算前rejectとなった。planner閾値は変更していない。
- 解釈: 今回はNodeのcanonical core/resource計測であり、browser/低速機/Worker往復・UI描画は未測定である。これらの後続実測とproduction採用判断は別単位で行う。
- Task 2/3更新（当時）: full-tail Attack benchmarkは各caseでproduction相当policyのaccepted/status/rejection理由と推定値を先に記録し、RangePlannerのthresholdだけを広げたbenchmark policyでacceptedなcaseに限りScore→hit→DR→defence→Damage→canonical totalを実行する。production policy、absolute safety cap、Task 5 threshold、browser測定はこの時点では変更していない。Task 4ではRangePlannerのkazanari cost modelを実測へ校正し、詳細とestimate/measured比を`docs/runtime-calculation-algorithms.md`へ記録した。
- Task 4完了（当時）: damage本体のmaxDamageDice×FFT長、Score operations/FFT、defence FFTの分離を維持し、kazanari係数を`1 + 15 × log1p(kazanari)`へ変更した。DEFAULT_POLICYの200ms等threshold、production policy、runtime絶対上限は未変更である。browser受入とTask 5判断は後続Task 6/5で実施した。
- Task 6完了: 既存canonical Attack targetを壊さず、専用`full-tail-attack-resource` browser target/page、11-case matrix（202/400/600D × kazanari 0/1/9、yousei9、shihai19）、short CLI、stdout/page-global reportを追加した。Chrome desktop/CPU 4x短縮実測で各11 cases benchmark measured、production reject 3件、Worker/D10、planner/end-to-end/Worker timing、Long Task、performance.memory before/after、cancel/staleを記録した。production threshold/cost model/runtime absolute capは未変更である。
- Task 5暫定判断: 今回のNodeおよびChrome desktop/CPU 4x測定だけではhard thresholdを引き上げず、productionの推定時間warning/hard thresholdは50/200 msを当面維持する。CPU 4xの高負荷end-to-endとWorker応答が100/200 msを超えるためであり、低速実機、Firefox/WebKit、実際のUI描画を含む最終再評価は別環境で行う。
- Task 7 acceptance（2026-08-25、commit `8c7d10c`）: Node `v22.23.2`でfull-tail benchmark短縮実測（DR 15ケース、Attack 9ケース、`iterations=1`、`warmup=0`）を完走し、production planner rejectは`yousei=9`、`shihai=19`を含む3件、benchmark側は全24ケースを測定した。`d30b3d1`後の最終ローカルgateでは、`data:check`が32 assets、`data:verify-generator`が32 assets、Nodeテストが61ファイル877テスト、generator testが18 passed/13 deselected、simulationが13 passed/18 deselected、JavaScript lint、Markdown lint（23ファイル0 issues）、generator lint、build、`git diff --check`、`check:node`がすべて成功した。Chrome desktop/CPU 4xの11ケース計測結果、Worker/D10、cancel/stale、Long Task、memoryの詳細は`docs/runtime-calculation-algorithms.md`と`experiments/phase2h-browser/README.md`に記録している。位置不明Score tailのprojectability受入とPhase 8 JSON/assets整理は後続である。
