# R19 Worker Architecture Decision

## 結論

R19の初回評価では現行のhybrid構成を維持する判断を置いた。候補Bの汎用Workerは実験として成立し、全10ケースで候補Aと同じ結果を返したが、初回のwarm latency比較にはcache asymmetryがあり、Worker境界だけの差として確定できなかったため、cache-neutral follow-upで最終判定を補正する。

この判断はWorkerを使わないという意味ではない。混合ダメージロールを常駐Workerで実行する現在の境界を維持し、別のoperationをWorkerへ移す判断は、再現可能なmain-thread blockingが確認された時点で再評価する。なお、初回測定のAttack warm値は、cacheを持つproduction hybridとcacheを持たないgeneralized prototypeの比較であり、Worker境界だけの差として解釈しない。

## 対象と比較方法

候補AはproductionのCalculationClientをそのまま使う現行hybridである。範囲計画、DX／Score、Damage orchestration、Total Damage、Backtrackはmain threadで実行し、混合ダメージロールだけを`RuntimeDamageRollWorker`へ渡す。

候補Bは実験専用の永続module Workerであり、`check`、`attack`、`totalDamage`、`backtrack`を同じWorkerへ送る。Worker内ではproduction calculation moduleを使い、混合ダメージロールは`generateMixedDamageDistribution`を同じWorkerで直接呼び出す。production Workerを入れ子にせず、計算式も複製していない。

比較は通常のstructured cloneで行った。digestによる結果比較は計測区間の外で実行し、転送最適化はclone overheadが判断を左右しないため追加していない。

## 計測環境と実行条件

| 項目 | 内容 |
| --- | --- |
| OS | Windows（`platform: Win32`） |
| Node.js | 22.23.2 |
| Browser | インストール済みChrome channel、HeadlessChrome 152.0.0.0 |
| hardwareConcurrency | 16 |
| Long Task API | 対応 |
| 反復 | warmup 1、計測3 |
| CPU条件 | 通常、Chromium CDP CPU throttling 4x |
| frame budget参考値 | 16.7ms |
| blocking判定 | 50ms以上のLong Taskを明確なblocking signalとする |

再現コマンドは次のとおりである。

```powershell
node experiments/r19-worker-architecture/playwright-runner.mjs --iterations 3 --warmup 1 --engines chrome
node experiments/r19-worker-architecture/playwright-runner.mjs --iterations 3 --warmup 1 --engines chrome-cpu-4x
```

Playwright同梱Chromiumの実行ファイルは環境に存在しなかったため、既存のPhase 2-Hと同じChrome channel方式で測定した。FirefoxとWebKitは`spawn EPERM`で利用できず、インストールしていない。cross-engine短縮実行ではこの2 engineを`unavailable`として記録し、Chromeの結果は成功した。

## 正しさとプロトコル

Check 3件、Attack 4件、Total Damage 1件、Backtrack 2件の10フィクスチャを使用した。通常、低クリティカル値、`妖精の手`、`風鳴りの爪`、固定回避、受理可能な大規模Attack、3 sourceのTotal Damage、通常および`屍人`のBacktrackを含む。

候補Bは各要求について`plan`を先に通知し、完了時に`success`または`failure`を返す。テストではplan順序、request id、成功・失敗のシリアライズ、Worker再生成、caller Abortとunderlying settlementの分離、digest parityを確認した。候補Aと候補Bのdigestは10件すべて一致し、ページエラーとconsole errorは0件だった。

## 計測結果

### 初回steady-state（cache-enabled hybrid vs uncached generalized）

初回測定のAttack warm値は、production hybrid側だけがDamage Roll cacheとpending dedupを持つ状態で、generalized Worker側はcacheなしだった。同一入力の反復によりhybridがcache hitになりやすいため、以下はproductionのsteady-state観測として残すが、Worker境界だけの比較には使わない。

| ケース | A warm中央値 (ms) | B warm中央値 (ms) | B worker compute中央値 (ms) | B clone等の往復差中央値 (ms) | A/B Long Task |
| --- | ---: | ---: | ---: | ---: | --- |
| Check ordinary | 0.8 | 0.7 | 0.6 | 0.1 | 0 / 0 |
| Attack ordinary | 1.1 | 1.4 | 1.3 | 0.1 | 0 / 0 |
| Attack kazanari | 0.8 | 14.3 | 14.2 | 0.1 | 0 / 0 |
| Attack large accepted | 0.6 | 9.8 | 9.8 | 0.1 | 0 / 0 |
| Total Damage (3 sources) | 0.0 | 0.1 | 0.1 | 0.0 | 0 / 0 |
| Backtrack 屍人 | 0.9 | 0.9 | 0.9 | 0.0 | 0 / 0 |

候補BのWorker readyは387.8msだった。これはmodule Workerの起動と初回ロードを含む単一実行の値であり、`firstMeasured`やwarm計算の代表値ではない。候補Bの出力はAttackで約29KB、Checkで約19KBだったが、往復差の中央値は0.0〜0.1msだった。

rapid supersessionでは、候補Aのcaller Abortは1.4ms、直後の最新要求は1.2msで完了した。候補Bのcaller Abortは0.2msだったが、stale requestが同じWorkerを占有し、最新要求は14.6msのqueue delayを含む28.6msで完了した。stale underlying workは14.5msでsettleした。

### 初回steady-state（Chromium CPU 4x）

| ケース | A warm中央値 (ms) | B warm中央値 (ms) | B worker compute中央値 (ms) | B clone等の往復差中央値 (ms) | A/B Long Task |
| --- | ---: | ---: | ---: | ---: | --- |
| Check ordinary | 3.9 | 0.8 | 0.7 | 0.1 | 0 / 0 |
| Attack ordinary | 5.2 | 1.6 | 1.2 | 0.3 | 0 / 0 |
| Attack kazanari | 4.5 | 14.4 | 14.1 | 0.2 | 0 / 0 |
| Attack large accepted | 3.3 | 10.2 | 9.8 | 0.2 | 0 / 0 |
| Total Damage (3 sources) | 0.5 | 0.2 | 0.2 | 0.1 | 0 / 0 |
| Backtrack 屍人 | 4.0 | 1.1 | 0.9 | 0.1 | 0 / 0 |

候補BのWorker readyは26.4msだった。候補Aのheartbeat最大遅延はケース全体で17.1ms、候補Bは4.5ms以下だった。いずれも50ms以上のLong Taskは再現しなかった。候補Bのsupersessionはcaller Abort 0.5ms、queue delay 14.3ms、最新要求28.2ms、stale underlying settlement14.9msだった。

同じ環境でもWorker起動値には揺らぎがある。したがって、起動値だけを理由にWorker方式を採用せず、warm latency、blocking、queue挙動と合わせて評価する。

## 判断

初回steady-stateでは、現行hybridで受理可能な代表ケースに50ms以上のLong Taskは反復測定で現れなかった。CPU 4xでもheartbeat遅延の最大値は17.1msで、R19のblocking判定を満たさない。候補Bの`kazanari>0` warm値が現行より長かったことと、単一Workerのrapid supersessionで最新要求を約14ms待たせたことは観測事実だが、cache asymmetryを含むためWorker境界の差としては断定できなかった。これはfollow-up前の暫定評価であり、ResourceGuardの所有権をWorkerへ移す設計も別途必要になる。

初回評価では、複雑性とキュー待ちを増やしてまで全operationをWorkerへ移す利益は不足していると考えた。ここで比較した`kazanari>0`のwarm latency差はcache asymmetryを含む観測値であり、Worker境界そのものの遅延とは断定できなかったため、最終判断はcache-neutral follow-up後に確定することにした。

## 採用しなかった案

- `GENERALIZED WORKER`: 結果parityは満たしたが、初回steady-stateのwarm差はcache asymmetryを含んでいた。補正後も現行hybridを上回る再現可能なblocking改善や明確なUX改善は確認できなかったため採用しない。
- `PARTIAL WORKER`: 今回は候補の実装・比較を行っていない。将来、特定operationでblockingが再現した場合に、対象を限定した別R19Bとして設計する。
- Worker terminate／recreate、Worker pool、協調的キャンセル、SharedArrayBufferは、今回の判断に必要なblockingがなかったため試作しない。
- structured cloneのtransfer variantは、今回のpayloadで往復差が小さく、判断を変える見込みがないため追加しない。

## 再評価条件

次のいずれかが再現した場合にWorker境界を再評価する。

- 受理可能なproductionケースで50ms以上のLong Taskが複数回確認される。
- CPU 4xや実機計測で、入力変更時のheartbeat遅延が継続的にframe budgetを超える。
- 現行RuntimeDamageRollWorkerでは扱えない新しい重いoperationが追加される。
- generalizedまたはpartial Workerで、supersession queueとResourceGuard ownershipを明確に解決できる実装案が得られる。

R19の実験ファイルは将来の再測定用に残す。production移行が必要になった場合は、別タスクR19Bでprotocol、ResourceGuard、latest-wins、Worker failureを改めて設計してから実装する。

## Cache-neutral follow-up

初回測定では、hybrid側の`RuntimeDamageRollClient`にLRU cacheがあり、generalized Worker側は`generateMixedDamageDistribution`をcacheなしで実行していた。また、supersessionで同一Attack入力を再利用したため、cache hitとpending dedupの影響も分離できていなかった。初回の正しさ・Long Task観測は有効なものとして残し、Attack latencyの帰属と同一入力supersessionの解釈だけを補正した。

補正プロトコルは測定前の`4a9b64f`で固定した。50msはLong Task APIで一般に用いられるblocking境界としてarchitecture上の明確なsignalに使い、16.7msは60Hzの1 frameに相当する参考値とした。KEEP条件は、current production hybridにWorker拡張を正当化する再現可能なblockingがなく、補正後のcache-miss測定でもgeneralized Workerによる明確なUX改善が確認できないことである。

測定モードは、productionの反復入力を表す`steady-state`と、Damage Roll cacheの効果を除外する`damage-roll-cache-miss`に分けた。steady-stateの値は実ユーザーの再実行時の挙動として残すが、Worker境界だけの比較には使わない。cache-missモードでは、実験専用に生成したhybrid clientのDamage Roll cacheを各timed sampleの直前にclearし、clear処理自体は計測区間へ含めなかった。generalized Workerには新しいproduction同等cacheを実装していない。

「cold」という名称は、warmup後の最初の計測を意味していたため`firstMeasured`へ改めた。Worker constructorからreadyまでの起動時間は、計算の`firstMeasured`とは別のstartup metricとして扱う。各operationではcache-missのp50／p95／max、Worker内計算時間、structured clone往復差、payload、heartbeat、Long Taskを記録した。

supersessionはcacheとpending dedupを混ぜないよう、各シナリオをfresh clientから開始し、cacheをclearしたうえで異なる入力を使った。重い`Attack A → caller Abort → 異なるAttack B`と、`重いAttack A → caller Abort → Check B`をhybridとgeneralized Workerで比較し、caller Abort、stale underlying settlement、latest queue delay、latest計算時間、latest総遅延、Long Task、heartbeatを分離した。

補正後のcache-miss Attack結果（p50／p95／max、ms）は次のとおりである。

| ブラウザ条件・ケース | hybrid | generalized Worker | generalized compute p50／p95 | clone等往復差 p50／p95 | heartbeat最大（hybrid／generalized） | Long Task（hybrid／generalized） |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chrome・ordinary | 1.2／1.3／1.3 | 1.4／1.6／1.6 | 1.3／2.0 | 0.1／0.2 | —／0.0 | 0／0 |
| Chrome・kazanari | 13.8／13.9／13.9 | 14.0／14.1／14.1 | 13.9／14.1 | 0.0／0.2 | 0.5／0.4 | 0／0 |
| Chrome・large accepted | 9.7／9.8／9.8 | 9.8／9.8／9.8 | 9.6／9.8 | 0.1／0.2 | 0.0／0.1 | 0／0 |
| Chromium CPU 4x・ordinary | 3.6／4.2／4.2 | 1.4／1.9／1.9 | 1.3／2.2 | 0.1／0.5 | 4.1／0.4 | 0／0 |
| Chromium CPU 4x・kazanari | 16.5／16.8／16.8 | 14.5／14.8／14.8 | 13.8／14.3 | 0.2／0.4 | 0.3／4.3 | 0／0 |
| Chromium CPU 4x・large accepted | 12.0／12.0／12.0 | 10.0／10.2／10.2 | 9.8／10.2 | 0.2／0.5 | 3.8／0.1 | 0／0 |

補正後のsupersession結果（caller abort／stale underlying settlement／latest queue／latest total、ms）は次のとおりである。hybridのqueueは別Damage Roll Workerへ渡るため、単一generalized Workerのqueue待ちとは同じ意味の値を持たない。

| ブラウザ条件・シナリオ | hybrid | generalized Worker |
| --- | ---: | ---: |
| Chrome・Attack A → Attack B | 1.2／22.7／—／35.9 | 0.1／22.7／22.7／37.7 |
| Chrome・Attack A → Check B | 0.9／21.9／—／0.8 | 0.0／23.3／23.3／24.6 |
| Chromium CPU 4x・Attack A → Attack B | 4.8／31.5／—／46.5 | 0.2／24.2／24.0／40.0 |
| Chromium CPU 4x・Attack A → Check B | 4.3／28.5／—／4.1 | 0.1／23.5／23.0／24.3 |

補正測定では、Chrome通常条件とChromium CPU 4xの両方で、10フィクスチャのsteady-stateおよびcache-miss parityが10／10となり、latest Attackとlatest Checkのdigestもhybridとgeneralized Workerで一致した。caller Abortは即時に返し、underlying stale workは完了まで継続することを確認した。各supersessionシナリオはfresh client、clear済みcache、異なる入力で開始したため、pending dedupとprewarmed cacheの混入はない。

generalized Workerのready時間はsteady-state測定でChrome 356.9ms、Chromium CPU 4x 26.7ms、cache-miss測定でそれぞれ20.7ms、21.6msだった。同じ環境でも起動時間には揺らぎがあるため、startupだけで方式を決めない。FirefoxとWebKitは既知の`spawn EPERM`で利用できず、追加インストールはしていない。

補正結果をゼロベースで再判定しても、受理可能なproductionケースで50ms以上のLong Taskは再現せず、heartbeat最大値も16.7msを継続的に超えなかった。CPU 4xではgeneralized Workerが一部のmain-thread時間を減らしたが、`Attack → Check`では単一Workerのstale queueにより最新Checkが約23ms待たされる。cache-missのAttack計算時間は両方式で近く、generalized Workerの明確なUX改善は確認できなかった。

したがって補正後の最終判断も`KEEP CURRENT HYBRID`とする。productionの計算経路、ResourceGuard ownership、既存RuntimeDamageRollClientは変更しない。R19は`CLOSED / GREEN`とし、次はR20 Graph-first UI / Rendering Redesignへ進む。Worker境界の再評価は、再現可能な50ms以上のLong Task、継続的なframe budget超過、または現行境界で扱えない新しい重いoperationが現れた場合にR19Bとして行う。
