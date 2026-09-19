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

## Review follow-up

R25-Lのレビューで見つかったfinite-support Scoreの不要なdisplay-source算術、core testからreference toolingへの依存、高難易度success-rate表示、ベンチマークfixtureの命名・経路不整合を修正した。有限supportでは`display.max - skill`を計算せず、critical=11・0ダイスなどの極端な負skillでも数学的supportを安全に計画する。高難易度のsuccess probabilityはtail certificateから`lowerBound=0`かつ十分小さいupper boundとして得られ、表示formatterは`0%`へ確定する。

R25-K時点の歴史的1022／1023記述は、productionから撤去済みであることを追記した。R25-Lの最終gateでは`npm run verify:all`が成功し、core、browser、reference、generator、simulation、runtime DX、build、typecheck、ESLint、Markdown lint、diff checkを確認した。production browser smokeはCheck／Attack／Backtrackすべてで事前計算データ取得0件だった。

今回のfollow-up後も、歴史的fixture・参照adapter・generatorは比較用途として保持する。次のlive taskはR12のcore責務分割であり、Cloudflare Worker／API／MCP化は引き続き別フェーズである。

Follow-upの実装コミットは`b76ec3e`（finite-support計画と回帰テスト）と`27abbc9`（core/referenceテスト分離、policy拒否テスト、benchmark fixture修正）である。`npm run benchmark:full-tail-attack`も成功し、result digestは`1235612.642605`だった。DRは202D〜800Dの全ケース、Attackは400D・600Dを含む全ケースをcanonical経路で完走し、Critical=10・《妖精の手》9回のstressケースは`maxDamageDice=649`、Critical=11・《支配の領域》19個のstressケースは`maxDamageDice=427`となった。実行エラーは0件だった。
