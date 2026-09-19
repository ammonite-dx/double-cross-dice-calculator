# 確率計算結果の共通契約

この文書は、現在のproduction計算コアが返す確率結果と統計値の意味を定義します。計算方式や作業単位に依存しない契約をまとめるため、過去のmigration phase名や旧JSON形式は使いません。

## DistributionResult

確率分布は`DistributionResult`として返します。`src/calculation/DistributionResultTypes.ts`が型の正本です。

```ts
type DistributionResult = {
  version: 1
  values: Float64Array
  offset: number
  support: { kind: 'finite'; max: number } | { kind: 'infinite' }
  overflow: null | {
    kind: 'exact'
    lowerBound: number
    probability: number
    errorBound: number
  } | {
    kind: 'upper-bound'
    lowerBound: number
    probabilityUpperBound: number
    errorBound: number
  }
}
```

`values[i]`が表す結果値は`offset + i`です。従って明示されている範囲は`offset`から`offset + values.length - 1`までであり、独立した`exactRange`フィールドは持ちません。値の配列は生成時にコピーされ、確率が負、非有限、1超過にならないことと、明示部分とoverflowを合わせた質量が契約に従うことを検証します。

`support`は数学的に結果が取り得る範囲を表します。`finite`なら`max`が最大値であり、`infinite`なら入力に応じて上側へ続く可能性があります。これは今回の計算で配列に格納した範囲（computed range）とは別の情報です。

`overflow`は明示範囲の外側を表します。`exact`はoverflowの確率質量を正確に知っている場合、`upper-bound`は残りの質量の上限しか証明できない場合に使います。どちらも`lowerBound`以上の値に対応し、`errorBound`は数値計算に由来する許容誤差です。overflowが`null`なら、有限support全体が明示されているか、外側の質量が契約上ゼロです。

したがって、配列の末尾へ未計算の質量を無条件に押し込んだり、未知のtailを確率0として返したりしてはいけません。完全supportが必要な処理は、計画したworking rangeを拡張してから再計算するか、証明できる区間として扱います。

## 証明付き数値

期待値などの数値は、確度を`kind`で明示します。

- `exact`: 値を正確に計算できる
- `bounded`: `lowerBound`以上`upperBound`以下であることを証明できる
- `lower-bound`: `lowerBound`以上であることだけを証明できる

確率には`exact`と`bounded`を使います。確率の上下限は常に0以上1以下で、下限が上限を超えてはいけません。これらは表示形式ではなく、計算コアからpresentationへ渡す意味論上の契約です。

## Scoreの統計値

判定の統計値はactionとreactionを分けた`ScoreStatisticsLane`として返します。

```ts
type ScoreStatisticsLane = {
  expectedValue: CertifiedValue
  successProbability: CertifiedProbability
  forcedFailureProbability: CertifiedProbability
}
```

`forcedFailureProbability`は、0個ダイスの自動失敗やファンブルなど、ルール上必ず失敗する結果の確率です。表示上の達成値0に合流することがありますが、通常の計算結果がたまたま0になった確率とは別物です。後者を前者として扱うと、成功率や対決判定を誤ります。

## Tailと期待値のcertificate

Scoreの`metadata`には、明示範囲の外側について計算コアが証明した情報を保持します。

- `scoreTailCertificate`: tail質量の下限・上限、tailが始まる下限、確率誤差
- `scoreTailMomentCertificate`: tail質量と一次モーメントの上限。DXの無限tail、妖精の手のtail、有限supportなどモデルを区別する
- `scoreExpectationCertificate`: DXのtailモデルから得た期待値の下限・上限

Damageの`damageExpectationCertificate`は、Scoreのtail、攻撃力、反応側のtailが期待値へ与える寄与を合成した区間を表します。Total Damageでは各コンボの期待値区間を独立に合計へ伝播します。明示配列の質量だけから期待値を計算して、未解決tailを無視してはいけません。

Backtrackは有限supportを完全に生成するため、通常はoverflowを持ちません。入力が大きい場合も、資源計画が許す範囲で完全supportを確保できなければ計算を拒否します。

## 数値診断と意味論上の不確かさ

`errorBound`や浮動小数点の残差は、数値計算の診断です。一方、`upper-bound`や`lower-bound`は、計算範囲の外側を完全には特定できないという意味論上の不確かさです。両者を同じ「誤差」として表示したり、数値残差を理由に確率区間を広げたりしてはいけません。

## Presentationとの境界

計算コアは確率を0から1の分数で返し、`CertifiedValue`と`CertifiedProbability`のkindを保持します。百分率への変換、丸め、単位表示、チャートのrequested windowへの投影はpresentation層の責務です。presentationが契約を満たさない場合は、旧結果へ黙ってfallbackせず、表示用の拒否または再計算を行います。

`published-bucket`は、過去の1024要素形式との比較・互換性を保つための投影です。実装は[`tooling/reference-data/PublishedBucketCompatibility.js`](../tooling/reference-data/PublishedBucketCompatibility.js)に隔離され、production計算coreはこの投影を実行しません。インデックス1023へ1023以上を集約する処理は、`DistributionResult`のsupportやoverflowを置き換えるものではなく、通常のproduction結果の最終表示上限でもありません。
