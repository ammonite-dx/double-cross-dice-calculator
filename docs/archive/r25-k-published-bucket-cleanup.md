# R25-K published-bucket cleanup

## 結論

R25-Kでは、productionの計算経路から`published-bucket`を選択する実行モードを撤去した。productionのScore、Damage、Attack planning、CalculationClientはcanonical full-tailを正本とし、旧1024要素配列への投影を行わない。

旧形式そのものは削除していない。過去JSON、比較テスト、再現性確認で必要なadapterを`tooling/reference-data/PublishedBucketCompatibility.js`へ移し、productionの`src/`から参照されない境界として保持する。

## 実装単位

- `9b9997b` — production planner、Damage、CalculationClientから`scorePropagation`と`scoreValueMode`を撤去し、canonical full-tailだけを受理する。Damageの上側tailは`DistributionResult`のsupportとoverflowへ保持する。
- `990d3b8` — 1024バケットの入出力adapterを`tooling/reference-data/PublishedBucketCompatibility.js`へ移し、canonical `DistributionResult`から旧形式への逆流を防ぐ。参照テストはこのmoduleを明示的にimportする。

## 保持したもの

### production境界

- `PUBLISHED_OVERFLOW_INDEX = 1023`は、旧形式との比較と`calculationMax=1022`の既定値を定義する境界として残した。
- `calculationMax=1022`は今回の範囲では変更していない。これは入力上限や表示上限ではなく、既存比較と資源計画のcompatibility floorである。別タスクで実測に基づき再評価する。
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
| `PUBLISHED_OVERFLOW_INDEX = 1023` | productionの既定`calculationMax=1022`とCheck/Attackのlegacy floorの根拠、および参照adapterの境界。 |
| `1022` | 既定のcalculationMaxと比較・coverage境界。入力・表示のsemantic capではない。 |

## 検証

R25-Kの実装後に次を実行した。

- `npm test`: 103 files / 1051 tests passed
- `npm run lint`: passed
- `npm run typecheck`: passed
- `git diff --check`: passed
- production naming test: `src/`からpublished adapterのimport・定義を排除
- reference adapter tests: legacy input、support、exact/upper-bound projection、unsafe projectionを確認

最終release前には、`npm run verify:core`、`npm run verify:browser`、`npm run verify:reference`、可能なら`npm run verify:all`を最終HEADで実行する。これらはR25-Kのproduction変更を検証するが、参照資産をproduction bundleへ戻すものではない。

## 次の判断

R25-Kの後は、R12のcore module decompositionと、実測に基づく`calculationMax=1022`の再評価を別作業として扱う。1022境界を変更するときも、canonicalの表示範囲や入力可能範囲を同時に狭めない。
