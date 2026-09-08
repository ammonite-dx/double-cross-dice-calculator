# R20: Graph-first UIと描画投影

## 目的

R20では計算結果、表示したい論理範囲、画面へ描画する解像度、Chart.jsのデータを分離する。計算結果の確率やサマリーの意味は変更せず、広い表示範囲でも画面上の描画点数だけを適切な予算へ収める。

画面の順序は既存のgraph-first方針を維持する。CheckとAttackでは入力、グラフ、サマリーの順、Backtrackでは入力、グラフ、補助的な確率表の順とし、サマリーや表をグラフより前へ移動しない。

## 責務の境界

表示処理は次の段階に分ける。

```text
DistributionResult
↓
DistributionPresenter
↓
DisplayRangePlanner
  論理表示範囲、coverage、再計算、known-zero、resource判定
↓
ProbabilityChartProjection
  PMFのbin集約、upper-tailの代表threshold選択
↓
Chart.js materializer
↓
Chart component
```

`DisplayRangePlanner`は論理範囲の安全性を担当するが、要求した整数座標数とChart.jsの描画点数を同一視しない。`logicalPointCount`と`scanPointCount`を必要に応じて保持し、`chartPoints`をplannerの意味上の制限として扱わない。

## PMFの投影契約

狭い範囲では、整数座標ひとつをひとつのbinとして表示する。描画予算を超える範囲では、連続する整数座標を区間binへまとめる。各binの確率は単純な間引きではなく、区間内の確率質量の合計とする。

```text
bin.probability = Σ P(X = x)  (bin.min ≤ x ≤ bin.max)
```

binには欠落や重複を許さず、要求範囲全体を昇順に覆わせる。集約前後の要求範囲内の確率質量は浮動小数点の許容誤差内で一致させる。Chart.jsにはPMFを棒グラフとして渡し、区間binのtooltipは「達成値120〜123」のように範囲を明示する。

## Upper-tailの投影契約

upper-tailの各点は正確な整数thresholdにおける `P(X ≥ threshold)` を表す。狭い範囲では各thresholdを表示し、広い範囲では代表thresholdだけを選ぶ。隣接点の平均や確率の平均を、別のthresholdの確率として扱ってはならない。

代表点には要求範囲の最小値と最大値を必ず含め、確率は単調非増加を維持する。Chart.jsではstepped lineを基本とし、集約・抽出の意味を画面近傍で説明する。

## 描画予算と再計算

描画投影は正のsafe integer `maxRenderedPoints`を受け取る。予算は固定の「1000点」ではなく、コンテナ幅と有用な最小水平間隔から導出し、実測に基づく最小値・最大値へclampする。具体値はR20のブラウザ測定で決定する。

resizeやresponsive breakpointの変更では計算ClientやWorkerを再実行しない。既存の計算結果と論理表示範囲から、表示専用のprojectionとChart.jsデータだけを再生成する。viewport情報を計算入力、RangePlanner、Worker messageへ渡さない。

## 不確かさと安全性

overflow、position unknown、upper-bound、再計算、`not-projectable`、既知のzeroなど既存の不確かさ契約を維持する。bin集約を理由にunknown massを最終binへ押し込んだり、再正規化したりしない。論理範囲のsafe integer、span、coverage、scan/resource上限も維持する。

`0..20000`の表示を無条件に受け入れない。描画点数の分離後も、計算または論理scanのresource制約で拒否すべきかを測定して決め、理由を最終文書へ記録する。

## UIとアクセシビリティ

CheckとAttackの既存graph-first順序を維持し、チャートには意味のあるaccessible nameを付ける。集約時には論理範囲とbin数、upper-tailの代表thresholdの意味をユーザーが確認できる説明を表示する。Backtrackは3つのDoughnut chartを比較しやすい横棒グラフへ移し、各modeの確率をHTML表でも提供する。小さい画面で確率を6pxのdatalabelへ押し込む方式は採用しない。

## 実装順序と検証

1. 本契約を先に確定する。
2. plannerの論理範囲と描画予算を分離し、Chart.js非依存のprojectionを追加する。
3. PMF棒グラフ、upper-tail stepped line、resize時の表示専用再投影、アクセシビリティ説明を追加する。
4. CheckとAttackを新projectionへ移行する。
5. Backtrackの横棒グラフとHTML表を追加する。
6. 既存dense系列をoracleとしてブラウザ測定し、点数、projection時間、Chart.js更新、Long Task、heartbeatを比較する。

R20の成功条件は、広い論理範囲でも描画点数が予算を超えず、PMFの質量保存とupper-tailの単調性を守り、受理済みUI操作で再現性のある50ms以上のLong Taskを増やさないことである。「何倍速いか」は受入条件にしない。R19で確定したRuntimeDamageRollWorkerとResourceGuardの所有権は変更しない。

## ブラウザ測定結果

測定は`npm run benchmark:r20:chart-rendering`で実行し、Chrome 152のheadless desktop条件（hardwareConcurrency 16、deviceMemory 32、viewport 1280×720）で、各ケースを1回warm-up後に3回測定した。CPU 4x条件はrunnerへ`--cpu-4x`を渡して別途測定した。実験は本番計算を呼び出さず、均一分布の表示データを使ってChart.jsの描画負荷だけを比較する。

| 論理座標数 | dense Chart中央値 [ms] | 投影 Chart中央値 [ms] | 投影点数 |
| ---: | ---: | ---: | ---: |
| 100 | 2.3 | 2.2 | 100 |
| 1,000 | 4.9 | 2.9 | 512 |
| 4,096 | 17.4 | 3.0 | 512 |
| 16,384 | 63.8 | 3.0 | 512 |
| 20,000 | 75.6 | 3.0 | 512 |

通常条件では16,384点と20,000点のdense描画がそれぞれ64ms、86msまで伸び、Long Taskも観測された。一方、投影後のChart.js更新は全ケースで中央値3ms前後だった。CPU 4xではdense描画が16,384点で330ms、20,000点で398msまで伸びたのに対し、投影後は16〜20msだった。投影は論理範囲を削らず、PMFのbin質量を保存したまま描画点数だけを512点へ抑えている。

この測定から、`0..20000`を無条件に受け入れる入力・計算policyへ変更することは保留する。ただし、表示だけを投影する範囲ではdense系列に由来する50ms以上のLong Taskを避けられるため、現在の`DisplayRangePlanner`の計算・scan資源制限は維持し、Chart.js側の固定1024点制限は設けない方針とする。低速実機での再測定や計算範囲の拡張が必要になった場合は、同じrunnerへケースとCPU条件を追加する。

再現用のページ、runner、測定条件は[`experiments/r20-chart-rendering/`](../experiments/r20-chart-rendering/)に置く。測定結果は環境依存のため、release gateの固定閾値ではなく、resource policyを見直す際の判断資料として扱う。
