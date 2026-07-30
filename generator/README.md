# 事前計算データ生成器

確率分布をオフラインで再計算し、Webアプリが配信する分割・疎形式JSONを生成します。ブラウザから実行するコードでも、Cloudflare Pagesの通常ビルドで実行するコードでもありません。

実装は旧Python・Juliaノートブックを仕様の参照元として整理したものです。通常の10面ダイス、`livingdead`、`shihai`、`kazanari`をすべてPythonで計算します。

計算が従うゲーム内のダイスロール手順は[`docs/dice-rules.md`](../docs/dice-rules.md)を参照してください。ノートブックや既存JSONではなく、承認済みのルール仕様を実装と検証の基準にします。

現在の生成範囲は`dx`が0～99ダイス、`dr`が0～202ダイス、`d10`と`livingdead`が0～223ダイスです。各上限を現在の入力フォームから導く計算は[`docs/dice-rules.md`の「事前計算範囲の決定方針」](../docs/dice-rules.md#事前計算範囲の決定方針)に記載しています。

## セットアップ

リポジトリルートで次を実行します。

```sh
uv sync --project generator --dev
```

Pythonの対応バージョンは`generator/pyproject.toml`に記録しています。`generator/.python-version`により、uvが使用するPython 3.12も固定しています。

生成器自身の品質確認はリポジトリルートから実行できます。

```sh
npm run generator:lint
npm run generator:test
```

固定乱数シードによる統計シミュレーションは通常のPythonテストから分離しています。13ケースを各200,000試行で検証するには次を実行します。

```sh
npm run generator:test:simulation
```

## 現行データとの照合

まず軽量なデータセットだけを確認できます。

```sh
uv run --project generator dx-precompute verify --dataset d10 --dataset livingdead
```

`shihai`や`kazanari`を1つだけ確認することもできます。

```sh
uv run --project generator dx-precompute verify --dataset dx --shihai 0
uv run --project generator dx-precompute verify --dataset dr --kazanari 1
```

照合は旧FFT実装と新しい畳み込み実装の丸め境界差を考慮し、各確率について6桁丸めの最小単位である`0.000001`までを同値として扱います。配列形状や非ゼロ範囲の違いは許容しません。

全データの照合は時間がかかります。

```sh
uv run --project generator dx-precompute verify
```

## 生成

全データと`manifest.json`を`generated-data/schema-v1/revision-3/`へ生成します。

```sh
uv run --project generator dx-precompute generate
```

一部だけを生成した場合は、不完全なマニフェストを作らないよう`manifest.json`を更新しません。既定出力は、現行の配信データを誤って上書きしないためのレビュー用ディレクトリです。公開するときは`dataRevision`を更新し、アプリ側の参照先も同じリビジョンへ変更してから、新しい`public/data/schema-vN/revision-N/`へ生成物を配置します。同じリビジョンの配信済みファイルは上書きしません。

比較検証が完了するまでは、`src/data/*.json`と旧ノートブックを移行時の参照データとして保持します。
