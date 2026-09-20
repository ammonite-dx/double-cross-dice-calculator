# R27-B2b: Typed CalculationClient implementation

## 目的

R27-B2aで型付けしたrequest coordinationとfeedback runtimeを前提に、計算runtimeの公開facadeである`CalculationClient`をstrict TypeScriptの対象へ移行した。今回の目的は計算式を整理することではなく、入力の正規化、依存性注入、範囲計画、資源lease、計算結果の境界を既存の実行順序と互換性を保ったまま明示することである。

## 実装

- `src/runtime/CalculationClient.js`を`src/runtime/CalculationClient.ts`へ移行し、`CalculationRangeError`、`createCalculationClient`、`createCalculationDependencies`、default singletonの公開exportを維持した。
- `CalculationClientDependencyTypes.ts`を追加し、Score、Damage、D10、DX、Backtrack、Damage aggregation、RangePlanner、ResourceGuard、runtime DR clientの依存契約を分離した。partial dependency bundleを受ける`createCalculationClient`と、production defaultsをmergeして返す`createCalculationDependencies`を別の型で表現した。
- raw public inputとnormalization後の内部入力を分離した。Checkの省略・部分difficulty、Backtrackの部分入力、Attackのreaction resolutionは既存normalizerへ渡し、runtimeのdefaultとvalidationを変更していない。
- Check、Attack、Backtrackのrange planをoperation literalとoperation-specific plan型へ接続した。`onRangePlan`は同期通知のまま、rejected planは従来の`CalculationRangeError`で停止する。
- DX providerは従来の位置引数adapterを維持し、cache keyの`dice`、`critical`、`shihai`、`yousei`、`workingLength`、`fftLength`と32件LRUを変更していない。`normalizeDxOptions`後の`workingLength`を内部型で必須とした。
- ResourceGuardの`ResourceLease | Promise<ResourceLease>`を明示的に分岐し、同期leaseへ不要な`await`境界を追加していない。Check、Attack、Backtrack、Total Damageの全経路で、計算・abort・例外後も`finally`からreleaseする。
- Total Damageでは、lease取得前にcaller-owned配列をsnapshotし、同じsnapshotでplanを作成して`sumDamage`へ渡す。aggregation optionは`maxValuesLength`、`maxFftLength`、`maxResourceBytes`、`maxComponents`、`signal`、`onFftLength`のwhitelistだけを通す。invalidまたはtest-doubleのenvelopeは従来どおりcopy helperで元値へfail-openする。
- Backtrack adapterの歴史的な第2引数`undefined`を保持し、execution pathにあった無視される余分な引数だけを削除した。
- `checkJs:false`を維持し、計算core、ResourceGuard、Runtime Damage Roll client、Worker、range policyなどの依存モジュールは今回TypeScript化していない。runtimeからVueやfeatureへの依存も追加していない。

## 回帰テスト

`tests/typecheck/calculation-contracts.ts`へ、default clientの型、Checkの省略・部分difficulty、部分Backtrack入力、operation別plan callback、dependency override、不正dependency returnのcompile-time契約を追加した。runtime architecture testとCalculationClient source testは`.ts`の実体パスへ追従させ、実験用の明示的なmodule pathも更新した。

## 非対象

DX、Score、Damage、Backtrackの計算式、tail certificate、表示projection、range policy、ResourceGuardの閾値、Worker protocol、latest-winsの動作は変更していない。依存モジュール全体のTypeScript化、外部API化、Cloudflare構成変更も行っていない。

## 検証

`npm run verify:all`が成功した。Vitestは104 files / 1099 tests、TypeScript typecheck、ESLint、Markdown lint（87 files / 0 issues）、production build（459 modules）、`git diff --check`が成功した。production browser smokeはCheck、Attack、Backtrackの全シナリオで成功し、precomputed requests 0件、AttackのD10 requests 0件、表示範囲超過時のrejectionと回復、browser diagnostics 0件を確認した。reference verificationは32 assets、reference Vitest 7 files / 53 tests、generator通常18 tests、simulation 13 tests、Ruffが成功した。runtime DX 20,000 casesは比較許容誤差`0.000001000001`、最大絶対差`8.999999999999999e-7`、最大総和誤差`1.4432899320127035e-15`、非有限値0件、負値0件で成功した。`npm run benchmark:full-tail-attack`も成功し、result digestは`989000341.161962`、全ケースのerrorは`-`だった。

## 次の作業

次はR27-B2cとして、実測した依存状況に応じて`RuntimeDamageRollClient.js`、`ResourceGuard.js`、`CheckRangePolicy.js`のうち最も境界効果の大きいruntime moduleを一つずつ型付けする。今回の依存契約と同様、実装を変更する前に既存の同期性、cache、lease、Worker protocolを回帰テストで固定する。
