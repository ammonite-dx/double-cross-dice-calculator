# R30-prep: post-TypeScript boundary cleanup

## 目的と開始点

2件の独立監査で重複して確認されたTypeScript移行後の型境界負債を整理した。開始HEADは`a8fba60b9b16bd6bf2d10516e2b4bc0b82f6a722`で、実装開始時のworking treeはcleanだった。

実装コミット:

- `e1c3127a828faca1258c81a8d28e6534fe06f447` — `refactor: tighten calculation planning boundaries`
- `63fb4162dbb0dd88d3580473951c0f456a926ecf` — `fix: preserve DataView snapshot bounds`

## 背景

監査では、RangePlannerの入力と戻り値の型対応が実装で保証されていないこと、production TypeScriptに未使用宣言のlint gateがないこと、CalculationClientのruntime option境界が開きすぎていることが確認された。追加で、JavaScript integration testに古い余剰`calculateScore`引数が残り、generic request snapshotでDataViewのview boundsが失われる問題も見つかった。

## 実施内容

### RangePlanner

`RangePlannerParams`をoperation-discriminated unionにし、operationを必須化した。Score、Check、Attack、Backtrackの必要payloadを対応づけ、operation-specific overloadが対応するplan型を返す。implicit Attack default、planner内の`as unknown as CalculationRangePlan`、CalculationClient planner/preflightのunchecked subtype castを削除し、`tests/typecheck/range-planner-contracts.ts`を追加した。

### Runtime option boundary

`CalculationRuntimeOptions`のindex signatureを削除し、`getRuntimeOptions()`は`signal`、`requestId`、`requestMetadata`だけを新しいobjectへ投影する。Attackの`scoreDisplayRequest`、`rangePolicy`、`onRangePlan`がon-demand damage calculationへ漏れないbehavior testと、runtime optionのcompile-time contractを追加した。

### Static analysisとtest API

production `src/**/*.ts`へ`@typescript-eslint/no-unused-vars`を有効化し、既知のdead declaration/importを削除した。type-aware lint全面導入は行っていない。JS/MJSは誤った再導入を防ぐarchitecture lintのdefense-in-depthとしてglobに残す。`tests/calculationClientIntegration.test.js`から旧`calculateScore(..., fix)`の余剰引数を削除し、全testのTypeScript化は行わず、重要なplanner/runtime型契約のみを型付きfixtureに追加した。

### DataView

snapshot時にbacking bufferを独立コピーしたうえで、元の`byteOffset`と`byteLength`を保持する。回帰テストではoffset付きDataViewの可視bytesと、元buffer変更後もsnapshotが独立していることを確認する。

## 対象外として残した監査項目

以下は今回のscope外として次の作業単位で再評価する。問題がないと結論したものではない。

- Chart.js DTO/native type boundaryと`ProbabilityLineChart.vue`のdouble cast
- AttackRunner generic presentation contractとlifecycle responsibility split
- trusted typed internal valueのreflection cleanup
- Check/Attack range-policy normalization sharing
- production-facing JS testsの選択的TypeScript化拡大
- CalculationClient dependency injection surface
- `copyTotalDamageEnvelope` generic narrowing
- `*Types.ts` colocation review
- retired-path ESLint tombstone review
- canonical / legacy test naming cleanup

## R29-Iとの関係

R29-Iの`CLOSED / GREEN`判定は維持する。R29-Iは当時定義したarchitecture convergence scopeを完了しており、本作業はその後の独立監査で見つかったpost-TypeScript type-boundary cleanupである。R29を再openしたものではない。

## 最終検証

`npm run lint:markdown`は108ファイルを検査し、0 issuesで成功した。続けて`npm run verify:all`が全工程成功した。

- Vitest: 84 files / 994 tests passed。
- TypeScript typecheck、ESLint、production build（486 modules）、`git diff --check`: 成功。
- Markdown lint: 108 files / 0 issues。
- Production browser smoke: 成功。Check、Attack、Backtrack、表示範囲拒否・回復、mobile表示を確認し、precomputed request、console warning/error、same-origin HTTP errorはいずれも0件。
- Generator asset verification: 32 assets verified。
- Reference tests: 7 files / 54 tests passed。
- Generator tests: 18 passed、simulation tests 13 passed、Ruff: 成功。
- Runtime DX: 20,000 cases passed。最大絶対差は`8.999999999999999e-7`、最大合計誤差は`1.4432899320127035e-15`、non-finiteと負値はいずれも0件。

最終検証はproduction code・test・configurationを変更せずに完了した。
