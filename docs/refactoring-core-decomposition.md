# R12 — 計算コアの責務分離

R12では、計算結果や資源制限の意味を変えずに、DX tail、操作別の範囲計画、資源見積りの責務を分離した。目的は、数値モデルと計画ロジックを個別に検証できる構造にし、将来の入力範囲拡張や計算コアの再利用を安全にすることである。

## 1. 基準点と実装単位

対象branchは`codex/canonical-default-migration`である。R12開始時点のHEADは`2267027e1df386e6509cac90821d64ab16d7d6b1`で、作業開始時のworking treeはcleanだった。

実装は次の二つのcommitに分けた。

| Commit | 内容 |
| --- | --- |
| `51c7ae5` | 共通DX tail modelの抽出と直接テストの追加 |
| `dab6bd4` | 操作別range planner、共有planning math、policy、resource planの分離と境界テストの追加 |

R12では、数値仕様、tail error budget、resource threshold、公開結果schema、Worker protocol、UI、公開asset、generatorを変更しないことを原則とした。

## 2. Before / After

| 責務 | Before | After |
| --- | --- | --- |
| DX一個・最大値のtail | `DxCalculator`と`RangePlanner`に重複 | `DxTailModel.js`に集約 |
| Yousei tailと負の二項分布 | DX calculatorとplannerに分散 | `DxTailModel.js`が共有 |
| Score range | `RangePlanner.js`内の`planScore` | `planning/ScoreRangePlanner.js` |
| Damage range | `RangePlanner.js`内の攻撃・防御・FFT計画 | `planning/DamageRangePlanner.js` |
| Backtrack range | `RangePlanner.js`内のsupport・asset判定 | `planning/BacktrackRangePlanner.js` |
| safe arithmetic・FFT見積り | `RangePlanner.js`内の補助関数 | `planning/PlanningMath.js` |
| policy・display正規化 | `RangePlanner.js`内の既定値・検証 | `planning/RangePolicy.js` |
| 資源見積り・warning／reject | `RangePlanner.js`内の集約処理 | `planning/ResourcePlan.js` |
| 公開入口 | 巨大な実装ファイル | `RangePlanner.js`の薄いorchestration facade |

`RangePlanner.js`は公開入口として維持し、operationの振り分け、各plannerの結果の合成、overflow情報の作成だけを担当する。既存の`planCalculationRanges`と`DEFAULT_POLICY`は同じmoduleから利用でき、既存の計画結果shapeも維持する。`nextPowerOfTwo`は既存consumerのため互換exportを残したが、新しい計画コードとテストは`PlanningMath.js`を直接参照する。

## 3. 依存方向

```text
DxCalculator ───────┐
ScoreCalculator ────┼──> DxTailModel
                    │
ScoreRangePlanner ──┘

ScoreRangePlanner ───────> DxCalculator primitives, DxTailModel, PlanningMath, RangePolicy
DamageRangePlanner ─────> D10/DR limits, PlanningMath
BacktrackRangePlanner ─> Backtrack rules/limits, PlanningMath
ResourcePlan ───────────> D10/DR limits, PlanningMath

RangePlanner facade ────> operation planners, ResourcePlan, RangePolicy, PlanningMath
```

ScoreとDXの計算coreは`RangePlanner`を参照しない。操作別plannerはfacadeを参照せず、`ResourcePlan`も個別plannerへ逆方向に依存しない。この境界は`tests/corePlanningArchitecture.test.js`でsource importと重複tail関数の不在を検査する。

## 4. DX tail model

`DxTailModel.js`は、10面ダイス一個の累積確率・strict tail、独立な最大値のtail、最大値のfirst-moment上界、`shihai=0`の《妖精の手》tail、負の二項分布のPMF、score tail cutoffを提供する。計算は配列を確保せず、臨界値ごとの幾何級数と安定な`log1p`／`expm1`を使う。これにより通常DX、Yousei、plannerのtail証明が同じ式を共有する。

critical=11、dice=0、負の値、10刻みの境界、非常に小さいtailでは、R12以前の境界と数値安定性を維持した。`DxCalculator`は分布生成に必要な低水準helperを利用し、`ScoreCalculator`と`RangePlanner`はcertificate APIを利用する。

## 5. 計画と資源判定

`ScoreRangePlanner`は、表示windowとtail cutoffを比較してworking rangeを決め、Yousei block／FFT長、配列数、tail certificateを返す。`DamageRangePlanner`は攻撃・防御の固定差分、有限DR support、防御D10のsupport、DR FFTと防御畳み込みFFTを計画する。`BacktrackRangePlanner`は三種類のバックトラックsupport、static asset coverage、完全supportのon-demand計算モードを計画する。

`ResourcePlan`は、これらの計画から操作別の時間・演算量・Float64使用量を集約し、既存のwarning／hard reject、feature非互換入力、tail cutoff未達、asset coverage警告を判定する。閾値、コスト係数、拒否コード、warningの文言は変更していない。

## 6. 検証

R12実装後の検証結果は次のとおりである。

| Gate | 実測結果 |
| --- | --- |
| `npm run check:node` | 成功（Node.js 22.23.2） |
| `npm run data:check` | 32 assets verified |
| `npm run generator:test` | 18 passed / 13 deselected |
| `npm run generator:test:simulation` | 13 passed |
| `npm run generator:lint` | 成功 |
| `npm test` | 76 files / 873 tests passed |
| `npm run typecheck` | 成功 |
| `npm run lint` | 成功 |
| `npm run lint:markdown` | 37 files / 0 issues |
| `npm run verify:runtime-dx` | 20,000 cases passed; non-finite 0、negative 0 |
| `npm run build` | 415 modules transformed |
| `npm run smoke:production` | PASS; Check／Attack／Backtrackの表示、unexpected request、browser diagnosticsを確認 |
| `git diff --check` | 成功 |

`tests/dxTailModel.test.js`では一個のDX、最大値、Yousei、負の二項分布、critical=11とdice=0の境界、tail cutoff、first-moment上界を直接検証した。既存の`rangePlanner.test.js`、DX、Damage、Backtrack、runtime ruleテストは、public facade経由の計画結果と数値を引き続き検証する。`tests/corePlanningArchitecture.test.js`では、facadeの薄さ、Score／DXからplannerへの逆依存がないこと、planning module間の循環依存がないこと、tail関数がRangePlannerへ再導入されていないことを検査する。

## 7. 保護領域と非対象

R12で変更したのは`src/calculation/DxTailModel.js`、`src/calculation/DxCalculator.js`、`src/calculation/ScoreCalculator.js`、`src/calculation/RangePlanner.js`、`src/calculation/planning/**`、および計算コアのテストだけである。次の領域は変更していない。

- `public/**`
- `generator/**`
- `tooling/reference-data/**`
- Vue feature、runtime worker、ResourceGuard、Worker protocol
- 公開JSON、schema、DistributionResult、表示形式

R12はbehavior-neutralな構造変更であり、canonical移行や外部API化を追加で進めるものではない。今後の数値最適化や入力範囲拡張は、今回の分離されたmodel／planner単位で独立に検証してから判断する。

## 8. 判定

実装と既存回帰テストを完了し、計算coreの依存境界と責務分離をテストで固定した。R12の判定は次のとおりである。

```text
P0: 0
P1: 0
P2: 0

R12: CLOSED / GREEN
Next: R13候補の整理
```

この文書を更新したdocs commit自身のSHAは本文へ自己参照しない。最終HEAD上の追加gate結果はcommit後の作業報告で記録する。
