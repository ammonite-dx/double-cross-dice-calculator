# R30-prep: Attack reaction-tail damage classification

計算実装コミット: `799a7a7` — `fix: classify losing reaction score tails`。

## 目的と再現条件

Attackでaction側の達成値が有限supportを持ち、reaction側が通常のドッジ判定で無限supportを持つ場合、reaction score tailの一部または全部が命中に影響できないと証明できても、Damage分布に未確定確率として残ることがあった。代表条件はactionの最大達成値が10で、reaction scoreの明示範囲より後ろにあるexact tailのlower boundが10以上となる場合である。

## 原因と修正

対決では`action score > reaction score`のときだけactionが勝つため、tieはreaction側の勝利となる。修正前は`DamageRollRequest`が明示bucket同士だけで命中・失敗を分類し、reaction tail全体を一律にunmodeled probabilityとしていた。期待値certificate側には同じtail判定があったが、配列長を明示範囲の最大値として使っていたため、有限supportの外側にあるゼロ確率の配列要素でtailを分類できない場合もあった。

共通のpure helperで、実際に正の確率を持つactionのregular bucket最大値とreaction tail lower boundを比較する。actionに未解決tailがなく、reactionのexact overflowとcertificateが同じtail massを示し、tailの確率誤差が`DistributionResult`の質量許容誤差以内で、`reaction tail lowerBound >= action regular maximum`を満たすとき、reaction tailをdamage 0のfailure probabilityへ加える。等値でよいのはtieがreaction側勝利だからである。

lower boundがaction maximum未満ならtail内で勝敗を確定できないため、従来どおり保守的なuncertaintyとして残す。action側にも未解決tailがある場合は両tailの相互作用を推測でexact化しない。reaction tailの確率誤差が質量許容誤差を超える場合も分類せず、tail probabilityとerror boundを保つ。分類可能なtail certificateはmetadataに保持し、数値診断の出所を失わない。

## Supportと確率uncertainty

Damageの座標上限はaction score、ダメージロール、固定値、ガード処理から導く。reaction scoreはdamageを増やさず、命中失敗をdamage 0へ送るだけなので、reactionの無限supportだけを理由にDamage coordinate supportを無限にはしない。tail内の勝敗を証明できない確率は、finite coordinate supportと分離して`overflow`およびmetadataに保持する。

明示massの合計と1との差が既存の`DISTRIBUTION_RESULT_TOLERANCE`以内なら、それを追加のunmodeled tailとして数えない。probabilityを1へ正規化することはせず、計算済みmassをそのまま保持する。これにより浮動小数点の微小残差だけからlower bound 0のspurious overflowを作らない。

## 回帰テスト

`damageOnDemand.test.js`はreaction tail lower boundがaction maximumと等しい場合と上回る場合のfailure分類、lower boundが小さい曖昧なtail、action側にもtailがあるケース、tail probability errorが許容誤差を超えるケースを検査する。正のdamageを使い、tail massがdamage 0へ入り、hit weightsとtail metadataを維持することも確認する。`scoreOutcomeSemantics.test.js`は共有比較helperの境界を検査し、`calculationClientIntegration.test.js`はaction critical=11、通常のDXドッジ、正のダメージをCalculationClient経由で通し、finite support、overflow、mass、期待値certificateを確認する。forced failure、Guard、リアクション放棄、《イベイジョン》の既存semanticsは既存suiteで検証する。

## 検証

focused testsは4 files／61 testsが成功した。`npm run verify:browser`と`npm run verify:all`が成功し、full gateでは84 test files／1,008 unit tests、typecheck、ESLint、Markdown lint（111 files／0 issues）、488 modulesのproduction build、production browser smoke、reference assets 32件、reference tests 7 files／54 tests、generator tests 18件、simulation 13件、Ruff、runtime DX 20,000 casesを確認した。独立した`npm run lint`、`npm run lint:markdown`、`git diff --check`も成功した。forced failure、Guard・リアクション放棄、《イベイジョン》の既存semanticsを含む全unit suiteも成功した。

計算実装と回帰テスト、文書更新は別コミットに分ける。
