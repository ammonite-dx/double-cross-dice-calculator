# R11 — Canonical / Migration Terminology Cleanup

## 目的

本番の計算経路が単一化したため、移行中の並行経路を示していた`Canonical`接頭辞を本番コードから取り除き、現在の責務をそのまま表す名前へ統一した。

## 実施内容

- Attack、Check、Backtrack、共有表示、runtimeのファイル名とexport名を通常のproduction名へ変更した。
- CalculationClient、Score、Damage、Backtrack、DamageAggregationの公開APIと型を中立的な名前へ統一した。
- Attackのstateと計算結果を`score`、`scoreSummary`、`damage`、`damageSummary`へ統一し、同一値の移行用aliasを削除した。
- Backtrackの完全support計算を`complete-support`として表現し、計画メタデータも同じ意味にそろえた。
- 実験用benchmarkと関連テストを新しいAPIへ移行し、sourceのファイル名からも移行専用接頭辞を除いた。
- `tests/namingArchitecture.test.js`で、production sourceへの移行専用名の再導入を検出する境界を追加した。

## 意図的に保持した用語

`published-bucket`、`fromPublishedBucketDistribution`、`toPublishedBucketDistribution`は、旧形式との互換投影を表す現在も有効な意味論なので保持した。互換アダプター固有の`legacy`エラーコードや、過去の変更を説明するテスト・文書上の表現も、履歴または境界を示すために残している。

公開schema-v2のフィールド名、事前計算asset、generator、`public/**`、`generator/**`、`tooling/reference-data/**`には変更を加えていない。計算値、support、overflow、表示範囲、resource guard、latest-wins、abort、UIの見た目も変更していない。

## 検証

実装後のローカル検証では、`npm test -- --run --reporter=dot`（74ファイル・866テスト）、`npm run typecheck`、`npm run lint`、`npm run build`、主要実験スクリプトの`node --check`、`git diff --check`が成功した。Vueのテスト環境が出す`onMounted`／`onUnmounted`警告は既存テスト環境由来で、テスト結果は成功している。

命名境界の静的監査では、`src`配下の`Canonical`を含むファイル名と、R11で廃止したproduction識別子が0件であり、published-bucket互換語は残っていることを確認した。

## コミット

- `269d20e` `refactor: normalize production calculation naming`
- `6e36594` `test: enforce R11 naming boundaries`

この文書はR11の実装記録であり、R12で予定しているアルゴリズム分割や計算方式の変更は扱わない。
