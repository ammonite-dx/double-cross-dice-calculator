# 独立設計レビュー：同じ機能をゼロから作るなら

レビュー日：2026-09-07。対象コミット：`e016b5c020867aecc4abc376f298ecfcfe5f6ad5`。

## 1. 総合評価

**計算の基礎と静的Webアプリという選択は維持する価値がある。一方、計算結果を画面へ届ける仕組みは、機能の規模に対して複雑すぎる。ゼロから作るなら、数値計算を再利用し、結果契約・実行境界・画面構成を設計し直す。**

Vue 3、Vite、実行時計算、Worker、独立した数値検証が導入されており、技術全体が古いアプリではない。問題の中心はライブラリの年代よりも、旧データ形式との互換、段階的な移行、内部オブジェクトに対する重複した防御、表示範囲に連動する再計算が現在の設計に残っていることである。

とくに、確率の不確かさを丁寧に管理しながら、利用者に最も必要な成功率・ダメージ期待値を通常条件でも表示できない点は優先して見直したい。数学的な慎重さは必要だが、その成果を利用者が解釈できる形にするまでが計算アプリの責務である。

| 領域 | 評価 | ゼロから作る場合の判断 |
| --- | --- | --- |
| 静的SPA・ブラウザ内計算 | 適切 | 維持。サーバーやDBを追加する理由はない |
| 通常DX、特殊効果、DRの数式 | 良好な資産 | 維持し、独立した参照計算と照合する |
| 分布の尾部・不確かさの明示 | 必要な思想 | 維持。ただし確率と期待値の問い合わせを中心に設計する |
| レイヤーとディレクトリ | 改善済みだが過剰 | 計算エンジン、実行サービス、機能UIへ整理する |
| 表示・状態管理 | 再設計の優先度が高い | 結果の単一所有と導出表示へ寄せる |
| UI・情報の順序 | 判断支援として弱い | 主要数値、比較、分布詳細の順にする |
| テスト・CI | 数値検証は強いが偏りがある | 独立検証を残し、利用者の目的を確認するテストを増やす |
| 全面再実装 | 現時点では費用に見合わない | 同じリポジトリ内で責務単位に置き換える |

これは実装者の能力を推定する評価ではない。コードから判断できるのは現在の構造とその費用であり、個々の変更が必要だった当時の条件は別問題である。

### 前提と調査範囲

一般判定、攻撃、複数コンボの独立な合計ダメージ、バックトラック、現在対応しているエフェクト・Dロイスを維持する。内部API、配布用データ形式、画面の配置は維持必須としない。ゲームルール上の制約、未対応の組み合わせ、資源制限は区別する。

本番の入力から計算・表示までの経路、計算primitive、Worker、参照生成器、テスト、ビルド設定、CI、ホームを調査した。設計資料は意図の説明として読んだが、その方針に従うことを評価の前提にはしていない。全ファイルの全行を精読したことや、全入力域の正しさを保証するものではない。ゲームの解釈はリポジトリの仕様を対象とし、原典ルールブックとの独立照合は実施していない。確率計算の入門教材そのものの文章レビューは対象外である。

調査開始時のGit作業ツリーはクリーンだった。アプリケーションコードは変更していない。

## 2. 領域別の指摘

優先度「高」はアプリの利用目的または今後の設計判断に直接影響するもの、「中」は保守・性能・理解の費用を下げるもの。「コスト」は変更範囲の相対評価であり、日数見積りではない。

### R01：分布の完全性が主要数値の表示可否を決めている

**優先度：高／コスト：大／確信度：高。** 根拠：[成功率の生成][s01]、[期待値の証明範囲][s02]、[数値フォーマット][s03]。

一般判定で10個、クリティカル7、技能0、難易度10を入力すると、達成値期待値は30.9だが成功率は「—」になる。独立した式では、最初のロールに7以上が一つでも出れば成功するので、成功率は `100 × (1 − 0.6^10) = 99.39533824%`。実際のDX分布の10以上の総和も同じ値だった。しかし非対決のサマリーは完全なbucketを取得できなければ0〜100%という区間を返す。

攻撃の初期条件では命中率45.5%を表示する一方、ダメージ期待値は「—」。一般判定に《妖精の手》1回を加えたケースでは達成値期待値も「—」になった。期待値certificateは通常DX・非負技能などに限定され、ダメージ用formatterはexact以外を表示しない。

**判断：確率分布を完全に列挙できることと、必要な数値を十分な精度で求められることが混同されている。** 無限支持を持っていても、閾値確率はCDFや尾部式から求められる。期待値には確率質量の誤差とは別に、未表現部分の一次モーメントの上界が必要である。

推奨は、成功率・期待値を計算エンジンの第一級の問い合わせにすること。表示範囲によらない数値と区間を返し、上下界が同じ小数1桁に丸まる場合は数値を表示する。丸まりが一致しなければ区間または「少なくとも…」と理由を示す。誤差を無視した点推定への置換や、残存確率の再正規化で問題を隠す変更はしない。

### R02：内部の表示変換が、汎用の外部データ処理基盤になっている

**優先度：高／コスト：大／確信度：高。** 根拠：[DistributionPresenter][s04]、[DisplayRangePlanner][s05]、[ChartSeriesAdapter][s06]。

上記3ファイルだけで3,732行ある。独自のバージョン、エラー階層、plain object判定、property descriptor検査、metadataのJSON複製、深さ・ノード数制限などを持ち、各段階で別の表現へ変換する。Attack側のpresentationも1,371行ある。行数だけで過剰とは判定しないが、ローカルな計算結果をローカルなチャートへ渡す経路に、外部から任意のオブジェクトを受け取る場合の契約が広く持ち込まれている。

結果として、表示変更に関係する状態とエラー条件を多く理解しなければならない。実行時間にどれだけ寄与するかは今回の調査では分離測定していないため、「これが主な速度低下原因」とは断定しない。

推奨は、入力・Worker通信・参照ファイルの境界で検証し、内部では具体的な型と所有権を信頼する構成。数値の有限性、負確率、総和、長さ、割当上限の検査は残す。任意metadataを通すことをやめ、必要な精度情報・診断情報を型で限定する。表示処理は「結果から指定範囲の系列と説明を作る」純粋関数へ縮小する。

### R03：攻撃の状態管理に計算結果と表示結果の所有者が多い

**優先度：高／コスト：大／確信度：高。** 根拠：[AttackRunner][s07]、[AttackState][s08]、[useAttack][s09]。

コンボごとにscore、scoreSummary、scorePresentation、damage、damageSummary、damagePresentation、複数のreadyフラグがあり、全体にもdisplayPresentationがある。RunnerはさらにlastBatchResult、lastEntries、表示用generation、score表示用generation、再計算中フラグなどを保持する。単にイベントが多いのではなく、同じ結果の複数表現を同期する責務がある。

入力の一部を変更した場合もbatch全体を再実行する。DX・DRのcacheは再計算を軽減するが、コンボの最終結果を単位とした差分計算とは異なる。表示範囲拡大のための再計算も計算ライフサイクルへ戻る。

推奨は、フォームの編集中入力、検証済み入力、最新の計算結果を分け、計算結果は一か所だけに保持すること。表示はその結果から導出する。入力キーが変わったコンボだけを計算し、合計だけを更新する。名前と展開状態は計算キーに含めない。詳細範囲の取得が必要でもサマリーと他のグラフを失効させない。

### R04：Workerとキャンセルの境界が、計算資源の所有境界と一致しない

**優先度：中／コスト：大／確信度：高。** 根拠：[CalculationClient][s10]、[DR client][s11]、[Worker][s12]、[ResourceGuard][s13]。

通常DX、支配DP、D10、防御合成、合計ダメージ、Backtrackは基本的にメインスレッド側で、DR生成がWorkerにある。Promiseを返すAPIでも、同期CPU処理自体はUIと同じ実行スレッドを占有する。

DR clientのabortは待っているPromiseをrejectするが、既に送信したWorker処理を中断せず、応答時にはcacheへ保存する。これは共有要求の再利用という合理性がある一方、「キャンセル済み計算が資源を消費し続ける」という別の意味を持つ。上位のleaseが解放されても、Workerに残る仕事の終了とは一致しない。ResourceGuardはブラウザ全体の実メモリ使用を厳密に管理しているものではない。

同一スレッドの同期ループでsignalを繰り返し読んでも、新しい入力イベントを処理するために実行を譲らなければ、そのイベント由来のabortは観測できない。[JavaScriptの実行モデル](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model)からもこの制約がある。

ゼロからなら、数値計算全体を一つの常駐Workerへまとめる。目的は通常ケースの高速化ではなく、高負荷入力を含む応答性と所有関係の単純化である。メインスレッドはフォームと描画を担当する。最新要求だけを保持し、不要な進行中ジョブを本当に止める方式を選ぶ。Workerの停止とtransferは標準APIで実現できる。[MDNのWorker説明](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)

ただし、現行の通常DXは今回のNode測定で約0.5ms以下のケースもある。全Worker化を「必ず速くなる変更」とは評価しない。起動・転送・cache喪失を含めた再測定が必要である。

### R05：互換形式が、現在の計算契約にまで残っている

**優先度：中／コスト：中〜大／確信度：高。** 根拠：[共通ポリシー][s14]、[Attackの上書き][s15]、[DamageCalculator][s16]。

共通のDEFAULT_POLICYはpublished-bucketを既定とし、1023由来の値を使う。一方、実際のAttack clientはfull-tailへ上書きする。したがって「本番攻撃が旧1024bucketで計算されている」という指摘は誤りである。しかし、同じplannerに二つの意味が残り、どの入口を使ったかを追わなければ既定動作がわからない。

DxCalculatorにもlegacy roundingがあり、ベンチマークには独自providerがある。互換を守る経路と、現在推奨する経路が同じ計算モジュール・オプション集合に共存する。

ゼロからなら、offsetを持つ分布と明示的な精度情報だけを本番契約にする。旧bucketへの投影や丸めは、参照データとの比較用adapterに隔離する。既存公開JSONを外部が使用していないことは、このリポジトリだけでは証明できないため、現在のURLを削除する場合には利用状況・公開契約を別途確認する。

### R06：TypeScriptの導入範囲と、実際に保証される境界に差がある

**優先度：中／コスト：中〜大／確信度：高。** 根拠：[tsconfig][s17]、[useAttack][s09]、[AttackComboState][s18]。

srcにはJSが56ファイル、TSが20ファイル、Vueが47ファイルある。strictは有効だがcheckJsはfalseで、主要な計算・表示モジュールはJS。Attackではunknownを含む広い型や、二重の型アサーションで境界を接続している。型検査に通ることを、計算と表示の契約が全域で検証されていることとは見なせない。[TypeScriptのcheckJs説明](https://www.typescriptlang.org/tsconfig/checkJs.html)

推奨は全ファイルの拡張子を一度に変更することではなく、R01〜R03の結果契約を先に確定し、その境界と計算コアからstrict TSへ移すこと。feedbackをstatus文字列とnullable fieldの組み合わせにせず、状態ごとの判別可能なunionにする。Vueのprops/emitsにも具体的な型を与える。

### R07：グラフが主役になり、判断に必要な結果が遠い

**優先度：高／コスト：中／確信度：高。** 根拠：[CheckPage][s19]、[AttackPage][s20]、[Backtrackグラフ配置][s21]、[Backtrack描画設定][s22]、[HTML][s23]。

1280×900の一般判定では入力と大きなグラフが初期画面を占め、サマリーは下にある。スマートフォン相当でも主要数値はグラフの後。攻撃の2コンボでは入力が縦に増え、その後に二つのグラフとサマリーが続く。

390×844のBacktrackでは円グラフが2列になり、small画面のデータラベルはコード上6px。10%未満はラベルを描かず、詳細確認をtooltipへ依存する。DOMでは3つのcanvasにrole=imgはあるが、aria-labelとfallback本文は空。結果の表もない。日本語アプリのhtml langはenで、複合数値入力の一部や「高度な設定」のcheckboxにもアクセシブルな名前がないことをAX情報で確認した。

推奨は「条件→主要数値→比較→詳しい分布」の順序。一般判定は成功率、攻撃は命中率と期待ダメージ、Backtrackは振り方ごとの帰還率・区分確率をHTMLの数値として先に示す。現在の分布表示機能は残し、PMFは棒または離散点、上側確率は段階線を基本とする。円グラフの代わりに表と横棒で比較できるようにする。

グラフには説明と数値の代替表示を付け、フォームには明確なラベル、コンボの操作には対象名を付ける。Chart.js自身もcanvasの内容がスクリーンリーダーへそのまま伝わるわけではなく、ARIAやfallbackが必要だと説明している。[Chart.jsのアクセシビリティ](https://www.chartjs.org/docs/latest/general/accessibility.html)

### R08：描画する点数と、計算する範囲を同じ密度で扱っている

**優先度：中／コスト：中／確信度：中〜高。** 根拠：[チャート設定][s24]、[表示範囲ポリシー][s05]。

表示は整数ごとの系列をmaterializeし、4,096点で警告、16,384点で拒否する。広い範囲を確認したいという要求が、そのまま大量の描画点を要求する構造である。共通Chart.js設定にはanimation無効化や密な系列の点省略の明示設定がない。

推奨は計算精度と描画解像度を分けること。広域表示では画面幅に合わせてPMFを区間ごとに合算し、「この区間に入る確率」と表示する。上側確率は単調性を保った表示用サンプリングを行い、整数単位の値は詳細範囲または問い合わせで得る。PMFに単純な間引きを適用すると確率質量が消えるため、汎用decimationをそのまま使わない。

Chart.jsは描画前のデータ削減、animation無効化などを性能対策として挙げている。ただし、本アプリの確率の意味に適合する集約方法を選ぶ責務はアプリ側にある。[Chart.jsの性能指針](https://www.chartjs.org/docs/latest/general/performance.html)

### R09：数値アルゴリズムは概ね妥当で、改善は局所的に選ぶべき

**優先度：中／コスト：小〜中、算法変更は中／確信度：高。ただし速度改善量は未測定。** 根拠：[D10][s25]、[DX][s26]、[DR][s27]、[Backtrack][s28]、[汎用FFT][s29]、[DR用FFT][s30]。

通常DXの最大値CDF、支配の順序統計量と状態DP、妖精のクリティカル回数の分布、DRの母関数を使った混合生成は、問題の性質を利用している。これらをMonte Carloや全列挙に置き換える案は推奨しない。

D10の現在のDPは各状態から10面へ加算する。`p_n(s) = sum(p_(n−1)(s−j), j=1..10)/10` は移動和で更新できるため、ゼロからなら二つの作業配列と移動和を選ぶ。漸近計算量はどちらもO(n²)だが、定数と割当を減らせる。差分による丸め誤差は独立列挙と総和検査で確認する必要がある。

汎用FFTとDR用FFTにはほぼ同じradix-2変換があり、主な違いにabort検査がある。小さな同一primitiveへ統合する価値がある。畳み込みはdelta分布ならシフト、小規模なら直接計算、大規模ならFFTという選択を設ける。ただし境界値は同一環境の測定で決め、今回「何倍速くなる」とは主張しない。

大きな支配DPや多数のコンボでは支配的な計算量が残る。FFTやWASMの導入だけで解決するとは考えず、まずWorkerへの配置、不要な再実行、cache単位、supportの扱いを整理する。

### R10：検証が実装の形と移行履歴を守りすぎている

**優先度：高／コスト：中／確信度：高。** 根拠：[構造テスト][s31]、[Nodeベンチマークprovider][s32]、[ブラウザベンチマーク検証][s33]、[scripts][s34]。

77テストファイル・878件は通るが、通常の成功率が数値として表示されるという目的は守れていない。構造テストにはimport文字列、特定の関数名、awaitの有無、router行の文字列を固定するものがある。こうしたテストは移行中には役立つが、現在の構造を再評価する際には変更の障害になる。

今回、既存性能検証から二つの具体的なずれを再現した。

- Node full-tail benchmarkの独自DX providerは第5引数youseiを受け取らず、計算器へ渡さない。yousei9ケースで `fftLength must equal 0` となる。コマンドの終了コードは0だったが、ケース内にはerrorがあった。
- ブラウザfull-tail benchmarkはChromeとCPU 4xの両方で11ケースの計算が完了した。しかし検証条件が旧D10データのfetchを要求するため、全体のstatusはerror。現行の本番処理ではfetchしないことが正しい。

この失敗を本番算法の不正として数えたり、反対に実行終了をもってbenchmark合格と扱ったりしてはいけない。現行clientを使った測定と、参照器を使った独立検証を分ける必要がある。

CIのverify:releaseはdata:checkを通じてdata:verify-generatorを実行した後、同じdata:verify-generatorを再度実行する。独立性の異なる二つの検査ではなく同じ検査の重複である。

推奨は、数値の独立列挙・固定seedシミュレーション・数値監査を残し、構造検査を本質的な依存方向に限定すること。UIテストはcanvasの存在に加えて、代表条件の成功率、期待値、入力エラーからの回復、キーボードでの操作、表示範囲を変えても主要数値が変わらないことを確認する。ベンチマークは不成功ケースがあれば非ゼロ終了し、warm cacheと実計算の時間を区別する。

### R11：本番、検証、過去の移行のための資産が混在している

**優先度：中／コスト：中／確信度：高。** 根拠：[構成説明][s35]、[Vite設定][s36]、[ホーム][s37]、[フォント読込][s38]。

追跡対象のpublic/dataは33ファイル・11,984,253 bytesで、production smokeでは計算画面からの事前計算データ取得は0件だった。Viteのbuildではpublicのデータも配布物へ含まれる。ただしこれは配布物の容量であり、訪問者が毎回約12MBをダウンロードしているという意味ではない。

Python生成器は本番の必須依存ではなくなっても、独立した数値検証として価値がある。削除対象とすべきなのは「不要な本番配布との結び付き」であり、検証能力そのものではない。

docsには27ファイル・約752KBあり、現在のarchitecture説明にも移行番号や完了記録が混在する。viewsの薄いadapterとfeaturesのindexという二つの入口、core/probabilityとcalculationという近い責務名も、初見で読む順序を増やしている。これだけを理由に全面移動する価値は小さいが、責務の再編時に統合したい。

ホームは説明、お知らせ、利用例、動画の順で、直ちに計算を始める主要操作が本文にない。公開お知らせの先頭は2024年。一方で開発資料は新しい内部移行を大量に説明している。この情報配分は現在の利用者への説明よりも、内部の変更履歴を重視した形になっている。

ゼロからなら参照データはverification配下、過去の判断はarchive、現行仕様は短いrules・architecture・numerics・developmentに分ける。ホームに三つの計算への入口を置く。フォントはまずsystem fontを用い、必要なら明示的にself-hostする。webfontloaderのwebpack用コメントは軽微な残存物であり、それ自体を主要な問題には数えない。

## 3. 計算アルゴリズムの評価

以下のLは明示計算する分布の長さ、nはダイス数、FはFFT長、kは振り直し対象数。定数や境界処理を省いた概算である。

| 計算 | 現行の主な方法 | 評価と推奨 |
| --- | --- | --- |
| 通常DX | 1個のCDFから最大値のCDF `F(x)^n` を作る | 維持。尾部はlog1p/expm1を使い桁落ちを抑える。ダイスごとの全列挙は不要 |
| 支配 | クリティカル数の二項分布、終端の順序統計量、自己遷移を解いたDP | 維持。主項は概ねO((n−m)²L)、記憶O(nL)。終端条件の特殊化と作業領域削減は別途測定する |
| 妖精 | クリティカル回数の最大値と負の二項分布をblock単位で合成 | 維持。1回以上使用する場合の末尾の出目の扱いを参照実装で守る。通常DXと同じ末尾分布とは仮定しない |
| D10合計 | 全面への前向きDP | 移動和DPを第一候補にする。n個の一括要求は一つの前向きpassで得る |
| 命中とDR重み | 攻撃側PMFと防御側累積確率からダメージダイス数ごとの重みを作る | 維持。攻撃と防御の全ペアを列挙する必要はない |
| 風鳴りを含むDR | ダイス数混合の母関数を周波数上で評価し逆FFT | 良い選択。全ダイス数の分布を生成してから混ぜる方式へ戻さない。主項は概ねO(F(nk+k²+log F))、k=0はO(Fn+F log F) |
| 屍人 | 最大出目と `合計−最大+1` を状態にしたDP | ルールを直接表現しており維持。10面という小さい定数を利用できる |
| 複数コンボ | 独立な和の畳み込み | 維持。delta・小分布・大分布を使い分ける。独立性の仮定をUIにも短く示す |

支持範囲、確率誤差、一次モーメントの誤差は別々に管理する。とくに「尾部確率が小さい」ことだけでは期待値の誤差が小さいとは言えない。また、攻撃側の大きな達成値と防御側の尾部は、差や命中判定を介して小さいダメージにも影響する。未表現質量を単純に最右端へ置く設計には戻さない。

数値のexactは無限精度演算を意味しない。有限支持を完全に計算した場合でも浮動小数点誤差を持つ。新設計では「支持が有限か」と「表示値の誤差がどの程度か」を同じkindへ押し込めない。

## 4. ゼロから作る場合の推奨設計

### 技術構成と責務

Vue 3、strict TypeScript、Vite、Vue Router、Chart.jsを選ぶ。Vuetifyも維持し、フォーム・選択・折り畳みなどを利用する。独自デザインシステムへの全面置換で保守対象を増やさない。CSSの規模は計測して見直すが、フレームワークを変えることを改善の中心にしない。

計算は常駐する一つのmodule Worker。サーバー、SSR、グローバル状態管理ライブラリ、WASMは初期構成に加えない。必要性が実測された場合だけ検討する。

```text
src/
  app/                 起動、ルーティング、共通レイアウト
  engine/
    model/             ゲーム入力、分布、数値区間、結果の型
    probability/       D10、FFT、分布演算
    rules/             判定、攻撃、バックトラック
    accuracy/          尾部と一次モーメント、計算範囲の選択
  execution/           Worker、メッセージ、最新要求、cache、資源制限
  features/
    check/             ページ、フォーム、composable
    attack/            コンボ入力、比較、合計
    backtrack/         入力、帰還率と区分結果
  ui/                  共通の数値表示、グラフ、入力部品
verification/          Python参照器、列挙、参照データ、比較adapter
benchmarks/            現行経路の性能測定
docs/                  現行仕様と開発手順。過去資料はarchiveへ
```

engineはVue、DOM、Worker API、参照ファイル配置を知らない。executionはengineを呼ぶ。featureはexecutionへ要求を渡し、結果をUIへ渡す。この三つの依存方向をテストとlintで守る。共通化は同じ責務が実際にある場合だけ行い、全機能に同じcontroller形式を強制しない。

### 結果と問い合わせの契約

以下は推奨する契約の骨格。内部の計画式や診断情報をそのまま画面の公開APIにはしない。

```ts
type NumericInterval = Readonly<{
  lower: number
  upper: number
}>

type Expectation =
  | Readonly<{ kind: 'bounded'; interval: NumericInterval }>
  | Readonly<{ kind: 'lower-bound'; lower: number; reason: string }>

type Distribution = Readonly<{
  offset: number
  mass: Float64Array
  support: { min: number; max: number | null }
  omittedMassUpperBound: number
  arithmeticErrorBound: number
}>

type CheckResult = Readonly<{
  score: Distribution
  successProbability: NumericInterval // 0..1。百分率化はUIで行う
  expectedScore: Expectation
  failureProbability: NumericInterval // 自動失敗とファンブル
}>
```

Distributionは計算済みの明示部分であり、これ単体からすべての統計量を推定しない。エンジンは元の入力と尾部モデルを使って成功率・期待値を別途計算する。防御との合成に必要な「未表現部分がどこへ影響するか」はengine内部の精度モデルで保持する。単一のomittedMass値だけでその位置を代替しない。

Checkの問い合わせは固定難易度または対決を判別可能な型にする。Attackは入力キーごとに命中率・ダメージ分布・期待値を返し、複数コンボは独立和として集約する。Backtrackは振り方ごとの区分確率も返す。計算の百分率丸めを廃止し、UIが単位と小数桁を決める。

通常の計算要求は入力と精度方針だけを含める。チャートのmin/maxやPMF/上側確率モードを数値計算の意味に混ぜない。詳細分布の取得は結果IDと範囲を指定する別要求にし、計算済み範囲外で必要なときだけ拡張する。サマリーは範囲拡張前後で同じ精度契約を満たす。

### 精度と資源制限

ゼロからの既定は、確率の絶対誤差目標を1e-8とし、期待値は表示桁に必要な上下界を得るまで範囲を拡張する。既存の誤差モデルを検証せずに「1e-8が保証される」とは宣言しない。丸めの境界にある場合や資源制限へ達した場合は区間表示を許容する。

安全な整数、配列長、メモリ割当上限は維持する。計算前の見積りはエンジンで使うsupport・操作数と共有し、同じ式をplannerとcalculatorに別々に持たない。時間見積りは端末依存なので、ゲーム上の入力禁止を意味する表示にしない。現行の200ms等の制限を今回の単一PC測定だけで緩和しない。

### 非同期と状態

フォームは編集中の空文字等を許すdraftを持ち、同期のゲーム入力検証を通った値を要求へ変換する。入力変更を120msまとめ、未送信要求は最新一つだけ保持する。送信後に別の検証済み要求が来た場合は、旧結果を無視するだけでなく、進行中Workerを停止して再生成する方式を最初の設計として選ぶ。停止に伴うcache喪失は測定対象とし、必要なら後から協調的中断へ置き換える。

結果にはrequest IDを付け、該当する最新要求だけcommitする。idle・running・ready・rejected・failedをunionで表現する。前回結果を残す場合は「前の条件の結果」と明示する。入力、計算結果、表示設定の所有者をそれぞれ一つにし、readyフラグを各表現へ重複させない。

UIの結果はshallowRefなどで置き換える単位を明確にする。これはTypedArrayの各要素が現在すべてVue proxy化されているという指摘ではない。大きな不変データの扱いを明示する設計判断である。[Vueの性能指針](https://vuejs.org/guide/best-practices/performance)

### UIの完成形

- ホーム：三つの計算への入口を最初に置き、利用例・動画・履歴は後へ移す。
- 一般判定：入力の直後に成功率と期待値。分布は自動範囲を既定とし、手動範囲と表示モードを詳細設定に置く。
- 攻撃：既存のコンボ追加・複製・削除を維持し、一覧で主要数値を比較する。選択中コンボの詳細入力とグラフを展開する。合計が独立した各攻撃の和であることを明示する。
- Backtrack：一倍・二倍・追加振りの帰還率と現在の区分確率を表で示し、横棒グラフを併用する。
- 共通：390px幅でも数値を読める文字サイズとし、PCでは条件と結果を隣接させる。高度な設定の開閉は値のリセットと分離する。エラーには修正対象を示す。

共有URL、保存、追加の確率指標、新しい効果への対応は今回の同機能再設計には含めない。画面配置や主要数値を改善するだけでも、現在の利用目的に対する効果は大きい。

## 5. 実施した検証と限界

### 自動検証

| 検証 | 結果 |
| --- | --- |
| npm test | 77ファイル、878件成功 |
| npm run typecheck | 成功。ただしcheckJs=falseの範囲制約あり |
| npm run lint | 成功 |
| npm run build | 成功、415 modules |
| npm run generator:test | 18件成功、simulation 13件は別実行 |
| npm run generator:test:simulation | 13件成功 |
| npm run generator:lint | 成功 |
| npm run data:verify-generator | 32アセットの再生成比較に成功 |
| npm run verify:runtime-dx | 20,000ケース成功。比較許容差約1e-6、最大総和誤差約1.55e-15 |
| npm run smoke:production:built | 成功。一般判定・攻撃・Backtrack、大きな入力、表示拒否からの回復。事前計算fetch 0、console警告・エラー0 |
| 独立したD10全列挙 | 0〜4個で最大絶対差4.16e-17 |
| 一般判定の独立式とPMF比較 | 10D・C7・難易度10で双方99.39533824%。サマリーは0〜100%を返す |
| Node full-tail benchmark | 実行されたがyousei9ケースがerror。合格とは扱わない |
| ブラウザfull-tail benchmark | 各engineの11ケースは計算完了。旧fetch契約により全体error。合格とは扱わない |

verify:runtime-dxの20,000ケースは旧生成範囲の比較であり、全入力域や全尾部の証明ではない。報告されたtailCaseCountは0だった。Pythonにはraw分布の数値監査と独立列挙もあり、保存済みの丸められた表との一致だけを検査しているわけではない。

### 性能の観測

Windows x64、Ryzen 7 9700X、Node 22.23.2。Node full-tailはwarmup 1回、測定3回の中央値。単一環境の短い測定であり、p95評価には使わない。

| Nodeのケース | warm実行中央値 |
| --- | ---: |
| DR 202個、風鳴り0 | 0.76ms |
| DR 202個、風鳴り9 | 21.00ms |
| DR 400個、風鳴り9 | 84.84ms |
| DR 600個、風鳴り9 | 248.96ms |
| DR 800個、風鳴り9 | 337.48ms |
| attack-99d-critical2-kazanari9 | 74.48ms。planner推定95.95ms |

単体DRの大きいケースを、本番UIがすべて受理するという意味ではない。Node benchmarkはWorker往復やUI描画を含まず、一部は資源制限を緩めた測定である。

ブラウザはChrome 152.0.7977.77、1280×720、1回測定・warmupなし。旧fetch条件の失敗は以下の計測値自体を消すものではないが、検証全体は不合格のままである。

| ブラウザ条件 | cold invocation最大 | warm invocation最大 | Worker応答最大 |
| --- | ---: | ---: | ---: |
| Chrome desktop | 264.9ms | 3.0ms | 260.8ms |
| Chrome CPU 4x | 765.5ms | 14.3ms | 714.6ms |

両条件とも11ケースを計算し、本番ポリシーでは8件受理・3件拒否。Long Task観測は0件。warmは同じ入力のcacheが効くため、coldと同じ計算を毎回完了する性能とは解釈しない。測定ページは実際のフォームとChart.jsを含む画面全体ではなく、CPU 4xも低速スマートフォン実機の再現ではない。

### ブラウザでの確認

PC相当1280×900、モバイル相当390×844で確認した。一般判定の通常入力・連続変更・妖精・表示範囲変更、攻撃の複製による2コンボと合計、Backtrackの侵蝕率・ロイス・屍人・Eロイス100を操作した。一般判定でTab移動を確認し、Backtrackのcanvas属性とhtml langをDOMで確認した。

Firefox・WebKit・実機スマートフォン・スクリーンリーダーによる読み上げ・全エラー経路の操作までは実施していない。アクセシビリティは観測したDOMと画面の評価であり、適合認証ではない。利用頻度の分析データや利用者インタビューはないため、UI優先順位はアプリが掲げる用途と操作観察に基づく提案である。

## 6. 現行実装からの改善順序

| 順序 | 変更単位 | 完了の判断 |
| --- | --- | --- |
| 1 | R01の数値結果とR10の測定契約 | 代表条件で成功率・期待値または有用な区間を表示。benchmarkは本番経路と一致し、ケース失敗を検出する |
| 2 | 型付き結果契約とprecisionモデル | 表示範囲を変えても統計量が変わらない。自動失敗、尾部、期待値の独立検証を保つ |
| 3 | 表示adapter・状態の削減 | 結果を一か所で所有。コンボ差分更新と最新要求の挙動を統合テストで確認 |
| 4 | Worker境界と資源所有の整理 | 古いジョブが残り続けず、急な入力変更や画面離脱でも正しい結果だけ反映する |
| 5 | 数値を中心にしたUI | モバイル・キーボードで主要結果へ到達でき、canvasを読めなくても意味を理解できる |
| 6 | 互換・配布・文書の整理、局所最適化 | 本番が参照資産へ依存しない。独立検証が残り、計測した改善だけ採用する |

残すものは、ゲームルールの明文化、独立した参照器、通常DX・特殊効果の数式、TypedArray、線形畳み込み、尾部の不確かさを隠さない姿勢である。

簡素化するものは、表示の多段契約、重複状態、APIを広く差し替えられる依存注入、資源予約と実処理のずれ、構造を文字列で固定するテストである。削除・隔離候補は、本番のlegacy丸め・published投影、公開不要と確認できた参照アセット、重複FFT、役割が重なる入口、現行説明へ混在する移行記録である。

全面再実装を選ぶと、既に検証されている特殊ルールと数値の境界条件まで再検証する費用が発生する。**同じ機能を保ったまま、結果契約を先に定めて周辺層を段階的に置き換える方法を推奨する。** 新しいフォルダーへ現行コードを移すだけのリファクタリングでは、今回の主要課題は解消しない。

[s01]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/ScoreCalculator.js:809
[s02]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/ScoreCalculator.js:370
[s03]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/shared/presentation/SummaryFormatter.js:40
[s04]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/shared/presentation/DistributionPresenter.js:204
[s05]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/shared/presentation/DisplayRangePlanner.js:27
[s06]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/shared/presentation/ChartSeriesAdapter.js:110
[s07]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/features/attack/model/AttackRunner.js:23
[s08]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/features/attack/model/AttackState.js:6
[s09]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/features/attack/model/useAttack.ts:41
[s10]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/runtime/CalculationClient.js:358
[s11]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/runtime/RuntimeDamageRollClient.js:65
[s12]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/runtime/RuntimeDamageRollWorker.js:5
[s13]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/runtime/ResourceGuard.js:11
[s14]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/planning/RangePolicy.js:23
[s15]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/runtime/CalculationClient.js:206
[s16]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/DamageCalculator.js:505
[s17]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/tsconfig.json:7
[s18]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/features/attack/model/AttackComboState.ts:25
[s19]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/features/check/ui/CheckPage.vue:43
[s20]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/features/attack/ui/AttackPage.vue:48
[s21]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/features/backtrack/ui/FinalEncroachmentChartPanel.vue:28
[s22]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/features/backtrack/ui/ChartSetter.js:92
[s23]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/index.html:2
[s24]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/shared/chart/ProbabilityLineChartConfig.js:6
[s25]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/D10Calculator.js:171
[s26]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/DxCalculator.js:286
[s27]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/RuntimeDamageRollCalculator.js:112
[s28]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/BacktrackCalculator.js:166
[s29]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/core/probability/FFT.js:47
[s30]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/calculation/RuntimeDamageRollFFT.js:1
[s31]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/tests/checkFeatureArchitecture.test.js:18
[s32]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/scripts/benchmark-full-tail-attack.mjs:637
[s33]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/experiments/phase2h-browser/playwright-runner.mjs:445
[s34]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/package.json:28
[s35]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/docs/architecture.md:27
[s36]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/vite.config.js:10
[s37]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/views/Home.vue:11
[s38]: C:/Users/SoraHirokane/Documents/development/double-cross-dice-calculator/src/plugins/webfontloader.js:7
