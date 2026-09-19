# R25-K published-bucket cleanup

## 結論

R25-Kでは、productionの計算経路から`published-bucket`を選択する実行モードを撤去した。productionのScore、Damage、Attack planning、CalculationClientはcanonical full-tailを正本とし、旧1024要素配列への投影を行わない。

旧形式そのものは削除していない。過去JSON、比較テスト、再現性確認で必要なadapterを`tooling/reference-data/PublishedBucketCompatibility.js`へ移し、productionの`src/`から参照されない境界として保持する。

## 実装単位

- `9b9997b` — production planner、Damage、CalculationClientから`scorePropagation`と`scoreValueMode`を撤去し、canonical full-tailだけを受理する。Damageの上側tailは`DistributionResult`のsupportとoverflowへ保持する。
- `990d3b8` — 1024バケットの入出力adapterを`tooling/reference-data/PublishedBucketCompatibility.js`へ移し、canonical `DistributionResult`から旧形式への逆流を防ぐ。参照テストはこのmoduleを明示的にimportする。

## 保持したもの

### production境界

- R25-Kでは`PUBLISHED_OVERFLOW_INDEX = 1023`と`calculationMax=1022`を歴史的な比較形式として記録した。これらはR25-Lでproductionの計算範囲から撤去され、現在は参照adapterの境界だけに残る。
- R25-K時点では、旧境界の撤去そのものは別作業として切り出した。R25-Lで有限support、tail certificate、resource guardを用いる動的計画へ移行した。
- `ResourceGuard`、display window、latest-wins、Worker、FFT、certificateの意味論は変更していない。

### 参照境界

- `fromPublishedBucketDistribution`と`toPublishedBucketDistribution`は参照用toolingに保持した。
- revision-1 JSON、generator、historical experiment、比較テストは再生成・回帰確認のため保持した。
- 参照adapterは、upper-bound overflowや1023未満から始まる安全でないexact overflowを従来どおり投影拒否する。

## 残存文字列の分類

| 文字列・定数 | 現在の位置づけ |
| --- | --- |
| `scorePropagation` | productionでは受理しない移行ガードと、旧実験・履歴資料・拒否テストにのみ残る。計算モードを選択する公開型・planner結果には存在しない。 |
| `scoreValueMode` | production sourceから撤去済み。旧実験結果と履歴資料にのみ残る。 |
| `published-bucket` | tooling、参照テスト、実験、履歴資料に限定したcompatibility語。productionの実行モードではない。 |
| `PUBLISHED_BUCKET_LENGTH = 1024` | `tooling/reference-data/PublishedBucketCompatibility.js`だけで使用する旧配列長。 |
| `PUBLISHED_OVERFLOW_INDEX = 1023` | 旧形式との比較・projectionを行う参照adapterの境界。productionの計算・表示境界ではない。 |
| `1022` | R25-K当時の比較・coverage境界。R25-L後のproductionには存在しない。 |

## 検証

R25-Kの実装後、productionと参照検証を分離した状態で次を確認した。

- `npm run verify:core`: passed
- `npm run verify:browser`: passed
- `npm run verify:reference`: passed
- Markdown lint、typecheck、`git diff --check`: passed
- production naming test: `src/`からpublished adapterのimport・定義を排除
- reference adapter tests: legacy input、support、exact/upper-bound projection、unsafe projectionを確認

これらはR25-Kのproduction変更を検証するが、参照資産をproduction bundleへ戻すものではない。R25-Lでは、旧1022/1023境界と固定配列長をproductionから撤去したうえで、同じ検証を最終HEADに対して再実行した。

## 次の判断

R25-Kの後は、R12のcore module decompositionを別作業として扱い、旧1022境界の再評価はR25-Lで完了した。歴史的fixtureと参照adapterは、productionの表示範囲や入力可能範囲とは独立に保持する。
