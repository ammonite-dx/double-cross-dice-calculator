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

RangePlannerのbacktrack planは、通常backtrackの3種類（1倍、2倍、3倍）のダイス数を負値0 clamp後に求めます。通常D10の`rawSupportMax`は`10 * maxDice`、《屍人》は`maxDice === 0 ? 0 : 10 * maxDice - 9`であり、`workingMax = rawSupportMax`、`workingLength = workingMax + 1`です。backtrackは畳み込みを使わないため`fftLength`は0です。legacy planでは`rawSupportMax <= assetSupportMax`（1022）なら`asset`、超える場合は完全supportをcore内で生成する`on-demand`です。したがってlegacyのn=103は通常D10では1030/1031でon-demand、《屍人》では1021/1022でassetになります。canonical client用の内部`canonicalBacktrack` hintはこのasset境界を使わず、常に`on-demand`を選びます。

計画なしのlegacy経路は従来どおりproviderと1024要素アセットを必須とします。legacy計画の`asset`経路だけがrepositoryで検証したアセットを使い、legacyの`on-demand`経路はアセットを読まずに、通常の`nD10`を前向きDP、《屍人》を`sum(d10) - max(d10) + 1`の最大値状態DPで完全support生成します。canonical planも同じDPを使い、現行の疎なアセットをロード・参照しません。現行assetは`rawSupportMax <= 1022`でも数学的support全体を証明できないため、canonical sourceには使いません。ダイス数0は両方とも値0の点分布です。on-demandで完全supportを生成できる場合、静的アセットのcoverage不足warningは出さず、`overflowInfo`も計算結果のoverflowとは扱いません。

純粋なbacktrack generatorにはplannerを迂回する直接呼出し向けの絶対安全上限があります。`BACKTRACK_MAX_GENERATION_LENGTH = 1 << 16`はDXの直接計算と同じ65536要素規模、`BACKTRACK_MAX_GENERATION_OPERATIONS = 100_000_000`はDPの概算O(n²)処理量を抑える値、`BACKTRACK_MAX_GENERATED_DICE = 1 << 12`は入力の明示上限です。これらはplannerのwarning/reject policyとは別に、配列確保前に検証されます。abortは配列確保前、主要DP境界、4096反復ごとのchunk境界、終了前に確認します。

完全supportを得てから`encroachment - value - threshold`の境界でカテゴリへ集計するため、減算後に表示範囲へ戻る可能性があるoverflow質量を一点値として扱いません。カテゴリの公開配列は従来の1024相当の形状を保ちますが、計画あり経路の最後の区分は生成した有限support末端までを集計します。生成・provider配列は長さ、有限性、非負性、確率総和を検証し、許容した微小負値だけを0へ補正して総和を正規化します。`signal`はDPの途中でも確認し、既存のcancel/stale契約をruntime options側で維持します。

既存1024要素アセットのsupport限界は`assetSupportMax = 1022`として計画metadataに残しますが、on-demandで完全supportを生成する場合は`assetOverflow`をwarningや`overflowInfo.backtrack`の実計算overflowとして表示しません。静的assetを選ぶ経路でcoverage不足が実際に残る場合だけ、asset warningを表示します。低い`calculationMax`をアセット境界の判定に流用せず、planなし経路、公開1024、UI入力上限、JSON削除、full-tail、total damageのdynamic outputは変更しません。

Phase 6第1実装単位では、`calculateBacktrackCanonical`を明示opt-inで追加し、既存カテゴリ計算とは別に、実際の最終侵蝕率`F = encroachment - value - S`を値座標とする`single`、`double`、`second`の3つの`DistributionResult`を返します。各resultは完全finite support、`overflow: null`、未集約・未丸めの確率を持ち、`S`の実現可能な最小値から最大値だけを反転して`offset`と`support.max`へ写像します。負の`F`はclampせずsigned `offset`で保持します。canonical planだけがDPの生成作業配列とfactoryの3本の防御コピーを`float64Bytes`へ加算し、legacy planの見積りとasset経路は変更しません。Vue、既存表示、既存`calculateBacktrack`の戻り値はこの単位では変更しません。

Phase 6第2実装単位では、`src/presentation/BacktrackCanonicalPresentation.js`の`createBacktrackCanonicalPresentation`がcanonical resultの3キーを検証し、finite supportの`explicitMax === support.max`と`overflow: null`を要求します。resultの`offset`から最終侵蝕率を直接走査し、標準singleの`100/71/51/31`、悪夢singleの`120/100/71/51/31`、double/secondの標準`100`・悪夢`120`失敗境界へ集約した後だけ0.1%へ丸めます。戻り値は`kind: backtrack-canonical-presentation`、version、既存ChartSetterへ渡す`finalEncroachment`配列を持ち、signed resultをgeneric PMF/display-window adapterへ渡しません。invalid/infinite/overflow/key不足はtyped presentation errorとして拒否し、Vue、ChartSetter、runner、CalculationClient、legacy計算は変更しません。

Phase 6第3実装単位では、`BacktrackCalculationRunner`がvalidated paramsと一時的な`canonicalOptIn`を同じrequest snapshotへ封じ、legacy/canonicalのclient API選択、最新要求のみのcommit、abort、feedback、ResourceGuardの計画通知、disposeを一つのBacktrack laneで扱います。既定値はlegacyで、canonical結果は`createBacktrackCanonicalPresentation(...).finalEncroachment`へ変換してから既存`FinalEncroachmentChartPanel`へ渡します。条件パネルのtoggleはcontrolled eventとして親がsnapshot化・再計算を起動し、canonical error/resource reject/abort時にlegacyへfallbackせず結果をclearします。toggleとdebug接続は移行検証用であり、Phase 7で削除予定です。

Phase 7第1実装単位では、`createBacktrackCanonicalRunner`をcanonical専用runnerとして接続し、Backtrackの初期計算・入力再計算を`calculateBacktrackCanonical`から`createBacktrackCanonicalPresentation`へ一本化しました。`InputPanel.vue`と`Backtrack.vue`から一時`canonicalOptIn` toggleとlegacy分岐を削除し、初期計算も`onMounted`から同じlatest-wins runnerへ渡します。canonical adapterのpresentation error、ResourceGuard rejection、range rejection、abort、stale result、disposeでは旧結果へfallbackせず結果をclearし、retryで再度commitできます。route guardの`prepareCalculation('backtrack')`だけを削除しましたが、`CalculationClient.prepare('backtrack')`、legacy API、asset、比較fixtureは維持しています。

Phase 7のAttack実装単位では、`Attack.vue`の初期計算、validated input、combo操作を`createAttackCanonicalRunner`の一つのlatest-wins laneへ統合し、`calculateAttackCanonicalBatch`から`createAttackCanonicalDisplayPresentation`を通るcanonical batch/presentationだけをproduction chart、summary、totalへ渡します。legacy初期計算、combo runner、total runner、productionの`canonicalOptIn`/debug panel、legacy fallbackは接続から除き、canonicalのrange/resource/generic/presentation/asset errorでは結果をclearして同じrunnerでretryします。Scoreのunsupported expected valueを`—`とする契約を維持し、Damage/Totalの非保証値も`—`とし、通常の不確かさwarningはUIへ出しません。`/attack` routeの`prepareCalculation('attack')` guardは削除しましたが、明示`CalculationClient.prepare('attack')` API、canonical防御D10のlazy asset、既存`RuntimeDamageRollWorker`、legacy API/assets、比較fixtureは維持しています。表示範囲999、1024/1022境界、legacy生成物の整理、任意display window拡張は後続です。

## Phase 2-G resource guard

Phase 2-G adds a shared FIFO resource guard in `src/application/ResourceGuard.js` and injects the singleton through the application `CalculationClient` dependency factory. `check`, `attack`, and `backtrack` run the existing range preflight first, then reserve before asset loading or calculation, and release the lease from one `finally` path. A preflight hard reject therefore does not reserve anything.

The initial policy is a 64 MiB reservation capacity, at most 4 active requests, and at most 32 queued requests. Admission uses only `plan.estimates.float64Bytes`; the reservation is `ceil(float64Bytes * 1.5)`. `operations` and `timeMs` remain lease diagnostics and are not admission thresholds. Requests whose reservation exceeds capacity and requests arriving after the queue limit are typed `ResourceGuardError` rejections. Queued aborts remove the request and reject with an `AbortError`-named guard error, while an active abort leaves the reservation until the caller settles and releases its lease. Lease release is idempotent.

The attack total-damage aggregation is outside the range-planned `CalculationClient` routes, so it uses one explicit request-level reservation based on the stable published 1024 bucket and its 2048-point internal FFT shape. This connection does not add a second reservation to `RuntimeDamageRollClient`, does not retain calculation arrays in the guard, and does not change the total-damage return shape. The published 1024 bucket, input limits, `RangePlanner` hard policy, core absolute safety limit, JSON paths, and dynamic output contract remain unchanged.

Guard errors are surfaced by the existing `CalculationFeedback` and `RangePlanNotice` path with a resource-specific message. Cache and dedup behavior remains conservative: each `CalculationClient` request reserves independently, and stale queued requests are removed by the existing composed `AbortSignal`. The guard exposes immutable policy values, lease metadata, `snapshot()`, `getSnapshot()`, and `diagnostics()` for tests and runtime diagnostics.

## Phase 2-H distribution result contract（第1単位）

Phase 2-H第1単位では、`src/calculation/DistributionResult.js`に内部用のcanonical distribution result契約を追加した。契約は`version: 1`、`Float64Array`の明示一点確率、safe integerの`offset`、`finite`または`infinite`のdiscriminated unionである`support`、`null`または`exact`・`upper-bound`を区別する`overflow`から構成される。`offset`はcanonical確率変数の明示coverage下端なので負値を許可し、`explicitMax = offset + values.length - 1`を導出する。`finite.support.max`は実際の上界として`explicitMax`以上でなければならない。`explicitMax`は保存せず、空でないときだけ`offset + values.length - 1`から`getExplicitMax`で導出する。

`exact` overflowは`probability`と`errorBound`を持ち、明示massと合計して一になることを検証する。`upper-bound` overflowは`probabilityUpperBound`を持ち、actual probabilityとして扱わず、明示massが一を超えないことと未明示massが上限以下であることを検証する。`errorBound`は補助的な数値誤差metadataであり、`probability`や`probabilityUpperBound`へ自動加算せず、mass summaryのactual massや上限にも自動加算しない。upper-boundを安全にする誤差はproducerが`probabilityUpperBound`へ織り込む。確率総和の浮動小数点許容値はこのmoduleの`DISTRIBUTION_RESULT_TOLERANCE = 1e-8`に集約し、NaN、Infinity、負値、1を超える値、safe integer overflow、support境界違反は`DistributionResultError`系のtyped errorとcodeで拒否する。

factoryは入力のArrayLikeを一度だけ`Float64Array`へコピーし、結果が所有する`values`バッファを直接公開する。metadataとresult objectはfreezeするが、TypedArray要素のfreezeは行わないため、callerは`values`をread-onlyとして扱う。書き込み可能な値が必要な利用者は`copyDistributionValues(result)`を明示的に呼び出す。この契約はcopy-on-readのO(n)割り当てを行わない。

finite supportの`max`はexplicit max以上とし、potential massを持つoverflowでは`lowerBound <= support.max`を要求する。exact overflowの`probability=0`かつ`errorBound=0`、またはupper-bound overflowの`probabilityUpperBound=0`かつ`errorBound=0`はinertであり、finite supportの`max`が`lowerBound`未満でも許可する。inertであることはactual massの証明を追加するものではない。

`fromPublishedBucketDistribution`は現行1024要素の0から1022を明示値、1023を`lowerBound: 1023`のexact overflowへ変換し、legacy arrayだけではfiniteまたはinfinite supportを証明できないため`options.support`を必須とする。`toPublishedBucketDistribution`は明示値のindex 1023以上と、lower boundが1023以上のexact overflowを末尾bucketへ合算するが、upper-bound overflowはactual probabilityではないためtyped errorで拒否する。exact overflowにpotential massがあり`lowerBound`が1023未満の場合は、明示範囲が影響範囲を覆っていてもmassが1023以上だけにある証明がないため`unsafe-projection`として拒否し、inert overflowだけを例外として許可する。

signed `offset`を持つcanonical resultは、現在の表示window契約（`display.explicit.offset`と`displayWindow`は非負safe integer）へ直接渡さない。非負legacy bucketへ値を押し込む`toPublishedBucketDistribution`も、負の座標をクランプせず`unsafe-projection`として拒否する。Backtrackのcanonical producerは実現可能な最小減少量から最大減少量までだけを反転して保持し、ゼロ確率の余分な範囲を作らず、負の最終侵蝕率を`offset`で表現する。

この単位は独立契約とadapter、validator、mass summary、境界テストだけを追加し、既存calculator、`CalculationClient`、UI戻り値、JSON asset経路、入力上限、現行1024 published bucketの解釈には接続していない。可変長`values`を導入しただけでmetadata-awareな演算や公開結果のdynamic outputが完成したとは扱わない。次段階では、計算経路ごとのsupport metadata生成、overflow証明の伝播、JSONとWorkerのserialization方針、公開結果・UIがcanonical resultを受け取る切替条件を別途確定する。

## Phase 2-H distribution result contract（第2単位）

Phase 2-H第2単位では、planned on-demand damageの最終合成結果だけを`DistributionResult` version 1へ変換するpure calculation APIとして`calculateCanonicalDamageOnDemand`を追加した。既存`calculateDamageOnDemand`とprovider dependencies、runtime optionsまでは同じ引数とし、最後の引数にはdamage subplanではなくacceptedなtop-level attack range planを必須とする。canonical APIは`published-bucket` score propagationだけを受理し、未実装の`full-tail`を明示的に拒否する。

DR providerへ渡すweightsはhit sub-probabilityのまま条件付き正規化しない。`H = sum(weights)`と`F = failureProbability`を分離したままproviderの返却総量を`H`として検証し、防御、固定値差、失敗massの合成後にだけ`F + H = 1 ± 1e-8`を確認する。planned経路のDR生成後処理、防御、正負のfixed shift、failure合成は共通のcollapse前helperで一度だけ実行し、既存APIは同じ内部結果を従来どおり1024 published bucketへcollapseしてexact planned overflowを末尾へ加える。canonical APIの導入によって`RuntimeDamageRollCalculator`、Client、Worker protocol、cache、transfer、既存APIの戻り値は変更しない。

canonical resultが表すのは、無限supportを持つ実世界の未打切りDX sourceそのものではなく、published-bucket scoreをdamage dice weightへ変換した有限modeled distributionである。modeled support maxは`max(0, rawSupportMax + fixedDifference - defence.dice)`とし、各加減算をsafe integerとして検証する。modeled supportがworking range内に収まる場合、canonical valuesは0からmodeled support maxまでを保持し、planned overflowが数値許容内で0であることを確認して`overflow: null`とする。modeled supportがworking rangeを超える場合はraw overflowを最終damage座標へ安全に投影し、`a >= 0`では`max(0, workingMax + 1 - defenceMax)`、`a < 0`では`max(0, workingMax + 1 - defenceMax + fixedDifference)`を最終overflowの`lowerBound`とする。明示valuesは`min(modeledSupportMax, lowerBound - 1)`までに切り詰め、lowerBound以上の既知の最終分布massをplanned raw overflowへ加算したexact probabilityと、補助的な`errorBound = 1e-8`を設定して`DistributionResult` factoryへ明示massとの最終正規化検証を委ねる。score tail certificateはmodeled overflowへ加算せず、source approximationの証明としてmetadataだけに保持する。

戻り値はfreezeした`{ result, metadata }`であり、metadataは`modeledDistribution: true`、`scorePropagation: 'published-bucket'`、top-level planの各score tailを防御コピーしてfreezeした`scoreTails`、`modeledSupport: { kind: 'finite', max }`、`sourceSupport: { kind: 'infinite' }`を持つ。この単位では`CalculationClient`、UI、JSON、Worker serialization、total damage、full-tail、公開dynamic outputへ接続しない。次段階ではconsumer側の移行条件とserialization境界を設計し、既存1024結果とcanonical resultを混在させない公開契約を確定する。

## Phase 2-H calculation client canonical opt-in（第3単位）

Phase 2-H第3単位では、既存の`calculateAttackCombo`結果を変更せず、`createCalculationClient()`へ明示的な`calculateAttackCanonical(params, options = {})`を追加した。canonical経路は既存attackと同じsnapshot、RangePlanner preflight、`onRangePlan`、ResourceGuard lease、abort/stale確認、score計算を共有し、DR provider、D10 provider、`onFftLength`、runtime optionsも同じ値を渡す。

第3単位時点のcanonical damage calculatorには`plan.damage`ではなくacceptedなtop-level attack plan全体を渡し、戻り値は`{ score, scoreSummary, canonicalDamage }`だけだった。`canonicalDamage`にはpure APIが返すfreeze済みの`{ result, metadata }`をそのまま保持した。第4単位で`canonicalDamageSummary`を追加した後も、canonical経路はlegacy `damage`、`damageSummary`、`getDamageSummary`を使用せず、legacy calculatorとscore/DR計算の二重実行も行わない。

`calculateAttackCanonical`はopt-in consumer向けの未接続APIであり、UI、既存公開結果、`getTotalDamage`、RuntimeDamageRoll Client/Worker protocol、JSON serialization、入力上限、full-tail契約は切り替えない。preflight rejectはasset/provider/calculator開始前に発生し、canonical calculatorの成功、error、abortを含む全経路でleaseを一度だけ解放する。次段階ではcanonical resultを利用するconsumer、Worker・JSON serialization、公開結果・UIへの移行条件、total damageとのmetadata境界を設計して検証する。

## Phase 2-H canonical expected-value summary（第4単位）

canonical distributionの期待値summaryは`src/calculation/DistributionResult.js`の`getExpectedValueSummary`で計算する。明示値の一次モーメントは`E = Σ (offset + index) * values[index]`であり、`offset`を0とみなさない。`overflow: null`はsupportが`infinite`でも全質量が明示されているため`{ kind: 'exact', value: E }`を返す。

exact overflowの確率を`p`、lower boundを`L`、finite supportの最大値を`U`とすると、finite supportでは`[E + pL, E + pU]`を返し、`p = 0`または`L = U`ならexactへ縮約する。infinite supportでは`p = 0`だけをexactとし、それ以外は`{ kind: 'lower-bound', lowerBound: E + pL }`とする。upper-bound overflowの上限を`q`とすると、`q = 0`はexact、finite supportでは`[E, E + qU]`、infinite supportでは`{ kind: 'lower-bound', lowerBound: E }`とする。値は`exact`、`bounded`、`lower-bound`のJSON-safe discriminated unionで表し、`errorBound`は区間へ加算せずmass summaryのmetadataとして保持する。

`getCanonicalDamageSummary`は`{ result, metadata }` envelopeだけを受ける薄いadapterで、legacy bucketへの変換や`values`のcopyを行わず、freeze済みの`{ expectedValue, mass }`を返す。`mass`は既存`getProbabilityMassSummary`を利用するため、exact/upper-boundの区別、actual mass、upper bound、`errorBound`を保持する。`getDamageSummary`、legacy adapter、UI、total damage、Worker/JSON protocolはcanonical summaryから独立したままとする。

## Phase 2-H canonical independent damage aggregation（第5単位）

`sumCanonicalDamage(canonicalDamages, options = {})`は、`metadata.modeledDistribution === true`と`metadata.sourceSupport`を持つcanonical damage envelopeだけを受け取るpure coreである。各`result`は既存`validateDistributionResult`で検証し、入力のresult、metadata、values、overflowは変更しない。0件は`values: [1]`、offset 0、finite support max 0、overflow nullのdamage 0 identityを返す。1件でも不要なFFTは実行せず、planが所有する係数列のコピーから独立したresultを返す。

複数件の明示valuesは、各offsetを座標の基点として完全線形畳み込みする。配列長は同一である必要はなく、必要長`L1 + L2 - 1`以上の最小2冪FFTを使う。明示valuesが一つでも空なら明示結果は空のままとし、overflowのlowerBoundを一点値として配列へ挿入しない。新しい`convolveDistributions` helperは旧private実装を公開したものであり、既存`sumDistribution`と`subDistribution`の丸め・末尾集約の挙動は変えない。

supportはmodeled resultとmetadataのsourceSupportを別々に加算する。全componentがfiniteならmaxをsafe integerとして加算し、どれか一つがinfiniteならinfiniteを伝播する。sourceSupportが欠落または不正なenvelopeはtyped invalid-envelopeとして拒否する。overflowはcomponent間の独立性を仮定し、nullを0、exactの`probability`を実値、upper-boundの`probabilityUpperBound`を上界として、`Math.log1p(-p)`と`-Math.expm1(sum)`による安定な`1 - Π(1-p_i)`または`1 - Π(1-q_i)`を計算し、p=1は1として扱う。全てnull/exactならoutputはexactで、全入力overflowがnullの場合だけnullにする。upper-boundが一つでもあればoutputはupper-boundとし、FFT後の明示mass不足`1 - explicitMass`もmaxに含めて1でcapする。mixed時はexact componentだけのunionを`metadata.overflowProbabilityLowerBound`へ残す。

damageは非負domainのため、output overflow lowerBoundはpotential tail massを持つcomponentのlowerBound最小値とする。probability上は0でもsource errorBoundを持つinert overflowはoutput overflowのerrorBoundとmetadataへ残し、tail lowerBoundを明示一点値へ変換する根拠にはしない。`aggregationErrorBound`はsource errorBoundの合計とconvolution mass drift（exact pathではsource explicit massとunion targetへのnormalization driftを含む）を保守的に伝える。

FFT逆変換後の係数は既存runtimeと整合する`1e-12`までの微小負値だけを0へclampし、material negative、非有限値、FFT convolution mass driftが`1e-8`を超える値、またはcanonical validatorが許容できない最終massはcanonical aggregationのtyped numerical-failureとする。source normalization drift（source explicit massとunion target、またはsource unionと最終explicit massの差）は失敗条件ではなく、`sourceMassDrift`と`aggregationErrorBound`へ記録する。exact outputはsource unionを`metadata.sourceOverflowProbability`へ診断値として保持するが、output probabilityは最終explicit massから`1 - explicitMass`で決める。空の明示valuesが許容誤差内で残る場合も空のままとし、source unionを一点massとして補充しない。これは浮動小数点補正を数学的な追加確率として主張しないための判断である。upper-bound pathはraw explicit massを保持し、上界のcoverageへ不足分を加える。

values length、offset/supportの加算、linear convolution length、FFT length、推定buffer bytesは配列確保前に検証する。既定absolute limitはvaluesとFFT lengthが`1 << 20`、component countが`1 << 12`、resource bytesが512 MiBであり、component、inspected、steps、descriptors、metadata、outputのpersistent estimateに各FFT peakを加えた値をguardする。optionsは`maxValuesLength`、`maxFftLength`、`maxResourceBytes`、`maxComponents`、`signal`、`onFftLength`だけを受け付け、各上限を下げることだけを許可する。`signal`は入力検証前、畳み込み前後、FFTの各stage境界、mass補正前後で確認し、標準AbortError名のtyped abortを返す。`onFftLength`は実使用FFT長をcomponent間の各畳み込みで通知する。

この単位の変更はpure aggregation core、公開FFT helper、unit tests、設計文書と`calculation/index.js` exportに限定した。`CalculationClient`、UI、legacy `getTotalDamage`、combo ViewModel、Worker/JSON protocol、display再集約、total summary、既存の公開bucket契約は接続しない。

## Phase 2-H canonical total damage consumer（第6単位）

`planCanonicalDamageAggregation(canonicalDamages, options = {})`は、canonical damage配列を検証して、畳み込みsteps、出力長、support、persistent/FFT peakを含むfreeze済みread-only planを返す。`plan.estimates.float64Bytes`、`operations`、`timeMs`はResourceGuardの`acquirePlan()`へ渡せる見積りであり、planは内部識別も持つため、外部で似たshapeを作ったplanや改変後の見積りを`sumCanonicalDamage()`へ渡すことはできない。

`sumCanonicalDamage(canonicalDamages, { plan, ...options })`は、plan作成時と同じ入力snapshotに対して検証・計画を繰り返さず、保存された同一planのstepsを実行する。`signal`と`onFftLength`は実行時のabort確認・実FFT通知として渡し、clientはFFT長やresource量を再実装しない。

`getCanonicalTotalDamageSummary({ result, metadata })`はtotal damage専用の`{ expectedValue, mass }` adapterである。upper-bound aggregateの期待値下限は、明示一次モーメントに`metadata.overflowProbabilityLowerBound * overflow.lowerBound`を加える。finite supportの上限は明示一次モーメントに`probabilityUpperBound * support.max`を加え、infinite supportではlower-boundを返す。exact/nullは既存summary semanticsを使い、`sourceMassDrift`や`errorBound`を期待値・確率区間へ加算せず診断metadataとして保持する。

`CalculationClient.calculateCanonicalTotalDamage(canonicalDamages, options = {})`は入力配列snapshot、aggregation plan、単一ResourceGuard lease、同じplanによるaggregation、total summaryの順に実行し、成功時に`{ canonicalTotalDamage, canonicalTotalDamageSummary }`を返す。既存`calculateTotalDamage`、UI、combo ViewModel、Worker/JSON、display再集約、公開1024 bucket結果はこのopt-in経路から変更しない。

## Phase 2-H canonical distribution presentation（第7単位）

`src/presentation/DistributionPresenter.js`の`presentCanonicalDistribution(canonicalEnvelope, { summary, warnings = [], displayWindow })`は、`modeledDistribution === true`のcanonical damageまたはcanonical total damage envelopeを、UI非依存の`canonical-distribution-display`へ変換するopt-in presenterである。single damageには`getCanonicalDamageSummary`、total damageには`getCanonicalTotalDamageSummary`で得たsummaryをcallerが渡し、presenterはmassやexpected valueを再計算しない。`summary`、`warnings`、metadataの必須値はown data propertyとして検証し、optionsが`null`などの非plain recordの場合もtyped errorで拒否する。`displayWindow`を指定する場合は非負safe integerの`min`/`max`と順序だけを検証し、結果には要求境界としてコピーする。presenterはwindowへ再計算・projectionせず、canonicalの明示coverageを保持する。

displayの`explicit`は`offset`と明示`values`の全係数を通常配列で保持し、値座標は`offset + index`で解釈する。0確率も保持し、overflow、tail、graph上限を末尾係数へ加算せず、広い配列に対するpoint object列も生成しない。`explicitMax`は空配列なら`null`、それ以外は`offset + length - 1`であり、supportとoverflowはcanonicalのfinite/infinite、null/exact/upper-bound unionを独立コピーする。

summaryとwarningsはJSON-safeな深い防御コピーとして保持し、返却値全体をfreezeする。accessorと循環参照は実行せずtyped errorで拒否し、コピーは最大深度64、総ノード数10,000の固定上限と`WeakMap` memoを持つため、深い入力やDAGの再展開でstack overflow・増幅を起こさない。warningは日本語化せず、plain record、`code`文字列、`severity`（`info`・`warning`・`error`・`reject`）を要求する。plannerのhard-limit warningが持つ`reject`はそのまま保持する。presenterは`src/presentation/index.js`からのみ公開し、既存calculation indexへ混ぜない。

この単位の対象外はUI、ViewModel、Worker、JSON serialization、legacy calculator/adapter、既存consumer、公開結果の切替であり、canonical distributionの生成・serialization契約や既存1024 bucketの解釈も変更しない。

## Phase 2-H canonical attack batch consumer（第8前半）

`createCalculationClient()`へopt-inの`calculateAttackCanonicalBatch(entries, options = {})`を追加し、`entries`の順序を維持した`{ combos, canonicalTotalDamage, canonicalTotalDamageSummary }`を返す。各`combo`は`{ id, score, scoreSummary, canonicalDamage, canonicalDamageSummary }`であり、`id`はJSON-safeなstringまたはfinite numberに限定する。batch専用validatorはentries、entry、id、paramsのオブジェクト構造とoptions、own enumerable data property境界だけを検証し、dice・critical・skillなどゲーム入力のleaf validationは既存RangePlannerを唯一の検証元として維持する。重複id、配列でないentries、構造不正なentry・params、構造不正なoptionsは`CalculationBatchInputError`のtyped errorで計算開始前に拒否し、空entriesはcanonical damage 0 identityのtotalとして許可する。

batchはentries配列、各entryのattack params、optionsを開始時に防御snapshotし、呼び出し元の後続変更を計算へ反映しない。total aggregationのlimitと`entries.length <= maxComponents`もattack開始前に既存aggregation option validatorで検証する。entryごとに既存のRangePlanner preflight、`onRangePlan`通知、attack用ResourceGuard plan/lease、score計算、canonical damage計算、finally releaseを正確に1回ずつ順番に実行する。既存`calculateAttackCanonical`と同じtop-level attack plan、DR/D10 provider、`signal`、`requestId`、`rangePolicy`、`onFftLength`、runtime optionsを使い、`onRangePlan`のcallback shapeは変更しない。

全comboが成功した後だけ、canonical damage配列を既存`calculateCanonicalTotalDamage`相当の内部helperへ渡してaggregation plan、total用ResourceGuard lease、aggregation、summaryを正確に1回実行する。batch全体の巨大な追加leaseは取得せず、既定は直列実行でattack leaseをentry間に解放する。開始前、entry間、total前後でabortを確認し、entry失敗・abort・total失敗ではpartial resultを返さず、取得済みleaseを各処理のfinallyで解放する。

この単位の対象外はVue/UI、presentation import、legacy `calculateAttackCombo`・`calculateTotalDamage`、既存canonical単体APIの戻り値、Worker/JSON protocol、公開1024 bucket、batch専用callback、full-tail、入力上限の変更である。batchはcanonical damageの生成とtotal aggregationを原子的に束ねるapplication APIに限定し、presentation接続や公開結果の切替は次段階へ残す。

## Phase 2-H canonical attack presentation consumer（第8後半）

`src/application/AttackCanonicalPresentation.js`の`createAttackCanonicalPresentation(batchResult, rangePlans = [])`は、成功済み`calculateAttackCanonicalBatch`結果をsingle/totalのcanonical presentationへ接続するpure application helperである。返却payloadは`{ combos, canonicalTotalDamage, canonicalTotalDamageSummary, canonicalTotalDamagePresentation }`で、comboごとに`{ id, score, scoreSummary, canonicalDamage, canonicalDamageSummary, canonicalDamagePresentation, canonicalRangePlan }`を持つ。entry順・id・scoreを維持し、canonical envelopeとsummaryは再計算せず既存contractのまま保持する。`presentCanonicalDistribution`だけを利用し、legacy bucket、`getDamageSummary`、display再集約は呼び出さない。

`rangePlans`はbatchの`onRangePlan`呼出順とcombo順の1:1配列であり、combo数との不一致、空batch以外での空配列、構造不正なbatch、必須summaryの欠落はtyped application errorで拒否する。canonical envelopeやsummary内容の詳細検証は既存presenterのtyped validation errorをそのまま利用する。各combo presentationには対応planの`warnings`を渡す。total presentationのwarningsはcombo順・plan warning順でdeterministically flat化し、各warningへ対応comboの`entryId`を追加する。入力warning/idは変更せず、presenterのdeep defensive copyを経由して保持する。score、scoreSummary、range planはplain record・dense/sparse arrayのindexed entries・ArrayBuffer/DataView/TypedArrayだけを許すsafe defensive cloneでsnapshotし、accessor、symbol key、unknown class、cycle、深度/ノード上限超過、reflection failureはtyped application errorで拒否する。配列のindexed entries以外のプロパティはclone対象外とし、canonical envelopeは既存のfreeze/defensive contractを再利用する。返却payloadのroot、combo配列、combo、mutable snapshotはdeep freezeする（TypedArray/DataViewは独立bufferを持つcloneとして扱う）。

この単位ではpayload生成を全combo成功後に行い、途中失敗時にpartial resultを返さない。対象外はVue/templateとAttack script、既存legacy表示・既存canonical APIのreturn shape、Worker/JSON serialization、公開1024 bucket、batch runner、stale/AbortSignal制御、full-tail、入力上限である。次段階でAttack Vue scriptへopt-in接続し、caller側で保持した`onRangePlan`通知から順序付きplan配列を渡してcanonical payloadを一回のstate commitへ接続する。必要な薄いrunnerはその接続時にのみ追加する。

## Phase 2-H canonical Attack state opt-in（第9単位）

第9単位では、既存Attackのscript stateへcanonical batch計算とpresentationを既定OFFのopt-in経路として接続した。`attackData.canonicalOptIn`はfalseで初期化し、falseの間は初期watch、params変更、comboの追加・複製・削除・並べ替えのいずれでも`calculateAttackCanonicalBatch`を呼ばない。canonical total、comboごとのcanonical damage、presentation、range plan、generation、feedbackは専用stateとして保持し、legacyの`score`、`damage`、`resultReady`、`totalDamage`、range feedbackを読み書きしない。

入力watchはidと現在paramsだけからbatch entryを現在のcombo順にsnapshotする。opt-inがtrueになったとき、またはcanonical入力が変わったときは全comboを含むbatchを一回だけ最新runnerへ渡す。`CalculationFeedback.createLatestCalculationRunner()`のrunner-owned AbortSignalとcaller signalの合成、stale request抑止、abort、range reject、error feedback契約を再利用する。`onRangePlan`の通知はentry順に保存し、batch成功後に`createAttackCanonicalPresentation()`を一回だけ実行する。

batch result、presentation payload、対応するrange planは同じgenerationの検証後に一つのcommitで公開する。commit直前にもrequest開始時のordered entries snapshotと現在のID・順序・全canonical計算paramsを明示比較し、不一致なら旧結果を公開しない。途中のcomboだけをcanonical stateへ反映せず、stale result、disable中のlate result、range/resource reject、generic errorではcanonical専用結果だけをclearまたはready=falseにする。legacy resultと表示はそのまま維持する。empty combosは既存canonical aggregationのdamage 0 identityを成功payloadとして扱う。新規comboに不足するcanonical fieldsはapplication helperが遅延初期化し、入力snapshotはparamsのnested aliasを持たない。

今回の対象外はVue template、Chart/Summary/InputForm/ComboFormのtemplate、legacy calculation/state、Worker、JSON、公開1024 bucket、canonical結果の表示切替である。次段階ではcanonical presentationの表示設計と、legacy結果との比較実測を行い、表示・移行条件を決める。

## Phase 2-H legacy/canonical数値比較契約（第10単位）

`src/calculation/LegacyCanonicalComparison.js`は、UIやVue stateに依存しないlegacy/canonical比較coreである。`compareLegacyAndCanonicalDistributions(legacyDistribution, canonicalEnvelope, options?)`は、legacyの`Array`または`Float64Array` 1024要素と、`metadata.modeledDistribution === true`を持つcanonical envelopeを受け取る。legacy側は比較境界で`length`と各indexed own data propertyを安全な`Float64Array`へsnapshotし、sparse array、accessor、revoked Proxy、reflection failureを既存`DistributionResultAdapterError`のtyped codeへ変換してから、既存`fromPublishedBucketDistribution()`へ渡す。canonical側は既知のenvelope/result/metadata schemaをown data propertyとして安全なplain snapshotへ変換してから、既存`toPublishedBucketDistribution()`で新しい1024配列へ投影する。canonical `values`とmetadataのoverflow情報は防御コピーし、入力の配列、canonical `values`、overflowは変更しない。

比較結果は`kind: 'comparable'`または`kind: 'not-comparable'`のdiscriminated resultである。comparable resultは`scope`（`damage`または`total`）、投影後の`legacyMass`、`canonicalMass`、`massDifference = |legacyMass - canonicalMass|`、`maxAbsoluteDifference`、`l1Difference`、`thresholds`、`passed`を持つ。既定の暫定閾値はmass `1e-8`、最大絶対差 `2e-6`、L1差 `2e-4`であり、3条件をすべて包含比較（`<=`）したときだけ`passed: true`とする。閾値はoptionsで指定でき、比較結果へfreeze済みcopyとして残す。

invalid inputは既存`DistributionResultAdapterError`のtyped codeをそのまま送出し、optionsのaccessorやreflection failureは`LegacyCanonicalComparisonError(INVALID_OPTIONS)`へ変換する。legacy adapterへ渡すsupportは`infinite`であり、published index 1023はcanonicalの有限上限ではなくoverflow bucketである。この意味を変えても比較結果は変わらない。canonical resultがvalidでも、upper-bound overflowはactual probabilityではないため`reason: 'upper-bound-overflow'`としてnot-comparableにする。exact overflowは、lower boundがlegacy overflow bucketの1023以上（またはprobability・error boundともに不活性）であれば1023へfoldできるが、1023未満に潜在massがある場合は`reason: 'unsafe-exact-overflow'`としてnot-comparableにする。これにより、projection不能なtailを1023へ一点値として置いて比較することを禁止する。

`scope: 'total'`は、legacyの`getTotalDamage()`が各comboを1024 bucketへ折り畳んでから次のcomboを加える一方、canonicalの`sumCanonicalDamage()`がfull supportを畳み込む差を明示する。canonical total resultまたはcomponent descriptorのexact overflowは`probability > 0 || errorBound > 0`のときだけ関与扱いとし、upper-bound overflowは`probabilityUpperBound > 0 || errorBound > 0`の潜在massがあるときに関与扱いとする。source overflow probabilityまたはupper boundも正のときに関与する。いずれかが関与する場合は、canonicalの1024 projection自体が安全でも`reason: 'total-overflow'`として直接一致を主張しない。不活性overflowだけのcanonical batch totalはlegacy totalと比較できる。canonical batchのscoreは現状どおり`distribution`と`upperTailProbability`を持つ1024 published-bucket shapeであり、今回の比較対象はdamage/total distributionである。batchのreturn shape、legacy calculator、UI表示、Worker/JSON契約は変更しない。

この単位ではexpected valueを比較しない。canonicalの`getExpectedValueSummary()`が返す`exact`・`bounded`・`lower-bound`の意味を保ち、upper/lower boundを一点値に変換しないためである。legacyの小数1桁summaryはraw momentではないため、表示値一致の判定にも使わない。必要なexpected-value移行条件は、raw moment、overflow bound、表示丸めを別契約として後続単位で設計する。

テストは、実際の`planCalculationRanges`、`calculateScore`、`calculateDxDistribution`、`generateMixedDamageDistribution`、防御D10、legacy/canonical damage計算を通した固定値shift・防御、`kazanari > 0`、failure mass、multi-combo totalをfixtureにした。validな1023以上のexact overflowは比較可能、upper-boundと1023未満のexact overflowはnot-comparableとなることも、狭い実計算planで固定している。不活性exactとcomponent descriptorのactive overflow、revoked Proxy・accessorのtyped error、閾値直上の`passed: false`も固定している。性能計測、browser cold/warm計測、UI表示・切替、入力上限、Worker/JSON serializationは次単位の対象外である。

## Phase 2-H Node性能計測基盤（第11単位）

第11単位では、公開経路を切り替えずに第10単位の比較fixtureをNodeで再現する`scripts/benchmark-phase2h.mjs`を追加した。`npm run benchmark:phase2h`は人間向けの行形式、機械可読JSONは`npm run --silent benchmark:phase2h -- --json`（またはscriptの直接実行）で標準出力へ出す。`--iterations N`と`--warmup N`で全ケースの反復数を上書きでき、既定値はwarm 3回、warmup 1回である。結果はファイルへ保存せず、実行時のmetadataへNode version、実行ファイル、OS/architecture、CPU、メモリ、可能な場合のlocal commitを含める。

計測区間は既存の公開関数境界で分ける。各ケースで`RangePlanner/preflight`、既存JSONアセットを使うlegacy `getDamage`、準備済みlegacy combo結果に対する`getTotalDamage`、`calculateCanonicalDamageOnDemand`、`sumCanonicalDamage`、`createAttackCanonicalPresentation`、`compareLegacyAndCanonicalDistributions`/`compareLegacyAndCanonicalTotalDamage`を個別に測定する。legacy totalはcanonical totalと同じreport内の独立stageであり、`getTotalDamage`の呼出しだけを計時する。score生成、asset登録、fixture作成、canonical/legacy summaryの準備は各stageの測定区間から除外する。内部helperへ無理に侵入せず、provider・FFT・defence convolutionを含む既存API呼出しをそのAPIの計算区間として扱う。

fixtureは、小規模通常（`kazanari=0`）、固定値差と防御ダイス、`kazanari=3`、failure mass、3 combo total、現行入力上限近辺のwarning-only `planner-only`ケース、明示hard limitの`planner-rejected`ケースの7ケースである。`planner-only`はplanがacceptedでも意図的にpreflightだけを測るstatus、`planner-rejected`は`accepted=false`のためfixture作成やscore/damage計算へ進まないstatusであり、両者を混同しない。上限近辺ケースはpreflightだけを測定し、重いscore/damageを既定実行しない。各caseの入力、route、execution、executionReason、iterations、warmup、planのaccepted/warnings/rejectionReasons、failure/hit mass診断はJSONへ残す。

時間は`performance.now()`で測る。coldはモジュール、fixture、アセットの準備後に行う最初のtimed invocationであり、process起動とVite/module loadは含めない。warmupはcold後の未計時呼出しで、warmはwarmup後のtimed invocationである。coldは1サンプル、warmはcaseごとの反復サンプルからnearest-rank median/p95、min/maxを返す。各結果をdigestへ通してから次へ進むため、戻り値を捨てるだけの計測にはしない。

このNode値は、module/Vite load、fixture準備、score生成、全caseで共有するasset登録などを除いた計算coreの同一プロセス基準であり、ブラウザ値と混同しない。Node計測にはbrowser engine差、event-loop delay、Worker生成・postMessage・transfer、fetch、JSON serialization、DOM、Chart.js描画、低速端末のmemory/CPU条件が含まれない。また、asset登録を除外するため、初回fetch・JSON parse・cache warmの実運用コストを表さない。したがって本単位の結果だけでJSON削除、Worker採用、UI入力上限拡張、canonical公開切替、dynamic outputの採用判断を行わない。

残作業は、Chrome/Firefox/WebKitの同一fixture実測、低速実機または低速機相当のCPU・メモリ条件、Workerの起動・往復・cancel/error、fetch/JSON serialization、Vue/Chart/Summary描画を含むブラウザ測定である。第13単位では、そのうちChrome channelのCDP CPU throttleによる低速相当条件を再現するrunnerを追加するが、実測結果そのものは親タスクで取得する。これらを同じ入力とcomparison契約で確認し、数値一致、許容応答時間、資源上限、表示意味、fallback経路を合わせてから、canonical/dynamic outputのproduction採用可否を別単位で判断する。

## Phase 2-H ブラウザ実測（第12単位）

第12単位では、Node第11単位と同じ7 fixtureを`experiments/phase2h-browser/browser-benchmark.html`で実ブラウザから測定する。ページは`npm run benchmark:phase2h:browser`で既存Viteを起動した後、`/experiments/phase2h-browser/browser-benchmark.html`を開いて使用する。`?iterations=N&warmup=N`でcaseごとの反復数を上書きできるが、ブラウザページ側で上限を検証し、既定値はNodeより軽いwarm 3回、warmup 1回（combo/planner caseはfixture既定値）とする。重い上限近辺caseはNodeと同じく`planner-only`、明示hard limit caseは`planner-rejected`として計算へ進めない。

アセットはcase実測のwarmup前に、必要な`dx`、`dr`、`d10`を`fetch`、`response.json()`、公開repositoryのregister APIまで含む独立stageでcold/warm測定する。このstageを計算stageへ混ぜず、同じアセットを共有した後にscoreとdamage fixtureを準備する。`performance.getEntriesByType('resource')`からは`data/schema-v2/revision-1/`以下のdata pathだけを抽出し、外部URLや個人情報をreportへ出さない。resource timingがcache hitをネットワーク転送として区別できないブラウザでも、ページ側のfetch call countとdata path件数を別診断として残す。

各full caseは、`RangePlanner`、legacy `getDamage`、準備済みlegacy結果への`getTotalDamage`、canonical `calculateCanonicalDamageOnDemand`、`sumCanonicalDamage`、`createAttackCanonicalPresentation`、legacy/canonical comparisonを個別stageとして測る。各stageのcold/warmにはメインスレッドのinvocation elapsedと、同時にキューへ入れたzero-delay timerの遅延を別々に記録する。timer遅延はイベントループのスケジューリング観測であり、CPU時間そのものではない。`longtask` PerformanceObserverが利用できない場合は`supported: false`かつcount/entriesを`null`にし、0件とは扱わない。数値digest、failure/hit mass、case status、comparisonの`comparable`/`not-comparable`も保持する。

この実験は現行の公開APIと公開repositoryを測るだけで、production UI、Attack state、canonical Worker接続、Worker protocol、JSON、入力上限、既存legacy/canonical APIは変更しない。現在のcanonical Attack stateは`RuntimeDamageRollWorker`へ接続されていないため、ブラウザreportのWorker pathは`not-connected`と明記し、存在しない経路の往復時間を偽装しない。結果は`window.__phase2hBrowserBenchmarkResult`または`window.__phase2hBrowserBenchmarkError`と画面上のJSONへ公開する。

まずChromeの実測結果を同一fixtureの基準とし、Firefox、WebKit、低速実機または低速機相当の条件を追加確認してから、canonical表示、dynamic output、JSON削除、Worker、production接続の採否を別途判断する。Chrome一回の結果だけでproductionの計算経路や入力上限を変更しない。

Firefox/WebKitとChrome 4xの自動実測には`npm run benchmark:phase2h:browser:playwright`を使う。これは`experiments/phase2h-browser/playwright-runner.mjs`が専用Viteを起動し、Playwright管理のFirefox、WebKit、Chrome channelを順次起動して同じページのreportを検証する。Chrome channelではCDPの`Emulation.setCPUThrottlingRate`へrate 4を設定し、rendererのスケジューリングを遅くする。ブラウザの起動・終了、CDP throttleの適用・解除、ページエラー、7ケースのstatus/count、asset setup、numeric digest、Long Task、終了時の一時profile削除をJSONへ記録する。`--iterations`と`--warmup`でページのquery overrideを再現でき、短縮条件は`npm run benchmark:phase2h:browser:playwright:short`で再現できる。通常Chromeは既存の親Chrome実測との重複を避けて既定では省略し、`--include-chrome`指定時だけ追加する。CDPのCPU throttleは実CPU時間、低速端末のCPU・メモリ、電池・熱特性を再現するものではない。したがって、このrunnerの測定値をproductionのWorker接続、JSON削除、入力上限、canonical表示、dynamic outputの採用へ直結させず、実測結果と別途のWorker・低速実機・UI測定を踏まえて判断する。2026-08-16の標準条件（warm 3回、warmup 1回）では、Firefox 153.0のcanonical damage warm中央値最大値は46 ms、WebKit 26.5は22 ms、Chrome channelのCPU 4xは143.3 msだった。legacy damageの同値は2 ms、1 ms、4.4 ms、asset setup warm中央値は22 ms、20 ms、67.5 msで、全engineのreport errorは0件だった。これは同一Windows環境の一回の測定であり、端末差や低速条件を代表しない。

## Phase 2-H 低速相当Chrome runner（第13単位）

第13単位では、第12単位と同じページ・7 fixtureをPlaywright管理のFirefox、WebKit、Chrome channelで測るrunnerを拡張した。Chrome channelのengineだけにCDPの`Emulation.setCPUThrottlingRate`をrate 4で適用し、測定完了後にrate 1へ戻してからCDP session、page、context、一時profileを順にcleanupする。CPU throttleはrendererのスケジューリング倍率をエミュレートするだけで、実CPU時間や低速実機のCPU・メモリ条件ではない。

reportは標準出力だけへJSONで出し、実測結果ファイルやdistを生成しない。metadataにはthrottle方法・rate・解釈、既定で省略した通常Chromeの理由、`resultsPersisted: false`を残す。各engineについてpage error、ページ側のunhandled rejection、7ケースのstatus/count、case id、stage error、asset setup、numeric digest、Long Task、result sink、cleanupを検証する。`--iterations`と`--warmup`の転送を維持し、短縮条件は`npm run benchmark:phase2h:browser:playwright:short`、通常Chromeの比較を加える場合は`--include-chrome`で指定する。重い上限ケースの`planner-only`/`planner-rejected`契約、入力上限、core cap、production UI、canonical Worker接続、既存APIは変更しない。

この単位はcanonical on-demandをメインスレッドのまま許容できるか、またはWorker接続を優先すべきかを検討するための補助データ収集である。2026-08-16の標準条件ではChrome CPU 4xのcanonical warm中央値最大値が143.3 msまで増加したため、低速相当条件ではWorker接続を候補として扱う。ただしCPU throttle結果だけでproduction採用を決めず、低速実機・メモリ条件、Worker起動・往復・cancel/error、Vue/Chart/Summary描画を親タスクまたは後続単位で別途実施する。

## Phase 2-H canonical Attack Worker経路監査・実測ページ（第14単位）

第14単位では、canonical Attack batchが既存のruntime damage Workerをどこまで利用しているかをproduction依存の呼出しグラフと専用ブラウザページで確認する。`src/application/CalculationClient.js`の`defaultDependencies.getDamageRollDistribution`は、module内singletonの`RuntimeDamageRollClient.calculate`である。`calculateAttackCanonicalBatch()`はentryを直列に`calculateCanonicalAttack()`へ渡し、各canonical attackはscore生成後に`calculateCanonicalDamageOnDemand()`へこのproviderを注入する。canonical damage calculatorは`createDamageRollRequest()`でweightsとfailure massをmain threadで作り、providerが既存Workerへ`weights`、`kazanari`、正規化された`fftLength`/`distributionLength`/`rawSupportMax`を送る。Workerは既存`RuntimeDamageRollWorker.js`でDR分布だけを生成し、`id`とtransferable `Float64Array`を返す。

Workerの外側には、scoreのDX計算、attack preflightとResourceGuard、D10 asset fetch、固定値差、D10防御畳み込み、failure massのdamage 0への合成、canonical `DistributionResult` envelope、combo間のcanonical total aggregationが残る。したがって「canonical Attack全体をWorkerで実行する」経路ではなく、「canonical AttackのDR FFT部分だけが既存RuntimeDamageRollClient/Workerを利用する」経路である。`RuntimeDamageRollClient`のcache、pending dedup、caller単位のAbortSignal、Worker error後の再生成は既存契約のまま利用され、新しいWorker message protocolは追加していない。

`src/application/AttackCanonicalRunner.js`はbatch clientの上位で最新requestのAbortSignalとcommit guardを持ち、stale結果をcommitしない。Phase 7のAttack実装単位で`src/views/Attack.vue`はこのrunnerを初期計算、validated input、combo操作へ接続し、production chart、summary、totalはcanonical presentationだけを読む。`canonicalOptIn`、debug panel、legacy初期/combo/total runner、legacy fallbackはproduction接続から削除した。`calculateAttackCanonicalBatch()`自体にはlatest-wins commit policyはなく、cancel/staleの責務はこのrunner側にある。

既存のcore直呼び出しページとは分離して、`experiments/phase2h-browser/canonical-attack-worker-benchmark.html`を追加した。このページは同じ7 fixtureを使い、5件を実際の`calculationClient.calculateAttackCanonicalBatch()`、warning境界を公開`planAttackCombo()`、reject境界をpublic batchのpreflight rejectとして測る。成功batchの測定区間にはproductionのscore、D10、既存Runtime Worker、canonical total aggregationが含まれ、`calculateCanonicalDamageOnDemand()`をページから直接呼び出さない。native Workerと`fetch`は実装を置き換えない薄い診断wrapperであり、Worker生成、postMessage/message、transfer bytes、error/messageerror、terminate、data asset fetch、resource timingをreportへ保存する。cancelは`CalculationClient`の同期`onRangePlan`通知でAbortSignalを発火させ、preflight後かつWorker実行前の境界を測る。staleは既存`AttackCanonicalRunner`の2連続requestで診断する。Workerを意図的に壊すsynthetic errorは行わず、自然発生したerrorだけを記録する。

ページは`npm run benchmark:phase2h:browser:canonical-attack -- --host 127.0.0.1`で起動し、`window.__phase2hCanonicalAttackWorkerBenchmarkResult`または`window.__phase2hCanonicalAttackWorkerBenchmarkError`へ結果を公開する。既存FakeWorkerにcanonical batchからruntime clientへproviderが渡る適合テストを追加した。production `src`、Worker protocol、JSON、入力上限、UI表示切替は変更していない。

In-app Chrome（userAgent: Chromium 151.0.0.0、Windows）の標準条件（`iterations=3`、`warmup=1`）では、7 casesが`measured=5`、`planner-only=1`、`planner-rejected=1`、`error=0`で完了した。canonical Attack batchのwarm invocation median最大は`combo-total-3`の2.4 ms、cold最大は同caseの40.9 msで、小規模caseのcoldは25.3 msだった。production Workerは1 instance、8 postMessage/8 message、transfer 8回・12,992 bytes、error/messageerror 0、terminate 0だった。D10 assetはstatus 200を1回取得し、encodedBodySizeは373,168 bytes、fetch elapsedは3.7 ms、resource timingは1.8 msだった。cancelは`abortSent=true`で`AbortError`となった。第15単位の修正では、以後のcancel probeを速度非依存のpreflight boundaryでの同期abortとして測るようにした。staleは`firstCommit=false`、`secondCommit=true`、`runnerErrors=0`で、いずれもmeasured扱いだった。pageErrorsとunhandledRejectionsは0件だった。

短縮条件（`?iterations=1&warmup=0`）も成功したが、上記は単一ブラウザ・単一実行条件の結果であり、ブラウザ間差や端末差を代表しない。この実測で確認できたWorker接続は既存のDR部分だけであり、score/DX、attack preflight、D10、固定値差、防御畳み込み、failure合成、canonical envelope/total aggregationは引き続きmain threadに残る。したがって、現時点では新しいWorker protocolやscore/DXのWorker移行、canonical UIの表示切替を判断せず、必要なら別単位で検討する。

## Phase 2-H canonical Attack cross-engine実測（第15単位）

第15単位では、親タスクが昇格実行した`npm run --silent benchmark:phase2h:browser:playwright:canonical-attack -- --iterations 3 --warmup 1`の標準出力JSONを反映した。`resultsPersisted=false`で、Firefox、WebKit、Chrome channel CPU 4xを同一条件で順次測定した。Firefox 153.0はcanonical warm invocation median最大3 ms、cold最大52 ms、WebKit 26.5はwarm最大2 ms、cold最大40 ms、Chrome channel 151.0.7922.138（CPU throttle 4x）はwarm最大7.4 ms、cold最大110.4 msだった。

全engineでstatus measured、7 cases（measured 5、planner-only 1、planner-rejected 1、error 0）、case IDs、pageErrors/unhandledRejections 0、D10 status 200、cleanup成功を確認した。Workerは各engineで1 instance、7 postMessage/7 message、transfer 7回・11,368 bytes、worker errors 0・messageErrors 0だった。cancelは`status=measured`、`AbortError`、`abortBoundary=onRangePlan-preflight`、staleは`firstCommit=false`/`secondCommit=true`で、ChromeもCDP throttle resetを含めてcleanup成功した。cancelは速度差に依存せず、CalculationClientの同期`onRangePlan`通知でpreflight後・Worker実行前にabortする測定境界である。

この数値は標準条件の単一ブラウザ実行であり、Chrome CPU throttleは実CPU・低速端末のCPU/メモリを再現しない。実測で確認したWorker接続は既存DR部分だけで、score/DX、preflight、D10、固定値差、防御畳み込み、failure合成、canonical envelope/total aggregationはmain threadに残る。したがって、この実測だけで新しいWorker protocol、score/DXのWorker移行、canonical UI表示切替は決めず、必要な変更は別単位で判断する。

## Phase 2-H canonical Attack opt-in diagnostic UI（第16単位、移行履歴）

第16単位では、`src/views/Attack.vue`に既存canonical runnerを使う独立した`CanonicalAttackPanel`を接続した。`canonicalOptIn`は既定値を`false`とし、トグルを有効化したときだけcanonical計算と結果表示を行う。パネルは`RangePlanNotice`を再利用し、canonical totalとcombo別のexpected value、support、explicitMax、overflowを欠損・非有限値に耐える純粋表示helperで安全に表示する。expected valueは`exact`、`bounded`、`lower-bound`、overflowは`exact`、`upper-bound`を区別し、巨大な`probabilities`配列はDOMへ列挙しない。表示用の契約テストとhelperのunit testも追加した。

この単位では既存のlegacyチャート、サマリー、レイアウト、`resultsReady`、legacy fieldsを変更しない。`canonicalOptIn=true`で全comboとcanonical totalがexactかつ有限の期待値を持ち、安全なprojectionに成功した場合だけderived display dataを既存の`DamageChartPanel`と`SummaryPanel`へ渡し、それ以外は従来のlegacy `attackData`へfallbackする。`ScoreChartPanel`、`InputPanel`、デバッグ用`CanonicalAttackPanel`は変更せず、canonical結果による無条件の本番表示置換、dynamic outputの採用、新しいWorker protocolの追加・変更は対象外とする。

`CanonicalLegacyDisplayAdapter`は、既存`DamageChart`へ接続する前段のpure projection boundaryである。`toPublishedBucketDistribution`と`getUpperTailProbability`を再利用して新しい1024 bucketと上側確率を作り、canonical overflowとpresentationを保持するが、summaryの期待値を丸めない。`upper-bound` overflowと、`lowerBound`が1023未満でpotential massを持つexact overflowは`not-projectable`としてlegacy表示へ自動投入しない。Attack表示helperはこのadapterとcanonical summaryを検証し、安全なexact finiteケースだけをlegacy chart/summary shapeへ複製して渡す。UIのレイアウトや既存コンポーネント自体は変更していない。

## Phase 3 共通DisplayRangePlanner（第1単位）

`src/presentation/DisplayRangePlanner.js`の`planDisplayRange(display, { displayWindow, policy })`は、`presentCanonicalDistribution`の成功display payloadを受け取り、表示windowがcanonical explicit coverageを再利用できるか、support内の不足を拡張計算へ渡すべきか、finite supportの右側だけを既知0として扱えるかを判定するpure helperである。入力の`kind`と`version`はown data propertyとして必須で、`canonical-distribution-display`と`CANONICAL_DISTRIBUTION_DISPLAY_VERSION`だけを受理する。`displayWindow`は非負safe integerの`min`/`max`を要求し、windowの点数は`max - min + 1`を加算前に検証する。`explicitMax`は`explicit.offset`とprobabilities lengthから導かれる値と一致することを検証し、empty explicitでは`null`を維持する。

coverageの判定は`reuse`、`recalculate`、`known-zero`の3種類を`decision`へ返す。explicit coverageの右側がfinite support内に残る場合は、overflowが`exact`でも`upper-bound`でも座標ごとのPMFを供給したことにならないため`recalculate`とする。finite supportの`support.max`より右側だけは`coverage.knownZero`へ分離し、explicit値とその既知0でwindowを満たすreuseでは`reason: 'explicit-coverage-with-known-zero'`、window全体がその外側なら`reason: 'finite-support-outside'`かつ`known-zero`とする。coverage内の不足範囲は`coverage.missingSegments`へ返す。一方、`DistributionResult`には`explicit.offset`未満の値が0であるという下側境界の保証がないため、低側の不足を0へ補完せず、support上限から除外できない限り`recalculate`とする。upper-bound overflowを実確率や一点のChart値へ変換しない点は既存display contractと同じである。

plannerはwindow-sized arrayを確保せず、Float64Array相当の最小`float64Bytes`、`pointCount`、Chart描画の1点1座標を想定した`chartPoints`を`estimates`へ返す。係数配列自体はwindow変更のたびに走査せず、container kind/lengthとexplicit endpointのO(1)検証に留める。係数値とdense性はversioned `presentCanonicalDistribution`が担保する。`pointCount`は配列長、`chartPoints`はrenderer負荷の独立budgetであり、現時点では同じ値を持つためwarningが二重に発生し得るが、policy thresholdは別々に注入できる。返却rootは重複aliasを持たず、coverage、estimates、warningsをそれぞれ一箇所で参照する。入力または算術見積りが不正・safe integer外の場合はtyped validation error、policyのwarning超過はwarning、hard超過は`accepted: false`かつ`status: 'resource-rejected'`で返す。既定policyは資源budgetであり、既存999/1000表示上限の再利用ではない。policy thresholdの外部ResourceGuard予約は後続接続側が担当する。

この単位ではChart.js adapter、coordinate/typed/sparse dataの生成、PMF/upper-tailの実投影、Check/Attack/バックトラックのproducer接続を行わない。`src/components/Check/ChartSetter.js`と`src/components/Attack/ChartSetter.js`は未変更であり、plannerの結果は後続adapterが受け取る見積り・再計算判定としてのみ公開する。

## Phase 3 canonical chart series adapter（第2単位）

`src/presentation/CanonicalChartSeriesAdapter.js`の`createCanonicalChartSeries(display, plan, { mode })`は、`planDisplayRange()`の結果を確率系列へ変換するUI非依存のpure adapterである。acceptedな`reuse`または`known-zero`だけを受理し、ready payloadは`{ version, kind, status, mode, displayWindow, values }`だけを持つ。座標の開始値と点数は`displayWindow.min`/`pointCount`から導けるため、top-levelの`offset`、`pointCount`、source、ownership metadataは保持しない。adapterは入力の`display.explicit.probabilities`からwindow必要部分だけを読み、独立した新規`Float64Array`を1本作るので、入力配列と出力bufferはaliasしない。外側のpayloadはfreezeするが、JavaScriptのtyped array自体はfreezeできないため、callerは`values`をread-onlyとして扱う。

plannerの`decision: 'recalculate'`または`status: 'resource-rejected'`は`kind: 'not-ready'`として返し、値を0や推定値で埋めない。`known-zero`はfinite supportの外側であることをplannerとadapterが検証してから0を生成する。lower sideについては、`DistributionResult`の`explicit.offset`未満が0である保証がないため、低側coverage不足を既知0に変換しない。

`mode: 'pmf'`は`P(X = x)`、`mode: 'upper-tail'`は既存`getUpperTailProbability()`と同じ`P(X >= x)`である。offset 0のupper-tailは既存fixtureと同じくtailを1から順にPMF減算して作る。offset付きwindowは明示値のsuffixから開始し、overflowがwindowの全thresholdより上にあるexact massだけをsuffixへ加える。exact overflowのactiveなlowerBoundがwindowへ重なる場合は、lowerBoundを一点のPMFへ押し込めず`not-projectable`とする。activeなupper-boundはactual massではないためupper-tailへ変換せず、PMFでもwindowに重なる場合は拒否する。finite support外の既知0は、overflowを一点値化せずに0と確定できるため例外として許可する。`errorBound > 0`も潜在massとして重なり判定に含める。

Chart.js 4.5.1をローカル実装で確認した結果、`helpers.dataset.isArray()`はtyped arrayを配列として扱い、`DatasetController.parsePrimitiveData()`は`parsing: true`の数値datasetをCategoryScaleのlabelsと対応付ける。一方、`parsing: false`は内部形式の`{x, y}`または配列座標を要求するため、dense scalar Float64Arrayをそのままcoordinate dataとして扱う契約にはしない。このため`materializeCanonicalChartJsData()`を最終境界として分離し、CategoryScale用の数値labelsと`parsing: true`をそこでだけ生成する。materializerの`dataset.data`はseriesの`values`を同じbufferのread-only viewとして参照し、二重コピーを作らない。これはdisplay入力とのaliasではない。ローカル実装は数値要素を変更せず、配列監視のためのmetadataを扱うだけなので、callerはChart.js利用中に`series.values`を変更しない。canonical series本体にはlabelsやpoint object列を保持しない。

このadapterは確率値を丸めず、既存UIの確率パーセント1桁丸めやsummary丸めも担当しない。現行`DistributionResult`はoverflowのlowerBoundを「そこ以上にある下限」として保持するが、overflow massがexplicit coverage内へどう分配されたかを証明しないため、overlapを拒否するのが現契約の安全境界である。producerが「overflowはexplicitMaxより上」と強化できれば、adapter側の拒否範囲を狭められるが、既存producerを壊す契約変更は後続の親判断へ残す。production ChartSetterと各producerへの接続はこの単位の対象外である。

## Phase 5 canonical Attack Score summary certificate

通常のDXは無限supportを持つため、有限のexplicit distributionだけから作る期待値は`lower-bound`になり、対決成功率も両側のtailが残ると`bounded`になる。`00b5b3f`では、内部の不確かさを一点値へ変換せず、最終的な小数1桁表示だけを安全に回復するScore専用certificateを追加した。`SummaryTable`は`exact`を従来どおり表示し、`bounded`ではlower boundとupper boundが同じ小数1桁へ丸まる場合だけその共通値を表示する。区間が丸め境界をまたぐ場合は`—`を維持する。

期待値certificateの初期対応範囲は`shihai=0`、`yousei=0`、`skill>=0`の無限supportである。raw DX最大値を$Z$、計算済み境界を$M$とすると、非負整数値確率変数のtail-sum formulaから$E[Z]=\sum_{x=0}^{\infty}P(Z>x)$を使う。`maxTailBound(x, dice, critical)`が返す$P(Z>x)$を$x=0,\ldots,M$で補償和し、残りは`maxTailFirstMomentUpperBound()`で上から包む。このhelperは$P(\max_i Z_i>x)\leq nP(Z_1>x)$というunion boundと、1個のDXのtailが10ごとにcritical確率$q=(11-c)/10$倍になる性質を使い、10個の剰余類ごとの幾何級数として無限和を有限計算する。DPのexplicit bucketやoverflow probabilityから一次モーメントを作らないため、分布bucketの個別誤差を期待値誤差と取り違えない。

通常判定ではraw score 1がファンブルとして0へ移る。`dice=n>0`では$P(Z=1)=0.1^n$なので、非負の技能値$s$を含む期待値は$E[Score]=E[Z]-0.1^n+s(1-0.1^n)$である。tail evaluatorの各項は集中管理された`DISTRIBUTION_RESULT_TOLERANCE`で外向きに広げ、$M+1$項分、ファンブル・技能値補正分、幾何級数残差の算術分を別々の数値誤差metadataとして保持する。`shihai>0`、`yousei>0`、負の`skill`を持つ無限supportではこのcertificateを作らず、内部の`lower-bound`を保持して通常UIは`—`を表示する。この非対応は期待値の保証範囲に限り、canonical分布・chart・計算失敗を意味しない。`dice<=shihai`の自動失敗や`critical=11`などfinite supportでgeneric summaryがexactになる場合は従来どおり数値表示する。将来拡張は負の`skill`（clampを含むshifted tail-sum）、`yousei`（exact-youseiのfirst-moment residual）、`shihai`（DPに対応するtail first-moment certificate）の順に検討する。

対決成功率は、action/reactionの明示bucketを$A_0,R_0$、tailを$A_T,R_T$、tail mass区間を$[a_-,a_+],[r_-,r_+]$、tail値の下限を$L_A,L_R$とする。明示bucket同士の$P_{00}=P(A_0>R_0)$は既存の昇順2ポインタ走査で$O(a+r)$に計算し、排他的な4組を分けて$S_{lower}=P_{00}+a_-P(R_0<L_A)$、$S_{upper}=P_{00}+a_+P(R_0)+r_+P(A_0>L_R)+a_+r_+$とする。最終区間だけを`DISTRIBUTION_RESULT_TOLERANCE`で一度外向きに広げる。reaction側はaction区間の補区間`[100-S_{upper},100-S_{lower}]`である。

`errorBound`は従来契約どおり補助的な診断metadataであり、tail probabilityへ加算しない。exact overflowの正の`probability`はactual mass、upper-bound overflowの`probabilityUpperBound`はすでに安全側へ広げた上限として扱う。stored massが0でも`errorBound>0`ならpotential tailなので、独立したRangePlannerのtail boundがある場合だけ`[0,bound]`を採用し、証明がなければ成功率を安全な`0..100`へ戻す。これにより既定の両側`dice=1`、`critical=10`、`skill=0`では内部boundを保持したまま期待値`6.0`、action成功率`45.5%`、reaction成功率`54.5%`を従来形式で表示できる。
