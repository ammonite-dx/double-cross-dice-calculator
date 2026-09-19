# R26-D: Shihai exact-tail closure

## 目的

R26-Cでproduction DXを完全な1DXの順序統計量へ置き換えた後に残っていた、`shihai`境界・planner tail・期待値certificateの意味論を統一した。教科書の《支配の領域》章やPython reference generatorは今回の対象外である。

## 変更点

- `dice=0`はraw DX値0の自動失敗、正の`dice <= shihai`はraw DX値1のファンブルとして保持し、ScoreCalculatorの既存強制失敗経路で最終Score 0へ変換する。
- 正の`shihai`で`dice > shihai`のtailを、完全な1DXのtailと二項上側確率からなるexact order-statistic modelへ変更した。plannerのcutoff、producerのoverflow、tail certificateが同じ式を使う。
- tailの一次モーメントは、`P(Y>x) <= binom(dice, shihai+1) q_c(x)^(shihai+1)`と10刻みの幾何級数から上界を構成する。有限値を安全に構成できない場合は証明書を返さず、旧max支配へ戻さない。
- Score期待値certificateは正の`shihai`にも拡張し、raw値1の確率をtail差から求める。ファンブルには技能値を加えない。
- 通常`shihai=0`・`yousei=0`のCPU見積りを、入力ダイス数ではなくproducerが実際に走査するworking lengthへ統一した。

## 非対象

`yousei`と`shihai`の同時使用、`shihai=0` producerのcanonical経路化、Python generator・既存JSON、UI、ResourceGuardの閾値、教科書本文、Cloudflare Worker/API/MCP化は変更していない。

## 検証

境界raw分布、独立DX oracle、exact order-statistic cutoff、複数critical・複数rankのtail moment、正負技能値のScore期待値、通常DXのoperation estimateを追加・更新した。最終確認ではNode/Vitest、typecheck、ESLint、Markdown lint、production build、reference/browser smoke、full-tail attack benchmarkを実行する。
