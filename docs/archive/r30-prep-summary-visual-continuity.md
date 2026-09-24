# R30-prep: summary visual continuity

## 目的と開始点

Check／Attackで入力変更時にサマリーカードが一度DOMから外れ、保持された高さだけの空白を経て再表示されるちらつきを解消した。前回の[`summary layout continuity`](./r30-prep-summary-layout-continuity.md)でfooterの位置ずれは解消していたが、カード自体の視覚的な連続性は残っていた。

開始HEADは`8fd8d51c199e84480dd3891b4e4d78ed17f49fc5`。この作業では計算結果、latest-wins、Abort、ResourceGuard、footer layoutの契約を変更していない。

## 表示frameの保持

Checkの`SummaryPanel`は、readyな`CheckCalculationRecord`の入力snapshotにあるdifficultyと`scoreStatistics`をUI専用frameとして保持する。計算stateがinvalidateされてcurrent recordがないreplacement loading中だけ前回frameを描画し、次のready recordが届けば新しいframeへ置き換える。difficultyは現在のフォーム値ではなく、表示中の統計と同じ計算recordから取得するため、旧統計と新difficultyが混ざらない。

Attackの`SummaryPanel`もUI専用frameを保持し、comboのID・名前を配列ごと複写したものと`displayPresentation`、`scoreDisplayPresentation`をひとまとまりにする。reactiveなcombo編集stateを直接cacheしないため、loading中に新しい名前と古い数値が混ざらない。ready状態での単純なrenameでは、frameを更新して名前を反映する。

両方ともcurrent calculation stateへ旧値を戻さず、`resultReady`／`summaryReady`の意味も変更しない。初回計算ではframeがないためcardも空の高さも表示せず、replacementがloadingでないerror・rejection・invalidateではcacheをclearする。成功時には既存のSummaryPanel内で値を更新し、カードとtableのDOM nodeを維持する。`LayoutFootprintRow`は、最終的な表示内容の高さが変わる場合に備えて引き続き使用する。

## ブラウザ回帰検査

初回Check／Attackの計算では、空のSummary cardや空のlayout footprintが描画されず、readyなtableが表示されることを追跡する。通常のdice入力変更では、MutationObserver、ResizeObserver、animation-frame samplingにより元のcardとtableがdisconnect・非表示・高さ0にならないことを確認し、同じnode上でsummary textが新しいready値へ変化することまで待つ。footer／content／summary rowの高さとfooter位置、既存のchart canvas identity検査も維持する。

Checkのrejected display後のinvalidate、Attackのdisplay resource rejectionではstale summaryが残らないことを確認し、入力・表示範囲を回復した後に新しいready summaryが戻ることも確認する。Backtrackの既存chart continuityとrejection recoveryは変更していない。

## 検証

- `npm run verify:all`: 成功。Vitest 84 files / 1008 tests、typecheck、ESLint、Markdown lint 112 files / 0 issues、488 modulesのproduction build、production browser smoke、32 reference assets、reference tests 54件、generator tests 18件、simulation 13件、Ruff、runtime DX 20,000 casesを含む。smokeではCheck／Attack初回summary、summary/card/table continuityと内容更新、rejection後のclearとrecovery、chart continuity、footer/layout continuity、Backtrack回帰を確認した。
- `npm run verify:browser`: 成功。
- `npm run typecheck`: 成功。
- `npm run lint`: 成功。
- `npm run lint:markdown`: 成功、112 Markdown files / 0 issues。
- `git diff --check`: 成功。
