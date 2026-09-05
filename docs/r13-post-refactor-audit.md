# R13 Post-refactor Audit

## 位置づけ

R12のcore module decomposition完了後に、production実装の残課題、release verification、live documentationを監査した記録です。R13は実装変更を目的とせず、次の作業単位へ渡すP1・P2の根拠を整理しました。

監査対象の基準点は`da754598ae2d87e567bf77e5ba0b389e929eef4a`（`docs: close R12 core decomposition`）です。

## 判定

```text
R13: CLOSED / AUDIT COMPLETE
P0 findings: 0
P1 findings: 2
P2 findings: 1
Deferred: Cloudflare Worker / HTTP API / MCP publication
```

計算の正しさ、数値安全性、資源制御、runtime lifecycle、architecture boundary、production browser acceptance、production network isolation、test・oracle構造はGREENと判定しました。release verification processとlive documentationだけを次の改善対象とします。

## R12 same-HEAD evidence

R12完了時に同一HEADで実施したfull gateの実測を、R13の基準証跡として採用します。

```text
Node.js 22.23.2
precomputed data: 32 assets
Vitest: 76 files / 873 tests
generator: 18 passed / 13 deselected
simulation: 13 passed
generator lint: GREEN
typecheck: GREEN
runtime DX: 20,000 cases PASS
ESLint: GREEN
Markdown lint: GREEN
build: 415 modules
production browser smoke: PASS
git diff --check: GREEN
working tree: clean
```

## Findings

### RD-01（P1）: release gateの正本がない

実運用で採用しているfull gateにproduction browser smokeと`git diff --check`が含まれている一方、CIとCONTRIBUTINGの手順はその一部しか実行していませんでした。既存のproduction smokeはCheck、Attack、Backtrackを実ブラウザで操作し、network error、console error、page error、request failureを監視するrelease-criticalな検証です。R14で`package.json`の`verify:release`へ集約し、CIと開発者手順から同じコマンドを呼び出します。

### RD-02（P1）: READMEがcurrent architectureと一致しない

READMEには廃止済みの`src/data/`、存在しない`npm run benchmark:calculators`、migration中の用語、限定的な品質確認コマンドが残っていました。R14で現行の`src/calculation`、`src/core`、`src/domain`、`src/features`、`src/runtime`、`src/shared`と、実在するベンチマーク・release gateへ更新します。

### RD-03（P2）: migration roadmapをactive roadmapとして延長している

R1〜R12のmigration・refactoringは完了したため、`docs/canonical-migration-roadmap.md`は履歴としてfreezeし、現行の課題は`docs/todo.md`で管理します。過去の設計記録の用語や内容は、履歴の正確さを保つために書き換えません。

## Non-findings

R13ではruntime correctness blocker、architecture reverse dependency、numerical contract regression、ResourceGuard lifecycle blocker、production Worker lifecycle blockerを確認しませんでした。これは未調査という意味ではなく、該当するsourceと回帰テストを監査したうえでR14の範囲から除外したという意味です。

`experiments/runtime-dr`はreference・optimized implementationの比較、公開assetの検証、browser benchmarkを担うため削除しません。`RangePlanner.nextPowerOfTwo`もconsumer inventoryなしに削除せず、互換exportとして維持します。

## R14への引き継ぎ

R14はproduction behaviorを変更せず、release verificationの統合とlive documentationの修正だけを行います。Cloudflare Worker、HTTP API、MCPによる外部公開は、計算coreの契約と実測が安定した後に別途判断します。

## R14 closure evidence

R14開始時のlocal・remote HEADは`da754598ae2d87e567bf77e5ba0b389e929eef4a`で一致していました。リリース検証の実装コミットは`686e28d`（`chore: consolidate release verification`）です。docs更新を含む作業ツリーで`npm run verify:release`を実行し、次の結果を得ました。

```text
Node.js 22.23.2
precomputed data: 32 assets (each verification passed)
Vitest: 77 files / 877 tests passed
generator: 18 passed / 13 deselected
simulation: 13 passed / 18 deselected
generator lint: GREEN
typecheck: GREEN
runtime DX: 20,000 cases PASS
ESLint: GREEN
Markdown lint: 38 files / 0 issues
build: 415 modules
production browser smoke: PASS
git diff --check: GREEN
```

docs更新後にも`npm run lint`、`npm run lint:markdown`、`npm run diff:check`を再実行し、すべてGREENでした。docs commit後の作業ツリーはcleanとなり、R14を`CLOSED / GREEN`とします。最終local HEADとremote HEADの実際の値は作業完了時の報告に記録します。

R14の追補では、作業ツリー用の検査を維持したまま、CIの`DIFF_CHECK_BASE`・`DIFF_CHECK_HEAD`でPRまたはpushのコミット範囲を明示して検査します。checkoutはfull history（`fetch-depth: 0`）とし、root commitの場合は`git diff-tree --check --root`へ切り替えます。

追補実装では`diff:check`を`diff-check.mjs`へ切り出し、環境変数がないローカル実行では作業ツリーを、CI実行では指定されたbase〜headのコミット範囲を検査するようにしました。契約テスト、ESLint、Markdown lint、作業ツリー検査、既存HEADを対象にしたコミット範囲検査、root commit分岐の検査がすべてGREENです。これによりR14の最終判定は次のとおりです。

```text
P0: 0
P1: 0
P2: 0
R14: CLOSED / GREEN
```
