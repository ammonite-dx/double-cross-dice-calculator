# R27-B2c2: Typed RuntimeDamageRollClient

## 目的

R27-B2c1で型付けした`ResourceGuard`とproductionのWorker境界をつなぐRuntime Damage Roll clientを、既存のキュー、Abort、cache、transferの意味論を変えずにstrict TypeScriptへ移行した。Worker本体は今回の対象外とし、production clientのライフサイクルテストを正本として整理した。

## 実装

- `src/runtime/RuntimeDamageRollClient.js`を`src/runtime/RuntimeDamageRollClient.ts`へ移行し、`createRuntimeDamageRollClient()`の公開exportと`calculate()`、`clearCache()`、`dispose()`の返却shapeを維持した。旧`.js`は残していない。
- `RuntimeDamageRollJob`、`RuntimeDamageRollSubscriber`、`RuntimeDamageRollCacheEntry`、`RuntimeDamageRollWorkerToken`、job statusを内部型として定義し、normalized worker optionsを必須フィールドの`RuntimeDamageRollOptions`として扱った。
- public weights型をruntime validatorの受理範囲に合わせ、`readonly number[]`と`Float64Array`だけを許可した。`Uint8Array`、`Float32Array`、任意のArrayLikeは型契約から除外し、runtime validation自体は変更していない。
- caller側の`signal`、`requestId`、`requestMetadata`と、Workerへ送る`fftLength`、`distributionLength`、`rawSupportMax`を分離した。caller metadataはWorker messageにもcache identityにも含めない。
- 1 active + FIFO queued、activeとqueued双方のpending dedup、caller weightsのsnapshot、`job.weights.slice()`によるtransfer、subscriber単位Abort、最後のsubscriber離脱時のWorker terminate、Worker tokenによるstale event suppression、resident Worker、fatal Worker error、job-level error、LRU cache、defensive copy、disposeの既存挙動を維持した。
- `RuntimeDamageRollWorkerLike`をブラウザの`Worker`とtest doubleの双方へ代入可能な形へ調整した。default Worker URLは`RuntimeDamageRollWorker.js`のままである。
- 実験用clientを参照する重複`tests/runtimeDamageRollClient.test.js`を削除し、production clientを直接検証する`tests/runtimeDamageRollProductionClient.test.js`を正本とした。queued dedupとFFT長をcache identityへ含める回帰を追加した。
- `RuntimeDamageRollProtocol.ts`の説明を、clientがTypeScript、WorkerがJavaScriptである現状に更新した。`checkJs:false`、ResourceGuardの所有権、数値検証、Worker protocolのwire shapeは変更していない。

## 回帰テストと型検査

- production suiteで1 active + FIFO、queued dedup、subscriber abort、active last-subscriber abort、queued abort、stale event、Worker再生成、LRU、variable output shape、rawSupportMaxとFFT長のcache identity、fatal/job-level error、dispose、CalculationClient/ResourceGuard integrationを検証した。
- `tests/typecheck/runtime-contracts.ts`へ、factory return、accepted weights、rejected typed arrays、caller options、Worker wireからのsignal除外、browser `Worker`と`RuntimeDamageRollWorkerLike`の互換性を追加した。

## 非対象

`RuntimeDamageRollWorker.js`、`RuntimeDamageRollCalculator.js`、`RuntimeDamageRollLimits.js`、FFT kernel、DamageCalculator、CalculationClientのresource orchestration、ResourceGuard policy、range planner、damage formula、numerical tolerance、WorkerのTypeScript化は変更していない。

## 検証

`npm run verify:core`はNode version check、Vitest 103 files / 1094 tests、typecheck、ESLint、Markdown lint（89 files / 0 issues）、build（459 modules）、`git diff --check`を含めて成功した。`npm run verify:browser`のproduction browser smokeはCheck、Attack、Backtrack、表示範囲拒否・復帰、precomputed request 0を確認して成功した。`npm run verify:reference`は32 assets、reference 7 files / 53 tests、generator 18 tests、simulation 13 tests、Ruff、runtime DX 20,000 casesをすべて成功させた。`npm run benchmark:full-tail-attack`も成功し、result digestは`989000341.161962`、全ケースの実行errorは`-`だった。

## 次の作業

R27-B2c3では、production runtimeの残る型付き境界として`CheckRangePolicy`を検討する。Runtime Damage Roll Worker本体のTypeScript化は別sliceとして扱う。
