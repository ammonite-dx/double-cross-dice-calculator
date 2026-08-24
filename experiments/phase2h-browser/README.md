# Phase 2-H browser benchmark

第13単位の低速相当ブラウザ実測runnerと、第12単位のローカル実測ページです。Nodeの[`scripts/benchmark-phase2h.mjs`](../../scripts/benchmark-phase2h.mjs)と同じ7 fixtureを、既存のplanner、legacy data API、canonical on-demand API、canonical aggregation、presentation、comparison APIで測定します。実験専用のページであり、production UI、Attack state、既存のlegacy/canonical API、JSON、入力上限は変更しません。

## 実行

リポジトリルートで次を実行し、表示されたURLをブラウザで開きます。

```shell
npm run benchmark:phase2h:browser -- --host 127.0.0.1
```

ページURL:

```text
http://127.0.0.1:3000/experiments/phase2h-browser/browser-benchmark.html
```

既定値はwarm 3回、warmup 1回です。短い確認には次を使えます。

```text
http://127.0.0.1:3000/experiments/phase2h-browser/browser-benchmark.html?iterations=1&warmup=0
```

`iterations`は正の整数、`warmup`は0以上の整数で、ページ側に安全上限があります。上限を超える値や不正な値はエラーとして公開されます。ページが`Benchmark complete`相当の状態になったら、コンソールで次を読むか、画面のJSONを保存します。

```js
window.__phase2hBrowserBenchmarkResult
window.__phase2hBrowserBenchmarkError
```

実際のブラウザ起動、操作、Playwright実行はこのREADMEのnpm scriptには含めていません。親タスクがブラウザで確認し、終了後にViteを停止します。

## Firefox/WebKitとChrome 4xの自動実測

Playwright管理のFirefox、WebKit、Chrome channelを同じページで順次実測する場合は、次を実行します。Chrome channelにはCDPの`Emulation.setCPUThrottlingRate`をrate 4で適用します。結果は標準出力へJSONとして出し、ファイルへ保存しません。

```shell
npm run benchmark:phase2h:browser:playwright
```

短い確認には次を使えます。

```shell
npm run benchmark:phase2h:browser:playwright:short
```

`--iterations N`と`--warmup N`を直接渡すCLI転送も維持しています。

```shell
npm run benchmark:phase2h:browser:playwright -- --iterations 1 --warmup 0
```

通常Chrome channelの比較は、既存の親タスク実測との重複を避けるため既定では省略します。明示的に追加する場合は次を使います。

```shell
npm run benchmark:phase2h:browser:playwright -- --include-chrome --iterations 1 --warmup 0
```

標準実行ではreportの`metadata.omittedEngines`に通常Chromeの省略理由を残します。`--include-chrome`を指定したreportでは通常Chromeも`engines`に含まれます。Firefox/WebKitまたはChrome channelが実行環境にない場合、runnerは不足engineをインストールせず、そのengineのエラーをJSONへ記録して終了します。

```shell
npx playwright install firefox webkit
```

このrunnerはFirefox/WebKitのengine差と、Chrome channelの低速相当条件を確認するための実験用で、Chromeの親タスク実測や既存のPhase 2-F runnerとは別に動作します。CDPのCPU throttleはrendererのスケジューリングを遅くするエミュレーション倍率であり、実CPU時間、低速端末のCPU・メモリ、電池・熱特性を再現するものではありません。測定値だけを根拠にproductionのWorker接続、JSON削除、入力上限、canonical表示を変更しません。

## canonical Attack batch / Worker経路の実測（Phase 2-H 第14単位）

既存の`browser-benchmark.html`は`calculateCanonicalDamageOnDemand`を直接呼ぶcore比較ページであり、production `CalculationClient`のAttack batch経路やRuntime Workerを測りません。これらを確認する場合は、同じVite serverで次のページを開きます。

```shell
npm run benchmark:phase2h:browser:canonical-attack -- --host 127.0.0.1
```

ページURL:

```text
http://127.0.0.1:3000/experiments/phase2h-browser/canonical-attack-worker-benchmark.html
```

短い確認には`?iterations=1&warmup=0`を付けます。ページは既存7 fixtureの同じ入力を使い、5件を`calculationClient.calculateAttackCanonicalBatch`、warning境界を`planAttackCombo`、reject境界をpublic batchのpreflight rejectとして測定します。成功batchの処理にはscore生成、D10 asset読込、防御畳み込み、既存`RuntimeDamageRollClient`経由のDR Worker、canonical total aggregationが含まれます。結果は次で取得できます。

```js
window.__phase2hCanonicalAttackWorkerBenchmarkResult
window.__phase2hCanonicalAttackWorkerBenchmarkError
```

ページは既存Workerを置き換えず、native `Worker`を薄くラップして生成数、postMessage/message、transfer bytes、error/messageerror、terminateを記録します。`fetch`のラップではdata assetの呼出し回数とresource timingを記録します。cancelは実際の`AbortSignal`を`CalculationClient`の同期`onRangePlan`通知で発火させ、preflight後かつWorker実行前の境界で1件測定します。staleは既存`AttackCanonicalRunner`を2連続起動して診断します。Workerを意図的に壊すsynthetic error probeは行わず、自然発生したerrorだけを記録します。`Attack.vue`の`canonicalOptIn`は既定`false`のため、このページはproduction UIではなく明示的な実験consumerです。

標準条件（In-app Chrome、Chromium 151.0.0.0、Windows、`iterations=3`、`warmup=1`）の実測では、7 casesはmeasured 5、planner-only 1、planner-rejected 1、error 0でした。canonical Attack batchのwarm invocation median最大は`combo-total-3`の2.4 ms、cold最大は40.9 ms、小規模caseのcoldは25.3 msでした。Workerは1 instance、8 postMessage/8 message、transfer 8回・12,992 bytes、error/messageerror 0、terminate 0、D10 asset fetchは1回（status 200、encodedBodySize 373,168 bytes、fetch 3.7 ms、resource 1.8 ms）でした。cancelは`abortSent=true`で`AbortError`、staleは`firstCommit=false`、`secondCommit=true`、`runnerErrors=0`、pageErrors/unhandledRejectionsは0件だった。短縮条件（`?iterations=1&warmup=0`）も成功した。数値は単一ブラウザ・単一実行条件の参考値です。

この実測で確認したWorker接続は既存のDR部分のみです。score/DXなどの判定計算、preflight、D10、固定値差、防御畳み込み、failure合成、canonical envelope/total aggregationはmain threadに残るため、このページの結果だけでWorker protocol追加やcanonical UI切替を行いません。

## canonical Attack batchのFirefox/WebKit/Chrome 4x自動実測（Phase 2-H 第15単位）

第14単位のcanonical Attackページを第13単位のPlaywright実測基盤で測る場合は、既存core直呼び出しrunnerを壊さない明示的なtarget分岐を使います。core runnerの既定targetは従来どおり`browser-benchmark.html`で、canonical targetだけが`canonical-attack-worker-benchmark.html`と専用の結果globalを読みます。

標準条件（ページ既定の`iterations=3`、`warmup=1`）は次です。

```shell
npm run benchmark:phase2h:browser:playwright:canonical-attack
```

短縮条件とCLI overrideは次です。

```shell
npm run benchmark:phase2h:browser:playwright:canonical-attack:short
npm run benchmark:phase2h:browser:playwright:canonical-attack -- --iterations 3 --warmup 1
```

runnerはFirefox、WebKit、Chrome channel CPU 4xを順次起動し、`--include-chrome`指定時だけ通常Chrome channelも追加します。専用Viteの空きport、temporary profile、engine/CDP/page/context/Viteをcleanupし、結果は標準出力JSONだけへ出して結果ファイルを保存しません。`metadata.target`、`metadata.benchmarkPath`、`metadata.engines`、`metadata.omittedEngines`で対象を識別できます。

canonical reportは、`status=measured`、7 fixture id/count（measured 5、planner-only 1、planner-rejected 1、error 0）、pageErrors/unhandledRejections 0、`production-runtime-observed` Worker、Worker error/messageerror 0、preflight boundary cancelの`status=measured`かつ`AbortError`、staleの`firstCommit=false`/`secondCommit=true`、D10 asset fetchのstatus 200をrunner側で検証します。cancel probeの`completed-before-abort`は許容しません。各engineのJSONにはcanonical case timing summaryと、Worker生成/postMessage/message/transfer/error counters、D10 fetch summaryを残します。

親タスクの昇格実行（`npm run --silent benchmark:phase2h:browser:playwright:canonical-attack -- --iterations 3 --warmup 1`、`resultsPersisted=false`）で、修正後の3 engine実測が完了しました。Firefox 153.0はwarm invocation median最大3 ms、cold最大52 ms、WebKit 26.5はwarm最大2 ms、cold最大40 ms、Chrome channel 151.0.7922.138（CPU throttle 4x）はwarm最大7.4 ms、cold最大110.4 msでした。各engineでWorkerは1 instance、7 postMessage/7 message、transfer 7回・11,368 bytes、worker error 0・messageErrors 0でした。

全engineで7 case（measured 5、planner-only 1、planner-rejected 1、error 0）、case IDs、pageErrors/unhandledRejections 0、D10 status 200、cancelの`status=measured`/`AbortError`/`abortBoundary=onRangePlan-preflight`、staleの`firstCommit=false`/`secondCommit=true`を検証し、cleanupも成功しました。ChromeはCDP throttle resetを含めてcleanup成功です。これは標準条件の単一実行であり、CPU throttleは実CPU・低速端末のCPU/メモリを再現しません。Worker接続は既存DR部分だけで、score/DX等はmain threadに残るため、実測だけで新しいWorker protocolやcanonical UI切替を決めません。

## 測定範囲

アセットはcase実測のwarmup前に、必要な`dx`、`dr`、`d10`のfetch、JSON parse、公開repositoryへのregistrationを独立stageでcold/warm測定します。アセットのresource entryは`data/schema-v2/revision-1/`以下のdata pathだけへ縮約して報告します。ブラウザのresource timingはcache hitとネットワーク取得を常に同じ粒度で表せるとは限らないため、resource entry countとページ側fetch call countを分けて記録します。

full caseでは次のstageを分けます。

- `range-planner`（preflight）
- legacy `getDamage`
- 準備済みlegacy combo結果への`getTotalDamage`
- canonical `calculateCanonicalDamageOnDemand`
- `sumCanonicalDamage`
- `createAttackCanonicalPresentation`
- legacy/canonical comparison

各stageは、既存APIを呼ぶメインスレッドinvocation elapsedと、同じ区間でキューへ入れたzero-delay timerの遅延を分けて記録します。timer delayはイベントループのスケジューリング遅延の観測値であり、CPU時間そのものではありません。`longtask` PerformanceObserverが使えないブラウザでは`supported: false`、count/entriesは`null`です。これはLong Task 0件とは異なります。

上限近辺のcaseは重い計算を既定実行せず`planner-only`、明示hard limitのcaseは`planner-rejected`です。現在のcanonical Attack stateは`RuntimeDamageRollWorker`へ接続されていないため、Workerは作成せず、reportにも`not-connected`と記録します。Workerの起動・転送・往復時間を推測で埋めません。

## Report shape

トップレベルには次を含みます。

- `schemaVersion`、`generatedAt`、`browser.userAgent`、`viewport`
- `caseCounts`と7件の`cases`
- `assetSetup`、`assets.resourceEntries`、`assets.resourceFetchCount`、`assets.dataPathCounts`、`assets.fetchCallCount`
- `worker.status: "not-connected"`
- `pageErrors`、`unhandledRejections`、`diagnostics.longTasks`
- `resultSink`
- `metadata.cpuThrottling`、`metadata.omittedEngines`

各caseは`measured`、`planner-only`、`planner-rejected`、`error`のstatusを持ちます。測定stageの`cold`/`warm`には、次のnearest-rank統計が入ります。

```json
{
  "invocationElapsedMs": {
    "sampleCount": 3,
    "minMs": 0,
    "medianMs": 0,
    "p95Ms": 0,
    "maxMs": 0
  },
  "queuedZeroDelayTimerDelayMs": {
    "sampleCount": 3,
    "minMs": 0,
    "medianMs": 0,
    "p95Ms": 0,
    "maxMs": 0
  }
}
```

stageには`longTasks`、`numericDigest`、制約、最後の結果の配列要約も含まれます。comparisonはcaseの`comparison.status`と、可能な場合のdamage/totalごとの元API結果要約で、`comparable`または`not-comparable`を保持します。canonical totalに安全に投影できないoverflowが関与する場合、計算が成功しても比較は`not-comparable`になり得ます。

## 解釈と対象外

このページは計算coreとブラウザ固有のasset/event-loop診断を同じfixtureで突き合わせるためのものです。Nodeの値、Chromeの一回の値、CPU throttle後の値、timer delayだけからproductionの入力上限、canonical表示、dynamic output、JSON削除、Worker接続を決めません。CDP throttleは実CPU時間ではなく低速相当の補助条件なので、低速実機・メモリ制約・Worker経路などは別途確認が必要です。production canonical Worker経路が未接続であることは、現時点の対象外として報告に明記しています。

## full-tail Attack resource measurement (Phase 2-H Task 6)

Task 6の専用targetは既存canonical Attack targetを変更せず、`full-tail-attack-resource-benchmark.html`と`__phase2hFullTailAttackBrowserResourceResult`を使う。短縮実測は次で実行し、結果はstdoutとページglobalだけに出してファイルへ保存しない。

```shell
npm run benchmark:phase2h:browser:playwright:full-tail-attack:short
```

このtargetはChrome desktopとChrome channel CPU 4xを既定で測定する。Attack matrixはactual `plan.damage.maxDamageDice`が202/400/600になる各`kazanari=0/1/9`の9ケースに、`yousei=9`と`shihai=19`のstress 2ケースを加えた11ケースである。各caseは`CalculationClient.planAttackCombo(params)`のproduction default plannerと、thresholdだけを広げた明示benchmark policyのplannerを分け、後者がacceptedな場合だけ`calculateAttackCanonicalBatch`を通常のScore→Damage→total経路で実行する。

reportはproduction/benchmarkのaccepted/status/rejection理由、estimate time/memory、planner cold/warm timing、Attack end-to-end cold/warm timing、RuntimeDamageRollClient→RuntimeDamageRollWorkerのrequest→response timing、Worker counters、D10/data fetch、Long Task、`performance.memory`のbefore/after、cancel/staleを保持する。`performance.memory`は対応時だけ記録し、before/after usedJSHeapSizeを正確なpeak allocationとは扱わない。Long Task非対応時は`supported=false`、count/entries=`null`であり、0件とは扱わない。

短縮条件のChrome実測ではdesktop/CPU 4xとも11 casesがbenchmark measured、production planner rejectは3件（600D・kazanari=9、yousei=9、shihai=19）で理由は`estimated-time`、Workerは各1 instance・13 postMessage/13 message・transfer 42,192 bytes・error/messageerror 0、D10 fetch 1件、cancel/staleともmeasuredだった。warm end-to-end最大はdesktop 25.4 ms、CPU 4x 116.3 ms、Worker response最大はdesktop 265.1 ms、CPU 4x 286.8 msで、Long Taskはdesktop 0件、CPU 4x 2件、`performance.memory`は両engineで利用可能だった。これは短縮・単一環境の観測値であり、CPU 4xは低速実機を再現しない。

benchmark policyは`scorePropagation: full-tail`とRangePlannerのwarning/hard thresholdsだけを変更し、calculationMax、display、costModel、runtime absolute caps、production thresholdは変更しない。Task 5では、今回の観測だけでhard thresholdを引き上げず、現行のproduction warning/hard threshold（推定時間50/200 ms）を当面維持する暫定判断とした。低速実機、Firefox/WebKit、実際のUI描画を含む再評価は別環境で行う。既存core/canonical-attack target、Vite/Playwright cleanup契約は維持する。
