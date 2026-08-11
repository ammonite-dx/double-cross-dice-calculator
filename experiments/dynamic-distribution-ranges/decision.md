# 動的分布範囲plannerの実装前調査と設計判断

## 状態と結論

調査開始時点では、本番の`src`、配信JSON、UI入力上限を変更せず、実行可能な参照plannerとNodeベンチマークだけを`experiments/dynamic-distribution-ranges/`へ追加しました。第1実装単位では参照plannerの契約をRuntimeDamageRollCalculatorとWorkerの可変FFT・出力長optionsへ移植し、第2-BではDamageCalculatorとCalculationClientへDamageRangePlanを接続し、第2-Cでは計画のwarning/rejectをcheck、attack、backtrack UIへ接続しました。第2-DではbacktrackのplanをCalculationClientとBacktrackCalculatorへ接続し、必要時のD10/livingdead完全support生成まで実装しました。第2-Eでは本番コードを変更せずにNodeとChromeの測定基盤を追加し、Worker telemetryと指標の意味を修正後の実測で確認しました。現行1024 published bucketのtotal damage集計は維持し、配信JSON、UI入力上限、full-tail、resource guardと将来のdynamic output契約は引き続き変更していません。

現時点の推奨は次のとおりです。

- 静的Cloudflare Pagesとブラウザ内オンデマンド計算を維持する。
- plannerの既定モードは現行互換の`published-bucket`とし、公開スコアの1023以上をダメージダイス数202へ写像する契約を不用意に変えない。
- 達成値の尾部をダメージ計算まで伝播する`full-tail`は別の明示的な移行段階とし、尾部誤差証明、表示、資源上限、新旧比較を同時に導入する。
- DXのsupportは有限supportではなく、許容打ち切り誤差を満たすcutoffとして決める。`shihai=0`かつ`yousei>0`には、妖精の手の反復順序をそのまま分解した厳密なCDF/tail certificateを使う。
- `tail.model`は、`shihai=0`かつ`yousei=0`を`exact-max`、`shihai=0`かつ`yousei>0`を`exact-yousei`、`shihai>0`かつ`yousei=0`を`conservative-max-bound`とする。`shihai>0`かつ`yousei>0`は現行UI非対応のため、従来の`conservative-union-bound`を診断用に残し、厳密分布とは呼ばない。
- 現行互換モードでは`shihai>0`かつ`yousei>0`をUI仕様どおり`incompatible-input`のrejectとする。reject前にtail planningを実行し、診断用のcutoffとモデル名は返す。
- `dr`はダメージダイス数が決まれば有限supportなので、最大値、固定値差、防御ダイスから必要な作業範囲を導出する。FFT長はsupport長から別に導出する。第2-BではRuntimeDamageRollCalculatorとWorkerへ`fftLength`・`distributionLength`・`rawSupportMax`を渡し、DamageCalculatorへ防御前座標と有限防御supportを接続する。
- 警告と拒否は入力値だけでなく、推定時間、推定メモリ、作業配列長、FFT長、尾部誤差予算のすべてで判定する。

ベンチマークは要求Nodeの`v22.23.2`で実行しました。したがって、以下の時間は設計の根拠となる同一環境の比較値であり、対応ブラウザや低速端末の合格基準ではありません。`.node-version`の`22.23.2`とも一致します。

## 既存判断との関係

既存の[`docs/todo.md`](../../docs/todo.md)は、第6段階で入力、計算、FFT、表示の範囲を同時に設計し、誤差、計算時間、メモリ、描画点数をまとめて扱う方針です。[`experiments/runtime-dr/decision.md`](../runtime-dr/decision.md)は、固定された1024、2048、4096を単純に大きくするのではなく、入力範囲、表示範囲、中間範囲、FFT長を役割ごとに分離する方針を定めています。[`docs/runtime-calculation-algorithms.md`](../../docs/runtime-calculation-algorithms.md)と[`docs/adr/0001-expanded-working-distributions.md`](../../docs/adr/0001-expanded-working-distributions.md)は、現行の公開1024要素、作業2048要素、負の補正前に上限集約しない順序を説明しています。

今回のplannerは、この判断を実装前に検査するための参照実装です。planner自体は計算を実行せず、計算器へ「どの範囲を、どの誤差契約で、どの資源上限内に確保するか」を渡す責務に限定します。

## 現行実装の境界一覧

| 対象 | 現行値 | overflowまたは固定境界の意味 | 主な実装経路 |
| --- | ---: | --- | --- |
| 公開分布 | 1024要素 | index 0–1022は個別値、index 1023は1023以上の集約 | [`src/data/Distribution.js`](../../src/data/Distribution.js) |
| 判定・ダメージ作業分布 | ScoreはplannerのworkingLength、互換経路は2048要素 | 各作業配列の最後を作業範囲外を集約する末尾バケットとする。DRの直接Calculator/WorkerとDamageCalculatorは第2-Bで計画長へ対応し、公開結果は1024要素を維持する | [`src/calculation/ScoreCalculator.js`](../../src/calculation/ScoreCalculator.js)、[`src/calculation/DamageCalculator.js`](../../src/calculation/DamageCalculator.js)、[`src/calculation/RuntimeDamageRollCalculator.js`](../../src/calculation/RuntimeDamageRollCalculator.js) |
| DX入力 | dice 0–99、critical 2–11、shihai 0–19 | `shihai=0`は最大値の累積分布、`shihai>0`はダイス数方向DP。指定workingLengthの最後へ尾部を集約 | [`src/calculation/DxCalculator.js`](../../src/calculation/DxCalculator.js) |
| DX丸め | legacyは小数第6位、planner dynamicは未丸め | 公開JSONとplanなし経路は互換丸め、dynamic内部はtail 1e-8より粗い確率を消さない | [`src/calculation/DxCalculator.js`](../../src/calculation/DxCalculator.js) |
| 実行時DR入力 | damage dice 0–202、kazanari 0–9 | scoreの公開bucket 1023をdamage dice 202として扱うため、現行の最大値は202 | [`src/calculation/RuntimeDamageRollLimits.js`](../../src/calculation/RuntimeDamageRollLimits.js)、[`src/calculation/DamageCalculator.js`](../../src/calculation/DamageCalculator.js) |
| 実行時DR出力 | 既定2048要素、optionsで2以上の可変長 | `spectrumToDistribution`が`distributionLength - 1`以上を末尾へ加算し、長さ1はdamage 0とoverflowを分離できないため拒否 | [`src/calculation/RuntimeDamageRollCalculator.js`](../../src/calculation/RuntimeDamageRollCalculator.js)、[`src/calculation/RuntimeDamageRollLimits.js`](../../src/calculation/RuntimeDamageRollLimits.js) |
| 実行時DR FFT | 既定4096点、optionsで2の冪へ変更 | 必要supportより長いFFT長で周波数側を半分+1点評価し、残りを共役対称に補完 | [`src/calculation/RuntimeDamageRollCalculator.js`](../../src/calculation/RuntimeDamageRollCalculator.js) |
| 通常FFT畳み込み | 入力配列長`N`から`nextPowerOfTwo(2N-1)` | `sumDistribution`は出力長`N`へ戻し、`N-1`へ上限集約 | [`src/data/FFT.js`](../../src/data/FFT.js) |
| d10/livingdeadアセット | 1024要素、dice 0–223 | 1023以上はすでにアセット側で集約。現行UIの最大入力から必要な224本を保持 | [`src/data/PrecomputedDataRepository.js`](../../src/data/PrecomputedDataRepository.js) |
| 転置DRキャッシュ | 3種類のkazanari | 配列を`distribution[damage][dice]`へ転置し、LRUで3種類まで保持 | [`src/data/PrecomputedDataRepository.js`](../../src/data/PrecomputedDataRepository.js) |

`collapseDistribution`と`shiftDistribution`は上限外を捨てず、末尾へ加算します。ただし末尾へ集約された値は元の値を復元できません。したがって、負の固定値や防御ダイスなど後から値を下げる処理がある間は、公開末尾バケットを通常値として扱えません。

現行UIの入力制約は次のとおりです。攻撃側と防御側の通常判定フォーム、および一般判定フォームで同じ制約が繰り返されています。

| 入力 | 現行UI上限 |
| --- | ---: |
| 判定ダイス、攻撃力ダイス、防御ダイス | 0–99 |
| クリティカル値 | 2–11 |
| 技能値、攻撃固定値、防御固定値 | -999–999 |
| 妖精の手等 | 0–9 |
| 支配の領域対象ダイス | 0–19 |
| 振り直し対象ダメージダイス | 0–9 |
| 一般判定の難易度 | 0–999 |
| チャート表示のmin/max | 0–999 |
| 残存ロイス、Eロイス、バックトラック減少ダイス、固定値 | 0–7、0–99、0–99、0–999 |

チャートは1024要素の配列からmin–maxを`slice`して描画します。表示maxは999なので、公開配列の1000–1022と1023のoverflowバケットは画面上の通常チャートへ出ません。`getExpectedValue`は末尾バケットを数値1023として計算するため、overflow確率が大きい場合の期待値は下側へ打ち切られた近似値です。

## supportの導出

### DXは無限尾部として扱う

critical値`c`の1ダイス累積分布を`F_c(x)`とします。`shihai=0`では、現在の実装どおり最大値の分布なので、ダイス数`n`の尾部は次で厳密に求められます。

$$
P(V_{n,c} > x) = 1 - F_c(x)^n
$$

`shihai > 0`では、実装のorder statisticと自己遷移を含むDPが必要です。plannerの最初の安全側実装では、`shihai=0`の最大値の尾部を上界として使います。これはcutoffを大きめにしますが、有限配列の末尾確率を「supportがそこまでしかない」と誤解するより安全です。実装時には、`shihai`ごとのDPから得られる単調な尾部証明を追加し、同じ誤差で配列を縮められるか検証します。

`shihai=0`かつ`yousei=y>0`では、union boundで各回を独立に上界化せず、反復の確率構造を直接使う。1ダイスのDXを

$$
Z=10L+R,
\qquad
P(L=\ell)=(1-p)p^\ell,
\qquad
p=\frac{11-c}{10},
$$

と分ける。ここで`R`は`1..c-1`の一様分布で、`L`と独立である。`n`ダイスの通常結果を`V=max(Z_1,\ldots,Z_n)`、`M=max(L_1,\ldots,L_n)`とすると、`V=10M+R_0`なので、1回目の切り上げは`ceil10(V)=10(M+1)`になる。

妖精の手を`y`回適用し、各追加ダイスを`Z_i`とすると、丸め後の余りは次の丸めで消えるため、

$$
A_y=\operatorname{ceil}_{10}(V)+
\sum_{i=1}^{y-1}\operatorname{ceil}_{10}(Z_i)+Z_y
    =10\left(y+M+S_y\right)+R,
$$

となる。`S_y=L_1+\cdots+L_y`は負の二項分布、最後の`R`だけが最終値の余りとして残る。このため、`T=M+S_y`の生存確率を求め、`r=1..c-1`について

$$
P(A_y>x)=\frac{1}{c-1}\sum_{r=1}^{c-1}
P\left(T>\left\lfloor\frac{x-r}{10}\right\rfloor-y\right)
$$

を評価できる。`floor((x-r)/10)-y`は高々2種類なので、二分探索中の1回の評価で必要な`T`計算も高々2回である。`P(T>t)`は`S_y=s`で条件付けて、`P(M>t-s)`を`-expm1(n*log1p(-p^(t-s+1)))`で計算する。`S_y`のPMFは

$$
P(S_y=s+1)=P(S_y=s)\,p\frac{s+y}{s+1}
$$

の対数再帰で生成し、`S_y>t`の項も直接加える。これにより、near-oneなCDF同士の差し引きや有限配列のcutoff依存を避けながら、評価量は`O(t)`で済む。`p=0`（`critical=11`）では`L=S_y=M=0`として、`A_y=10y+R`の離散分布へ退化する。`dice=0`は自動失敗なので、`yousei`の指定にかかわらずtailは0である。

`shihai>0`かつ`yousei>0`は、厳密なorder statisticと妖精の手を同時に証明する範囲ではない。現行UIが拒否する組み合わせなので、plannerは従来の`conservative-union-bound`を診断用に使い、`incompatible-input`をrejectとして返す。このモデルを`exact-yousei`へ昇格させないことが重要である。

許容尾部誤差を`epsilonTail`とすると、最小の整数`x`を次の条件で選びます。

$$
x = \min\{k : P(V_{\mathrm{final}} > k) \leq \epsilon_{\mathrm{Tail}}\}
$$

技能値`s`を後から加える場合、表示または後続写像まで値を失わない作業上限は少なくとも`max(x, T-s, 0)`です。ここで`T`はその段階で個別値として保持する最大値です。`full-tail`では`x+s`までのモデル化された出力値をダメージダイス数への写像へ渡し、cutoffより上の確率だけを誤差予算内で別扱いにします。

### DRは有限supportとして扱う

命中したダメージダイス数を`n`とすると、振り直しがあっても1ダイスの最大値は10なので、DRの生supportは次です。

$$
0 \leq R \leq 10n
$$

命中達成値を現行の公開bucketで扱う場合、最大ダメージダイス数は次です。

$$
n_{\mathrm{max}} = \left\lfloor\frac{1023}{10}\right\rfloor + 1 + n_{\mathrm{attack}} = 103+n_{\mathrm{attack}}
$$

現行攻撃力ダイス上限99では`n_max=202`、生supportの上限は2020です。`full-tail`で達成値をcutoffまで伝播する場合は、1023の代わりにモデル化された最大達成値を使います。

攻撃固定値と防御固定値の差を`delta`、防御ダイスの最大軽減を`B_max=10n_defence`、後続の計算で個別に保持する最大値を`T`とします。現在の処理順序を保った作業上限は、表示へ戻り得る値だけを正確に残す場合、次の候補になります。

$$
W =
\begin{cases}
\min(10n_{\mathrm{max}}+\delta, T+B_{\mathrm{max}}) & \delta\geq0,\\
\min(10n_{\mathrm{max}}, T-\delta) & \delta<0.
\end{cases}
$$

FFTで生DRを直接生成する場合は、線形畳み込みの循環を避けるため、少なくとも`nextPowerOfTwo(10n_max+1)`を使います。防御ダイスとの畳み込みを別々の長さで実装できるなら、`nextPowerOfTwo((W+1)+(B_max+1)-1)`を使えます。現行の`subDistribution`のように同じ長さへpadする実装を維持する場合は、`nextPowerOfTwo(2(W+1)-1)`を使います。

複数コンボの合計は、各最終分布のsupportを加算します。合計後に負の補正を行わないなら、表示範囲を超えた質量を最終overflowへ集約できます。後続で値を下げる処理がある場合は、合計前に集約してはいけません。

### バックトラック

バックトラックのダイス数は有限で、現行ルールでは次のとおりです。

$$
n_1=\max(0,l+e_l+b+\delta),\quad
n_2=\max(0,2l+e_l+b+\delta),\quad
n_3=\max(0,3l+e_l+b+\delta)
$$

通常D10のsupportは`0..10n_i`、《屍人》は`n_i=0`なら値0のみ、`n_i>=1`なら`0..(10n_i-9)`です。`workingLength`はsupport最大値+1とします。schema-v2の1024要素アセットが表現できる静的support最大値は1022なので、収まる場合はasset、超える場合は静的assetの末尾bucketを使わずon-demandで完全supportを生成します。DXのような無限尾部誤差や実計算結果のoverflowとは分け、静的assetのcoverage情報として扱います。

## 旧ベンチマーク結果（Phase 2-A–D）

再実行可能なスクリプトは[`benchmark.mjs`](./benchmark.mjs)、全結果は[`results.json`](./results.json)です。測定環境はWindows x64、AMD Ryzen 7 9700X、論理CPU16、約61.6 GiB、Node `v22.23.2`です。`.node-version`の`22.23.2`と一致します。この節の値はPhase 2-Aから2-Dの履歴であり、Phase 2-Eの修正後測定は後述の節に分けて記録します。

### 尾部cutoff

| 入力 | epsilon | cutoff | 尾部上界 |
| --- | ---: | ---: | ---: |
| 99D、critical 2、shihai 0、yousei 0 | 1e-6 | 1741 | 9.73e-7 |
| 99D、critical 2、shihai 0、yousei 0 | 1e-8 | 2181 | 9.44e-9 |
| 99D、critical 8、shihai 0、yousei 0 | 1e-8 | 192 | 9.21e-9 |
| 200D、critical 2、shihai 19、yousei 0 | 1e-8 | 2251 | 9.12e-9 |
| 99D、critical 2、shihai 0、yousei 9（厳密`exact-yousei`） | 1e-8 | 4151 | 9.40e-9 |

旧union boundでは同じ99D・critical 2・yousei 9のcutoffは21991だったが、厳密分解では4151まで縮んだ。いずれも`epsilon=1e-8`で、厳密値は境界で`9.40e-9`、直前はepsilonを超える。現行supportの最大値2047で計算した安全側上界は、99D・critical 2・yousei 0で約`4.12e-8`、厳密`exact-yousei`では約`2.92e-2`（実装結果はベンチ結果JSONを参照）となる。後者は2048要素ではまだ予算を満たさないが、旧union boundの1よりは実際の構造を反映した証明になっている。

ベンチマークではplannerの99D・critical2・yousei9 stress計画そのものを10回測定し、中央値`0.8149 ms`（最小`0.8059 ms`、最大`0.8365 ms`）だった。これは分布生成やFFTを含まないplanner評価時間であり、resource estimateの`0.778317 ms`とは別の値である。

### Node計算時間と理論配列容量

| 処理 | supportまたは入力 | 中央値 |
| --- | --- | ---: |
| 現行DX、shihai 0 | 99D、critical 8、2048要素 | 0.58 ms |
| 現行DX、shihai 19 | 99D、critical 2、2048要素 | 5.09 ms |
| 可変DX参照、shihai 0 | 200D、critical 2、4096要素 | 0.50 ms |
| 可変DX参照、shihai 19 | 200D、critical 2、4096要素 | 45.3 ms、約6.29 MiBのresultByDice |
| 可変DX参照、shihai 19 | 300D、critical 5、4096要素 | 101 ms、約9.40 MiBのresultByDice |
| 現行DR最適化、kazanari 0 | 202D、FFT4096 | 0.82 ms |
| 現行DR最適化、kazanari 9 | 202D、FFT4096 | 39.8 ms |
| 可変DR参照、kazanari 0 | 304D、FFT4096 | 1.07 ms |
| 可変DR参照、kazanari 0 | 400D、FFT4096 | 1.34 ms |
| 可変DR参照、kazanari 0 | 512D、FFT8192 | 3.37 ms |
| 可変DR参照、kazanari 0 | 800D、FFT8192 | 5.10 ms |
| FFT transform | 16384点 | 0.60 ms |
| FFT transform | 32768点 | 1.34 ms |

可変DRの304D以上は`kazanari=0`の多項式参照計算です。`kazanari=9`の拡張値を実測したものではなく、現行の39.8 ms測定とダイス数・FFT長・導関数次数に比例する計算量モデルで見積もる対象です。低速端末でのhard limitを決める前に、Workerを含むブラウザ測定が必要です。

### 何がしきい値を支配するか

- `shihai=0`のDXは、supportを2048から4096へ増やしても99Dの可変参照計算は0.50 msでした。尾部cutoffが主な設計要因です。
- `shihai>0`のDXは、`resultByDice`がダイス数とsupportの積で増え、200D・4096要素で約45.3 ms、300D・4096要素で約101 msでした。入力ダイス数だけでなく、DPの中間配列数とsupport長を警告対象にする必要があります。
- DRの`kazanari=9`は現行最大で約39.8 msです。メインスレッドの60 Hz 1フレーム16.7 msを超えるため、既存判断どおりWorker経路を基本とし、plannerの時間警告は計算本体の測定値にWorker転送とUI更新の余裕を加えます。
- FFT配列そのものは32768点でも複素2配列で512 KiBですが、DXのDP配列、DRの導関数作業配列、同時に生きる防御畳み込み配列を合算したpeakを使う必要があります。

## planner API案

### 入力

本番候補の入口は次の形です。

```js
planCalculationRanges(params, policy)
```

`params`は計算器へ渡す生の入力と表示要求を含みます。

```js
{
  operation: 'score' | 'check' | 'attack' | 'backtrack',
  score: {
    action: { dice, critical, shihai, yousei, skill },
    reaction: { dice, critical, shihai, yousei, skill },
  },
  attack: { dice, value, kazanari },
  defence: { dice, value },
  display: { min, max, mode },
  comboCount,
}
```

`score`単体では`score`自身を使い、`check`と`attack`ではaction/reactionの両側を使います。`check`は2つのscoreに`scoreTail`予算を均等配分し、damage planを作りません。`backtrack`ではロイス数、Eロイス数、減少ダイス、減少固定値、現在侵蝕率、Dロイス種別を使います。入力の整数性、符号、相互排他はplannerの前段で検証し、計算器自身も再検証します。

`policy`は環境依存の設定を明示します。

```js
{
  scorePropagation: 'published-bucket' | 'full-tail',
  calculationMax: 1022,
  errorBudget: {
    total: 1e-8,
    scoreTail: 8e-9,
    numerical: 1e-12,
  },
  limits: {
    warning: { estimatedTimeMs, estimatedMemoryBytes, workingLength, fftLength },
    hard: { estimatedTimeMs, estimatedMemoryBytes, workingLength, fftLength },
  },
  costModel: {
    dxOperationsPerMs,
    fftOperationsPerMs,
    damageOperationsPerMs,
    backtrackOperationsPerMs,
  },
}
```

`published-bucket`を既定にするのは、現在の入力上限を変えず、新しいplanner導入だけで結果の意味を変えないためです。`full-tail`は1023以上の達成値をダメージダイスへ伝播するため、入力・表示・アセット・テストの別変更が必要です。

### 戻り値

戻り値は、計算を始める前にUIまたはWorkerへ渡せる計画とします。

```js
{
  accepted,
  operation,
  propagation: { score, calculationMax },
  display: {
    min,
    max,
    points,
    overflowLowerBound,
  },
  scores: [{
    params,
    tail: {
      model,
      requested,
      cutoff,
      bound,
      reachable,
    },
    workingMax,
    workingLength,
    outputMax,
    fftLength,
  }],
  damage: {
    scoreValueMode,
    scoreValueUpperBound,
    maxDamageDice,
    rawSupportMax,
    workingMax,
    workingLength,
    fftLength,
    defenceFftLength,
    finiteSupport,
  },
  estimates: {
    operations,
    timeMs,
    float64Bytes,
    scoreOperations,
    scoreFftOperations,
    damageOperations,
    damageFftOperations,
  },
  errorBudget,
  overflow,
  warnings,
  rejectionReasons,
}
```

`tail.bound`はDXのモデル化supportの外側にある確率の上界です。`damage.rawSupportMax`は有限DRを生成するための最大値であり、`damage.workingMax`は防御や固定値差を適用しても`calculationMax`以下へ戻り得る値を保持する最大値です。両者を同じ値として扱わないことが重要です。

Scoreの`fftLength`は、ScoreCalculatorが主DXと妖精の手の1D10分布を同じ`workingLength`で畳み込む実装に合わせ、`nextPowerOfTwo(2 * workingLength - 1)`で決めます。`oneDieCutoff`は1D10 tailの診断値として保持しますが、FFT長の推定には使いません。productionのDxCalculatorは値0の明示bucketとoverflow bucketを分けるため直接APIのworkingLengthを2以上65536以下へ制限し、既定plannerのScore hard limit 16384は別のpolicy上限として扱います。

`estimates.timeMs`は、DXやDR本体のoperationをそれぞれ`dxOperationsPerMs`または`damageOperationsPerMs`で割り、FFT operationを`fftOperationsPerMs`で割って合算します。`operations`は本体とFFTを含む総数で、係数が異なるため時間見積もりの代用にはしません。

警告コードは少なくとも次を用意します。

- `score-tail-budget`: 尾部上界が予算を超えた、または尾部証明がない。
- `score-working-length`: DX DPの作業配列長が警告またはhard limitを超えた。
- `working-length`、`fft-length`: 分布または畳み込み長が閾値を超えた。
- `estimated-time`、`estimated-memory`: 校正済みモデルの推定資源が閾値を超えた。
- `display-points`: チャート点数が描画上限を超えた。
- `asset-overflow`: 選択したd10/livingdeadなど静的アセットが要求supportを表せない場合だけ表示する。完全supportをon-demand生成できる計画では表示しない。
- `incompatible-input`: 現行互換モードで`yousei`と`shihai`を同時利用するなど、UI仕様が拒否する組み合わせ。参照plannerではrejectとして返す。

warningは計算を許可しますが、ユーザーへ推定時間、メモリ、尾部誤差、静的asset coverage不足など各warningの意味を示します。実計算結果のoverflowとassetが使えないことを同じwarningとして扱いません。rejectは入力を計算器へ渡さず、理由と、入力を下げるか表示を粗くする代替案を返します。

### overflowの契約

overflowは一種類ではありません。

1. `tailOverflow`はDXの無限尾部をcutoffより上で打ち切った質量です。`bound`以内の近似誤差であり、値cutoff以上の有限値として期待値計算に使いません。
2. `finiteOverflow`はDRやD10の有限supportのうち、表示範囲より上へ集約した質量です。`>= lowerBound`という区間の確率として表示し、個別値lowerBoundの確率とは呼びません。
3. `displayOverflow`は計算supportには残っているがチャート表示maxを超えた質量です。表示点数を減らすためのビンであり、後続の負の補正が終わる前に作ってはいけません。

計算器は最終結果とともにoverflow質量、下限、誤差上界を返すのが望ましいです。既存の`number[]`だけを返す互換層ではこの情報を失うため、まず内部結果型を拡張し、既存UIには互換変換を提供します。

## 各calculatorとの責務境界

| 層 | planner導入後の責務 |
| --- | --- |
| planner | 入力検証、尾部誤差予算、supportとFFT長の決定、時間・メモリ見積もり、warning/reject、overflow契約の生成。配列確保や確率計算はしない |
| DxCalculator | `critical`、`shihai`、`yousei`の規則に従う分布生成、plannerが要求したcutoffに対する尾部証明、DPの確率総和と非負性の検証 |
| ScoreCalculator | 妖精の手、技能値、失敗確率をplanned working rangeへ適用し、full-tailなら公開bucketへ集約する前に達成値をdamage dice weightへ渡す |
| RuntimeDamageRollCalculator | damage dice weightとkazanariから有限DRを生成し、planned FFT長、raw support、数値誤差を検証して返す。第1単位で明示optionsを受け、第2-BでDamageCalculatorがplan由来optionsを渡す |
| DamageCalculator | 命中達成値をdamage diceごとのweightへ集約し、攻撃固定値、防御ダイス、防御固定値をplanned working rangeへ適用してから表示overflowを作る |
| Distribution/FFT | 明示されたrange contractに従うシフト、畳み込み、差、overflow集約。暗黙の1024/2048への縮退はしない |
| Worker/client | planner結果を要求単位で転送し、キャンセル、重複排除、cache、transferable配列、エラーを管理する |
| UI/chart/table | warning/rejectとoverflowの意味を表示し、表示点数とビンを制御する。確率のsupportや誤差を独自に推定しない |

## 旧推奨しきい値案（Phase 2-A–D、未採用）

以下は本番確定値ではなく、Phase 2-E実測前のNode実測と既存ブラウザ測定から作った初期policy案です。RangePlannerの確定policyへは採用せず、後述のPhase 2-E評価基準と追加実測で更新します。

| 指標 | warning案 | hard案 | 根拠 |
| --- | ---: | ---: | --- |
| 1計算の推定時間 | 50 ms | 200 ms | 現行DR `kazanari=9`がNodeで約39.8 ms、既存Chromeで約44.5 ms。メインスレッド16.7 ms枠はすでに超える |
| peak計算メモリ | 32 MiB | 64 MiB | DX DP、DR FFT、防御畳み込み、Worker転送の同時生存に余裕を持たせる。実端末のメモリ測定が必要 |
| dense working length | 8192 | 16384 | 厳密`exact-yousei`では`yousei=9`・critical2の99Dがepsilon1e-8で4151 cutoff（working length 4173）となり、現行hard limit内に収まる |
| FFT length | 16384 | 32768 | FFTは長さに比例して増え、32768点のtransformでもNodeで約1.34 ms。大きい入力はDPやDR本体が支配する |
| チャート点数 | 1000 | 1000 | 現行UIの0–999を維持。広いsupportはbinまたは拡大表示で分ける |
| DX総打ち切り誤差 | 8e-9をscore側へ配分 | total 1e-8 | 現行2048の99D・critical2上界約4.12e-8より厳しい。数値誤差、重み化、表示丸めを別枠で管理する |

時間モデルは端末ごとに校正し、Nodeの固定係数をブラウザの保証値として使いません。planner参照実装の初期係数は、`shihai>0`のDPと`kazanari=9`の現行DRを安全側に見るため、単純なoperation数より保守的な設定にしています。

## 実装を分ける段階

1. `RangePlan`、`OverflowInfo`、`TailCertificate`の内部型を追加し、既定の`published-bucket`では現在の1024/2048結果を変えない。
2. plannerを計算coreへ移植し、入力検証、尾部上界、resource estimate、warning/rejectの単体テストを追加する。
3. `DxCalculator`をplanned supportへ対応させ、`shihai=0`の厳密上界、`shihai>0`の保守上界、cutoff外質量を別フィールドで返す。小数第6位丸めは互換経路だけへ限定する。
4. 完了（第1単位）。`RuntimeDamageRollCalculator`とWorkerをrequested FFT長・出力長へ対応させ、`rawSupportMax=10n`、`fftLength > rawSupportMax`、有限DRの最大値、循環畳み込みなしを検証した。`kazanari=0/3/9`、overflow、既定互換、Workerのtransferable・中断・重複排除・cache・障害復旧をテストした。
5. 完了（第2-B）。`DamageCalculator`で公開スコアを先に1023へ集約する現行経路を維持しながら、planあり経路ではraw support、固定値差、防御ダイス、overflow境界を動的化した。負の固定値、防御ダイス、境界点質量、現行最大入力、all-zero、provider検証をテストした。
6. 完了（第2-D）。backtrackのfinite supportをplanner、CalculationClient、BacktrackCalculatorへ接続し、通常D10と《屍人》の完全supportを必要時にオンデマンド生成する。既存アセットのoverflow warningは静的データの制約として残す。
7. UIで推定時間、メモリ、尾部誤差、overflow下限を表示し、広いsupportは表示binへ集約する。チャート点数と計算supportを分離する。
8. Node、Chrome、Firefox、Safari、低速モバイル相当、Worker転送込みで再測定し、入力上限の拡張可否を決める。JSON削除や外部API化はこの検証後の別作業とする。

## 第1単位で確定したRuntime DR契約

`generateMixedDamageDistribution(weights, kazanari, options?)`の既定値は従来の`fftLength=4096`、`distributionLength=2048`である。`distributionLength`は2以上`fftLength`以下、`fftLength`は2の冪かつ直接APIの安全上限`1 << 20`以下とする。`rawSupportMax`はweightsの最大非ゼロdamage dice数$n$から導く`10n`以上でなければならず、`fftLength > rawSupportMax`を満たさないrequestは循環supportを防ぐためrejectする。kazanariは最大damage `10n`を増やさない。逆FFT後は、明示値にかかわらずweightsから導いた実support`10n`より上の実数係数が絶対値`1e-12`以下であることを検証し、その範囲を超える係数は末尾overflowへ混ぜずrejectする。`1e-12`は既存の逆FFT微小誤差clamp閾値で、現行の全列挙比較で観測されるおよそ`1e-15`級の丸めノイズを吸収しつつ、意味のある確率質量とは分離できる値として固定する。

出力は`distributionLength - 1`以上を末尾overflow bucketへ集約する。damage 0とoverflowを分離できない長さ1は採用しない。逆FFT後は有限値、material negative、weight総和を検証し、FFT由来の微小負値だけを0へ補正する。Clientは正規化した3項目をWorker requestへ渡し、optionsをcache/dedupの識別子に含める一方、`signal`はWorkerへ転送しない。

この契約はRuntimeDamageRollCalculatorとWorkerの第1単位で確定し、第2-BでDamageCalculatorとCalculationClientのplanあり経路へ適用した。第2-Dでは同じruntime optionsと計画の分離をbacktrackへ適用した。UI入力上限、JSON asset、total damage、full-tailの変更は後続へ残す。

## 追加テスト計画

### 単体テスト

- `nextPowerOfTwo`、support長、`delta`の正負、`B_max`からの作業範囲導出。
- `shihai=0`の尾部式とcutoffの単調性、`critical=11`、`dice=0`、10の倍数境界。
- `exact-yousei`の`y=1/2`を有限配列の丸め+畳み込みoracleと比較し、PMF再帰の非有限値、負値、非単調性がないことをdice数百・yousei数十まで確認する。
- `shihai>0`の保守上界が実測DPの尾部以上であること、`shihai>0`と`yousei>0`のunion bound診断、cutoff未達時のreject。
- finite DRの最大値`10n`、kazanariによる最大値不変、FFT長が線形畳み込み長以上であること。
- warning/rejectの境界、メモリ見積もり、display point数、`published-bucket`と`full-tail`の写像差。
- overflow確率の非負性、総和、下限表示、後続の負の補正前に集約しないこと。

### 統合・回帰テスト

- 現行入力全列挙で既存JSONとDX/DRの確率総和、非負性、許容差を比較する。
- 現行の固定値±999、防御99D10、攻撃99D10、kazanari0/9、yousei0/9、shihai0/19を含む攻撃結果を旧経路と比較する。
- score overflowがdamage diceへ伝播しない互換モードと、伝播するfull-tailモードを別の期待値で検証する。
- 複数コンボの合計、後続の減算、表示範囲999、overflow下限、期待値の近似表示を検証する。
- `d10`と`livingdead`のdice 223、および1023境界のasset-overflowを検証する。
- backtrackのplanなし互換、負のダイス数0 clamp、D10/livingdeadの完全support生成、1023境界、減算後のカテゴリ境界、provider配列検証、cancelを検証する。

### 性能・実ブラウザテスト

- `node experiments/dynamic-distribution-ranges/benchmark.mjs --write-results`をNodeバージョンとともに保存する。
- `kazanari=0/3/9`、DX `shihai=0/19`、support 1024/2048/4096/8192/16384をWorker転送込みで測定する。
- Chrome、Firefox、Safari、低速モバイル相当で、中央値、95パーセンタイル、最大時間、Long Task、Worker peak memoryを測定する。
- 完了: 計画がwarningへ入ったときのUI表示、hard rejectの結果クリア、連続入力のrequest token、AbortError除外を共通helperのunit testで検証した。実ブラウザでのキャンセル表示とWorker再生成は引き続き検証する。

## 未解決の設計判断

- `shihai>0`と`yousei>0`を現行UIのrejectのまま、将来サポートする場合に厳密なorder statistic+反復のcertificateをどこまで計算量を増やさず導けるか。
- `epsilonTotal=1e-8`をルール上の表示精度として採用するか。現行JSONの小数第6位丸めとの互換許容差は別契約にする必要がある。
- `full-tail`を採用する場合、cutoffより上の達成値をdamage dice weightへどのように近似し、期待値とoverflow区間をどう表示するか。
- 公開分布のindex1023を「1023以上」と表示するか、チャートに区間ラベルを追加するか。
- d10/livingdeadの動的生成は第2-Dでbacktrackのplanあり経路へ接続した。静的JSONアセットの削除とアセット生成器の拡張は別作業として残す。
- WorkerをDXにも常時使用するか、計画時間がwarning以上の場合だけ使用するか。二重経路の保守コストと低速端末の応答を比較する必要がある。
- 時間モデルを固定係数で持つか、端末の初回micro-benchmarkで校正するか。校正自体の待ち時間と再現性が未確定である。
- plannerを計算coreの同期純関数として公開するか、Worker側で再検証するか。入力改ざんや異なるpolicyを防ぐため、Worker側のhard limit検証は残すべきである。

## Damage dynamic range 第2-Aの確定事項

第2-Aでは、`RangePlanner`と実験plannerのDamage境界を同期し、`workingMax=W`、`workingLength=W+2`、overflow下限`W+1`を採用した。`a<0`では防御最大値`D`を含む`W=min(R,C-a+D)`を使う。異長の`subDistribution`は第1分布の長さへ`max(0,X-Y)`を返し、線形畳み込み必要長以上の最小2冪FFT長を厳密に要求する。

第2-Aの実装、テスト、文書更新は完了した。第2-Bでは、`calculateDamageOnDemand`のruntime optionsとdamage planを別引数に分け、`CalculationClient`のpreflight `plan.damage`を渡すようにした。raw overflow bucketは一点質量としてシフトせず、必要raw最大がsupport端点の場合だけ端点を明示値として扱う。防御分布は`D+1`要素へ縮約し、`defenceFftLength`を渡してからfailure massを0へ合算し、公開1024要素へcollapseする。provider返却分布と防御分布の長さ、有限性、非負性、総和も検証する。第2-Cでは`CalculationFeedback`と`RangePlanNotice`を追加し、計画のwarning/reject、推定資源、overflow下限をcheck、attack、backtrack UIへ表示する。第2-Dではbacktrackのplan伝播とD10/livingdead完全support生成を追加した。現行1024 published bucketのtotal damage集計は正しいまま維持し、未接続なのはresource guardと将来のdynamic output契約、JSON経路、入力上限である。

## Dynamic distribution range 第2-Cの確定事項

`CalculationClient`の`onRangePlan` callbackをUI層で受け取り、plannerを再実装せずに`RangePlan`を表示用へ整形する。warningは計算を継続し、理由、推定計算時間、推定メモリ、`overflowInfo`の該当する下限を表示する。hard rejectは`CalculationRangeError`のplanとrejectionReasonsを同じnoticeへ渡し、結果を表示可能状態から外して古い結果を新しい入力へ見せない。

check、backtrackは画面単位、attackはコンボ単位でfeedbackを保持する。各更新はrequest revisionを発行し、最新revisionだけがplan、result、errorをcommitする。前のrequestは`AbortController`で中断を依頼し、`AbortError`とアンマウント後の結果はユーザー向けnoticeへ変換しない。UI入力の上限、JSON asset、full-tail、total damageの公開1024 bucket契約は変更しない。backtrackの内部supportだけは第2-Dのplanあり経路で拡張し、公開戻り値のカテゴリ形状は維持する。

## Dynamic distribution range 第2-Dの確定事項

backtrack planは、負のダイス数を0へclampした1倍・2倍・3倍のダイス数から`maxDice`を求め、通常D10を`10*maxDice`、《屍人》を`maxDice===0 ? 0 : 10*maxDice-9`として計画する。`workingLength = rawSupportMax + 1`、`fftLength = 0`であり、backtrack自身はFFTを使わない。`calculationMax`はアセット境界の判定に使わず、schema-v2の1024要素アセットの静的support限界`assetSupportMax=1022`と区別する。n=103は通常D10が1030/1031でon-demand、《屍人》が1021/1022でassetとなる。

planなしは従来のprovider呼出しと1024要素結果を厳密に維持する。planありでは`distributionMode=asset`のときだけrepositoryのsize指定取得を使い、`on-demand`では通常D10を純粋な前向きDP、《屍人》を`sum(d10)-max(d10)+1`の最大値状態DPで生成する。ダイス数0は値0の点分布、最終的な境界処理では0未満を0へclampする。on-demandが完全supportを生成できる場合、静的asset coverage warningは表示しない。

完全support生成後にだけencroachment、固定値、thresholdによる区分を適用するため、後続の減算で表示範囲へ戻る可能性がある安全でないoverflow bucketを一点質量として扱わない。生成分布とprovider分布は長さ、有限性、非負性、総和を検証する。`runtime options`とplanは別引数とし、cancel、cache、dedup、stale requestの既存契約を維持する。

動的生成で計算可能な場合、`assetOverflow`は静的asset coverageの計画メタデータとして残すが、on-demand計画にはstatic asset warningを出さず、`overflowInfo`も実計算結果のoverflowとは扱わない。純粋generatorにはplannerを迂回した配列確保とO(n²)暴走を防ぐ絶対上限として、長さ`1<<16`、生成dice`1<<12`、概算処理量`100_000_000` operationsを設ける。これはplannerの通常warning/rejectとは別の防御である。公開1024要素、JSON削除、full-tail、total damageのdynamic outputは本単位の対象外とする。

## Dynamic distribution range Phase 2-Eの確定事項

Phase 2-Eは、現行入力と拡張候補をNodeと実ブラウザで比較する調査用ベンチマーク基盤として完了した。測定基盤は本番コードとUIのimport graphから分離し、通常buildの`dist/`と専用buildの`dist-dynamic-distribution-ranges/`を分けた。専用build出力は`.gitignore`対象であり、Phase 2-EのNode結果は標準出力、ブラウザ結果はページ内JSONを正とし、新しいJSON結果ファイルはGit追跡しない。既存の[`results.json`](./results.json)はPhase 2-Aから2-Dの追跡済み履歴として残す。

再現コマンドは[`README.md`](./README.md)に固定した。Nodeは`node experiments/dynamic-distribution-ranges/benchmark-phase2e.mjs`、ブラウザは専用Vite設定で`node node_modules/vite/bin/vite.js --config experiments/dynamic-distribution-ranges/vite.config.mjs --host 127.0.0.1 --port 3000`を起動して`browser-benchmark.html`を開き、専用buildは`node node_modules/vite/bin/vite.js build --config experiments/dynamic-distribution-ranges/vite.config.mjs`で実行する。いずれもNode `22.23.2`を選択して実行する。

### 最終実測環境と集計

最終実測は2026-08-11に、Windows 10相当のChrome `151.0.0.0`、論理CPU16、ブラウザ報告メモリ32 GiB、viewport 1280×720、devicePixelRatio 1.5で行った。ブラウザは`crossOriginIsolated=false`、Long Task APIは利用可能だった。Node側は同じWindows x64環境のNode `v22.23.2`、AMD Ryzen 7 9700X、論理CPU16、Node報告総メモリ約61.6 GiBで、`.node-version`と一致する。

| 測定 | total | measured | skipped | errors | 補足 |
| --- | ---: | ---: | ---: | ---: | --- |
| Node | 18 | 13 | 5 | 0 | planner-onlyのケースを実計算せずに分類 |
| Chrome | 18 | 12 | 6 | 0 | `browser: true`だけを実測し、Node-onlyをskip |

Nodeはwarmup 2回、warm 7回で、以下は修正後の最新実行における代表的なwarm median/p95（ms）である。p95は7サンプルのnearest-rank値なので、端末差を保証する統計的上限ではない。

| ケース | median | p95 |
| --- | ---: | ---: |
| `dx-current-light` | 0.3499 | 0.3866 |
| `dx-current-heavy` | 5.7087 | 8.4842 |
| `score-current-yousei` | 11.7412 | 12.3854 |
| `dr-current-kazanari-0` | 0.5226 | 0.8367 |
| `dr-current-kazanari-9` | 20.6498 | 22.2100 |
| `attack-current-warning` | 21.2829 | 22.4239 |
| `attack-combo-3` | 12.2751 | 12.4161 |
| `backtrack-current-livingdead` | 41.1111 | 45.4428 |
| `backtrack-current-nightmare` | 4.3349 | 8.2838 |

Chromeのブラウザ結果はページエラー0、Long Task 0、数値異常0だった。Resource Timingの異常は0で、Worker resourceのdurationを取得できない診断項目が4件あったが、これはWorker計測の利用制限として`timingUnavailable`に分類し、ベンチマークエラーにはしていない。

| Workerケース | createdCount | cold（生成・初回要求を含む） | warm round-trip median | warm timer-delay median |
| --- | ---: | ---: | ---: | ---: |
| `dr-current-kazanari-0` | 1 | 14.8 ms | 0.8 ms | 0 ms |
| `dr-current-kazanari-9` | 1 | 45.5 ms | 30.6 ms | 0.1 ms |
| `attack-current-warning` | 1 | 49.6 ms | 25.4 ms | 0.3 ms |
| `attack-combo-3` | 1 | 41.6 ms | 14 ms | 0.2 ms |

`createdCount=1`はWorkerを実際に生成してcold測定へ入れたことを示す。Workerのcold値はWorker生成と初回要求を含み、warm round-tripは`postMessage`転送とWorker応答を含む。DRとattackはmain-thread pathとWorker pathを同じケースで比較し、Worker pathではUI側の計算処理をメインスレッドから外せることを確認した。

### 指標の解釈

`mainThreadTimerDelayApproxMilliseconds`はCPU時間でも、メインスレッドが連続してブロックした時間でもない。計測中に登録したzero-delay timerが発火するまでの遅延を、処理時間とイベントループの待ち時間を含む近似値として記録する。短時間ケースで約4–5 msの下限が現れるのはブラウザのtimer clampingやスケジューリングによるものであり、その値をCPU負荷として解釈しない。UI阻害の評価では、この指標をLong Task件数と併読する。

### 入力上限の暫定判断

現行入力上限はこの作業単位では変更しない。現行最大級の入力はデスクトップChromeで実用的な時間範囲に収まり、DRとattackはWorker経路によってUI阻害を抑えられるため、今回の結果だけで上限を撤廃する理由はない。

入力上限を撤廃せず、拡張候補はplannerのwarningまたはhard reject、動的表示と公開出力契約、resource guardを一体で段階的に導入する。制御単位は単一入力の固定上限だけにせず、複合入力から推定した計算時間とメモリ量、working length、FFT長、尾部誤差を合わせて決める。現在の`RangePlanner`のpolicyを今回の評価値だけで即時変更しない。

### 暫定受入基準

以下は通常許容または拒否候補を振り分けるための追加実測用の評価基準であり、現行`RangePlanner`の確定policyではない。

| 指標 | 暫定基準 | 判定の扱い |
| --- | --- | --- |
| デスクトップのwarm p95 | 100 ms未満 | 通常許容の目安 |
| メインスレッドtimer-delay近似 | 50 ms未満 | 通常許容の目安。CPU時間とは解釈しない |
| 低速端末相当の1計算 | 1秒超 | 拒否候補 |
| 推定計算メモリ | 64 MiB超 | 拒否候補 |
| `workingLength` | 16384超 | 拒否候補 |
| FFT length | 32768超 | 拒否候補 |
| planner判定 | hard reject | 拒否候補 |

### Phase 2-E時点の未完とPhase 2-Fへの引継ぎ

Phase 2-E時点ではFirefox、WebKit、低速モバイル相当、入力拡張候補のcore cap内実測が未完だった。Phase 2-FでFirefox、WebKit、Chrome 4xの同一12ケースを測定したが、dynamic output、resource guard、JSON経路、入力拡張候補のブラウザ実行は引き続き対象外であるため、今回の結果だけで具体的なUI入力上限を拡張しない。

## Dynamic distribution range Phase 2-Fの確定事項

2026-08-11にPlaywright `1.62.1`を`npm install --save-dev playwright`で追加し、`package.json`と`package-lock.json`を更新した。指定Nodeは`C:\Users\SoraHirokane\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe`の`v22.23.2`で、runnerは要求versionと一致しない場合に失敗する。

`npx playwright install firefox webkit`でFirefox `153.0`（Playwright revision `v1538`）とWebKit `26.5`（revision `v2336`）を取得した。ダウンロード表示はFirefox 119.9 MiB、WebKit 59.6 MiB、FFmpeg 1.3 MiB、Winldd 0.1 MiBで、取得後のdirectory容量はFirefox 352,898,025 bytes、WebKit 177,304,497 bytes、Firefox/WebKit合計530,202,522 bytes（505.6 MiB）、補助toolを含めて533,978,424 bytes（509.2 MiB）だった。Playwright cacheには別途`chromium-1181`が存在するが、今回のinstallコマンドはChromiumを指定しておらず、Chromiumの取得ログもない。[Playwright browsers documentation](https://playwright.dev/docs/browsers)

[`playwright-runner.mjs`](./playwright-runner.mjs)は専用Viteをfree portで起動し、`browser: true`の12ケースだけをFirefox、WebKit、Chrome channelの順に順次測定する。FirefoxとWebKitではCPU throttlingを適用せず、ChromeだけでPlaywrightのCDP sessionから`Emulation.setCPUThrottlingRate`の4xを適用する。runnerは`--no-sandbox`を使用せず、Vite child process、browser context、page、CDP session、一時profile、CPU throttlingを`finally`でcleanupし、JSONを保存せず標準出力へ出す。全engineが12ケースを完走しなければ非0終了し、engine単位の起動、ページ、ケース、page error、数値検証の失敗を明示する。

このデスクトップの通常Codex sandboxではFirefox/WebKitのbrowser child process起動が`spawn EPERM`になったため、最終実測はローカルbrowser child processの起動を許可した実行コンテキストで行った。Playwrightのlaunch optionsとrunnerには`--no-sandbox`を指定していない。通常sandboxで同じ制限がある環境では、runnerはengine errorをJSONへ記録して非0終了する。

PowerShellでの再現コマンドは次のとおりです。

```powershell
$nodeDir = 'C:\Users\SoraHirokane\AppData\Roaming\fnm\node-versions\v22.23.2\installation'
$env:Path = "$nodeDir;$env:Path"
& "$nodeDir\node.exe" experiments/dynamic-distribution-ranges/playwright-runner.mjs
```

同じrunnerは`npm run benchmark:dynamic-distribution-ranges:browser`でも起動できる。runnerのJSONはPlaywright version、engine/browser version、12件のcase count、main warm median/p95、Worker cold/warm、timer-delay、Long Task、page error、数値検証、Resource Timing診断、cleanup結果を含む。p95は7回のwarm sampleから求め、代表値は12ケースの各pathにおける最大値として集計した。

### Phase 2-Fの実測結果

実測環境はWindows x64、論理CPU16、viewport 1280×720、devicePixelRatio 1、Chromeの`deviceMemory=32`、`crossOriginIsolated=false`だった。各engineはtotal 18ケースのうち`browser: true`の12ケースを測定し、planner-onlyまたはNode-onlyの6ケースをskipした。

| engine | CPU条件 | measured / skipped / errors | main warm median最大 / p95最大 | Worker cold最大 / warm p95最大 | timer-delay warm p95最大 | Long Task | page error / 数値異常 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Firefox `153.0` | throttlingなし | 12 / 6 / 0 | 34 / 40 ms | 56 / 36 ms | 40 ms | APIなし | 0 / 0 |
| WebKit `26.5` | throttlingなし | 12 / 6 / 0 | 15 / 24 ms | 38 / 19 ms | 24 ms | APIなし | 0 / 0 |
| Chrome `151.0.7922.108` | CDP 4x | 12 / 6 / 0 | 129.5 / 132.8 ms | 74.8 / 31.5 ms | 134.2 ms | 50（最大154 ms） | 0 / 0 |

FirefoxとWebKitではLong Task APIが利用できず、Long Task 0は観測なしではなくAPIなしとして扱った。ChromeではLong Task APIが利用可能で50件（最大154 ms）を観測し、Resource TimingのWorker duration unavailableは4件、timing anomalyは0件だった。全engineでcase error、page error、数値検証エラーは0件だった。

CPU 4x時のChromeはmain warm p95最大132.8 ms、Worker warm round-trip p95最大31.5 ms、Worker cold最大74.8 msだった。この4xはrendererのCPUスケジューリングだけを変える条件であり、実機モバイルのメモリ、GPU、OS scheduler、ネットワーク、Firefox/WebKitの実装差を再現しない。`mainThreadTimerDelayApproxMilliseconds`もCPU時間ではなくzero-delay timerの発火遅延近似であり、Chrome 4xの最大値134.2 msを連続ブロック時間と解釈しない。

### Phase 2-Fの受入判定と残る限界

| 受入項目 | 結果 |
| --- | --- |
| PlaywrightをdevDependencyへ追加しlockfileを更新 | 適合、`1.62.1` |
| Firefox/WebKitのみをPlaywright installで取得 | 適合、Firefox `153.0`、WebKit `26.5` |
| Firefox、WebKit、Chrome channel 4xを同じ12ケースで順次測定 | 適合、各12/12成功 |
| `--no-sandbox`を使わない | 適合、runnerと起動optionsに指定なし |
| page error、case error、数値異常 | 各engine 0 |
| Long TaskとResource Timingを診断 | 適合、APIなしとWorker timing unavailableを明示 |
| Vite、engine、page、context、profile、CDP throttlingのcleanup | 適合、3engineでerrorなし |
| 本番core cap、src、UI入力上限、配信JSONを変更しない | 適合 |

`dx-two-x-planner-only`、`dx-large-planner-only`、`dx-hard-reject-planner-only`、`dr-over-core-cap`、`attack-two-x-planner-only`はcore capを変更せずplanner-onlyのままとした。`backtrack-large-normal-node-only`はNode-onlyでブラウザ測定対象外のケースであり、core cap理由のplanner-onlyとは区別した。dynamic output、resource guard、JSON経路、低速実機、入力拡張候補のブラウザ実測は残課題であり、現行入力上限と本番コードは変更しない。

## Dynamic distribution range Phase 2-Gの確定事項

Phase 2-Gでは、本番`src/application/ResourceGuard.js`に計算単位の共有resource guardを追加し、`CalculationClient`のdependency factoryで単一instanceを共有する。`check`、`attack`、`backtrack`は既存RangePlannerのhard reject後、アセット読込または計算開始前に予約し、成功、cancel、stale、repository error、Worker error、同期例外を共通`finally`で解放する。RangePlannerのpreflight rejectは予約しない。

初期policyはcapacity 64 MiB、同時実行4件、待機32件である。admissionは`plan.estimates.float64Bytes`だけを基礎にし、予約量を`ceil(float64Bytes * 1.5)`とする。`operations`と`timeMs`はlease metadataとdiagnosticsに保持できるが閾値には使わない。単体予約がcapacityを超える要求とqueue満杯はtyped errorで即時rejectし、待機中abortはFIFO queueから除去してAbortError相当とする。実行中abortはcallerの計算がsettleするまで予約を保持し、`lease.release()`はidempotentである。

attack total damageはRangePlannerのplanを持たない別計算であるため、現行公開1024 bucketと内部2048 FFT形状から保守的なscalar推定を作り、同じguardへrequest単位で明示reserveする。`RuntimeDamageRollClient`には二重予約を追加しない。guardは計算結果やTypedArrayを保持しない。公開戻り値、現行1024 published bucket、入力上限、RangePlanner hard policy、core absolute safety limit、JSON経路、dynamic outputは変更しない。

Phase 2-Gの対象外は、明示的なowner replace policy、入力上限の拡張、JSON asset経路の削除または置換、dynamic output契約の変更、Worker内部への別guard導入である。UIは既存`CalculationFeedback`と`RangePlanNotice`でresource rejectを通常エラーに埋没させず表示する最小接続に留める。

## Dynamic distribution range Phase 2-H 第1単位

Phase 2-H第1単位は、現行公開結果を切り替えずに内部canonical resultの表現を固定する単位である。`DistributionResult`は明示一点確率を`Float64Array`で保持し、overflowを末尾要素へ混在させない。`offset`と可変長valuesからexplicit maxを導出し、supportはfiniteまたはinfinite、overflowはactual massを持つexactとactual probabilityではないupper-boundを別unionとして扱う。

mass検証は、nullまたはexactでは明示massとexact probabilityの合計を1に近づけ、upper-boundでは明示massの超過と未明示massの上限を検証する。`errorBound`は補助的な数値誤差metadataであり、`probability`や`probabilityUpperBound`、mass summaryへ自動加算しない。upper-boundを安全にする誤差はproducerが`probabilityUpperBound`へ織り込む。許容値は新module内の`DISTRIBUTION_RESULT_TOLERANCE`へ集約する。finite supportはexplicit max以上とし、potential massを持つoverflowではlower boundをsupport max以下に置く。exactの`probability=0`かつ`errorBound=0`、またはupper-boundの`probabilityUpperBound=0`かつ`errorBound=0`はinert overflowとして扱い、finite supportのmaxがlower bound未満でも許可する。全てのindex、support max、offset plus lengthはsafe integerとして検証する。

legacy adapterの入力側は1024要素を要求し、0から1022を明示値、1023をexact overflowへ移す。supportはlegacy配列から推測せず、`options.support`を必須にする。出力側はlower boundが1023以上のexact overflowと1023以上のexplicit valuesだけを末尾bucketへfoldし、upper-bound overflowを確率配列へ変換しない。exact overflowにpotential massがありlower boundがlegacy overflow index未満なら、明示範囲が完全でもmassが1023以上だけにある証明がないため`unsafe-projection`として拒否し、inert overflowだけを許可する。

この単位のmoduleはproduction import graphから独立しており、既存のcalculator、`CalculationClient`、UI、JSON、入力上限、published-bucketの末尾bucket semanticsは変更しない。次単位ではcanonical resultを生成できる計算経路を選び、support metadataとoverflow証明をどの境界で付与するか、Worker・JSON serialization、公開結果への移行条件を決める。

## Dynamic distribution range Phase 2-H 第2単位

第2単位では`DamageCalculator`へopt-inの`calculateCanonicalDamageOnDemand`を追加し、planned on-demand damageの最終合成後だけ`DistributionResult` version 1を生成する。APIはprovider、runtime optionsに続いてacceptedなtop-level attack range planを要求し、damage subplanだけの入力を拒否する。`published-bucket` score propagationだけを実装対象とし、`full-tail`はcanonical結果へ黙って近似せず明示的に拒否する。

DR weightsはhit mass `H`のsub-probabilityであり、RuntimeDamageRollの契約を条件付き確率へ変更しない。provider返却値の総量を`H`として検証し、failure mass `F`と分離したまま防御・fixed shiftを適用し、最終合成境界で`F + H = 1 ± 1e-8`を検証する。既存planned APIとcanonical APIはcollapse前の共通内部helperを利用し、DR providerの呼出し、防御、fixed shift、failure合成を二重実行しない。既存APIは従来の1024 bucket collapseとoverflow加算を維持し、canonical adapterへ置き換えない。

canonical resultはpublished-bucket scoreを入力とする有限modeled distributionであり、実世界の未打切りDX sourceは無限supportとしてmetadataで区別する。modeled support maxは`max(0, rawSupportMax + fixedDifference - defence.dice)`で、安全な整数演算を必須とする。modeled supportがworking rangeを超える場合の最終damage overflow lower boundは、fixed differenceを`a`、defenceMaxを`D`、workingMaxを`W`として、`a >= 0`なら`max(0, W + 1 - D)`、`a < 0`なら`max(0, W + 1 - D + a)`とする。明示valuesは`min(modeledSupportMax, lowerBound - 1)`までに切り詰め、lowerBound以上の既知の最終分布massをplanned raw overflowへ加算してexact overflowへ集約する。supportがworking range内ならoverflowをnullとし、DX tail certificateはmodeled overflowへ二重加算せず、防御コピーしてfreezeした`scoreTails`にだけ残す。

この単位の対象はpure calculation API、unit tests、設計文書までである。`CalculationClient`、UI戻り値、RuntimeDamageRoll Client/Worker protocol、cache、transfer、JSON、total damage、入力上限、full-tail、公開dynamic outputは変更しない。次単位ではcanonical consumer、Worker・JSON serialization、公開結果切替の互換境界を設計する。

## Dynamic distribution range Phase 2-H 第3単位

第3単位では、既存attack routeの公開契約を維持したまま`createCalculationClient()`へopt-inの`calculateAttackCanonical(params, options = {})`を追加する。legacy `calculateAttackCombo`とcanonical methodはsnapshot、RangePlanner preflight、`onRangePlan`、ResourceGuard lease、abort/stale確認、score計算を共有し、canonical pathだけが`calculateCanonicalDamageOnDemand`を選択する。

canonical calculatorにはdamage subplanではなくacceptedなtop-level attack planを渡し、DR provider、D10 provider、`onFftLength`、runtime optionsはlegacy pathと同じものを渡す。戻り値は`{ score, scoreSummary, canonicalDamage }`に限定し、pure APIのfreeze済み`{ result, metadata }`をそのまま保持する。legacy `damage`、`damageSummary`、`getDamageSummary`はcanonical pathへ持ち込まない。

この単位のconsumerはclient APIとunit testに限り、UI、既存公開結果、RuntimeDamageRoll Client/Worker protocol、JSON、`getTotalDamage`、入力上限、full-tailは未接続のままとする。次段階ではcanonical resultのconsumer、Worker・JSON serialization、公開resultとUIの切替条件、total damageでsupport metadataを失わない境界を設計・検証する。
