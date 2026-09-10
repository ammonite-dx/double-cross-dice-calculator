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

## Reference parity metrics

現行production buildと公開版のvisual driftを、意味のあるDOMアンカーのgeometryとcomputed styleで比較する場合は、次を実行する。先に`npm run build`を実行する。

```powershell
npm run review:r23:parity
```

既定のreferenceは公開サイト`https://double-cross-dice-calculator.pages.dev`である。公開版を取得できない場合は、`origin/main`のpinned SHA `461ab898e2c62583c1ae504470c3ceb169d2d363`を一時的なreferenceとして使用し、その選択をレビュー文書へ記録する。別のURLや対象scenarioを指定することもできる。

```powershell
node experiments/r23-ui-review/parity-runner.mjs --reference-url=https://example.test --scenarios=check-mobile-ordinary,attack-mobile-single
```

`output/metrics/current.json`、`reference.json`、`delta.json`、`parity-report.json`と比較画像が生成される。数値差分は補正候補を検討するための診断情報であり、自動的な合否判定やpixel-perfectなgolden testではない。

## Scenario

- Check: ordinaryとupper-tailをdesktop/mobileで取得する。
- Attack: single comboと、異なる入力値を設定した2 comboの状態をdesktop/mobileで取得する。
- Backtrack: 通常状態をdesktop/mobileで取得し、mobileでは《屍人》を選択した状態も取得する。

各scenarioは`scenarios.js`で入力、route、viewport、canvas数、出力ファイル名を固定する。scenario定義は`tests/r23UiReviewHarness.test.js`で重複と形式を検証する。

## 出力

画像と`report.json`は`experiments/r23-ui-review/output/`へ保存する。このディレクトリはgitignoredであり、screenshotはレビュー補助であって数値のoracleやCI gateではない。production build、既存test、`smoke:production`が数値と基本動作の正本である。

runnerはcanvasが可視になり、描画フレームが安定するまで待つ。診断としてconsole warning/error、page error、same-origin request failure、HTTP errorを記録し、いずれかがあれば失敗する。固定の長いtimeoutで計算完了を仮定せず、observableなcanvas状態を待つ。

## 判断の範囲

このcaptureの成功は、UI変更の承認を意味しない。product ownerがbaselineを確認し、候補ごとに`ADOPT`、`REVISE`、`REJECT`を決めた後で、個別prototypeとproduction実装へ進む。R23準備段階ではproduction UI、計算、Worker、公開assetを変更しない。

## Visual prototypes

prototypeはproduction CSSやchart sourceを変更せず、build済み`dist/`へ一時的なCSSまたはJavaScript patchを注入して比較画像を作る。実行前に次を行う。

```powershell
npm run build
```

全variantを実行するコマンドは次のとおりである。

```powershell
npm run review:r23:prototype -- --variant=visual-parity
npm run review:r23:prototype -- --variant=backtrack-other-reduction-wide
npm run review:r23:prototype -- --variant=backtrack-other-reduction-stack
npm run review:r23:prototype -- --variant=footer-flex
npm run review:r23:prototype -- --variant=backtrack-label-6
npm run review:r23:prototype -- --variant=backtrack-label-8
npm run review:r23:prototype -- --variant=backtrack-label-9
```

npmの引数転送を使わずに実行する場合は、次の形式を使う。

```powershell
node experiments/r23-ui-review/prototype-runner.mjs --variant=backtrack-label-8
```

scenarioを絞る場合は、variantとカンマ区切りのscenario IDを指定する。

```powershell
node experiments/r23-ui-review/prototype-runner.mjs `
  --variant=backtrack-label-8 `
  --scenarios=backtrack-mobile
```

variantの目的は次のとおりである。

| Variant | 目的 |
| --- | --- |
| `visual-parity` | currentを公開版referenceのfield geometry・header alignmentへ寄せる候補 |
| `backtrack-other-reduction-wide` | mobileの「その他減少量」outer groupを全幅へ広げる候補 |
| `backtrack-other-reduction-stack` | mobileでnested fieldsを縦積みする候補 |
| `footer-flex` | fixedではないnormal-flowのfooter shellを試す候補 |
| `backtrack-label-6` / `8` / `9` | mobile Doughnutのdatalabel fontを比較する候補 |

8pxと9pxのlabel variantだけは、build済みJavaScript内の対象文字列をexperiment-onlyで置換する。targetの出現回数がscenarioごとにちょうど1回でない場合、runnerは失敗する。6pxはproduction buildそのものなのでbundle replacementは行わない。production source、公開asset、計算結果にはこのpatchを接続しない。

画像と`report.json`は`experiments/r23-ui-review/output/prototypes/<variant>/`へ出力される。このdirectoryはgitignoredである。captureの成功はproduction採用を意味せず、比較後にproduct ownerが`ADOPT`、`REVISE`、`REJECT`を決める。
