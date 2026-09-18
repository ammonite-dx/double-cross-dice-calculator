# R25-J: 履歴文書と参照アセットの整理

## 判定

R25-Jは、現行の計算経路と表示契約を変更せずに完了した。公開成果物から歴史的な確率JSONを分離し、現行仕様・参照仕様・履歴資料の置き場所を分けた。`published-bucket`互換は変更していないため、R25-Kで再評価する。

## 対象とコミット

- 開始HEAD: `43f8b1d0af4eecd6b81e1be3876e0f054c2fa752`
- `93b91cc`: `public/data`から参照アセットを移動
- `90149df`: 生成ツールと参照リポジトリのパス・ローダーを整理
- `a0b54ec`: 事前計算の仕様・検証文書を`docs/reference/`へ移動
- `d800c00`: migration・phase・refactoringの作業記録を`docs/archive/`へ移動
- `3d5a589`: 現行の結果契約を`docs/result-contract.md`へ追加
- `0ff7940`: live architecture/runtime文書を現在の実装へ更新
- `34a6702`: 履歴実験のnpm command surface、TODO、ADRを整理
- 最終HEAD: 本文書を追加するcommit。SHAはこの文書を含むGit履歴で確定する。

## アセットの完全性

旧パス`public/data/schema-v2/revision-1/`を、新パス`tooling/reference-data/assets/schema-v2/revision-1/`へ移動した。開始HEADとの差分は33ファイル（32データセットとmanifest）の`R100` renameであり、内容は変更していない。

manifestは`schemaVersion: 2`、`dataRevision: 1`、`dx`／`dr`が2048要素、`d10`／`livingdead`が1024要素を記録する。新パスの33ファイルは合計11,984,253 bytesで、ファイル名順のSHA-256列を改行結合した監査用aggregate SHA-256は`6d8a5b82f2fc33ae9f90b0f5f4e0874e86a7f5626cbbf5741230d572e60e7aae`である。

`public/data`と`dist/data`は存在せず、production browser smokeでは旧JSON、`d10`、`livingdead`の取得件数をすべて0として確認する。参照アセットの生成・検証は`generator/`と`npm run data:check`から行い、productionのブラウザローダーは持たない。

## 文書とツールの境界

- 現行仕様: `README.md`、`CONTRIBUTING.md`、`docs/architecture.md`、`docs/result-contract.md`、`docs/runtime-calculation-algorithms.md`、`docs/dice-rules.md`
- 学習用文書: `docs/probability-calculation-tutorial.md`
- 再生成・参照fixture: `docs/reference/`、`generator/`、`tooling/reference-data/`
- 履歴資料: `docs/archive/`。旧上限、旧コマンド、phase番号、当時の測定値は現在の仕様を定義しない。
- 履歴実験: `experiments/`。再現用runnerは各READMEから直接起動し、削除した履歴npm scriptへ依存しない。
- 現行TODO: `docs/todo.md`。完了済みの長い作業日誌は`docs/archive/todo-history.md`へ移動した。
- ADR 0001は固定2048要素の歴史的判断として`Superseded`に変更した。現在は動的`RangePlanner`とfull-tail runtimeが中間範囲を決める。

## 検証

R25-Jの最終ツリーでは次を実行し、すべて成功した。

```text
npm run test:reference
npm run data:check
npm run verify:runtime-dx
npm run verify:core
npm run verify:reference
npm run smoke:production:built
npm run lint:markdown
git diff --check
```

- `verify:core`: Vitest 103 files / 1051 tests、typecheck、ESLint、Markdown lint 75 files / 0 issues、build 425 modules、diff checkがGREEN。
- `verify:reference`: 32 assets、reference Vitest 6 files / 46 tests、generator通常18 passed、simulation 13 passed、Ruff、runtime DX 20,000 casesがGREEN。runtime DXの最大絶対差は`9e-7`、最大総和誤差は`1.44e-15`だった。
- `smoke:production:built`: Check、Attack、BacktrackがGREEN。precomputed JSON取得0、D10取得0、console diagnostics 0、same-origin HTTP errors 0。`public/data`と`dist/data`はいずれも存在しない。

完了条件は、core/reference/release gateが成功し、Markdown lintが0 issues、`public/data`と`dist/data`が存在せず、production smokeのconsole diagnosticsと旧データ取得が0であることとする。計算コア、`DistributionResult`、certificate、ResourceGuard、Worker、latest-wins、数値許容誤差、published-bucket投影の意味論はこの整理で変更していない。

## 後続

R25-Kで`published-bucket`の利用箇所と削除条件を調査するまでは、互換表示を維持する。Cloudflare Worker/API/MCP化、入力上限の再設計、教科書のruntime依存章の更新はこの作業の対象外である。
