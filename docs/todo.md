# TODO

リポジトリ内で判明している、後続作業が必要な技術課題を記録します。完了した項目は、対応したコミットまたはPull Requestを記録したうえでこの一覧から削除します。

## 推奨実装順

大きな変更は以下の順に独立ブランチで実施します。各段階で現行実装との適合テストを維持し、オンデマンド計算、入力範囲の拡張、外部API公開を同時に導入しません。

1. 完了: `9571f08`で「不死者・悪夢」の100%境界バグを修正し、以後の構造変更に正しい期待値を持ち込んだ
2. 完了: `9beeea2`で現行の判定、ダメージ、バックトラック計算からVue、`fetch`、静的アセット取得への依存を除き、互換ラッパーで現行UIを維持した
3. 完了: `b29b4e0`で非同期の`CalculationClient`とローカルアダプターを導入し、UIから計算モジュールとデータリポジトリへの直接参照をなくした
4. 完了: 実験済みの混合分布アルゴリズムと常駐Web Workerを本番化し、現在の入力範囲で`dr`用JSON経路との一致を確立した
5. 完了: `codex/runtime-dx-production`で`dx`をオンデマンド化し、`shihai=0`の累積分布と`shihai>0`の動的計画法を別々に検証したうえで本番の通常判定へ統合した
6. 完了: `codex/dynamic-distribution-ranges`で入力、中間計算、FFT、表示の範囲を一体的に決めるcore plannerを追加し、`CalculationClient`のpreflight、warning通知、hard reject、DX/Scoreの可変workingLength、Score FFT、RuntimeDamageRollCalculator/Workerの可変FFT・出力長、DamageCalculatorの動的raw range、防御畳み込み、DamageRangePlan接続、バックトラックの完全support生成、既存戻り値維持、check/attack/backtrack UIへのwarning/reject表示まで接続した。Phase 2-Eでは本番コードを変更せずNode/Chromeベンチマーク基盤を追加・修正し、現行1024 published bucketのtotal damage集計を維持したまま、現行入力上限を変更しない暫定判断と追加実測の受入基準を確定した。resource guard、将来のdynamic output契約、入力拡張候補、JSON経路は次段階へ引き継ぐ
7. オンデマンド経路の実ブラウザ検証後に、本番配信から不要な事前計算JSONを外し、参照用データと再生成コードの保持範囲を決める
8. 計算コアの入出力、数値誤差、資源上限が安定した後にだけ独立API Workerを実験し、第三者向けAPIとMCPはその後に別途判断する

第6段階の実装前調査と参照plannerは[`experiments/dynamic-distribution-ranges/decision.md`](../experiments/dynamic-distribution-ranges/decision.md)に記録しています。本番coreの`src/calculation/RangePlanner.js`へ移植済みで、現行互換の`published-bucket`を既定とし、DXの尾部certificate、Scoreの可変workingLengthと実畳み込みFFT長、finite support、推定時間・メモリによるwarning/rejectの契約を持ちます。`CalculationClient`のpreflightから計画とwarningを取得でき、hard rejectはアセット読込と計算開始より前に働きます。RuntimeDamageRollCalculator/Workerは`fftLength`、`distributionLength`、`rawSupportMax`を受け取り、DamageCalculatorと防御畳み込み、バックトラックの完全support計算も各RangePlanへ接続済みです。Phase 2-EのNode/Chrome測定とPhase 2-FのFirefox/WebKit/Chrome 4x測定では、case errorと数値異常を確認しなかった。残るtotal damage課題はresource guardと将来のdynamic output契約であり、低速実機、入力拡張候補のブラウザ実測、入力上限とJSON経路は残課題です。

第4段階と第5段階ではまず現在の入力範囲と表示範囲を維持します。上限拡張は第6段階で誤差、計算時間、メモリ使用量、描画点数を同時に設計した後に行います。

## オーバーフローバケットを利用者へ表示する

- 状態: 一部完了
- 優先度: 中
- 対象:
  - 判定・ダメージ結果のサマリー
  - グラフ注記
  - 入力範囲の説明

### 問題

公開分布のインデックス1023は値1023以上をまとめたバケットですが、現在の画面では通常の値1023と区別して表示しません。最終バケットの確率が無視できない入力では、期待値も1023へ打ち切った値になります。

### 完了条件

- 最終バケットが値1023以上を表すことを画面上で確認できる
- 最終バケットの確率が定めた閾値を超える場合に近似結果であることを通知する
- 閾値と表示文言をテストおよびドキュメントで固定する

## 計算コアを実行環境から分離する

- 状態: 計算コアと`CalculationClient`の分離済み（`9beeea2`、`b29b4e0`）、Web Workerは未着手
- 優先度: 高
- 判断記録: [`ADR 0002`](./adr/0002-separate-calculation-core.md)
- 対象:
  - `src/data/`
  - 判定・攻撃・バックトラック画面の計算呼び出し
  - 新規の計算コア、`CalculationClient`、ブラウザ内Web Workerアダプター
  - 計算コアの環境非依存テストとアダプター適合テスト

### 目的

計算ロジックをVue、DOM、`fetch`、Web Worker、Cloudflare固有APIに依存しないコアへ分離し、UIが計算の実行場所を知らずに結果を表示できる構成へ移行します。公開サイトは当面、静的SPAとブラウザ内計算を維持し、外部HTTP APIとMCPは同じコアを利用する後続の提供手段とします。

### 実装計画

1. 判定、ダメージ、バックトラックの入力、結果、エラー、キャンセルを表す内部契約を定義する
2. 完了: 計算コアからVue、静的アセット取得、ブラウザとCloudflare固有APIへの依存を除く
3. 完了: UIが利用する`CalculationClient`相当のインターフェースを定義する
4. ブラウザ内Web Workerアダプターを実装し、連続入力のキャンセル、重複排除、キャッシュ、障害復旧を統合する
5. 現行経路、計算コア、ブラウザ内Web Workerで同じ入力が同じ結果になる適合テストを追加する
6. オンデマンド計算と範囲決定処理を計算コアへ統合した後に、HTTP APIの入出力契約を設計する
7. HTTP APIの性能と運用を検証した後にだけ第三者公開を判断し、MCPは安定した契約を呼ぶ薄いアダプターとして最後に検討する

### 完了条件

- 計算コアがブラウザ、Vue、HTTP、Cloudflare固有APIを参照しない
- UIが計算モジュールや静的データリポジトリを直接参照しない
- ブラウザ内Web Workerが公開サイトの標準実行先として動作する
- 現行の計算結果、ルールテスト、数値誤差、キャンセル動作が維持される
- APIやMCPを実装しなくても、同じ計算コアへ新しいアダプターを追加できる

## 旧生成元と移行専用テストを整理する

- 状態: 未着手
- 優先度: 中
- 対象:
  - `src/data/*.json`
  - `scripts/generate-precomputed-data.mjs`
  - `tests/legacy/LegacyCalculator.js`
  - 移行比較専用テスト

### 問題

Python生成器への移行検証のため、旧密JSON、旧JavaScript変換処理、旧計算実装との比較テストを参照用に保持しています。独立した全列挙、全生成範囲の数値監査、乱数シミュレーション、schema-v2/revision-1生成物の検証が揃ったため、公開前に重複する生成元を整理できます。

### 検討事項

- 移行比較テストのうち、独立テストや境界値テストで代替済みの範囲を確認する
- `reference-data/`に旧revisionを残す期間と削除条件を決める
- 旧ノートブックをGit管理外の参照資料として残すかを決める

### 完了条件

- Python生成器だけから現行配信アセットを再生成できる
- 削除する移行テストと同等以上の境界値が独立テストで保護されている
- `src/data/*.json`と旧JavaScript生成処理が本番、テスト、ドキュメントから参照されない
- 削除後に生成物検証、全テスト、lint、本番ビルドが成功する

## `dx`をブラウザ内でオンデマンド生成する構成を検討する

- 状態: 本番統合と実ブラウザ検証を完了、現行入力範囲ではメインスレッド直接実行を採用
- 優先度: 中
- 対象:
  - `generator/src/dx_precompute/dx.py`
  - `src/data/PrecomputedDataRepository.js`
  - `public/data/schema-v2/revision-1/dx/`
  - 新規のJavaScript判定分布生成器

### 目的

現在の`dx`分布は事前計算したJSONとして配信しています。ブラウザ内で必要な分布だけを高速に生成できれば、`dx`用JSONの削減、デプロイ対象の縮小、ダイス数上限の拡張が可能になります。

### 予備調査

- `shihai=0`では、1個のダイスによる判定結果の累積分布を $F_c(x)$ とすると $P(V_{n,c}\le x)=F_c(x)^n$ から対象の分布を $O(L)$ で計算できる
- `shihai>0`では、全ダイスがクリティカルする自己遷移を $d_x=a_x+q d_{x-10}$ で解き、ダイス数に関する動的計画法と組み合わせられる
- Node.jsのV8上でのJavaScript試作では、長さ2048、ダイス数99個まで、指定された1組のクリティカル値と`shihai`の分布列を約5～7 msで生成できた
- 予備調査では公開済みJSONとの最大差が約 $5.3\times10^{-7}$ であり、小数第6位への丸めで説明できる範囲だった
- `shihai>0`では上限200個で約30 ms、500個で約160～220 ms、1000個で約0.6～1.0秒を要したため、大幅な上限拡張にはアルゴリズムの追加改善またはWeb Workerが必要になる

### 検討事項

- Chrome、Firefox、Safariおよび低速なモバイル相当環境で実測する
- `shihai=0`の閉じた式と`shihai>0`の動的計画法を独立した実装とするか決める
- 同じ `(shihai, critical)` の中間分布をキャッシュし、ダイス数の増加時に差分だけを計算できる構成を検討する
- メインスレッドで計算する上限と、静的Pages構成を維持できるブラウザ内Web Workerへ切り替える条件を決める
- 実行時生成の数値誤差、オーバーフローバケット、キャッシュのメモリ上限をテストする
- 自己遷移の計算を等比級数のシフト加算から係数漸化式 $d_{n,c}(x)=a_{n,c}(x)+p_c^n d_{n,c}(x-10)$ へ変更した場合は、確率質量関数から動的計画法を導入する説明を主とし、確率母関数を再帰構造の要約として後から示すように教科書を書き換える
- 上記の実装変更時は、教科書だけでなく事前計算と実行時計算の開発者向けアルゴリズム文書も現行実装に合わせて更新する
- `dr`と`kazanari`は本項目の対象外とし、引き続き事前計算する

### 本番統合の判断

- `CalculationClient`は通常判定のDX分布を`calculateDxDistribution`から注入し、`dx` JSONをロードしない。反復入力に対して同一クライアント内の直近32分布をLRUキャッシュする。
- 実ブラウザ測定では現行最大ケースのメインスレッド実行がウォーム最大11.8 msで60 Hzの16.7 ms枠内に収まり、Long Taskも観測されなかったため、現時点でWeb Workerは本番導入しない。
- 公開済み`dx` JSONは参照・回帰検証用として残し、本番の配信経路から削除する判断は別変更で行う。

### 完了条件

- 現行入力範囲ではメインスレッド直接実行を採用し、対応範囲を拡張する場合にWorker切替条件を再評価する
- Python生成器および現行JSONとの全列挙比較テストを用意する
- `shihai`、クリティカル値、ダイス数の境界条件と数値誤差を検証する
- 採用した計算方法と教科書および開発者向けアルゴリズム文書の説明が一致している
- `dx`用JSONを参照・回帰検証用として維持する

## `dr`と`kazanari`をブラウザ内でオンデマンド計算する

- 状態: 固定4096/2048の本番移植と実ブラウザ検証を完了し、可変FFT・出力長のRuntimeDamageRollCalculator/Worker第1単位も完了。本番配信からの`dr`用JSON除外とDamage経路接続は未完了
- 優先度: 高
- 作業ブランチ: 実験・検証は`codex/runtime-dr-experiment`、本番移植は`codex/runtime-dr-production`
- 対象:
  - `src/data/DamageCalculator.js`
  - `src/data/FFT.js`
  - `src/data/PrecomputedDataRepository.js`
  - `generator/src/dx_precompute/dr.py`
  - `public/data/schema-v2/revision-1/dr/`
  - 新規のJavaScript実行時ダメージロール計算器とベンチマーク

### 目的

現在のアプリは、`kazanari`ごとにダイス数0～202個の`dr`分布203本をJSONから取得し、命中達成値から決まるダメージダイス数の確率で混合します。ブラウザ内計算では203本を再生成せず、この混合分布を直接求めることで、`dr`用JSONの削減と対応ダイス数の拡張可能性を検討します。

### 候補アルゴリズム

- ダメージダイス数が`n`個になる命中確率を $w_n$ とし、$W(s)=\sum_n w_ns^n$ を作る
- `kazanari=0`では、1D10の確率母関数を $D(z)$ として混合分布を $W(D(z))$ で直接計算する
- `kazanari>0`では、最後に振り直される元の出目 $t\in\{1,\ldots,5\}$ とそれより小さいダイス数で排他的に場合分けする
- $E_r(s)=W^{(r)}(s)/r!=\sum_{n\ge r}\binom{n}{r}w_ns^{n-r}$ を0階から`kazanari - 1`階まで拡張Horner法で同時に評価し、ダイス数ごとの二項係数付き混合をまとめる
- 既定長4096のFFT周波数点で上記の式を評価し、optionsで指定された有限supportを保持できる2の冪へ変更可能とする。最終的な混合分布だけを逆FFT 1回で復元する
- 実数分布の共役対称性を使って半分の周波数点だけを計算し、型付き配列の再利用と複素数演算のインライン化で一時オブジェクトを削減する

### 予備調査

- Node.jsのV8上での未最適化のJavaScript試作では、ダイス数0～202個の任意の重み付き混合分布を`kazanari=0`で約2.8 ms、`kazanari=3`で約32.5 ms、`kazanari=9`で約55.1 msで計算できた
- 型付き配列とインライン複素数演算を使う最適化版では、Node.js上で`kazanari=0`が約0.87 ms、`kazanari=3`が約20.55 ms、`kazanari=9`が約44.24 msとなった
- Windows x64のChrome 150ではメインスレッド中央値が`kazanari=0`で約0.9 ms、1で約15.1 ms、2で約16.9 ms、9で約44.5 msとなり、60 Hz表示の1フレームに相当する約16.7 msを`kazanari=2`から超えた
- 同じChrome環境のmodule Workerでは既定2048要素の分布転送を含む往復増分が中央値で概ね0.1～0.3 msに留まった。可変出力長でもtransferable配列とrequest単位のcache/dedup契約を維持する
- Workerクライアントの重複排除、LRUキャッシュ、呼び出し単位の中断、障害後の再生成を独立テストで検証し、`kazanari=0/3/9`では防御適用後の最終ダメージ分布も現行JSON経路と最大絶対差 $2\times10^{-6}$ 以内で一致した
- Codex In-app BrowserのVite production previewで`kazanari=0/3/9`、固定値の正負、防御ダイス、連続入力、一般判定、バックトラックを確認し、Workerチャンクの取得は同一URLの1件、`dr`用JSONの取得は0件、console warning/errorは0件だった
- 公開済みJSONから作った同じ混合分布との最大差は約 $1.4\times10^{-7}$ であり、個別分布の代表比較では約 $5.4\times10^{-7}$ だった
- FFT由来の負値は絶対値 $10^{-15}$ 程度に収まった
- 現行の`dr`アセットは10ファイルで非圧縮約4.02 MiB、gzip圧縮約0.83 MiBであり、1ファイルのJSON解析と転置は約2.3～2.5 msだった
- 読み込み済みJSONを使う現行方式よりCPU計算は重くなるが、初回のネットワーク取得、配信サイズ、キャッシュメモリを含めるとオンデマンド化に検討価値がある

### 実装計画

1. 文書作業と分離した`codex/runtime-dr-experiment`ブランチで、本番コードから独立した数式リファレンス実装、型付き配列による最適化実装、ベンチマークを追加する
2. 単一のダイス数だけに重みを置いた全組み合わせにより、`n=0～202`と`kazanari=0～9`の2030分布がPython生成器および現行JSONと許容誤差内で一致することを検証する
3. 複数のダイス数を含む混合分布、`kazanari>=n`、最大入力、総和、負値、オーバーフローバケットを独立にテストする
4. Chrome、Firefox、Safariと低速なモバイル相当環境で、`kazanari=0`、中間値、9の応答時間、メモリ、メインスレッドの停止時間を測定する
5. ブラウザ内Web Workerの必要性と切り替え条件を決め、必要な場合は静的Pages構成を維持したまま導入する
6. 現在の入力範囲を対象として、`DamageCalculator`を`dr`全体の表を参照する方式から、命中確率をダメージダイス数ごとに集約して混合分布生成器へ渡す方式へ変更する
7. 既存の実行時ルールテストと新旧経路の比較テストを成功させ、パフォーマンス目標を満たした後にだけ初期読込みと`dr`用JSONを削除する
8. 入力範囲を拡張する場合は、入力から表示範囲、中間計算範囲、FFT長、推定計算時間、推定メモリ使用量を求める範囲決定処理を追加する
9. 達成値を表示用の最終バケットへ集約する前にダメージダイス数ごとの重みへ変換し、広い分布の計算範囲とグラフの描画点数を分離する
10. 採用した式と実装に合わせて、教科書、事前計算アルゴリズム、実行時計算アルゴリズム、アーキテクチャの各文書を更新する

### 判断条件

- メインスレッドで許容できる最大応答時間、Web Workerを使う場合の最大応答時間、対応端末の性能下限を事前に定める
- 数値誤差、メモリ使用量、実装複雑度、配信サイズの比較に基づき、全オンデマンド化、`kazanari=0`だけのオンデマンド化、現行JSON維持のいずれかを選ぶ
- 対応ダイス数や固定値を拡張する場合は、[判断記録](../experiments/runtime-dr/decision.md#入力範囲と分布範囲に関する判断)に従い、入力範囲、表示範囲、中間計算範囲、FFT長を一体として設計する
- 判定の無限尾部に対する総打ち切り誤差と各計算段階への誤差予算を定め、固定長をより大きな固定長へ置き換えるだけの拡張は行わない
- 警告範囲と安全上限は、入力値そのものだけでなく、推定計算時間と推定メモリ使用量に基づいて決定する
- オンデマンド化を採用しない場合も、導出、ベンチマーク、不採用理由を開発者向け文書に残す

### 完了条件

- 全列挙比較、数値監査、実行時ルールテストが成功する
- 対応ブラウザと端末性能の下限でパフォーマンス目標を満たす
- 不要になったJSON、キャッシュ、初期読込み、スキーマ参照が残っていない
- ゲームルール、数式、実装、テスト、教科書と開発者向け文書が同じ計算方法を説明している

### Damage dynamic range 第2-B

- 完了: `RangePlanner`と実験plannerのDamage境界、異長防御差分布のFFT、境界テスト、契約文書を更新した
- 完了: `DamageCalculator`と`CalculationClient`へ`DamageRangePlan`を接続し、raw分布長、provider options、防御support、`defenceFftLength`、公開1024要素へのcollapseを動的化した
- 継続: total damageのresource guardと将来のdynamic output契約、JSON経路、入力上限。バックトラック配列のplan接続は第2-Dで完了

### Dynamic distribution range Phase 2-C

- 完了: `CalculationFeedback`の共通formatter/request runnerを追加し、`CalculationClient`の`onRangePlan`をUIへ伝播した
- 完了: check、attack、backtrackでwarningの理由、推定時間、推定メモリ、該当するoverflow下限を日本語表示し、hard rejectを結果なしの画面状態へ反映した
- 完了: request token、AbortError除外、アンマウント時の無効化により、連続入力の古いwarning/error/resultが新しい入力を上書きしないようにした
- 完了: attackの合計damageに専用generation/readyを持たせ、個別結果の追加・削除・reject、stale result、合計計算エラー、アンマウントで古い合計を表示しないようにした。未知の計算エラーは内部詳細を漏らさず日本語の再入力案内へ変換する
- 完了: `onRangePlan`を同期callback契約としてJSDoc、文書、実行順テストで固定し、UI runnerの外部`signal`はrunner所有signalと合成する
- テスト: component mount依存を増やさず、状態層テストで複数comboのaggregate ready、generic error、initial reject、stale/unmount、signal合成を固定した。残余リスクは実ブラウザでのVuetify/Chart.js描画と入力イベントの結合確認、およびresource guard・dynamic output契約である
- 継続: 公開1024 bucketの最終ラベル・確率をチャート上で個別表示すること、入力上限、JSON経路、resource guardと将来のdynamic output契約

### Dynamic distribution range Phase 2-D

- 完了: `RangePlanner.backtrack`の`workingMax`、`workingLength`、`fftLength`を`BacktrackCalculator`へ明示的に渡し、runtime optionsと計画を別引数として`CalculationClient`から伝播した
- 完了: 1024要素を超える計画では、通常D10の和を有限support DPで生成し、《屍人》は`sum - max + 1`の専用DPで生成する。1024要素以内は完全supportがアセット内に収まる場合だけ既存アセットを展開する
- 完了: 計画経路で末尾アセットbucketを下流の閾値判定へ流さず、有限support全体を分類してから既存の公開結果形状へ変換する。配列長、有限性、非負性、確率総和、事前に定義された`fftLength=0`を検証する
- 完了: 既存アセットのsupport境界は`assetOverflow`の静的coverage metadataとして計画に残し、完全supportを生成できるon-demand経路ではstatic asset warningを表示しない。実計算結果のoverflow、通常planner policy、core絶対安全上限を分離する
- 完了: planなし経路、1024要素の公開結果、既存入力範囲、cancel/staleのrequest runner契約を維持し、JSON削除、入力上限拡張、full-tail、total damageのdynamic outputは対象外とした

### Dynamic distribution range Phase 2-E

- 完了: `benchmark-phase2e.mjs`でNode `v22.23.2`の18ケースを測定し、13ケースを実測、5ケースをplanner-onlyまたはcore cap理由でskip、エラー0を確認した。warmup 2回、warm 7回の結果は[`experiments/dynamic-distribution-ranges/decision.md`](../experiments/dynamic-distribution-ranges/decision.md)へ記録した
- 完了: Chrome `151.0.0.0`相当のWindows環境でブラウザ12ケースを実測し、エラー0、Long Task 0、数値異常0、Worker resource timingの利用不可4件を診断上のunavailableとして分類した。DR/attackのWorker telemetryは各`createdCount=1`で、cold値に生成と初回要求を含めた
- 完了: `mainThreadTimerDelayApproxMilliseconds`をCPU時間ではなくzero-delay timer遅延の近似として文書化し、短時間ケースの約4–5 ms下限をtimer clamping・スケジューリングの特性として扱った
- 完了: 通常buildの`dist/`と専用buildの`dist-dynamic-distribution-ranges/`を分離し、Phase 2-Eの新規JSON結果を保存・Git追跡しない方針を[`experiments/dynamic-distribution-ranges/README.md`](../experiments/dynamic-distribution-ranges/README.md)へ記録した
- 完了: 現行入力上限はこの作業単位では変更しないと判断した。拡張はplanner warning/hard reject、dynamic outputと公開出力契約、resource guardを組み合わせ、複合入力の推定時間・メモリで段階的に制御する
- 引継ぎ: Firefox/WebKitのengine差とChrome 4xのrenderer CPU条件はPhase 2-Fで測定済み。低速実機、入力拡張候補のブラウザ実測、dynamic output/resource guard/JSON経路を検証した後に具体的なUI入力上限を判断する

### Dynamic distribution range Phase 2-F

- 完了: Playwright `1.62.1`をdevDependencyへ追加し、`package.json`と`package-lock.json`を更新した。指定Node `v22.23.2`で`npm install --save-dev playwright`を実行した
- 完了: `npx playwright install firefox webkit`でFirefox `153.0`（revision `v1538`）とWebKit `26.5`（revision `v2336`）だけを取得した。ダウンロード表示はFirefox 119.9 MiB、WebKit 59.6 MiBで、取得後directoryはFirefox 352,898,025 bytes、WebKit 177,304,497 bytes、合計530,202,522 bytes（505.6 MiB）だった
- 完了: [`playwright-runner.mjs`](../experiments/dynamic-distribution-ranges/playwright-runner.mjs)を追加し、専用Viteの起動・停止、Firefox、WebKit、Chrome channelの順次実行、ChromeだけのCDP 4x、page/context/profile/CDP cleanup、標準出力JSON、engine単位の明示的失敗を再現可能にした。`--no-sandbox`は使用していない
- 完了: Firefox `153.0`、WebKit `26.5`、Chrome `151.0.7922.108`で同じ`browser: true` 12ケースを各12/12成功させた。page errorと数値検証エラーは各0件、Firefox/WebKitはLong Task APIなし、Chrome 4xはLong Task 50件（最大154 ms）、Worker resource timing unavailableは4件だった
- 完了: 代表値はFirefoxのmain warm median/p95最大34/40 ms・Worker cold/warm p95最大56/36 ms、WebKitの15/24 ms・38/19 ms、Chrome 4xの129.5/132.8 ms・74.8/31.5 msだった。timer-delay warm p95最大は40/24/134.2 msで、CPU時間ではなくzero-delay timer遅延近似として記録した
- 完了: 入力拡張候補の`dx-two-x-planner-only`、`dx-large-planner-only`、`dx-hard-reject-planner-only`、`dr-over-core-cap`、`attack-two-x-planner-only`はcore capを変更せずplanner-onlyに維持し、`backtrack-large-normal-node-only`はNode-onlyとしてブラウザ測定から除外した
- 継続: dynamic output、resource guard、JSON経路、低速実機、入力拡張候補のブラウザ実測は残課題とし、今回の3 engine実測だけでは本番core cap、UI入力上限、配信JSONを変更しない

## Dynamic distribution range Phase 2-G

- 完了: `src/application/ResourceGuard.js`にcapacity 64 MiB、maxActive 4、maxQueued 32、1.5倍切上げ予約、FIFO待機、queued abort、typed rejection、snapshot/diagnostics、idempotent lease releaseを実装し、`CalculationClient`のcheck、attack、backtrackとattack total damageへ共有guardを接続した
- 完了: preflight hard reject後かつアセット読込・計算開始前の予約、成功・cancel・stale・repository error・Worker error・同期例外の単一finally解放、複数CalculationClient共有、既存AbortSignalによるstale queued request除去をテストした
- 完了: `CalculationFeedback`と`RangePlanNotice`でresource rejectのcapacity超過・queue満杯を通常の未知エラーに隠さず表示する最小接続を追加した
- 対象外: owner replace policy、入力上限、RangePlanner hard policy、core absolute safety limit、JSON経路、dynamic output、RuntimeDamageRollClient内部の重複guardは変更しない

## Dynamic distribution range Phase 2-H

- 完了: `src/calculation/DistributionResult.js`にversion 1のcanonical distribution result、explicit max導出、finite/infinite support、exact/upper-bound overflow、centralized mass tolerance、typed validation errors、mass summaryを追加した
- 完了: factoryは入力ArrayLikeのvaluesを一度だけFloat64Arrayへコピーしてresult所有bufferを直接公開し、metadataをfreezeした。TypedArray要素はfreezeせず、書き込み可能なcopyは`copyDistributionValues(result)`で明示取得するため、copy-on-readのO(n)割り当てを行わない
- 完了: 現行1024 published bucketとのadapterを追加し、supportの明示要求、1023末尾bucketのexact overflow化、exact overflowの安全なfold、upper-bound projection拒否、欠落した個別値を復元できないlower bound投影のtyped拒否、offset・可変長・finite/infinite境界をテストした
- 完了: `tests/distributionResult.test.js`で正常系、invalid number、NaN、負値、mass、support、exact/upper-bound、mutation、round-trip、overflow folding、unsafe projection rejectionを固定した
- 対象外: 既存calculator、`CalculationClient`、UI戻り値、JSON asset経路、Worker serialization、入力上限、現行1024 bucketの解釈、metadata-aware演算、dynamic outputのproduction接続は変更しない
- 次段階: 各計算経路のcanonical result生成地点、support metadataとoverflow証明の伝播、JSON・Workerのserialization、公開結果とUIをcanonical契約へ切り替える条件を設計・検証する
- 完了: `calculateCanonicalDamageOnDemand`をopt-in pure calculation APIとして追加し、acceptedなtop-level attack planと`published-bucket` score propagationを必須化した。damage subplanだけの入力と未実装の`full-tail`は明示的に拒否する
- 完了: DR hit mass `H`を条件付き正規化せずproviderへ渡し、failure mass `F`と分離して、防御・fixed shift・failure合成後だけ`F + H = 1 ± 1e-8`と`DistributionResult`のmassを検証する。既存planned APIと共通のcollapse前helperを使い、provider、防御、shift、failure合成を一度だけ実行する
- 完了: published-bucket score由来のmodeled supportをfinite、未打切りDX sourceをinfiniteとしてmetadataで分離し、score tail certificateをoverflowへ加算せず防御コピー・freezeした。modeled support max式、最終damage座標のoverflow lower bound、末尾ゼロの除外、既知massとraw overflowのexact合算、null/exact overflowを専用テストで固定した
- 対象外: `CalculationClient`、UI、RuntimeDamageRoll Client/Worker protocol、cache、transfer、JSON、total damage、入力上限、full-tail、公開dynamic outputは変更しない
- 次段階: canonical resultのconsumer、Worker・JSON serialization、既存1024結果から公開結果・UIを切り替える互換境界を設計・検証する
- 完了: `createCalculationClient()`へopt-inの`calculateAttackCanonical(params, options = {})`を追加し、既存`calculateAttackCombo`の戻り値と既定動作を維持した
- 完了: canonical pathを既存attackと同じsnapshot、RangePlanner preflight、`onRangePlan`、ResourceGuard lease、abort/stale確認、score計算へ接続し、acceptedなtop-level attack plan、DR/D10 provider、`onFftLength`、runtime optionsを伝播した
- 完了: 第3単位時点のcanonical戻り値を`{ score, scoreSummary, canonicalDamage }`に限定し、pure APIのfreeze済み`{ result, metadata }`を保持した。第4単位で`canonicalDamageSummary`を追加したが、legacy calculator、`damage`、`damageSummary`、`getDamageSummary`はcanonical pathで呼び出さない
- 対象外: canonical consumerのUI接続、既存公開結果、RuntimeDamageRoll Client/Worker protocol、JSON serialization、`getTotalDamage`、入力上限、full-tail、公開dynamic outputは変更しない
- 次段階: canonical resultを利用するconsumer、Worker・JSON serialization、公開結果・UIへの移行条件、total damageとのsupport metadata境界を設計・検証する
- 完了: `DistributionResult.js`にoffset込みの明示一次モーメントとoverflow-awareな`getExpectedValueSummary`を追加し、exact・bounded・lower-boundのJSON-safe unionを返すようにした
- 完了: `overflow: null`、exact overflowのfinite/infinite support、`p=0`、`lowerBound === support.max`、upper-bound overflowの`q=0`、finite/infinite supportを期待値summaryの専用テストで固定した
- 完了: overflowの`errorBound`を期待値区間へ加算せず既存mass summaryのmetadataとして伝播し、summaryの再帰freeze、入力・values非変更、invalid入力をテストした
- 完了: `getCanonicalDamageSummary`をcanonical damage envelopeの薄いadapterとして追加し、`{ expectedValue, mass }`を返して`calculation/index.js`と`CalculationClient`の`canonicalDamageSummary`へ接続した。canonical pathからlegacy summary、legacy adapter、UI、Worker、JSON、total damageは呼び出さない
- 対象外: 既存`getDamageSummary`、legacy/UI/total damage/Worker/JSON protocol、canonical result自体のserialization契約は変更しない

### Dynamic distribution range Phase 2-H 第5単位

- 完了: `sumCanonicalDamage(canonicalDamages, options = {})`を追加し、canonical damage envelopeだけを独立和として加算するpure coreを実装した。0件はdamage 0のidentity、1件は不要なFFTを省略し、複数件だけ完全線形畳み込みを行う
- 完了: 明示`values`はoffsetを加算した座標のまま保持し、異長配列を含む完全畳み込みを行う。空の明示配列が一つでもあれば明示結果は空とし、overflowのlowerBoundを一点massへ変換しない
- 完了: finite modeled/source supportのsafe integer加算、infinite伝播、exact/null/upper-bound overflowの独立union、mixed時のexact-only lower bound、source errorBoundとFFT mass driftの補助metadataを実装した。upper-boundはFFT後の明示mass不足も上界へ含める
- 完了: `src/data/FFT.js`のprivate線形畳み込みを異長対応の公開`convolveDistributions` helperとして整理し、旧公開aliasは残さず、既存`sumDistribution`・`subDistribution`の公開挙動を維持した。`onFftLength`、AbortSignal、FFT stage境界のabort確認を伝播する
- 完了: result/metadataとcomponent descriptorsをfreezeし、入力envelope/result/valuesを変更しない。metadataには`aggregation: 'independent-sum'`、`independence: 'assumed'`、support、overflow lower bound、aggregation error boundを残す
- 完了: values/FFTは`1 << 20`、componentは`1 << 12`、resourceは512 MiBを絶対安全上限とし、persistent bytes（component、inspected、steps、descriptors、metadata、output）と各FFT peakの合計をguardする。canonical option名以外を拒否し、optionsで下げられるが緩和できないようにした。invalid envelope/options、index overflow、resource limit、numerical failure、abortをtyped error codeで識別する
- 対象外: `CalculationClient`、UI、legacy `getTotalDamage`、combo ViewModel、Worker/JSON protocol、display再集約、total summary、公開dynamic outputは変更しない
