# R23 UI review capture

このreview-only toolingは、現行production UIをproduct ownerが確認するためのbaseline screenshotを取得する。UI componentを複製したprototypeや、pixel-perfectなgolden screenshot testは作成しない。

## 実行

repository rootでproduction buildを作成してから、次を実行する。

```powershell
npm run build
npm run review:r23:ui
```

runnerは`dist/`をVite previewで配信し、production routeを実際に操作する。PlaywrightのChromeを使用し、desktop `1280×900`とmobile `390×844`のviewportを使う。FirefoxやWebKitの追加インストールは必要ない。

特定のscenarioだけを確認する場合は、IDをカンマ区切りで指定する。

```powershell
node experiments/r23-ui-review/playwright-runner.mjs --scenarios=backtrack-mobile,backtrack-mobile-livingdead
```

`--help`で引数を確認できる。

## Scenario

- Check: ordinaryとupper-tailをdesktop/mobileで取得する。
- Attack: single comboと、2 comboへ追加した状態をdesktop/mobileで取得する。
- Backtrack: 通常状態をdesktop/mobileで取得し、mobileでは《屍人》を選択した状態も取得する。

各scenarioは`scenarios.js`で入力、route、viewport、canvas数、出力ファイル名を固定する。scenario定義は`tests/r23UiReviewHarness.test.js`で重複と形式を検証する。

## 出力

画像と`report.json`は`experiments/r23-ui-review/output/`へ保存する。このディレクトリはgitignoredであり、screenshotはレビュー補助であって数値のoracleやCI gateではない。production build、既存test、`smoke:production`が数値と基本動作の正本である。

runnerはcanvasが可視になり、描画フレームが安定するまで待つ。診断としてconsole warning/error、page error、same-origin request failure、HTTP errorを記録し、いずれかがあれば失敗する。固定の長いtimeoutで計算完了を仮定せず、observableなcanvas状態を待つ。

## 判断の範囲

このcaptureの成功は、UI変更の承認を意味しない。product ownerがbaselineを確認し、候補ごとに`ADOPT`、`REVISE`、`REJECT`を決めた後で、個別prototypeとproduction実装へ進む。R23準備段階ではproduction UI、計算、Worker、公開assetを変更しない。
