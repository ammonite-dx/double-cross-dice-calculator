# R25-M: Reaction score resolution separation

R25-Mでは、防御側の入力座標とScoreの生成方法を分離した。ドッジは通常DXの`rolled-score`、《イベイジョン》は固定達成値の`fixed-score`、ガード・リアクション放棄は`forced-failure`として、plannerとproducerへ同じresolutionを渡す構造にした。

## 実装結果

- DefenceFormとAttack stateは、《イベイジョン》の入力ダイス数・技能値を変換せずraw snapshotとして保持する。
- 《イベイジョン》の固定値は`max(0, 2 * dice + skill)`で導出する。導出前の加算はBigIntで行い、最終値が安全な整数範囲に収まる場合だけNumberへ戻す。
- `ScoreRangePlanner`はrolled-score専用とし、fixed/forcedは疎な1点分布向けのplanを使う。固定値の座標に比例したworking range、FFT、DX配列は作らない。
- `calculateScoreResolution`はresolutionをdispatchし、固定Scoreと強制失敗を`offset`付きの1点`ScoreEnvelope`として生成する。固定Score 0は通常のScore 0、強制失敗は`forcedFailureProbability=1`として区別する。
- plannerのkind・固定値とproducerのresolutionを照合し、plannerだけを通常DXとして実行する不一致を拒否する。
- `DistributionResult`のexplicit最大座標を`offset + values.length - 1`で検証し、`MAX_SAFE_INTEGER`の1点分布を許可する。

## 変更しなかった契約

Damage式、対決判定、presentation、resource limitの数値、Score tail budgetの配分は変更していない。固定・強制失敗のScoreはtailを持たないが、既存のper-side budgetは再配分しない。

## 検証

実装コミット`3d71aaf`を対象に、次の検証を完了した。

- `npm run verify:all`: 成功。Vitestは104ファイル・1064テスト、typecheck、ESLint、Markdown lint（78ファイル・0 issues）、production build（426 modules）、production browser smoke、reference 7ファイル・53テスト、generator通常18件、simulation 13件、Ruff、runtime DXをすべて通過した。
- generatorのデータ検証は32 assetsを検証した。production browser smokeではCheck・Attack・Backtrackの全シナリオでprecomputed/D10リクエスト0件、表示範囲の拒否・回復も確認した。
- runtime DXは20,000ケースで成功した。比較許容誤差は`0.000001000001`、最大絶対差は`8.999999999999999e-7`、最大総誤差は`1.4432899320127035e-15`、非有限値・負値・tail caseはいずれも0件だった。
- `npm run benchmark:full-tail-attack`: 全ケースがruntime canonical経路で測定され、エラーは0件だった。production plannerが`cpu-work`で拒否するケースは、実行時リソース上限による想定どおりの拒否として記録される。結果ダイジェストは`1245155.511306`だった。
- `git diff --check`と作業ツリーのcleanも確認した。

R25-Mの次のlive taskはR12の計算core責務分割であり、Cloudflare Worker・HTTP API・MCP化は引き続き将来目標とする。
