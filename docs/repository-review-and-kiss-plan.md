# リポジトリの独立レビューとコード簡素化計画

この文書は、ソース公開に向けて、現行実装の不具合と後続開発者の理解を妨げる複雑さを整理し、KISS原則に沿った改修単位へ落とし込むためのレビューである。対象は2026年10月4日に確認したコミット `717887f` の実装である。読者は、計算処理、画面状態、検証基盤を引き継ぐ開発者を想定する。

計算アルゴリズムと独立した数値テストには維持する価値がある。優先して変更するのは、資源制限より先に重い処理へ入る実行経路、入力と計算結果の対応、グラフの座標指定、および同じ責務を複数経路で処理する状態管理である。全体の書き直しやフレームワーク変更を前提にしない。

**グラフはアプリケーションのメインコンテンツであり、グラフ中心のUIを維持する。** サマリーを主役にする再配置、グラフの縮小、表示形式や既定表示範囲の変更は、この計画に含めない。グラフの正確さ、操作可能性、再計算中の連続性を守りながら、実装を簡潔にする。

不具合の再現と評価は2026年10月4日の調査時点を記録し、後日の対応状況は各follow-upへ追記する。B01は性能改善と数値安定性follow-upを完了し、B02とB05は2026年10月7日に修正・回帰確認を終えてCLOSED / GREENとした。B03とB04は2026年10月8日に修正・回帰確認を終えてCLOSED / GREENとし、S01からS06も実装・検証を終えた。S05は2026年10月9日にCOMPLETE / GREENとした。次の優先候補は実画面dogfoodingであり、その他の改善案は段階的に判断する。本書の作成によって既存ADRを変更したことにはならない。

## 評価の前提と検証範囲

### 確認したこと

- `src/`の入力、計算、範囲計画、非同期実行、表示変換、主要画面の経路を確認した。
- 現行の設計文書、ダイス仕様、CI、検証コマンド、参照資産との分離を確認した。
- Chromeで一般判定、攻撃、モバイル幅390pxの操作とアクセシビリティツリーを確認した。
- 過大入力の範囲計画と、受理される大きな入力のメインスレッド占有を実測した。

| 実行した検証 | 結果 |
| --- | --- |
| `npm run verify:core` | 成功。84テストファイル、1,008テスト、型検査、ESLint、Markdown lint、ビルド、差分検査を通過 |
| `npm run smoke:production:built` | 成功。ビルド済みアプリのCheck、Attack、Backtrack、遷移中の表示継続、資源拒否と復帰等を確認 |
| `npm run test:reference` | 成功。7テストファイル、54テストを通過 |
| 追加のブラウザ操作 | B02からB05を確認。既存スモークテストの合格だけでは検出されなかった |
| 追加の性能調査 | B01の拒否前の長時間処理と、受理される要求の同期実行を確認 |

テスト数は調査時点の値である。性能値はWindows上のローカル環境での単発観測であり、機種間比較やp95の性能保証を意味しない。Node側の計測ではViteのSSRモジュール読込後に計画処理だけを測り、ブラウザ側では開発サーバー上で計算モジュール読込後の要求を測った。本番ビルドのスモークテストと、これらの追加調査は区別する。

Python生成器の全再生成・全シミュレーション、FirefoxとSafari、ゲーム書籍原典との全面照合、依存パッケージの脆弱性監査は実施していない。代表条件で新たな確率計算の誤りは立証していないが、全入力域の数学的正しさを保証するレビューでもない。

### 優先度と証拠の区別

P1は公開前に優先して解消すべき停止・資源制御上の問題、P2は特定操作で結果の解釈や利用を妨げる問題とする。Bで始まる項目は再現した不具合、Sで始まる項目はコード簡素化案、Mで始まる項目は公開・保守上の改善案である。簡素化案を、不具合の発生が確認されたという意味では使用しない。

## 維持する設計と振る舞い

次の条件は、ファイル数や行数を減らすために削らない。

| 維持する条件 | 理由 |
| --- | --- |
| 静的SPAとブラウザ内計算 | 現在の用途に適しており、サーバーやDBを必要としない |
| グラフ中心の画面構成 | アプリケーションの設計思想であり、主要な利用体験である |
| DXの累積分布・順序統計量、DRと合計ダメージのFFT | 現行の数学的な計算方法は合理的である |
| support、overflow、確率の裾、期待値の区間 | 計算していない確率や不確実な値を正確な値として表示しないために必要 |
| ファンブル、自動失敗、通常の達成値0の区別 | 座標が同じでも成功判定上の意味が異なる |
| 有限support全体の計算と無限supportの明示的な裾の扱い | 旧固定長バケットの制約へ戻さない |
| 変更したコンボだけの再計算 | 複数コンボ利用時の応答性を保つ |
| 最新要求だけのcommit | 古い非同期結果が現在の入力や表示を上書きしない |
| スコア表示とダメージ表示の失敗の分離 | スコアだけ表示できない場合でも、有効なダメージ結果を失わない |
| 計算結果をcommitした後の表示失敗からの復帰 | 表示の再試行だけで、正常な計算を繰り返さない |
| 再計算中のグラフとサマリーの描画継続 | 直前の描画frameをUIだけで保持し、ちらつきとレイアウト変動を抑える |
| 参照実装、全列挙、独立した期待値 | 数式と実装を変更する際の比較基準になる |

描画frameの一時保持は、旧結果を現在の計算結果として採用することとは異なる。無効入力、資源拒否、計算失敗時の扱いはB04で明示する。現在のサマリーには値も保持する描画継続処理があるため、簡素化時に「高さだけの保持」と誤解して削除しない。

## 確認した不具合

### B01 資源制限より前の計画処理と同期計算による長時間停止（B01-Aで対象経路と数値安定性follow-upを解消）

優先度はP1。範囲計画を拒否するまでの処理と、受理後の同期実行の両方が対象になる。

関連実装は[ScoreRangePlanner.ts](../src/calculation/planning/ScoreRangePlanner.ts)の`planScore`、[ScoreTailModel.ts](../src/calculation/ScoreTailModel.ts)の`findTailCutoff`、[DxOrderStatistic.ts](../src/calculation/DxOrderStatistic.ts)、[BinomialSurvival.ts](../src/calculation/BinomialSurvival.ts)、[RangePlanner.ts](../src/calculation/RangePlanner.ts)の`applyPlanLimits`、[CalculationClient.ts](../src/runtime/CalculationClient.ts)である。

当初の実装では、`planScore`が計算量の検査より先に`findTailCutoff`を実行し、裾の評価で$L=\min(shihai+1,dice-shihai)$項の二項分布を直接加算していた。そのため、最終的に資源制限で拒否する要求も、拒否する前に大きな総和を繰り返していた。

| 観測 | 条件 | 結果 |
| --- | --- | --- |
| Nodeの範囲計画 | `operation: 'score'`、ダイス数100,000,000、C値10、技能0、妖精0、支配50,000,000、既定policy | 約13,637ms後に`cpu-work`で拒否 |
| Chromeの一般判定 | アクションはダイス数1,000,000、C値10、技能0、妖精0、支配500,000。リアクションは1D、C値10、技能0、効果なし。固定難易度5、表示0〜100、PMF | 約3,464msで正常終了。その間、事前に登録した0msタイマーは実行されなかった |

Chrome側は`calculationClient.calculateCheck`を直接呼び出し、開始前に`setTimeout`を登録して観測した。終了時点でもタイマーが未実行で、その後約3,465ms時点で実行された。数値の正しさとは別に、イベントループを長時間占有している。

期待する動作は、過大要求を安価に拒否できることと、受理要求によって長時間操作不能にならないことである。入力フォームに巨大値を入力して確認する方法はブラウザを停止させるため、再現・回帰確認はタイムアウト付きの子プロセスまたは専用ブラウザで行う。

当初は、裾探索前の下限検査、探索中の仕事量予算、証明書を含む再計測、残る長時間処理のWorker化または資源policyを候補としていた。しかしB01-Aでは、線形に増える二項和そのものを、同じ確率を保つ正則化不完全ベータ関数の単一計算経路へ置き換えた。対象ケースの再計測で長時間処理が解消したため、事前のWorker化やpolicy変更は行わず、追加の長時間停止が観測された場合に限り再検討する。AbortSignalの検査だけでは同一スレッドの同期処理を中断できず、Promiseや`async`を付けるだけでも応答性は改善しないという制約は引き続き有効である。

#### B01-A follow-up（2026-10-07）: 二項tailの高速化と再計測

二項survivalを$P(K\ge r)=I_q(r,n-r+1)$として、正則化不完全ベータ関数の修正Lentz連分数で評価する単一primitiveへ置き換えた。小rank/大rankでproductionアルゴリズムを切り替えず、`shihai=0`の最大値tailも変更していない。確率の意味はexact order statisticのままで、収束しない場合はfail-closedとする。

反復予算は$\min(100000,\lceil4\sqrt{L}+32\rceil)$で、operation estimateも同じ入力別予算に基づく。producerのtail評価回数だけでなく、`findTailCutoff`の最大42回と、`planScore`が最後に作るtail certificate用の1回を見積もる。有限supportでは存在しない裾探索を加算しない。resource policy閾値、Worker、固定dice上限、UIは変更していない。

| Node側の単発計測 | 変更前 | 変更後 |
| --- | --- | --- |
| 10,000万D / shihai 5,000万: planner | 13,391.7ms、`cpu-work`拒否 | 2.6ms、受理、23,110,395 operations、184,883,160 cpu work |
| 同ケース: DX producer | 未実行（planner拒否） | 0.7ms、working length 8、質量合計1 |
| 100万D / shihai 50万: planner | 133.0ms、受理 | 0.26ms、受理、2,338,299 operations |
| 同ケース: DX producer | 99.3ms | 0.13ms、working length 8、質量合計1 |
| 通常8D / 20D / 100D: planner | 0.20 / 0.12 / 0.09ms | 0.23 / 0.21 / 0.10ms |
| 通常8D / 20D / 100D: DX producer | 0.32 / 0.14 / 0.07ms | 0.31 / 0.12 / 0.05ms |

再現用の`npm run benchmark:dx-order-statistic`は、同じブラウザ内でplanner、DX producer、巨大中央rankのtail、100万Dのaction/reactionを含む`CalculationClient.calculateCheck`を測る。Windows 11、Node 22.23.2、Headless Chrome 154の単発実測では、10,000万Dケースのplan/producerが1.5/0.4ms、100万D Checkのplan/calculateが0.2/1.6msで、計算分布の質量合計はいずれも1、ChromeのLong Task entryは0件だった。巨大中央rank $n=100000000,r=50000001,q=0.5$のtailは0.7ms、SciPy 1.18.0の独立値との差は約$2.5\times10^{-13}$だった。

小規模の独立直接列挙、境界恒等式、単調性、SciPy 1.18.0から固定した大規模参照値をテストへ追加した。10,000万Dのdefault planner要求は、変更前の400,000,072 operations / 13.4秒での拒否から、23,110,395 operations / 2.6msでの受理になった。推定CPU workは既定閾値の内側で、実測したCheckを含む各要求に50ms以上のLong Taskは観測されなかった。

この時点では、再現したplanner・producer・Checkの長時間処理が解消したため、B01をCLOSEDとした。後日の数値監査で、非常に小さな二項確率を対称変換する際の精度follow-upが見つかった。以下にその対応を記録する。

#### B01-A 数値安定性follow-up（2026-10-07）

巨大な第二shapeと小さな確率$q$を持つケースで、`1 - q`から$q$を復元すると丸めにより入力精度が失われることを確認した。単一の正則化不完全ベータprimitiveは維持したまま、$x$とその補数を独立した既知値として二引数の修正Lentz連分数へ渡す形に変更した。$L$に応じた別アルゴリズム、resource policy閾値、iteration budget、operation estimateは変更していない。

回帰gridではproduction `oneDieTail()`が生成する$q$を用い、`dice=10^6,10^8,10^9,10^{12}`、`required=2`、中央rank、約90% rank、near-maximum rank、critical 8/10を含めた。`required=2`では二項tailの厳密な閉形式をPython Decimal 70桁で評価し、中央・その他の非端rankはSciPy 1.18.0固定値を使用した。SciPyの不完全ベータ結果は一部の極端な非対称ケースで閉形式と約$10^{-10}$異なったため、これらの参照値には採用せず、1兆D指定ケースではSciPyも閉形式と一致することを確認した。

追加検証では$1$兆D、`shihai=1`、C値10、境界116のtailがSciPy/高精度参照値`0.9084218055567689`と一致した。最新の単発計測はNode約0.014ms、Headless Chrome 154約0.1msだった。100M中央rankはNode約0.25ms、Chrome約0.5msで、SciPy参照との差は約$4.2\times10^{-15}$。1兆D cutoffについても$8\times10^{-9}$のerror budgetの前後で正しい境界を保ち、追加gridでnon-convergenceや負のPMF、分布mass逸脱、ブラウザLong Taskはなかった。詳細なfixtureと測定環境は[B01実装・測定記録](./archive/r30-prep-b01-order-statistic-tail.md)を参照する。

B01は性能経路と数値安定性の両方を回帰テストで確認したため、改めて**CLOSED / GREEN**とする。測定は代表条件であり、すべての端末・safe-integer入力に対する保証ではない。新たな実利用計測で50ms以上の計算Long Task、または反復上限に近い継続的なtail評価が確認された場合は、該当経路のadmissionまたはWorker境界を再検討する。

### B02 表示開始位置を変更すると難易度の線がずれる

優先度はP2。関連実装は[CheckChartConfig.ts](../src/features/check/ui/CheckChartConfig.ts)、[ProbabilityLineChartConfig.ts](../src/shared/chart/ProbabilityLineChartConfig.ts)、[ChartSeriesAdapter.ts](../src/shared/presentation/ChartSeriesAdapter.ts)である。

再現手順は、一般判定で対決判定を無効にし、難易度20、表示範囲の最小値10、最大値40を指定することである。「難易度: 20」と表示された線が、横軸の30の位置に描画される。期待位置は20である。

横軸のlabelsは10から40の値だが、軸はカテゴリ軸であり、annotationの数値20はカテゴリのインデックスとして解釈される。表示開始位置0では値とインデックスが一致するため露見しない。

KISSに沿う局所修正では、現在のカテゴリ軸を維持し、`target - displayWindow.min`を線の位置として渡す。表示範囲外では線を非表示にするなど、範囲外の動作を明示する。線のラベルと成功率の計算には元の難易度を使用する。文字列へ変換するだけで直るとは仮定せず、使用中のChart.jsとannotationの実際の座標を検証する。

数値軸と`{ x, y }`系列への統一は将来の選択肢だが、この不具合修正のために全チャートの形式を変更する必要はない。グラフの大きさ、配置、見た目は維持する。

完了条件は、最小値0と10、範囲内・境界上・範囲外の難易度、PMFと上側確率の各組合せで線が正しいこと。オプションオブジェクトの一致だけでなく、実際の軸座標または描画位置をブラウザで検証する。

#### B02 follow-up（2026-10-07）: 完了

Checkの表示要求を`ChartPanel`から`ScoreChart`へ渡し、カテゴリ軸と共有チャート設定を維持したまま、難易度が表示範囲内にある場合だけ`target - displayWindow.min`を注釈のカテゴリ位置として指定する。ラベルと成功率計算には従来どおり元の難易度を使う。境界は範囲内として扱い、範囲外と対決判定では注釈を表示しない。

設定テストは表示最小値0と10、範囲端、範囲外、対決判定、PMF・上側確率を検証する。本番ビルドのブラウザスモークでは、表示範囲10〜40の難易度10・20・40について実キャンバスの画素から線位置を読み、難易度20が両端の3分の1に位置すること、範囲外41では注釈が描かれないことをPMFと上側確率の双方で確認した。チャートデータ形式や横軸、成功率計算は変更していない。

B02は**CLOSED / GREEN**。実装と回帰検証はcommit `a47b7b2`に含む。

### B03 固定難易度で非表示のリアクション条件が計算を拒否させる

優先度はP2。関連実装は[CalculationClient.ts](../src/runtime/CalculationClient.ts)の`calculateCheck`と`createCheckRangeParams`、[CheckInputSnapshot.ts](../src/features/check/model/CheckInputSnapshot.ts)、[InputForm.vue](../src/features/check/ui/InputForm.vue)である。

再現手順は次のとおり。

1. 一般判定の対決判定を有効にする。
2. リアクション側の技能値を10,000,000にする。
3. メモリの資源制限による拒否を確認する。
4. 対決判定を解除する。

アクション側は初期条件のままでも、推定メモリ152.6 MiBの拒否表示が継続し、グラフが表示されない。固定難易度で不要になったリアクションを、引き続き正規化・計画・計算しているためである。

固定難易度ではリアクションを計算対象から外す。対決へ戻したときのために編集値をフォームへ残すことは可能だが、編集値の保持と有効な計算入力を区別する。リアクションを架空の0D分布に置き換えて型を満たす恒久対応は避け、S01の入力型へ移行する。

完了条件は、固定難易度ではリアクションの計算providerが呼ばれないこと、隠れたリアクションの資源超過がアクションへ影響しないこと、再度対決へ切り替えた場合だけその条件を検査すること。無効な難易度から対決へ切り替える逆方向も確認する。

#### B03 follow-up（2026-10-08）: 完了

Checkの計算入力を`fixed`と`opposed`のdiscriminated unionにした。固定難易度の要求は`action`と`target`だけを持ち、対決要求だけが`reaction`を持つ。これにより固定難易度ではリアクションの正規化、範囲計画、資源見積り、DX provider、Score計算を行わない。Checkのplanと結果も同じ`kind`で分岐し、固定難易度のscore tail予算は一側へ全量、対決では両側へ半量ずつ割り当てる。固定結果はreaction distribution/statisticsを持たない。

CalculationClientテストで、極端かつ不正なreaction値を残したままfixed計算が受理され、action側だけが計算されること、同じ値を含むopposed計算は資源制限で拒否されることを確認した。本番ブラウザスモークでも、reaction skill 10,000,000でopposedを拒否した後、fixedへ切り替えると表示が復帰し、opposedへ戻すと再び拒否されることを確認した。固定時もreactionのフォーム値は保持され、計算要求だけから除かれる。

B03は**CLOSED / GREEN**。S01のCheck入力契約とともにcommit `a1381ee`で実装した。

### B04 無効な入力に以前の計算結果が対応しているように見える

優先度はP2。関連実装は[ScoreForm.vue](../src/features/check/ui/ScoreForm.vue)の検証watch、[useCheck.ts](../src/features/check/model/useCheck.ts)、[SummaryPanel.vue](../src/features/check/ui/SummaryPanel.vue)である。

初期状態の一般判定でダイス数を1から-1へ変更すると、入力エラーと同時に旧グラフ、期待値6、成功率90%が残る。旧結果であることを示す説明はない。フォームは検証成功時だけ親へ通知するため、親は無効入力への変更を知ることができない。

正常な再計算中のframe保持は維持する。一方、無効入力は計算中とは異なる状態として親へ通知し、最新の計算要求を無効化する。推奨する最小対応は、無効入力中は結果を現在値として表示せず、入力エラーの修正を待つことである。グラフ領域の高さを保持する場合も、旧確率値を現在値として露出させない。

AttackとBacktrackにも検証成功時だけ通知するフォームがあるため、同じ状態通知方針を適用する。ただし、今回具体的な旧数値まで再現したケースはCheckであり、他画面の回帰ケースは実装前に追加する。

完了条件は、負数、空欄、小数、効果の非対応組合せについて結果の対応が明確であること。入力を無効にした後に古い非同期計算が完了しても旧結果をcommitしないこと。有効値へ戻せば計算とグラフ表示が復帰すること。

#### B04 follow-up（2026-10-08）: 完了

Check、Attack、Backtrackの各フォームは、入力draftの変更に対して`LatestValidationGate.begin()`を行い、`validating`を親へ同期通知してからフォーム検証を待つ。最新ticketだけが`valid`または`invalid`を通知でき、props同期とunmount後の検証完了は無視する。featureは`validating`の時点で旧要求をinvalidateし、遅れて完了した結果をcommitさせない。Checkではdifficulty、action、reactionのvalidation状態を別々に保持し、固定難易度では非表示reactionを計算可否に使わない。

検証中は直前のready frameを一時保持し、検証がinvalidと確定した時点で現在結果、グラフ、サマリーをclearする。有効値へ戻ると最新snapshotで再計算する。Attackでは該当comboとtotalだけをinvalidateし、無関係なcombo recordは保持する。Backtrackはinvalid確定時にpresentationと`resultReady`をclearする。Attackのvalidation開始では古いcommit権限を失効させながらscore frameを保持する専用runner経路を設け、既存のvalid-to-valid canvas continuityを維持した。

controllerテストで検証中の古いPromise、invalid確定、修正後の新しい結果だけがcommitされることを確認した。本番ブラウザスモークではCheckの負数入力と復帰、Attackのaction入力無効化と復帰、Backtrackの減少ダイス無効化と復帰を確認した。既存のvalid-to-valid graph・summary/footer continuityも維持された。

B04は**CLOSED / GREEN**。Check・Attack・Backtrackで同じ状態通知原則を適用し、invalid確定時に旧結果を残さない。Attack／Backtrackと本番ブラウザ回帰のcommitは`6c4a463`。

#### B04 follow-up: 高度な設定とvalidation lifecycle（2026-10-08）: 完了

Checkの《妖精の手》等、Attackの《妖精の手》等・《支配の領域》・《風鳴りの爪》の表示切替後も、フォームが`validating`を通知してから次tick後にactive fieldsを再検証する。featureはトグル操作だけではvalidation blockerを解除せず、最新の`valid`通知でのみ正規化済み入力を採用して再計算する。これにより無効な基本入力はON/OFF後も無効のまま保たれ、無効な高度設定だけならOFFで自動的に無効項目を0へ戻して結果を復帰する。

Attackではinvalid draftを持つコンボを畳んで破棄したとき、他のvalidation blockerがなく、readyな計算も残っていなければ最後に確定した入力から再計算する。validation中でreadyな表示が維持されている場合は再計算を重ねない。コントローラーテストと本番ブラウザスモークでこの切替・復帰条件を固定した。B04をCLOSEDのまま維持する。この記録時点では後続のS02からS04が完了し、次の作業はS05/S06だった。

### B05 モバイルのコンボ操作に読み上げ可能な名前がない

優先度はP2。関連実装は[InputForm.vue](../src/features/attack/ui/InputForm.vue)のコンボ操作ボタンである。

幅390pxの攻撃画面でアクセシビリティツリーを確認すると、コンボの「畳む」「複製」「削除」は名前のないbuttonとして並ぶ。テキストへ`hidden-sm-and-down`を付け、代替の`aria-label`を指定していないためである。

見た目は維持し、各ボタンへ常時有効な名前を付ける。複数コンボを区別できるよう、例えば「コンボ1を複製」とする。折り畳み操作には開閉状態も伝える。アイコンのtooltipだけを名前の代わりにはしない。

完了条件は、390pxとデスクトップ幅の両方で、操作名と対象コンボをアクセシビリティツリーから識別できること。キーボード操作も確認する。

#### B05 follow-up（2026-10-07）: 完了

コンボの畳む・開く、複製、削除ボタンに、空白でないユーザー指定名を使った対象別アクセシブル名を付けた。名前が空または空白だけなら表示上の序数（例: `コンボ2`）を使う。畳む・開くボタンはそれぞれ`aria-expanded=true/false`を公開する。ラベル表示、ボタン配置、クリック動作は変えていない。

本番ビルドのブラウザスモークで390pxとデスクトップ幅の両方からボタン名を取得し、Enterで折り畳み、Spaceで再展開するキーボード操作と`aria-expanded`の遷移を確認した。さらに、コンボ追加後の空白名フォールバック、ユーザー名へ変更した場合の更新、複数コンボの対象名の区別を検証した。

B05は**CLOSED / GREEN**。実装と回帰検証はcommit `a47b7b2`に含む。

## KISS原則をこのリポジトリへ適用する基準

ここでいう簡素化は、行数を減らすことではなく、一つの変更を理解するために追う状態、分岐、呼び出し経路を減らすことである。数式に必要な場合分けや非同期要求の所有権は残し、使用していない汎用性と同じ情報の重複管理を減らす。

- 使い道が一つの処理を、将来の拡張だけを理由にfactoryやstrategyへしない。
- 入力、結果、描画frameの所有者を決め、同じ情報を複数箇所から更新しない。
- 型で分かる内部データと、検証が必要な外部入力を区別する。
- 異なるユーザー操作に独立した成功・失敗が必要なら、その独立性を残す。
- 共通化は、実際に同じ責務を持つ処理に限る。Check、Attack、Backtrackを一つの汎用フォームや巨大な汎用controllerへ統合しない。
- 一度に入力契約、計算アルゴリズム、実行方式、ディレクトリ構成を変更しない。
- 新しい状態管理ライブラリ、DIコンテナ、イベントバス、汎用ジョブ基盤を初期解として導入しない。

以下の型名とコード例は設計案であり、現行APIではない。ただし、後段に完了記録がある項目では、そのfollow-up記載を現在の実装契約の正本とする。

## 具体的なコード簡素化

### S01 編集中の値と計算に使用する入力を分ける（完了）

フォームのdraftと計算要求を分離し、Checkの有効な計算入力を次のdiscriminated unionとして実装した。

現在のCheck計算入力契約は次のとおりである。

```ts
type CheckCalculationInput =
  | { kind: 'fixed'; action: ScoreInput; target: number }
  | { kind: 'opposed'; action: ScoreInput; reaction: ScoreInput }

type DraftValidation<T> =
  | { status: 'validating' }
  | { status: 'invalid' }
  | { status: 'valid'; value: T }
```

フォームは空欄等を含む編集値とフィールド別エラーを所有し、featureは検証済みの最後の値と状態を管理する。`createCheckInputSnapshot`が有効な値から計算要求を作り、固定難易度ではreaction propertyを生成しない。計算recordは実行された要求snapshotを保存するため、後からdraftを変更しても結果の意味は変わらない。攻撃の防御モードについては既存の[ScoreResolution](../src/domain/ScoreResolution.ts)を活用し、同じ目的のunionを重ねて増やさない。

副作用の順序は「`LatestValidationGate.begin()`、`validating`を同期通知、フォーム検証、ticketが最新なら`valid`または`invalid`を通知」とする。featureは`validating`の通知時点で現在要求のcommit権限を無効化する。検証完了を待つ間に旧要求がcommitする穴を残さない。

検証待ちの`validating`と検証済みの`invalid`を区別する。`validating`では直前frameを一時保持できる。有効ならそのまま再計算中の描画継続へ移り、無効と判定された時点で結果とグラフを消去する。固定難易度ではactionとdifficultyだけを計算可否の判定対象にし、非表示reactionのdraftがinvalidでも妨げない。

固定結果にはreaction distribution/statisticsを含めず、対決結果ではaction/reactionの両方を保持する。Check API、planner、record、presentationはこの判別可能な入力と結果を通している。

S01からS04は**完了**。S06-AではAttackの操作別無効化matrixと非同期表示revision競合を回帰化し、S06をCLOSED / GREENとした。S05はS05-A/Bの局所整理と回帰検証を終えてCOMPLETE / GREENであり、状態モデル全体の置換は不要と判断した。

### S02 Checkの初期計算と更新計算を同じ経路へ揃える（完了）

`useCheck`を同期関数にし、初期要求を`onMounted`から通常のcoordinatorへ一度送る形に揃えた。成功時のrecordは`context.request.input`から作り、初期・入力更新・coverage再計算に共通するsnapshot、error、Abort、commitの経路を使う。`CheckPage.vue`のtop-level awaitと`runInitialCalculation`を削除し、Check以外にasync setupがないことを確認したうえで[MainArea.vue](../src/layouts/MainArea.vue)の`Suspense`も外した。ルートのdynamic importは維持している。

初回のloadingと失敗は既存のfeedbackで表し、初回に古い結果を表示しない。初期計算のerrorまたはresource rejection後も、通常のvalidated input更新から再計算できる。Checkの入力フォームとdisplay formにはmount時に初回要求を重ねるimmediate watcherがなく、初回要求は一つのままである。

Vueの実mount/unmountを使うlifecycle harnessで、pending初期要求のsignal abort、遅延range plan/resultの非公開、dispose後の新規要求抑止を検証した。初回要求一度、error/rejectionからの復帰、グラフ・サマリーの既存描画継続も回帰確認した。2026年10月8日に`verify:core`（85 test files / 1,030 tests、typecheck、ESLint、Markdown lint 114 files / 0 issues、build、diff check）と`verify:browser`（production smoke）を通過した。

### S03 汎用coordinatorから未使用のコピー機構を取り除く（完了）

`CalculationRequestCoordinator.ts`から既定`cloneRequestValue`、AbortSignal/Payload/exotic objectの判別、再帰generic cloneを削除した。`snapshotRequest`を必須引数にし、TypeScript契約に加えてJavaScriptからの誤用も`TypeError('snapshotRequest must be a function')`でfail-fastにする。

Check、Attack、Backtrackのproduction runnerは、既存のfeature-specific snapshotを明示している。テストcoordinatorもfixtureのshapeに必要な専用copy functionを渡し、queued `payload.value`のmutation isolationを維持する。generic deep cloneを`structuredClone`へ置き換えてはいない。

coordinatorの最新要求選択、実行中一件＋最新待機一件、Abort合成、commit/plan/errorのstale guard、dispose、resource rejection、snapshot failure処理は維持した。

汎用structured/exotic cloneテストを削除し、nested queued snapshotのalias防止、snapshot failure時の最新revision優先、古いplan/result/errorの抑止、外部Abort、disposeを検証している。型fixtureは`snapshotRequest`の必須性をnegative contractで固定し、runtime misuseもテストする。公開APIとして汎用cloneを維持する必要はなく、production外の利用箇所もない。

### S04 Attackの表示生成を一経路にする（完了）

通常commitでは、`commitAttackCalculationExecution()`が数値recordを保存し、`getCommittedAttackCalculationSnapshot()`から復元したbatchとrange planを使って`createAttackPresentation()`を一度だけ呼ぶ。そのbaseを`projectPresentation`経由で`createAttackDisplayPresentationFrom()`へ渡し、baseとdisplayを同時にcommitする。表示範囲・modeだけの更新も同じprojectorを使い、`state.basePresentation`を再利用する。baseが未commitの場合だけ、所有済み計算recordから再生成する。

`AttackRunner`のfactory契約はbase生成とbaseからのprojectionの2つに整理した。raw batchからdisplayを別途作るRunner経路、`AttackRunnerPresentation`/`TPresentation`のunion、不要な型castを削除した。`createAttackDisplayPresentation()`はbase生成とprojectionを順に呼ぶ薄いconvenience APIとして残るが、production Runnerからは呼ばれない。productionの`useAttack`は引き続き`DEFAULT_DISPLAY_RANGE_PLANNER_POLICY`を使い、damageとscoreそれぞれの表示要求をprojectionへ渡す。

presentation生成が失敗しても、正常にcommitされたコンボrecord、total record、combo順、range planは残る。base生成失敗とprojection失敗のどちらも、再試行では計算をやり直さず回復する。presentation errorの回復と後続calculation errorの所有関係、stale request抑止も維持した。

S04固有のintegration testでは、通常commitのbase生成が1回であること、初回projectionとdisplay-only更新が同じbase objectを使うこと、表示更新で`calculateAttack()`と`calculateTotalDamage()`の呼び出しが増えないことを確認した。base生成失敗とdisplay projection失敗の再試行では、計算recordを維持したまま追加計算なしでreadyへ復帰する。score/damageの独立性、coverage拡張、latest-wins、invalid/rejection時のclearも既存回帰テストで確認した。

2026年10月8日の`npm run verify:core`は85 test files / 1,030 tests、typecheck、ESLint、Markdown lint（114 files / 0 issues）、production build（489 modules）、diff checkを通過した。`npm run verify:browser`もproduction smokeに成功し、Attackのdamage/score chart、score-only coverage、通常再計算中のcanvas・summary/footer continuity、combo rename後のseries identity、invalid/rejectionからのclearとrecoveryを確認した。precomputed data request、console warning/error、same-origin HTTP errorはいずれも0件だった。

したがってS04は**CLOSED / GREEN**。通常commitとdisplay-only更新は単一のbase-to-display経路を使う。画面上の変更はなく、dogfood UI backlogも別の保留項目として維持する。

### S05 Attackの計算状態と表示状態の更新責任を整理する

S04完了後に取り組む。最初から`AttackRunner`を全面置換しない。

現状は計算record、合計record、base presentation、display presentation、feedback、スコア表示lifecycle、複数revisionの関係を追う必要がある。特に計算と表示のエラーを同じfeedbackへ載せると、表示の再試行が計算エラーを消さないよう、エラーの由来を別途管理しなければならない。

保存する情報の所有者を以下に限定する。

| 情報 | 所有者 | 更新条件 |
| --- | --- | --- |
| コンボID、名前、開閉、編集値 | featureのフォーム状態 | ユーザー編集 |
| 計算に使う正規化済みsnapshot | 要求の生成処理 | 有効な入力の確定 |
| コンボ計算recordと合計record | 計算のcommit処理 | 最新の入力に対応する計算完了 |
| base presentation | 表示変換のキャッシュ | 対応する計算recordの変更、表示再試行 |
| スコア表示要求と状態 | スコア表示処理 | スコアの範囲・mode変更、必要coverageの更新 |
| ダメージ表示要求と状態 | ダメージ表示処理 | ダメージの範囲・mode変更、計算recordの更新 |
| 直前のグラフとサマリーのframe | Vueの描画コンポーネント | loading中の一時保持、成功時の置換、無効・拒否・失敗時の消去 |

内部の計算状態は、例えば次のように不可能な組合せを作りにくい形へ寄せる。型定義は概念例で、既存の警告やplanの情報を削除する指示ではない。

```ts
type CalculationState<T, P> =
  | { kind: 'idle' }
  | { kind: 'running'; revision: number; plan: P | null }
  | { kind: 'ready'; revision: number; value: T; plan: P }
  | { kind: 'rejected'; revision: number; plan: P }
  | { kind: 'error'; revision: number; error: unknown }
```

再利用可能な計算recordはこの実行状態とは別に保持できる。ただし、現在の入力と一致しているかを必ず検査してから表示する。状態とrecordの両方が同じ値を独立して更新できる設計にはしない。

計算エラー、スコア表示エラー、ダメージ表示エラーを、それぞれの処理が所有する。共通の通知UIへ渡す値は導出する。これにより、別のエラーを誤って消さないための由来管理を減らせる。ただし、新しい計算エラーが表示再試行で消えないことを先にテストしてから、既存の`feedbackErrorProvenance`等を削除する。

スコア表示とダメージ表示のrevisionは、一つに統合することを目標にしない。独立して変更される要求には独立したidentityが必要である。同じ意味のrevisionが複数箇所にある場合だけ統合する。

### S06 操作ごとの無効化規則を固定する

S05の状態変更を次の表に照らして実装する。動作を変えずに制御を整理するための基準である。

| 操作 | 数値計算 | 表示と状態 |
| --- | --- | --- |
| コンボ名の変更 | 不要 | 系列IDを保ってラベルだけ更新 |
| コンボ入力欄の開閉 | 不要 | 入力欄の表示だけ変更。計算対象の除外とは解釈しない |
| 一つのコンボの有効な数値変更 | 変更コンボと必要な合計を計算 | 古い要求を無効化し、最新snapshotに一致する結果だけcommit |
| 無効入力への変更 | 新しい数値計算を開始しない | 現在結果としての表示を無効化し、遅延した旧結果も採用しない |
| 表示modeのみ変更 | 不要 | 同じ計算recordから表示を導出 |
| coverage内の表示範囲変更 | 不要 | 対象グラフを再投影 |
| スコアのcoverage不足 | 拡張に必要な計算を実行 | ダメージ結果を維持。現在の原子的なbatch更新契約を勝手に部分commitへ変えない |
| スコア表示だけの拒否 | 不要 | スコア表示だけ拒否し、正常なダメージを維持 |
| 表示変換の失敗 | 正常なrecordを維持 | 表示の再試行を可能にする |
| 入力に対する計算拒否 | 拒否された計算結果を作らない | 現在値として旧結果を表示しない |
| 画面離脱 | 不要な処理を取消 | 遅延commitを禁止。実際の処理終了に合わせて資源を解放 |

表示範囲と数値計算のcoverageが関係すること自体は必要な複雑さである。すべての表示変更で再計算する実装へ戻すことも、すべての表示変更を計算と無関係に扱うことも避ける。

### S06-A 表示revision競合と操作別回帰matrix（完了）

Coordinatorのrevisionは計算要求のidentityである。新しい計算要求、invalidate、disposeは進行中の古い要求をAbortし、executorがAbortを無視して後から完了してもcommitを許さない。commit時にはさらに、snapshotした入力が現行入力と一致することを`isAttackInputCurrent()`で確認する。damage表示とscore表示のrevisionはこの計算identityとは別であり、既存数値recordを新しいwindow/modeへ投影し直すための表示要求identityである。

履歴上、`a90b769`でCoordinator snapshot時に両表示revisionを`null`へ置き換え、revision guardを実質無効化していた。表示変更だけを理由に有効な数値計算までrejectしない意図とは整合するが、要求時のdisplay snapshotが後着commitで再利用され、表示専用要求Bが計算要求Aの古いwindow/modeに戻る穴があった。S06-Aではrevisionをsnapshotへ保持する一方、revision不一致を数値commitの拒否条件にはせず、damageはRunnerが保持する最新のdisplay request、scoreは最新のscore lifecycle requestで再投影する。score lifecycleが`suppressed`ならscore payloadだけを抑止する。したがってscore-only rejectionはCoordinator revisionや有効なdamage計算を取り消さない。

Deferred PromiseによるCase Aは修正前に再現した。既存recordを保ったままforce計算Aを待たせ、coverage内のdisplay-only要求Bをcommitした後にAを完了すると、旧実装では数値recordは正常更新されるが表示requestがAへ戻った。修正後はAの数値recordをcommitし、最終projectionはBを使う。別のscore-only projection testでは、計算Aの進行中にcoverage内のscore表示要求Bを計算なしで反映し、A完了後もdamageとscoreの両方が最新要求を保つことを確認する。Case Bではscore coverage拡張Aの完了前にdamage request Bを入力すると、Bに必要なcoverage計算がCoordinatorの最新要求となり、Aのsignalがabortされる。Aの遅延完了はcommitされず、拡張scoreとdamage request Bの組合せがcommitする。Case Cは既存の3種のscore-only invalid/resource/error testを維持し、score rejection後も進行中のdamage batch commitと数値recordを保つ。

操作別matrixの検証先は以下の通り。記載した既存テストは今回重複追加せず、必要な不足分としてdamage表示Case A、score表示revisionの独立test、score coverage競合Case Bを追加した。S04で加えたbase再利用、projection失敗後のretry回帰は削除していない。

| 操作・契約 | 回帰テスト |
| --- | --- |
| コンボ名変更・開閉は数値計算を起こさない。rename後も系列identityを維持する | `attackFeatureController.test.js`: `does not calculate for labels, visibility, or zero-valued advanced toggles`; `scripts/production-browser-smoke.mjs`: combo rename / canvas identity assertions |
| hidden invalid draftの破棄は既存復帰条件を守り、readyな結果を重複計算しない | `attackFeatureController.test.js`: `restores the last valid calculation when a hidden invalid combo is discarded`, `does not recalculate when a hidden validating combo still has a ready result` |
| 1コンボの有効値変更は変更recordと合計だけ再計算 | `attackFeatureController.test.js`: `recalculates only a changed combo and re-aggregates the total`; `attackIncrementalRunner.test.js`: `retains unaffected records when one combo fails and retries only that combo` |
| invalid化では新要求を出さず、旧結果をclearし後着commitを防ぐ | `attackFeatureController.test.js`: `drops an invalid combo side and ignores its delayed result before recovery`; `attackState.test.js`: `rejects stale or malformed executions before writing records` |
| 表示mode/windowが既存coverage内ならprojectionだけを更新 | `attackFeatureController.test.js`: `reuses the committed damage presentation for a display-only change`; `attackDisplayIntegration.test.js`: `reuses the committed canonical presentation when only the display changes` |
| damage計算中のscore-only表示変更は計算なしで反映し、その後のcommitも最新score requestを使う | `attackDisplayIntegration.test.js`: `uses the latest score-only projection when numeric work commits` |
| score coverage不足では必要なbatch計算だけ行い、damage frameを保つ | `attackDisplayIntegration.test.js`: `recalculates the canonical batch once when score coverage is missing`, `clears only public score while a deferred score expansion is running`, `keeps the latest damage request across deferred score coverage expansion` |
| score-only rejectionはscoreだけ拒否しdamageと数値recordを保持 | `attackDisplayIntegration.test.js`: `rejects a score display resource plan without clearing damage or calling the client`, `keeps an in-flight damage batch commit after score-only invalid/resource/error` |
| damage display rejectionは現在表示を拒否し、計算recordを再利用可能に保つ | `attackFeatureController.test.js`: `rejects a damage display resource plan without starting a calculation`, `recovers a rejected damage display from committed records without recalculation`; `attackDisplayIntegration.test.js`: `rejects a display resource plan without calling the calculation client` |
| presentation失敗は数値再計算なしでretryする | `attackIncrementalRunner.test.js`: `retains calculation records when display projection fails`, `retains calculation records when base presentation creation fails`, `rejects an invalid presentation and recovers feedback without recalculation` |
| 後続の計算失敗をpresentation retryで消さない | `attackIncrementalRunner.test.js`: `does not let a new combo calculation error inherit presentation recovery` |
| valid→validの表示-only更新や遅延commitでも最新window/modeを維持 | `attackDisplayIntegration.test.js`: `commits pending numeric work with the latest display-only projection` (Case A), `keeps the latest damage request across deferred score coverage expansion` (Case B), `keeps rapid display changes latest-wins` |
| 画面離脱でAbortし、dispose後の結果をcommitしない | `attackFeatureController.test.js`: `does not commit a stale result after controller disposal`, `disposes the canonical runner and prevents later execution`; `attackDisplayIntegration.test.js`: `suppresses a recalculation result after its external signal aborts` |

S05の状態所有者監査では、`combos[].data.calculation`と`totalCalculation`の通常commit・入力無効化は`AttackState`のcommit/invalidate関数へ集約されていることを確認した。Runnerのtotal-stage errorに残っていた三フィールドの直接clearは`invalidateAttackTotalCalculation()`へ寄せた。`basePresentation`/`displayPresentation`は`AttackState`のatomic commitに加えてRunnerのstart/error経路がclearし、`displayPresentation`はRunnerのrejectionと`useAttack`のpreflight/error経路からもclearされていた。S05-Aでは、この異なる無効化範囲を二つの小さなhelperへ集約した。

`state.feedback`は計算進捗と計算失敗・presentation失敗を同じ主通知へ出すため共有される。presentation retryのみがpresentation errorをclearし、計算errorを残す必要がある。`feedbackErrorProvenance.kind`と`presentationErrorToken`はこの区別に使われるが、provenanceの`revision`は一度も読まれていなかったため削除した。`displayFeedback`は`useAttack`のpresentation adapterとpreflight/error処理、state clearから更新される。`scoreDisplayFeedback`はRunnerのloading/abortとscore lifecycle failureに加え、`useAttack`のscore presentation/resource処理およびstate clearから更新される。後二者の複数writerを統合する場合は、数値計算状態の再設計ではなく、feedback値の公開・導出境界を先に定める。

| 状態 | 現在の更新責任・所見 |
| --- | --- |
| `state.combos[].data.calculation` | `AttackState`のatomic calculation commit、combo invalidation、全state clear。Runnerは専用commit APIを呼ぶ |
| `state.totalCalculation` | `AttackState`のcalculation commit、total invalidation、全state clear。Runnerのtotal error clearは今回共通helperへ統合 |
| `state.basePresentation` | `AttackState.commitAttackPresentation()`でdisplayとatomic commit。Runnerが計算開始・presentation失敗時にclear。total invalidation helperもclear |
| `state.displayPresentation` | `AttackState`のatomic commit、Runnerの計算開始・失敗・拒否、`useAttack`のpreflight/validation結果処理から更新。clear scopeを区別する必要あり |
| `state.feedback` | `CalculationFeedback`のmutatorをRunnerから呼ぶ。計算とpresentationのerrorを同じUI通知に出し、provenanceでretry時のclear可否を分ける |
| `state.displayFeedback` | `useAttack`のpresentation adapter、display preflight/rejection/error、`AttackState.clearResults()`が更新 |
| `state.scoreDisplayFeedback` | Runnerのscore lifecycle loading/abort/error、`useAttack`のscore adapter/preflight/rejection/error、`AttackState.clearResults()`が更新 |
| `displayRevision` | Runner内だけでdamage projection要求の新旧を示す。古い値はnumeric commitをrejectせず、最新requestの選択に使う |
| `scoreDisplayLifecycle` | Runner内だけでscore request、revision、enabled/recalculating/suppressed状態を所有。score-only rejectionからdamageを独立させる |
| `feedbackErrorProvenance` | Runner内だけ。`kind`はpresentation retryがclearしてよいerrorかを判断する。未参照だった`revision`は削除 |
| `presentationErrorToken` | Runner内だけ。Coordinator error callbackでprojection exceptionを計算例外と区別するため、該当error objectのidentityを保持 |

`npm run verify:core`は85 test files / 1,035 tests、typecheck、ESLint、Markdown lint（114 files / 0 issues）、build（489 modules）、diff checkを通過した。`npm run verify:browser`のproduction smokeも成功し、Attackのscore-only coverage、chart/summary/footer continuity、combo rename後のchart identity、invalid/rejectionからのclear/recoveryを確認した。precomputed-data requests、console warnings/errors、same-origin HTTP errorsはいずれも0件である。

#### S05-A presentation invalidation scopeの一本化（2026-10-08）: 完了

`AttackState`に`clearAttackPresentations()`（baseとdisplayの両方）および`clearAttackDisplayPresentation()`（displayのみ）を追加し、`clearResults()`、`invalidateAttackTotalCalculation()`、`AttackRunner`、`useAttack`の同じ意味を持つ直接clearを置き換えた。display rejectionではbase presentationを保持して再利用し、presentation失敗や数値record更新前後では必要なpresentation cacheだけを破棄する。両helperは数値record、feedback、revision、score lifecycleを変更しない。`attackState.test.js`で各範囲、参照保持、feedback不変、二重実行の冪等性を検証し、`attackDisplayIntegration.test.js`のresource rejection回帰でもbase再利用を確認する。S04のbase再利用・projection失敗後retry、S06の表示revision競合、invalid/dispose時のclear契約は維持する。

#### S05-B Attack feedback/error公開責任の整理（2026-10-09）: 完了

3つのfeedback laneは責任の異なる更新段階を維持する。`state.feedback`の数値計算進捗・拒否・失敗とpresentation失敗の主通知はRunnerが管理し、`feedbackErrorProvenance.kind`および`presentationErrorToken`でpresentation retryが解消してよいエラーだけを識別する。damage側の`state.displayFeedback`はpresentation変換・preflight・表示失敗を公開する。score側の`state.scoreDisplayFeedback`ではRunnerがcoverage再計算中のloading/Abort等を扱い、featureがpreflightとprojection結果を公開する。`AttackState`のfull clearは既存どおりfeedbackをidleへ戻す。

重複していたfeature内のfeedback field更新をlane専用の`publishDisplayLaneFeedback()`と`publishScoreDisplayFeedback()`へ集め、どちらも`Object.assign`で既存のreactive object参照を保つ。display rejectionは`publishDisplayFeedback()`の既存score抑止経路を再利用し、同じdamage変換を複製しない。preflightはclearとpublication関数を連続して二重実行せず、publication側が一度だけpresentationをclearする。scoreのresource rejection・error・idle更新も同じpublisherを通す。Runnerの`onError`はdamage laneのみをerrorにし、別の外側例外処理だけが従来どおりscore laneにもerrorを公開する。この違いは明示optionとして保った。

`feedbackErrorProvenance.kind`と`presentationErrorToken`は削除していない。数値record後のbase生成/projection失敗からは計算を再実行せず回復でき、後発のcalculation errorはpresentation retryで消えないことを既存の`attackIncrementalRunner.test.js`で確認する。score-only rejection/error後にもdamage表示とbatch commitを維持するS06の3ケース、damage rejection後の同じbase・recordを用いた再投影、invalid/dispose後の遅延結果抑止も維持する。新たなdispose回帰では後着計算が完了しても3つのfeedback laneとpresentationを書き戻さないことを確認した。

`npm run verify:core`は85 test files / 1,036 tests、typecheck、ESLint、Markdown lint（114 files / 0 issues）、build（489 modules）、diff checkを通過した。`npm run verify:browser`のproduction smokeも成功し、Attack初期表示、damage/score表示、coverage再計算、display rejectionからの復帰、invalid→valid、chart/summary/footer continuityを確認した。事前計算データ要求、console warnings/errors、same-origin HTTP errorsはいずれも0件である。

S05は**COMPLETE / GREEN**。feedback laneの処理段階は別責務として残り、追加の統合で状態や抽象化を増やす価値はないと判断した。次の優先候補は保留中の実画面dogfoodingと、そこから確認された具体的なUI修正である。S07/S08や公開準備へ自動的には進まない。

### S07 検証とコピーを境界へ集める

入力フォーム、公開runtime API、Worker message、外部参照データは検証が必要な境界である。計算中の有限性、確率総和、負値、配列範囲の検査も残す。一方、内部で自分が作った型付きDTOについて、各層で同じ構造検査とコピーを繰り返す必要があるかは個別に確認する。

まず[CalculationClient.ts](../src/runtime/CalculationClient.ts)の`copyTotalDamageEnvelope`を整理する。現状は不正な結果やテストダブルを考慮し、検証に失敗しても元の値を返す。正しい`DistributionEnvelope`を受け取る契約と、外部データを検証する入口を分ける。テストは有効な最小fixtureを使用し、productionへテスト専用の寛容な経路を残さない。

コピーの原則は、mutable draftから要求snapshotへ移るとき、共有する可変配列の所有者が変わるとき、Workerへtransferするときに明示することである。待機中の呼び出し元による変更から守るcopyは削除しない。`readonly`や`Object.freeze`だけで`Float64Array`の要素まで不変になるとはみなさない。

`calculateTotalDamage`でのsnapshotとaggregation準備時のsnapshotのように、近接するコピーがある箇所は、どちらが外部aliasを切る責務を持つかを決めてから削減する。先にleaseを取る変更も、見積り前の入力検査やsnapshotの安定性に影響するため、単純な順序入替えとして扱わない。

完了条件は、不正な外部入力を拒否すること、待機中にcaller-owned配列を変更しても計算内容が変わらないこと、内部契約違反が明確に失敗すること。コピー回数の削減だけで安全性を判断しない。

### S08 名前とファイル配置は責務の整理後に変更する

現行の`features`、`domain`、`calculation`、`runtime`、`shared`の分離は活用する。`core`と`calculation`、`components`と`shared`、`views`と`features`の区別をREADMEに短く説明し、必要な移動を最後に限定して行う。

直ちに行える整理は、TypeScript型と重複する`@typedef`の削除、型から分かる引数構造を再掲した長いコメントの削減、移行前の呼び出し形を残すだけのaliasの利用確認である。コメントには数式の根拠、裾の意味、snapshotやAbortの必要性を残す。

一つの実装だけで使う型は、その実装と同じファイルへ置ける。複数の境界が共有する入力・結果型は別ファイルに残す。型ファイルを一律に統合したり、一定行数以下へ機械的に分割したりしない。

Homeを`features/home`へ揃える程度の移動は可能だが、数値計算や状態管理の改修と同じ変更へ混ぜない。`DamageAggregation`等の分離を、ファイルが多いという理由だけで再統合しない。準備、見積り、実行の境界には資源管理上の意味がある。

## 計算アルゴリズムと実行方式の改善範囲

数式の置換より、B01の予算検査とS04の重複処理削減を先に行う。通常D10の逐次DP、屍人のbounded-sum DP、二項分布の総和、FFTのいずれも、想定入力によって最適な方式が変わる。実測せずにFFT、近似式、WASM等へ一律変更しない。

順序統計量の中央付近の順位は、大きな入力でも短い和になるとは限らない。高速な二項分布評価への置換を検討するなら、現在の確率と証明書の意味を維持し、高精度の独立計算で比較する。近似を導入した結果を既存の`exact`として返さない。数値丸め誤差と、計算しなかった裾の意味論上の不確実性を混同しない。

[ADR 0003](./adr/0003-browser-worker-execution-boundary.md)は、当時の測定ケースで全体Worker化の利点が明確でなかったことを記録している。今回の受理要求の長時間停止は再検討材料であるが、単一の汎用Workerへ全処理を集める理由にはならない。

KISSに沿った判断順序は、安価な事前拒否と予算付き探索、測定、必要な処理だけの実行境界変更である。Workerが必要なら、まずScoreの重い処理を対象に、常駐Worker一つ、最新要求だけの採用、旧処理の停止、失敗時の復帰を具体的に設計する。Worker pool、共有メモリ、汎用ジョブschedulerは、追加の必要性が示されるまで導入しない。

計測は通常入力、大きな受理入力、拒否入力、入力連打、AttackからCheckへの切替え、低速CPU条件を含める。キャッシュあり・なしとWorker起動時間を分けて比較する。50ms超のメインスレッドtaskは診断対象にするが、CIへ機種非依存の絶対時間として固定しない。

## 公開と継続開発に向けた改善

### M01 開発文書の入口を短くする

READMEでは目的、主な機能、開発開始、必要な検証、主要ディレクトリの順に説明する。supportやcertificateの詳細は[結果契約](./result-contract.md)へ、過去の1024バケットとの比較は[参照資料](./reference/README.md)へ集める。現行経路の説明で歴史的事情を繰り返さない。

実験・アーカイブは、再実行する検証、設計判断の根拠、履歴保存だけの資料に区別する。調査番号だけの名称に説明を添える。独立比較に使用するgeneratorやfixtureは削除しない。移動時には検証スクリプトとリンクの更新を同じ変更に含める。

### M02 実行環境の固定と互換範囲を区別する

[check-node-version.mjs](../scripts/check-node-version.mjs)は`engines.node`の範囲内でも、`.node-version`とのパッチ番号完全一致を要求する。CIと推奨環境の再現性は維持しつつ、開発者の使用可能な版を互換範囲で認める案を検討する。

採用時は、特定パッチへの依存が本当にないか確認する。単に検査を消して無制限にするのではなく、lockfile、CIの固定版、明示したNode互換範囲を正本にする。現行の厳密な固定を維持する場合も、その必要性を短く説明する。

### M03 公開時の権利と貢献条件を明確にする

READMEではソースコードのライセンスが未整理とされている。コード、画像、参照データの公開条件を確定し、ソース公開後の利用者と貢献者が確認できる場所へ記載する。これは公開準備項目であり、本レビューによる権利確認や法的判断の完了を意味しない。

### M04 グラフ中心のまま操作可能性を補う

グラフの配置、優先順位、表示形式は維持する。B02の座標修正とB05の操作名付与を先に行う。追加のアクセシビリティ対応では、グラフを主役にしたまま、同じ値を確認できる任意の表やテキストによる代替を検討する。

Canvasへの`aria-label`はグラフの名前を伝えるが、個別の確率値を取得する代替にはならない。サマリーの主役化やグラフの削減によって解決しない。説明できない期待値を「—」にする現行の慎重さは維持し、必要なら理由と区間を補足表示する。

入力保存、共有URL、自動表示範囲、デザイン刷新は、この簡素化計画の完了条件に含めない。追加要件として別途判断する。

## 段階的な実装計画

各変更単位は、対応する不具合修正または簡素化を完了してから次へ進める。新旧経路を長期間併存させない。差分が大きい場合は、意味を保つ準備変更と実際の切替えを分ける。

| 順序 | 変更単位 | 主な対象 | 完了条件 |
| --- | --- | --- | --- |
| 1 | 二項tail primitiveの高速化と再計測 | B01（完了）、Score plannerとtail評価 | 10,000万Dのplanner、受理される大入力、ブラウザCheckの実計算を再測定し、B01-Aを閉じた |
| 2 | 局所的な表示不具合の修正 | B02、B05、chart設定とコンボ操作 | 非ゼロ開始位置の線とモバイルの操作名が正しい |
| 3 | 有効入力の契約と無効入力通知 | B03、B04、S01 | 隠れた不要入力を計算しない。無効入力へ旧結果がcommitされない |
| 4 | Check初期化とsnapshotの整理 | S02、S03 | 初期化が通常runnerを使い、coordinatorの汎用コピーが不要になる |
| 5 | Attackの表示生成の一本化 | S04 | baseを一度だけ生成し、通常commitと表示更新が同じ経路を使う |
| 6 | Attackの状態とエラー所有者の整理 | S05、S06 | 無効化表の振る舞いを保ち、重複した状態更新を削減する |
| 7 | 検証と配列所有権の整理 | S07 | 外部境界の検証とalias防止を保ち、寛容な内部fallbackを削減する |
| 8 | 残る長時間処理の実行境界を判断 | 新たな性能証拠が得られた場合のみ | 現在のB01-A測定ではWorker変更を行わず、長時間停止が再現した場合に再評価する |
| 9 | 名前と公開文書の整理 | S08、M01からM04 | 初見の開発者が入口、現行契約、検証手順を追える |

順序1はB01のplanner拒否ケース、受理されるproducer、実ブラウザのCheck経路を計測して完了した。順序2はB02/B05の修正と本番ブラウザ検証を終えた。順序3はB03/B04をCLOSED / GREEN、S01を完了とし、Check入力契約と3画面のvalidation lifecycleを揃えた。順序4はS02/S03、順序5はS04、順序6はS05/S06を実装・検証して完了した。次の作業候補は実画面dogfoodingである。順序8は新たな長時間停止の証拠が得られた場合だけ再開し、Workerやpolicyの変更を事前に追加しない。

## 回帰検証と完了の判定

### 必ず残す回帰観点

| 観点 | 検証すること |
| --- | --- |
| 数値 | 独立oracleとの一致、質量保存、上側確率の単調性、境界値、証明書の意味 |
| 入力 | 固定難易度と対決の切替え、無効入力、非対応効果、hidden draftの保持と計算対象の分離 |
| 要求競合 | Aの後にBを送ったときの逆順完了、invalid化後の完了、離脱後の完了、Abortとlease解放 |
| 増分計算 | 一つのコンボ変更で無変更コンボを再計算しない。合計の入力順とrecordの対応を維持 |
| 表示独立性 | スコアだけの拒否、ダメージだけの表示失敗、表示再試行で計算エラーを消さない |
| 描画継続 | 通常再計算中のcanvasとサマリーDOMの継続、成功時の更新、拒否・失敗時の消去 |
| 座標 | 開始位置0以外の表示、難易度線、範囲外、PMFと上側確率 |
| 所有権 | 待機中の入力・配列変更が要求snapshotへ波及しない。cacheの配列が描画側から破壊されない |
| 性能 | 計画だけで長時間停止しない。受理要求の応答性と取消、cache missとhitを別々に測る |
| 操作可能性 | モバイルを含むボタン名、キーボード操作、結果がどの入力に対応するか |

テストは上記の振る舞いを固定し、内部関数名、ファイル数、特定のfactory呼び出し順そのものを過剰に固定しない。数値oracleと参照実装はproductionと同じヘルパーへ統合せず、独立性を保つ。コピー回数など性能上の意図を確認するテストは、局所的で目的を説明できるものに限る。

各変更では対応する単体・結合テストを実行し、必要な変更単位で`npm run verify:core`と`npm run verify:browser`を実行する。数式、参照契約、generatorを変更する場合は[CONTRIBUTING.md](../CONTRIBUTING.md)に従って参照検証も実行する。文書だけの変更に、生成器の全再計算は要求しない。

### 簡素化が達成されたかを確認する質問

変更後のレビューでは、単なる行数の減少に加え、次を確認する。

1. 固定難易度の要求を読んだとき、リアクションが不要なことが型と呼び出しから分かるか。
2. 各要求のsnapshot生成、結果commit、表示変換の正本をそれぞれ一か所に特定できるか。
3. Checkの初回と更新の違いが、入力値以外に残っていないか。
4. Attackのbase生成からグラフまでに、同じ変換の別経路が残っていないか。
5. 表示の失敗を直すために数値計算の内部を理解する必要が減ったか。
6. テストダブルのためだけのproduction分岐と、使用されない汎用コピーがなくなったか。
7. 正しいグラフ、数値契約、増分計算、描画継続、取消と資源制御を保てたか。

新しい抽象化を追加する場合は、削除できる既存の分岐と状態を示す。既存経路を残したまま新しいレイヤーを追加しただけなら、この計画の簡素化とはみなさない。

## 関連資料

- [現行アーキテクチャ](./architecture.md)
- [実行時計算アルゴリズム](./runtime-calculation-algorithms.md)
- [結果契約](./result-contract.md)
- [ダイスルール](./dice-rules.md)
- [実行時ルールの独立検証](./runtime-rule-validation.md)
- [Worker実行境界の設計判断](./adr/0003-browser-worker-execution-boundary.md)
- [DR Workerの中断方式](./adr/0004-runtime-damage-worker-preemption.md)
- [開発と検証手順](../CONTRIBUTING.md)

外部資料では、[Chart.jsのアクセシビリティ説明](https://www.chartjs.org/docs/latest/general/accessibility.html)がCanvasの代替情報を実装側で用意する必要性を説明している。[web.devの長いtaskの解説](https://web.dev/articles/optimize-long-tasks/)はメインスレッドの長時間処理と応答性を扱う。これらは一般的な設計判断の補助であり、本書の不具合の直接の根拠は対象コードと再現結果である。
