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
| UI-08 | Damage期待値 | PRODUCT DECISION | stable boundedだけproduction採用。広い近似はaudit後に判断 | IMPLEMENTED / AUDIT PENDING |

### Productionへ入れてよい変更

R23-Aでproductionへ入れてよいのは、UI-08のpresentation formattingだけである。exact値、またはfiniteなbounded値のlower boundとupper boundを小数1桁へ丸めた結果が一致する場合に限り、その値を表示する。lower-bound、丸め結果が一致しないbounded値、NaN、Infinityは従来どおり`—`とする。この変更ではcalculation core、tail certificate、overflow、precision toleranceを変更しない。

UI-04A、UI-04B、UI-04C、UI-06、UI-07、UI-01、UI-05の見た目は、比較画像とgeometry/style metricsを作成するだけで、product ownerの直接レビューまでproductionへ採用しない。

### R23-Aの実験出力

reference、current、prototypeは同じroute、入力、viewport、scroll位置、animation完了状態で比較する。style metricsはsemantic locatorを優先し、reference/current/deltaをJSONへ保存する。pixel-perfect snapshot testやCIの自動pass/fail判定にはしない。出力は`experiments/r23-ui-review/output/`以下のgitignored directoryへ保存し、大量のbinaryをcommitしない。

Backtrackの6px、8px、9px比較はthrowaway worktreeまたは一時patchで行い、active branchへprototype sourceをcommitしない。visual parity、footer、responsive layoutについても同じ扱いとする。

R23-Aの終了状態は`IN REVIEW`であり、production visual parity changesは`NOT YET ADOPTED`、product-owner visual reviewは`REQUIRED`である。UI-08のstable bounded表示だけは`ADOPTED / IMPLEMENTED`とし、より広い近似表示は`AUDITED / AWAITING PRODUCT DECISION`で停止する。
