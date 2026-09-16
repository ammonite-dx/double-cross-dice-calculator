# R25-G Resource Policy Simplification / CPU Work Budget

## 目的

R25-Gでは、端末性能を仮定した経過時間の見積りとwarning／hardの二段階閾値を廃止し、計算前の資源判定を固定CPUワーク、メモリ、配列長、FFT長で統一する。CPUワークは実時間の予測値ではなく、同じ入力に同じ判定を適用するための端末非依存の作業量である。

## 変更理由

旧policyは操作ごとに異なるthroughputを持ち、推定時間を端末差の大きい単位で扱っていた。そのため、同じ入力でも環境によって意味が変わり、Score、Damage、Backtrack、Total Damage、表示範囲、ResourceGuardの責務も分かれていた。現行productionはブラウザ内計算を前提とするため、まず計算量を共通単位で上限管理し、実時間の測定値はベンチマーク資料として分離する。

## CPUワーク契約

`src/calculation/planning/PlanningMath.js`に既定上限と固定重みを集約する。

| 項目 | 重み |
| --- | ---: |
| Score operations | 8 |
| Damage Roll operations | 32 |
| 防御D10 operations | 32 |
| FFT operations | 1 |
| Backtrack operations | 16 |

既定の上限は`DEFAULT_MAX_CPU_WORK = 1_600_000_000`である。`calculateCpuWork()`は各入力が有限かつ非負であること、重み付けと合計が有限範囲に収まることを検証し、失敗時は例外で処理を止める。Damage Rollのように分数の推定値を持つ操作も受け付けるが、負値、非有限値、数値範囲のoverflowは受理しない。

## RangePlannerのlimits

`RangePolicy.limits`は次の単一レコードになった。

```js
{
  maxCpuWork: 1_600_000_000,
  estimatedMemoryBytes: 64 * 1024 * 1024,
  workingLength: 16_384,
  fftLength: 32_768,
}
```

これらの値はすべてhard resource limitであり、値が上限と等しい場合は受理する。旧`costModel`、`limits.warning`、`limits.hard`は互換のために残さず、`mergePolicy()`で明示的に拒否する。意味上の入力不整合やtail certificateの失敗はresource metricとは別のreject理由として扱い、Backtrackの静的asset coverage不足だけは`backtrack-asset-overflow`という非致命warningを維持する。

Score、Damage、防御D10、FFTの操作別見積りは`ResourcePlan`で一度だけ合成する。CheckはScoreだけ、AttackはScore・Damage・防御D10・FFT、Backtrackは生成と結果配列を含むBacktrack operationsをCPUワークへ換算する。`generationOperations`はBacktrack planへ明示し、on-demand生成時の`workingLength * 3 + generationOperations`をBacktrack operationsとして扱う。

## Damage RollとTotal Damage

Damage Rollの推定式は`getRuntimeDamageRollOperationEstimate(weightLength, effectiveKazanari, fftLength)`に集約する。

$$
\left(\frac{F}{2}+1\right)\left(W(1+3k)+\frac{5k(k+1)}{2}\right)
$$

ここで$W$はweight length、$k$は有効な`kazanari`、$F$はDamage Roll FFT lengthである。plannerとruntimeは同じ関数を利用するため、計算前の推定と実行時の絶対安全上限が同じ作業量を見ている。runtime側には別途`RUNTIME_DAMAGE_MAX_OPERATION_ESTIMATE = 2_000_000_000`を残し、plannerを迂回した直接呼出しも無制限に進まないようにする。

Total Damageでは、従来のthroughputによる`timeMs`を削除し、aggregation `operations`をそのままCPUワークとして`DEFAULT_MAX_CPU_WORK`と比較する。超過時はFFTやResourceGuard leaseの前に`resource-limit`を返し、詳細には`operations`、`cpuWork`、`limit`を含める。集計planの各FFT、出力長、メモリ、component情報は引き続き保持する。

## ResourceGuardと表示範囲

ResourceGuardは`float64Bytes`から予約量を計算し、active／queued request、Abort、releaseを管理する。CPUワーク、操作数、経過時間はResourceGuardのrequest、lease metadata、snapshotへ含めず、計画段階の責務と混在させない。

DisplayRangePlannerは`pointCount`、`float64Bytes`、`chartPoints`の単一上限を持ち、いずれかを超えた場合だけhard rejectする。旧warning／hardの入れ子は拒否し、表示範囲を狭めて再計算する契約は維持する。表示フィードバックには時間見積りを出さず、メモリ超過は「計算に必要なメモリが上限を超えています。」と通知する。

## 検証

CPUワークの重み、上限の等号境界、混合操作、分数のDamage Roll式、Backtrack生成量、旧policyの拒否、DisplayRangePlannerのhard-only挙動をunit testとtypecheck fixtureで固定した。ResourceGuardのmetadataから操作数と時間を除き、Total DamageのCPUワーク超過、runtimeのDamage Roll絶対上限、plannerとruntimeの式一致も検証する。

実行するrelease gateは`npm test`、`npm run typecheck`、`npm run lint`、`npm run lint:markdown`、`npm run build`、`npm run verify:release`、R23のprecision／tail監査、`git diff --check`である。ベンチマークの経過時間は同一環境での性能比較にのみ使用し、resource policyの判定値へ戻さない。

## 維持・保留

公開schema-v2 asset、Python generator、published-bucket互換、R22〜R24の測定結果と歴史資料は変更しない。歴史資料に残る`estimatedTimeMs`や旧thresholdは当時の判断を表すもので、現行admission policyとは区別する。入力上限のさらなる拡張、追加Worker化、Cloudflare Worker／API／MCP化は別の設計単位で再評価する。
