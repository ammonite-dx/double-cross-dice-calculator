# R28-B1: ESLint and architecture enforcement cleanup

## 目的

R28-B1では、production sourceの実行環境をESLint上で明示し、Vitestのarchitecture enforcementを意味論を検査するテストへ整理した。R28はreview gateごとに停止する方針であり、今回はGate 2のB1だけを実施した。

## 実装

- generic JavaScript／Vue設定からbrowserとNodeの包括的なglobals設定を削除し、Vue固有のruleだけを残した。
- `src/**/*.{js,mjs,ts,vue}`にはbrowser globalsを設定し、`src/runtime/RuntimeDamageRollWorker.js`にはWorker globalsだけを設定した。production sourceへNode globalsを導入していない。
- tests、scripts、tooling、experiments、root configにはNode globalsを設定した。historical experimentにはbrowser APIを使うものもあるため、これらの非production領域ではbrowser globalsも併用した。
- generated outputの`dist-dynamic-distribution-ranges/`をESLint対象外へ追加した。生成物はproduction sourceの環境境界を検査する対象ではない。
- `tests/dataResponsibilitiesArchitecture.test.js`、`tests/runtimePresentationArchitecture.test.js`、feature別architecture tests、`tests/namingArchitecture.test.js`、`tests/sharedChartArchitecture.test.js`、`tests/sharedValidationArchitecture.test.js`を削除した。これらはsource path、import文字列、retired name、ESLint fixtureの重複検査が中心だった。
- planner／executor、algorithm ownership、Workerとrequest lifecycle、state semantics、production/reference separation、numerical oracleを検査するsemantic／contract testsは維持した。`tests/corePlanningArchitecture.test.js`も維持した。
- Chart.jsの共有runtime ownership、feature chartの利用、accessible name、Backtrack Doughnutの独立性は`tests/chartPresentationContract.test.js`へ移した。共有validationの実行時規則は既存の`tests/sharedValidationRules.test.js`を正本とした。
- `canonical-*`のdiscriminantやproductionの計算・結果契約・runtime挙動は変更していない。

## 検証

- `npm test`: Vitest 97 files／1073 testsが成功した。
- `npm run typecheck`: 成功した。
- `npm run lint`: 成功した。production sourceへのNode globals誤導入をESLintで検出する設定になっている。
- `npm run lint:markdown`: 90 files／0 issuesだった。
- `npm run build`: 459 modulesで成功した。
- `git diff --check`: 成功した。

## 非対象と次の作業

R28-B1ではhistorical experimentのtest isolationやnpm commandの整理、reference／generator suiteの変更、runtime計算の変更は行っていない。次はR28-B2として、historical experiment test isolation／command cleanupをreview後に実施する。
