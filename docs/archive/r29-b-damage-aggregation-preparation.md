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

## 検証実績

- 通常Vitest: 88 files / 1023 tests
- Typecheck: 成功
- ESLint: 成功
- Markdown lint: 成功
- Production build: 成功
- Production browser smoke: 成功
- Reference Vitest: 7 files / 53 tests
- Generator tests: 18 tests
- Generator simulation: 13 tests
- Runtime DX verification: 20,000 cases
- Damage precision audit: 成功（15 records、bounded 14件、exact 1件、stable rounded 14件）
- `git diff --check`: 成功
- 作業ツリー: clean

R29-Bのコミット:

- `2fcc65a4608ec211017fb50c13efe3203356cbfd` `refactor: separate damage aggregation preparation`
- `71bcb2bd37cbcee4212ea833ef3ff6c37c7c0c04` `refactor: use prepared aggregation in calculation client`
- `41ef591bb5b4abd3c6e14c6de844a1b1db99802e` `docs: record R29-B preparation convergence`
- `5e37ca3ecdc13442859ef665ada63f41ad671a23` `test: repair damage precision audit entrypoint`
- `579ea69c21024fa2ab08ddffc414a30187bb0bf4` `test: cover prepared aggregation execution contract`

R29-Cのpresentation整理は本作業に含めない。
