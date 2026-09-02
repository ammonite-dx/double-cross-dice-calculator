# Check feature化

この文書は、通常のCheck画面をfeature-firstの構成へ移したR4の実装記録である。計算アルゴリズム、入力値の意味、確率の丸め、表示window、canonical resultの判定は変更せず、Check固有の責務の所在と依存方向だけを整理した。R4開始時の基準は `1c223b1`、比較対象のbehavior baselineは `2770c2c87000c7d878a5e1bd81698c4781d0bbce`である。R4の実装後には、表示再計算のloop guard、型境界、production browser acceptanceを追加で確認した。

## 目標

Checkのroute viewを画面の組み立てだけを担当する薄いentry pointにする。入力の初期値、validated snapshot、非同期計算、latest-wins、Abort、表示範囲のpreflight、feedback、unmount時のdisposeをfeature modelへ集約し、CheckのUI部品を同じfeature配下に置く。

最終的な呼び出し関係は次の通りである。

```text
/check router
  ↓
src/views/Check.vue
  ↓
src/features/check/ui/CheckPage.vue
  ↓
src/features/check/model/useCheck.ts
  ├─ CheckInputSnapshot
  ├─ CheckDisplayRequestSnapshot
  ├─ CheckCanonicalPresentation
  └─ CalculationClient
```

`useCheck`はCalculationClientを引数で受け取る。featureはグローバルなclient実装へ固定されず、アプリケーションbootstrapから注入されたclientとテスト用stubを同じ契約で利用できる。runnerとclientはUIへ公開せず、UIには表示に必要なtyped stateとvalidated event handlerだけを渡す。

## 実装範囲

R4はレビューで定めたA〜Dの四つの実装単位で進めた。AではCheck固有のsnapshotとpresentationを `src/features/check/model`へ移動し、旧application pathを退役させた。Bでは `Check.vue`に集まっていた計算・表示再計算state machineを `useCheck.ts`へ抽出した。CではCheckの10個のUI moduleを `src/features/check/ui`へ移動し、複合 `checkData` propを狭いpropsへ分解した。Dでは依存方向と旧pathの不在を構造テストで固定した。closure follow-upでは、表示window不足からの一回限りの再計算と同一windowのloop guardを直接テストし、modelの明示的な`any`を除去して、実ブラウザで対決・表示モード・境界入力・resource rejectionからの復帰を受入確認した。

## ファイル配置

| 旧パス | R4後のパス | 責務 |
| --- | --- | --- |
| `src/application/CheckInputSnapshot.ts` | `src/features/check/model/CheckInputSnapshot.ts` | validated form inputのdetached snapshot |
| `src/application/CheckDisplayRequestSnapshot.js` | `src/features/check/model/CheckDisplayRequestSnapshot.js` | display requestとrange policyのsnapshot |
| `src/application/CheckCanonicalPresentation.js` | `src/features/check/model/CheckCanonicalPresentation.js` | canonical resultからchart・summary向け表示モデルへの変換 |
| `src/views/Check.vue` | `src/views/Check.vue` | `CheckPage`だけを配置する薄いroute adapter |
| `src/components/Check/*` | `src/features/check/ui/*` | Check固有のform、chart、summary UI |
| なし | `src/features/check/model/useCheck.ts` | Checkのstate、計算要求、表示再計算、lifecycle |
| なし | `src/features/check/ui/CheckPage.vue` | CalculationClient注入とfeature UIのcomposition |

旧パスのcompatibility re-exportは追加していない。 `src/features/check/index.ts`は `CheckPage`だけを公開し、model内部のsymbolを外部へ再公開しない。

## 計算と表示の契約

`useCheck`の初期入力は、対決なし、目標値0、actionとreactionがともに1D・critical 10・skill 0・《妖精の手》0・《支配の領域》0である。表示requestの初期値は `0..30`、PMFであり、対決でない場合はreactionを表示しない。この初期計算は `createCheckInputSnapshot`と `createCheckCalculationRequestSnapshot`を通し、移動前と同じcanonical `CalculationClient.calculateCheckCanonical`へ渡す。

入力フォームはlocal draftを所有し、非同期validationが成功した世代だけ `validated` eventを発行する。feature controllerはeventをdetached snapshotへ変換し、difficultyまたはscoreの変更では表示windowを保持したままlatest-wins計算を開始する。actionとreaction以外のsideは無視し、未知のstate keyを生成しない。

表示requestのmodeだけがPMFとupper-tailの間で変わった場合、同じwindowの既存scoreを再利用してpresentationを更新する。windowが変わった場合は `DisplayRangePlanner`を先に実行し、REUSEまたはKNOWN_ZEROなら再計算せず、RECALCULATEなら新しいwindowを含む計画で再計算する。RESOURCE_REJECTEDとNOT_PROJECTABLEは旧結果へfallbackせず、display feedbackへ接続する。同じwindowでの再計算を繰り返さないloop guardも維持している。

`CheckCanonicalPresentation`の `REUSE`、`KNOWN_ZERO`、`RECALCULATE`、`RESOURCE_REJECTED`、`NOT_PROJECTABLE`、exact overflow、upper-bound overflowの意味は移動前と同じである。Chartへ渡す確率の0.1%単位の丸め、actionとreactionの色、Summary formatterも変更していない。

## UIとmodelの境界

`CheckPage`はCalculationClientをinjectし、`useCheck`を呼び出して、InputPanel、ChartPanel、SummaryPanelを配置するだけである。InputPanelは `difficulty`、`scoreParams`、`rangeFeedback`を受け取り、ChartPanelは `difficulty`、`displayRequest`、`presentation`、`displayFeedback`を受け取る。SummaryPanelとSummaryTableは `difficulty`とtyped `scoreSummary`だけを受け取る。

`DfcltyForm`、`ScoreForm`、`SettingForm`のlocal draft、非同期validation、世代確認、validated eventは移動後も維持している。feature UI内に計算状態をまとめた `checkData` propは残していない。Chart.jsの登録・option・annotationやColorSetterの共通化はR4の対象外とし、既存の位置を維持した。

`src/views/Check.vue`にはCheckPageのimportとtemplateだけを置き、計算、presentation、feedback、lifecycle、router以外の依存を持たせていない。 `/check` router entryは変更していない。

## 依存境界と構造テスト

feature modelからviews、components、router、plugins、layouts、feature UIへ逆依存しないことを既存ESLint境界で検査する。feature UIからcalculation primitive、Distribution、FFT、reference repository、published-data schemaを直接importすることはできず、計算はCalculationClient境界を通る。

`tests/checkFeatureArchitecture.test.js`は、薄いroute view、CheckPageからuseCheckへの接続、旧application・components pathの不在、狭いUI props、router entry、modelのUI逆依存禁止、旧import path 0件を検査する。TypeScript modelでは明示的な`any`と`@ts-ignore`系のescape hatchも禁止する。controllerの初期計算、validated input、mode-only reuse、window reuse・再計算、同一windowのloop guard、resource rejection、latest-wins、disposeは `tests/checkFeatureController.test.js`で固定している。

## 実装コミット

| Commit | 内容 |
| --- | --- |
| `224f5fa` | Check modelのsnapshotとpresentationをfeatureへ移動 |
| `6789c1e` | Check controllerとdisplay state machineを `useCheck`へ抽出 |
| `0490dbd` | Check UIをfeatureへ移動し、propsを分離してCheckPageを導入 |
| `09eec97` | Check featureの依存境界と構造テストを追加 |
| `4099862` | 表示window不足の再計算と同一window loop guardをテストし、modelの明示的な`any`を除去 |
| `8bf71ea` | production browser smokeへ対決、表示モード、99D境界、resource rejection復帰を追加 |

## 検証結果

R4のproduction source変更後に、Node、JavaScript、generator、data、build、browser smokeのgateを実行した。既存の比較用assetをproductionで読み込まないこと、Checkの100D入力がcanonical runtimeで完了すること、同一originのHTTPエラーとbrowser diagnosticsがないことを確認した。

| Gate | 実測結果 |
| --- | --- |
| Node | 22.23.2、`check:node` GREEN |
| Vitest | 62 files / 812 tests、GREEN |
| runtime DX verification | 20,000 cases、status passed、full enumeration `34534.1864 ms`、max difference `0.0000010000000000287557`、tolerance `0.000001000001`、max total error `1.5543122344752192e-15`、non-finite 0、negative 0 |
| data | 32 assets verified、GREEN |
| generator | 18 passed / 13 deselected、GREEN |
| simulation | 13 passed / 18 deselected、GREEN |
| Ruff | GREEN |
| typecheck | GREEN |
| ESLint | GREEN |
| Markdown lint | 29 files / 0 issues |
| build | GREEN |
| production browser smoke | GREEN |
| asset requests | Check／Attack／Backtrackのprecomputed request 0、D10 request 0 |
| browser diagnostics | console warning/error 0、pageerror 0、same-origin HTTP error 0、same-origin request failure 0 |
| diff check | `git diff --check` GREEN |

production browser smokeでは、`/check`の初期計算、ダイス数100、対決ON／OFF、PMFとupper-tailの切り替え、`99D/critical=2`の`0..100`、`0..20000`のresource rejection、`0..100`への復帰を確認した。すべてcanvas 1、precomputed request 0、alertなしで、拒否中だけcanvas 0となった。AttackとBacktrackのsmokeも同時に実行し、各routeの計算結果commit、canvas、asset境界、error診断を確認した。smoke終了後に一時preview serverと待受portを解放した。

## 非対象と後続

R4では計算アルゴリズム、入力domain、display policy、resource threshold、CalculationClientの配置、calculation coreの配置、Chart.js共通化、フォームvalidation共通化、Pinia、API、MCP、Cloudflare Workerを変更していない。Attackとのform共通化とvalidation共通化はR5、Chart.js bootstrapと共通chart infrastructureはR6の検討対象とする。

R4の実装、closure follow-up、構造テスト、full gate、production browser smokeはすべてGREENである。P0、P1、P2はいずれも0件であり、実装ツリーの最終コミットは `8bf71ea`、この文書の更新は別のdocs-only commitとして追跡する。R4は `CLOSED / GREEN` と判定する。次はR5として、CheckとAttackに共通化できる入力validation・form contractを、既存feature boundaryと最新要求の契約を壊さない範囲で検討する。
