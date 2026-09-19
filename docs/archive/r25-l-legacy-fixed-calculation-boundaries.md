# R25-L: 旧固定計算境界のproduction撤去

R25-Lでは、事前計算配列に由来する固定境界をproductionの計算計画から撤去した。対象は入力・表示上限ではなく、計算途中の作業範囲を決めるために残っていた`calculationMax`、1022／1023のoverflow境界、1024／2048の既定配列長、Backtrackの歴史的asset coverageである。

## 実装方針

- Scoreは、有限supportなら数学的な最大値まで、無限supportならtail certificateのcutoffと要求されたdisplay windowを満たす範囲まで計算する。有限supportのtail certificateは`finite-support`として扱い、未計算tailを作らない。
- Scoreの出力最大値は`ScoreSupport.getScoreOutputMax`からDamage plannerへ伝える。Damageの最大ダイス数はこの値と攻撃側の追加ダイスから導出し、1022を下限として補わない。
- DXの直接呼び出しは`workingLength`を必須にする。参照fixtureとの比較だけが`tooling/reference-data/ReferenceDataConstants.js`の2048を明示的に使用する。
- DRは入力weightsのraw supportから既定のFFT長・出力長を導出する。明示的に短い出力を要求する場合は、既存のoverflow契約とresource guardを適用する。
- Backtrackは通常D10と《屍人》を常にruntimeで生成する。計画には`generationMode: 'on-demand'`だけを保持し、asset boundaryやasset overflowを含めない。
- published-bucket adapterと1024／2048の参照定数は、歴史的データの再現・比較専用の`tooling/reference-data/`に残す。productionの`src/`からは参照しない。

## 検証

旧固定境界を前提としていたunit・integration・benchmark fixtureを新しい契約へ更新した。DX、DR、Score、Damage、Backtrack、Check、Attack、Worker client、reference adapterのテストを含め、`npm test`は103 files / 1051 testsで成功する。`npm run lint`、`npm run lint:markdown`、`npm run typecheck`、`git diff --check`も成功する。

この変更後も、ゲームルール上のcritical値・safe integer検証、FFT・配列長の絶対resource guard、`ResourceGuard`によるメモリ・同時実行制御は維持する。大きすぎる要求は固定バケットへ黙って切り詰めず、resource rejectionとして扱う。
