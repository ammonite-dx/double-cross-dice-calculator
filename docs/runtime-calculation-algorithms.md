# 実行時計算アルゴリズム

## 目的と範囲

この文書は、ブラウザが事前計算済み分布を読み込んだ後に行う達成値、成功率、ダメージ、バックトラックの計算を、現在の実装に対応する形で説明します。ゲーム内処理の正規仕様は[`dice-rules.md`](./dice-rules.md)、事前計算データを作るアルゴリズムは[`precomputation-algorithms.md`](./precomputation-algorithms.md)、学習用の導入は[`probability-calculation-tutorial.md`](./probability-calculation-tutorial.md)を参照してください。

事前計算器は`dx`、`dr`、`d10`、`livingdead`の基礎分布を生成します。実行時のJavaScriptは、入力に対応する分布を取得し、技能値、成功条件、対決、攻撃力、防御、バックトラックの区分など、画面操作によって変化する条件を合成します。

## 1. 分布の共通表現

### 1.1 公開分布と作業分布

非負整数値を取る確率分布を、インデックスが値、要素がその値の確率となる配列で表します。画面へ返す公開分布は1024要素であり、インデックス1023には値1023以上の確率を集約します。planなしの互換経路では判定の作業分布を2048要素で保持し、planner経由のScore経路ではtail certificateと表示範囲から求めたworkingLengthを使い、最後に公開分布へ集約します。

この二段階の表現は、値1023以上を一度集約した後で負の固定値やダイス軽減を適用すると、元の値を復元できない問題を避けるためのものです。厳密性の境界は[`ADR 0001`](./adr/0001-expanded-working-distributions.md)に記載しています。

### 1.2 疎形式の展開と上限集約

静的アセットの各分布は、先頭の連続する0を省略した`offset`と`values`からなります。`expandSparseDistribution`はこれを1024要素または2048要素の密な配列へ展開します。

`collapseDistribution`は作業分布のインデックス0から1022をそのまま残し、インデックス1023以降の確率を公開分布の最後へ合計します。上限外の確率を捨てないことが重要です。Scoreのdynamic経路では作業配列の実際の長さを使って丸め、overflow bucket、skill shiftを処理し、公開時だけ1024要素へ戻します。

### 1.3 シフト

定数$a$を加える操作は、分布$p$を次の分布$q$へ移します。

$$
q_{\min(L-1,\max(0,x+a))}\mathrel{+}=p_x
$$

`shiftDistribution`は負の結果を0、作業上限以上を最後のバケットへ集約します。これはダメージが0未満にならないことや、有限配列の上限を表現するための計算上の処理です。ここで$L$は固定2048ではなく、その経路のdistribution.lengthです。

### 1.4 畳み込みと差

独立な確率変数$X$と$Y$の和は`sumDistribution`、0未満を0とする差$\max(0,X-Y)$は`subDistribution`で計算します。どちらもFFTによる線形畳み込みを使用し、必要な長さまでゼロ埋めするため循環による折り返しは発生しません。

FFTの逆変換で生じる微小な負値は0へ補正します。和で配列上限を超えた確率は最後のバケットへ合計し、差で負になった確率はインデックス0へ合計します。

### 1.5 上側確率

分布$p$から、値$x$以上になる上側確率$U_x$を次の漸化式で作ります。

$$
\begin{aligned}
U_0&=1,\\
U_x&=U_{x-1}-p_{x-1}.
\end{aligned}
$$

したがって`upperTailProbability[x]`は$P(X\ge x)$です。成功率、対決、バックトラックの範囲集計で再利用します。

## 2. 達成値

実装は`src/data/ScoreCalculator.js`の`calculateScore`です。

### 2.1 固定値判定

固定値モードではダイスを使わず、技能値を0から1023へ制限した位置に確率1を置きます。ダイスによる自動失敗やファンブルはないため、`failureProbability`は0です。

### 2.2 事前計算済み判定の取得

通常モードでは`CalculationClient`が`calculateDxDistribution({ dice, critical, shihai })`を計算コアへ注入し、返された2048要素の分布を使用します。この段階のインデックス0はダイス数0の自動失敗、インデックス1はファンブルを表す内部表現です。JSONリポジトリの分布取得関数は参照・回帰経路に残します。

### 2.3 `yousei`の合成

ダイス数が正で`yousei`が正の場合、指定回数だけ次の処理を繰り返します。

1. 現在の正の達成値$x$を$10\lceil x/10\rceil$へ移し、同じ移動先の確率を合計する。
2. 作業配列の最後については、全確率が1になるよう残りの確率を集約する。
3. クリティカル値が10以下なら、効果適用後に追加される1ダイス判定の分布を畳み込む。

クリティカル値11では、10へ変更したダイスがクリティカルしないため、追加判定はありません。ダイス数0は自動失敗であり、`yousei`を指定してもこの変換を行いません。

### 2.4 ファンブルと技能値

事前計算分布のインデックス0と1を`failureProbability`として取り出してから、両方を0にします。残りの通常結果だけへ技能値をシフト加算し、取り出した失敗確率をインデックス0へ戻します。

この順序により、技能値が正でも自動失敗やファンブルへ技能値を加えません。一方、通常結果へ負の技能値を加えて0になった確率は結果分布のインデックス0へ入りますが、ルール上の自動失敗やファンブルではないため`failureProbability`には含めません。

最後に1024要素へ集約し、上側確率を作成します。

### 2.5 実行時`dx`基礎分布

`calculateDxDistribution({ dice, critical, shihai })`は、現在の受理範囲（`dice=0..99`、`critical=2..11`、`shihai=0..19`）について、2048要素の`Float64Array`を返します。インデックス2047は作業分布の末尾バケットです。返却時には各確率を小数第6位へ丸め、確率総和が1になるよう生成器と同じ1単位補正を行います。これは公開JSONとの置換互換を保つための実装上の契約であり、一般的な計算コアの必須丸めを意味しません。

`shihai=0`では、1個のダイスの累積分布を$F_c(x)$として$P(V_{n,c}\le x)=F_c(x)^n$を直接評価します。`dice=0`はインデックス0の自動失敗です。

`shihai>0`では、`shihai+1`個から要求されたダイス数までをダイス数の動的計画法で順に計算します。各ダイス数の一段階分布は、クリティカル個数が`shihai+1`以上かつ現在のダイス数未満の既計算状態をシフト加算して作ります。全ダイスがクリティカルする自己遷移は、$d_x=a_x+p_c^n d_{x-10}$を配列方向に解き、末尾バケットへ残余確率を集約します。`dice<=shihai`は自動失敗の点分布です。

全入力範囲の公開JSON比較と数値監査は`node scripts/verify-runtime-dx.mjs`で実行します。現行環境で20,000分布を約43.5秒（同一入力を個別API呼び出し）で比較し、最大要素差は`1.00000000003e-6`、最大総和誤差は`1.56e-15`でした。非有限値と負確率はありませんでした。代表ケースは`shihai=0`が約0.56ms、`shihai>0`が約0.59ms、最大ケース（99 dice、critical=2）はそれぞれ約0.21msと約4.25msでした。最大ケースの主要な`resultByDice`等のFloat64Array配列だけで理論上約1.56MiBを占めますが、これは係数表、その他の一時領域、JavaScriptランタイムを含む実測総メモリ量ではありません。これはNode.js同一環境の監査結果です。

本番の通常判定はCalculationClientから実行時DX計算器を直接注入し、同じ入力の分布をクライアント単位の小さなLRUキャッシュで再利用します。実ブラウザ実験では現行最大ケースのメインスレッドウォーム最大が11.8 ms、Worker往復の追加コストが最大1.0 msで、現行範囲ではメインスレッド直接実行を採用しました。公開JSONは参照・回帰検証のために残します。

## 3. 成功率と対決

実装は`src/data/ScoreCalculator.js`の`getScoreSummary`です。

固定難易度$t$に対する成功確率は原則として$P(A\ge t)$です。ただし$t=0$では、分布のインデックス0に通常結果と自動失敗・ファンブルが共存するため、上側確率から`failureProbability`だけを除きます。

$$
P(\text{成功})=
\begin{cases}
P(A\ge0)-P(\text{自動失敗またはファンブル}) & t=0,\\
P(A\ge t) & t>0.
\end{cases}
$$

対決ではアクション側がリアクション側を上回った場合だけ成功します。アクション側を$A$、リアクション側を$R$とすると、アクション側の成功確率は次のとおりです。

$$
P(A>R)=\sum_a P(A=a)P(R<a)
$$

`upperTailProbability[a]`は$P(R\ge a)$なので、実装は$P(R<a)=1-P(R\ge a)$を使用します。同値はリアクション側の勝利です。

## 4. 単発ダメージ

実装は`src/data/DamageCalculator.js`の`getDamage`です。

### 4.1 命中確率とダメージダイス数

アクション側の達成値$a$ごとに、リアクション側を上回る確率を掛けます。

$$
w_a=P(A=a)\left(1-P(R\ge a)\right)
$$

この達成値で命中したときのダメージダイス数は、追加ダイス数を$b$として次のとおりです。

$$
d(a)=\left\lfloor\frac{a}{10}\right\rfloor+1+b
$$

`kazanari`に対応する`dr`分布から$d(a)$ダイスの列を取り出し、$w_a$で重み付けして混合します。命中しなかった確率は別に合計しておき、すべての軽減処理の後でダメージ0へ加えます。

### 4.2 `dr`の転置ビュー

配信する`dr`はダイス数ごとに分布を保存しますが、実行時の混合は「同じダメージ値について複数のダイス数を見る」順序です。`getDrDamageDistributions`は初回使用時に`distribution[damage][dice]`という転置済みの`Float64Array`へ変換します。

転置後は内側ループで連続したメモリを走査できます。メモリ使用量を抑えるため、転置ビューは最近使用した3種類の`kazanari`だけをLRU方式で保持します。

### 4.3 攻撃力と防御

攻撃側固定値を$\alpha$、防御側固定値を$\gamma$、防御側ダイス軽減を$B$とすると、命中時の最終ダメージは次のとおりです。

$$
Z=\max(0,Z_0+\alpha-B-\gamma)
$$

実装では固定値差$\alpha-\gamma$が正なら先に加算し、ダイス軽減$B$を引いた後、固定値差が負なら最後に減算します。この順序は、途中で0へ集約されることによって後続の正の値を失わないために必要です。

最後に非命中確率をダメージ0へ加え、公開分布へ集約して上側確率を作成します。

## 5. 複数攻撃の合計

`getTotalDamage`は、選択された各コンボのダメージ分布を順番に畳み込みます。初期値はダメージ0に確率1を持つ点分布です。

各コンボの結果はすでに非命中をダメージ0として含むため、単純な畳み込みによって「どの攻撃が命中したか」を含む合計ダメージ分布になります。合計は公開分布上で行われるため、途中で1023以上になった値はそれ以降も最後のバケットに残ります。

## 6. バックトラック

実装は`src/data/BacktrackCalculator.js`の`getFinalEncroachment`です。

### 6.1 ダイス数

ロイス数を$l$、Eロイス数を$e_l$、画面のダイス補正を$b$、Dロイスによる補正を$\delta$とすると、各振り方のダイス数は次のとおりです。

$$
\begin{aligned}
n_{\mathrm{single}}&=\max(0,l+e_l+b+\delta),\\
n_{\mathrm{double}}&=\max(0,2l+e_l+b+\delta),\\
n_{\mathrm{second}}&=\max(0,3l+e_l+b+\delta).
\end{aligned}
$$

負のダイス数は0個として扱います。Dロイス《屍人》では`livingdead`、それ以外では通常の`d10`分布を取得します。

### 6.2 侵蝕率区分

現在侵蝕率を$e$、固定値による減少を$v$、ダイス合計を$S$とすると、最終侵蝕率は$E=e-v-S$です。最終侵蝕率が$t$以下となる境界は、ダイス合計では次の位置になります。

$$
S\ge\max(0,e-v-t)
$$

通常の1倍振りは100%以上、71～99%、51～70%、31～50%、30%以下の5区分へ分けます。「不死者・悪夢」は120%以上、100～119%、71～99%、51～70%、31～50%、30%以下の6区分を使用します。2倍振りと追加振りは、通常は99%以下、「不死者・悪夢」では119%以下を成功側として2区分へ分けます。

各区分の確率は分布の該当する半開区間`[start, end)`を合計し、表示時に0.1パーセント単位へ丸めます。

現行の`getNightmareSingleResult`には、100～119%の区間の終端と71～99%の区間の始端が連続しておらず、最終侵蝕率がちょうど100%になる確率をどの区分にも加えない不整合があります。正しい区分は上記の仕様であり、修正と境界値テストの追加を[`todo.md`](./todo.md)に記録しています。

## 7. 静的アセットの取得とキャッシュ

実装は`src/data/PrecomputedDataRepository.js`です。

アセットの取得時にスキーマバージョン、データリビジョン、データセット名、分布長、インデックス範囲、疎分布の範囲、確率値、確率総和を検証します。検証を通過したデータだけを登録します。

`dx`は`shihai`ごと、`dr`は`kazanari`ごとのファイルを遅延取得します。同じファイルへの同時リクエストは進行中のPromiseを共有し、取得後はメモリへ保持します。`d10`と`livingdead`も一度取得したアセットと展開済み分布を再利用します。

## 8. 計算量と性能上の要点

- 長さ$N$の分布のシフト、上側確率、範囲集計は$O(N)$です。
- FFTによる畳み込みは$O(N\log N)$であり、複数回の畳み込みを直接二重ループで行うより有利です。
- `dr`の転置には初回だけ時間とメモリを使いますが、ダメージ混合の内側ループを単純化し、同じ`kazanari`の再計算で再利用できます。
- 達成値の混合では確率が0でない達成値だけを処理し、不要な`dr`参照を避けます。
- 公開分布より広い作業分布はFFTや走査の定数倍コストを増やしますが、負の補正前に上限を集約しないための正確性を優先した設計です。

絶対時間は実行環境に依存します。変更前後の比較には`npm run benchmark:calculators`を同じ環境で実行します。

## 9. 実装とテストの対応

| 処理 | 実装 | 主なテスト |
| --- | --- | --- |
| 分布の展開、集約、シフト、上側確率 | `src/data/Distribution.js` | `tests/distribution.test.js` |
| 畳み込みと差 | `src/data/FFT.js` | `tests/fft.test.js` |
| 達成値、成功率、対決 | `src/data/ScoreCalculator.js` | `tests/runtimeRuleValidation.test.js`、`tests/calculator.test.js` |
| 単発・合計ダメージ | `src/data/DamageCalculator.js` | `tests/runtimeRuleValidation.test.js`、`tests/calculator.test.js` |
| バックトラック | `src/data/BacktrackCalculator.js` | `tests/runtimeRuleValidation.test.js`、`tests/calculator.test.js` |
| アセット検証とキャッシュ | `src/data/PrecomputedDataRepository.js` | `tests/precomputedDataRepository.test.js` |
| 動的範囲の計画、Score配列長、CalculationClient preflight | `src/calculation/RangePlanner.js`、`src/calculation/ScoreCalculator.js`、`src/application/CalculationClient.js` | `tests/rangePlanner.test.js`、`tests/calculationCore.test.js`、`tests/calculationClient.test.js`、`tests/calculationClientIntegration.test.js` |
| 実行時DRの可変FFT・出力長、Worker protocol | `src/calculation/RuntimeDamageRollCalculator.js`、`src/calculation/RuntimeDamageRollLimits.js`、`src/application/RuntimeDamageRollClient.js`、`src/application/RuntimeDamageRollWorker.js` | `tests/runtimeDamageRollProduction.test.js`、`tests/runtimeDamageRollProductionClient.test.js` |
| Damageの動的範囲、有限防御support、CalculationClient接続 | `src/calculation/DamageCalculator.js`、`src/application/CalculationClient.js`、`src/data/PrecomputedDataRepository.js` | `tests/runtimeDamageOnDemand.test.js`、`tests/calculationClient.test.js`、`tests/precomputedDataRepository.test.js` |

独立したルール検証の考え方は[`runtime-rule-validation.md`](./runtime-rule-validation.md)を参照してください。旧実装との移行比較は回帰の検出に使用しますが、ルール上の正しさを保証する期待値には使用しません。

## 10. 変更時の確認事項

実行時計算を変更するときは、次の点を同じ変更単位で確認します。

- ルールの解釈を変える場合は`dice-rules.md`と独立テストを更新する。
- 事前計算と実行時の責務境界を変える場合は、この文書と`precomputation-algorithms.md`を更新する。
- 配列長や上限集約を変える場合はADRを追加または更新し、負の補正を含む境界値を検証する。
- 新しい分布を合成する場合は、確率総和、非負性、到達範囲、上側確率の単調性を検証する。
- 性能に影響する場合は、同一環境のベンチマーク結果を変更前後で比較する。

## 11. 動的範囲plannerとCalculationClient preflight

`src/calculation/RangePlanner.js`に、score、check、attack、backtrackの入力からDXの作業範囲、DRの有限support、FFT長、推定時間・メモリ、warning/rejectを計画するcore APIを追加しました。checkはactionとreactionの2つのscoreに`scoreTail`予算を均等配分し、damage planは作りません。DXは`TailCertificate`、DRとバックトラックは有限supportとして扱い、`overflowInfo`では`dx-tail`、`finite-support`、`display-bucket`、`asset`を区別します。`published-bucket`を既定値にしており、`full-tail`は計画値を返せます。

DXの尾部certificateは、`shihai=0`かつ`yousei=0`では最大値のCDFから得る`exact-max`、`shihai=0`かつ`yousei>0`では妖精の手の反復を厳密に分解する`exact-yousei`です。1ダイスを`Z=10L+R`（`p=(11-critical)/10`、`L`は幾何分布、`R`は`1..critical-1`）と分けると、通常の最大値の`M`と追加ダイスの負の二項和`S_y`によって、`A_y=10(y+M+S_y)+R`になります。plannerは`P(M>m)`を`expm1`で、負の二項PMFを対数再帰で評価し、`P(A_y>x)`を直接求めます。このため、有限配列の末尾バケットやnear-oneなCDF差に依存せず、cutoffを二分探索できます。`critical=11`は`p=0`の退化ケース、`dice=0`は`yousei`にかかわらずtail 0です。

`shihai>0`かつ`yousei>0`は現行UIの非対応組み合わせなので、plannerは`conservative-union-bound`を診断用に返し、`incompatible-input`をrejectします。この組み合わせを`exact-yousei`と表示しないことで、厳密certificateと保守boundを区別します。

certificateの確率clampでは、`NaN`をtail 0へ変換せず計算失敗として例外にし、`+Infinity`と`-Infinity`はそれぞれ確率`1`と`0`の明示的な端点として扱います。`scoreTailBound`の入口では、dice 0を含むすべての経路で`critical`がsafe integerの2～11であることを検証します。

`CalculationClient`はdefault dependencyとして`planCalculationRanges`を持ち、`planCheck(params, difficulty?, policy?)`、`planAttackCombo(params, policy?)`、`planBacktrack(params, policy?)`からsnapshot済み入力の計画を直接取得できます。`calculateCheck(params, difficulty, options)`、`calculateAttackCombo(params, options)`、`calculateBacktrack(params, options)`は計算前に同じ計画を生成し、`options.rangePolicy`を渡し、`options.onRangePlan`があれば計画直後に1回だけ呼び出します。このcallbackは同期通知であり、戻り値を待機しないため、非同期callbackは公開契約に含めません。`accepted`が`false`の場合は`CalculationRangeError`を`plan`と`rejectionReasons`付きでthrowし、アセット読込、DX計算、DR Worker起動、結果生成を開始しません。

preflightの計画やwarningは公開planメソッドまたはcallbackから取得し、既存のcheck/attack結果に`rangePlan`を追加せず、backtrackを含む既存の戻り値形状を維持します。attackでは`action.score`と`reaction.score`をscore planへ、`action.damage`と`reaction.damage`をattack/defence planへ写像します。《イベイジョン》のreaction scoreは実計算が固定値であるため、planning時だけdice 0、critical 11、shihai 0、yousei 0、skill維持へ正規化します。`rangePolicy`と`onRangePlan`はruntime damage optionsから除外し、`signal`や`requestId`など既存optionsはそのまま渡します。

backtrackの計算では、`calculateBacktrack`が同じpreflightの`plan.backtrack`を計算coreへ渡します。`runtime options`（`signal`、`requestId`など）と計画を別引数に分け、`workingMax`、`workingLength`、`fftLength`を計算側で再検証します。計画なしの直接呼出しは従来どおりproviderの1024要素配列を使い、計画ありでは完全supportが必要なときだけオンデマンド生成へ切り替えます。

Scoreのdynamic接続では、`ScoreRangePlan.workingLength`をDX providerとScoreの全ての中間配列へ渡します。`calculateDxDistribution(params, options?)`は明示された`workingLength`または`size`を検証し、値0の明示bucketとoverflow bucketを分けるため最低2要素、かつplannerの通常hard policyより広い直接API safety ceilingも超えないようにします。既定の引数なし呼出しは2048要素と従来の小数第6位互換丸めを維持し、planあり呼出しは小確率を消さない`unrounded`または`full-precision`を内部指定します。直接APIの現在の安全上限は65536要素であり、既定plannerのScore hard limit 16384要素とは別の防御的な上限です。hard policyを将来広げる場合も、このAPI上限と同時に見直します。

妖精の手を使うScoreでは、主DXと1D10分布を同じworkingLengthで取得し、同長配列の線形畳み込みを行います。実装のFFT長は`nextPowerOfTwo(2 * workingLength - 1)`で、RangePlannerの`score.fftLength`もこの値を返します。`oneDieCutoff`は独立した1D10 tail診断値として残しますが、FFT長の決定には使いません。`sumDistribution`は任意の`fftLength`と`onFftLength`診断callbackを受け付け、指定値が実際の必要長と一致しない場合は例外にします。

丸めはDX分布生成の最後にだけ行います。引数なしのlegacy pathと明示的な`legacy`または`six-decimal`だけが小数第6位の互換丸めと総和補正を使い、planner dynamic pathはDX、妖精の手用1D10、畳み込み、skill shiftの間で未丸め値を保持し、最後の公開1024要素へのcollapse後にも追加の互換丸めを行いません。したがって同じ入力でも固定2048のlegacy結果とdynamic結果には丸め由来の小差があり得ますが、tail certificateの誤差予算とは別に扱います。

末尾bucketは`workingMax`超のDX tailを集約したものです。後続の妖精の手、畳み込み、負のskill shiftはそのbucketを下位の通常値へ復元できないため、shift後の近似誤差は`ScoreRangePlan.tail.bound`内のtail massを超えない契約です。各DX生成段階とScoreの畳み込みでは確率総和、非負性、有限値を検証し、NaNやmaterial negativeを結果へ流しません。DRの直接Calculator/Workerは第1単位で可変range optionsに対応し、第2-BでDamageCalculator、有限防御support、CalculationClientからのDamageRangePlan接続まで完了しました。第2-Cで計画のwarning/rejectとoverflow下限をUIへ表示します。第2-Dでbacktrackの完全support生成とplan伝播も完了しました。total damageの現行1024 published bucket集計は維持し、残る課題はresource guardと将来のdynamic output契約、入力上限、JSON経路です。

`CalculationClient`はcheckとattackのpreflight planを捨てず、actionとreactionの順にScoreCalculatorへ渡します。《イベイション》の固定reactionは引き続きDX providerを呼ばず、戻り値形状も変更しません。runtime DX cacheのキーはdice、critical、shihai、workingLength、rounding modeを含むため、同じ入力でも異なるplanの固定2048結果を誤再利用しません。同じplanは既存のLRU cacheで再利用されます。

## 12. RuntimeDamageRollCalculatorの可変FFTと出力長（第1単位）

`generateMixedDamageDistribution(weights, kazanari, options?)`は、引数なしでは従来どおり`fftLength=4096`、`distributionLength=2048`で計算します。明示optionsの計算項目は`fftLength`、`distributionLength`、`rawSupportMax`です。`distributionLength`はdamage 0の通常バケットと末尾のoverflow bucketを分けるため2以上、`fftLength`以下でなければなりません。`fftLength`は2の冪で、直接APIの安全上限は`1 << 20`です。

DRの有限supportは、`weights[dice]`が非ゼロとなる最大のdamage dice数を$n$とし、`rawSupportMax=10n`と定義します。`kazanari=0..9`の振り直し規則は1個のダイスの最大値10を超える出目を作らないため、kazanariはこの上限を増やしません。全weightが0の場合の必要supportは0です。`rawSupportMax`を明示する場合は、weightsから導出した必要support以上の安全な整数であることを検証し、`fftLength > rawSupportMax`を要求します。この条件により、逆FFTで循環して先頭へ折り返す質量を許しません。明示値は将来のplannerが保守的な上限を渡せるよう、必要supportと同値である必要はありませんが、下回る値は拒否します。さらに逆FFT後は、明示された`rawSupportMax`ではなくweightsから得たactual support`10n`より上の実数係数が絶対値`1e-12`以下であることを検証します。閾値を超えるsupport外係数は末尾overflowへ暗黙に集約せず、計算をrejectします。`1e-12`は既存の逆FFT微小誤差clamp閾値であり、全列挙比較で観測されるおよそ`1e-15`級の丸めノイズを吸収する一方、意味のある確率質量を隠さないための契約です。

逆FFT後はactual supportの範囲内で`distributionLength - 1`以上の全インデックスを末尾へ加算します。actual supportより上の係数は絶対値`1e-12`以下であることを検証してから無視し、閾値を超えるsupport外質量は末尾へ混ぜず例外にします。各確率と総和が有限であることを確認し、絶対値`1e-12`以下のFFT由来の微小値と小さな負値だけを0へ補正します。material negativeは黙って捨てず例外にし、weight総和との差が数値許容範囲内の場合だけ最大バケットへ補正します。これにより、出力長を縮めても確率質量を捨てず、`kazanari=0`と非ゼロの双方で総和と非負性を検証できます。

`RuntimeDamageRollClient`は正規化済みの3項目をrequestの`options`としてWorkerへ渡します。`signal`は呼び出し側の中断制御として保持してWorkerへstructured cloneせず、既存の内部`id`、transferable weights、重複排除、LRU、Worker障害後の再生成を維持します。cacheと進行中requestの比較には`fftLength`、`distributionLength`、`rawSupportMax`を含めるため、異なる出力長を誤って再利用しません。Workerはoptionsなしの旧requestも既定値で処理できます。

この第1単位はRuntimeDamageRollCalculatorとWorker経路のパラメータ化を完了したものです。DamageCalculatorの接続では第2-Bで計画値をprovider optionsと防御畳み込みへ伝播し、公開1024要素へcollapseします。UI入力上限と公開JSONの変更はまだ行っていないため、後続処理がこの分布の長さとoverflow契約を明示的に受け取る必要があります。

## 13. Damage dynamic range 第2-A（完了）

第2-Aでは、最終値を`Z=max(0,X+a-Y)`として、`a=attack.value-defence.value`、`R=10*maxDamageDice`、`D=10*defenceDice`、計算上限を`C`と定義した。防御直前に必要な最後の明示値は`a>=0`なら`W=min(R+a,C+D)`、`a<0`なら`W=min(R,C-a+D)`である。`workingMax=W`、明示値のindexは`0..W`、overflowのindexは`W+1`なので、作業配列長は`W+2`とする。

末尾overflowを値`W+1`以上として扱っても、`a>=0`では防御後の下限`W+1-D`、`a<0`では`W+1-D+a`が、`W`を計算上限から逆算したケースでそれぞれ`C+1`以上となる。`W`がraw supportで決まるケースではoverflow質量自体がないため、計算上限以下へ戻る質量を失わない。この境界は正、ゼロ、負の固定差、防御ダイス0、正の防御ダイスでplannerテストに固定した。

`subDistribution`は第1配列長`L1`と有限supportの第2配列長`L2`を別々に受け、`A*reverse(B)`の係数`c[k]`から`result[0]=sum(c[0..L2-1])`、`result[v]=c[L2-1+v]`を構成する。線形畳み込み必要長`L1+L2-1`以上の最小の2冪を実使用FFT長とし、既存の`sumDistribution`と同長`subDistribution`の既定値・公開挙動は維持する。明示FFT長はこの値への厳密一致とし、`onFftLength`で実使用値を検証できる。

第2-AはRangePlanner、実験planner、FFTとそのテストおよび契約文書までを完了した。第2-BではこのplanをDamageCalculatorとCalculationClientへ接続し、runtime optionsとdamage planを分離した明示契約を導入した。

## 14. Damage dynamic range 第2-B（完了）

`calculateDamageOnDemand`は第5引数をruntime options、第6引数を任意の`DamageRangePlan`とし、`CalculationClient`はpreflightの`plan.damage`を第6引数へ渡す。`signal`、`requestId`、dedup、cache、cancelの責務はruntime optionsと既存clientに残し、planの値をoptionsオブジェクトへ混在させない。

planありのprovider optionsはruntime optionsを保持したまま、planの`fftLength`、必要なraw `distributionLength`、`rawSupportMax`を上書きして作る。必要なraw最大値は`a>=0`なら`max(0,W-a)`、`a<0`なら`W`とし、raw support内であれば次のoverflow bucketを含む長さ、raw support端点まで必要なら`R+1`を使い、runtimeの最小長も満たす。planなしは従来のprovider既定値と作業長2048を維持する。

raw分布は防御前の座標`X`として扱う。`a>=0`では`X+a`を防御へ入力し、`a<0`では`X`を防御へ入力してから固定差を適用する。planの証明により境界以下へ戻れない非点質量のoverflow bucketはシフトせず公開overflowへ直接合算し、raw supportが`R`まで明示的に必要な場合だけ`R`の一点質量を通常値として処理する。

防御分布は`0..D`の`D+1`要素へ展開し、`defenceFftLength`を`subDistribution`へ渡す。防御差の負値は0へ、failure massは0へ合算し、最後に公開長1024へcollapseする。provider返却分布と防御分布は長さ、有限性、非負性、確率総和を検証し、微小な負値だけを0へ補正する。

`PrecomputedDataRepository`は有限supportが要求長に収まる場合に、既存アセット長1024より短い`d10`および`livingdead`配列も生成できるようになった。既定のアセット取得長と公開分布のoverflow semanticsは変更していない。第2-Bの対象外だったUI表示は第2-Cで範囲warning/rejectの表示を追加した。total damageの現行1024 published bucket集計は変更せず、対象外として残るのはresource guardと将来のdynamic output契約、入力上限、JSON経路である。backtrackの動的範囲接続は第2-Dで完了した。

## 15. Dynamic range feedback in the UI（第2-C）

`src/application/CalculationFeedback.js`に、`CalculationClient`の`onRangePlan` callbackを受けてUI状態へ反映する共通formatterとlatest-request runnerを追加しました。`src/components/RangePlanNotice.vue`はplannerのwarning codeを日本語の理由へ変換し、推定計算時間、推定メモリ、該当する`overflowInfo`の下限を表示します。warningは`role=status`と`aria-live=polite`、hard rejectは`role=alert`と`aria-live=assertive`で通知し、色だけに依存しません。

checkとbacktrackは画面単位、attackはコンボ単位でfeedbackと`resultReady`を保持します。`CalculationRangeError`は計算器とアセット読込が始まる前に既存契約どおり発生し、UIはrejectの理由を表示して古い分布を結果として残しません。各更新はrequest tokenでcommit対象を制限し、前のattack requestにはAbortControllerを渡します。UI runnerが`options.signal`を受け取った場合は、呼び出し側signalとrunner所有signalを`AbortSignal.any`（非対応環境では同等のfallback）で合成し、どちらも上書きしません。AbortError、古いrequest、アンマウント後のcallbackはUIエラーへ変換しません。

この変更はRangePlannerをUIへ複製せず、`CalculationClient`のpreflight callbackだけを利用します。CalculationClientの公開計算結果、現行1024 published bucket、JSON asset、入力上限、full-tail、total damageの集計仕様は変更していません。backtrackだけは第2-Dでplanあり経路の内部supportを拡張しましたが、公開戻り値のカテゴリ形状は維持しています。total damageについて未接続として残る意味は、将来のresource guardとdynamic output契約です。

## 16. Backtrack dynamic range 第2-D（完了）

RangePlannerのbacktrack planは、通常backtrackの3種類（1倍、2倍、3倍）のダイス数を負値0 clamp後に求めます。通常D10の`rawSupportMax`は`10 * maxDice`、《屍人》は`maxDice === 0 ? 0 : 10 * maxDice - 9`であり、`workingMax = rawSupportMax`、`workingLength = workingMax + 1`です。backtrackは畳み込みを使わないため`fftLength`は0です。`rawSupportMax <= assetSupportMax`（1022）なら`asset`、超える場合は完全supportをcore内で生成する`on-demand`です。したがってn=103は通常D10では1030/1031でon-demand、《屍人》では1021/1022でassetです。

計画なしの経路は従来どおりproviderと1024要素アセットを必須とします。計画ありの`asset`経路だけがrepositoryで検証したアセットを使い、`on-demand`経路はアセットを読まずに、通常の`nD10`を前向きDP、《屍人》を`sum(d10) - max(d10) + 1`の最大値状態DPで完全support生成します。ダイス数0は両方とも値0の点分布です。on-demandで完全supportを生成できる場合、静的アセットのcoverage不足warningは出さず、`overflowInfo`も計算結果のoverflowとは扱いません。

純粋なbacktrack generatorにはplannerを迂回する直接呼出し向けの絶対安全上限があります。`BACKTRACK_MAX_GENERATION_LENGTH = 1 << 16`はDXの直接計算と同じ65536要素規模、`BACKTRACK_MAX_GENERATION_OPERATIONS = 100_000_000`はDPの概算O(n²)処理量を抑える値、`BACKTRACK_MAX_GENERATED_DICE = 1 << 12`は入力の明示上限です。これらはplannerのwarning/reject policyとは別に、配列確保前に検証されます。abortは配列確保前、主要DP境界、4096反復ごとのchunk境界、終了前に確認します。

完全supportを得てから`encroachment - value - threshold`の境界でカテゴリへ集計するため、減算後に表示範囲へ戻る可能性があるoverflow質量を一点値として扱いません。カテゴリの公開配列は従来の1024相当の形状を保ちますが、計画あり経路の最後の区分は生成した有限support末端までを集計します。生成・provider配列は長さ、有限性、非負性、確率総和を検証し、許容した微小負値だけを0へ補正して総和を正規化します。`signal`はDPの途中でも確認し、既存のcancel/stale契約をruntime options側で維持します。

既存1024要素アセットのsupport限界は`assetSupportMax = 1022`として計画metadataに残しますが、on-demandで完全supportを生成する場合は`assetOverflow`をwarningや`overflowInfo.backtrack`の実計算overflowとして表示しません。静的assetを選ぶ経路でcoverage不足が実際に残る場合だけ、asset warningを表示します。低い`calculationMax`をアセット境界の判定に流用せず、planなし経路、公開1024、UI入力上限、JSON削除、full-tail、total damageのdynamic outputは変更しません。
