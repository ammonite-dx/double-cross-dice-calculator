# R23-C1B: Score tail first moment と Damage 期待値の証明

## 目的と範囲

R23-C0では、productionの`full-tail`経路がDamageの有限な作業範囲をアクション側Scoreから動的に計画し、古い1023バケットへ意味のある確率を切り詰めないようにした。しかしScoreには無限に続く尾部が残るため、Damageの明示配列だけから計算した期待値は、依然として安全な下限にとどまる場合がある。

R23-C1Bでは、この尾部を期待値へ伝播するためのproducer専用証明書を追加した。Scoreの尾部first momentとDamageの期待値区間をmetadataへ記録し、証明できない入力では既存の`lower-bound`または`—`表示へ安全に戻る。表示形式、Total Damageの伝播、genericな`DistributionResult`の`errorBound`、resource policy、published-bucket互換はこの作業単位では変更しない。

## 1. Score tail first moment

### 1.1 明示範囲と尾部

Score producerは、作業上端を`W`として、値`0`から`W`までを明示配列へ入れ、`W`より大きい値をoverflowへ残す。ここで`scoreTailCertificate.massUpperBound`は`P(X > W)`の上側確率であり、配列の丸め誤差や`DistributionResult.overflow.errorBound`そのものではない。

### 1.2 通常DXの上側評価

まず、技能値を加える前の通常DXの達成値を`X`とする。非負整数値について、尾部のfirst momentは次のtail-sum identityで書ける。

$$
E[X\,1_{\{X>W\}}]
=(W+1)P(X>W)+\sum_{t=W+1}^{\infty}P(X>t).
$$

実装では、`p`を`P(X > W)`の安全な上側評価、`R(W)`を最大値DXに対する残りのtail-sumの上側評価とする。このとき、Score tailのfirst momentは次で包める。

$$
E[X\,1_{\{X>W\}}]\le (W+1)p+R(W).
$$

`R(W)`は`maxTailFirstMomentUpperBound(W, dice, critical)`で計算する。値を1個ずつ無限に列挙する代わりに、10を法とする各剰余類で幾何級数をまとめるため、尾部の確率が小さくても有限の計算で上側を得られる。

### 1.3 技能値と《絶対支配》

最終Scoreを`S = max(0, X + skill)`とする。技能値が正なら、尾部上で`X`へ`skill`を足すため、次の保守的な評価を使う。

$$
E[S\,1_{\{X>W\}}]
\le (W+1)p+R(W)+\max(skill,0)p.
$$

技能値が負の場合は`max(0, X + skill) <= X`なので、負の補正をtail boundへ負の寄与として加えない。これにより、負の技能値も証明書を壊さずに扱える。

《絶対支配》がある場合、実際のorder statisticを再解析せず、通常DXの最大値で支配するtail boundを使う。これは厳密値ではなく安全側の上界なので、証明書の`model`は診断情報にすぎず、consumerは`model`の文字列で分岐しない。

### 1.4 有限supportと《妖精の手》

ダイス数0、`dice <= shihai`、`critical = 11`など、support全体を列挙できる場合は尾部質量とfirst momentをともに0とする。この場合、技能値や《絶対支配》の有無にかかわらず、有限supportであることが証明の根拠になる。

《妖精の手》を含む無限supportのScoreは、尾部質量の証明書を引き続き持つが、追加使用回数を含むfirst-momentの証明はこの作業単位では実装しない。そのため、action側の《妖精の手》では`scoreTailMomentCertificate`を持たず、Damageの専用期待値証明も作らない。一方、reaction側の《妖精の手》は、action側の明示最大値との大小関係だけでDamage尾部を包める場合があるため、尾部質量の証明書を利用できる。

### 1.5 Score metadata

first-moment証明書の最低限の形は次のとおりである。

```js
{
  version: 1,
  kind: 'score-tail-moment-certificate',
  model,
  modeledMax,
  massUpperBound,
  firstMomentUpperBound,
  numericalErrorBound,
}
```

producerは必要に応じて境界項、残余項、技能値項もmetadataへ保存する。`numericalErrorBound`は各演算の規模に応じたproducer側の余裕であり、期待値を一点へ丸めるための固定epsilonではない。

## 2. Damage expected-value certificate

### 2.1 何を追加で証明するか

Damageの明示配列から計算したfirst momentを`M_explicit`とする。Damage producerは、Score尾部を実際のDamage座標へ無理に配置せず、尾部が寄与し得る最大値を上側から評価して、`M_explicit`を下限、そこへ尾部寄与と数値余裕を足した値を上限とする。

Damageの尾部証明書は、Scoreの両側に有効な尾部質量証明書があり、`full-tail`の合成結果自体にoverflowがなく、必要なfirst-moment証明が揃う場合だけ生成する。条件を満たさない場合はmetadataを`null`にし、genericな期待値summaryへ戻す。

### 2.2 アクション側Score尾部

アクション側Scoreを`S_A`、その尾部確率上限を`p_A`、尾部first moment上限を`M_A`とする。攻撃側追加Damage dice数を`a`、固定値差を`v = attack.value - defence.value`とすると、任意のアクション側Scoreに対して次の定数を置ける。

$$
C=10(1+a)+\max(0,v).
$$

Damageは、命中条件、防御ダイス、固定値差、《風鳴りの爪》の振り直しを含めても、アクション側Scoreの尾部上で`S_A + C`以下になる。したがって、アクション尾部がDamageへ与える寄与は次で包める。

$$
\Delta_A=M_A+C p_A.
$$

この評価は命中確率を1と置いた保守的な上界である。防御ダイスや負の固定値差はDamageを増やさないため、`C`へ正の寄与を追加しない。

### 2.3 リアクション側Score尾部

リアクション側Scoreの尾部確率上限を`p_R`、尾部が始まる下限を`L_R`、アクション側の明示最大値を`A_max`とする。`p_R = 0`ならリアクション尾部の寄与は0である。また、`A_max <= L_R`なら、リアクション尾部のどの値もアクション側の明示値を下回れないため、命中できず寄与は0になる。

それ以外では、リアクション尾部の寄与を次で包む。

$$
\Delta_R=p_R(A_{\max}+C).
$$

アクション側Score尾部とリアクション側Score尾部の同時発生は、すでに`\Delta_A`がアクション尾部の全結果を包んでいるため、`\Delta_R`へ重ねて加算しない。これがtail同士の二重計上を避ける理由である。リアクション尾部があるのに`A_max`を安全に得られない場合は、証明書を発行せずfail-closedとする。

### 2.4 期待値区間

上記の寄与と、explicit first momentの演算余裕`ε`から、Damage期待値の証明書は次の区間を返す。

$$
\left[
\max(0,M_{\mathrm{explicit}}-\varepsilon),
M_{\mathrm{explicit}}+\Delta_A+\Delta_R+\varepsilon
\right].
$$

下限は明示されたDamageだけから作るため、未知の尾部を負の値として扱わない。上限には尾部の位置不確かさを含め、explicit prefixのfirst moment、tail contribution、数値余裕を別々に計算する。

## 3. 実装と利用側の契約

Scoreの証明書は`src/calculation/ScoreCalculator.js`が生成し、`ScoreEnvelope.metadata.scoreTailMomentCertificate`へ格納する。Damageの証明書は`src/calculation/DamageCalculator.js`が`full-tail`の最終合成後に生成し、`DamageEnvelope.metadata.damageExpectationCertificate`へ格納する。型の説明は`src/calculation/DistributionResultTypes.ts`にある。

`getDamageStatistics`は、検証済みの専用Damage証明書があればそれを`CertifiedValue`へ変換し、なければ従来の`getCertifiedExpectedValue`を使う。genericな`overflow.errorBound`を確率質量や期待値幅へ読み替えないため、古いmetadataや不正な証明書を受け取っても専用値を採用せず、既存経路へ戻る。

専用証明書は、Score尾部が存在する場合だけ意味を持つ。尾部が両側とも0なら、Damage結果を従来どおり`exact`として返すため、不要な`bounded`区間を作らない。Damageの実際の合成配列にoverflowがある場合も、尾部の寄与と位置を分離できないため証明書を発行しない。

## 4. 検証

`tests/scoreTailMomentCertificate.test.js`では、有限support、通常DXのクリティカル値10・8・5、正負の技能値、《絶対支配》、《妖精の手》、`W+1`境界項、独立列挙したtail first momentとの包含、上界の単調性を検証する。

`tests/damageExpectationCertificate.test.js`では、tailなし、アクション尾部のみ、リアクション尾部のみ、tail同士の非二重計上、リアクション尾部が勝てない境界、《風鳴りの爪》、防御ダイス、正負の固定値差、《妖精の手》、不正証明書からのgeneric fallbackを検証する。

fixture全体の数値監査は次で実行する。

```powershell
npm run audit:r23:damage-precision
npm run audit:r23:damage-tail
```

監査レポートはgitignoredな`experiments/r23-damage-summary-precision/output/`へ保存される。`audit:r23:damage-precision`はDamage専用証明書の状態、上下界、尾部寄与、数値余裕を記録し、`audit:r23:damage-tail`はScore側のfirst moment証明書とDamage metadataを含めてtailの出所を追跡する。監査上の中点は診断用であり、表示値や最尤値として扱わない。

## 5. 対象外と次の段階

R23-C1Bでは、action側《妖精の手》のfirst-moment証明、Total Damageへの証明書伝播、表示formatterの変更、genericな期待値APIの変更、published-bucket互換の整理、resource thresholdの変更を行わない。これらは証明の前提と表示契約を別途確認したうえで、後続作業単位として扱う。

証明書がないことは計算失敗を意味しない。ScoreやDamageの分布、成功率、チャートは従来どおり利用でき、期待値だけが安全な下限または非表示になる。証明できる範囲をmetadataで明示し、consumerが不確かな値を一点の期待値として誤表示しないことが、この作業単位の主目的である。
