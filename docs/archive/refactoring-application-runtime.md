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

## R9 Final Closure Follow-up（2026-09-04）

R9の構造移動後に残っていたarchitecture gateの穴を、`31b927148aafd3327f6f131545938e81a78c89e2`（`test: close R9 architecture enforcement gaps`）で塞いだ。`src/shared/presentation/**`から`../chart/**`、`../theme/**`、`../validation/**`および複数段の相対sibling importをESLintと構造テストで禁止し、同一presentation subsystem内のlocal importは許可した。廃止済みの`src/application/**`と`src/presentation/**`は全production pathとUI overrideの両方で再導入を禁止し、lintText regressionでglobal ruleと後段UI ruleの双方を検証している。source auditでは旧directory、runtimeからfeature／frameworkへの逆依存、shared presentationのsibling依存、productionの旧path importをすべて0件で確認した。

同じ実装コミット上でfresh gateを実行した。`npm run check:node`はNode.js 22.23.2、`npm run data:check`は32 assets、`npm test`は72 files／869 tests、`npm run generator:test`は18 passed／13 deselected、`npm run generator:test:simulation`は13 passed／18 deselected、`npm run generator:lint`はRuff 0 issues、`npm run typecheck`は成功、`npm run verify:runtime-dx`は20,000 cases・max absolute difference 0.0000010000000000287557・max total error 1.5543122344752192e-15・non-finite 0・negative 0、`npm run lint`は成功、`npm run lint:markdown`は34 files／0 issues、`npm run build`は408 modules transformedで成功した。

`npm run smoke:production`も成功し、Check（100D、対決、PMF／upper-tail、表示範囲拒否と復帰）、Attack（action／reaction、防御ダイス、100D、表示範囲拒否と復帰）、Backtrack（100D、Eロイス／追加ダイス）を確認した。production smoke中のschema-v2 precomputed requestは0、D10 requestは0、console warning／error、pageerror、same-origin HTTP error、requestfailedは0だった。`git diff --check`も成功している。public、generator、reference toolingの差分はR9開始点から0件である。

このfollow-upでR9の判定を`P0: 0`、`P1: 0`、`P2: 0`、`CLOSED / GREEN`へ更新する。最終docs closureは本節を含むdocsコミットであり、後続のproduction実装には着手しない。

## Final verification closure（2026-09-04）

R9の最終実装SHAは`31b927148aafd3327f6f131545938e81a78c89e2`であり、今回のverification follow-up開始点は`2d96dba3b9f498cd3cc7e9ed5af9e436c5291cfb`（`docs: finalize R9 acceptance evidence`）である。現HEADで`npm run check:node`を実行し、Node.js 22.23.2が確認された。続けて`npm run data:verify-generator`を単独実行し、`Verified 32 assets in 24.79s.`となった。前節のfull implementation gateおよびproduction browser smokeは`31b9271`上で完了済みであり、今回のfollow-upではproduction source、test、ESLint、public asset、generator、reference toolingを変更していない。

この文書を含むdocs closure commitの後、最終HEADで`npm run lint`、`npm run lint:markdown`、`git diff --check`、`git status --short`を再実行した。実測結果は、`npm run lint`: GREEN、`npm run lint:markdown`: GREEN（34 files／0 issues）、`git diff --check`: GREEN、`git status --short`: cleanである。R9開始点`241abae0188b503bca86600694720e59af65142f`からの`public`、`generator`、`tooling/reference-data`差分は0件であり、P0／P1／P2は0件、R9は`CLOSED / GREEN`を維持する。

## 保持したもの

CalculationClientの公開メソッド、runtime damage Workerの相対URL、canonical envelopeとsummary、legacy／published-bucket adapter、表示ラベルと丸め、public schema-v2／revision-1、generatorの入出力は変更していない。R9は責務境界を明確にする構造変更であり、Cloudflare Workers、HTTP API、MCPの導入や静的SPAの構成変更は行わない。
