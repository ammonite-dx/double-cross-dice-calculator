# 事前計算データ

確率計算で使用する事前計算データは、Cloudflare Pagesから静的アセットとして配信します。
生成物は手動で編集せず、`npm run data:generate`で更新してください。

## バージョン

- `schemaVersion`: JSON構造を変更したときに更新する整数
- `dataRevision`: 確率値や対応ルールを変更したときに更新する整数

アプリとデータは同じPagesデプロイに含めます。後方互換レイヤーは持たず、アプリが要求する
`schemaVersion`と`dataRevision`に一致するデータだけを読み込みます。

現在の出力先は`public/data/schema-v1/revision-1/`です。

生成元の`src/data/dx.json`、`dr.json`、`d10.json`、`livingdead.json`は変換処理だけが
参照します。本番アプリケーションから直接importせず、ViteのJavaScriptチャンクにも含めません。

## 共通形式

各ファイルは次のフィールドを持ちます。

```json
{
  "schemaVersion": 1,
  "dataRevision": 1,
  "dataset": "dr",
  "distributionSize": 1024,
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

この例では、値12、13、14の確率がそれぞれ0.01、0.08、0.15であり、それ以外の確率は
ゼロです。`offset + values.length`は`distributionSize`以下でなければなりません。

`dx`、`d10`、`livingdead`の各分布は確率総和が1になることを検証します。`dr`の高ダイス領域は
既存データが値1023で打ち切られており、範囲外の確率を含まないため、総和が1未満になる場合が
あります。互換性維持のため生成時には補正せず、各確率が0以上1以下で総和が1を超えないことを
検証します。

正式な共通スキーマは`schemas/precomputed-data.schema.json`にあります。データセット固有の
配列形状は生成スクリプトでも検証します。

## データセット

### `dx`

- 分割単位: `shihai`
- ファイル: `dx/shihai-{shihai}.json`
- 配列: `distributions[dice][critical - 2]`
- `dice`: 0から99
- `critical`: 2から11

### `dr`

- 分割単位: `kazanari`
- ファイル: `dr/kazanari-{kazanari}.json`
- 配列: `distributions[dice]`
- `dice`: 0から202

旧形式の`dr[kazanari][damage][dice]`は生成時に転置します。各要素はダメージの確率分布です。

### `d10`

- ファイル: `d10.json`
- 配列: `distributions[dice]`
- `dice`: 0から103

### `livingdead`

- ファイル: `livingdead.json`
- 配列: `distributions[dice]`
- `dice`: 0から99

## 実行時の読込

各画面は必要なファイルだけを同一Pagesデプロイから取得し、取得済みのデータをメモリ上で
キャッシュします。

- 一般判定: 初期値の`shihai-0`を読み込み、`shihai`変更時に対応するファイルを追加取得
- 攻撃: `shihai-0`、`kazanari-0`、`d10`を初期読込し、`shihai`または`kazanari`変更時に追加取得
- バックトラック: `d10`と`livingdead`を初期読込

疎な分布は、計算で必要になったものだけを長さ1024の配列へ展開します。データ取得・検証・
キャッシュは`PrecomputedDataRepository.js`に集約します。

## ファイル名と整合性

ファイル名には内容ハッシュを含めません。スキーマ版とデータ改訂版をパスに含め、同じ改訂版の
ファイルは変更しない運用とします。

`manifest.json`には各生成物のバイト数とSHA-256を記録します。ハッシュは実行時のURL解決では
なく、生成の決定性とコミット内容をCIで検証するために使用します。

## 更新手順

1. 生成元または生成処理を更新する
2. 必要に応じて`schemaVersion`または`dataRevision`を更新する
3. `npm run data:generate`を実行する
4. `npm run data:check`、テスト、ビルドを実行する
5. 生成物とマニフェストを同じコミットに含める
