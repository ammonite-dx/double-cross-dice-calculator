# 事前計算データ

確率計算で使用する事前計算データは、Cloudflare Pagesから静的アセットとして配信します。生成物は手動で編集しません。現在の密JSONから疎形式へ変換する移行用コマンドは`npm run data:generate`、確率分布そのものをPythonで再計算するコマンドは`npm run data:regenerate`です。

事前計算が従うダイスロール手順と境界条件は[`docs/dice-rules.md`](./dice-rules.md)に定義します。

各データセットの状態、漸化式、FFT、丸め、疎形式化の詳細は[`precomputation-algorithms.md`](./precomputation-algorithms.md)に定義します。

## バージョン

- `schemaVersion`: JSON構造を変更したときに更新する整数
- `dataRevision`: 確率値や対応ルールを変更したときに更新する整数

アプリとデータは同じPagesデプロイに含めます。後方互換レイヤーは持たず、アプリが要求する`schemaVersion`と`dataRevision`に一致するデータだけを読み込みます。

現在の出力先は`public/data/schema-v2/revision-1/`です。schema-v1の旧データは移行比較の参照用として保持し、アプリからは参照しません。

生成元の`src/data/dx.json`、`dr.json`、`d10.json`、`livingdead.json`は変換処理だけが参照します。本番アプリケーションから直接importせず、ViteのJavaScriptチャンクにも含めません。

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

`dx`と`dr`の`distributionSize`は2048、`d10`と`livingdead`は1024です。各分布の最終インデックスは、その値以上をまとめたオーバーフローバケットです。アプリが画面へ返す公開分布は常に1024要素であり、インデックス1023へ値1023以上を集約します。

中間表現と公開表現を分ける理由、および2048要素で安全に処理できる入力範囲は[`ADR 0001`](./adr/0001-expanded-working-distributions.md)に記載します。

正式な共通スキーマは`schemas/precomputed-data.schema.json`にあります。データセット固有の配列形状は生成スクリプトでも検証します。

## データセット

各範囲の計算根拠は[`docs/dice-rules.md`の「事前計算範囲の決定方針」](./dice-rules.md#事前計算範囲の決定方針)に記載します。範囲の上端を`N`とすると、インデックス0を含むためJSONの`index.dice.count`と`distributions`の要素数は`N + 1`です。

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

現在のフォームから`livingdead`を実際に参照する最大値は219です。`d10`と同じ224分布に統一することで、バックトラック用データの境界管理を共通化しています。

## 実行時の読込

各画面は必要なファイルだけを同一Pagesデプロイから取得し、取得済みのデータをメモリ上でキャッシュします。

- 一般判定: 初期値の`shihai-0`を読み込み、`shihai`変更時に対応するファイルを追加取得
- 攻撃: `shihai-0`、`kazanari-0`、`d10`を初期読込し、`shihai`または`kazanari`変更時に追加取得
- バックトラック: `d10`と`livingdead`を初期読込

`d10`と`livingdead`の疎な分布は、計算で必要になったものだけを長さ1024の配列へ展開します。ダメージ軽減に使う最大99ダイスの`d10`だけは2048要素へゼロ拡張します。`dr`は読み込んだ`kazanari`ごとに、ダメージ計算の走査順に合わせた型付き配列のビューを構築し、最近使用した3種類をLRUとして保持します。データ取得・検証・これらのキャッシュは`PrecomputedDataRepository.js`に集約します。

## ファイル名と整合性

ファイル名には内容ハッシュを含めません。スキーマ版とデータ改訂版をパスに含め、同じ改訂版のファイルは変更しない運用とします。

`manifest.json`にはデータセット別の`distributionSizes`、各生成物のバイト数、SHA-256を記録します。ハッシュは実行時のURL解決ではなく、生成の決定性とコミット内容をCIで検証するために使用します。

## 更新手順

1. `generator/`の生成ロジックまたは対応ルールを更新する
2. 必要に応じて`schemaVersion`または`dataRevision`を更新する
3. `npm run data:verify-generator`でPython生成器の出力と現行の配信データとの差分を確認する
4. `npm run data:regenerate`を実行し、`generated-data/`へレビュー用データを生成する
5. 公開する場合は`dataRevision`とアプリの参照先を更新し、新しいリビジョンの配信先へ配置する
6. `npm run data:check`で旧密JSONから作るrevision-1参照データを検証し、PythonとJavaScriptのテスト、lint、ビルドを実行する
7. 生成物とマニフェストを同じコミットに含める

Python環境、データセット単位の照合、全再生成については[`generator/README.md`](../generator/README.md)を参照してください。生成器の移行検証が完了するまでは、`src/data/*.json`と`scripts/generate-precomputed-data.mjs`も比較用に保持します。
