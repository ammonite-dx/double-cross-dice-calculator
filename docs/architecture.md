# アーキテクチャ

このアプリはCloudflare Pagesで配信する静的SPAです。サーバー側の計算やデータベースを必要とせず、事前計算済み確率分布の取得と追加計算をブラウザ内で行います。

## モジュール境界

- `src/calculation/ScoreCalculator.js`: 一般判定・対決判定の達成値と成功率を計算するコア
- `src/calculation/DamageCalculator.js`: ダメージ、期待値、複数コンボの合計を計算するコア
- `src/calculation/BacktrackCalculator.js`: バックトラック後の侵蝕率を計算するコア
- `src/application/CalculationClient.js`: UI向けの非同期canonical計算境界、実行時DX計算器の注入、AttackのD10遅延読込、常駐runtime damage Workerの組み立て
- `src/data/*Calculator.js`: canonical計算のproviderと、比較・移行用に保持するlegacy計算ラッパー
- `src/data/Distribution.js`: 疎な分布の展開、期待値、上側確率などの共通処理
- `src/data/FFT.js`: 独立な確率分布の加算・減算
- `src/data/PrecomputedDataRepository.js`: 静的アセットの取得、検証、キャッシュ

現行productionの`CalculationClient`はScoreとBacktrackのcanonical計算コア（`src/calculation/ScoreCalculator.js`、`src/calculation/BacktrackCalculator.js`）を直接参照する。`src/data/ScoreCalculator.js`と`src/data/BacktrackCalculator.js`を含むdata wrapperは、比較・migration用に維持する。

Vueコンポーネントは入力状態と表示を管理し、`CalculationClient`だけを介して確率計算を利用します。`src/calculation/`の計算コアはVue、DOM、`fetch`、静的アセットの配置に依存せず、必要な分布は引数で渡される関数から取得します。

各計算モジュールが事前計算済み分布へ加える処理は[`runtime-calculation-algorithms.md`](./runtime-calculation-algorithms.md)に記載しています。

## データフロー

```text
validated input / latest-wins runner / async view setup
          |
          v
CalculationClient
  snapshot -> runtime DX / (Attack: lazy D10 when defence dice > 0) -> canonical calculate
          |
          v
runtime DX calculator / lazy D10 repository / RuntimeDamageRollClient
  generate in main thread / fetch only when needed / validate -> cache or DR Worker
          |
          v
calculation core
  score + on-demand damage finalization
          |
          v
resident RuntimeDamageRollClient -> RuntimeDamageRollWorker
  weights + kazanari -> runtime damage-roll distribution
          |
          v
reactive view state -> Chart.js
```

計算routeには`CalculationClient.prepare`やroute guardのpreloadを置かず、各canonical runnerがvalidated snapshotを受けてlatest-winsで実行します。通常のCheckは`calculateDxDistribution`によるruntime DXだけを使います。Attackは同じruntime DXに加えて防御側damage diceが1以上のときだけ計算時に`d10`をlazy loadし、damage-roll distributionは常駐`RuntimeDamageRollClient`からDR Workerへ依頼します。Backtrackは完全on-demandのcanonical generatorを使い、`d10`・`livingdead` assetを読みません。連続した入力変更では古い非同期計算結果で新しい入力結果を上書きしないようにします。

`dr`の配信形式は圧縮効率を優先したダイス数ごとの疎な分布で、旧`src/data/DamageCalculator.js`経路と適合テストの参照用に保持します。本番の`CalculationClient`は`dr`をロードせず、攻撃ごとのweightsと`kazanari`を常駐`RuntimeDamageRollClient`へ渡してWorker内でダメージロール分布を計算します。Workerの結果は計算コアが固定値、d10防御ダイス、命中失敗を合成して画面向けの結果に仕上げます。

判定とダメージの中間計算は2048要素で行い、画面へ返す直前に1024要素へ集約します。公開結果のインデックス1023は値1023以上を表します。この決定の根拠と厳密性の境界は[`ADR 0001`](./adr/0001-expanded-working-distributions.md)を参照してください。

## 事前計算データ

事前計算データは`public/data/schema-v{schemaVersion}/revision-{dataRevision}/`に配置し、アプリ本体と同じデプロイから配信します。ファイル名に内容ハッシュは付けず、変更時は`dataRevision`を更新します。同一リビジョンのファイルは変更せず、長期キャッシュの対象にします。

現在の配信データはschema-v2/revision-1です。schema-v1の旧データは比較用として`reference-data/`に保持し、Pagesの配信対象とアプリの参照先から除外します。詳しいスキーマ、ダイス数範囲の根拠、更新手順は[`precomputed-data.md`](./precomputed-data.md)、計算方法は[`precomputation-algorithms.md`](./precomputation-algorithms.md)を参照してください。

## 旧実装との比較

分離前の計算実装は`tests/legacy/LegacyCalculator.js`に回帰比較専用で残しています。本番コードから参照してはいけません。Python生成器自体は独立参照実装と6桁丸めの最小単位`0.000001 + 1e-12`以内で比較し、1024要素から2048要素への表現変更を含む旧実装との回帰比較では保存データの検証許容誤差`0.0002`未満を要求します。

すべての移行テストが十分な期間安定し、新実装側の境界値テストで同等の範囲を直接カバーできた段階で、旧実装と重複する生成元データの整理を別変更として行います。

## 検証の分担

事前計算器の数式、丸め、生成範囲は[`precomputation-validation.md`](./precomputation-validation.md)に従って検証します。JavaScriptが事前計算済み分布へ加える技能値、成功判定、ダメージ軽減、バックトラック区分のアルゴリズムは[`runtime-calculation-algorithms.md`](./runtime-calculation-algorithms.md)、独立テストは[`runtime-rule-validation.md`](./runtime-rule-validation.md)に記載しています。

移行比較テストは旧実装から意図せず結果が変わっていないことを確認するために使用します。独立テストはルールから期待値を直接作り、旧実装と現行実装が同じ誤りを持つ場合にも検出できることを目的とします。

`tests/calculationClient.test.js`はcanonical operation surface、public Backtrack planと実行時planの一致、runtime DX、AttackのD10 lazy load、Check summary、Backtrackのasset非依存を検証します。`tests/calculationClientIntegration.test.js`はcanonical clientのCheck/Attack/Backtrack、latest-wins、resource lease、D10 lazy load、DR Worker、canonical totalの境界を検証します。旧JSON・legacy coreとの数値比較、migration、asset equivalenceは専用の下位テストが担当し、削除済みの`CalculationClient.prepare`やlegacy client APIを前提にしません。

## 計算実行境界

計算ロジックはVue、ブラウザ、HTTP、Cloudflare固有APIに依存しない計算コアへ分離しています。UIは非同期の`CalculationClient`だけを呼び出し、アプリケーション層が`calculateDxDistribution`を判定計算コアへ、Attackで必要になったときだけ`d10`をlazy loadし、常駐`RuntimeDamageRollClient`の`calculate`をDR providerとして注入します。Backtrackのcanonical producerはlegacyの`d10`・`livingdead` providerを参照せず、要求範囲をruntime生成します。DXの通常計算はメインスレッドで行い、ダメージロールのFFT本体だけをWorkerチャンクで実行します。固定値、d10防御ダイス、命中失敗の合成は計算コアで行います。公開`dx` JSONと下位legacy assetsは参照・回帰検証用に保持します。

公開サイトは当面、Cloudflare Pages上の静的SPAとブラウザ内Web Workerを維持します。外部HTTP APIとMCPは同じ計算コアを再利用する将来の提供手段とし、サイトをAPI専用ビューワーへ変更することとは分けて判断します。

この決定の理由、Cloudflare上の構成、段階的な導入順序は[`ADR 0002`](./adr/0002-separate-calculation-core.md)に記載します。
