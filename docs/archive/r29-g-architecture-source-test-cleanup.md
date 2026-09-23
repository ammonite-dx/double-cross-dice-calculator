# R29-G: architecture / source-text test cleanup

## Summary

R29-G replaces tests that pinned production source spelling and layout with tests of observable behavior, static import dependencies, and production browser behavior. Calculation algorithms, UI specifications, resource policies, request lifecycle, and numerical semantics were not changed.

The only production-code edit moved the pure `probabilityFromExplicitMass` helper from `DamageAggregationInspection` to `DamageAggregationCommon`. The executor had reused this helper from the inspection module, contrary to the intended dependency direction. Its formula and error behavior are unchanged; the existing Damage aggregation suite verifies the result.

## Baseline and inventory

Baseline branch: `codex/canonical-default-migration`.

Baseline HEAD: `92acb66c4047a27992f004590d6b7af681406b14`.

Before cleanup, the regular Vitest suite contained 89 files and 1,028 tests. The source-reading inventory included the following categories.

- `corePlanningArchitecture.test.js`, `chartPresentationContract.test.js`, and `attackContract.test.js` searched production modules for names, import spelling, component markup, and retired identifiers.
- Attack, Check, Backtrack, and CalculationClient snapshot tests mixed ownership behavior assertions with checks of Vue source, handler text, event attributes, and internal commit order.
- `attackCompoundInputs.test.js`, `displaySettingDensity.test.js`, and `mainAreaLayout.test.js` pinned UI source or CSS details instead of browser-observable accessibility, style, and layout.
- `productionBrowserSmokeContract.test.js` searched the smoke script itself for strings rather than executing the smoke.
- `attackPlaywrightRunnerContract.test.js`, `attackWorkerBenchmarkContract.test.js`, and `fullTailAttackBrowserBenchmark.test.js` searched benchmark script internals for implementation identifiers and expressions.
- `runtimeValidationResponsibilities.test.js` prohibited particular reflection calls by source text and duplicated nested-freeze behavior already tested by the owning range-policy tests.
- `productionTypeScriptContract.test.js` and `releaseVerificationContract.test.js` read repository source/configuration as boundary contracts and were intentionally retained.
- `tests/experiments/` contains explicitly isolated historical source-contract tests, including R19, R20, R22, and R23 experiment checks. They remain outside the regular Vitest suite and were not part of this production-focused cleanup.
- `tests/reference/` reads registered historical JSON assets for schema, integrity, and numerical comparisons. These asset tests are intentionally retained.

## Changes

`calculationDependencyGraph.test.js` uses the TypeScript parser to extract only static import specifiers from TypeScript and Vue script blocks. It covers planning-to-execution direction, producer independence from `RangePlanner`, Damage aggregation ownership, the generic `DistributionResult` boundary, and shared line-chart ownership. `corePlanningArchitecture.test.js` and the old chart source-text contract were removed. Existing ESLint rules remain the authority for boundaries they already enforce; the new test does not duplicate those rules.

Attack, Check, and Backtrack snapshot tests now focus on normalization, detached snapshots, and nested ownership. CalculationClient tests retain their public API, plan, and calculation behavior assertions. Internal function names, template event spelling, validation-generation technique, and source-order comparisons are no longer pinned. The redundant reflection-source test and source-only Attack integration contract were removed.

The production browser smoke now checks compound-input accessibility for Backtrack's `その他減少量` group and verifies that the Check, Attack, and Backtrack footer follows page content in normal document flow. Existing smoke cases continue to cover chart accessible names, computed display-form styles, stale Check recovery, range rejection, latest-wins, and browser diagnostics. Source-level tests for compound inputs, density, layout, and smoke-script contents were removed.

The Attack benchmark runner contract now invokes `playwright-runner.mjs --help` and an invalid target in subprocesses, checking CLI output and exit status. Benchmark fixtures, planner results, resource policy, and `package.json` command contracts remain tested. Assertions against benchmark implementation text, worker global names, internal report fields, and runner routing identifiers were removed.

Regular Vitest count after cleanup: 82 files and 981 tests, a net reduction of 7 files and 47 tests. Eight test files were deleted, and 52 source-oriented cases were removed across deleted or reduced files. Five dependency-graph tests replaced the calculation/chart architecture source-text cases; observable UI requirements were moved to browser smoke assertions.

## Remaining source reads

`productionTypeScriptContract.test.js` reads `src/` and `tsconfig.json` only to enforce the repository's TypeScript boundary: no production JavaScript, TypeScript Vue scripts, and no `allowJs`. `releaseVerificationContract.test.js` reads package scripts, CI workflows, and contributor-facing documentation because those files define release configuration. Benchmark tests read `package.json` only where command wiring is the contract. `tests/helpers/staticImports.js` reads module text but returns only parser-derived import specifiers; callers cannot inspect or assert against the source body.

Historical source-text tests remain under `tests/experiments/` as explicitly invoked experiment history, not as regular production architecture tests. Reference tests continue to read only registered reference assets. Neither suite is silently represented as part of `npm test`.

## Validation

- Focused calculation dependency graph and Damage aggregation tests: 2 files, 27 tests passed.
- Focused Attack, Check, Backtrack, and CalculationClient tests: 6 files, 60 tests passed.
- Focused TypeScript and release configuration contracts: 2 files, 8 tests passed.
- Focused benchmark tests: 4 files, 17 tests passed.
- Regular Vitest suite: 82 files, 981 tests passed.
- Historical experiment suite: 11 files, 65 tests passed.
- `npm run verify:browser`: passed, including the new Backtrack compound-group and footer-flow assertions.
- `npm run lint` and `git diff --check`: passed.
- `npm run verify:all`: passed. This includes typecheck, ESLint, Markdown lint (104 files, 0 issues), production build (485 modules), production browser smoke, verification of 32 reference assets, 7 reference test files / 53 tests, 18 generator tests, 13 simulation tests, Ruff, and the 20,000-case runtime DX comparison.

## Commits

- `fb9128c` — replace calculation source checks with dependency graph.
- `f19e429` — remove feature implementation source assertions.
- `8999162` — move UI contracts to browser behavior.
- `20c1854` — simplify benchmark harness contracts.
- `d1b00bf` — docs: close R29-G architecture test cleanup.

R29-G is complete. The next task is R29-H; no R29-H implementation is included here.
