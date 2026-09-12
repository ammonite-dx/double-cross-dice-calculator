# R23-C3A: 《妖精の手》のScore tail first moment

## 目的と範囲

R23-C1Bでは、通常のDXと《絶対支配》について、作業範囲の外側にあるScoreのfirst momentを保守的に上界化した。しかし、action側で《妖精の手》を使う場合は追加のクリティカル回数が負の二項分布になるため、当時はScore tail moment certificateを発行せず、Damageの期待値certificateもfail-closedとしていた。

R23-C3Aでは、`shihai = 0`、`yousei > 0`、`critical <= 10`のexact-youseiモデルに対して、無限配列を確保せずに残差first momentを上から包む。既存のYousei分布生成、plannerのcutoff、resource policy、UI、formatter、Total Damage、`scoreExpectationCertificate`は変更しない。`shihai`と`yousei`の同時利用は従来どおり入力エラーである。

## 1. Yousei Scoreの確率モデル

自然クリティカルの発生確率を$q=(11-c)/10$とする。初回ロールで得られる最大クリティカル回数を$M$、`yousei`を$y$、追加判定で得られるクリティカル回数の合計を$S_y$と書くと、`shihai = 0`のraw Scoreは次の形になる。

$$
X=10(y+T)+R,\qquad T=M+S_y.
$$

$M$は$n$個の独立な幾何分布の最大値であり、$S_y$は「$y$回成功するまでに現れた失敗数」の負の二項分布である。最後の出目$R$は$1,ldots,c-1$の一様分布で、$T$とは独立である。したがって、Score tailの計算では、個々のダイスを列挙する代わりに$T$の整数値だけを扱える。

負の二項分布のPMFは、$s\geq0$に対して

$$
P(S_y=s)=\binom{s+y-1}{s}(1-q)^yq^s
$$

である。実装では階乗を作らず、`logGamma`と隣接項の比を使うため、`yousei`が大きくても有限の数値計算で扱える。

## 2. 境界項と残差項の分離

Score producerが$W$までを明示し、$W$より大きい値をoverflowへ置くとする。証明書で必要なのは、overflowの確率そのものを掛ける境界項と、その境界からさらに離れた残差項を分けることである。

$$
E[X1_{\{X>W\}}]=(W+1)P(X>W)+E[(X-(W+1))_+].
$$

前半の$P(X>W)$は既存の`scoreTailCertificate`、planner、`scoreTailBound()`から得られる上側値の最大値を使う。R23-C3Aが新たに評価するのは後半の$E[(X-(W+1))_+]$だけである。この分離により、tail probabilityの丸め差がfirst momentの上界を下回らせることを防ぐ。

各終端値$r$について

$$
t_r=\left\lfloor\frac{W-r}{10}\right\rfloor-y,\qquad d_r=10(y+t_r+1)+r-(W+1)
$$

と置くと、$0\leq d_r\leq9$であり、$T>t_r$のときの超過量は

$$
X-(W+1)=d_r+10(T-(t_r+1)).
$$

よって、$U_T(t)=E[(T-(t+1))_+]$を上から評価できれば、次が得られる。

$$
E[(X-(W+1))_+]\leq\frac1{c-1}\sum_{r=1}^{c-1}\left(d_rP(T>t_r)+10U_T(t_r)\right).
$$

## 3. $T=M+S_y$の残差上界

$t\geq0$について$S_y=s$で条件分けする。$s\leq t$なら超過は$M$側へ移り、$s>t$なら$S_y$側の超過を分けて評価できるため、次の保守的な不等式を使う。

$$
U_T(t)\leq\sum_{s=0}^{t}P(S_y=s)U_M(t-s)+\overline M P(S_y>t)+U_S(t).
$$

ここで$U_M(a)=E[(M-(a+1))_+]$、$\overline M$は$E[M]$の上界、$U_S(t)=E[(S_y-(t+1))_+]$の上界である。

最大値側は$P(M>m)\leq\min(1,nq^{m+1})$を使う。$nq^{b+1}\leq1$となる最小の$b$を求めれば、

$$
\overline M=b+\frac{nq^{b+1}}{1-q},\qquad U_M(a)\leq\min\left(\overline M,\frac{nq^{a+2}}{1-q}\right)
$$

となる。これは幾何級数の和なので、無限配列を作らずに評価できる。

追加判定側については、平均$\mu_y=yq/(1-q)$と負の二項tailを使い、

$$
U_S(t)\leq\mu_yP(S_{y+1}>t)
$$

とする。`negativeBinomialTailUpperBound()`は、PMFをtail側から再帰的に足し、隣接項の比が1未満になった時点で残りを幾何級数$ p/(1-r)$として加える。従来の表示用tail evaluatorのように「十分小さい項を捨てる」ことはせず、未加算部分も上界へ含める。

$t<0$の場合は$T\geq0$を使い、$U_T(t)\leq\overline M+\mu_y-(t+1)$とする。$t$が負の二項分布のmodeより小さい場合も、同じ全平均上界へ戻る。これらの早期分岐により、極端な入力でPMFの中心まで戻る長いループを避ける。

## 4. Score証明書への接続

`ScoreCalculator.createScoreTailMomentCertificate()`は、有限supportを最優先で処理する。無限supportの場合、`scoreRangePlan.tail.model === 'exact-yousei'`、`shihai === 0`、`yousei > 0`、`critical <= 10`、exact overflowという条件をすべて満たすときだけ`youseiTailFirstMomentUpperBound()`を呼び出す。条件外の入力は従来どおり`null`へ戻る。

証明書の`residualUpperBound`には前節の$E[(X-(W+1))_+]$上界を入れ、`boundaryContributionUpperBound`には$(W+1)p$、`skillContributionUpperBound`には$\max(skill,0)p$を入れる。負の技能値はtail上界を減らす項として扱わないため、正負どちらの技能値でも安全側の不等式が保たれる。

`model`は`dx-yousei-tail`とするが、Damage側consumerはモデル名で分岐せず、`massUpperBound`、`firstMomentUpperBound`、`numericalErrorBound`だけを検証する。Youseiのtail評価に関する余裕として、`tailEvaluationErrorBound`へ$(W+1)$に比例する`DISTRIBUTION_RESULT_TOLERANCE`を記録し、境界・残差・技能値・最終和の算術余裕と合わせて`numericalErrorBound`へ含める。

## 5. 検証

`tests/dxTailModel.test.js`では、`critical=10/8/5`と`yousei=1/2/3`について、1個のダイスなら$M+S_y$が$y+1$個の幾何分布の和になることを利用したtest-local oracleを作り、helperの上界がoracleを包含することを確認する。`Number.MAX_SAFE_INTEGER`個のダイスと`yousei=1000`も、配列をダイス数に比例させず有限値を返すstress caseとして固定する。

`tests/scoreTailMomentCertificate.test.js`では、`dx-yousei-tail`のmetadata、正負の技能値、独立oracleの包含、既存の有限support・通常DX・《絶対支配》の回帰を検証する。`tests/damageExpectationCertificate.test.js`では、action側YouseiでDamage期待値certificateがboundedになることと、reaction側のmoment certificateを取り除いてもtail massだけで証明できることを確認する。

fixture監査では、action側に`yousei=1`を含むケースを追加し、`audit:r23:damage-precision`と`audit:r23:damage-tail`でScore moment certificate、Damage certificate、区間幅、数値余裕を記録する。監査の中点は表示値や最尤値として扱わず、既存formatterの丸め境界が安定しているかだけを確認する。

## 6. 対象外

R23-C3Aでは、`shihai + yousei`、action側のwhole-Score expectation certificate、Total Damageへの新しい証明書伝播、Damage universal constant、resource threshold、planner cutoff、既存Yousei分布生成、published-bucket互換、UI表示を変更しない。証明書が作られない入力でも、Score・Damageの分布とチャートは従来どおり利用でき、期待値だけが既存のlower-boundまたは非表示契約に従う。
