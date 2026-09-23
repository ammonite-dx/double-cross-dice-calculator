# アーキテクチャ

このアプリはCloudflare Pagesで配信する静的SPAです。サーバー側の計算やデータベースを必要とせず、必要な計算をブラウザ内で行います。DXとD10はメインスレッド、DRのFFT本体は`RuntimeDamageRollWorker`、Backtrackはruntimeの計算コアで実行します。全計算を一律Workerへ移す構成ではありません。

## レイヤーと責務

- `src/features/`: Check、Attack、Backtrackの入力snapshot、runner、画面状態、Vue UI
- `src/runtime/`: `CalculationClient`、`CalculationRequestCoordinator`、latest-wins、Abort、`ResourceGuard`、DR Workerの非同期境界
- `src/calculation/`: Score、Damage、Backtrack、D10、DX、DR、範囲計画の計算コア。汎用結果契約は`src/domain/`に置き、各計算の意味論はScore/Damageの境界モジュールに分ける。Damageの実行は`DamageAggregationCommon`、`DamageAggregationInspection`、`DamageAggregationPlanner`、`DamageAggregationExecutor`、`DamageAggregationMetadata`へ分離し、Backtrackは`BacktrackDistributionGenerator`、`BacktrackLivingdeadDistribution`、`BacktrackPlanValidation`と薄い`BacktrackCalculator`へ分ける。core/runtime間で共有する呼び出し契約は`CalculationRuntimeTypes`が所有する
- `src/core/probability/`: 配列分布、上側確率、FFTなどのVue非依存primitive
- `src/domain/`: 入力domain、Backtrack rules、`CertifiedValue`などの共有契約
- `src/types/`: feature間で共有する、domain意味論を持たない境界型
- `src/shared/`: validation、presentation、Chart.js adapter、themeなどの横断処理
- `tooling/reference-data/`: 歴史的JSONのschema、登録・検証・比較用repository

計算コアはVue、DOM、HTTP、Cloudflare API、静的アセットの配置に依存しません。必要な分布やDR providerは`CalculationClient`から注入します。production sourceから`tooling/reference-data`をimportすることは禁止しています。

## Production TypeScript

`src/`配下のproduction実装はTypeScriptへ統一し、Vue SFCのすべてのscript blockは`lang="ts"`を指定します。`tsconfig.json`はstrict modeで、JavaScriptを型検査対象へ取り込む`allowJs`を有効にしません。JavaScriptのtest、script、experiment、configurationは既存の実行環境に残し、通常の型検査からは分離します。型付きtest fixtureは`tests/**/*.ts`として型検査に含めます。

DR Workerは`RuntimeDamageRollWorker.ts`内で必要なmessage eventと`postMessage`だけを表すscope interfaceを定義します。main thread用TypeScript設定へWorker global libraryを追加せず、DOM側のglobal typeとWorker側のglobal typeを混在させません。`CalculationRuntimeTypes`は計算coreが必要とするruntime optionとprovider契約を所有し、coreからruntime layerへの型依存を作りません。

## データフロー

```text
validated input
  -> feature snapshot / latest-wins request
  -> Attack coordinator / committed calculation records
  -> CalculationClient
  -> reaction normalization: rolled / fixed / forced-failure Score resolution
  -> range preflight + ResourceGuard lease
  -> resolution-aware Score planner / producer
  -> runtime DX / D10 / DR Worker + calculation core
  -> DistributionResult / statistics
  -> display projection
  -> Chart.js materializer / Vue state
```

入力変更のたびにfeatureはvalidated snapshotを作り、`CalculationRequestCoordinator`経由で`CalculationClient`へ最新要求を渡します。古い要求のAbortまたは遅延完了は、request identityで結果commitから除外します。表示範囲の変更は計算結果を再利用できる場合と、範囲を拡張して再計算する場合をprojection plannerが判断します。

Attackでは、入力snapshotをcoordinatorが固定し、incremental executorが変更されたコンボだけを計算して、コンボレコードとtotalレコードを`AttackState`へ先にコミットします。表示はこのcommitted calculation snapshotから生成されるため、presentationや表示資源の失敗は計算レコードを失わず、表示範囲の変更・資源回復時には計算を再利用できます。score displayはdamageとは独立したrevisionを持ち、score-onlyの失敗やstale結果がdamage表示へ混入しないようにします。

## 計算実行境界

`CalculationClient`は、操作ごとに次の依存を組み立てます。

- Check: `DxCalculator`でDXを生成し、`ScoreCalculator`でScoreを生成する。`shihai=0`は最大値の累積分布、正の`shihai`は`DxOrderStatistic`の1DX tailと二項上側確率による順序統計量で生成する。ファンブル・自動失敗の分解と対決成功率は`ScoreOutcome`、期待値・成功率の統計値は`ScoreStatistics`が処理する
- Attack: Scoreと防御側D10をメインスレッドで計算し、DRの畳み込みを常駐`RuntimeDamageRollClient`へ渡す
- Backtrack: `BacktrackCalculator`が通常D10または《屍人》の分布をon-demand生成し、侵蝕率区分を計算する

Attackのリアクションは、入力モードを計算方法へ解決してからplannerとproducerへ同じresolutionを渡します。ドッジは`rolled-score`、《イベイジョン》は`fixed-score`、ガード・リアクション放棄は`forced-failure`です。固定値と強制失敗はDXのworking rangeやFFTを持たず、`offset`付き1点分布を生成するため、固定値の大きさに比例した配列を確保しません。

Scoreのtail certificateと期待値certificateの生成は`ScoreCertificates`、Scoreの出目結果分解と対決の疎なbucket走査は`ScoreOutcome`、表示用の統計値構築は`ScoreStatistics`に分離しています。`ScoreCalculator`はScoreのproducerとresolution dispatchだけを担当します。Backtrackの通常D10は共有D10 primitiveへ委譲し、《屍人》は`BacktrackLivingdeadDistribution`の状態DPで完全supportを生成します。`BacktrackPlanValidation`はplannerを再実行せず、入力・support・生成量・generation modeの整合性だけを検証します。

Damageでは、Scoreの明示範囲を命中・失敗の重みへ変換する処理を`DamageRollRequest`、DamageおよびTotal Damageの統計値を`DamageStatistics`、Score tailからDamage期待値certificateを組み立てる処理を`DamageExpectationCertificate`が担当します。複数Damageの集約は、入力envelopeの検査とcaller-owned配列のsnapshotを`DamageAggregationInspection`、FFT長・畳み込み手順・resource estimateを`DamageAggregationPlanner`、準備済みsnapshotのFFT実行と正規化を`DamageAggregationExecutor`、component descriptorと期待値certificateを`DamageAggregationMetadata`が担当します。`prepareDamageAggregation`は凍結された構造的planと実行closureを返し、planはResourceGuardへのresource見積りに、closureはlease取得後の実行に使います。`sumDamage`はこの二段階を隠したone-shot APIです。`DistributionResult`はこれらのDamage固有の意味論を持たず、分布の生成・検証・汎用統計だけを提供します。

DX providerは入力オブジェクトとoptionsを受け取り、要求された`workingLength`のdenseな`Float64Array`を返します。Yousei作業ブロック数とFFT長は`DxWorkingShape`で共有します。正の`shihai`で使う二項分布の項数とCPU work見積りは`DxOrderStatistic`が共有し、Scoreのrange plannerが`DxCalculator`をimportすることはありません。producerとplannerは同じ作業形状規則と順序統計量のコストモデルを参照します。

DX、D10、Backtrackは入力に必要な範囲を直接生成します。DR Workerは一度に1つのactive jobを処理し、同じ入力のsubscriberを共有します。最後のsubscriberが離脱したjobだけを停止し、遅延した旧Workerのイベントはidentity guardで無視します。

## 範囲計画と資源管理

`ScoreRangePlanner`、`DamageRangePlanner`、`BacktrackRangePlanner`は、requested display window、数学的support、working length、FFT length、CPU work、メモリ見積りを計画します。`ResourceGuard`は計画済みメモリとactive/queued requestを管理します。CPU workと絶対上限の検査は配列確保・FFT・Worker jobの開始前に行い、過大な入力はsilent truncationではなくresource rejectionになります。

Score planはresolutionのdiscriminated unionです。`rolled-score`だけが`workingLength`、`fftLength`、tail cutoff、DX feature compatibilityの制約を持ち、`fixed-score`と`forced-failure`は`operations=0`、`fftOperations=0`、有限supportの点分布として計画します。plannerとproducerのkindや固定値が一致しない要求は実行前に拒否します。

productionの計算範囲には、事前計算asset由来の`calculationMax`や1022／1023の固定境界を使用しません。有限supportは数学的最大値まで、無限supportはtail certificateと要求されたdisplay windowを満たす範囲まで計画します。DXの直接APIは`workingLength`を明示し、DRの既定FFT・出力長は入力supportから導出します。1024／2048の参照値は歴史的assetの検証に限って`tooling/reference-data/`から明示的に使用します。

中間配列の末尾へ未計算のtailを黙って集約しません。計算結果は[`result-contract.md`](./result-contract.md)の`DistributionResult`、support、overflow、certificateを保持し、表示層はそれを検査してからprojectionします。

## 表示と結果契約

`presentDistribution`は、計算coreの`DistributionResult`を検証し、可変な確率配列をpresentation所有のsnapshotへコピーする計算結果と表示の境界です。以降の`DistributionDisplay`、`DisplayRangePlan`、readyな`DistributionProjection`は、その境界を通過した内部DTOとして扱います。表示範囲・mode・policy・resource見積りの入力は各段階で検証しますが、下流で表示DTO全体を再検証・再コピーしません。readyなprojectionだけをChart.js adapterへ渡し、adapterはChart.js用オプションを検証してprojectionの値をdatasetへ借用します。百分率、桁丸め、チャートdatasetの生成はpresentationの責務であり、計算coreの確率値を変更しません。

期待値と成功率は`exact`、`bounded`、`lower-bound`などの証明状態を保持します。自動失敗・ファンブルの強制失敗確率と、通常の達成値0は別の意味を持ちます。詳細は[`result-contract.md`](./result-contract.md)を参照してください。

## 参照アセットとgenerator

過去のschema-v2/revision-1 JSONは`tooling/reference-data/assets/schema-v2/revision-1/`に保存します。これらはgeneratorの再生成照合、独立比較、reference testsのfixtureであり、production bundleへコピーされず、ブラウザから取得されません。generatorは`generator/`のPython 3.12/NumPy実装に一本化されています。

参照形式と生成アルゴリズムは[`reference/`](./reference/README.md)、実行時の計算は[`runtime-calculation-algorithms.md`](./runtime-calculation-algorithms.md)、ルールの独立検証は[`runtime-rule-validation.md`](./runtime-rule-validation.md)を参照してください。

## published-bucket互換

1024要素のpublished-bucket形式とインデックス1023への集約は、過去データとの比較・互換性を必要とする境界だけに残します。adapterの実装は[`tooling/reference-data/PublishedBucketCompatibility.js`](../tooling/reference-data/PublishedBucketCompatibility.js)にあり、productionの`src/`から参照しません。`DistributionResult`のsupport、overflow、要求されたdisplay windowを置き換えるものでも、productionの表示上限でもありません。productionのrange plannerとDamage計算はcanonical full-tailだけを受け付け、`scorePropagation`による旧モード選択は廃止しました。Backtrackは歴史的assetのcoverageによらず常にon-demandで生成します。

## 検証

- `npm run verify:core`: Node、通常テスト、typecheck、ESLint、Markdown lint、build、差分検査
- `npm run verify:browser`: production buildとChromium smoke。Check、Attack、Backtrackの計算、表示範囲、latest-wins、browser diagnosticsを確認
- `npm run verify:reference`: generator、reference tests、simulation、runtime DX比較
- `npm run verify:release`: production releaseに必要なcoreとbrowser smoke

本番の計算経路に参照assetが混入していないことは、source architecture tests、build後の`dist/data`不在、production smokeのrevision-1 request 0で確認します。
