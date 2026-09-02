# リファクタリング依存境界

この文書は、R2で固定した現行モジュールの責務と依存方向を記録する。目的は、feature-firstのディレクトリ移動を直ちに行うことではなく、移動前の段階で逆依存を検出できる状態を作り、後続phaseの設計判断を一貫させることである。R0のbehavior baseline `2770c2c87000c7d878a5e1bd81698c4781d0bbce` は引き続き比較基準として保持する。

## R2の範囲

R2では、現行ファイルを新しいディレクトリへ移動しない。ESLintへTypeScript parserと責務別の依存制限を追加し、計算coreがUIへ逆依存しないこと、UIが計算実装を直接呼ばないこと、公開済み事前計算データの参照repositoryがproduction pathへ戻らないことを機械的に検査する。計算アルゴリズム、canonical result、入力仕様、Worker protocol、公開assetは変更しない。

## 現行logical layer

| Layer | 現行パス | 責務 |
| --- | --- | --- |
| UI / app shell | `src/main.js`、`src/App.vue`、`src/router/**`、`src/plugins/**`、`src/layouts/**`、`src/views/**`、`src/components/**` | Vue、routing、入力、rendering、component lifecycle |
| Application / runtime orchestration | `src/application/**` | CalculationClient、snapshot、latest-wins、resource guard、DR Worker client、feature controllerの接続 |
| Core | `src/domain/**`、`src/calculation/**`、`src/data/Distribution.js`、`src/data/FFT.js` | ゲームルール、確率計算、range/resource planning、canonical result、数値不変条件 |
| Pure presentation | `src/presentation/**` | canonical resultから表示用projectionやformattingを作る純粋な変換 |
| Reference / published-data support | `src/data/ReferencePrecomputedDataRepository.js`、`src/data/PrecomputedDataSchema.js` | 公開schema-v2 assetの取得、検証、独立比較用cache |
| Mixed / future shared | その他の`src/data/**`、styles、assets | R8以降にsymbol単位で責務を再評価する対象 |

`src/data`全体をlegacyとして禁止してはいけない。`Distribution.js`と`FFT.js`はproduction probability primitiveであり、`ReferencePrecomputedDataRepository.js`と同じ扱いにはしない。

## 依存方向

現行構成では、UIは`CalculationClient`を介してcoreを利用し、applicationがruntime primitiveを接続する。次の方向を後続のtargetとして採用する。

```text
app
 ↓
features
 ↓
runtime ─────→ core
 ↓             ↑
shared ────────┘
```

targetの原則は、`app → features`、`features → runtime/core/shared`、`runtime → core/shared`、`core → core only`、`shared → shared`である。`shared → core`はpure typeや汎用probability utilityなど、共通化の根拠がある場合に限る。

次の方向は、runtime importとtype-only importの両方で禁止する。

```text
core → runtime / features / app
runtime → features / app
shared → feature-specific module
```

## R2 dependency matrix

| From | To | R2 | Future target |
| --- | --- | --- | --- |
| View / Component | Calculation core | 禁止 | 禁止 |
| View / Component | CalculationClient | 許可 | runtimeまたはfeature経由 |
| View / Component | Domain types / validation | 許可 | 許可 |
| Application | Core | 許可 | runtime → core |
| Application | View / Component / Router | 禁止 | 禁止 |
| Core | Application | 禁止 | 禁止 |
| Core | Vue / UI / Presentation | 禁止 | 禁止 |
| Presentation | Core result / types | 許可 | featureまたはshared presentation |
| Presentation | View / Component / Router | 禁止 | 禁止 |
| Production | Reference repository | 禁止 | 禁止 |
| Tests | Reference repository | 許可 | 許可 |

## ESLintによる強制

`typescript-eslint`をdirect devDependencyとして追加し、`src/**/*.ts`をparserで読み込む。R2ではrecommended rulesやtype-aware lintを一括有効化せず、TypeScript syntaxを既存のarchitecture ruleで検査する。TypeScriptの`no-undef`と`no-unused-vars`は型構文を誤検出するためこの段階では無効化し、型の正しさは`npm run typecheck`へ委ねる。

`src/calculation/**`、`src/domain/**`、`src/data/Distribution.js`、`src/data/FFT.js`には、Vue、Vuetify、vue-router、Chart.js、Vue Chart.js、chart plugin、Nodeのimportを許可しない。application、UI、router、plugins、layouts、presentationへのinternal importも禁止し、`window`、`document`、`fetch`の直接利用も禁止する。

`src/App.vue`、`src/main.js`、`src/plugins/**`を含むapp shellと、`src/views/**`、`src/components/**`、`src/router/**`、`src/layouts/**`からは、`src/calculation/**`、`Distribution.js`、`FFT.js`、計算用legacy facade、reference repository、published-data schemaを直接importできない。確率計算は`CalculationClient`を経由する。`main.js`はCalculationClientのbootstrapとprovideを担当できるが、calculation coreを直接呼ばない。pluginsはVue/Vuetifyのframework setupを担当し、probability coreを直接参照しない。

`src/application/**`からUI shellへのimportを禁止し、`src/presentation/**`からUI shell、application、Vue、chart packageへのimportを禁止する。presentationはresultからview modelを作る純粋な変換に留め、計算の実行やcomponent lifecycleを担当しない。

`ReferencePrecomputedDataRepository.js`はproduction sourceのどのlayerからもimportできない。現在のreference repository自身が`PrecomputedDataSchema.js`を利用することはreference supportの内部責務として許可し、core、application、UI、presentationからschemaを直接参照することは禁止する。

`no-restricted-imports`のregexはalias形式と相対形式の両方を対象にする。`import type`も通常のimportと同じ依存関係として扱い、runtime bundleへ含まれないことを理由に境界違反を許容しない。

architecture restrictionは独立scannerを追加せず、`npm run lint`を正規gateとする。仮想のTS/JS入力を使ったconfig regression確認では、core→application、UI→calculation、application→view、presentation→application、core→Vueの各違反とtype-only importを検出できることを確認した。恒久的なnegative fixtureはrepositoryへ追加しない。

## 既存違反と例外

R2のcurrent source auditでは、追加した禁止方向に該当するproduction違反は見つからなかった。したがってtemporary exceptionは0件であり、directory全体のignoreやfile単位の例外も設定していない。今後例外が必要になった場合は、対象file、対象import、理由、退役予定phaseをこの文書へ明記する。

## 将来のtarget directory mapping

R3以降で実ファイルを移動するときは、次の対応を初期案とする。R2では移動しない。

| 現行 | target |
| --- | --- |
| `main.js`、`App.vue`、router、plugins、layouts | `app/` |
| views、feature component | `features/*/ui/` |
| feature-specific application state、runner、presentation | `features/*/model/` |
| CalculationClient、ResourceGuard、latest async task、RuntimeDamageRoll* | `runtime/` |
| `domain/**` | `core/domain/` |
| `calculation/**` | `core/calculation/`、`core/planning/`、`core/model/` |
| `data/Distribution.js`、`data/FFT.js` | `core/probability/` |
| generic formatting、chart、theme | `shared/` |
| ReferencePrecomputedDataRepository、PrecomputedDataSchema | `tests/support/`または`tooling/reference-data/` |

## 検証記録

R2の基本依存境界実装は `ff3a67e`（calculation dependency boundaries）である。2026-09-02のclean installは`npm ci`で302 packagesを構築し、0 vulnerabilitiesだった。`npm run typecheck`、`npm run lint`、Vitest 59 files / 790 tests、`npm run data:check`（32 assets）、generator tests 18 passed / 13 deselected、simulation 13 passed / 18 deselected、Ruff、`npm run verify:runtime-dx`（20,000 cases、non-finite 0、negative 0）が成功した。

app shellまで含めたR2の最終closure implementationは `c2dbc9b` であり、closure日は2026-09-02である。このcommitで`src/App.vue`、`src/main.{js,ts}`、`src/plugins/**/*.{js,ts}`をUI architecture restrictionへ含めた。architecture negative probeは、main.js → calculation、App.vue → calculation、plugins → Distribution、type-only plugin → calculationをrejected、main.js → CalculationClientをallowedとして確認した。temporary architecture exceptionは0件である。`npm run lint:markdown`は27 files / 0 issues、`npm run build`は394 modules transformedで成功し、`npm run smoke:production`もCheck、Attack、Backtrackの既存ケースで成功した。browser smokeではprecomputed/D10 request 0、console warnings/errors 0、same-origin HTTP errors 0を確認し、`git diff --check`も成功した。R0 behavior baselineとproduction calculation behaviorは変更していない。

## R3への引き継ぎ

R3はBacktrack featureizationを対象とする。`features/backtrack`、`runtime`、`core`、`shared`への移動を検討する際も、本書のmatrixとESLint gateを維持し、Backtrack input domain、RangePlanner/resource admission、canonical finite-support result、chart behavior、latest-wins、browser smokeを保護する。R2の成功条件は新directoryの作成ではなく、逆依存を作る変更がlintで即座に失敗することである。
