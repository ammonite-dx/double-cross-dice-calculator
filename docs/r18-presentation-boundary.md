# R18: Presentation境界の簡素化

R18では、R16で確立した確率結果・統計値の契約と、R17で整理した計算結果の所有権を前提に、presentation層の過剰な防御処理を整理する。計算コアが所有し検証した内部結果を、外部入力と同じ方法で再帰的に検査・複製・凍結するのではなく、表示に必要な投影だけを行う境界へ縮小する。

## 開始点とベースライン

対象branchは`codex/canonical-default-migration`、開始SHAは`080e1aacf5bbc3ce65136a73bc890a525ff94808`（`docs: close R17 feedback recovery`）である。開始時の作業ツリーはcleanだった。

開始前に`npm run verify:release`を実行し、data 32 assets、Vitest 82 files / 936 tests、generator 18件、simulation 13件、runtime DX 20,000ケース、lint、typecheck、build、production browser smoke、Markdown lint 42 files / 0 issuesを含むrelease gateが成功した。`npm run benchmark:full-tail-attack -- --iterations 1 --warmup 0`も実行し、全ケースで`error=-`を確認した。R18は性能改善を受入条件にしない。

## 信頼境界

次の境界では引き続き入力を検証する。

- フォーム入力、表示要求、Worker message、reference asset
- `DistributionResult`の生成と公開境界
- 確率、support、overflow、projection uncertainty、表示範囲、配列長、メモリ・描画点数

一方、次の値は計算コアまたはplannerが所有する内部値として扱う。

- `DistributionResult`本体
- `CertifiedValue`、`CertifiedProbability`、mass、期待値統計
- Score／Damage統計、Attackの計算recordとrange plan
- featureが生成したpresentation入力

内部値に対しては、Proxy、accessor、custom prototype、symbol列挙、typed-array subclass、任意の再帰clone、deep freezeを一般的な安全機構として要求しない。これは数値・資源・所有権の検証を削除することではなく、責務を正しい上流境界へ戻すことである。

## 実装単位

1. `DistributionPresenter`の再validation・再帰cloneを削減し、確率配列、表示範囲、support、overflow、uncertaintyだけを表示用に投影する。統計値は上流のimmutable referenceを再利用する。
2. `AttackPresentation`のbatch／range plan／Score／Damageの汎用reflectionとdeep cloneを削減し、計算結果・統計値の所有権を再利用する。ID、順序、plan数、数値・資源ガードは維持する。
3. Attack stateからpre-R17の合計・表示mirrorを削除し、`displayPresentation`を表示状態の唯一の所有者にする。`scoreDisplayPresentation` APIはそこから導出する。
4. Chart series adapterはcanonical表示を信頼する範囲を確認し、数値・範囲・資源のguardだけを残す。
5. 信頼境界、所有権、state shape、R17の表示エラー復旧を回帰テストで固定する。

## 非対象

計算結果の意味論、canonicalの表示契約、Workerの常駐化、API／MCP化、Cloudflare構成、チャートの見た目はR18では変更しない。legacyの公開比較APIはR21までbenchmark・比較用途として保持する。

## 完了条件

production pathから汎用reflection／deep cloneの責務を外し、上記の数値・範囲・資源ガードと表示の所有権を維持する。R18固有のテスト、`npm run verify:release`、必要なbenchmark、protected-area監査、Markdown lint、`git diff --check`が成功し、段階ごとの変更を独立したcommitとして記録する。
