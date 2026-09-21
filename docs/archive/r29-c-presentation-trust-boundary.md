# R29-C: Presentation trust boundary simplification

## 基準と目的

R29-Cは、R29-B closure後の`789f924`（`chore: close R29-B preparation convergence`）を基準に実施した。目的は、計算結果を表示へ渡す境界を一つに明確化し、同じ内部DTOを下流の各段階で再検証・再コピーする処理を減らすことである。確率計算、結果契約の意味論、resource threshold、Worker lifecycle、latest-wins、Attackの状態ライフサイクルは変更しない。

## 最終的な信頼境界

```text
DistributionResult
  -> presentDistribution: 検証 + 確率配列の表示snapshot
  -> DistributionDisplay（信頼済み）
  -> planDisplayRange / projectDistribution: window・policy・resource境界
  -> ReadyDistributionProjection（信頼済み）
  -> materializeChartJsData: Chart.js dataset
```

`presentDistribution`は`DistributionResult`とenvelope metadataを検証し、summaryの`mass`と`expectedValue`は参照を再利用する。計算結果の可変`Float64Array`だけは通常の配列へコピーし、表示側が所有する明示確率snapshotとする。warningは要素を浅くコピーしてfreezeするが、warningのnested detailsは再帰的にclone・freezeしない。

## 所有権

| 値 | 所有者 | 下流での扱い |
| --- | --- | --- |
| `DistributionResult.values` | calculation | 可変バッファ。表示境界で直接公開しない |
| `DistributionDisplay.explicit.probabilities` | `presentDistribution` | 表示側snapshot。計算結果とは別バッファ |
| `DistributionDisplay.mass` / `expectedValue` | calculation statistics | certified referenceを再利用。再計算・deep cloneしない |
| `DisplayRangePlan` | `DisplayRangePlanner` | 表示窓、coverage、resource見積りを所有してfreezeする。trusted displayのsupport等は参照再利用 |
| `ReadyDistributionProjection.values` | `projectDistribution` | 要求windowサイズのprojection専用`Float64Array` |
| Chart.js `dataset.data` | Chart.js materializer | ready projectionの`values`を借用し、追加コピーしない |

## 残した検証と削除した重複

計算結果から表示へ移る`presentDistribution`では、resultの確率値、offset、support、overflow、projection uncertainty、summary、warning、表示窓を検証する。不正な計算バッファを後から変更した場合も、この境界でtyped errorとして拒否する。

表示範囲プランナーでは、要求されたdisplay window、safe-integerの差分とFloat64 memory estimate、policy、point count、chart point count、resource rejectionを検証する。表示DTOのkind/version、explicit probabilityの各係数、support・overflow・projection uncertaintyの整合性を再検証する処理と、これらのdeep copyは削除した。

投影段階では、modeとprojection optionsを検証し、missing coverage、finite support outside、exact overflow overlap、upper-bound overflow、projection uncertainty、known-zero、resource rejectionの既存判定を維持する。ready projectionのwindow bufferはallocation後にのみ生成し、plannerが作ったwindowを参照する。

Chart.js境界では、ready statusでないprojectionを既存の`ChartSeriesError`として拒否し、`includeLabels`、label、colorsなどのmaterializer optionsを検証する。projectionのkind、version、mode、window、valuesの型・長さを再検証する処理は削除した。labelsは要求windowから生成し、dataset.dataはprojection.valuesをそのまま借用する。

## 意味論と回帰

PMF・upper-tail、finite supportのknown-zero、exact overflowの再計算、upper-boundのnot-projectable、missing coverageの再計算、resource rejection、1023を超える表示範囲、Check・Attack・Backtrackのpresentationは従来の結果を維持する。R29-CではAttack lifecycleやBacktrack presentationのvalidation境界を変更していない。

## 実装コミット

| Commit | 内容 |
| --- | --- |
| `bec9fd7` | `test: define R29-C presentation trust ownership`。計算・表示・投影のbuffer ownershipと、計算結果の後変更に対するpresentation再検証をテスト化 |
| `b07934a` | `refactor: trust internal distribution presentation records`。DisplayRangePlannerの重複validation・copyを削除し、window・policy・resource境界へ集中 |
| `9efd9c6` | `refactor: reuse trusted projection windows`。planner-owned display windowをprojectionから再利用 |
| `2036fb9` | `refactor: simplify chart projection materialization`。Chart.js adapterのready/options境界化とprojection values借用 |

## 検証

- Node: 22.23.2、`npm run check:node` GREEN
- R29-C focused suite: 9 files / 147 tests、GREEN
- 通常Vitest: 88 files / 1023 tests、GREEN
- `npm run typecheck`: GREEN
- `npm run lint`: GREEN
- `npm run lint:markdown`: 100 files / 0 issues、GREEN
- `npm run build`: 457 modules transformed、GREEN
- `npm run diff:check`: `git diff --check` GREEN
- `npm run verify:release`: GREEN
- Production browser smoke: Check、Attack、Backtrack、mobile display styles、resource rejection/recovery、latest-wins、console diagnosticsを含む全ケースPASS
- Production smokeのprecomputed request: Check 0、Attack 0、Backtrack 0。D10 request 0。console warning/error 0、same-origin HTTP error 0

R29-Cのclosure時点で、作業ツリーはdocs commit作成後にcleanとする。

R29-CではR29-D以降のAttack lifecycle、compatibility surface cleanup、TypeScript移行、命名整理には着手していない。
