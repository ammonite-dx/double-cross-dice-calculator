# 事前計算データ（参照fixture）

この文書は、過去に生成したschema-v2/revision-1 JSONを再現・検証するための参照仕様です。production runtimeはJSONを読み込まず、入力に応じてD10、DX、DR、livingdeadを生成します。生成物は手動で編集しません。`npm run data:generate`と`npm run data:regenerate`はいずれもPython generatorの生成コマンドへ委譲します。

事前計算が従うダイスロール手順と境界条件は[`../dice-rules.md`](../dice-rules.md)に定義します。

各データセットの状態、漸化式、FFT、丸め、疎形式化の詳細は[`precomputation-algorithms.md`](./precomputation-algorithms.md)に定義します。

## バージョン

- `schemaVersion`: JSON構造を変更したときに更新する整数
- `dataRevision`: 確率値や対応ルールを変更したときに更新する整数

アセットは`tooling/reference-data/assets/schema-v2/revision-1/`に保存します。旧schema-v1とdense JSONは退役済みで、内容を確認したい場合はGit履歴を参照します。

revision-1のファイルはimmutableな歴史的fixtureとしてリポジトリ内に保持します。R25-Jで新しいproduction deployからは旧revision-1公開URLを退役させました。新しい静的アセットをproductionで配布する場合は、別のアーキテクチャ判断と新しいrevisionを必要とします。公開URLの退役は`published-bucket`互換の削除・変更とは別の判断です。

現行の生成元は`generator/`のPython実装です。参照アセットはgeneratorの照合、独立検証、互換比較のために保持します。

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

中間表現と公開表現を分けた経緯、および2048要素で検証した入力範囲は[`ADR 0001`](../adr/0001-expanded-working-distributions.md)に記載します。

正式な共通スキーマは[`precomputed-data.schema.json`](../../schemas/precomputed-data.schema.json)にあります。データセット固有の配列形状は生成スクリプトでも検証します。

## データセット

旧データの生成範囲の根拠は[`dice-rules.md`の「歴史的な事前計算範囲」](../dice-rules.md#歴史的な事前計算範囲)に記載します。これらの範囲は正規入力domainではありません。範囲の上端を`N`とすると、インデックス0を含むためJSONの`index.dice.count`と`distributions`の要素数は`N + 1`です。

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

## 実行時との境界

production UIはroute preloadを行わず、schema-v2 JSONを取得しません。D10、DX、DR、livingdeadはruntime計算で生成し、必要な結果だけを計算クライアントのライフタイム内で扱います。`tooling/reference-data/ReferencePrecomputedDataRepository.js`は、注入されたfixture loaderまたは登録済みJSONを使うテスト・独立比較専用のrepositoryです。

## 検証gateと整理条件

`npm run data:check`と`npm run data:verify-generator`は、Python generatorからreference assetsを再生成して比較します。`npm run generator:test`は数値監査、独立全列挙、current asset equivalenceを、`npm run generator:test:simulation`は乱数シミュレーションとの一致を検証します。

旧dense JSONとschema-v1変換スクリプトはPhase 8-2G9で削除しました。旧gateが保証していたdense形状・旧形式変換・旧revision equivalenceは、generatorのschema/manifest validation、numerical audit、exhaustive reference、asset manifest validationへ移行済みです。

## ファイル名と整合性

ファイル名には内容ハッシュを含めません。スキーマ版とデータ改訂版をパスに含め、同じ改訂版のファイルは変更しない運用とします。

`manifest.json`にはデータセット別の`distributionSizes`、各生成物のバイト数、SHA-256を記録します。ハッシュは実行時のURL解決ではなく、生成の決定性とコミット内容をCIで検証するために使用します。

## 更新手順

1. `generator/`の生成ロジックまたは対応ルールを更新する
2. 必要に応じて`schemaVersion`または`dataRevision`を更新する
3. `npm run data:verify-generator`でPython生成器の出力と現行の配信データとの差分を確認する
4. `npm run data:regenerate`を実行し、`generated-data/`へレビュー用データを生成する
5. `npm run data:check`でPython generatorとreference assetの一致を検証し、PythonとJavaScriptのテスト、lint、ビルドを実行する
6. 静的アセットをproductionへ追加する場合は、公開範囲・revision・デプロイ構成を別途設計し、既存fixtureを上書きしない

Python環境、データセット単位の照合、全再生成については[`generator/README.md`](../generator/README.md)を参照してください。生成器の現行ソースはPython generatorに一本化され、旧JS生成scriptとdense JSONはGit履歴にのみ残ります。
