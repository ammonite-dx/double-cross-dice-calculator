# TODO

このファイルは、現行の実装と今後の判断だけを記録する。完了済みの移行記録と詳細な作業日誌は [`archive/todo-history.md`](./archive/todo-history.md) に保存する。

## 現在の方針

- 公開サイトは静的SPAとして維持し、確率計算はブラウザ内のruntimeを正本とする。
- 旧来の確率JSONは [`tooling/reference-data/assets/`](../tooling/reference-data/assets/) に参照用として保持し、公開成果物へは含めない。
- `published-bucket` はproductionの計算・表示モードではなく、[`tooling/reference-data/PublishedBucketCompatibility.js`](../tooling/reference-data/PublishedBucketCompatibility.js)に置く歴史的比較・互換adapterとして維持する。
- productionの計算範囲に`calculationMax=1022`や`PUBLISHED_OVERFLOW_INDEX=1023`を置かない。これらは`tooling/reference-data/`にある歴史的な比較形式の定数としてのみ保持する。入力・表示範囲は要求されたwindowと数学的supportから計画し、resource guardで安全性を判定する。
- DXの直接APIは暗黙の既定配列長を持たず、呼び出し側が`workingLength`を明示する。通常のproduction呼び出しでは`ScoreRangePlanner`がtail certificateと要求windowから値を決める。
- DRのFFT長と出力長は、明示指定がない限り入力の有限supportから動的に導出する。Backtrackは通常D10・Dロイス《屍人》ともon-demand生成し、歴史的assetのcoverage metadataをproduction planへ持ち込まない。
- 結果契約、資源ガード、latest-wins、Worker境界、数値許容誤差を変更する場合は、先に対応するテストと文書を更新する。

## 次に行う作業

1. **公開準備**: ライセンス、出典、公開範囲、再生成手順を確認し、ソース公開に必要なファイルだけを現行ツリーへ残す。
2. **実測に基づくresource policy調整**: 動的範囲の代表ケースを計測し、必要ならCPU・メモリの警告閾値を調整する。入力・表示の固定上限を復活させない。

## 保留

- 実測に基づくruntimeの性能・メモリ上限の再調整。
- Cloudflare Worker/API/MCP連携。結果契約と公開境界が安定するまで着手しない。
- 教科書の《支配の領域》関連章。runtimeの最終計算方式が確定してから本文を更新する。

## 完了した直近の作業

- **R30-prep: summary visual continuity**: Check／Attackでreplacement計算中にready frameをUIだけで保持し、Summary cardとtableの同一DOM nodeを新しいready値への更新まで維持する。初回の空表示とterminal rejection／error時のstale frameを防ぎ、browser smokeで可視性・高さ・内容更新・recoveryを確認した。詳細は[`archive/r30-prep-summary-visual-continuity.md`](./archive/r30-prep-summary-visual-continuity.md)を参照する。
- **R30-prep: Attack reaction tailのDamage分類**: 有限なaction scoreの最大値以下にならないreaction tailを、対決時のtieはreaction側勝利となる規則に基づいてdamage 0のfailureへ分類した。比較・期待値certificateで実際に確率を持つaction bucketの最大値を共有し、曖昧なtailや許容誤差を超えるtail確率誤差は従来どおり保守的に保持する。reactionのtail uncertaintyとDamage座標supportを分離し、許容誤差内の質量差は再正規化せず未確定tailとして増幅しない。詳細は[`archive/r30-prep-attack-reaction-tail-damage.md`](./archive/r30-prep-attack-reaction-tail-damage.md)を参照する。
- **R30-prep: summary layout continuity**: Check／Attackのreplacement計算中にサマリー行の実測高さだけを一時保持し、footerの位置ずれを防いだ。サマリー値やcurrent calculation stateは保持せず、初回・error・rejection・invalidateではlayout cacheを残さない。ブラウザsmokeで遷移中の高さとfooter位置、拒否時clearを確認した。詳細は[`archive/r30-prep-summary-layout-continuity.md`](./archive/r30-prep-summary-layout-continuity.md)を参照する。
- **R30-prep: chart transition parity**: Check／Attack／Backtrackの再計算中は直前のreadyな描画frameだけを一時保持し、完了時に新結果へ置換、失敗・拒否時に消去する。計算状態やlatest-winsの契約は変更せず、Attack系列のidentityをcombo IDで安定化した。詳細とブラウザsmoke記録は[`archive/r30-prep-chart-transition-parity.md`](./archive/r30-prep-chart-transition-parity.md)を参照する。
- **R30-prep: post-TypeScript boundary cleanup**: RangePlannerの入力・戻り値を操作別型へ収束し、CalculationClientのruntime optionをallowlist化した。production TypeScriptの未使用宣言lint、古いJavaScript呼び出しの修正、DataView snapshot範囲の保持も完了した。`verify:all`による最終確認と作業記録は[`archive/r30-prep-post-typescript-boundary-cleanup.md`](./archive/r30-prep-post-typescript-boundary-cleanup.md)を参照する。
- **R30-prep: 《屍人》runtime最適化と表示丸めの安定化**: 《屍人》のmax/sum状態DPをbounded-sum DPへ置き換え、generation work・メモリ見積りを更新した。Check、Attack、Backtrackで小数1桁表示の丸めを共通化し、歴史fixture、直接列挙、845D/846D境界、表示回帰を検証した。詳細は[`archive/r30-prep-livingdead-runtime-optimization.md`](./archive/r30-prep-livingdead-runtime-optimization.md)を参照する。
- **R29-I: architecture convergence closure**: R29-A〜Hの計算・runtime・presentation・参照境界と検証責務を監査し、旧移行用語を整理した。全体ゲートが成功し、R29を`CLOSED / GREEN`とした。詳細は[`archive/r29-i-architecture-convergence-closure.md`](./archive/r29-i-architecture-convergence-closure.md)を参照する。
- **R29-H: active documentation and naming cleanup**: production presentation DTO、Attack runtime benchmark、現行用語とドキュメントを整理し、active Markdown link contractを追加した。詳細は[`archive/r29-h-active-documentation-naming-cleanup.md`](./archive/r29-h-active-documentation-naming-cleanup.md)を参照する。
