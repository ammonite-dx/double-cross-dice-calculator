# R22 — 数値計算の測定と性能レビュー

## 目的

R22では、理論上の最適化余地だけを理由にproductionの計算実装を変更しない。現行の受理可能な入力で、ユーザー体験に影響するmain threadの数値計算hotspotが実際に存在するかを測定する。

hotspotが確認できなければ、R22は`CLOSED / GREEN — NO CHANGE`として終了する。再現可能なhotspotが確認できた場合は、`MEASUREMENT COMPLETE / OPTIMIZATION REVIEW REQUIRED`として停止し、production最適化は別の設計レビューへ送る。

## 開始点と変更範囲

R22の開始点は、R21の最終commit `cb79c9c39f878094c77ca10699bd6a25a9bbb530`である。測定ハーネスの実測開始時点は`4ce9aa1`で、サンプル間のイベントループ分離を含む最終ハーネスは`4ce9aa1`を基準に実行した。測定結果を記録するまでは、production source、test、UI、公開asset、generator、reference-data、Worker境界、resource policyを変更しない。

実験はproductionの計算moduleを直接利用し、計算式の複製や数値意味論の変更を行わない。実験用のbrowser harnessは計算結果だけを扱い、Vue、Chart.js、presentation、`src/features/**`をimportしない。

## 固定する判断基準

測定では、次の原則を適用する。

- measurement before optimization
- production-accepted workload first
- browser evidenceをNode microbenchmarkより優先する
- cache stateをcache-missとsteady-stateに分けて明示する
- Worker waitはmain-thread blockingと区別する
- 50ms以上のLong Taskはarchitecture signalとして扱う
- 16.7msは60Hz frameの参考値であり、正しさの閾値ではない
- Node microbenchmark単独ではproduction optimizationを正当化しない

同期処理のoptimization review triggerは、Chrome通常速度でp95が16.7ms以上、またはChrome CPU 4xでp95が50ms以上となり、同一条件を3回測ったうち2回以上で再現した場合とする。計算中に50ms以上のLong Taskが同じ条件で再現した場合もtriggerとする。Attack全体のwall timeはDamage Roll Workerの待機を含み得るため、main-thread trace、heartbeat、Long Taskを伴わないwall timeだけではtriggerにしない。

候補をproduction最適化へ進める場合は、別レビューで次の追加条件を満たす必要がある。

- trigger caseでp95が20%以上改善する
- 通常の受理可能な入力で有意な性能退行がない
- 新しいLong Taskを導入しない
- 既存の数値許容誤差内で結果が一致する
- 許容誤差を緩和しない
- memory/resource safetyを悪化させない

性能差の非回帰判定では、同一条件でp95が5%を超えて悪化した場合を退行候補とする。ただしsub-millisecondの差は絶対値も併記し、比率だけで判断しない。`RangePolicy`のwarning 50ms、hard 200ms等のcost modelはR22で変更しない。

## 測定モード

### cache-miss

アルゴリズムの初回コストを見るため、原則としてsampleごとにfresh `CalculationClient`、fresh DX cache、fresh D10 providerを用意する。Damage RollではWorkerの起動とready待機をtimed sectionの外に置き、ready後にcacheを消去して計算だけを測る。

### steady-state

通常の連続操作を模擬するため、同じclientを使ってwarmup後のsampleを測る。production cacheを有効にしたまま計測し、初回のWorker startupは別metricとして記録する。

## 対象とfixture

最低限、次の数値処理を測定対象とする。

- DXの`shihai=0`、`shihai>0`、`yousei>0`、Score、statistics
- 通常のD10生成とFFT convolution
- Damageのplanning、pre/post processing、Total Damage aggregation
- Backtrackとrange planning

fixtureはproduction plannerが受理するものを先に決定し、測定時間を見て選び直さない。ShihaiとYouseiのstress候補は事前に順序を定義し、最初に受理されたcaseをprimary fixtureとする。Total Damageは実際のproduction Attackから得たDamage envelopeを使い、component数2、4、8を基本とする。plannerがrejectするcaseは`REJECTED — not measured`と記録する。

browserではChrome通常速度とCPU 4xを同じfixture・同じmeasurement modeで測定する。FirefoxとWebKitは利用可能な場合だけ実施し、未導入なら`unavailable`と記録してR22のclosure条件にはしない。

## 計時とtrace

各fixtureについて、`firstMeasuredMs`、p50、p95、max、Long Task件数と最大時間、heartbeat最大遅延、result digest、range plan estimateを記録する。traceはexperiment-local instrumentationで行い、production sourceへtiming hookを追加しない。

trace recordは`name`、`kind: sync | async`、`elapsedMs`を持つ。nestedなdependency timingはinclusiveであるため、親子の時間を単純合計しない。`getDamageRollDistribution`のWorker waitはasyncとして別計上し、main-thread primitiveのhotspot attributionから分離する。

計時は`start → operation → stop → digest`の順で行い、digest計算をoperation latencyへ含めない。trace有無でdeterministic result digestが一致することを確認し、instrumentationが挙動を変えていないことを検査する。

## 結果スキーマと再現性

machine-readable resultは、少なくとも次の項目を持つ。

```text
schemaVersion
startSha
environment
criteria
fixtures
node
browser
plannerEstimateComparison
triggerEvaluation
candidateRanking
decision
```

environmentにはOS、CPU、Node、Chrome、`hardwareConcurrency`、取得可能なら`deviceMemory`、CPU throttle、timestamp、commit SHAを含める。結果へWindowsのユーザーディレクトリなど絶対ローカルパスは保存しない。

## R22-Aの実測結果

Node.js `v22.23.2`、Windows x64、16 logical CPUsの環境で、Node診断、Chrome通常、Chrome CPU 4xを実行した。ブラウザは各条件を3 full runs、各fixtureをwarmup 2回と計測11回（初回計測を含む）で測定し、各サンプルの間にイベントループ境界を置いた。これにより、連続したmicrotaskの実行時間を1回のユーザー操作のLong Taskへ誤って合算しないようにした。

27個の受入fixtureすべてがproduction plannerで受理され、steady-stateとcache-missの結果digestは全fixtureで一致した。FirefoxとWebKitは今回の既定測定には含めず、追加インストールも行っていない。

| 条件 | 同期main-thread span p95の最大 | wall p95の最大 | Long Task | Worker起動時間 | trigger |
| --- | ---: | ---: | ---: | ---: | --- |
| Chrome通常 | 9.0 ms | 15.6 ms | 0件 | 9.3–15.8 ms | なし |
| Chrome CPU 4x | 41.7 ms | 41.7 ms | 0件 | 38.5–41.6 ms | なし |

Chrome通常では16.7ms、CPU 4xでは50msという同期span基準を超えず、Long Taskも観測されなかった。Attackのwall timeにはWorker待機が含まれ得るが、今回のworker waitは同期main-thread triggerとは分離して扱った。3回中2回以上というrepeatability条件を満たすtriggerはなく、ブラウザ結果のdecisionは`no-repeatable-trigger-observed`である。

Nodeのdiagnostic結果でもtrigger候補はなく、steady-stateのfixture p95最大は13.741ms、cache-missの最大は18.192msだった。Node値はproduction変更の根拠にはせず、ブラウザtraceで確認した候補の局所化にのみ用いた。

既存の数値健全性確認として、`npm run benchmark:full-tail-attack`は15件のruntime DRと9件のAttackをエラーなく完走し、`npm run test:runtime-dr:full`は2,030分布を比較して最大差`5.976927000342358e-7`、reference実装の全件検証も成功した。

機械可読な実測値は[`baseline-node.json`](../experiments/r22-numerical-performance/results/baseline-node.json)、[`baseline-chrome.json`](../experiments/r22-numerical-performance/results/baseline-chrome.json)、[`baseline-chrome-cpu-4x.json`](../experiments/r22-numerical-performance/results/baseline-chrome-cpu-4x.json)に保存した。JSONには絶対パスを含めず、fixtureの入力、計画、timing、trace、digest、repeatabilityを記録している。

## R22の停止条件

全production-accepted fixtureでrepeatableなoptimization triggerが0件なら、結果と根拠をこの文書へ追記し、`R22 CLOSED / GREEN — NO CHANGE`とする。`docs/todo.md`にはR22完了と次のR23を記録する。

triggerが1件以上ある場合は、fixture、mode、p50/p95、Long Task、heartbeat、dependency trace、planner estimate、候補順位を追記し、`R22 MEASUREMENT COMPLETE / OPTIMIZATION REVIEW REQUIRED`として停止する。この場合、`src/calculation/**`、`src/core/probability/**`、`src/runtime/**`は変更しない。

どちらの場合も最終HEADで`npm run verify:release`を実行し、GREENを確認した後に検証結果だけを追記するcommitは作成しない。最終HEADそのものに対するgate結果を実装役の報告として残す。

## 進捗

R22-Aの測定ハーネス、Node診断、Chrome通常／CPU 4xの3回測定、既存full-tail／runtime-dr検証を完了した。同期main-thread spanとLong Taskにrepeatableなtriggerはなく、結果digestも一致したため、`R22 CLOSED / GREEN — NO CHANGE`とする。productionの計算意味論、UI、Worker構成、公開schema、reference-dataは変更していない。次はR23のユーザー監督UI／UXレビューである。
