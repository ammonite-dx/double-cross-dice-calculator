# R25-D 表示投影パイプライン統合

## 目的

R25-Dでは、CheckとAttackの確率表示で分散していた表示範囲の判定を、shared presentationの`projectDistribution()`へ統合した。計算コアが返す`DistributionResult`の意味論や、画面に表示する確率値・丸め規則は変更していない。

現行のデータフローは次のとおりである。

```text
DistributionResult
  -> presentDistribution()
  -> projectDistribution()
  -> featureごとの状態集約
  -> Chart.js materializer
```

`planDisplayWindowResources()`による計算前のresource preflightはこの流れとは別に維持する。投影が必要と判断した場合だけ、既存のlatest-wins runnerが表示範囲を広げた計算を開始する。

## Shared projection contract

`projectDistribution(display, { displayWindow, mode, policy })`は、display payloadの表示範囲を計画し、overflowと位置不確かさを判定し、readyの場合だけwindowサイズの`Float64Array`を生成する。計画と値の生成を一つの関数にまとめることで、coverage不足の部分配列を一時的に画面へ渡す経路を作らない。

返却値は`kind: 'canonical-distribution-projection'`、`version`、`status`、`decision`、`reason`、`mode`、`displayWindow`、`plan`を持つ。`status: 'ready'`のときだけ`values`を持ち、`values`はdisplayの係数配列から独立したowned `Float64Array`である。

decisionは次の五つを正本とする。

- `reuse`: 明示coverageをそのまま利用できる。
- `known-zero`: finite supportの外側で、すべての値が0だと証明できる。
- `recalculate`: coverage不足または位置を確定できるexact overflowがあり、範囲を広げた再計算で解決できる。
- `resource-rejected`: 表示windowの資源計画がhard policyを超える。
- `not-projectable`: upper-boundの不確かな質量など、現在の結果から安全な表示値を作れない。

判定順序は、resource hard reject、terminalなupper-bound不確かさ、再計算可能なexact overflowまたはcoverage不足、finite support外のknown-zero、reuseである。upper-bound overflowとcoverage不足が同時にある場合は、upper-boundの`not-projectable`を優先する。ただし状態表示はcoverage不足を含むとき`not-ready`とし、既存の再計算通知との互換性を保つ。

exact overflowが表示windowへ重なる場合は`recalculate`とする。upper-bound overflowは実確率ではないため、一点のPMFやupper-tailへ押し込まず`not-projectable`とする。位置不明確率が`DISPLAY_PROBABILITY_TOLERANCE`以下で、別個のdamage output overflowがないscore tailは、従来どおりPMFとupper-tailへ投影できる。`outputOverflowLowerBound`がある場合はscore tailの許容誤差と混同せず、output overflowを独立に判定する。

## Feature integration

Checkはactionとreactionそれぞれで`presentDistribution()`から`projectDistribution()`を呼び、projectionのdecisionを集約するだけになった。Check固有のoverflow解釈、planのdescriptor検査、同じwindowへの再投影は行わない。既存の百分率変換はChart.js境界の直前に限定し、action/reactionのdataset順と表示値を維持する。

Attackはscore laneとdamage laneを分離したまま、各displayを同じshared projectionへ渡す。combo damageとtotal damageは独立したprojectionとchartを持ち、一方のlaneが`recalculate`または`not-projectable`になっても他方の結果を上書きしない。Attack側にはprojectionのdecisionを再解釈するoverflow判定を置かず、runnerのlatest-wins、Abort、incremental計算、ResourceGuard契約も変更していない。

## Chart.js boundary

`src/shared/presentation/ChartSeriesAdapter.js`は、readyなcanonical projectionをChart.jsのdatasetへ materializeする責務だけを持つ。labels、datasetの色・ラベル、`parsing: true`はこの境界で生成し、projection本体にはChart.js用のpoint objectやlabelsを保持しない。materializerはreadyでないprojectionを受け付けず、値を0や推定値で補完しない。

表示範囲の計画とoverflow判定は`DistributionProjection.js`と`DisplayRangePlanner.js`が担当するため、Chart.js adapterでplanを再検証したり、legacyの`createChartSeries(display, plan)`を経由したりしない。Attackが保持する`series`は既存テストと下位consumerのための薄い値互換viewであり、Chart.js materializerへの入力ではない。

## 検証

`tests/distributionProjection.test.js`はPMF、upper-tail、offset、finite support、exact／upper-bound overflow、coverage不足、位置不確かさ、output overflow、resource拒否、1023超のwindowを検証する。`tests/chartSeriesAdapter.test.js`はprojectionからChart.js datasetを作る境界だけを検証し、`tests/checkPresentation.test.js`と`tests/attackDisplayPresentation.test.js`はfeatureのdecision集約と既存表示値を検証する。

R25-Dの実装コミットは次のとおりである。

1. `de819ab` — `refactor: introduce canonical distribution projection`
2. `f7683ba` — `refactor: migrate check presentation to canonical projection`
3. `7d4af66` — `refactor: migrate attack displays to canonical projection`
4. `refactor: retire legacy presentation projection pipeline` — Chart.js materializerのみを残し、旧projection APIと専用テストを削除する。

最終コミット後は、Vitest、typecheck、ESLint、Markdown lint、build、production smoke、generator／simulation、runtime DX、数値監査、`git diff --check`を実行し、作業ツリーがcleanであることを確認する。
