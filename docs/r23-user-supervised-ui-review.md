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

R23-Aの終了状態は`IN REVIEW`であり、production visual parity changesは`NOT YET ADOPTED`、product-owner visual reviewは`REQUIRED`である。UI-08のstable bounded表示だけは`ADOPTED / IMPLEMENTED`とし、より広い近似表示は`AUDITED / INSUFFICIENT BOUNDED EVIDENCE / DEFERRED`で停止する。

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
| `f17d3d2` | prototype bundle置換のfail-closed契約、単体テスト、再現手順を追加 |
| `f2601b4` | Damage精度監査の追加近似候補集計とsynthetic testを追加 |

### 公開版とのparity診断

`npm run review:r23:parity`を、公開サイト`https://double-cross-dice-calculator.pages.dev`をreferenceとして実行した。公開サイトが利用できない場合の再現用referenceは`origin/main`の`461ab898e2c62583c1ae504470c3ceb169d2d363`である。診断はpixel-perfectな合否判定ではなく、semantic locatorで取得したcurrent/reference/deltaの記録である。

代表scenario `check-desktop-ordinary`では、headerのline-heightがcurrent `22.8px`、reference `20px`だった。最小値・最大値fieldの高さはcurrent `32px`、reference `40px`で、入力paddingはcurrentが上 `8px`・下 `0px`、referenceが上 `14px`・下 `2px`だった。表示モードfieldは両方`40px`だが、labelとvalueの縦位置には差があった。高度な設定の文字は両方12pxで、line-heightはcurrent `20.004px`、reference `20px`だった。これらはUI-04A〜Cの補正候補を定量化する材料であり、production採用の判断ではない。

### multi-combo captureの補正

series比較のため、combo 2にはcombo 1と異なる入力を設定した。固定した入力はscoreがdice `4`、critical `8`、skill `3`、damageがdice `2`、fixed `4`である。desktop/mobileの補正scenarioはそれぞれ2 canvasを描画し、console、page error、request failure、HTTP errorはいずれも0件だった。これでcombo 1とcombo 2のcurveを比較できるが、採用判断はproduct ownerの視覚レビューに委ねる。

### experiment-only prototypeの計測

visual parity prototypeは、referenceのfield高さ・padding・header line-heightへ寄せるCSSをrunnerから注入した。Backtrackの「その他減少量」には次の2案を作成した。baselineのmobile outer groupは約`151px`、wide案はouter `302px`・nested row `294px`、stack案はouter・nested・groupを`302px`へ広げた。両案とも機械的なclipping指標はfalseになったが、ラベルの折り返しや周辺の視覚的な自然さは画面確認が必要である。

footer prototypeは`v-main`を縦方向flexにし、route contentを伸縮する通常flowの要素、footerを固定しない通常flowの要素として扱った。fixed/absolute positioningやoverlayは使っていない。実在する全routeはviewportより長かったため、計測ではfooterがviewport下端に到達するshort-pageケースまでは証明できず、long-pageで通常flowが維持されることだけを確認した。short-page用の合成fixtureを追加していないため、UI-07は未決定のままとする。

BacktrackのDoughnut labelは6px、8px、9pxを比較した。6pxはpatchなしのbaselineで、8pxと9pxはrunnerがbuild済みJavaScriptへ一時的にパッチを適用したvariantである。8pxと9pxはそれぞれ`backtrack-mobile`と`backtrack-mobile-livingdead`の2 scenarioすべてで`replacementCount = 1`、`responseCount = 8`、`matchedResponseCount = 1`となり、browser diagnosticsも0件だった。sourceやproduction CSSには変更がない。visual parity、responsive layout、footer、labelのいずれも、prototypeの作成・計測だけではproduction採用を意味しない。

### Damage期待値の精度監査

`npm run audit:r23:damage-precision`で、表示量子`Q = 0.1`の監査を行った。13件のaccepted fixtureを調べ、`exact`が1件、`lower-bound`が12件、bounded区間は0件、丸め境界をまたぐ区間も0件だった。旧`halfWidthThresholdCounts`に相当する`allFiniteIntervalThresholdCounts`は、halfWidthが0のexact recordを含むため、`0.005`、`0.010`、`0.020`のいずれも1件となる。追加近似候補は`kind = bounded`かつ既存の丸め表示が不安定なrecordだけに限定し、`additionalApproximationCandidateCounts`は各thresholdで0件、候補IDもすべて空配列だった。lower-bound recordには中点を付けず、heuristicなpoint estimateも追加していない。

したがって、現在のproduction契約である「exact、またはfinite bounded区間の丸め上下界が一致する場合だけ小数1桁で表示し、それ以外は`—`」は維持する。今回のfixtureには追加近似を評価できるbounded-but-unstable recordがなく、より広い近似表示の要否を否定する根拠もないため、結論は`AUDITED / INSUFFICIENT BOUNDED EVIDENCE / DEFERRED`とする。

### R23-Aの最終状態

| 対象 | 状態 |
| --- | --- |
| UI-04A〜C（visual parity） | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-06（その他減少量のresponsive layout） | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-07（short-page footer） | AWAITING PRODUCT-OWNER VISUAL REVIEW; short-page proof pending |
| UI-01（Backtrack 6/8/9px label） | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-05（異なる入力のmulti-combo） | AWAITING PRODUCT-OWNER VISUAL REVIEW |
| UI-08（stable bounded Damage期待値） | ADOPTED / IMPLEMENTED |
| UI-08の広い近似表示 | AUDITED / INSUFFICIENT BOUNDED EVIDENCE / DEFERRED |

R23は`IN REVIEW`のままとする。production visual parity changesは`NOT YET ADOPTED`であり、次に必要なのはproduct ownerによる比較画像・計測結果・prototype画面の直接レビューである。レビュー承認なしにUI-04A〜C、UI-06、UI-07、UI-01、UI-05を本番へ接続しない。

### 実施時の検証

最終状態では`npm test`が87 files・945 tests、`npm run lint`、`npm run lint:markdown`（55 files・0 issues）、`npm run build`（420 modules）、`git diff --check`が成功した。multi-combo、visual parity、Backtrackのwide/stack、footer、6/8/9px labelのprototype runnerも各scenarioで診断エラー0件だった。prototypeの出力画像とJSONはgitignored directoryに保存し、productionのrelease gateやCIの自動合否判定には接続していない。

## R23-B — Product owner decisions and scoped follow-up (2026-09-10)

R23-Aの画像レビューを受け、次の判断を確定した。ここでいう採用は、比較対象とする目標または調査方針の採用であり、production UIへの接続を意味しない。

| ID | Product decision | R23-B follow-up |
| --- | --- | --- |
| UI-04A | 公開版の「高度な設定」配置を目標として採用し、実装は局所化して作り直す | `advanced-setting-parity` と `scoped-visual-parity` をprototype化 |
| UI-04B | 公開版のSettingForm alignmentを目標として採用し、対象fieldだけを作り直す | `setting-form-parity` と `scoped-visual-parity` をprototype化 |
| UI-04C | typographyの単独変更は保留する | UI-04A/B適用後の画面を再評価 |
| UI-05 | desktop/mobileとも現状のmulti-combo表示を受け入れる | production変更なし |
| UI-06 | wide/stack案は不採用 | compound-labelをprototype化 |
| UI-01 | 6pxは不採用、8pxは安全側候補、9px centerは要修正 | 10%近傍fixtureと9px adaptive-outwardを比較 |
| UI-07 | short-pageの問題を合成fixtureで検証する | baselineとflex shellを同条件で比較 |
| UI-08 | stable bounded表示は実装済みのまま維持する | 通常Damageのlower-bound原因と有限上界を技術調査 |

旧`visual-parity` prototypeは、過剰に広いselectorが無関係なfieldやswitchへ影響した不採用案として残す。READMEと各reportでは`REJECTED — do not use as production implementation`と明記する。R23-Bのform prototypeはproduction markupを変更せず、Playwright側のsemantic markerとvariant限定CSSだけで対象を絞る。Checkでは「高度な設定」markerを1件、Attackでは2件、SettingForm groupをCheckで1件、Attackで2件検出できなければcaptureを失敗させる。

Backtrackのcompound-label prototypeはmobileの外側`cols=6`と内側`6 / 6`を維持し、2つの入力を一つの視覚的なlabelでまとめる。各入力のaccessible nameはprototypeでも区別できるようにする。wide/stack案のような列幅や行高の変更は行わない。

Backtrack datalabelのstress fixtureは、表示閾値`10%`以上のsliceから`10%`に最も近いものを決定的に選ぶ。ordinaryと《屍人》の双方を探索し、8px center、9px center、9px adaptive-outwardを比較する。adaptive対象は最初は`10% <= slice < 15%`に固定し、leader line、外部legend、rotation、productionのChartSetter変更は行わない。

footerは実routeを短縮するreview-only操作でsynthetic short-pageを作り、同じ短縮条件のbaselineとnormal-flow flex variantを比較する。footerのfixed/absolute化は候補に含めない。short-pageでviewport下端に揃い、long-pageとdrawer stackingを壊さないことを計測する。

Damage期待値の技術調査ではproduction formatterを変更しない。まず`kazanari = 0`、防御ダイス0、非負固定値、`shihai = 0`、`yousei = 0`の通常caseに限定し、Scoreのtail certificateからDamageの有限上界を導けるかを調べる。導出できない場合も`insufficient certificate`として記録し、heuristicな点推定は追加しない。公開版3.1相当で現行結果が`lower-bound / —`になるfixtureを必須とする。

R23-B終了時もR23は`IN REVIEW`とし、production `src/**`、`public/**`、`schemas/**`、`generator/**`、`tooling/reference-data/**`、依存バージョンは変更しない。prototypeの成功はproduct ownerの視覚承認を代替せず、次の段階で個別のproduction採用を判断する。

## R23-B 実施結果（2026-09-11）

`2eee499`でDamage期待値のtail attribution調査を実装した。公開版3.1相当の`public-v3-1-default` fixtureを追加し、ScoreとDamageの明示first moment、support、overflow、tail certificate、Score期待値certificate、Damageのprojection uncertaintyを同じJSONレポートへ集約した。productionの`src/**`、`public/**`、`schemas/**`、`generator/**`、Worker、表示formatterは変更していない。

safe slice（`kazanari = 0`、防御ダイス0、非負固定値差、`shihai = 0`、`yousei = 0`、action Score期待値certificateあり）では、`floor(score / 10) <= score / 10`と10面ダイスの期待値5.5を使った有限上界候補を構成できた。ただし公開版fixtureの候補区間は`[3.080808080565, 8.806116748611]`であり、小数1桁表示の3.1を安全に確定できる幅ではない。reaction tailとの結合を粗く1で包むため、これはproduction certificateではなくR23-Cで狭い区間とmetadata契約を設計するための研究結果である。

safe slice外の8 fixtureは、利用可能な証明書だけでは有限上界を導出できず、レポートの`candidateBound.status`を`insufficient-certificate`とした。下限や区間の中点を一点の期待値へ変換する処理は追加していない。実行方法と全フィールドは[`r23-damage-expectation-investigation.md`](./r23-damage-expectation-investigation.md)に記載する。

R23-BのNodeテスト（92 files・964 tests）、ESLint、Markdown lint（56 files・0 issues）、production build（420 modules）、tail attribution report検査は成功した。R23は引き続き`IN REVIEW`であり、production UIの視覚採用判断は未実施である。

## R23 Form/Layout Follow-up — source-level prototype（2026-09-11）

UI-04A、UI-04B、UI-06について、post-build CSS patchではなく、実際のVue/Vuetify sourceを一時的に変更してbuildするprototypeを作成した。candidateのcapture開始前に対象sourceをバイト列単位で復元し、復元後の`src/**`に恒久差分がないことを確認している。production UI、計算core、runtime、Worker、公開asset、generator、依存バージョンは変更していない。

UI-04Aは3つのformへ`v-checkbox-btn`のpublic prop `inline`だけを追加した。Check 1件、Attack 2件の対象数を検証し、desktop/mobileの4scenarioでcheckboxのcontrol幅とsibling textまでのgapが縮小し、開閉操作とbrowser diagnosticsが成功した。UI-04Bは3つのSettingFormの最小値・最大値・表示モードだけを`density="comfortable"`へ変更し、desktop/mobileの4scenarioで最小値・最大値の高さが32pxから40px、上paddingが8pxから14pxになった。UI-06はouter `cols=6`、desktop `md=3`、nested `6 / 6`を維持し、app-owned group label、`role="group"`、2つの個別accessible nameを追加した。通常mobile、通常mobileの「不死者・悪夢」、desktopの3scenarioでgroup 1件とspinbutton 2件を確認した。

3候補の技術結果とJSON・画像の保存場所、制約、未採用状態は[`r23-vuetify-control-source-prototypes.md`](./r23-vuetify-control-source-prototypes.md)にまとめた。いずれもvisual approval待ちであり、productionへの採用は行っていない。
