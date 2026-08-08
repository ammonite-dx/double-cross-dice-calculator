# Contributing

Double Cross Dice Calculatorへの改善提案をありがとうございます。

## Issue

不具合報告には、可能な範囲で次の情報を含めてください。

- 対象画面
- 入力したダイス数、クリティカル値、技能値など
- 期待した結果と実際の結果
- 再現手順
- ブラウザとOS

ルール解釈に関係する場合は、どの挙動を想定しているかも記載してください。著作物からの長い引用やスキャン画像は添付しないでください。

## 開発手順

1. Node.jsのバージョンを `.node-version` の `22.23.2` に合わせます。
2. `npm run check:node` でNode.jsのバージョンを確認します。
3. `npm ci` で依存関係をインストールします。
4. 事前計算生成器を変更する場合は、[uv](https://docs.astral.sh/uv/)をインストールして`uv sync --project generator --dev`を実行します。
5. 作業用ブランチを作成します。
6. 実装とテストを変更します。
7. Pull Requestを作成する前に品質確認を実行します。

```sh
npm run check:node
npm run data:check
npm run data:verify-generator
npm run lint
npm run lint:markdown
npm run generator:lint
npm test
npm run generator:test
npm run generator:test:simulation
npm run build
```

Markdownではmarkdownlintの規約に従い、段落内の文章を途中で改行しません。コードブロック、表、箇条書きなど、Markdownの構造に必要な改行は維持します。

## 確率計算の変更

確率計算の変更では、境界値と代表的な入力のテストを追加してください。浮動小数点数の比較には完全一致ではなく、明示した許容誤差を使用してください。

事前計算済み分布へJavaScriptで加える処理を変更する場合は、[`docs/runtime-rule-validation.md`](./docs/runtime-rule-validation.md)に従い、本番実装や旧Calculatorから独立した期待値を使用してください。

事前計算データを変更する場合は、生成条件、生成方法、検証結果をPull Requestに記載してください。全データの再計算は`npm run data:regenerate`で行います。ブラウザアクセス時や通常のPagesビルド時には再計算しません。

## Pull Request

Pull Requestは一つの目的に絞り、挙動を変更する場合は理由と利用者への影響を説明してください。UI変更には可能であれば変更前後の画像を添付してください。
