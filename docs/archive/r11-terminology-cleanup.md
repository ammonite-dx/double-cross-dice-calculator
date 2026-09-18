# R11 — Canonical / Migration Terminology Cleanup

R11では、canonical経路が移行中の一時的な並行経路ではなく、本番の単一計算経路になったことをコード上の名前へ反映した。productionの計算API、型、feature state、runtime、presentationからmigration専用の`Canonical`接頭辞と同一値の移行用aliasを取り除き、現在の責務を表す名前へ統一した。

## 1. Baseline / start

対象branchは`codex/canonical-default-migration`である。R11開始時点のHEADは次のとおりで、作業開始時のworking treeはcleanだった。

```text
R11 start SHA:
ffe05c70d9cf5d61e861a63445f73da72b30e99b
```

R0で定めた大枠のbaselineは`2770c2c87000c7d878a5e1bd81698c4781d0bbce`である。R11の実装と検証は、R10までに確定したcanonical default、published-bucket互換境界、RangePlanner、ResourceGuard、latest-wins、Abortの契約を前提に行った。

## 2. Rename matrix

### Runtime API

```text
calculateCheckCanonical
-> calculateCheck

calculateAttackCanonical
-> calculateAttack

calculateAttackCanonicalBatch
-> calculateAttackBatch

calculateCanonicalTotalDamage
-> calculateTotalDamage

calculateBacktrackCanonical
-> calculateBacktrack
```

### Calculation

```text
calculateScoreCanonical
-> calculateScore

calculateCanonicalDamageOnDemand
-> calculateDamageOnDemand

calculateFinalEncroachmentCanonical
-> calculateFinalEncroachment

CanonicalDamageAggregation.js
-> DamageAggregation.js
```

### Feature、shared、runtimeのファイルと型

```text
AttackCanonicalState
-> AttackState

AttackCanonicalRunner
-> AttackRunner

AttackCanonicalPresentation
-> AttackPresentation

CheckCanonicalPresentation
-> CheckPresentation

BacktrackCanonicalPresentation
-> BacktrackPresentation

CanonicalAttackBatchInput
-> AttackBatchInput

CanonicalChartSeriesAdapter
-> ChartSeriesAdapter

CanonicalSummaryFormatter
-> SummaryFormatter
```

### Attackのstateと結果

```text
canonicalScore aliases
-> score

canonicalDamage
-> damage

canonicalTotalDamage
-> totalDamage
```

同一値を二重に公開するcompatibility aliasは0件である。既存のscore summary、damage summary、total damageの意味や表示形式は変更していない。

## 3. Retained terminology

次の用語は移行の残骸ではなく、現在も有効な公開表現との互換境界を表すため、意図的に保持した。

```text
published-bucket
fromPublishedBucketDistribution
toPublishedBucketDistribution
```

これらは、canonicalの`DistributionResult`から旧来の公開bucket表現へ投影するadapterと、その逆方向の参照境界を表す。adapter固有の`legacy` error codeも、旧published representationを扱う境界を示す場合に限って保持する。したがって、`canonical`や`legacy`という文字列をリポジトリ全体で禁止するのではなく、現行の意味論または歴史記録を表す箇所では文脈に応じて使用する。

## 4. Architecture enforcement

`tests/namingArchitecture.test.js`と静的監査で、migration-onlyな名前がproductionへ再導入されないことを確認した。

```text
src filename containing Canonical: 0
retired production identifiers: 0
old compatibility re-export shims: 0
published-bucket terms: retained at compatibility boundaries
```

R11の実装コミットは`269d20e63cdf8eb319341d2c3a0ea28435c4f85b`（`refactor: normalize production calculation naming`）、命名境界テストは`6e36594b557ba63d1c67b3eda61f5c2241bd5126`（`test: enforce R11 naming boundaries`）である。

## 5. Protected areas

R11開始SHAから実装HEADまでの差分を対象領域ごとに監査し、公開データと再生成系には変更がないことを確認した。

```text
public changes: 0
generator changes: 0
tooling/reference-data changes: 0
```

公開schema-v2、Python generator、参照・互換用fixture、benchmark条件、計算意味論、表示ラベル、数値丸めはR11で変更していない。

## 6. Verification

R11実装後に実施したfull gateの結果は次のとおりである。

```text
Vitest: 74 files / 866 tests
generator tests: 18
simulation tests: 13
data: 32 assets
typecheck: GREEN
ESLint: GREEN
Ruff: GREEN
Markdown lint: GREEN
runtime DX: 20,000 cases PASS
production build: 408 modules
production browser smoke: PASS
git diff --check: GREEN
working tree: clean
```

production browser smokeではCheck、Attack、Backtrackを確認し、unexpected data/network requestsは0件、browser diagnostics（console warning、console error、pageerror、same-origin HTTP error、requestfailed）は0件だった。runtime DXの独立検証、generatorの通常・simulation検証、schema/data検証、resource・Abort・latest-wins境界も既存のR11 gateでGREENである。

R11実装後の主要SHAは次のとおりである。

```text
Production implementation:
269d20e63cdf8eb319341d2c3a0ea28435c4f85b

Naming architecture:
6e36594b557ba63d1c67b3eda61f5c2241bd5126

Initial R11 documentation:
d372794fbb65d68d2c016d6d55e98060bf6fcd1b
```

## 7. Priority assessment

R11実装そのものに残件はなく、今回のdocs closureでP2の記録不足を解消した。production source、tests、generator、公開asset、toolingの追加変更は不要であり、R12のcore module decompositionとは作業単位を分離する。

```text
P0: 0
P1: 0
P2: 0
```

## 8. Closure

R11は、productionのmigration-only terminologyを整理し、互換境界に必要なpublished-bucket terminologyを維持したうえで、実装・命名境界・full gate・production smokeを完了した。

```text
R11: CLOSED / GREEN
Next: R12 core module decomposition
```

この文書を更新したdocs commit自身のSHAは本文へ自己参照しない。最終HEADのSHAと最終HEAD上のlint・Markdown lint・`git diff --check`・working treeの結果は、commit後の作業報告で記録する。
