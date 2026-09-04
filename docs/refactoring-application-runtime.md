# R9 Application／Runtime／Presentation責務分離

この文書は、`src/application`に混在していたfeature固有modelと共通runtime、および`src/presentation`に置かれていた汎用表示変換を整理した記録である。変更はbehavior-neutralとし、canonical result、表示契約、計算意味論、公開asset、Python generator、既存UIの見た目を変更しない。

## 開始点と実装コミット

R9は`codex/canonical-default-migration`の`241abae0188b503bca86600694720e59af65142f`（`docs: finalize R8 closure evidence`）から開始した。構造移動と依存更新は`f943a9c`（`refactor: separate feature runtime and shared presentation layers`）で実装し、境界テストとESLint強化は`fb58137`（`test: enforce runtime and presentation boundaries`）で追加した。

## 最終ディレクトリ

Attack固有のsnapshot、state、runner、presentation、feedbackは`src/features/attack/model/`に置く。CheckとBacktrackのfeature modelは従来どおり各feature配下に置き、共通処理をfeatureへ逆流させない。

CalculationClient、CalculationFeedback、CalculationRequestCoordinator、CanonicalAttackBatchInput、ResourceGuard、RuntimeDamageRollのclient／protocol／workerは`src/runtime/`に置く。`CanonicalAttackBatchInput`はAttackという名前を含むが、CalculationClientのbatch request boundaryを所有するためruntimeに残す。

`createCheckRangePolicy`とpolicy専用のclone、freeze、safe-integer検証は`src/runtime/CheckRangePolicy.js`を正本とする。Checkのdisplay request snapshotはruntimeのpolicyを利用し、`invalid-check-range-policy`のerror codeを共有する。計算上限、表示既定値、`maxPoints`、循環入力のclone／freeze、TypeErrorの形は変更していない。

`src/shared/presentation/`にはfeature非依存のDistributionPresenter、DisplayRangePlanner、CanonicalChartSeriesAdapter、CanonicalSummaryFormatter、ChartPercentagesを置く。唯一のcore依存は`calculation/DistributionResult`のread-only validationであり、他のcalculation、domain、core、runtime、feature、UI、reference toolingには依存しない。

移動完了後、`src/application/`と`src/presentation/`はディレクトリ自体を削除した。旧pathからのcompatibility re-exportや別名shimは作成していない。

## 依存方向

```text
app / feature UI
       ↓
features
       ↓
runtime ─────→ calculation / domain / core
       ↓
shared
```

runtimeはfeatureやVue、Vuetify、Chart.js、Node、DOM、`fetch`を参照しない。shared presentationもframework-independentなpure transformに限定する。Vueの`InjectionKey`はruntime型から除去し、`CALCULATION_CLIENT_KEY`は`CalculationClient.js`が公開するsymbolとした。Vueのprovide／injectの実行時挙動は維持する。

## 検証

`tests/runtimePresentationArchitecture.test.js`は新しいruntime／shared presentationの配置、旧ディレクトリの不在、runtimeのfeature／framework依存禁止、CalculationClientTypesのVue依存除去、shared presentationのcore例外を検査する。`tests/dataResponsibilitiesArchitecture.test.js`とAttack／Check／Backtrackの既存architecture testも新pathへ同期した。

R9の実装後に`npm test -- --run`を実行し、72 files／869 testsが成功した。`npm run lint -- --no-warn-ignored`、`npm run typecheck`、`npm run build`、`git diff --check`も成功した。表示のブラウザ受入、public asset、generatorの挙動は変更対象外であり、既存のR8 gate記録を引き続き参照する。

## 保持したもの

CalculationClientの公開メソッド、runtime damage Workerの相対URL、canonical envelopeとsummary、legacy／published-bucket adapter、表示ラベルと丸め、public schema-v2／revision-1、generatorの入出力は変更していない。R9は責務境界を明確にする構造変更であり、Cloudflare Workers、HTTP API、MCPの導入や静的SPAの構成変更は行わない。
