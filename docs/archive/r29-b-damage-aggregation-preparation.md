# R29-B: Damage aggregation preparation and execution

## 目的

Damage aggregationのresource計画とFFT実行の境界を、公開される構造的な計画と、内部snapshotを保持する実行closureへ整理する。

## 変更内容

- `DamageAggregationPlanStore`とWeakMapによるplan identity registryを削除した。
- `planDamageAggregation`を`prepareDamageAggregation`へ変更し、凍結された`plan`と`execute`を持つ`PreparedDamageAggregation`を返すようにした。
- `PreparedDamageAggregation`の実行closureは、検査済み係数列、内部計画、準備時の既定AbortSignal・FFT長通知を保持する。入力envelopeや呼び出し元の配列を後から変更しても、準備済みの計算結果は変わらない。
- 実行時に上書きできるのはAbortSignalとFFT長通知だけとし、resource limitやplanの再受け渡しは拒否する。
- `sumDamage`はprepareとexecuteを連続して行うone-shot APIに限定し、旧`{ plan }`形式と第三引数を削除した。
- `CalculationClient`のTotal Damage経路をsnapshot→prepare→ResourceGuard→executeへ変更した。
- facadeを`DamageAggregation.ts`へ移行し、型契約、architecture test、反復実行、入力変更分離、client依存注入のテストを更新した。

## 実行モデル

`prepareDamageAggregation`は畳み込みを実行せず、配列長・FFT長・CPU work・メモリを計画する。ResourceGuardは返された`prepared.plan`だけを使ってadmissionを判断し、lease取得後に`prepared.execute()`を呼び出す。これにより、計画と実行の間で入力が変化しても、ResourceGuardが承認した内容と実際の計算内容が一致する。

`sumDamage`は計画を公開せず、その場でprepareとexecuteを行う。実行時の計算オプションに`maxFftLength`などを渡す設計は採用せず、resource制約は準備時に確定する。AbortやFFT長通知のような実行中の制御だけを`execute`へ渡せる。

## 検証

`npm run typecheck`、Damage aggregation・CalculationClient・ResourceGuard・architectureのfocused tests、通常のVitest suite、lint、Markdown lint、buildを実行する。R29-Cのpresentation整理は本作業に含めない。
