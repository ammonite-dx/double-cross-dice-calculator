# R29-H: Active Documentation / Naming Cleanup

## 目的

現行のproduction runtimeやactive documentationに残っていた移行時の識別子・用語・ファイル参照を整理し、現在の責務が名前から分かる状態にする。計算式、DTOのfieldと意味、resource policy、UI仕様、request lifecycle、Worker protocolは変更しない。

## 開始点とコミット

基準HEADは`d1b00bf75fca4159867f6ae21c9fa5466e3a82e4`。

- `1ad2357` — `docs: finalize R29-G closure record`
- `21c3344` — `refactor: normalize presentation discriminant names`
- `3dfd087` — `refactor: clean production migration terminology`
- `8706125` — `chore: rename attack runtime benchmark`
- `c0f96f7` — `docs: refresh active runtime and reference documentation`
- TODO整理、active documentation link contract、最終検証とR29-H closureは後続コミットへ記録する。

## production naming

presentation DTOの内部`kind`は、version、field、意味論、ownershipを変えずに以下の名前へ統一した。

| 変更前 | 変更後 |
| --- | --- |
| `canonical-distribution-display` | `distribution-display` |
| `canonical-distribution-projection` | `distribution-projection` |
| `check-canonical-presentation` | `check-presentation` |
| `attack-canonical-score-display-presentation` | `attack-score-display-presentation` |
| `attack-canonical-display-presentation` | `attack-display-presentation` |
| `backtrack-canonical-presentation` | `backtrack-presentation` |

旧名とのunion、alias、保存値の互換層は設けていない。これらのkindは同一bundle内のDTOであり、外部API、Worker wire protocol、localStorage、永続fixtureでは使用されていないことを検索で確認した。

production sourceの説明を現在の責務へ直し、`BacktrackPresentation`の引数と内部validation pathを`Result`から`result`へ統一した。error code、表示結果、計算結果は変えていない。

## Attack runtime benchmark

active benchmarkを以下へrenameした。旧npm commandのaliasは残していない。

- `scripts/benchmark-full-tail-attack.mjs` → `scripts/benchmark-attack-runtime.mjs`
- `benchmark:full-tail-attack` → `benchmark:attack-runtime`
- `tests/benchmarkFullTailAttack.test.js` → `tests/attackRuntimeBenchmark.test.js`

help textとケースlabelもAttack runtimeの測定であることを表す名前へ揃えた。`experiments/phase2h-browser/`、historical target ID、`tests/experiments/`とそのbenchmark historyは変更していない。

## active documentation

README、CONTRIBUTING、architecture、dice rules、runtime algorithm・validation、result contract、reference docsを現行runtimeとTypeScriptの実態に合わせた。主な修正は、requested display window・explicit range・mathematical support・overflow・tail certificateによる説明、retired `.js` pathとsymbolの更新、reference fixtureの現状説明、ADRのcurrent note、READMEのtest構成・benchmark command・directory mapである。

`docs/reference/precomputed-data.md`の`generator/README.md`への相対リンクと、`docs/reference/precomputation-algorithms.md`の`dice-rules.md`への相対リンクを修正した。active TODOは現行方針・次作業・保留・直近完了だけに縮小し、詳細履歴は個別archiveとtodo historyのindexから参照する。

## 保持した歴史的境界

- ADRの過去のdecision body、R番号、historical experiment identityは履歴として保持した。
- `tooling/reference-data/PublishedBucketCompatibility.js`とhistorical published-bucket formatは参照比較境界として維持した。
- `experiments/phase2h-browser/`、R19〜R23 experiment、`tests/experiments/`は変更していない。
- schema-v2/revision-1 asset、generator、Worker protocol、API、計算意味論とresource policyは変更していない。

## 検証

- Presentation focused tests: 6 files / 79 tests passed.
- Backtrack・Check presentation tests: 3 files / 50 tests passed.
- Attack runtime benchmark contract tests: 3 files / 16 tests passed.
- `npm run benchmark:attack-runtime -- --help`: passed; prints the new command.
- `npm run typecheck`: passed.
- `npm test -- tests/activeDocumentationLinks.test.js`: passed after fixing the two broken relative links.
- `npm run lint:markdown`: 104 files / 0 issues.
- Full `verify:all` and final closure commit are recorded by the final R29-H closure entry.
