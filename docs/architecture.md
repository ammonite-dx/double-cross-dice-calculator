# アーキテクチャ

このアプリはCloudflare Pagesで配信する静的SPAです。サーバー側の計算やデータベースを必要とせず、必要なruntime計算をブラウザ内で行います。DXとD10はメインスレッド、DRのFFT本体はRuntimeDamageRollWorker、Backtrackはruntime coreで実行し、全計算を一律Workerへ移すことは現行方針にしません。

## モジュール境界

- `src/calculation/ScoreCalculator.js`: 一般判定・対決判定の達成値と成功率を計算するコア
- `src/calculation/DamageCalculator.js`: ダメージ、期待値、複数コンボの合計を計算するコア
- `src/calculation/BacktrackCalculator.js`: バックトラック後の侵蝕率を計算するコア
- `src/application/CalculationClient.js`: UI向けの非同期canonical計算境界、実行時DX/D10計算器の注入、常駐runtime damage Workerの組み立て
- `src/calculation/D10Calculator.js`: 通常D10合計の完全有限supportを生成するruntime primitive
- `src/calculation/RuntimeDamageRollCalculator.js`: `kazanari`を含むDRのruntime生成とFFT境界
- `src/data/Distribution.js`: 疎な分布の展開、期待値、上側確率などの共通処理
- `src/data/FFT.js`: 独立な確率分布の加算・減算
- `src/data/ReferencePrecomputedDataRepository.js`: テスト・独立比較用の公開asset取得、検証、cache
- `src/data/PrecomputedDataSchema.js`: 公開assetのschemaと分布検証

現行productionの`CalculationClient`はScore、Damage、Backtrackのcanonical計算コアを直接参照する。公開assetのReference repositoryはproduction経路へ注入せず、テストと独立比較に限定する。

Vueコンポーネントは入力状態と表示を管理し、`CalculationClient`だけを介して確率計算を利用します。`src/calculation/`の計算コアはVue、DOM、`fetch`、静的アセットの配置に依存せず、必要な分布は引数で渡される関数から取得します。

Phase 8の棚卸しでは、ファイル単位で削除を判断せず、`src/components/Attack/ChartSetter.js`、`src/data/Distribution.js`、`src/data/FFT.js`のようなmixed-use moduleをexport/symbol単位で分類します。canonical adapter、Distribution/FFTのproduction symbolを残し、published-bucket互換がテストで必要な場合だけそのsymbolを保持します。

各計算モジュールが事前計算済み分布へ加える処理は[`runtime-calculation-algorithms.md`](./runtime-calculation-algorithms.md)に記載しています。

## データフロー

```text
validated input / latest-wins runner / async view setup
          |
          v
CalculationClient
  snapshot -> runtime DX + runtime D10 -> canonical calculate
          |
          v
runtime DX calculator / runtime D10 calculator / RuntimeDamageRollClient
  generate in main thread / validate -> cache or DR Worker
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

計算routeには`CalculationClient.prepare`やroute guardのpreloadを置かず、各canonical runnerがvalidated snapshotを受けてlatest-winsで実行します。通常のCheckは`calculateDxDistribution`によるruntime DXだけを使います。Attackは同じruntime DXに加えて防御側のD10合計も`D10Calculator`で生成し、damage-roll distributionは常駐`RuntimeDamageRollClient`からDR Workerへ依頼します。Backtrackは完全on-demandのcanonical generatorを使い、公開assetを読みません。連続した入力変更では古い非同期計算結果で新しい入力結果を上書きしないようにします。

`dr`の配信形式は圧縮効率を優先したダイス数ごとの疎な分布で、generatorの出力検証と独立比較の参照用に保持します。本番の`CalculationClient`は`dr`をロードせず、攻撃ごとのweightsと`kazanari`を常駐`RuntimeDamageRollClient`へ渡してWorker内でダメージロール分布を計算します。Workerの結果は計算コアが固定値、d10防御ダイス、命中失敗を合成して画面向けの結果に仕上げます。

canonicalの判定とダメージの中間計算は、要求windowとsupportに合わせて`RangePlanner`と`ResourceGuard`が計画する動的working rangeで行います。legacy published projection・compatibilityでは1024 bucketを使い、インデックス1023は値1023以上を表しますが、これはcanonical resultや最終表示の上限ではありません。この決定の根拠と厳密性の境界は[`ADR 0001`](./adr/0001-expanded-working-distributions.md)を参照してください。

## 事前計算データ

事前計算データは`public/data/schema-v{schemaVersion}/revision-{dataRevision}/`に配置し、アプリ本体と同じデプロイから配信します。ファイル名に内容ハッシュは付けず、変更時は`dataRevision`を更新します。同一リビジョンのファイルは変更せず、長期キャッシュの対象にします。

現在の配信データはschema-v2/revision-1です。旧schema-v1とdense JSONはPhase 8-2G9で退役し、必要な場合はGit履歴を参照します。詳しいスキーマ、ダイス数範囲の根拠、更新手順は[`precomputed-data.md`](./precomputed-data.md)、計算方法は[`precomputation-algorithms.md`](./precomputation-algorithms.md)を参照してください。

## 旧実装との比較

分離前の計算実装と旧比較データはG7～G9で退役し、Git履歴にのみ残しています。現在のPython generatorはschema、manifest、数値監査、シミュレーションで検証し、JavaScript側はcanonical rule／range／resourceテストで検証します。published-bucket互換が必要な箇所は、独立したadapterテストで挙動を固定します。

過去の移行テストは削除済みです。新しいルールやデータ形式を追加する場合は、旧実装を再導入せず、独立した期待値、generator検証、canonical runtimeテストを同じ変更単位で追加します。

## 検証の分担

事前計算器の数式、丸め、生成範囲は[`precomputation-validation.md`](./precomputation-validation.md)に従って検証します。JavaScriptが事前計算済み分布へ加える技能値、成功判定、ダメージ軽減、バックトラック区分のアルゴリズムは[`runtime-calculation-algorithms.md`](./runtime-calculation-algorithms.md)、独立テストは[`runtime-rule-validation.md`](./runtime-rule-validation.md)に記載しています。

移行比較の過去証跡はGit履歴に保持します。現行の独立テストはルールから期待値を直接作り、旧実装と現行実装が同じ誤りを持つ場合にも検出できる構成です。

`tests/calculationClient.test.js`はcanonical operation surface、public Backtrack planと実行時planの一致、runtime DX/D10、Check summary、Backtrackのasset非依存を検証します。`tests/calculationClientIntegration.test.js`はcanonical clientのCheck/Attack/Backtrack、latest-wins、resource lease、runtime D10、DR Worker、canonical totalの境界を検証します。公開assetとの数値照合はReference repositoryとgeneratorの検証が担当し、削除済みの`CalculationClient.prepare`やlegacy client APIを前提にしません。

## 計算実行境界

計算ロジックはVue、ブラウザ、HTTP、Cloudflare固有APIに依存しない計算コアへ分離しています。UIは非同期の`CalculationClient`だけを呼び出し、アプリケーション層が`calculateDxDistribution`と`calculateD10Distribution`を計算コアへ、常駐`RuntimeDamageRollClient`の`calculate`をDR providerとして注入します。Backtrackのcanonical producerは公開assetを参照せず、要求範囲をruntime生成します。DXと通常D10の計算はメインスレッドで行い、ダメージロールのFFT本体だけをWorkerチャンクで実行します。固定値、D10防御ダイス、命中失敗の合成は計算コアで行います。公開schema-v2 assetはgeneratorの照合と独立検証用に保持し、旧dense JSONとschema-v1 assetは退役済みです。

公開サイトは当面、Cloudflare Pages上の静的SPAと、DXメインスレッド・DR `RuntimeDamageRollWorker`・Backtrack runtime coreに分けたブラウザ内計算を維持します。低速端末や入力範囲の拡張で停止時間が許容できなくなった場合だけ、追加Worker化を性能測定に基づき再評価します。外部HTTP APIとMCPは同じ計算コアを再利用する将来の提供手段とし、サイトをAPI専用ビューワーへ変更することとは分けて判断します。

この決定の理由、Cloudflare上の構成、段階的な導入順序は[`ADR 0002`](./adr/0002-separate-calculation-core.md)に記載します。
