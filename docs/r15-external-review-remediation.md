# R15 外部レビュー対応記録

レビュー日: 2026-09-07。開始時点のHEADは`31d4862233ccdddc731ed29cfb8de92c0e2d62f1`（`docs: add independent design review`）です。外部レビューのうち、現行実装の正しさと測定基盤に直接関わる指摘を、既存の結果契約と保護領域を維持したまま修正しました。

## 対応した指摘

| 指摘 | 対応 | コミット |
| --- | --- | --- |
| RR-01: Score出力配列の資源見積り不足 | 作業配列とは別に、技能値シフト後の出力バッファ長を`ScoreSupport`で計算し、`RangePlanner`のFloat64配列・メモリ見積りへ加算しました。巨大な技能値は計算開始前に拒否します。 | `9299a04` |
| RR-02: 表示拒否後の古いCheck結果 | 入力変更時に結果とサマリーを失効させ、表示範囲が回復した時点で最新入力から再計算するようにしました。単体テストとproduction browser smokeで、古いサマリーが残らないことを確認します。 | `f3c6cfc`, `eb53073` |
| RR-03: 固定難易度の成功率 | Score tail certificateを使って、明示部分と尾部の成功確率を上下界へ集計します。尾部を持つ通常DXでも、表示精度内で安定するbounded値をサマリーへ渡します。 | `f17ae56` |
| RR-04: Worker中断時のリース解放 | 呼び出し側のAbortによるPromise拒否と、共有Worker要求の実処理完了を分離しました。ResourceGuardのleaseは、Workerの基礎Promiseがsettleしてから解放します。 | `37ab270` |
| 測定基盤の不整合 | full-tail Attack測定で`yousei`とFFT長をproviderへ渡し、実ケースの計算エラーはCLIの非0終了にしました。planner-rejectedは意図した負荷結果として区別します。ブラウザ測定ではcanonical D10の静的取得ゼロを合格条件にし、release gateの重複検証を除きました。 | `aa73437` |
| 本番受入の回帰保護 | production browser smokeへ、拒否中の入力変更・結果失効・回復、および固定難易度サマリーの確認を追加しました。 | `eb53073` |

## 文書・アクセシビリティの修正

「不死者・悪夢」の100%境界は過去の不具合として明示し、現在は`9571f08`で修正済みであることを実行時計算文書へ反映しました。独立設計レビューのソース参照はリポジトリ相対パスへ置き換え、ページの`html lang`は日本語サイトに合わせて`ja`へ変更しました。

## 検証結果

次の検証を実行し、すべて成功しました。

- Node/Vitestの対象テスト: 4ファイル、38テスト。
- production browser smoke: Check／Attack／Backtrack、同一オリジンHTTPエラー0、console warning/error 0、D10静的取得0。
- full-tail Attack Node benchmark: 24ケース、planner-rejectedを除く計算エラー0。
- full-tail Attack browser benchmark: `d10Fetch: true`、`reportStatus: true`、`executionError: 0`。
- production build、ESLint、`git diff --check`。

これらにより、R15のP0/P1指摘は解消しました。Worker全体の常駐化、結果契約の全面再設計、TypeScript化、FFT/D10の追加最適化、Cloudflare Worker/API/MCP化は今回の範囲に含めず、既存ロードマップの後続課題として維持します。
