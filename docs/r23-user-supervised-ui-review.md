# R23 — User-supervised UI / UX Review

## 目的

R23は、UIを一般論で再設計するフェーズではない。現行のproduction UIをbaselineとし、product ownerが実画面を確認したうえで、個別の変更を採用・修正・不採用に決めるためのレビューである。R23の準備段階ではproduction UIを変更せず、同じ入力・viewport・待機条件で現行画面を再現できるようにする。

この文書でいうprototype approvalはproduction approvalを意味しない。prototypeを作成しただけではproductionへ接続しない。

## 判断権限と変更フロー

実装役はprototypeの作成、計測、技術的な検証を担当する。画面に見える変更の判断はproduct ownerが担当する。実装役は「一般的にこちらがよい」という理由だけでproduction UIを変更しない。

各候補は次の順序で扱う。

1. 現行画面をbaselineとして確認する。
2. 問題を具体的な観察として記述する。
3. 必要な候補だけA/B/Cのprototypeを作る。
4. product ownerが実画面を比較する。
5. `ADOPT`、`REVISE`、`REJECT`のいずれかを決める。
6. `ADOPT`または修正後の候補だけをproductionへ実装する。

次のような明白な不具合は、表示設計を実質的に変えない範囲で実装役が修正候補にしてよい。ただし、visibleな差が生じる場合は通常のレビューへ戻す。

- 明らかなクリッピングやoverflowの破綻
- 重複したDOMやbrowser-specificな描画破綻
- 明らかなpixel alignmentの不具合
- focusや基本的なinteractionの破綻

## 維持する表示契約

画面の主な流れは次のとおりとする。

- Check: `Input → Graph → Summary`
- Attack: `Input → Graphs → Summary`
- Backtrack: `Input → Graph`

graphを主要コンテンツ、summaryやtableを補助情報として扱う。確率の意味は現行実装から変更しない。

- PMFの表示点 `x` は `P(X = x)` を表す。
- upper-tailの表示点 `x` は `P(X >= x)` を表す。
- 通常のPMFのbinningやupper-tailのsamplingは行わない。
- 1つの整数値は1つの確率点として扱い、viewportに応じて粒度を変更しない。

product ownerの新しい承認なしに、次の変更を採用しない。

- PMFのBar化、upper-tailの階段線化、通常のbinningやsampling
- viewport依存の確率粒度変更やvisibleな集約通知
- Attackのlayout redesignやBacktrackのDoughnutからBarへの変更
- 重複する確率table、animationの無効化、display設定の折りたたみ

## R23候補一覧

| ID | 対象 | 観察・目的 | 候補 | 初期状態 |
| --- | --- | --- | --- | --- |
| UI-01 | Backtrack | mobileでDoughnutのdatalabelが読みにくいか確認する | 現行6px、最小8px、最小9px、chart領域の軽微な拡張、padding/layoutの軽微な調整 | READY FOR REVIEW |
| UI-02 | Check / Attack | 高密度Lineのrange操作と極端な表示範囲を確認する | 現行Line、現行animation、整数ごとの点、現在のdisplay limitsを維持した候補 | READY FOR REVIEW |
| UI-03 | Check / Attack | point markerのtooltip target discoverabilityと視覚密度を確認する | 現行markerをbaselineとする候補 | READY FOR REVIEW |
| UI-04 | 全ページ | mobile/desktopのspacingとinformation densityを確認する | 現行layoutをbaselineとする候補 | READY FOR REVIEW |
| UI-05 | Attack | 複数seriesの識別、legend、tooltip、summaryとの距離を確認する | 現行multi-combo layoutをbaselineとする候補 | READY FOR REVIEW |

UI-04とUI-05は既知の不具合ではなく、product ownerが確認するreview candidateである。

### UI-01の確認範囲

small viewportでは現在datalabelが6pxになる。Doughnut、page構成、table、large legendを維持したまま可読性が改善するかを確認する。product ownerの承認前に、DoughnutをBarへ変更したり、外部labelを大幅に追加したりしない。

### UI-02とUI-03の確認範囲

高密度Lineの負荷はR22の数値性能問題ではなく、UIとproductの判断として扱う。Line、animation、整数ごとの描画、特定のxをtooltipで調べる操作はbaselineとして維持する。marker変更は性能改善を目的にせず、tooltip targetの見つけやすさと視覚密度だけを確認する。

## Review matrix

個別の候補を採用する場合は、次の項目を埋める。prototypeとproductionのcommitを混同しない。

| ID | Page | Viewport | Baseline problem | Candidate variants | Technical constraints | Product decision | Implementation commit | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI-01 | Backtrack | 390×844 / 1280×900 | 未確認 | 6px / 8px / 9px など | Doughnutを維持 | 未決定 | — | READY FOR REVIEW |
| UI-02 | Check / Attack | 390×844 / 1280×900 | 未確認 | 現行Lineを中心に比較 | 1 integer = 1 point | 未決定 | — | READY FOR REVIEW |
| UI-03 | Check / Attack | 390×844 / 1280×900 | 未確認 | 現行markerをbaseline | PMF意味論を維持 | 未決定 | — | READY FOR REVIEW |
| UI-04 | 全ページ | 390×844 / 1280×900 | 未確認 | 現行layoutをbaseline | graph-firstを維持 | 未決定 | — | READY FOR REVIEW |
| UI-05 | Attack | 390×844 / 1280×900 | 未確認 | 現行multi-comboをbaseline | 既存summary契約を維持 | 未決定 | — | READY FOR REVIEW |

## Baseline capture

baseline captureはproduct ownerの視覚レビューを補助するreview-only toolingである。自動判定やpixel-perfectなgolden screenshot testではない。production buildを起動し、production routeを実際に操作して、同じ状態・viewport・入力を再現する。production componentを直接importしたisolated demoは作らない。

最低限、次のscenarioを用意する。

- Check: `check-desktop-ordinary`、`check-mobile-ordinary`、`check-desktop-upper-tail`、`check-mobile-upper-tail`
- Attack: `attack-desktop-single`、`attack-mobile-single`、`attack-desktop-multi-combo`、`attack-mobile-multi-combo`
- Backtrack: `backtrack-desktop`、`backtrack-mobile`、`backtrack-mobile-livingdead`

viewportはdesktop `1280×900`、mobile `390×844`とする。必要なscenarioでは入力値設定、計算完了、chart animation完了、mode切替、combo追加をobservableな状態で待つ。固定timeoutは最後の手段とし、canvas数、result-ready state、feedback stateなどを優先する。

画像にはproduction pageだけを含め、debug overlayや計測UIを重ねない。出力はgitignoredまたはtemporaryなreview outputへ保存し、repositoryへ大量のbinaryをcommitしない。ファイル名は`01-check-desktop-ordinary.png`のようにdeterministicにする。

captureで確認するのは、scenarioの再現、console error、page error、request failureなどの診断情報である。数値の正しさは既存のtestとproduction smokeを正本とし、R23のscreenshotを数値oracleにしない。既存の`verify:release`や`smoke:production`を置き換えず、R23のcaptureをCI gateにも追加しない。

review-only runnerの実行方法とscenario一覧は[`experiments/r23-ui-review/README.md`](../experiments/r23-ui-review/README.md)に記載する。production UI変更、計算変更、Worker変更、公開asset変更はこの準備段階では0件である。

## Product owner向け確認項目

実画面を確認するときは、修正を前提にせず、次の問いに答える。

- graphが画面の主役に見えるか。
- InputからGraph、Summaryへ進む順序は自然か。
- PMFの点密度とupper-tailの読みやすさに問題があるか。
- tooltip targetは見つけやすいか。
- mobileのchart高さとdatalabelは読めるか。
- Attackの複数series、legend、tooltip、summaryの関係は理解しやすいか。
- desktopとmobileでspacing、padding、information densityに気になる点があるか。
- 現行のanimation、control placement、display-range操作を維持したいか。

product ownerが候補を選んだ後に、個別prototypeの実装単位を作る。R23の準備完了時点でprototypeは未着手、production UI変更は0件である。

## R23-A — 観察の正式記録と次のレビュー範囲

R23-Aでは、baseline captureをproduct ownerが確認した結果を、候補ごとの作業へ分解する。現行公開版との比較には、実際の公開サイトを第一候補とし、再現が必要な場合は`origin/main`の`461ab898e2c62583c1ae504470c3ceb169d2d363`をpinned referenceとして扱う。依存パッケージを巻き戻したり、reference側のpackage-lockを編集したりしない。

### Product ownerが確認した候補

既存のUI-04は、次の3項目へ分解して追跡する。いずれも`CONFIRMED BY PRODUCT OWNER / REFERENCE PARITY REQUIRED`である。

- UI-04A: Vuetify visual parity — 「高度な設定」の配置
- UI-04B: Vuetify visual parity — 表示モードfieldのvertical alignment
- UI-04C: Vuetify visual parity — mobile typography

追加の候補は次のとおりである。

- UI-06: Backtrack mobile 「その他減少量」label clipping（`CONFIRMED RESPONSIVE DEFECT`）
- UI-07: short-page footer placement（`CONFIRMED EXISTING LAYOUT DEFECT`）。これは現行公開版にも存在する既存不具合であり、migration regressionとは扱わない。
- UI-08: Damage expected-value summary precision。certified boundsを小数1桁へ丸めて同じ値になる場合だけ、値を表示してよい。丸め結果が異なる場合のrepresentative value表示は、uncertaintyを測定してから別途判断する。

UI-01のBacktrack 6px datalabelは`CONFIRMED READABILITY CONCERN`だが、UI-04、UI-06、UI-07より優先度を下げる。6px、8px、9pxを比較するが、Doughnutの形式、chart size、cutout、colors、threshold、3-chart構造、layoutは変えない。UI-05の既存multi-combo screenshotは、combo 2を追加しただけで入力が同一であり、series比較の証拠として不足しているため、`CAPTURE NEEDS CORRECTION`とする。

### R23-Aのreview matrix

| ID | 対象 | 分類 | 参照・候補 | Status |
| --- | --- | --- | --- | --- |
| UI-04A | 「高度な設定」 | CONFIRMED BY PRODUCT OWNER | current/referenceのheader、checkbox、text geometry | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-04B | 表示モードfield | CONFIRMED BY PRODUCT OWNER | label、value、underline、field height | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-04C | mobile typography | CONFIRMED BY PRODUCT OWNER | 代表的なpanel、field、button、summaryのcomputed style | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-06 | Backtrack「その他減少量」 | CONFIRMED RESPONSIVE DEFECT | parity後に12-column化またはstackを比較 | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-07 | short-page footer | CONFIRMED EXISTING LAYOUT DEFECT | flex shell prototype。fixed/absolute footerは禁止 | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-08 | Damage期待値 | PRODUCT DECISION | stable boundedだけproduction採用。広い近似はaudit後に判断 | ADOPTED / IMPLEMENTED; broader approximation pending |

### Productionへ入れてよい変更

R23-Aでproductionへ入れてよいのは、UI-08のpresentation formattingだけである。exact値、またはfiniteなbounded値のlower boundとupper boundを小数1桁へ丸めた結果が一致する場合に限り、その値を表示する。lower-bound、丸め結果が一致しないbounded値、NaN、Infinityは従来どおり`—`とする。この変更ではcalculation core、tail certificate、overflow、precision toleranceを変更しない。

UI-04A、UI-04B、UI-04C、UI-06、UI-07、UI-01、UI-05の見た目は、比較画像とgeometry/style metricsを作成するだけで、product ownerの直接レビューまでproductionへ採用しない。

### R23-Aの実験出力

reference、current、prototypeは同じroute、入力、viewport、scroll位置、animation完了状態で比較する。style metricsはsemantic locatorを優先し、reference/current/deltaをJSONへ保存する。pixel-perfect snapshot testやCIの自動pass/fail判定にはしない。出力は`experiments/r23-ui-review/output/`以下のgitignored directoryへ保存し、大量のbinaryをcommitしない。

Backtrackの6px、8px、9px比較はthrowaway worktreeまたは一時patchで行い、active branchへprototype sourceをcommitしない。visual parity、footer、responsive layoutについても同じ扱いとする。

R23-Aの終了状態は`IN REVIEW`であり、production visual parity changesは`NOT YET ADOPTED`、product-owner visual reviewは`REQUIRED`である。UI-08のstable bounded表示だけは`ADOPTED / IMPLEMENTED`とし、より広い近似表示は`AUDITED / AWAITING PRODUCT DECISION`で停止する。

## R23-A 実施結果（2026-09-09）

### 作業単位

R23-Aの実装・計測は、次の単位に分けて完了した。productionへ入ったのは、DamageとTotal Damageの表示formatterを共通化し、有限なbounded区間の丸め結果が一致する場合だけ値を表示する変更と、その回帰テストだけである。計算core、tail certificate、overflow、resource policy、Worker、公開asset、UIの見た目は変更していない。

| Commit | 内容 |
| --- | --- |
| `d001bc7` | product ownerの観察とR23-Aの判断を記録 |
| `aa7fa7d` | 公開版・現行版のparity診断、semantic metrics、multi-combo入力を追加 |
| `fbf323e` | stable boundedなDamage期待値を表示できる共通formatterと回帰テストを追加 |
| `48c374d` | Damage期待値の不確かさを測るexperiment-only監査を追加 |
| `6f10a14` | visual parity、responsive layout、footer、Backtrack labelのexperiment-only prototypeを追加 |

### 公開版とのparity診断

`npm run review:r23:parity`を、公開サイト`https://double-cross-dice-calculator.pages.dev`をreferenceとして実行した。公開サイトが利用できない場合の再現用referenceは`origin/main`の`461ab898e2c62583c1ae504470c3ceb169d2d363`である。診断はpixel-perfectな合否判定ではなく、semantic locatorで取得したcurrent/reference/deltaの記録である。

代表scenario `check-desktop-ordinary`では、headerのline-heightがcurrent `22.8px`、reference `20px`だった。最小値・最大値fieldの高さはcurrent `32px`、reference `40px`で、入力paddingはcurrentが上 `8px`・下 `0px`、referenceが上 `14px`・下 `2px`だった。表示モードfieldは両方`40px`だが、labelとvalueの縦位置には差があった。高度な設定の文字は両方12pxで、line-heightはcurrent `20.004px`、reference `20px`だった。これらはUI-04A〜Cの補正候補を定量化する材料であり、production採用の判断ではない。

### multi-combo captureの補正

series比較のため、combo 2にはcombo 1と異なる入力を設定した。固定した入力はscoreがdice `4`、critical `8`、skill `3`、damageがdice `2`、fixed `4`である。desktop/mobileの補正scenarioはそれぞれ2 canvasを描画し、console、page error、request failure、HTTP errorはいずれも0件だった。これでcombo 1とcombo 2のcurveを比較できるが、採用判断はproduct ownerの視覚レビューに委ねる。

### experiment-only prototypeの計測

visual parity prototypeは、referenceのfield高さ・padding・header line-heightへ寄せるCSSをrunnerから注入した。Backtrackの「その他減少量」には次の2案を作成した。baselineのmobile outer groupは約`151px`、wide案はouter `302px`・nested row `294px`、stack案はouter・nested・groupを`302px`へ広げた。両案とも機械的なclipping指標はfalseになったが、ラベルの折り返しや周辺の視覚的な自然さは画面確認が必要である。

footer prototypeは`v-main`を縦方向flexにし、route contentを伸縮する通常flowの要素、footerを固定しない通常flowの要素として扱った。fixed/absolute positioningやoverlayは使っていない。実在する全routeはviewportより長かったため、計測ではfooterがviewport下端に到達するshort-pageケースまでは証明できず、long-pageで通常flowが維持されることだけを確認した。short-page用の合成fixtureを追加していないため、UI-07は未決定のままとする。

BacktrackのDoughnut labelは6px、8px、9pxを比較した。8pxと9pxはrunnerがbuild済みJavaScriptへ一時的にパッチを適用したvariantであり、sourceやproduction CSSには変更がない。visual parity、responsive layout、footer、labelのいずれも、prototypeの作成・計測だけではproduction採用を意味しない。

### Damage期待値の精度監査

`npm run audit:r23:damage-precision`で、表示量子`Q = 0.1`の監査を行った。13件のaccepted fixtureを調べ、`exact`が1件、`lower-bound`が12件、bounded区間は0件、丸め境界をまたぐ区間も0件だった。`halfWidth <= 0.005`、`0.010`、`0.020`の件数はいずれも1件で、いずれもexact recordである。lower-bound recordには中点を付けず、heuristicなpoint estimateも追加していない。

したがって、現在のproduction契約である「exact、またはfinite bounded区間の丸め上下界が一致する場合だけ小数1桁で表示し、それ以外は`—`」は維持する。より広い近似表示を導入する閾値や代表値は、この監査だけでは決めず、別のproduct decisionへ送る。

### R23-Aの最終状態

| 対象 | 状態 |
| --- | --- |
| UI-04A〜C（visual parity） | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-06（その他減少量のresponsive layout） | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-07（short-page footer） | AWAITING PRODUCT-OWNER VISUAL REVIEW; short-page proof pending |
| UI-01（Backtrack 6/8/9px label） | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-05（異なる入力のmulti-combo） | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-08（stable bounded Damage期待値） | ADOPTED / IMPLEMENTED |
| UI-08の広い近似表示 | AUDITED / AWAITING PRODUCT DECISION |

R23は`IN REVIEW`のままとする。production visual parity changesは`NOT YET ADOPTED`であり、次に必要なのはproduct ownerによる比較画像・計測結果・prototype画面の直接レビューである。レビュー承認なしにUI-04A〜C、UI-06、UI-07、UI-01、UI-05を本番へ接続しない。

### 実施時の検証

最終状態では`npm test`が87 files・945 tests、`npm run lint`、`npm run lint:markdown`（55 files・0 issues）、`npm run build`（420 modules）、`git diff --check`が成功した。multi-combo、visual parity、Backtrackのwide/stack、footer、6/8/9px labelのprototype runnerも各scenarioで診断エラー0件だった。prototypeの出力画像とJSONはgitignored directoryに保存し、productionのrelease gateやCIの自動合否判定には接続していない。
