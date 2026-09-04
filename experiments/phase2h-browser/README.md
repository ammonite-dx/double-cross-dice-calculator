# Phase 2-H browser benchmarks

このディレクトリには、canonical計算経路のブラウザ実測だけを置きます。旧1024バケット比較を目的としたcoreベンチマークはPhase 8-2G8で終了し、過去の測定結果はGit履歴とロードマップへ残しています。

## ベンチマーク

- `canonical-attack-worker-benchmark.html`は、`CalculationClient.calculateAttackBatch`、既存のRuntime Damage Roll Worker、total aggregationを測定します。
- `full-tail-attack-resource-benchmark.html`は、full-tail計画の入力範囲、推定資源量、Worker転送、メモリ、キャンセル、stale commitを測定します。
- `playwright-runner.mjs`は、AttackをFirefox、WebKit、Chrome channel CPU 4xで実測します。full-tail targetはChrome desktopとCPU 4xだけを対象にします。

## 実行

canonical Attackページを起動するには、リポジトリルートで次を実行します。

```shell
npm run benchmark:phase2h:browser:canonical-attack -- --host 127.0.0.1
```

表示されたURLは次です。

```text
http://127.0.0.1:3000/experiments/phase2h-browser/canonical-attack-worker-benchmark.html
```

短い確認ではURLに`?iterations=1&warmup=0`を付けます。結果は`window.__phase2hCanonicalAttackWorkerBenchmarkResult`、エラーは`window.__phase2hCanonicalAttackWorkerBenchmarkError`で取得できます。

Playwrightでcanonical Attackを実測するには、次を実行します。

```shell
npm run benchmark:phase2h:browser:playwright:canonical-attack
npm run benchmark:phase2h:browser:playwright:canonical-attack:short
```

通常Chrome channelを追加する場合は`--include-chrome`を指定します。Firefox/WebKitの実行ファイルがない場合、runnerはインストールを行わず、該当engineのエラーをレポートして終了します。

```shell
npm run benchmark:phase2h:browser:playwright:canonical-attack -- --include-chrome --iterations 1 --warmup 0
```

full-tail resource benchmarkは次で実行します。

```shell
npm run benchmark:phase2h:browser:playwright:full-tail-attack:short
```

## 測定上の注意

この実験はproduction UIの見た目や入力上限を変更しません。CPU 4xはrendererのスケジューリングを遅くする補助条件であり、低速端末のCPU、メモリ、GPU、電池、熱特性を再現しません。単一環境の測定値だけを根拠にresource policyやWorker protocolを変更しないでください。

ページはWorker、D10 asset fetch、Long Task、`performance.memory`、AbortSignal、latest-winsの診断を可能な範囲で記録します。Long Task APIやメモリAPIがない場合は未対応として記録し、0件とは解釈しません。結果は標準出力とページglobalを正とし、測定JSONをリポジトリへ保存しません。

Vite、browser、page、context、CDP throttling、一時profileはrunnerの`finally`でcleanupします。手動で起動したViteを終了する場合は、測定完了後にプロセスを停止して待受ポートを解放してください。
