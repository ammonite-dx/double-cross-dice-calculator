# R28-F: Repository cleanup closure audit

## Baseline

R28-Fは`8f82a82053fb7290af3f9c19af88a21dcb66c147`を基準に実施した。R28-AからR28-E2までのproduction整理を横断監査し、dead residueだけを閉じた。公開準備とresource policy調整には着手していない。

## Closed gates

- R28-A: mechanical repository cleanup
- R28-B1: ESLint / architecture enforcement cleanup
- R28-B2: historical experiment isolation
- R28-C: thin UI structure / naming cleanup
- R28-D: display-form style ownership
- R28-E1: CalculationFeedback presentation separation
- R28-E2: Backtrack chart presentation cleanup
- R28-F: repository cleanup closure audit

## R28-Fで変更したもの

- CIのscope判定から、存在しない`public/data/*`の特別扱いを削除した。`package.json`、workflow、Vitest設定などの既存triggerは維持した。
- `tests/corePlanningArchitecture.test.js`から、存在しない`src/application`を含むdead scanを削除し、runtime sourceだけを検査する形へ整理した。
- `eslint.config.js`のshared presentation contract allowlistから、存在しない`BacktrackResultTypes`例外を削除した。実在するresult contractの許可は維持した。

## 意図的に保持したもの

- `wrangler.toml`: Cloudflare Pagesのdeployment semanticsに関わるため、公開準備で再判断する。
- `src/views/Home.vue`:複数の説明・ニュース・利用例パネルを組み立てる実質的なpage compositionである。
- `src/shared/presentation/index.js`:共有presentation surfaceとして現行テストと利用箇所がある。
- historical experiment directory names:履歴と再現性のため保持する。
- `allowJs`／`checkJs:false`:既定の段階的型移行方針を維持する。
- `src/runtime/RuntimeDamageRollWorker.js`:Worker本体は意図的にJavaScriptとして残している。
- `tooling/reference-data/assets/`:参照・検証用資産であり、production bundleには含めない。

## 確認した境界

- production sourceからreference toolingへの依存、published-bucketと旧固定上限の参照はない。
- retired naming、Backtrackの旧state／旧chart API、runtime内の`formatRangeFeedback`は現行production sourceに残っていない。`calculationMax`はactiveな計画・表示経路では使用せず、旧入力を明示的に拒否する既存guardだけを保持した。
- runtime・calculation・feature model・UI・shared presentationの依存方向を既存guardで維持した。
- normal、reference、historical experimentのVitest suiteは分離されたままである。
- production buildにreference assetを含めず、browser smokeのprecomputed requestは0件である。

## 検証

- `npm run verify:all`が成功した。通常Vitestは88 files／1016 tests、production browser smokeはPASS、production buildは457 modulesを変換した。
- reference gateは32 assetsの検証、reference Vitest 7 files／53 tests、generator通常18 tests、simulation 13 tests、ruff、runtime DX 20,000 casesを成功させた。runtime DXの最大絶対差は`8.999999999999999e-7`、許容誤差は`0.000001000001`、non-finite／negative countは0だった。
- `npm run test:experiments`は11 files／65 testsが成功した。historical suiteはrelease gateへ戻していない。
- production browser smokeではCheck／Attack／Backtrackのprecomputed requestsが0件、Backtrackは3 canvases、console warnings/errors 0、same-origin HTTP errors 0だった。
- production build後の`dist/`にschema-v2、livingdead、shihai、kazanari、reference-dataに該当するassetはなく、`src/`内のsame-basename collisionもなかった。
- `npm run typecheck`、`npm run lint`、`npm run lint:markdown`（97 files／0 issues）、`git diff --check`が成功した。

## コミット

- R28-F code/config/test cleanup: `21102f2` `chore: close R28 repository cleanup`
- R28-F archive/TODO: docs-only closure commit `docs: record R28 closure audit`

## 次の作業

R28-FでR28を`CLOSED`とし、次は公開準備、その後に実測に基づくresource policy調整へ進む。Cloudflare Worker／API／MCPと教科書の《支配の領域》章は保留を維持する。
