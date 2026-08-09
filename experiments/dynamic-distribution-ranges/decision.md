# 動的分布範囲plannerの実装前調査と設計判断

## 状態と結論

この調査では、本番の`src`、配信JSON、UI入力上限を変更していません。実行可能な参照plannerとNodeベンチマークだけを`experiments/dynamic-distribution-ranges/`へ追加しました。

現時点の推奨は次のとおりです。

- 静的Cloudflare Pagesとブラウザ内オンデマンド計算を維持する。
- plannerの既定モードは現行互換の`published-bucket`とし、公開スコアの1023以上をダメージダイス数202へ写像する契約を不用意に変えない。
- 達成値の尾部をダメージ計算まで伝播する`full-tail`は別の明示的な移行段階とし、尾部誤差証明、表示、資源上限、新旧比較を同時に導入する。
- DXのsupportは有限supportではなく、許容打ち切り誤差を満たすcutoffとして決める。`shihai > 0`と`yousei > 0`には、まず安全側の尾部上界を使い、実装時により鋭い証明を追加する。
- `tail.model`は、`shihai=0`かつ`yousei=0`だけを`exact-max`とし、`shihai>0`は`conservative-max-bound`、`yousei>0`はunion boundを表す`conservative-union-bound`とする。後者は`shihai>0`との組み合わせを含め、厳密分布とは呼ばない。
- 現行互換モードでは`shihai>0`かつ`yousei>0`をUI仕様どおり`incompatible-input`のrejectとする。reject前にtail planningを実行し、診断用のcutoffとモデル名は返す。
- `dr`はダメージダイス数が決まれば有限supportなので、最大値、固定値差、防御ダイスから必要な作業範囲を導出する。FFT長はsupport長から別に導出する。
- 警告と拒否は入力値だけでなく、推定時間、推定メモリ、作業配列長、FFT長、尾部誤差予算のすべてで判定する。

ベンチマークは要求Nodeの`22.23.2`を使用できず、実際の`v22.12.0`で実行しました。したがって、以下の時間は設計の根拠となる同一環境の比較値であり、対応ブラウザや低速端末の合格基準ではありません。

## 既存判断との関係

既存の[`docs/todo.md`](../../docs/todo.md)は、第6段階で入力、計算、FFT、表示の範囲を同時に設計し、誤差、計算時間、メモリ、描画点数をまとめて扱う方針です。[`experiments/runtime-dr/decision.md`](../runtime-dr/decision.md)は、固定された1024、2048、4096を単純に大きくするのではなく、入力範囲、表示範囲、中間範囲、FFT長を役割ごとに分離する方針を定めています。[`docs/runtime-calculation-algorithms.md`](../../docs/runtime-calculation-algorithms.md)と[`docs/adr/0001-expanded-working-distributions.md`](../../docs/adr/0001-expanded-working-distributions.md)は、現行の公開1024要素、作業2048要素、負の補正前に上限集約しない順序を説明しています。

今回のplannerは、この判断を実装前に検査するための参照実装です。planner自体は計算を実行せず、計算器へ「どの範囲を、どの誤差契約で、どの資源上限内に確保するか」を渡す責務に限定します。

## 現行実装の境界一覧

| 対象 | 現行値 | overflowまたは固定境界の意味 | 主な実装経路 |
| --- | ---: | --- | --- |
| 公開分布 | 1024要素 | index 0–1022は個別値、index 1023は1023以上の集約 | [`src/data/Distribution.js`](../../src/data/Distribution.js) |
| 判定・ダメージ作業分布 | 2048要素 | index 2047は作業範囲外を集約する末尾バケット | [`src/calculation/ScoreCalculator.js`](../../src/calculation/ScoreCalculator.js)、[`src/calculation/DamageCalculator.js`](../../src/calculation/DamageCalculator.js) |
| DX入力 | dice 0–99、critical 2–11、shihai 0–19 | `shihai=0`は最大値の累積分布、`shihai>0`はダイス数方向DP。どちらもindex 2047へ尾部を集約 | [`src/calculation/DxCalculator.js`](../../src/calculation/DxCalculator.js) |
| DX丸め | 小数第6位 | 公開JSONとの互換用。一般的な動的計算の必須丸めではない | [`src/calculation/DxCalculator.js`](../../src/calculation/DxCalculator.js) |
| 実行時DR入力 | damage dice 0–202、kazanari 0–9 | scoreの公開bucket 1023をdamage dice 202として扱うため、現行の最大値は202 | [`src/calculation/RuntimeDamageRollLimits.js`](../../src/calculation/RuntimeDamageRollLimits.js)、[`src/calculation/DamageCalculator.js`](../../src/calculation/DamageCalculator.js) |
| 実行時DR出力 | 2048要素 | `spectrumToDistribution`がindex 2047以上を末尾へ加算 | [`src/calculation/RuntimeDamageRollCalculator.js`](../../src/calculation/RuntimeDamageRollCalculator.js) |
| 実行時DR FFT | 4096点 | 周波数側を4096点で評価し、2049点を計算して共役対称に補完 | [`src/calculation/RuntimeDamageRollLimits.js`](../../src/calculation/RuntimeDamageRollLimits.js) |
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

`yousei=y`がある場合、各回の10の倍数への切り上げは値を最大9増加させ、criticalが10以下なら1ダイス判定の合成が追加されます。したがって、`t=floor((x-9y)/(y+1))`として、参照plannerは次の保守的上界を使います。

$$
P(V_{\mathrm{final}} > x)
\leq \left(1-F_c(t)^n\right) + y\left(1-F_c(t)\right)
$$

この上界は`yousei=9`でかなり保守的です。`yousei`と`shihai`を同時に扱う入力は現行UIで拒否しているため、plannerでも互換モードでは警告または拒否理由として保持します。将来の実装では、実際の合成順序を考慮したsub-Gaussian型またはDP由来の上界を検討します。

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

各supportは`0..10n_i`です。現行の`d10`と`livingdead`アセットは1023以上を集約済みなので、1023より大きい境界を正確に表示するには、アセットを動的生成するか、別の広い有限分布を用意する必要があります。DXのような無限尾部誤差とは分けて、asset-overflowとして扱います。

## ベンチマーク結果

再実行可能なスクリプトは[`benchmark.mjs`](./benchmark.mjs)、全結果は[`results.json`](./results.json)です。測定環境はWindows x64、AMD Ryzen 7 9700X、論理CPU16、約61.6 GiB、Node `v22.12.0`です。`.node-version`の`22.23.2`とは一致しません。

### 尾部cutoff

| 入力 | epsilon | cutoff | 尾部上界 |
| --- | ---: | ---: | ---: |
| 99D、critical 2、shihai 0、yousei 0 | 1e-6 | 1741 | 9.73e-7 |
| 99D、critical 2、shihai 0、yousei 0 | 1e-8 | 2181 | 9.44e-9 |
| 99D、critical 8、shihai 0、yousei 0 | 1e-8 | 192 | 9.21e-9 |
| 200D、critical 2、shihai 19、yousei 0 | 1e-8 | 2251 | 9.12e-9 |
| 99D、critical 2、shihai 0、yousei 9 | 1e-8 | 21991 | 9.26e-9 |

現行supportの最大値2047で計算した安全側上界は、99D・critical 2・yousei 0で約`4.12e-8`、99D・critical 2・yousei 9では1です。後者は上界が粗いため、ただちに実確率が1という意味ではありませんが、2048要素をそのまま拡張用supportとして採用する根拠にはなりません。

### Node計算時間と理論配列容量

| 処理 | supportまたは入力 | 中央値 |
| --- | --- | ---: |
| 現行DX、shihai 0 | 99D、critical 8、2048要素 | 0.61 ms |
| 現行DX、shihai 19 | 99D、critical 2、2048要素 | 5.26 ms |
| 可変DX参照、shihai 0 | 200D、critical 2、4096要素 | 0.43 ms |
| 可変DX参照、shihai 19 | 200D、critical 2、4096要素 | 48.2 ms、約6.29 MiBのresultByDice |
| 可変DX参照、shihai 19 | 300D、critical 5、4096要素 | 103 ms、約9.40 MiBのresultByDice |
| 現行DR最適化、kazanari 0 | 202D、FFT4096 | 0.83 ms |
| 現行DR最適化、kazanari 9 | 202D、FFT4096 | 42.5 ms |
| 可変DR参照、kazanari 0 | 304D、FFT4096 | 1.11 ms |
| 可変DR参照、kazanari 0 | 400D、FFT4096 | 1.37 ms |
| 可変DR参照、kazanari 0 | 512D、FFT8192 | 3.47 ms |
| 可変DR参照、kazanari 0 | 800D、FFT8192 | 5.17 ms |
| FFT transform | 16384点 | 0.59 ms |
| FFT transform | 32768点 | 1.37 ms |

可変DRの304D以上は`kazanari=0`の多項式参照計算です。`kazanari=9`の拡張値を実測したものではなく、現行の42.5 ms測定とダイス数・FFT長・導関数次数に比例する計算量モデルで見積もる対象です。低速端末でのhard limitを決める前に、Workerを含むブラウザ測定が必要です。

### 何がしきい値を支配するか

- `shihai=0`のDXは、supportを2048から4096へ増やしても99Dの可変参照計算は0.43 msでした。尾部cutoffが主な設計要因です。
- `shihai>0`のDXは、`resultByDice`がダイス数とsupportの積で増え、200D・4096要素で約48.2 ms、300D・4096要素で約103 msでした。入力ダイス数だけでなく、DPの中間配列数とsupport長を警告対象にする必要があります。
- DRの`kazanari=9`は現行最大で約42.5 msです。メインスレッドの60 Hz 1フレーム16.7 msを超えるため、既存判断どおりWorker経路を基本とし、plannerの時間警告は計算本体の測定値にWorker転送とUI更新の余裕を加えます。
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
  operation: 'score' | 'attack' | 'backtrack',
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

`score`単体では`score`自身を使い、`attack`ではaction/reactionの両側を使います。`backtrack`ではロイス数、Eロイス数、減少ダイス、減少固定値、現在侵蝕率、Dロイス種別を使います。入力の整数性、符号、相互排他はplannerの前段で検証し、計算器自身も再検証します。

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

`estimates.timeMs`は、DXやDR本体のoperationをそれぞれ`dxOperationsPerMs`または`damageOperationsPerMs`で割り、FFT operationを`fftOperationsPerMs`で割って合算します。`operations`は本体とFFTを含む総数で、係数が異なるため時間見積もりの代用にはしません。

警告コードは少なくとも次を用意します。

- `score-tail-budget`: 尾部上界が予算を超えた、または尾部証明がない。
- `score-working-length`: DX DPの作業配列長が警告またはhard limitを超えた。
- `working-length`、`fft-length`: 分布または畳み込み長が閾値を超えた。
- `estimated-time`、`estimated-memory`: 校正済みモデルの推定資源が閾値を超えた。
- `display-points`: チャート点数が描画上限を超えた。
- `asset-overflow`: d10/livingdeadなど既存アセットのoverflowが要求境界にかかる。
- `incompatible-input`: 現行互換モードで`yousei`と`shihai`を同時利用するなど、UI仕様が拒否する組み合わせ。参照plannerではrejectとして返す。

warningは計算を許可しますが、ユーザーへ推定時間、メモリ、尾部誤差、overflowの意味を示します。rejectは入力を計算器へ渡さず、理由と、入力を下げるか表示を粗くする代替案を返します。

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
| RuntimeDamageRollCalculator | damage dice weightとkazanariから有限DRを生成し、planned FFT長、raw support、数値誤差を検証して返す |
| DamageCalculator | 命中達成値をdamage diceごとのweightへ集約し、攻撃固定値、防御ダイス、防御固定値をplanned working rangeへ適用してから表示overflowを作る |
| Distribution/FFT | 明示されたrange contractに従うシフト、畳み込み、差、overflow集約。暗黙の1024/2048への縮退はしない |
| Worker/client | planner結果を要求単位で転送し、キャンセル、重複排除、cache、transferable配列、エラーを管理する |
| UI/chart/table | warning/rejectとoverflowの意味を表示し、表示点数とビンを制御する。確率のsupportや誤差を独自に推定しない |

## 推奨しきい値案

以下は本番確定値ではなく、Node実測と既存ブラウザ測定から作る初期policy案です。端末下限を測定後に更新します。

| 指標 | warning案 | hard案 | 根拠 |
| --- | ---: | ---: | --- |
| 1計算の推定時間 | 50 ms | 200 ms | 現行DR `kazanari=9`がNodeで約42.5 ms、既存Chromeで約44.5 ms。メインスレッド16.7 ms枠はすでに超える |
| peak計算メモリ | 32 MiB | 64 MiB | DX DP、DR FFT、防御畳み込み、Worker転送の同時生存に余裕を持たせる。実端末のメモリ測定が必要 |
| dense working length | 8192 | 16384 | `yousei=9`・critical2の99Dはepsilon1e-8で約21992 cutoffとなり、4096への置換だけでは足りない |
| FFT length | 16384 | 32768 | FFTは長さに比例して増え、32768点のtransformでもNodeで約1.37 ms。大きい入力はDPやDR本体が支配する |
| チャート点数 | 1000 | 1000 | 現行UIの0–999を維持。広いsupportはbinまたは拡大表示で分ける |
| DX総打ち切り誤差 | 8e-9をscore側へ配分 | total 1e-8 | 現行2048の99D・critical2上界約4.12e-8より厳しい。数値誤差、重み化、表示丸めを別枠で管理する |

時間モデルは端末ごとに校正し、Nodeの固定係数をブラウザの保証値として使いません。planner参照実装の初期係数は、`shihai>0`のDPと`kazanari=9`の現行DRを安全側に見るため、単純なoperation数より保守的な設定にしています。

## 実装を分ける段階

1. `RangePlan`、`OverflowInfo`、`TailCertificate`の内部型を追加し、既定の`published-bucket`では現在の1024/2048結果を変えない。
2. plannerを計算coreへ移植し、入力検証、尾部上界、resource estimate、warning/rejectの単体テストを追加する。
3. `DxCalculator`をplanned supportへ対応させ、`shihai=0`の厳密上界、`shihai>0`の保守上界、cutoff外質量を別フィールドで返す。小数第6位丸めは互換経路だけへ限定する。
4. `RuntimeDamageRollCalculator`と`FFT`をrequested FFT長へ対応させ、有限DRの最大値と循環畳み込みなしを検証する。`kazanari=9`のWorker経路を基本とする。
5. `DamageCalculator`で公開スコアを先に1023へ集約する現行経路と、full-tailのweight化経路を明示的に分ける。負の固定値、防御ダイス、overflowの境界テストを追加する。
6. 複数コンボの合計、d10/livingdead、バックトラックのfinite supportをplannerへ接続し、既存アセットのoverflow警告を追加する。
7. UIで推定時間、メモリ、尾部誤差、overflow下限を表示し、広いsupportは表示binへ集約する。チャート点数と計算supportを分離する。
8. Node、Chrome、Firefox、Safari、低速モバイル相当、Worker転送込みで再測定し、入力上限の拡張可否を決める。JSON削除や外部API化はこの検証後の別作業とする。

## 追加テスト計画

### 単体テスト

- `nextPowerOfTwo`、support長、`delta`の正負、`B_max`からの作業範囲導出。
- `shihai=0`の尾部式とcutoffの単調性、`critical=11`の有限support、`dice=0`。
- `shihai>0`の保守上界が実測DPの尾部以上であること、`yousei`の上界、cutoff未達時のreject。
- finite DRの最大値`10n`、kazanariによる最大値不変、FFT長が線形畳み込み長以上であること。
- warning/rejectの境界、メモリ見積もり、display point数、`published-bucket`と`full-tail`の写像差。
- overflow確率の非負性、総和、下限表示、後続の負の補正前に集約しないこと。

### 統合・回帰テスト

- 現行入力全列挙で既存JSONとDX/DRの確率総和、非負性、許容差を比較する。
- 現行の固定値±999、防御99D10、攻撃99D10、kazanari0/9、yousei0/9、shihai0/19を含む攻撃結果を旧経路と比較する。
- score overflowがdamage diceへ伝播しない互換モードと、伝播するfull-tailモードを別の期待値で検証する。
- 複数コンボの合計、後続の減算、表示範囲999、overflow下限、期待値の近似表示を検証する。
- `d10`と`livingdead`のdice 223、および1023境界のasset-overflowを検証する。

### 性能・実ブラウザテスト

- `node experiments/dynamic-distribution-ranges/benchmark.mjs --write-results`をNodeバージョンとともに保存する。
- `kazanari=0/3/9`、DX `shihai=0/19`、support 1024/2048/4096/8192/16384をWorker転送込みで測定する。
- Chrome、Firefox、Safari、低速モバイル相当で、中央値、95パーセンタイル、最大時間、Long Task、Worker peak memoryを測定する。
- 計画がwarningへ入ったときのUI表示、hard reject時のキャンセル、連続入力の重複排除、Worker再生成を検証する。

## 未解決の設計判断

- `shihai>0`と`yousei>0`の保守的な尾部上界を、現行DPの計算量を増やさずどこまで鋭くできるか。
- `epsilonTotal=1e-8`をルール上の表示精度として採用するか。現行JSONの小数第6位丸めとの互換許容差は別契約にする必要がある。
- `full-tail`を採用する場合、cutoffより上の達成値をdamage dice weightへどのように近似し、期待値とoverflow区間をどう表示するか。
- 公開分布のindex1023を「1023以上」と表示するか、チャートに区間ラベルを追加するか。
- d10/livingdeadを動的生成して有限supportを広げるか、現行1024アセットを維持してasset-overflowを警告するか。
- WorkerをDXにも常時使用するか、計画時間がwarning以上の場合だけ使用するか。二重経路の保守コストと低速端末の応答を比較する必要がある。
- 時間モデルを固定係数で持つか、端末の初回micro-benchmarkで校正するか。校正自体の待ち時間と再現性が未確定である。
- plannerを計算coreの同期純関数として公開するか、Worker側で再検証するか。入力改ざんや異なるpolicyを防ぐため、Worker側のhard limit検証は残すべきである。
