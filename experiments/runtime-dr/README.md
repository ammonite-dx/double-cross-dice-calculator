# `dr`オンデマンド計算実験

> この実験ディレクトリは、旧schema-v2 assetとの照合と当時の性能測定を再現するための履歴資料です。`reference.js`と`optimized.js`に残る`202`ダイス・`9`回の定数は、その比較fixtureの範囲を表すものであり、productionの`src/calculation/RuntimeDamageRollCalculator.js`が受け付ける入力上限ではありません。

## 目的

このディレクトリは、`dr`の全ダイス数分布を静的JSONから取得せず、命中結果から必要になる混合分布をブラウザ内で直接計算できるか調査するための実験です。最適化実装は現在の`RuntimeDamageRollCalculator`とWorker経路へ反映され、ここには参照実装と性能・数値検証用のコードだけを残しています。

## 入出力

入力は、ダメージダイス数が$n$個になる重み$w_n$と、`kazanari`の対象ダイス数$m$です。出力は、現在の`dr`と同じ2048要素のダメージ分布1本です。重みの総和は1でなくてもよく、命中確率だけを渡した場合は出力分布の総和も同じ命中確率になります。

$$
W(s)=\sum_{n=0}^{202}w_ns^n
$$

`kazanari = 0`では、1D10の確率母関数を$D(z)$とすると、必要な混合分布の確率母関数は$W(D(z))$です。これにより、203本のダイス数別分布を作ってから重み付けする処理を、周波数点ごとの多項式評価と1回の逆FFTへ置き換えられます。

`kazanari > 0`では、振り直される元のダイスのうち最後に除かれる値を$t\in\{1,\ldots,5\}$とし、$t$未満のダイス数を$b$として場合分けします。二項係数を含むダイス数方向の和は、$W$の正規化された導関数を使ってまとめます。

$$
E_r(s)=\frac{W^{(r)}(s)}{r!}=\sum_{n\ge r}\binom{n}{r}w_ns^{n-r}
$$

各周波数点では$E_0$から$E_{m-1}$までを拡張Horner法で同時に評価します。実数分布の共役対称性を使って4096点のうち2049点だけを計算し、最後に逆FFTを1回実行します。

## 実装

- [`reference.js`](./reference.js)は、複素数と数式の対応を追いやすくするため、複素数を`{ real, imaginary }`として扱う参照実装です。
- [`optimized.js`](./optimized.js)は、同じ式を型付き配列、再利用する作業領域、インライン化した複素数演算で計算します。
- [`fft.js`](./fft.js)は、両実装が共有する4096点FFTです。
- [`worker.js`](./worker.js)は、最適化実装を常駐するmodule Workerで実行し、2048要素の分布をtransferableとして返します。
- [`client.js`](./client.js)は、Workerの生成、同一入力の重複排除、LRUキャッシュ、呼び出し単位の中断、障害後のWorker再生成を管理します。
- [`browser-benchmark.html`](./browser-benchmark.html)と[`browser-benchmark.js`](./browser-benchmark.js)は、実ブラウザのメインスレッド実行とWorkerクライアント経由の実行を比較します。
- [`decision.md`](./decision.md)は、実験から得られた根拠、暫定的な採用判断、本番実装前の未解決事項を記録します。
- [`runtimeDamageRollExperiment.test.js`](../../tests/runtimeDamageRollExperiment.test.js)は、代表的な単一分布、混合分布、確率総和、非負性、参照実装と最適化実装の一致を検証します。
- [`runtimeDamageRollClient.test.js`](../../tests/runtimeDamageRollClient.test.js)は、重複排除、キャッシュ、中断、エラー伝播、Worker再生成、終了処理を偽のWorkerで検証します。
- [`canonicalDamageOnDemand.test.js`](../../tests/canonicalDamageOnDemand.test.js)と[`runtimeDamageRollProduction.test.js`](../../tests/runtimeDamageRollProduction.test.js)は、命中確率の集約、防御適用後の最終分布、Workerへ渡す混合分布をcanonical経路で検証します。
- [`verify-runtime-dr-experiment.mjs`](../../scripts/verify-runtime-dr-experiment.mjs)は、公開schema-v2/revision-1 assetに含まれる203ダイス数と10種類の`kazanari`の全2030分布を比較します。
- [`benchmark-runtime-dr-experiment.mjs`](../../scripts/benchmark-runtime-dr-experiment.mjs)は、同じ混合重みについて両実装を測定します。

## 実行方法

```shell
npm test -- tests/runtimeDamageRollExperiment.test.js
npm test -- tests/runtimeDamageRollClient.test.js
npm test -- tests/canonicalDamageOnDemand.test.js tests/runtimeDamageRollProduction.test.js
npm run test:runtime-dr:full
npm run test:runtime-dr:full:reference
npm run benchmark:runtime-dr
```

通常テストは代表ケースだけを扱います。全件比較は、最適化実装で約28秒、参照実装で約107秒を要したため、明示的なコマンドへ分離しています。

ブラウザ測定では開発サーバーを起動し、`/experiments/runtime-dr/browser-benchmark.html`を開きます。ページは`kazanari = 0～9`について初回、中央値、95パーセンタイル、最大値、Long Tasksを測定し、同じ入力をメインスレッドとmodule Workerで比較します。

## Workerクライアント

`createRuntimeDamageRollClient`は、ダイス数ごとの重みと`kazanari`を受け取り、2048要素の`Float64Array`を非同期に返します。キャッシュ内の分布は呼び出しごとに複製するため、利用側が結果を変更しても他の呼び出しへ影響しません。

同じ重みと`kazanari`の要求が処理中なら、Workerへ新しい要求を送らず同じ計算を共有します。各呼び出しは`AbortSignal`を指定でき、中断された呼び出しだけが`AbortError`になります。共有中の計算自体は続行し、他の呼び出しとキャッシュで利用します。この構成により、画面入力が続けて変化した場合も、古い結果を画面へ反映せずに計算結果の再利用を維持できます。

Workerが計算エラーを返した場合は該当要求だけを失敗させます。Worker自体のエラーまたはメッセージの受信失敗では、すべての処理中要求を失敗させてWorkerを終了し、次の要求時に新しいWorkerを生成します。

## ダメージ計算との接続

現行の`DamageCalculator`は、命中した達成値ごとにダメージダイス数を求め、対応する`dr`の列を混合します。オンデマンド版では、先に同じダメージダイス数となる命中確率を$w_n$へ集約し、この重みをWorkerへ渡します。Workerから返る分布には非命中確率を含めず、攻撃力、防御ダイス、防御固定値を適用した後でダメージ0へ加えます。この順序は現行実装と同じです。

当時の統合プロトタイプは`kazanari = 0, 3, 9`について、正の攻撃力、負の攻撃力、防御ダイス、防御固定値、命中と非命中の混合を含む最終ダメージ分布を公開asset経路と比較し、最大絶対差$2\times10^{-6}$以内で一致することを確認しました。統合処理の現行実装は`src/calculation/DamageCalculator.js`と`src/application/CalculationClient.js`です。

## 予備結果

2026年8月2日のWindows x64、Node.js v24.14.0で、公開schema-v2/revision-1の全2030分布との最大絶対差は、両実装とも約$5.98\times10^{-7}$でした。最大差は`kazanari = 6`、ダイス数8、ダメージ55で発生し、assetの小数点以下6桁への丸めで説明できる範囲に収まりました。

| 実装 | `kazanari = 0` | `kazanari = 3` | `kazanari = 9` |
| --- | ---: | ---: | ---: |
| 参照実装 | 約2.52 ms | 約51.35 ms | 約159.26 ms |
| 最適化実装 | 約0.87 ms | 約20.55 ms | 約44.24 ms |

絶対時間は実行環境に依存します。Node.jsの結果だけではUIへの影響を判断できないため、次のブラウザ測定と分けて扱います。

### Chrome系ブラウザ

2026年8月2日のWindows x64、Chrome 150、論理CPU 16、メモリ32 GiBの環境では、次の結果になりました。Workerの往復時間には、重みの送信、計算、2048要素の`Float64Array`の転送を含みます。

| `kazanari` | メインスレッド中央値 | Workerクライアント往復中央値 |
| ---: | ---: | ---: |
| 0 | 0.9 ms | 1.0 ms |
| 1 | 15.1 ms | 15.2 ms |
| 2 | 16.9 ms | 17.0 ms |
| 3 | 20.2 ms | 20.5 ms |
| 4 | 25.2 ms | 25.4 ms |
| 5 | 29.7 ms | 30.6 ms |
| 6 | 33.3 ms | 33.6 ms |
| 7 | 36.8 ms | 37.0 ms |
| 8 | 40.4 ms | 40.4 ms |
| 9 | 44.5 ms | 44.9 ms |

60 Hz表示の1フレームに相当する約16.7 msは`kazanari = 2`から超えました。測定回によってはメインスレッド実行の`kazanari = 7～9`で50 ms以上のLong Taskが発生しましたが、同じ測定のWorkerクライアント経路では発生しませんでした。Workerの往復増分は中央値で概ね0.1～0.3 msに留まり、総待ち時間をほとんど増やさずにメインスレッドの占有を避けられます。

## 次の判断

オンデマンド化を採用する場合は、端末性能によって変化する`kazanari`閾値を設けず、単一の常駐module Workerへ統一する案を第一候補とします。`kazanari = 0`でもWorkerの定常的な往復増分は小さく、API、キャッシュ、キャンセル処理を一つの非同期経路へ統一できるためです。

次の段階では、Firefox、Safariと低速なモバイル相当環境で測定し、Workerを含む最終的な性能目標を決めます。その判断前に本番コードへ接続したり、`dr`用JSONを削除したりしません。
