# R26-C: 《支配の領域》の順序統計量化

## 目的

正の`shihai`を指定したDXのruntime計算から、ダイス数に比例する状態DPを取り除き、入力ダイス数が大きくなっても作業配列を増やさない計算へ置き換えた。ゲーム上の使用タイミング、`dice <= shihai`の強制失敗、support、overflow、tail certificate、既存の絶対resource limitは変更していない。

## ルールとの同値性

クリティカル値を`c`、初期ダイス数を`n`、`shihai`を`m`とする。効果を使わずに1個のダイスを最後まで振った結果を`X_i`とし、`n`個の独立な結果を大きい順に`X_(1) >= ... >= X_(n)`とする。最初のロールでクリティカルしたダイス数を`k`とすると、`k <= m`では大きい方から`m`個を1へ変更するため残る最大値は`m + 1`番目、`k > m`ではクリティカルしたダイスだけが次のロールへ進むため同じ順位の続きを計算する。したがって`n > m`の最終DX値`Y`は

$$
Y=X_{(m+1)}.
$$

`n <= m`では最初のロールで全ダイスを1へ変更し、アプリ内部では点分布0（ファンブルを含む強制失敗表現）へ変換する。この境界は順序統計量計算へ渡さず、従来どおり先に処理する。

## 旧runtime実装

旧`DxCalculator`は、同じ`shihai`についてダイス数ごとの結果配列を`resultByDice`へ保持していた。各`n`について、終了ラウンドの順序統計量を作り、最初のロールで`k`個がクリティカルした確率を掛けて`k`ダイスの既計算結果を10だけシフトして加算した。`k=n`の全クリティカルは自己遷移となるため、幾何級数に相当する配列漸化式を別途解いていた。この方式は計算量・メモリともに初期ダイス数に依存し、plannerも三角形状の遷移数と`dice + 4`本の配列を見積もっていた。

## 新runtime実装

`src/calculation/DxOrderStatistic.js`に、1DXのtailと二項分布の上側確率を組み合わせる低レベル helperを追加した。完全な1DXの結果を`X`、`q_x=P(X>x)`とし、`K_x ~ Binomial(n, q_x)`とすれば、`Y=X_(m+1)`のtailは

$$
P(Y>x)=P(K_x >= m+1).
$$

隣接tailの差

$$
P(Y=x)=P(Y>x-1)-P(Y>x)
$$

を`workingLength - 1`まで明示配列へ書き、最後の要素へ残りのtailを保存する。`oneDieTail`がクリティカル連鎖を含む1DXのtailを返すため、ロール単位の状態表や自己遷移配列は不要になった。

二項上側確率は、成功側の項数`m + 1`と失敗側の項数`n - m`の短い方

$$
L=\min(m+1,n-m)
$$

だけを対数空間で評価する。確率0・1、順位が範囲外、`n <= m`は明示的に処理し、NaN・非有限値や許容幅を超える負の確率は拒否する。小さな丸め誤差だけを0へクランプし、最後のoverflowは正規化前の残余tailとして保持する。

## plannerとメモリモデル

producerと`ScoreRangePlanner`は`getDxOrderStatisticTermCount`と`getDxOrderStatisticOperationEstimate`を共有する。作業長を`W`、1DX tailのクリティカル値依存部分を`C`とすると、正の`shihai`のCPU workは

$$
O(W(C+L))
$$

で、メモリは`O(W)`である。producerのDX計算はraw・normalizedの2本、Score plannerはそれにScoreの作業表現を加えた定数本として見積もる。`shihai=0`の既存最大値経路、`yousei`との併用禁止、絶対CPU・メモリ上限は変更していない。

`dice=1,000,000, critical=11, shihai=1`と`shihai=999,999`のplanner回帰を追加し、どちらも受理され、配列見積りがダイス数に比例しないことを固定した。score-onlyの代表値は次のとおりである。

| `dice` | `critical` | `shihai` | `workingLength` | `operations` | `float64Bytes` |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000,000 | 11 | 1 | 12 | 144 | 464 |
| 1,000,000 | 11 | 999,999 | 12 | 132 | 464 |

また、`dice=99`の順序統計量項数は`critical=2`、`shihai=19`で`L=20`、`critical=11`、`shihai=19`で同じ`L=20`となる。display windowを0～1000としたscore-only plannerでは、前者は`workingLength=2203`、`operations=46263`、`float64Bytes=88104`、後者は有限supportのため`workingLength=12`、`operations=360`、`float64Bytes=464`となった。

## reference generatorとasset

Python reference generatorは、再生成とfixture照合の正本として従来のロール単位DPを維持する。`generator/src/dx_precompute/dx.py`、既存JSON、schema、rounding policyは変更していない。runtimeの順序統計量がreferenceと一致することは、既存のreference gateと独立したruntime oracleで検証する。

## 検証

- `tests/dxOrderStatistic.test.js`で二項分布の独立オラクル、最大・最小順位、確率0・1、単調性、PMFとoverflow、完全1DXとの一致を検証した。
- `tests/rangePlanner.test.js`で共有operation estimateと100万ダイスの定数メモリ見積りを検証した。
- `tests/corePlanningArchitecture.test.js`で旧DP helperの削除、producer・plannerから共有helperへの依存、plannerから`DxCalculator`への逆依存がないことを検証した。
- `npm test`、`npm run lint`、`npm run lint:markdown`、`npm run typecheck`、`npm run build`、`npm run verify:reference`を実行し、runtime DX 20,000ケース、generator通常18件、simulation13件、reference asset 32件が成功した。
- `npm run benchmark:full-tail-attack`は全ケースをエラーなしで完走した。今回のplanner見積り変更により、結果digestは`989000341.161962`となった（旧`1245155.511306`は旧plannerのplan fieldsを含むdigestであり、アルゴリズムの同値性を判定するfixtureではない）。

## 非対象

今回の変更では、`yousei + shihai`、exact shihai tail certificate、Score/Damageのresult contract、UI、Worker、resource limitの値、Python generator、既存asset、教科書本文の《支配の領域》章は変更していない。教科書本文はruntime方式の確定後に別作業で更新する。
