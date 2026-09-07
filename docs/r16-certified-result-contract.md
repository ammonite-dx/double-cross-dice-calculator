# R16: 計算結果の確度と確率の契約

## 目的

R16では、計算結果がどこまで数学的に保証されているかを、計算コアと表示層で共有できる契約へ整理した。アルゴリズムや画面の見た目を変更することが目的ではなく、期待値や確率を百分率へ丸めたり、overflowを一点の値へ読み替えたりする処理を計算コアから取り除くことが目的である。

契約の実装は、ブラウザやVueに依存しない[`src/domain/CertifiedValue.ts`](../src/domain/CertifiedValue.ts)に置いている。計算コアの利用方法は[`runtime-calculation-algorithms.md`](./runtime-calculation-algorithms.md)を、入力規則は[`dice-rules.md`](./dice-rules.md)を参照する。

## CertifiedValue

期待値のように単位が点数である値は、次のいずれかで表す。

```text
{ kind: "exact", value }
{ kind: "bounded", lowerBound, upperBound }
{ kind: "lower-bound", lowerBound }
```

`exact`は値を一つに確定できる場合、`bounded`は上下の範囲だけを確定できる場合、`lower-bound`は下限だけを確定できる場合に使う。すべての数値は有限値でなければならず、`bounded`では下限が上限を超えてはならない。一般の区間生成器は、上下限が一致していても`bounded`を`exact`へ自動変換しない。数学的に一点へ確定したことを知っているproducerが`exact`を選ぶためである。

constructorは入力を検証し、返却オブジェクトを凍結する。これにより、計算結果を受け取った側が確度の意味を変更できない。prototypeやdescriptorの検査は契約に含めず、通常のデータオブジェクトとして扱う。

## CertifiedProbability

確率は計算中、常に分数の`0`以上`1`以下で表す。百分率への変換は表示直前にだけ行う。

```text
{ kind: "exact", value }
{ kind: "bounded", lowerBound, upperBound }
```

確率の下限だけが分かる場合は、上限を`1`とした`bounded`で表現する。`NaN`、無限大、範囲外の値、上下限の逆転はconstructorで拒否する。期待値と確率は同じ`kind`表現を共有するが、確率constructorだけは値域を`[0, 1]`へ制限する。

## ScoreStatistics

`getScoreStatistics`と`CalculationClient`のScore結果は、`scoreSummary`ではなく`scoreStatistics`という名前で公開する。各sideには次の3つの統計量がある。

```text
{
  expectedValue: CertifiedValue,
  successProbability: CertifiedProbability,
  automaticFailureProbability: CertifiedProbability
}
```

`successProbability`は固定難易度なら`P(A \ge t)`、対決なら`P(A > R)`である。対決の同値はリアクション側の勝利として扱う。`automaticFailureProbability`は最初のダイスロールで自動失敗またはファンブルになる確率であり、技能値をシフトした後の達成値0の確率や、対決に負ける確率とは別の量である。

通常のDXは無限supportを持つため、作業範囲の外側を含む成功確率は、tail certificateで評価できる範囲を`bounded`として返す。`critical=11`、ダイス0個、または《絶対支配》の対象ダイス数以下の判定のようにsupport全体を列挙できる場合は、producerが`exact`を選ぶ。

## Tail certificateと期待値

Score envelopeのmetadataには、計算した範囲の外側について次の証明情報を保持する。

```text
scoreTailCertificate
scoreExpectationCertificate（証明できる場合のみ）
```

tail certificateの`massLowerBound`と`massUpperBound`は、未列挙部分の確率質量の範囲である。expectation certificateの`lowerBound`と`upperBound`は、DXの最大値の尾部を解析的に評価した期待値の範囲である。これらは`DistributionResult.overflow.errorBound`とは異なり、期待値の誤差幅を表す専用metadataである。

Damageの期待値も同じ`CertifiedValue`を使う。有限supportまたはoverflowを完全に評価できる場合は`exact`、overflowの位置だけが分かる場合は`bounded`、無限tailの下限だけを使う場合は`lower-bound`となる。R16ではDamage UIの既存方針を維持し、`exact`でない期待値は従来どおり`—`と表示する。

## 表示層との境界

計算コアは成功確率を分数のまま返し、`Math.round(... * 1000) / 10`のような百分率丸めを行わない。`src/shared/presentation/SummaryFormatter.js`の`formatCertifiedProbabilityPercent`が分数を百分率へ変換し、従来と同じ小数1桁へ丸める。上下限を丸めた結果が一致する`bounded`だけは、その一点を表示し、幅が残る区間と`lower-bound`は`—`とする。

この分離により、API利用者は丸め前の確率と確度を利用でき、サイトの既存チャートとサマリーは表示形式を変えずに動作する。公開クライアントの主な返却形状は次のとおりである。

```text
Check: { score, scoreStatistics }
Attack: { score, scoreStatistics, damage, damageStatistics }
Attack batch: { combos, totalDamage, totalDamageStatistics }
Total damage: { totalDamage, totalDamageStatistics }
```

旧`getScoreSummary`、`getDamageSummary`、`getTotalDamageSummary`および`successRate`はproduction計算経路から削除した。published-bucketは互換投影を明示的に求める比較境界だけで使い、通常の計算結果へ戻すことはない。

## 検証

`tests/certifiedValue.test.js`はconstructorの有限値検証、区間順序、確率範囲、immutabilityを検証する。`tests/certifiedStatisticsOracle.test.js`はproduction helperを期待値側へ使わず、1D10・2D10の全列挙から次を確認する。

- 1D10、critical=10、技能値0では、固定難易度0、5、10の成功確率がそれぞれ`0.9`、`0.6`、`0.1`を含む。
- 1D10、critical=10の自動失敗確率は`0.1`である。
- 有限supportの2D10、critical=11では、列挙した最大値分布と固定難易度成功確率が一致する。
- 有限supportの対決では、`P(A > R)`と同値を含むリアクション側の確率が独立列挙と一致する。

R16の対象はresult contractの統一である。入力状態の所有権整理、表示presenterの簡素化、Worker/API/MCP化、全面的なTypeScript化は後続フェーズで扱う。
