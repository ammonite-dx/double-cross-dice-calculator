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
- Attack: single combo、異なる入力値を設定した2 combo、ドッジ／《イベイジョン》／ガード・リアクション放棄のcompound inputをdesktop/mobileで取得する。
- Backtrack: 通常状態をdesktop/mobileで取得し、mobileでは《屍人》を選択した状態も取得する。

production runnerは合計15scenarioを実行し、Attackのcompound inputではshared group名、個別spinbutton accessible name、`aria-labelledby` IDの一意性も確認する。

各scenarioは`scenarios.js`で入力、route、viewport、canvas数、出力ファイル名を固定する。scenario定義は`tests/r23UiReviewHarness.test.js`で重複と形式を検証する。

## 出力

画像と`report.json`は`experiments/r23-ui-review/output/`へ保存する。このディレクトリはgitignoredであり、screenshotはレビュー補助であって数値のoracleやCI gateではない。production build、既存test、`smoke:production`が数値と基本動作の正本である。

runnerは外部フォント取得をstubしたうえで、canvasが可視になり、描画フレームが安定するまで待つ。診断としてconsole warning/error、page error、same-origin request failure、HTTP errorを記録し、いずれかがあれば失敗する。固定の長いtimeoutで計算完了を仮定せず、observableなcanvas状態を待つ。

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
npm run review:r23:prototype -- --variant=advanced-setting-parity
npm run review:r23:prototype -- --variant=setting-form-parity
npm run review:r23:prototype -- --variant=scoped-visual-parity
npm run review:r23:prototype -- --variant=backtrack-other-reduction-wide
npm run review:r23:prototype -- --variant=backtrack-other-reduction-stack
npm run review:r23:prototype -- --variant=backtrack-other-reduction-compound-label
npm run review:r23:prototype -- --variant=footer-flex
npm run review:r23:prototype -- --variant=footer-short-baseline
npm run review:r23:prototype -- --variant=footer-short-flex
npm run review:r23:prototype -- --variant=footer-short-production
npm run review:r23:prototype -- --variant=backtrack-label-6
npm run review:r23:prototype -- --variant=backtrack-label-8
npm run review:r23:prototype -- --variant=backtrack-label-9
npm run review:r23:prototype -- --variant=backtrack-label-8-stress
npm run review:r23:prototype -- --variant=backtrack-label-9-stress
npm run review:r23:prototype -- --variant=backtrack-label-9-adaptive-stress
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

「約10%」の表示stressを再現するfixtureは、productionのBacktrack generatorとpresentationを決定的に探索して作成する。探索範囲は、現在侵蝕率`70,80,...,130`、残存ロイス数`0..7`、Eロイス数`0..3`、その他減少ダイス`0..5`、その他減少固定値`0,5,...,30`で、通常と《屍人》をそれぞれ9,408候補調べる。結果はignoredな`output/backtrack-label-stress.json`へ保存し、選択した入力を`backtrack-label-stress-fixtures.js`へ固定する。

```powershell
node experiments/r23-ui-review/find-backtrack-label-stress.mjs
```

variantの目的は次のとおりである。

| Variant | 目的 |
| --- | --- |
| `visual-parity` | 過剰に広いselectorを使った旧案。比較証拠として残すが、production実装には使わない |
| `advanced-setting-parity` | semantic markerを付けた「高度な設定」controlだけを公開版referenceへ寄せる候補 |
| `setting-form-parity` | semantic markerを付けたSettingFormの最小値・最大値・表示モードだけを寄せる候補 |
| `scoped-visual-parity` | 上記2つだけを同時に適用する候補 |
| `backtrack-other-reduction-wide` | mobileの「その他減少量」outer groupを全幅へ広げる候補 |
| `backtrack-other-reduction-stack` | mobileでnested fieldsを縦積みする候補 |
| `backtrack-other-reduction-compound-label` | mobileの2入力をcompound labelでまとめる候補。列幅と行高は維持する |
| `footer-flex` | 既存routeでfixedではないnormal-flowのfooter shellを試す候補 |
| `footer-short-baseline` / `footer-short-flex` | 同一のsynthetic short-pageでbaselineとnormal-flow flexを比較する候補 |
| `footer-short-production` | production sourceのnormal-flow flex shellを、footer CSSをinjectせずsynthetic short-pageで検証する |
| `backtrack-label-6` / `8` / `9` | mobile Doughnutのdatalabel fontを比較する候補 |
| `backtrack-label-8-stress` / `backtrack-label-9-stress` | 通常・《屍人》の約10%表示sliceでfont sizeを比較する候補 |
| `backtrack-label-9-adaptive-stress` | 同じstress fixtureで10%以上15%未満のsliceだけanchor/align/offsetを外周側へ寄せる候補 |

8pxと9pxのlabel variantだけは、build済みJavaScript内の対象文字列をexperiment-onlyで置換する。targetの出現回数がscenarioごとにちょうど1回でない場合、runnerは失敗する。6pxはproduction buildそのものなのでbundle replacementは行わない。production source、公開asset、計算結果にはこのpatchを接続しない。

form prototypeはproduction markupを変更しない。runnerがexact textから「高度な設定」のcontrol（Check 1件、Attack 2件）と、最小値・最大値・表示モードを含むSettingForm row（Check 1件、Attack 2件）へsemantic markerを付け、対象件数が異なる場合はfail-closedで停止する。`visual-parity`はこの安全性を満たさない旧案として、REJECTEDの比較証拠に限って使用する。

`backtrack-other-reduction-compound-label`は、既存のmobile outer `cols=6`とnested `6 / 6`を維持したまま、2つのinputに「その他減少量（ダイス）」「その他減少量（固定値）」のaccessible nameを付け、compound wrapperの視覚labelを追加する。wide/stack案のように列幅や行高は変更しない。

`footer-short-baseline`と`footer-short-flex`は、Check routeの内容をreview-onlyで空にして短いページを作る。同じDOM短縮条件でbaselineではfooterがviewport上端直後に残り、flex案ではfooterが通常flowのままviewport下端へ寄ることをgeometryへ記録する。実routeのlong-page regressionは既存`footer-flex`で確認する。

`footer-short-production`も同じDOM短縮条件を使うが、候補用のfooter CSSをinjectしない。production buildが提供する`.main-area`のcolumn flex、通常flow footer、viewport下端整列、drawerの前面関係を検証する。

`backtrack-label-8-stress`、`backtrack-label-9-stress`、`backtrack-label-9-adaptive-stress`は、fixtureの数値を実際のBacktrack formへ入力し、通常と《屍人》の両方をmobileで撮影する。8px／9pxはbuild済みJavaScriptのfont設定を一度だけ置換し、adaptive variantは同じ置換へscriptableな`anchor`、`align`、`offset`を追加する。いずれもbundle文字列の一致が1件でない場合はfail-closedになる。

画像と`report.json`は`experiments/r23-ui-review/output/prototypes/<variant>/`へ出力される。このdirectoryはgitignoredである。captureの成功はproduction採用を意味せず、比較後にproduct ownerが`ADOPT`、`REVISE`、`REJECT`を決める。

## Source-level form prototypes

R23のUI-04A、UI-04B、UI-06、UI-08では、post-buildのCSS patchではなく、実際のVue/Vuetify markupとpublic propを一時的にbuildするsource-level prototypeを使う。candidate sourceはexact replacementで適用され、candidate `dist/`のcapture開始前に元のバイト列へ復元される。復元失敗はhard failureであり、productionの`src/**`へ候補を残さない。

次のvariantを個別に実行できる。

```powershell
npm run review:r23:source-prototype -- --variant=advanced-setting-inline-source
npm run review:r23:source-prototype -- --variant=setting-form-comfortable-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-aligned-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-positioned-source
npm run review:r23:source-prototype -- --variant=attack-compound-d10-source
npm run review:r23:source-prototype -- --variant=attack-compound-d10-guard-offset-source
```

`advanced-setting-inline-source`はCheck 1件、Attack 2件の「高度な設定」checkboxへ`inline`だけを追加する。`setting-form-comfortable-source`はCheck/Attackの最小値・最大値・表示モードだけを`density="comfortable"`へ変更する。`backtrack-compound-label-source`は外側`cols=6`、desktop`md=3`、内側`6 / 6`を維持し、app-owned group label、`role="group"`、2つの個別accessible nameを候補にする。

`backtrack-compound-label-aligned-source`はUI-06 revision 2の候補であり、revision 1と同じsemantic structureを維持したまま、視覚labelへVuetify utility classを適用し、top-level scoped styleで位置を4pxだけ調整する。revision 1のsourceは履歴として変更しない。

`backtrack-compound-label-positioned-source`はUI-06 revision 3の候補であり、revision 2の構造、utility class、field geometryを維持したまま、視覚labelの`inset-block-start`だけを12pxへ変更する。

`attack-compound-d10-source`はAttackFormの「攻撃力」とDefenceFormの3分岐にあるD10+固定値入力を対象とする。Attack desktop/mobileのsingle・multi-comboと、source prototype専用の《イベイジョン》・ガード分岐を含む8scenarioで、shared label、個別accessible name、入力操作、`useId()`の一意性、フィールドのgeometryを確認する。候補はproductionへ接続せず、capture前にsourceを復元する。

`attack-compound-d10-guard-offset-source`はUI-08の初回候補でREVISEとなったガード・リアクション放棄分岐だけを再確認するrevisionである。共通labelの構造と全フィールドgeometryを維持し、direct-rowのlabelへ`inset-inline-start: 4px`と`inset-block-start: 4px`を追加する。desktop/mobileの2scenarioだけをcaptureし、初回候補でPASSだった他の6scenarioは再実行しない。候補はproductionへ接続せず、capture前にsourceを復元する。

画像とgeometry/accessibility metricsは`experiments/r23-ui-review/output/source-prototypes/<variant>/`へ保存される。unit testはreplacement定義、出現数、復元、build失敗時の復元を検証するが、画像をgoldenにしない。技術的なcapture成功はvisual approvalやproduction採用を意味しない。候補の計測値、制約、未採用状態は[`docs/r23-vuetify-control-source-prototypes.md`](../../docs/r23-vuetify-control-source-prototypes.md)に記録する。
