# R29-F: Production TypeScript Convergence

## Goal

R29-F makes TypeScript the only implementation language under production `src/` while preserving JavaScript for tests, scripts, experiments, and configuration where it remains appropriate. It does not migrate those supporting environments or begin R29-G.

## Changes

- Converted the remaining production JavaScript entry points and runtime Worker to TypeScript. The production source tree contains no `.js` files, and every Vue SFC script block declares `lang="ts"`.
- Kept `strict` type checking, removed JavaScript inclusion from `tsconfig.json`, and excluded JavaScript tests from the typecheck input. Vitest continues to execute the JavaScript tests normally; TypeScript contract fixtures remain typechecked.
- Added a contract test that prevents production JavaScript files or untyped Vue script blocks from returning unnoticed.
- Typed feature UI props, emits, form references, and chart boundaries. Shared chart DTOs live in `src/types/ChartJsDataTypes.ts`; the webfontloader package boundary has a narrow ambient declaration.
- Typed the DR Worker with a local scope interface instead of adding the Worker global library to the main-thread TypeScript configuration. The Worker message validation and transfer protocol remain in place.
- Moved calculation runtime/provider contracts to `src/calculation/CalculationRuntimeTypes.ts`, so the calculation core owns the types it consumes rather than importing them from the runtime layer.
- Updated tests, scripts, and experiments to reference the renamed `.ts` production modules without converting those supporting files from JavaScript.

The calculation formulas, input validation, latest-wins lifecycle, Abort behavior, resource policy, and probability result semantics were not changed. Type checking also exposed that the range-feedback formatter does not provide a calculation-time estimate; the notice now displays only the memory estimate it actually receives, avoiding an empty time label.

## Verification

`npm run verify:all` passed on implementation commit `2733169` (`refactor: complete production TypeScript convergence`). The gate reported:

- Vitest: 89 files / 1,028 tests passed.
- `vue-tsc --noEmit`, ESLint, Markdown lint, production build, and `git diff --check`: passed.
- Production build: 485 modules; Chromium production smoke passed for Check, Attack, and Backtrack, with zero precomputed-data requests and zero console or same-origin HTTP errors.
- Reference asset verification: 32 assets; reference tests: 7 files / 53 tests passed.
- Generator tests: 18 passed; simulation tests: 13 passed; Ruff: passed.
- Runtime DX verification: 20,000 cases passed; maximum absolute difference was `9e-7` against tolerance `0.000001000001`, with no non-finite or negative probabilities.

The Markdown and diff checks are repeated after this closure record is added. No dependency or generator changes were required.

## Follow-up

R29-G (architecture/source-text test cleanup) remains the next task. It was not started as part of R29-F.
