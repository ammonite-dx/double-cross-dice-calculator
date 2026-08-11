# 動的分布範囲 Phase 2-E ベンチマーク基盤

このディレクトリは、入力範囲、DXの尾部打ち切り、ダメージの有限support、作業分布、FFT長、表示範囲、計算時間、メモリ量を一体で評価する調査用基盤です。本番の計算コード、UI、配信JSONは変更せず、現行ケースと拡張候補ケースをNodeとブラウザで測定します。

## ファイル

- [`planner.mjs`](./planner.mjs)は、`score`、`check`、`attack`、`backtrack`の作業範囲、FFT長、概算資源量、warning、hard rejectを返す参照plannerです。
- [`benchmark.mjs`](./benchmark.mjs)は、Phase 2-Aから2-DまでのNodeベースラインです。既存の[`results.json`](./results.json)はその履歴として扱います。
- [`benchmark-phase2e.mjs`](./benchmark-phase2e.mjs)は、Phase 2-EのNodeケースを測定し、結果を標準出力へJSONで出します。ファイルへ結果を書き込みません。
- [`browser-benchmark.html`](./browser-benchmark.html)と[`browser-benchmark.js`](./browser-benchmark.js)は、同じケースをブラウザのmain threadとWorkerで測定するページです。Worker対象はDRとattackです。
- [`vite.config.mjs`](./vite.config.mjs)は、ブラウザベンチ専用の開発サーバーと専用buildを定義します。
- [`decision.md`](./decision.md)は、Phase 2-Eの実測値、入力上限の暫定判断、未完の検証を記録します。

## 前提

`.node-version`のNode `22.23.2`を選択してから実行してください。`node`が別のバージョンを指している場合は、fnmなどで`22.23.2`へ切り替えるか、同じNode実行ファイルで以下のコマンドを実行します。

## Nodeベンチマーク

```shell
node --version
node experiments/dynamic-distribution-ranges/benchmark-phase2e.mjs
```

Nodeベンチは2回のwarmup後に7回のwarm測定を行い、現行ケース、Worker対象の入力、plannerのみのケースを区別します。Nodeの時間はブラウザのWorker転送、イベントループ遅延、端末差を含まないベースラインです。

## ブラウザベンチマーク

専用Viteサーバーを起動します。

```shell
node node_modules/vite/bin/vite.js --config experiments/dynamic-distribution-ranges/vite.config.mjs --host 127.0.0.1 --port 3000
```

Chromeで<http://127.0.0.1:3000/experiments/dynamic-distribution-ranges/browser-benchmark.html>を開き、ページに表示されたJSONを確認します。ブラウザベンチは`browser: true`のケースだけを測定し、ページエラー、Long Task、数値異常、Resource Timingの利用可否も結果に含めます。`mainThreadTimerDelayApproxMilliseconds`は処理のCPU時間ではなく、処理中に登録したzero-delay timerが発火するまでの遅延近似です。Workerのcold測定はWorker生成と初回要求を含みます。

## buildの分離

通常buildと専用buildは別コマンドと出力先を使います。

```shell
npm run build
node node_modules/vite/bin/vite.js build --config experiments/dynamic-distribution-ranges/vite.config.mjs
```

通常buildの出力先は`dist/`で、ブラウザベンチページを含みません。専用buildの出力先は`dist-dynamic-distribution-ranges/`で、`.gitignore`によりGit追跡対象外です。ベンチ用エントリは通常アプリのimport graphへ接続していません。

## 結果の保存方針

Phase 2-EのNode結果は標準出力、ブラウザ結果はページ内JSONを正とし、実測JSONをリポジトリへ保存したりGit追跡したりしません。必要な再測定結果はローカルで一時保存し、コミットへ追加しないでください。既存の`results.json`は過去Phaseの追跡済み履歴であり、Phase 2-Eの新しい結果置き場ではありません。

## plannerテスト

```shell
node --test experiments/dynamic-distribution-ranges/planner.node-test.mjs
```

plannerテストはtail cutoffの境界と単調性、`critical=11`・`dice=0`、`exact-yousei`、有限DR support、FFT長、warning/hard境界、`published-bucket`と`full-tail`の差を対象にします。

## Dynamic distribution range Phase 2-F

2026-08-11にPlaywright `1.62.1`を`npm install --save-dev playwright`で追加し、`npx playwright install firefox webkit`でFirefox `153.0`（revision `v1538`）とWebKit `26.5`（revision `v2336`）を取得しました。指定Nodeは`C:\Users\SoraHirokane\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe`の`v22.23.2`です。取得コマンドのダウンロード表示はFirefox 119.9 MiB、WebKit 59.6 MiB、FFmpeg 1.3 MiB、Winldd 0.1 MiBで、取得後のcache directoryはFirefox 352,898,025 bytes、WebKit 177,304,497 bytes、Firefox/WebKit合計530,202,522 bytes（505.6 MiB）、補助toolを含めて533,978,424 bytes（509.2 MiB）でした。Playwright cacheには別途`chromium-1181`が存在しますが、今回のinstallコマンドはChromiumを指定しておらず、Chromiumの取得ログもありません。詳細は[Playwright browsers documentation](https://playwright.dev/docs/browsers)を参照してください。

[`playwright-runner.mjs`](./playwright-runner.mjs)は専用Viteを起動し、既存の`browser: true` 12ケースをFirefox、WebKit、Chrome channelの順に1エンジンずつ測定します。FirefoxとWebKitにはCPU throttlingを適用せず、ChromeだけにCDPの`Emulation.setCPUThrottlingRate`で4xを適用します。runnerは`--no-sandbox`を使用せず、Vite、browser、page、context、CDP throttling、一時profileを`finally`でcleanupし、結果JSONをファイルへ保存せず標準出力へ出します。エンジン単位の起動・ページ・ケース・数値検証エラーは結果へ明示し、全engineが成功しなければ非0終了します。

このデスクトップの通常Codex sandboxではFirefox/WebKitのbrowser child process起動が`spawn EPERM`になったため、実測はローカルbrowser child processの起動を許可した実行コンテキストで行いました。Playwrightのlaunch optionsとrunnerには`--no-sandbox`を指定していません。通常sandboxで同じ制限がある環境では、runnerはengine errorをJSONへ記録して非0終了します。

PowerShellでの再現コマンドは次のとおりです。

```powershell
$nodeDir = 'C:\Users\SoraHirokane\AppData\Roaming\fnm\node-versions\v22.23.2\installation'
$env:Path = "$nodeDir;$env:Path"
& "$nodeDir\node.exe" experiments/dynamic-distribution-ranges/playwright-runner.mjs
```

同じrunnerは`npm run benchmark:dynamic-distribution-ranges:browser`でも起動できますが、Node `v22.23.2`をPATHの先頭へ置いてください。runnerは標準出力のJSONにPlaywright version、engine/browser version、12件のcase count、main warm median/p95、Worker cold/warm、timer-delay、Long Task、page error、数値検証、Resource Timing診断、cleanup結果を含めます。p95は各engineで12ケースのmain-thread warm p95またはWorker warm round-trip p95の最大値で、各ケースのwarm sampleは7回です。

2026-08-11の同一実行では、Chrome channelはローカルChrome `151.0.7922.108`を使用しました。代表値は次のとおりです。

| engine | CPU条件 | 12ケース | main warm median最大 / p95最大 | Worker cold最大 / warm p95最大 | timer-delay warm p95最大 | Long Task | page error / 数値異常 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Firefox `153.0` | throttlingなし | 12/12成功 | 34 / 40 ms | 56 / 36 ms | 40 ms | APIなし | 0 / 0 |
| WebKit `26.5` | throttlingなし | 12/12成功 | 15 / 24 ms | 38 / 19 ms | 24 ms | APIなし | 0 / 0 |
| Chrome `151.0.7922.108` | CDP 4x | 12/12成功 | 129.5 / 132.8 ms | 74.8 / 31.5 ms | 134.2 ms | 50（最大154 ms） | 0 / 0 |

FirefoxとWebKitではLong Task APIが利用できず、Long Task 0は「観測なし」ではなく「APIなし」として扱います。ChromeではLong Task APIが利用可能で50件を観測しました。ChromeのWorker resource timingはduration unavailableが4件、timing anomalyは0件でした。全engineでケースエラー、page error、数値検証エラーは0件でした。

`mainThreadTimerDelayApproxMilliseconds`はCPU時間ではなく、計算中に登録したzero-delay timerの発火遅延近似です。Chrome 4xはrendererのCPUスケジューリングだけを変える測定条件であり、メモリ容量、GPU、OS scheduler、ネットワーク、Firefox/WebKitの実装差、実機モバイル性能を再現しないため、低速モバイルの性能下限とは解釈しません。

入力拡張候補のうち現行core capで実測不能な`dx-two-x-planner-only`、`dx-large-planner-only`、`dx-hard-reject-planner-only`、`dr-over-core-cap`、`attack-two-x-planner-only`はplanner-onlyとして維持し、core capを解除しません。`backtrack-large-normal-node-only`はNode-onlyでブラウザ測定対象外のケースであり、core cap理由のplanner-onlyとは区別します。Phase 2-Fでも本番`src`、UI入力上限、配信JSON、full-tail、dynamic output、resource guard、JSON経路は変更していないため、今回の3 engine実測だけで入力上限を拡張する判断はしません。
