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

reaction resolution、raw snapshot、BigInt境界、planner/producer一致、固定値・強制失敗のcertificate、MAX_SAFE_INTEGER境界を回帰テストで固定した。Node/Vitest、typecheck、ESLint、Markdown lint、production buildを実行して確認する。

R25-Mの次のlive taskはR12の計算core責務分割であり、Cloudflare Worker・HTTP API・MCP化は引き続き将来目標とする。
