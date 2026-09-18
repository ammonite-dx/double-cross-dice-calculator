# R25-I テスト・CI・参照検証の責務分離

## 目的

R25-Iでは、productionの計算・表示が正しいことを確認する検証と、過去に公開したデータを再生成・比較する検証を分離します。両者はどちらも重要ですが、必要な実行環境、実行時間、失敗時に取るべき対応が異なります。分離後もテストの正しさを弱めるのではなく、各検証が何を保証するかを明確にします。

## 三つの検証境界

| 境界 | 主な対象 | 実行環境 | 代表コマンド |
| --- | --- | --- | --- |
| core | productionの計算コア、UI状態、入力、結果、architecture、通常の数値契約 | Node.js | `npm run verify:core` |
| browser | production buildと静的サイトの起動、画面更新、ブラウザ診断 | Node.js、Chromium | `npm run verify:browser` |
| reference | `tests/reference/`、公開済みrevision-1 JSON、Python generator、シミュレーション、runtime DX監査 | Node.js、uv、Python 3.12 | `npm run verify:reference` |

`verify:release`はcoreとproduction browser smokeを組み合わせたproduction-onlyのリリースゲートです。参照領域まで含めた全検証は`verify:all`で実行します。CIでは三つの境界を別ジョブに分け、PRの差分に応じてbrowserとreferenceを選択的に実行します。mainへのpushでは両方を実行し、差分判定で判断できないパスは安全側に倒して両方を実行します。

## core検証

`npm test`は既定の`vitest.config.js`を使い、`tests/reference/**`を除くテストを実行します。ここには計算コアの独立オラクル、ルール検証、入力・範囲・資源・キャンセル、presentation、architectureのテストが含まれます。`verify:core`はNode.jsのバージョン確認、通常テスト、TypeScriptの型検査、ESLint、Markdown lint、production build、`git diff --check`を順に実行します。

core検証は、現在のブラウザ実行経路が変更されたときに最初に実行する最小のゲートです。uv、Python、generator、Chromiumを必要としないため、productionコードだけを変更したPRでも同じ環境で再現できます。

## browser検証

`verify:browser`はproduction buildを作成し、`smoke:production:built`でCheck、Attack、Backtrackの主要経路を確認します。CIのbrowserジョブだけがChromiumを`npx playwright install --with-deps chromium`で導入します。browserジョブは計算結果の歴史的JSONとの一致を検査せず、データの取得、画面更新、ブラウザ診断、表示範囲と拒否・復帰の契約を検査します。

## reference検証

`tests/reference/`には、公開済みrevision-1 JSONのmanifest・schema・分布値、参照用repository、旧公開値との量子化比較、DRの実験実装を置きます。これらは現在のproduction importerがそのJSONを読み込むことを保証するテストではありません。productionはcanonicalなオンデマンド計算を使用し、公開JSONは再生成・比較・互換性のために保持しています。

`verify:reference`はNode.jsの確認、`data:check`、`test:reference`、generatorの通常テスト、simulation、Ruff、runtime DX監査を実行します。generatorや公開データの変更ではこのゲートを実行し、出力の再現性と独立オラクルの一致を確認します。

## published-bucketとの関係

published-bucketは、過去の公開形式で上側の値を一つのバケットへ集約する互換表現です。reference領域を分離したことはpublished-bucketの仕様や比較テストを削除したことを意味しません。canonicalな`DistributionResult`が保持するsupport、overflow、表示windowとは別の表現であり、productionの表示範囲を1024要素へ戻す理由にもなりません。

## 変更時の選択

- productionの計算、UI、runtime、共有表示を変更したら`npm run verify:core`を実行し、画面経路まで変更した場合は`npm run verify:browser`も実行します。
- `tests/reference/`の参照テストだけを変更したら`npm run test:reference`を実行します。
- `public/data/schema-v2/revision-1/`、`generator/`、`tooling/reference-data/`、`pytest.ini`、uv設定を変更したら`npm run verify:reference`を実行します。
- リリース候補では`npm run verify:release`を実行します。参照資産の再現性を含めた確認が必要な場合は`npm run verify:all`を実行します。

## R25-I完了時の確認

R25-Iの完了条件は、core、browser、referenceがそれぞれ単独で実行でき、CI上でもNode-only、Chromium、uv/Pythonの依存関係が混ざらないことです。最終確認では`npm run verify:core`、`npm run test:reference`、`npm run verify:reference`、`npm run verify:release`、`git diff --check`、`git status --short`を実行し、productionと参照検証の結果を別々に記録します。
