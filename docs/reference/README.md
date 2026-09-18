# 参照資料

このディレクトリは、現在のproduction runtimeが読み込む仕様ではなく、過去に生成した確率分布と、その再現・検証方法を保存するための領域です。revision-1 JSONは`tooling/reference-data/assets/schema-v2/revision-1/`に置かれ、Cloudflare Pagesのproduction bundleには含まれません。

- [`precomputed-data.md`](./precomputed-data.md): revision-1のJSONスキーマ、データセット、manifest、再生成手順
- [`precomputation-algorithms.md`](./precomputation-algorithms.md): Python generatorが用いる確率計算アルゴリズム
- [`precomputation-validation.md`](./precomputation-validation.md): 数値検証、シミュレーション、許容誤差

生成器は`generator/`にあり、`npm run verify:reference`または個別の`npm run data:check`で参照アセットとの一致を確認できます。production runtimeはD10、DX、DR、Backtrackの分布を入力に応じて生成するため、これらのJSONを取得しません。

revision-1のファイルは再現性・比較用の歴史的fixtureとしてリポジトリ内に保持します。R25-Jで新しいproduction deployからは旧revision-1公開URLを退役させました。これは`published-bucket`互換の削除・変更とは別の判断であり、互換表示はR25-Kで再評価するまで維持します。
