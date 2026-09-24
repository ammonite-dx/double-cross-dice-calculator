# R30-prep: chart transition parity

## 目的と開始点

Check、Attack、Backtrackの再計算時に、Chart.js canvasが一度破棄されてから再生成される表示上の断絶を解消した。レビュー指定の開始HEADは`5d3be682ac8bba28324613a89b0baecf9981ea65`で、開始時の作業ツリーはcleanだった。

実装コミット:

- `75d78d9` — `fix: preserve chart frames during recalculation`
- `b6cdb87` — `test: verify chart transition continuity in browser`

## 実装方針

計算要求の開始時にはcurrent presentationを未readyにするため、従来のUIはChart.js componentをunmountし、計算完了後に新しいcanvasを作っていた。今回保持するのは最後にreadyだったチャートの描画frameだけであり、計算結果やfeature stateのcurrent値ではない。

共通の`ProbabilityLineChart`は、readyなdataとoptionsをひとつのframeとして保持する。consumerがreplacement計算中を明示した状態でpresentationがnullになった場合にだけframeを保ち、計算成功時は新しいframeへ置き換える。loadingが終わってもpresentationがないerror／rejection時はframeを消去する。初回計算では保持対象がないため、空のまま計算を待つ。`preservePreviousFrame`がfalseのnull入力でも即座に消去する。

Checkはrange feedbackのloading状態を共通chartへ渡す。Attackはscoreとdamageそれぞれで全体計算と個別display計算のloading状態を集約し、ready presentation自体は保持しない。Backtrackはchart panelを常時mountし、最後のready presentationだけをloading中に描画用として保持する。Attackのdatasetは表示ラベルと分離した安定keyを持ち、combo系列はcombo ID、合計系列は`total`で識別するため、コンボ名変更だけでは系列identityが変わらない。

これらは描画上の連続性に限定した変更である。CalculationClient、計算状態、Abort、latest-wins、stale commit防止、resource guard、failure semanticsは変更していない。Chart.jsのversion downgradeやanimation無効化も行っていない。

## ブラウザsmoke

production build上のsmokeにcanvas nodeのidentity監視を追加した。CheckとAttackでは通常の再計算でcanvasが同じnodeのまま残ること、Attackではコンボ名変更後も同じchart/canvas identityを維持すること、Backtrackでは3枚のcanvasを再計算中に維持することを確認する。Backtrackのresource rejectionでは古いcanvasがすべて消え、入力回復後に3枚とも再生成されることも確認する。

## 検証

- `npm run verify:browser`: 成功。Check／Attack／Backtrackのcanvas continuity、Attackのcombo rename identity、Backtrackのresource rejection後のclearとrecoveryを確認した。
- `npm run verify:all`: 成功。Vitest 84 files / 997 tests、typecheck、ESLint、Markdown lint、486 modulesのproduction build、production browser smoke、32 assetsのverification、reference tests 7 files / 54 tests、generator tests 18件、simulation 13件、Ruff、runtime DX 20,000 casesを含む。
- `git diff --check`: 成功。Markdown lintは本記録を追加する前に108 files / 0 issuesで成功し、記録追加後にも再実行して成功した。

実装とブラウザsmokeの検証後にこの記録を追加した。公開準備、API／MCP化、計算アルゴリズムの変更は対象外である。
