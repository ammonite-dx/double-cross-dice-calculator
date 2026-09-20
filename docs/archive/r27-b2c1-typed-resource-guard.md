# R27-B2c1: Typed ResourceGuard runtime

## 目的

R27-B2bで型付けした`CalculationClient`が利用するresource boundaryを、既存の実行順序と資源予約の意味論を変えずにstrict TypeScriptへ移行した。対象は`ResourceGuard`実装と、そのpolicy、request、lease、snapshotの公開契約である。

## 実装

- `src/runtime/ResourceGuard.js`を`src/runtime/ResourceGuard.ts`へ移行し、`ResourceGuardTypes.ts`の`ResourceGuard`契約をclass実装へ接続した。旧`.js`は残していない。
- policy inputとnormalized policyを分離し、`capacityBytes`と歴史的alias`capacity`、partial policy、既定値（64 MiB、maxActive 4、maxQueued 32、reservationMultiplier 1.5）を維持した。
- native`AbortSignal`と最小のAbortSignal-like objectを受け付ける型を追加した。requestの`operation`未指定・`null`、`requestId`未指定・`null`、`estimateAvailable === false`、直接estimate優先の正規化順序を維持した。
- `ResourceGuardError`と`ResourceGuardAbortError`のerror shape、structural type predicate、plan metadata抽出、reservationのceil・multiplier・oversize判定を型付けした。
- `acquire()`は即時admitでも常にPromiseを返し、`acquireLease()`、`acquireForPlan()`、`acquirePlan()`は即時admit時の同期leaseとqueued時のPromiseを維持した。invalid acquire requestはrejected Promise、invalid constructor policyは同期throwのままである。
- FIFO admission、maxActiveとcapacityの同時制約、queued abortとlistener cleanup、active leaseのsignal abort後も明示releaseまで保持するownership、idempotent release、lease metadata snapshot、snapshot/getSnapshot/diagnosticsのコピー semanticsを変更していない。
- runtimeからVue、feature、UI、Nodeへの依存は追加していない。`checkJs:false`は維持した。

## 回帰テスト

- `tests/resourceGuard.test.js`へ、即時`acquire()`のPromise契約とinvalid`acquireLease()`のrejected Promise契約を追加した。
- `tests/typecheck/runtime-contracts.ts`へ、factory/class契約、partial policy、`capacity` alias、未知policy keyの拒否、native/fake signal、acquire return type、structural error predicateの型回帰を追加した。
- architecture testとR22 benchmarkの明示`.js`参照を`.ts`へ更新した。

## 非対象

Runtime Damage Roll Client、Worker protocol、CheckRangePolicy、CalculationClientのresource orchestration、計算式、UI、resource policyの数値は変更していない。

## 検証

対象テスト、TypeScript typecheck、ESLintは成功した。全体の`verify:all`、browser smoke、reference/generator/simulation、Ruff、runtime DX検証は最終コミット前に実行する。

## 次の作業

R27-B2c2では、production`RuntimeDamageRollClient.js`を直接検証する回帰テストを先に整備し、Worker protocol、Abort、cache、resource leaseの境界を固定してからTypeScript化する。
