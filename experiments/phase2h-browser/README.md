# Phase 2-H browser benchmark

第12単位のローカル実測ページです。Nodeの[`scripts/benchmark-phase2h.mjs`](../../scripts/benchmark-phase2h.mjs)と同じ7 fixtureを、既存のplanner、legacy data API、canonical on-demand API、canonical aggregation、presentation、comparison APIで測定します。実験専用のページであり、production UI、Attack state、既存のlegacy/canonical API、JSON、入力上限は変更しません。

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

このページは計算coreとブラウザ固有のasset/event-loop診断を同じfixtureで突き合わせるためのものです。Nodeの値、Chromeの一回の値、timer delayだけからproductionの入力上限、canonical表示、dynamic output、JSON削除、Worker接続を決めません。まずChromeで確認し、その後Firefox/WebKit、低速実機または低速機相当の条件を検討します。production canonical Worker経路が未接続であることは、現時点の対象外として報告に明記しています。
