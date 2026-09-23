# R30-prep: 《屍人》runtime最適化と表示丸めの安定化

## 結果

《屍人》のruntime計算を、最大値と効果後の値を同時に保持するDPから、最大値で上限を設けた合計分布のDPへ置き換えた。計算ルールは従来どおり$Y_n=\sum_i X_i-\max_i X_i+1$であり、静的JSON、generator、公開画面のレイアウトは変更していない。Check、Attack、Backtrackの百分率・要約表示では、小数1桁への丸めを共通実装へ統一した。

作業開始時のHEADは`cfb138f6e1c667b33d563893da996c8495018a89`。この記録は実装後の仕様と検証をまとめたもので、公開準備、license整理、API/MCP、generator・参照assetの変更は対象外である。

## 《屍人》の計算方式

正の$n$について、10面ダイスの出目を$X_1,\ldots,X_n$、合計を$S_n$、最大値を$M_n$とする。《屍人》適用後の値は$S_n-M_n+1$である。0個のダイスは値0の点分布として別に扱う。runtimeは$m=1,\ldots,10$について、すべての出目が$m$以下で合計が$s$となる確率$C_{m,n}(s)$を計算する。

$$
C_{m,n}(s)=P(X_1\le m,\ldots,X_n\le m,S_n=s),\qquad C_{m,n}(s)=\frac{1}{10}\sum_{r=1}^{m}C_{m,n-1}(s-r).
$$

最大値がちょうど$m$となる確率は$C_{m,n}(s)-C_{m-1,n}(s)$であるため、$s-m+1$の位置に差分を足せば最終分布が得られる。漸化式の和は移動窓で計算し、各$m$の配列を大きい合計から小さい合計へ上書きする。10個の状態配列の長さはそれぞれ`10 * maxDice + 1`である。要求されたダイス数でのみ出力分布を射影する。

このDPの中間状態は確率質量の一部であり、$C_{m,n}$の総質量は$(m/10)^n$である。出力では差分による負値を検査し、$10^{-12}$以下の微小な負値だけを0にして正規化する。非常に小さいtailの相対精度は保証しない。0〜4個のダイスについて全出目列を列挙する独立テストを追加し、103Dでは小数化された歴史fixtureと絶対誤差`6e-7`未満で一致することを確認する。通常D10のendpoint相対精度テストは従来どおり維持する。

## ResourceGuardの見積りと受付境界

《屍人》のgeneration workは`14 * maxDice * workingLength`で見積もる。この14は境界を校正する係数であり、literalなloop countではない。既存の1億operations上限は変更せず、BacktrackのD10 work係数も変更していない。845Dはworking length 8442、見積り99,868,860 operationsで受理され、実際に完全supportを生成してfinite・non-negative・総質量1を確認する。846Dは上限を超えて`backtrack-generation`で拒否される。

メモリ見積りには、《屍人》の10本のbounded-sum状態配列、生成分布最大3本、射影・正規化の一時配列、最終結果3本を含める。845Dのplanではgeneration/base領域が1,013,760 bytes、最終結果が202,608 bytes、合計1,216,368 bytesと算出される。通常D10の見積りは従来の`5 * workingLength`個のgeneration Float64要素と`3 * workingLength`個の最終結果Float64要素のままであり、追加状態配列を加えない。

## 数値表示の安定化

`roundToOneDecimal`を共通化し、Chartの百分率とSummary値を同じ規則で表示する。値を10倍したときに、小数第1位の丸め境界である`.5`から`1e-9`以内ならその中間点へsnapしてから`Math.round`を適用する。許容誤差を全値へ足すことはしない。0.7955付近のChart値を79.6%とするテストに加え、Check summary、Backtrack presentation、Attack chartの表示回帰テストを追加した。《屍人》6D、侵蝕率119の該当区分は79.6%となる。

## 性能記録

変更前の探索測定では、max/sum状態DPの301Dケースが約1.1秒、bounded-sum方式の同規模プロトタイプが約0.14秒だった。845Dケースのbounded-sum事前測定値は約1.1秒だった。これらは実装前の探索測定であり、厳密な比較ベンチマークではない。実装後にVitestで845D受理ケースを単独実行したところ、計画・生成・検査を含むテスト全体は112msだった。この値は専用ベンチマークではなく、事前測定と環境や計測範囲を揃えた比較ではないため、速度改善率の主張には使用しない。

## 検証とコミット

- Runtime DP: 0〜4Dの完全列挙、103D歴史fixtureとの比較、Abort、845D受理・846D拒否を検証する。
- Presentation: 小数1桁の中間値、Check summary、Attack chart、Backtrack chartの回帰を検証する。
- `npm run verify:all`: 成功。Node test 84 files / 993 tests、production browser smoke、reference test 7 files / 54 tests、generator通常18件・simulation13件、Ruff、runtime DX 20,000ケースを含む。
- 845D受理・846D拒否のVitest境界ケースを単独実行した場合、テスト全体の計測時間は112msだった。専用ベンチマークではないため、この値を速度比較の根拠にはしない。
- `npm run lint:markdown`: 107 files / 0 issues。`git diff --check`: 成功。
- 実装コミット: `cfc03b9`（《屍人》bounded-sum kernelとresource guard）、`c1aacb4`（共通小数1桁丸め）。

後続作業は現行[`docs/todo.md`](../todo.md)に従う。R30-prepの完了を理由に公開準備や外部API化を前倒ししない。
