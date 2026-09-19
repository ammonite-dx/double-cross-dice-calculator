# R27-B1: Typed CalculationClient injection / feature controller contracts

## 目的

R27-Aでfeature stateの意味論を確定したため、次にVue固有の依存性注入とfeature controllerの公開境界を型で固定した。runtimeはVue非依存のまま維持し、CalculationClientの実装全体を一度にTypeScriptへ移行することは避けた。

## 変更点

- `CALCULATION_CLIENT_KEY`を`src/runtime/CalculationClient.js`から削除し、Vueの`InjectionKey<CalculationClient>`、`provideCalculationClient()`、`useCalculationClient()`を`src/plugins/calculationClient.ts`へ移した。providerがない場合は従来どおりproduction default clientへfallbackする。
- `src/main.js`と`src/plugins/index.js`をTypeScriptへ移行し、bootstrapはtyped provider helperだけを呼び出す構成にした。`index.html`のentryも`main.ts`へ更新した。
- Check・Attack・BacktrackのPageを`script setup lang="ts"`へ移行し、runtime singleton、DI key、Vue `inject()`の詳細を直接扱わず、composition adapterからclientを取得するようにした。
- `CheckController`、`AttackController`、`BacktrackController`をfeature model内の専用型として定義し、`useCheck()`、`useAttack()`、`useBacktrack()`の戻り値へ明示的に適用した。Attackの公開combo projectionにはinternal `data`、calculation record、generationを含めていない。
- provider/client、controller handlerのside、Attack comboの内部状態遮蔽、Backtrack input shapeを`tests/typecheck/feature-boundary-contracts.ts`でcompile-timeに検証する。feature root indexのpage-only surfaceは変更していない。

## 設計上の境界

```text
Vue bootstrap / Page
    ↓
src/plugins/calculationClient.ts
    ↓  CalculationClient type and default implementation
src/runtime/CalculationClient.js
```

runtimeからVue、Vuetify、router、feature UI、pluginsを参照する依存方向は許可しない。`checkJs:false`も維持し、runtimeの実装型付けは次のR27-B2で段階的に扱う。

## 非対象

計算結果、range planner、ResourceGuard、Worker protocol、latest-wins、CalculationFeedbackの動作、AttackRunner lifecycle、advanced settings semantics、chart/UIデザイン、全JSのTypeScript化、`checkJs:true`化は変更していない。

## 検証

- `npm run verify:all`、`npm run verify:browser`、`npm run benchmark:full-tail-attack`を実行し、全て成功した。
- Vitestは104 files / 1096 tests、typecheck、ESLint、Markdown lint（85 files / 0 issues）、production build（458 modules）が成功した。
- production browser smokeはCheck・Attack・Backtrackの全経路で成功し、precomputed requests 0件、AttackのD10 requests 0件、browser diagnostics 0件を確認した。
- reference verificationは32 assets、reference Vitest 7 files / 53 tests、generator 18 tests、simulation 13 tests、Ruff、runtime DX 20,000 casesが成功した。runtime DXの比較許容誤差は`0.000001000001`、最大絶対差は`8.999999999999999e-7`、最大総和誤差は`1.4432899320127035e-15`、非有限値と負値は0件だった。
- full-tail Attack benchmarkは全ケース成功し、result digestは`989000341.161962`、errorは全件`-`だった。
- 最終コミット後の作業ツリーはcleanである。

## 次の作業

R27-B2では、今回のtyped boundaryを利用してruntime実装を段階的にTypeScriptへ移行する。まずCalculationFeedbackとrequest coordinatorの型境界を検討し、CalculationClientの全面変換や計算ロジック変更を混ぜない。
