# R19 Worker Architecture Experiment

このディレクトリは、現在のhybrid構成と計算全体を単一の永続Workerへ移した試作を同じブラウザ条件で比較するための実験である。R19ではproductionの実行経路を変更せず、計測結果とADRだけを成果物とする。

## 比較対象

| 候補 | 実行場所 | Damage Roll |
| --- | --- | --- |
| `hybrid` | main thread（planner、DX、Score、Damage orchestration、Total、Backtrack） | `RuntimeDamageRollWorker` |
| `generalized-worker` | ひとつの永続module Worker | 同じWorker内で`generateMixedDamageDistribution`を直接実行 |

候補Bはproduction Workerを入れ子にしない。両候補ともproductionのCalculationClientと計算コアを利用し、計算式を複製しない。presentationとChart.jsは両候補ともmain threadに残る。

## 実行方法

Node.js 22.23.2を使用し、リポジトリルートから次を実行する。

```powershell
npm run benchmark:r19:worker:short
```

通常条件ではChromiumとChromium CDP CPU 4xを測定する。反復回数を増やす場合は次を使う。

```powershell
npm run benchmark:r19:worker -- --iterations 3 --warmup 1
```

FirefoxとWebKitを利用できる環境で比較する場合は`--cross-engine`を追加する。ブラウザ実行ファイルがない場合はインストールせず、該当engineを`unavailable`として記録する。

## プロトコル

Workerへのrequestは次の形である。

```text
{ id, operation, args, options }
```

`operation`は`check`、`attack`、`totalDamage`、`backtrack`のいずれかである。Workerは計画通知を次の形で先に返し、完了時に`success`または`failure`を返す。

```text
{ id, type: "plan", plan }
{ id, type: "success", result, workerTiming }
{ id, type: "failure", error: { name, message, code?, plan?, rejectionReasons? } }
```

最初の試作ではrequestとresultを通常のstructured cloneで搬送する。呼び出し側のAbortは即座に呼び出し元へ`AbortError`を返すが、Worker内の同期計算は停止しない。underlying workのsettlementは別の計測値として扱い、キャンセル済みとは表現しない。

## 計測値

各operationについてcold、warm p50／p95／max、Worker内計算時間、main-thread heartbeat遅延、Long Task件数と最大時間、入力・出力payloadの概算、利用可能な場合の`performance.memory`を記録する。Long Task API非対応は0件ではなく未対応として扱う。

rapid supersessionでは重いrequestを開始して呼び出し側からAbortし、直後に同じ最新requestを送る。呼び出し側のAbort応答、最新requestのqueue待ち、最新request全体の遅延、stale requestのunderlying settlementを分離して記録する。

`result-digest.js`のdigestはcorrectness確認用であり、timed sectionの外で計算する。巨大なrun-by-run JSONはコミットせず、集計値と判断に必要な代表値だけを`docs/r19-worker-architecture-decision.md`へ転記する。

## R19の境界

この実験では`src/**`のproduction execution path、ResourceGuardの所有権、CalculationClientの公開API、既存RuntimeDamageRollClient、UI、Cloudflare構成を変更しない。Worker化を採択する場合も、実装は別タスクR19Bとして扱う。
