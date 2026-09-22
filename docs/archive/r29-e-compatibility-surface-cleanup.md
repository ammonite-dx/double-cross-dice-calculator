# R29-E: Compatibility surface cleanup

## 目的

R29-D完了時点でproductionの正本になっていたAPIへ、残存していた移行期の互換入口を収束させた。数値計算、結果のsupport・overflow semantics、resource threshold、UI表示、latest-wins、Abort、Worker protocolは変更していない。

## 対象と基準

基準HEADは`11a1fbff44c3e874d09d4711f2b63d62ce9874ce`（R29-Dのpresentation error provenance follow-up）である。R29-Eのproduction cleanupは`c79291e`で完了し、reference repositoryが使うsparse helperを保持するfollow-upを`f6a4bd9`で追加した。

## 削除・収束したsurface

- CheckとBacktrackの計算runnerを`CalculationRequestCoordinator`へ直接接続し、移行用runnerと関連する`LatestCalculation*`型を削除した。loading、range plan、latest-wins、Abort、error、disposeのfeedback lifecycleは維持した。
- Attackのcaller-supplied generation、score displayの旧request fields、公開`preserveResult`、独自state generationを削除し、revisionとpresentation保持の意図をrunner内部へ閉じ込めた。
- `ResourceGuard`は`capacityBytes`、`acquireForPlan()`、`snapshot()`を正本とし、移行期aliasを削除した。`acquire()`と`acquireLease()`の意味上の差は維持した。
- `DisplayRangePlanner`は`planDisplayRange(display, { displayWindow, policy })`を正本とし、直接window・第三引数policy・policy内`limits` alias・未使用facadeを削除した。
- Range policyのroot・nested schemaをallowlistで検証し、未知fieldをgeneric errorでfail-closedにした。旧field名専用の拒否分岐は残していない。
- `DistributionResult`は`DISTRIBUTION_RESULT_TOLERANCE`、`copyDistributionValues()`、`getProbabilityMassSummary()`とobject-form factoryへ収束した。presentation typeも`DistributionResult`／`DistributionEnvelope`を直接参照する。
- Attack display sideの重複`projection`／`series` surfaceから`projection`だけを残した。
- DX providerを入力オブジェクトとoptionsの2引数形式へ統一し、`DxDistribution`を`Float64Array`へ収束させた。Scoreのsparse expansion fallbackを削除した一方、歴史的reference repositoryが使う`expandSparseDistribution` helperは保持した。
- Backtrack calculatorを`calculateFinalEncroachment(params, runtimeOptions, backtrackRangePlan)`へ統一し、未使用dependency引数と第三引数planの互換判定を削除した。

## 意図的に残したもの

`tooling/reference-data/PublishedBucketCompatibility.js`、reference assets、historical archive、experiment directoryは、production APIの互換負債ではなく過去形式との比較と再生成検証に使うため保持した。固定値の`DistributionResult`がoffset付きの疎な点分布を使う契約も、DX providerのsparse fallbackとは別物なので維持した。`runInitialCalculation`、ResourceGuardの意味上異なる取得メソッド、Check chartのpercentage変換、`checkJs: false`、大規模なTypeScript移行も今回の対象外である。

## 現行の計算・表示境界

feature runnerはcoordinatorで最新要求を管理し、`CalculationClient`はsnapshot、range preflight、ResourceGuard lease、計算core呼び出しを行う。DX providerは`{ shihai, dice, critical, yousei }`と`{ workingLength, fftLength }`を受け取り、Scoreはdenseな`Float64Array`を消費する。表示は`presentDistribution`、`planDisplayRange`、`projectDistribution`、Chart.js materializerの順に進み、互換bucket投影はreference境界に限られる。

## 検証

最終HEAD`f6a4bd9`で次を実行し、すべて成功した。

- Vitest: 88 files / 1025 tests
- `npm run typecheck`
- `npm run lint`
- `npm run lint:markdown`（101 files / 0 issues）
- `npm run build`（457 modules）
- `npm run diff:check`
- `npm run verify:release`
- production browser smoke（Check、Attack、Backtrack、動的表示範囲、resource rejection、stale result、browser diagnostics）

検証後の作業ツリーはcleanである。reference assetのproduction取得は0件で、数値・resource・lifecycle semanticsに変更がないことを回帰テストとbrowser smokeで確認した。

## コミット

- `b97ec35` docs: finalize R29-D verification record
- `8bd5c42` refactor: remove latest calculation runner compatibility
- `a90b769` refactor: remove attack lifecycle compatibility fields
- `8997b36` refactor: converge resource and display planner APIs
- `598da12` refactor: remove retired policy compatibility handling
- `2e3abeb` refactor: remove distribution compatibility aliases
- `68af3a2` refactor: remove attack presentation series alias
- `d9c81e3` refactor: make DX providers object-shaped
- `09c48cd` refactor: simplify backtrack calculator contract
- `c79291e` refactor: keep policy validation boundary lightweight

## 次の作業

次はR29-F（production TypeScript convergence）であり、R29-Eでは着手しない。
