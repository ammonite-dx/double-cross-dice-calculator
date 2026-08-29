# 事前計算データ

確率計算で使用する事前計算データは、Cloudflare Pagesから静的アセットとして配信します。生成物は手動で編集しません。`npm run data:generate`と`npm run data:regenerate`はいずれもPython generatorの生成コマンドへ委譲します。

事前計算が従うダイスロール手順と境界条件は[`docs/dice-rules.md`](./dice-rules.md)に定義します。

各データセットの状態、漸化式、FFT、丸め、疎形式化の詳細は[`precomputation-algorithms.md`](./precomputation-algorithms.md)に定義します。

## バージョン

- `schemaVersion`: JSON構造を変更したときに更新する整数
- `dataRevision`: 確率値や対応ルールを変更したときに更新する整数

アプリとデータは同じPagesデプロイに含めます。後方互換レイヤーは持たず、アプリが要求する`schemaVersion`と`dataRevision`に一致するデータだけを読み込みます。

現在の出力先は`public/data/schema-v2/revision-1/`です。旧schema-v1とdense JSONはPhase 8-2G9で退役し、内容を確認したい場合はGit履歴を参照します。

公開済みのrevisionはimmutableとして扱います。productionで不要になったassetを整理する場合も、既存revisionのURLを同一revision内で削除せず、新しいrevisionへ最小構成を生成して参照先を切り替えます。Git上のlegacy/reference削除と、公開済みURLのretirementは別の判断として記録します。

現行の生成元は`generator/`のPython実装です。公開assetは本番アプリケーションへ同梱しますが、canonical production経路はD10、DX、DR、livingdeadをすべてruntime生成し、assetを取得しません。公開assetはgeneratorの照合・独立検証と互換参照のために保持します。

## 共通形式

各ファイルは次のフィールドを持ちます。

```json
{
  "schemaVersion": 2,
  "dataRevision": 1,
  "dataset": "dr",
  "distributionSize": 2048,
  "shard": {
    "kazanari": 0
  },
  "index": {
    "dice": {
      "start": 0,
      "count": 203
    }
  },
  "distributions": []
}
```

1つの確率分布は、前後のゼロを省略した疎形式で表します。

```json
{
  "offset": 12,
  "values": [0.01, 0.08, 0.15]
}
```

この例では、値12、13、14の確率がそれぞれ0.01、0.08、0.15であり、それ以外の確率はゼロです。`offset + values.length`は`distributionSize`以下でなければなりません。

`dx`と`dr`の`distributionSize`は2048、`d10`と`livingdead`は1024です。事前計算assetの最終インデックスは、その値以上をまとめたlegacy/reference用オーバーフローバケットです。canonical production UIはこのasset形状を最終表示へ直接返さず、要求されたdisplay windowとcanonical support/overflow契約に従って表示します。1024要素とインデックス1023の意味はpublished-bucket compatibilityと移行比較の境界としてのみ維持します。

中間表現と公開表現を分ける理由、および2048要素で安全に処理できる入力範囲は[`ADR 0001`](./adr/0001-expanded-working-distributions.md)に記載します。

正式な共通スキーマは`schemas/precomputed-data.schema.json`にあります。データセット固有の配列形状は生成スクリプトでも検証します。

## データセット

旧データの生成範囲の根拠は[`docs/dice-rules.md`の「歴史的な事前計算範囲」](./dice-rules.md#歴史的な事前計算範囲)に記載します。これらの範囲は正規入力domainではありません。範囲の上端を`N`とすると、インデックス0を含むためJSONの`index.dice.count`と`distributions`の要素数は`N + 1`です。

### `dx`

- 分割単位: `shihai`
- ファイル: `dx/shihai-{shihai}.json`
- 配列: `distributions[dice][critical - 2]`
- `dice`: 0から99
- `critical`: 2から11
- `distributionSize`: 2048

### `dr`

- 分割単位: `kazanari`
- ファイル: `dr/kazanari-{kazanari}.json`
- 配列: `distributions[dice]`
- `dice`: 0から202
- `distributionSize`: 2048

旧形式の`dr[kazanari][damage][dice]`は生成時に転置します。各要素はダメージの確率分布です。

### `d10`

- ファイル: `d10.json`
- 配列: `distributions[dice]`
- `dice`: 0から223
- `distributionSize`: 1024

### `livingdead`

- ファイル: `livingdead.json`
- 配列: `distributions[dice]`
- `dice`: 0から223
- `distributionSize`: 1024

現在の旧フォームから`livingdead`を実際に参照していた最大値は219です。`d10`と同じ224分布に統一していた理由は、旧バックトラック用データの境界管理を共通化するためでした。

## 実行時の読込

canonical UIはroute preloadを行わず、productionの計算経路からschema-v2 JSONを取得しません。D10、DX、DR、livingdeadはruntime計算で生成し、必要な小さな結果だけを計算クライアントのライフタイム内で扱います。公開assetの読込はReference repository、独立比較、生成物検証に限定します。

- 一般判定: `shihai`用の事前計算assetを読まず、`calculateDxDistribution`でruntime DXを生成
- 攻撃: `shihai`・`kazanari`・D10の事前計算assetを読まず、runtime DX/D10/DRを生成する。DRのFFT本体は常駐Workerで実行する
- バックトラック: 完全on-demandのcanonical generatorで要求範囲を生成し、`d10`・`livingdead` assetを読まない

`d10`と`livingdead`の疎な分布形式はgeneratorの出力仕様とasset検証の対象です。canonical BacktrackとAttackはこのasset coverageを使わず、plannerが選んだworking lengthの完全supportをruntime生成します。`src/data/ReferencePrecomputedDataRepository.js`はテストと独立比較のために公開assetを読み込みます。

## 検証gateと整理条件

`npm run data:check`と`npm run data:verify-generator`は、Python generatorからpublic schema-v2/revision-1 assetsを再生成して比較します。`npm run generator:test`は数値監査、独立全列挙、current asset equivalenceを、`npm run generator:test:simulation`は乱数シミュレーションとの一致を検証します。

旧dense JSONとschema-v1変換スクリプトはPhase 8-2G9で削除しました。旧gateが保証していたdense形状・旧形式変換・旧revision equivalenceは、generatorのschema/manifest validation、numerical audit、exhaustive reference、asset manifest validationへ移行済みです。

## ファイル名と整合性

ファイル名には内容ハッシュを含めません。スキーマ版とデータ改訂版をパスに含め、同じ改訂版のファイルは変更しない運用とします。

`manifest.json`にはデータセット別の`distributionSizes`、各生成物のバイト数、SHA-256を記録します。ハッシュは実行時のURL解決ではなく、生成の決定性とコミット内容をCIで検証するために使用します。

## 更新手順

1. `generator/`の生成ロジックまたは対応ルールを更新する
2. 必要に応じて`schemaVersion`または`dataRevision`を更新する
3. `npm run data:verify-generator`でPython生成器の出力と現行の配信データとの差分を確認する
4. `npm run data:regenerate`を実行し、`generated-data/`へレビュー用データを生成する
5. 公開する場合は`dataRevision`とアプリの参照先を更新し、新しいリビジョンの配信先へ配置する
6. `npm run data:check`でPython generatorと公開schema-v2/revision-1の一致を検証し、PythonとJavaScriptのテスト、lint、ビルドを実行する
7. 公開済みrevisionのファイルを上書きせず、生成物とマニフェストを同じ新revisionのコミットに含める

Python環境、データセット単位の照合、全再生成については[`generator/README.md`](../generator/README.md)を参照してください。生成器の現行ソースはPython generatorに一本化され、旧JS生成scriptとdense JSONはGit履歴にのみ残ります。
