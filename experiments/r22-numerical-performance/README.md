# R22 数値性能ベースライン

このディレクトリは、現行のproduction計算モジュールについて、ブラウザ上でユーザー体験に影響する数値計算の負荷を測定するための実験です。R22-Aではproduction code、UI、Chart.js、表示範囲、ResourceGuard、Worker境界、確率の意味論を変更せず、最適化候補の有無を測定結果だけで判断します。

## 実行方法

リポジトリルートからNode.js 22.23.2で実行します。

```powershell
npm run benchmark:r22:numerical:node
npm run benchmark:r22:numerical:browser
```

短縮確認は次のコマンドです。

```powershell
npm run benchmark:r22:numerical:browser:short
```

通常のブラウザ測定はChromeとChrome CPU 4xを各3回実行し、`--iterations`と`--warmup`で各ページ内の反復回数を変更できます。FirefoxとWebKitが利用可能な環境では`npm run benchmark:r22:numerical:browser:cross-engine`で追加測定できます。未導入のブラウザは`unavailable`として記録し、インストールを自動では行いません。

## 測定対象

受入済みのproduction workloadとして、通常／低クリティカル値／《絶対支配》／《妖精の手》のDX、通常／末尾負荷／《妖精の手》のCheck、通常／《風鳴りの爪》／固定回避値／大きめ入力のAttack、通常／《屍人》／高入力のBacktrack、D10の3・12・99・197・272個、FFTの実測長相当と探索用の長さ、統計・範囲計画、実際のAttack結果を合成したTotal Damageの2・4・8要素を測ります。特殊効果のstress fixtureは、あらかじめ定義した候補をRangePlannerへ上から渡し、最初に受け入れられた入力を使います。実測時間を見て候補を選び直しません。

Node測定はproductionモジュールの同期処理を局所化する診断用です。ブラウザ測定では同じ計算を、Workerを起動済みにした状態で、連続入力を表す`steady-state`と、計算ごとにキャッシュを消去する`cache-miss`に分けます。Workerの起動時間は`workerStartupMs`として別に記録し、計算の経過時間には混ぜません。

各fixtureについて初回計測、p50・p95・最大値、同期依存のtrace、Worker待機、メインスレッドheartbeat、対応ブラウザでのLong Task、メモリ取得値、結果digest、RangePlannerの推定値を保存します。traceは呼び出し元を含むinclusive timingなので、依存関係の値を単純に加算して総時間とは解釈しません。

## 結果と判断

測定結果はこのディレクトリの`results/`に保存します。生成されたJSONには絶対パスを含めません。R22のtriggerは、Chrome通常条件の同期main-thread span p95が16.7ms以上、Chrome CPU 4xの同期span p95が50ms以上、または50ms以上のLong Taskが、同一条件3回中2回以上で確認された場合です。Attackの壁時計時間だけが閾値を超えた場合は、Worker待機を含み得るためtriggerにしません。

triggerが見つからなければ、結果を`docs/r22-measured-numerical-performance.md`へ転記してR22を`CLOSED / GREEN — NO CHANGE`として閉じます。triggerが見つかった場合は、証拠を記録して`OPTIMIZATION REVIEW REQUIRED`で停止し、別の実装判断を行います。Nodeの結果だけでproduction最適化を採用しません。

ベンチマークが起動したViteやブラウザはrunnerの`finally`で停止します。途中で中断した場合は、不要なVite／Nodeプロセスが残っていないことを確認してから再実行してください。
