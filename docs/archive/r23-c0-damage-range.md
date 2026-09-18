# R23-C0 — Production full-tail Damage範囲の動的化

## 目的

この文書は、production Attackで使う`full-tail` Damageの作業範囲を、旧来の`calculationMax = 1022`に依存する計画から、上流のScore範囲と入力値から導く計画へ変更した記録です。1022／1023はpublished-bucket互換経路の境界として残しますが、canonicalな`full-tail` Damageの意味上の上限にはしません。

今回の変更対象はDamage range planning、関連する数値残差の防御処理、回帰テスト、性能・受入確認です。Damage期待値certificate、Youseiのfirst moment、Total Damage期待値、published-bucket cleanup、入力上限の変更はこの単位では扱いません。

## 現行の責務

`src/calculation/planning/DamageRangePlanner.js`は、アクション側Scoreの計画結果、攻撃側Damage dice、攻撃・防御の固定値、防御ダイスからDamageのsupport、FFT長、作業配列長、資源見積りを計画します。`src/calculation/RangePlanner.js`がScore計画とDamage計画を組み合わせ、`ResourcePlanner`相当の既存resource policyが計算開始前に受理・warning・rejectを決めます。計画がrejectされた場合は配列確保、Score計算、Damage Roll Worker起動を開始しません。

`full-tail`はアクション側Scoreの明示範囲から生成される有限なDamage supportを完全に保持します。通常DXのScore source自体は無限supportになり得るため、未モデル化Score tailの不確かさは別のcertificateとして残ります。したがって、ここでいう「完全」はScoreの明示範囲に由来するDamage supportについての完全性であり、無限supportのtailを計算済みと主張するものではありません。

## 範囲の導出

アクションScoreの明示上端を$S_{\max}$、攻撃側の追加Damage diceを$b$とします。Double CrossのDamage dice数は達成値を10で割った商に1を加え、攻撃側の追加diceを加えるため、計画上の最大dice数は次式です。

$$
N_{\max}=\left\lfloor\frac{S_{\max}}{10}\right\rfloor+1+b
$$

1個のDamage diceの最大値は10なので、生のDamage Roll support上端は次式になります。

$$
R=10N_{\max}
$$

攻撃固定値を$u$、防御固定値を$v$、固定値差を$a=u-v$と置きます。Damage Rollの値を防御ダイスで畳み込むための作業座標では、正の固定値差を先に含めます。負の固定値差は、途中で0へ集約された質量から正の値を失わないよう、既存pipelineどおり後段で適用します。よって`full-tail`の作業上端は次式です。

$$
W=R+\max(a,0)
$$

明示値の範囲は$0,1,\ldots,W$、その直後の`W+1`は作業範囲外を表すoverflow sentinelです。このため、配列長は次式になります。

$$
L_{\mathrm{working}}=W+2
$$

Damage Roll FFTは循環畳み込みでsupportを折り返さないよう、`nextPowerOfTwo(R + 1)`を使います。防御ダイス$d$個のsupport上端は$10d$なので、防御畳み込みFFTは`nextPowerOfTwo(L_working + 10d)`です。防御ダイス数は必要なFFT長とメモリを増やしますが、`full-tail`の$W$を旧`calculationMax + 10d`へ切り詰めることはありません。

### 代表例

99D・クリティカル値2、攻撃側追加Damage dice 0、固定値差0、防御ダイス0の場合、Scoreの明示上端は$S_{\max}=2271$です。したがって$N_{\max}=228$、$R=2280$、$W=2280$、$L_{\mathrm{working}}=2282$となります。これは公開1023バケットを超えますが、既定resource policy内なので正常に受理されます。

同じ入力で固定値差が正なら、その差だけ$W$が増えます。固定値差が負なら$W=R$のままで、後段の減算によって結果を0へ集約します。防御ダイスを増やした場合も、明示Damage supportは切り詰めず、防御畳み込みのFFT長だけが増えます。

## published-bucketとの境界

`published-bucket`は既存データや互換比較のための経路です。この経路では旧`calculationMax`、1022までの明示bucket、1023のoverflow bucket、defence後に残るoverflow lower boundという意味論を維持します。今回の変更はこの経路を変更せず、`scorePropagation === 'full-tail'`の分岐だけを動的化しました。

この二つを同じ配列上限として扱うと、productionで1023を超える有限supportを計算できず、計算可能な範囲を意味上の制限と資源上の制限が混在します。現在は`full-tail`では範囲を完全に計画し、実行可能性をresource policyへ委ね、`published-bucket`では互換性のために旧投影を行う、という分離を採用しています。

## 数値残差の扱い

有限supportをScoreからDamageへ渡すとき、浮動小数点の逆FFTや畳み込みによって、確率総和が`1`から`1e-15`程度ずれることがあります。`DamageCalculator`は総和不足を`explicitMassGap`として検査しますが、`TOTAL_TOLERANCE = 1e-8`未満の残差は意味のある未計算tailではなく数値ノイズです。

このため、許容範囲内の残差については、位置を持たないoverflowを新たに作らず、有限supportの結果をそのまま確定します。許容範囲を超える不足、Score tail、意図的に短いsynthetic planによる出力tailは従来どおり保守的なoverflow情報として保持します。数値残差を吸収する処理は許容誤差を緩めるものではなく、既存の総和検証閾値内にある丸めノイズが誤って`overflow.lowerBound = null`を生む不整合を防ぐものです。

## 資源上限とreject

動的化によって作業範囲が大きくなっても、`1023を超えた`ことを理由にrejectしません。`RangePlanner`は`damage-working-length`、`damage-fft-length`、推定メモリ、推定時間、Worker側の絶対安全guardを順に検査し、実行不能な入力だけを明示的にrejectします。既存のwarning 50ms、hard reject 200msなどのthresholdと、直接calculatorの安全上限は変更していません。

これにより、攻撃側の追加Damage diceが150〜200個相当のケースや99D・クリティカル値2のケースは、旧1023境界を超えても計算できます。一方、極端な`yousei`、`shihai`、固定値、Damage diceの組み合わせは、既存policyで`estimated-time`などのrejectになることがあります。これは計算範囲を黙って切り詰めず、ユーザーへ計算不能を明示するための保護です。

## テストと実測

`tests/rangePlanner.test.js`では、固定値差が0・正・負の3方向、防御ダイスあり、1023超えのresource-safe case、99D・クリティカル値2の厳密な範囲、action-only依存、resource rejectを固定しました。published-bucketの既存テストは互換経路であることが分かる名前へ整理し、`calculationMax`境界の意味をfull-tailのテストと混在させていません。

`tests/damageOnDemand.test.js`では、実際の`planCalculationRanges → Score → Damage`経路を通して、有限Scoreから攻撃側の追加Damage dice 150個相当のsupportを生成し、1023由来のDamage output overflowが発生しないこと、supportがfiniteでgeneric expected valueがexactになることを確認しました。さらに、総和が`1 - 1e-9`となる合成結果を使い、許容範囲内の数値残差から位置不明overflowを作らないことを回帰テストにしています。

同一環境で行ったstress matrixの計画値は次のとおりです。`oldWorkingMax`は旧published互換式を同じ入力へ適用した比較値であり、production `full-tail`が実行した旧値ではありません。

| fixture | oldWorkingMax | newWorkingMax | workingLength | FFT | estimated time |
| --- | ---: | ---: | ---: | ---: | ---: |
| ordinary | 1022 | 1060 | 1062 | 2048 | 0.455 ms |
| damage-150 | 1022 | 2530 | 2532 | 4096 | 2.102 ms |
| damage-200 | 1022 | 3030 | 3032 | 4096 | 2.512 ms |
| damage-1000 | 1022 | 11030 | 11032 | 16384 | 36.201 ms |
| positive-5000 | 1022 | 7530 | 7532 | 4096 | 2.102 ms |
| negative-500 | 1522 | 2530 | 2532 | 4096 | 2.102 ms |
| defence-99 | 2012 | 2530 | 2532 | 4096 | 2.513 ms |
| 99d-critical2 | 1022 | 2280 | 2282 | 4096 | 1.889 ms |
| 99d-critical2-kazanari9 | 1022 | 2280 | 2282 | 4096 | 66.715 ms |

この計画値では、99D・クリティカル値2、150〜200 Damage dice、固定値差±5000、防御99Dを含むケースが既定resource policyで受理されました。固定値差20000は範囲自体は`workingMax = 22530`まで正しく導出されますが、推定メモリがpolicyを超えてrejectされます。`yousei=9`と`shihai=19`も同じstress benchmarkでは計画が範囲を隠さず、production policyでは既存の`estimated-time`理由でreject、benchmark policyでは実測対象となりました。thresholdはこの変更で緩和していません。

full-tail benchmarkの実測（Node 22.23.2、Windows x64、iterations 3、warmup 1）では、9 Attackケースがすべて実行エラーなく完了しました。production policyのrejectは`yousei=9`と`shihai=19`を含む既存の資源判定だけで、benchmark policyでは全ケースを測定できました。高負荷側の計画値とwarm実行時間（中央値／p95）は、99D・クリティカル値2で`workingLength=5270`・4.581／8.858 ms、202D・クリティカル値11で`workingLength=4020`・2.398／2.468 ms、300D・クリティカル値11で`workingLength=5000`・2.314／2.410 ms、400D・クリティカル値2で`workingLength=6000`・3.757／4.198 ms、600D・クリティカル値2で`workingLength=8000`・6.714／6.718 msでした。`kazanari=1`の99Dケースは25.938／26.095 ms、`kazanari=9`は70.549／70.894 msで、benchmark側ではいずれも完了しました。これらは旧1023境界で切り詰めず、resource policyが実行可否を決めています。

今回のacceptance deltaは、既存のproduction代表ケースに意図しない新規rejectを追加しないことです。新しい`workingMax`が大きくなるため推定コストは増えますが、semantic capによるrejectはなく、resource rejectのthresholdも変更していません。詳細なブラウザ測定とthreshold再評価は別の性能レビューで扱います。

## 残課題

- R23-C1: Score tailだけがDamage期待値へ与える寄与をtail-only certificateとして評価し、通常ケースの有限区間を狭める。
- R23-C2: 個別DamageのcertificateをTotal Damageへ線形に伝播する。
- R23-C3: Yousei、Shihai、負の技能値でfirst-moment certificateを拡張する。
- published-bucketの`calculationMax`と互換投影は、互換consumerを確認した後の独立cleanup課題として残す。
- resource policyのthresholdを変更する場合は、低速実機、ブラウザWorker往復、UI描画を含む別測定と判断を先に行う。

## 検証コマンド

```powershell
npm test -- --run tests/rangePlanner.test.js tests/damageOnDemand.test.js
npm run lint
npm run lint:markdown
npm run benchmark:full-tail-attack -- --iterations 3 --warmup 1
npm run verify:release
```
