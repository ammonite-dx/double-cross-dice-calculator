# R6 Shared Probability Chart Infrastructure

この文書は、CheckとAttackに重複していたProbability Line chart基盤をshared layerへ集約したR6の実装記録である。表示内容、確率、canonical calculation、state ownership、BacktrackのDoughnut chartは変更していない。R6開始HEADは `f4816c3`（R5 closure follow-up）、比較対象のbehavior baselineは `2770c2c87000c7d878a5e1bd81698c4781d0bbce`である。

## 目的と対象

R6では、Check Score、Attack Score、Attack Damageの3つのLine chartに重複していたChart.js登録、vue-chartjsのLine wrapper、Vuetify breakpointによるstyle、options生成を共有した。Checkの難易度annotationはCheck固有の意味論であるため、CheckのChartSetterに残し、shared側には汎用annotation objectだけを渡す設計とした。

Backtrackの `FinalEncroachmentChart.vue` と `ChartSetter.js` はDoughnut chart、ArcElement、専用optionsを持つ別種類の可視化なので、R6の対象外として変更していない。

## Shared chart modules

`src/shared/chart`にはbarrelを作らず、consumerが必要なmoduleを直接importする。shared chartはapplication、calculation、data、domain、feature、UI、presentation、router、plugin、layout、Node組み込みmoduleへ依存しない。Chart.js、vue-chartjs、Vuetifyの利用はLine rendererの責務として許可している。

| Module | 責務 |
| --- | --- |
| `ProbabilityLineChart.vue` | `Chart.register`、vue-chartjs `Line`、`useDisplay`、responsive height、Lineのrender。`data`がnullならLineを表示しない |
| `ProbabilityLineChartConfig.js` | 汎用axis、tooltip、datalabels、optional annotationを生成するpure helperとresponsive style |

`ProbabilityLineChart.vue`は既存と同じくwrapperの`div`内でLineを表示し、`mdAndUp`では`400px`、それ未満では`300px`、positionは`relative`とした。新しいCSS classやlayoutは導入していない。datalabel pluginの登録も追加していない。

## 共通optionsとfeature責務

`createProbabilityLineChartOptions`は、`xAxisTitle`、`tooltipTitlePrefix`、optionalな`annotations`だけを受け取る。responsive、maintainAspectRatio、x/y axis、tooltip mode、tooltip callbacks、datalabelsの共通形状を一箇所で生成する。annotation objectが渡されないAttackではannotation plugin option自体を生成せず、Checkは対決時に空のannotation object、通常判定時に従来の`line1`を渡す。

Checkの`line1`は、難易度target、`getChartColor(1)`、border width、label content「難易度: target」、rotationなどを従来どおり維持する。Attackに難易度annotationを追加していない。Scoreのx軸は「達成値」、Damageのx軸は「ダメージ」であり、tooltipのprefixもそれぞれ維持している。

## Consumer migration

Checkの `src/features/check/ui/ScoreChart.vue`、Attackの `ScoreChart.vue` と `DamageChart.vue` はshared `ProbabilityLineChart`へ`data`と`options`を渡すだけにした。3 consumerからChart.js、vue-chartjs、chartjs-plugin-annotation、useDisplay、`Chart.register`を削除した。

Checkの`difficulty`／`presentation` props、ready時だけchart dataを渡す条件、Check ChartSetterの`getCheckChartOptions`は維持している。Attackの`attackData`、`displayRequest`、`presentation` props、canonical Score/Damage data adapter、ChartSetterのoptions APIも維持している。Attack featureization、props/events整理、ColorSetterの移動はR6で行っていない。

## 0.1%表示丸めの共有

Attack専用だった `src/components/Attack/ChartPercentages.js` を `src/presentation/ChartPercentages.js` へ移し、`src/presentation/index.js`からも公開した。`toChartPercentage`の式は `Math.round(probability * 1000) / 10` のままで、Chart.jsへ渡す確率表示を0.1 percentage point精度へ丸める契約を変えていない。

Checkは`Float64Array`とseries metadataを保持したまま、`toPercentageSeries`内部で丸めprimitiveだけを再利用する。Attackは`Array.from`によるowned ordinary Array、入力非mutation、combo／合計datasetのlabelとcolorを維持する。旧helperのテストは共有presentation helperを検証する形へ更新した。

## Architecture gateと回帰テスト

`tests/sharedChartArchitecture.test.js`は、shared chartのdirect-import moduleとbarrel不在、shared chartからアプリケーション層・計算層・data／domain／feature／UI層・`node:*`への依存禁止、feature-specific semanticsの混入禁止を検査する。さらに、3 consumerがshared runtimeを利用し、Chart.js登録や直接依存を持たないこと、BacktrackのDoughnut chartが独立していることを固定している。ESLintにも同じshared chart内部依存境界を追加した。

`tests/probabilityLineChartConfig.test.js`はCheckの対決／通常annotation、Attack Score／Damage options、tooltip title／label、responsive style、0.1%丸めを固定する。既存のCheck／Attack canonical presentation、display adapter、production dependency、feature architectureテストも継続している。

## 実装コミット

| Commit | 内容 |
| --- | --- |
| `66a3966` | 現行Probability Line chartのoptions、annotation、tooltip、style、丸めのgolden testを追加 |
| `0620132` | shared Line renderer／configを追加し、Check／Attackの3 consumerを移行 |
| `811c9c4` | 0.1% chart percentage formatterを`src/presentation`へ共有化し旧Attack helperを削除 |

## Targeted regression

R6実装後、typecheck、ESLint、対象10ファイル・73テスト、build、`git diff --check`を実行し、すべて成功した。対象にはshared chart config／architecture、Check presentation／feature architecture、Attack Score／Damage adapter、production dependency、既存canonical contractを含めた。

## 最終検証

R6最終implementation tree（`811c9c4`）でレビュー指定のfull project gateを再実行した。過去の記録値を流用せず、今回の実測値を記録している。

| Gate | 実測結果 |
| --- | --- |
| Node | 22.23.2、`check:node` GREEN |
| data | `data:check`／`data:verify-generator` 各32 assets、GREEN |
| Vitest | 67 files / 835 tests、GREEN |
| generator | 18 passed / 13 deselected、GREEN |
| simulation | 13 passed / 18 deselected、GREEN |
| Ruff | GREEN |
| typecheck | GREEN |
| runtime DX verification | 20,000 cases、status passed、full enumeration `29946.5819 ms`、max difference `0.0000010000000000287557`、tolerance `0.000001000001`、max total error `1.5543122344752192e-15`、non-finite 0、negative 0 |
| ESLint | GREEN |
| Markdown lint | 30 files / 0 issues |
| build | GREEN |
| production browser smoke | GREEN |
| asset requests | schema-v2/revision-1 precomputed request 0、D10 request 0 |
| browser diagnostics | console warning/error 0、pageerror 0、same-origin HTTP error 0、same-origin request failure 0 |
| diff check | `git diff --check` GREEN |

Production browser smokeでは、Checkの初期表示、対決ON／OFF、PMF／upper-tail、`99D/critical=2`、resource rejection／recovery、AttackのScore／Damageと100D境界、Backtrackの既存Doughnutと100D境界を確認した。Checkはcanvas 1、Attackはcanvas 2、Backtrackはcanvas 3を維持し、precomputed requestとD10 requestは0、browser diagnosticsも0だった。

## 非対象と後続

R6ではBacktrack chart、Attack featureization、Check controller、CalculationClient、RangePlanner、ResourceGuard、計算core、canonical result semantics、display range、ColorSetter、public asset、generator、Pinia、API、MCPを変更していない。Chart.jsの全chart typeを一括登録する設計にも変更していない。

R6の実装、targeted regression、full project gate、production browser acceptanceはすべてGREENである。R6は `CLOSED / GREEN` と判定し、次の作業候補はR7 Attack featureizationとする。
