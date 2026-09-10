# R23 Damage summary precision audit

この実験は、Damage期待値のbounded区間を小数1桁で表示する条件を測定する。productionのformatterは、certified boundsを丸めた結果が一致する場合だけ値を表示し、区間の中点や推測値を表示値へ変換しない。

監査対象には、通常攻撃、高い達成値、ダメージダイス1個・複数個、固定値差が正負の場合、防御ダイス、《風鳴りの爪》の振り直しが1個・複数個、大きめの受理ケース、2コンボ・4コンボの合計を含める。

## 実行

```powershell
node experiments/r23-damage-summary-precision/audit.mjs
```

JSONレポートは`output/report.json`に保存される。このディレクトリはgitignoredであり、実験結果はproductionの表示閾値や計算コアを変更しない。

tail由来の期待値不確かさを調べるには、次を実行する。

```powershell
node experiments/r23-damage-summary-precision/tail-attribution.mjs
```

こちらは`output/tail-attribution.json`へ、公開版3.1相当のfixtureを含むScore・Damageの明示first moment、support、overflow、tail certificate、Score期待値certificate、Damageのprojection uncertaintyを保存する。

## 記録する値

各結果について、`kind`、区間の`lower`・`upper`・`width`・`halfWidth`、小数1桁に丸めた上下界、`stableRoundedDisplay`を記録する。bounded区間の中点は診断用に保存するが、最尤値や表示値とは解釈しない。既存モデルがexactなpoint estimateを返す場合だけ`pointEstimate`へ記録し、bounded/lower-boundに対するヒューリスティックな推定値は作らない。

閾値を決める前に、`halfWidth <= 0.005`、`0.010`、`0.020`の件数と、丸め境界をまたぐbounded区間の件数を集計する。これは候補を比較するための監査であり、閾値の自動決定ではない。

レポートの`allFiniteIntervalThresholdCounts`はexactを含む有限区間全体の診断値である。追加近似の検討には、`kind`が`bounded`で、既存の丸め表示が不安定で、`halfWidth`が指定threshold以下のrecordだけを対象とする。該当IDは`additionalApproximationCandidates`、件数は`additionalApproximationCandidateCounts`へthresholdごとに出力する。exact、lower-bound、既存ルールで表示できるstable boundedは追加候補へ含めない。

tail attributionの`candidateBound`は、restricted safe sliceで有限上界を導出できるかを調べる研究用の値である。`finite-candidate-only`はproductionのcertificateではなく、`insufficient-certificate`は利用可能な証明書だけでは有限上界を構成できなかったことを表す。どちらの場合も、区間の中点や下限を期待値の一点推定として表示しない。
