# 実行時計算アルゴリズム

## 目的と範囲

この文書は、ブラウザ内の計算コアが達成値、成功率、ダメージ、バックトラックをどのように計算するかを説明します。結果の意味と確度は[`result-contract.md`](./result-contract.md)、ゲーム内処理は[`dice-rules.md`](./dice-rules.md)、歴史的なJSON fixtureを作る方法は[`reference/precomputation-algorithms.md`](./reference/precomputation-algorithms.md)を参照してください。

production runtimeはJSONを取得せず、入力に必要な範囲をruntime生成します。範囲計画が配列長・FFT長・CPU work・メモリの安全上限を超える場合は、計算を始める前に拒否します。

## 1. 分布の共通表現

非負整数値を取る分布は、インデックスが値、要素が確率となる配列で表します。`DistributionResult`は配列の`offset`、数学的support、明示範囲外のoverflowを併せて返します。1024要素とインデックス1023への集約は、`tooling/reference-data/PublishedBucketCompatibility.js`が担うpublished-bucket互換専用です。

定数$a$を加えるときは、配列の範囲内へ次のように移します。

$$
q_{\min(L-1,\max(0,x+a))} \mathrel{+}= p_x.
$$

ここで$L$はその計算経路の配列長です。負の値は0へ、作業範囲を超える値はoverflow sentinelへ集約します。独立な分布の和はFFTによる線形畳み込み、差は0未満を0へ集約する畳み込みで計算します。逆FFTの微小な負値は数値許容差の範囲で0へ補正します。

分布$p$から上側確率$U_x=P(X\ge x)$を作るには、次の漸化式を使います。

$$
U_0=1,\qquad U_x=U_{x-1}-p_{x-1}.
$$

## 2. 達成値

実装の入口は`src/calculation/ScoreCalculator.js`の`calculateScore`です。

### 2.1 Score resolutionの分岐

`CalculationClient`は、入力を通常のダイスロールとして扱えるかどうかではなく、どの方法でScoreを生成するかを先に解決します。`rolled-score`は通常のDX計算、`fixed-score`は値が決まった点分布、`forced-failure`は達成値0かつ強制失敗の点分布です。plannerとproducerには同じresolutionを渡すため、固定値だけplannerが通常DXの範囲を見積もるような不一致を作りません。

### 2.2 固定値・強制失敗

固定値モードでは、非負化した値`S`の位置に確率1を置きます。値に比例した配列を確保せず、`offset=S`と長さ1の`values`で点分布を表します。固定値判定にはダイス由来の自動失敗・ファンブルがないため、強制失敗確率は0です。《イベイジョン》では`S=max(0, 2D+skill)`です。

強制失敗モードも同じ疎な表現を使いますが、`offset=0`、`values=[1]`、強制失敗確率1となります。したがって、値0の固定Scoreと強制失敗は分布の座標だけでは区別でき、`forcedFailureProbability`を併せて参照します。

### 2.3 DX分布の生成

通常モードでは`CalculationClient`が`calculateDxDistribution({ dice, critical, shihai, yousei })`を注入します。ダイス数0や`dice <= shihai`は自動失敗、インデックス1はファンブルとして扱います。`shihai`と`yousei`を同時に指定する入力は、効果適用順序を定義していないため拒否します。

`shihai=0`では、1個のダイスの累積分布$F_c$を使い、$n$個のダイスの最大値を

$$
P(V_{n,c}\le x)=F_c(x)^n
$$

で直接求めます。`shihai>0`では、最初のロールでクリティカルしたダイス数を状態として保持する動的計画法を使います。全ダイスがクリティカルする自己遷移は配列方向の漸化式で処理し、作業範囲を超える質量はoverflowへ記録します。

`yousei>0`では、元の判定の連続クリティカル数と追加の1D10判定の連続クリティカル数をまとめ、必要な範囲だけを一度畳み込みます。これは「現在の達成値を10単位へ切り上げ、1D10を加える」操作を繰り返す手順と同値で、各回の分布を再取得しません。クリティカル値11では自然クリティカルが起こらず、正のダイス数に対する追加判定は達成値10の点分布になります。

### 2.4 ファンブル、技能値、成功率

DX分布のインデックス0と1を強制失敗確率として先に取り出し、残りの通常結果だけへ技能値を加えます。通常結果が負の技能値で0へ移った確率は、表示上は0へ入りますが、強制失敗ではありません。

固定難易度$t$の成功確率は、通常結果について$P(A\ge t)$です。$t=0$では表示0バケットから強制失敗だけを除きます。対決では強制失敗を分離し、通常アクションが通常リアクションを上回る場合と、通常アクションがリアクション側の強制失敗に勝つ場合を合計します。同値はリアクション側の勝利です。

## 3. 単発ダメージ

実装は`src/calculation/DamageCalculator.js`の`calculateDamageOnDemand`です。アクション達成値$a$ごとの命中重みを

$$
w_a=P(A=a)\left(1-P(R\ge a)\right)
$$

として、命中したときのダメージダイス数を

$$
d(a)=\left\lfloor\frac{a}{10}\right\rfloor+1+b
$$

で決めます。`kazanari`を含むDR分布をruntime providerから受け取り、$w_a$で混合します。命中しなかった確率は、軽減処理の最後にダメージ0へ加えます。

攻撃固定値と防御固定値の差を$v$、防御ダイス軽減を$B$、生のダメージを$Z_0$とすると、最終値は

$$
Z=\max(0,Z_0+v-B).
$$

固定値差を加える順序とダイス軽減の順序を保つため、実装では正の差を先に加え、ダイス軽減を適用し、負の差を最後に適用します。途中で0へ集約すると後続の正の値を失うためです。

## 4. Damageのworking range

Attackでは、Scoreの明示最大値を$S_{\max}$、追加ダメージダイスを$b$として、生成可能な最大Damage dice数と生のsupport上端を

$$
N_{\max}=\left\lfloor\frac{S_{\max}}{10}\right\rfloor+1+b,\qquad R=10N_{\max}
$$

で計画します。固定値差の正部分を$v_+$とすると、Damage作業上端は$W=R+v_+$、`workingLength`は$W+2$です。最後のsentinelはworking range外のoverflowを表します。Damage RollのFFT長、防御D10の畳み込み長、CPU work、メモリは同じplanから見積もります。

1023を超えること自体は拒否理由ではありません。配列長、FFT長、CPU work、メモリがpolicy内に収まるかで判断し、過大な入力はsilent truncationせずresource rejectionにします。productionはcanonical full-tailをそのまま伝播し、published-bucket projectionを使う参照・比較経路だけが1023以上を最後のバケットへ集約します。

## 5. Tailと期待値

Scoreは、明示範囲外の質量を`scoreTailCertificate`、一次モーメントの上限を`scoreTailMomentCertificate`へ記録します。finite supportではtailを0と証明でき、通常DXや条件付きの`yousei`ではtail-sum identityと負の二項tail modelから上界を作ります。Damageはaction・reactionのtail寄与を合成し、明示部分のfirst momentを下限、tail寄与を加えた値を上限とする`bounded`期待値を作ります。証明できない場合は`lower-bound`へ戻し、`overflow.errorBound`を期待値の誤差幅とは解釈しません。

複数コンボのTotal Damageは、各componentの期待値区間をsnapshotして加算します。FFTのmass driftや集約の診断値を意味論上の区間へ加えません。詳細な型とcertificateの関係は[`result-contract.md`](./result-contract.md)を参照してください。

## 6. バックトラック

`src/calculation/BacktrackCalculator.js`の`calculateFinalEncroachmentCanonical`は、通常D10または《屍人》の分布を完全supportで生成します。ロイス数$l$、Eロイス数$e_l$、画面の補正$b$、Dロイス補正$\delta$に対し、1倍・2倍・追加振りのダイス数は

$$
n_1=\max(0,l+e_l+b+\delta),\quad n_2=\max(0,2l+e_l+b+\delta),\quad n_3=\max(0,3l+e_l+b+\delta).
$$

負のダイス数は0個として扱います。現在侵蝕率を$e$、固定減少を$v$、ダイス合計を$S$とすると、最終値は$E=e-v-S$です。各振り方の区分は`dice-rules.md`の境界へ直接分類し、表示時だけ百分率へ丸めます。Backtrackは有限supportを完全に生成するため、静的livingdead assetのcoverage不足をproduction結果へ持ち込みません。

## 7. 非同期実行と資源

`CalculationClient`は、validated snapshot、range preflight、resource lease、Abort確認、計算、presentation生成、lease解放を一つの要求 lifecycleとして管理します。入力が連続して変わった場合は最新要求だけをcommitし、不要なDR Worker jobはsubscriberがなくなった時点で停止します。

Check、Attack、Backtrackはそれぞれのplannerでworking rangeとCPU workを見積もります。`ResourceGuard`はメモリ予約と同時実行数だけを担当し、時間予測はadmission metricにしません。範囲不足で表示できない結果は旧結果へfallbackせず、再計算または明示的なresource rejectionにします。

## 8. 参照fixtureとの比較

`tooling/reference-data/assets/schema-v2/revision-1/`のJSONは、generatorの再生成照合、独立比較、reference tests専用です。`ReferencePrecomputedDataRepository`は注入されたloaderまたは登録済みfixtureを検証・cacheしますが、production sourceからimportされません。旧fixtureとの比較はruntimeの受理範囲や表示上限を定義せず、runtime自身のルールテストと数値契約が正本です。

## 9. 計算量と検証

- 配列のシフト、上側確率、範囲集計は$O(N)$です。
- FFTによる畳み込みは$O(N\log N)$です。
- DXの`shihai=0`は累積分布のべき乗、`shihai>0`は必要なダイス数のDPを使います。
- DRのFFT本体はWorkerで実行し、同一入力の重複要求を共有します。

実装変更時は、ルールなら`dice-rules.md`と独立テスト、結果意味なら`result-contract.md`、参照fixtureなら[`reference/`](./reference/README.md)を同じ変更単位で更新します。production gateは`npm run verify:core`、browser smokeは`npm run verify:browser`、generatorとfixtureは`npm run verify:reference`で検証します。
