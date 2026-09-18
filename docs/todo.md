# TODO

このファイルは、現行の実装と今後の判断だけを記録する。完了済みの移行記録と詳細な作業日誌は [`archive/todo-history.md`](./archive/todo-history.md) に保存する。

## 現在の方針

- 公開サイトは静的SPAとして維持し、確率計算はブラウザ内のruntimeを正本とする。
- 旧来の確率JSONは [`tooling/reference-data/assets/`](../tooling/reference-data/assets/) に参照用として保持し、公開成果物へは含めない。
- `published-bucket` は既存表示との互換境界として当面維持する。削除・縮小はR25-Kで別途判断する。
- 結果契約、資源ガード、latest-wins、Worker境界、数値許容誤差を変更する場合は、先に対応するテストと文書を更新する。

## 次に行う作業

1. **R25-Jの完了確認**: 履歴文書・参照アセットの分離、現行文書、生成ツール、リリース成果物の検証結果を [`archive/r25-j-historical-docs-assets-cleanup.md`](./archive/r25-j-historical-docs-assets-cleanup.md) に記録する。
2. **R25-K: published-bucketの再評価**: 互換表示を維持したまま、必要な利用箇所・削除条件・移行手順を調査する。調査完了までは公開形式を変更しない。
3. **公開準備**: ライセンス、出典、公開範囲、再生成手順を確認し、ソース公開に必要なファイルだけを現行ツリーへ残す。

## 保留

- 実測に基づくruntimeの性能・メモリ上限の再調整。
- Cloudflare Worker/API/MCP連携。canonical result contractが安定するまで着手しない。
- 教科書の《支配の領域》関連章。runtimeの最終計算方式が確定してから本文を更新する。
