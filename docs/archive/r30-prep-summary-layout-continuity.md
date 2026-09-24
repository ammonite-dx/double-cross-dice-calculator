# R30-prep: summary layout continuity

## 目的と開始点

入力変更後のreplacement計算中にCheck／Attackのサマリー行がunmountされ、文書全体の高さが縮むことでfooterが一時的に上へ移動するちらつきを防いだ。レビュー指定の開始HEADは`cc964797507447debe7f75a6f2b547459f5f509f`で、開始時の作業ツリーはcleanだった。

実装コミット: `a706172` — `fix: preserve summary layout during recalculation`。

## 実装方針

サマリーの古い値をcurrent resultとして保持するのではなく、共有`LayoutFootprintRow`がreadyなVuetify rowの実測高さだけを記録する。replacement中、ready slotが外れる直前に現在のrow高さを測定し、その要求がloadingである間だけ`min-height`として適用する。row自体を維持するためgrid構造は変えず、初回計算など過去のready高さがない場合はrowを非表示にして不要な空白を作らない。

新しいsummaryがreadyになれば`ResizeObserver`とDOM更新後の測定で新しい高さへ更新する。readyでない状態がloading以外になった時点で高さcacheを破棄しrowを隠すため、error、resource rejection、Abort後の明示的invalidateでlayout cacheが次の要求へ残らない。SummaryPanelの値やCheck／Attackのcalculation stateは保持しない。

Checkは`rangeFeedback.status`、Attackは既存score／damage chart transition pending stateをlayout rowへ伝える。Backtrackの構造、計算アルゴリズム、結果契約、latest-wins、Abort、ResourceGuard、footerのnormal-flow配置は変更していない。

## ブラウザ回帰検査

production browser smokeでは、通常の有効入力変更の直前から、旧summary nodeのunmountとreadyなsummary tableを持つ新nodeの再mountまで`requestAnimationFrame`と`ResizeObserver`でmain content高さ、summary row高さ、footerのdocument座標を追跡する。CheckとAttackそれぞれで遷移中にいずれも縮まないことを確認し、既存のcanvas node identity検査も同じ入力変更で継続する。汎用のresult-change待機がsummary tableの一時消失で早期終了しても、continuity assertionはready summaryの再mountまでtrackerを停止しない。

Checkのrejected display request後に新しい入力を変えた場合にstale summaryを表示しない既存検査を維持した。Attackのdisplay resource rejectionでもSummaryPanelが消えることを確認し、回復後に新しいsummaryが再表示されることを確認する。Backtrackの3 chart continuityとresource rejection後のclear／recoveryも継続して確認した。

## 検証

- `npm run verify:all`: 成功。Vitest 84 files / 997 tests、typecheck、ESLint、Markdown lint、488 modulesのproduction build、browser smoke、32 assets verification、reference tests 7 files / 54 tests、generator tests 18件、simulation 13件、Ruff、runtime DX 20,000 casesを含む。
- 最終smoke assertion（Attackのresource rejection後にsummaryが非表示であること）追加後、`npm run verify:browser`、`npm run lint`、`git diff --check`も成功した。
- 本記録を含む最終Markdown lintは110 files / 0 issues。

このfollow-upはlayout continuityだけを扱う。別途報告されたAttackのcritical 11／防御側ドッジ時のdamage分布問題は今回のレビュー指定範囲に含めず、ここでは変更していない。
