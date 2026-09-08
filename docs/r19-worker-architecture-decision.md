# R19 Worker Architecture Decision

## 結論

R19では現行のhybrid構成を維持する。候補Bの汎用Workerは実験として成立し、全10ケースで候補Aと同じ結果を返したが、現行構成で再現可能な阻害が確認できず、warm計算時間とsupersessionのキュー待ちを増やすため、production経路へ移行しない。

この判断はWorkerを使わないという意味ではない。混合ダメージロールを常駐Workerで実行する現在の境界を維持し、別のoperationをWorkerへ移す判断は、再現可能なmain-thread blockingが確認された時点で再評価する。

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

### 通常Chrome

| ケース | A warm中央値 (ms) | B warm中央値 (ms) | B worker compute中央値 (ms) | B clone等の往復差中央値 (ms) | A/B Long Task |
| --- | ---: | ---: | ---: | ---: | --- |
| Check ordinary | 0.8 | 0.7 | 0.6 | 0.1 | 0 / 0 |
| Attack ordinary | 1.1 | 1.4 | 1.3 | 0.1 | 0 / 0 |
| Attack kazanari | 0.8 | 14.3 | 14.2 | 0.1 | 0 / 0 |
| Attack large accepted | 0.6 | 9.8 | 9.8 | 0.1 | 0 / 0 |
| Total Damage (3 sources) | 0.0 | 0.1 | 0.1 | 0.0 | 0 / 0 |
| Backtrack 屍人 | 0.9 | 0.9 | 0.9 | 0.0 | 0 / 0 |

候補Bのcold Worker readyは387.8msだった。これはmodule Workerの起動と初回ロードを含む単一実行の値であり、warm計算の代表値ではない。候補Bの出力はAttackで約29KB、Checkで約19KBだったが、往復差の中央値は0.0〜0.1msだった。

rapid supersessionでは、候補Aのcaller Abortは1.4ms、直後の最新要求は1.2msで完了した。候補Bのcaller Abortは0.2msだったが、stale requestが同じWorkerを占有し、最新要求は14.6msのqueue delayを含む28.6msで完了した。stale underlying workは14.5msでsettleした。

### Chromium CPU 4x

| ケース | A warm中央値 (ms) | B warm中央値 (ms) | B worker compute中央値 (ms) | B clone等の往復差中央値 (ms) | A/B Long Task |
| --- | ---: | ---: | ---: | ---: | --- |
| Check ordinary | 3.9 | 0.8 | 0.7 | 0.1 | 0 / 0 |
| Attack ordinary | 5.2 | 1.6 | 1.2 | 0.3 | 0 / 0 |
| Attack kazanari | 4.5 | 14.4 | 14.1 | 0.2 | 0 / 0 |
| Attack large accepted | 3.3 | 10.2 | 9.8 | 0.2 | 0 / 0 |
| Total Damage (3 sources) | 0.5 | 0.2 | 0.2 | 0.1 | 0 / 0 |
| Backtrack 屍人 | 4.0 | 1.1 | 0.9 | 0.1 | 0 / 0 |

候補Bのcold Worker readyは26.4msだった。候補Aのheartbeat最大遅延はケース全体で17.1ms、候補Bは4.5ms以下だった。いずれも50ms以上のLong Taskは再現しなかった。候補Bのsupersessionはcaller Abort 0.5ms、queue delay 14.3ms、最新要求28.2ms、stale underlying settlement14.9msだった。

同じ環境でもcold起動値には揺らぎがある。したがって、起動値だけを理由にWorker方式を採用せず、warm latency、blocking、queue挙動と合わせて評価する。

## 判断

現行hybridで、受理可能な代表ケースに50ms以上のLong Taskは反復測定で現れなかった。CPU 4xでもheartbeat遅延の最大値は17.1msで、R19のblocking判定を満たさない。候補Bはmain threadの遅延を小さくできるが、`kazanari>0`のwarm計算は現行より約3〜18倍長く、単一Workerのrapid supersessionでは最新要求を約14ms待たせる。ResourceGuardの所有権をWorkerへ移す設計も別途必要になる。

したがって、複雑性とキュー待ちを増やしてまで全operationをWorkerへ移す利益は現時点で不足している。R19の決定は`KEEP CURRENT HYBRID`とし、production source、ResourceGuard ownership、既存RuntimeDamageRollClientの契約は変更しない。

## 採用しなかった案

- `GENERALIZED WORKER`: 結果parityは満たしたが、現行hybridを上回る再現可能なblocking改善がなく、DR warm latencyとsupersession queueを悪化させるため採用しない。
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
