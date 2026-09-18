# R23-C3B/C3C: 意味的不確かさと数値計算の分離

## 目的

R23-C1BとR23-C3Aでは、計算範囲の外側に残るScoreの尾部を期待値へ伝播するため、ScoreとDamageに証明書を追加した。この証明書が表すのは、まだ列挙していない確率質量や、その質量が期待値へ与え得る寄与という意味的不確かさである。一方、Float64の丸め、FFTの微小な負値、確率総和のずれは数値計算上の診断対象であり、同じ区間へ足し込むべきではない。

R23-C3B/C3Cでは、次の二つを明確に分けた。

- 検証済みの`Float64`配列と、その配列から得た統計量をcanonicalな数値結果として扱う。
- 未計算supportに由来する上界だけを、semantic certificateとして期待値や成功率へ伝播する。

数値異常は、従来どおり計算を拒否または補正するsanity gateと診断metadataで扱う。診断値を、意味的不確かさを表す期待値区間へ再利用しない。

## C3B: 証明書をsemantic-onlyにする

### Score tail moment

Scoreの明示計算上端を`W`とし、`W`より大きい部分の確率上限を`massUpperBound`とする。Score tail moment certificateの主要な値は次のように定義する。

```js
{
  version: 1,
  kind: 'score-tail-moment-certificate',
  model,
  modeledMax,
  massUpperBound,
  firstMomentUpperBound,
  boundaryContributionUpperBound,
  residualUpperBound,
  skillContributionUpperBound,
}
```

`boundaryContributionUpperBound`は境界値`W+1`へ尾部質量を置いたときの寄与、`residualUpperBound`はそこからさらに上へ離れる残差、`skillContributionUpperBound`は非負の技能値による寄与である。`firstMomentUpperBound`はこれら三つのsemantic termの和であり、未計算tailの一次モーメントを安全側から包む。

`DxTailModel`の内部では、幾何級数の打ち切り、負の二項tail、`min`による確率上限などを安全側に評価するための丸め保護を維持する。これはhelperが返す上界を安全にするための実装詳細であり、consumerが別の`numericalErrorBound`を加える契約とは異なる。

### Score whole expectation

通常DX、非負の技能値、`shihai=0`、`yousei=0`という既存の対応範囲では、明示部分の期待値を`L`、尾部残差の上界を`R`として、Score expectation certificateは`[L, L+R]`を返す。Float64加算のためにこの区間を外側へ拡張しない。`shihai>0`、`yousei>0`、負の技能値など対応範囲外では、従来どおりgenericな`lower-bound`または証明書なしの結果を返す。

### 成功確率

対決成功率の区間は、明示値同士、action側tail、reaction側tail、tail同士という意味上の組み合わせだけから構成する。`probabilityErrorBound`やplannerのtail budgetは診断・計画情報として保持するが、固定の数値marginとして区間へ再加算しない。これにより、確率の不確かさとFloat64の丸め幅を二重に数えない。

### Damage expectation

Damageの専用証明書は、明示Damageのfirst momentを`M`、action側Score tailの寄与上限を`Delta_A`、reaction側の寄与上限を`Delta_R`として、次のsemantic intervalを返す。

$$
[L_D,U_D]=[M, M+\Delta_A+\Delta_R]
$$

Damage出力自体に未解決のoverflowがある場合、action/reaction tailの位置と分離できないため証明書を発行しない。tail同士の同時発生はaction側の上界がすでに包むので、`Delta_R`へ二重に加えない。finite supportまたはtailなしの場合は、専用証明書を作らずgenericなexact経路を優先することがある。

## C3C: Total Damageへ区間を伝播する

### 1. componentの最強の有限区間

`src/calculation/DamageExpectationCertificate.js`に検証処理を集約した。`getFiniteDamageExpectationInterval()`は、次の順にcomponentの有限区間を探す。

1. 有効な専用`damageExpectationCertificate`の`[lowerBound, upperBound]`。
2. generic期待値が`exact`なら`[value, value]`。
3. generic期待値が`bounded`ならその上下界。
4. generic期待値が`lower-bound`なら有限上界がないため`null`。

不正な専用証明書や古いdiagnostic fieldは専用経路に採用せず、generic経路へ安全に戻す。これにより、metadataの更新途中でもTotalが推測値を表示しない。

### 2. 計画時のsnapshot

`planDamageAggregation()`のinspection段階で、result、metadata、componentの期待値区間を検証してplan内部へ保存する。ResourceGuardの待機中にcallerが元metadataを変更しても、実行時のTotal証明が変わらないようにする。詳細な区間はpublic planへ公開せず、計画が所有する内部状態として扱う。

### 3. 区間の加法性

独立性はTotal分布を畳み込むために必要だが、期待値の加法性には必要ない。各componentについて

$$
L_i\leq E[D_i]\leq U_i
$$

が得られれば、Totalについて

$$
\sum_i L_i\leq E\left[\sum_i D_i\right]\leq\sum_i U_i
$$

が成り立つ。実装では上下界を補償和で加算し、丸め誤差を新しいcertificate fieldとして追加しない。

専用aggregate certificateを発行する条件は、全componentに有限区間があり、少なくとも一つが専用Damage certificateに由来することである。全componentがgeneric exactだけなら従来のgeneric exactを使う。一つでもlower-boundしかないcomponentがあれば、Total専用証明書を作らず、既存のgeneric fallbackへ戻す。componentが0個の場合は期待値0、1個の場合はその区間をそのまま伝播し、不要なFFTを実行しない。

`getTotalDamageStatistics()`は、有効なaggregate `damageExpectationCertificate`を最優先し、なければ従来の`DistributionResult`統計処理を使う。Total FFTの分布から期待値を再構築したり、Total FFTの診断値を区間へ足したりしない。

## 数値診断と安全ゲート

semantic certificateから分離しても、数値検査を省略したわけではない。次の診断とfail-closed条件は維持する。

- `NaN`、`Infinity`、support外の値を拒否する。
- materialな負の確率や確率1超過を拒否する。
- FFT後の確率総和のdriftを検査し、許容範囲内だけを正規化する。
- `aggregationErrorBound`、`fftMassDrift`、`sourceMassDrift`、`probabilityErrorBound`を診断metadataとして保持する。
- ResourceGuard、Abort、support/index検証、FFT長上限、メモリ上限を変更しない。

これらは「計算結果が壊れていないか」を判定するための情報であり、「未計算tailが期待値へ与える寄与」の上界ではない。したがって、たとえば`aggregationErrorBound`を`positionUnknownProbabilityUpperBound`へ加えたり、`numericalErrorBound`をDamageの上限へ加えたりしない。

## 検証と監査

`tests/scoreTailMomentCertificate.test.js`と`tests/damageExpectationCertificate.test.js`は、semantic termだけで上界が独立oracleを包含すること、数値margin fieldを出力しないこと、既存の表示可能なfixtureが維持されることを検証する。`tests/damageExpectationPropagation.test.js`は、bounded同士、boundedとexact、generic bounded、lower-boundによるfail-closed、exact-only、0/1 component、metadata mutation、壊れた証明書、通常攻撃とaction側《妖精の手》のend-to-endを固定する。

監査は次で実行する。

```powershell
npm run audit:r23:damage-precision
npm run audit:r23:damage-tail
```

監査レポートでは、明示first moment、action/reaction tail寄与、semanticな上下界、区間幅、丸め結果を記録する。`aggregationErrorBound`などの診断値は別欄で追跡し、期待値区間の幅として解釈しない。区間の中点は診断用であり、表示値や最尤値ではない。

## 対象外

今回の変更では、Resource Plannerのthreshold、Attackの絶対上限、Runtime Damage Rollのアルゴリズム、FFT・D10・Backtrackのアルゴリズム、published-bucket互換、chart projection、formatterの丸め規則、generic `getCertifiedExpectedValue()`、`full-tail`の強制、Worker・latest-wins・Abort、ResourceGuard lease、`shihai + yousei`の入力制約を変更しない。これらは既存の契約と独立した作業単位で管理する。
