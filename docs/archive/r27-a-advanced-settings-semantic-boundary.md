# R27-A: Advanced settings semantic boundary

## 目的

高度な設定のチェックボックスは表示状態ではなく、特殊効果を計算へ渡すかどうかを決めるfeature stateである。従来の`showDetails`は表示と計算意味論を同じwatcherに隠していたため、`advancedSettingsEnabled`としてモデルの契約へ明示した。

## 変更点

- Checkはaction/reactionごとの`advancedSettingsEnabled`をfeature modelが所有する。OFFのcanonical scoreでは`yousei`と`shihai`を常に0とし、validated snapshotがUI以外から届いても同じ不変条件を適用する。
- Attackはcomboごとにaction/reactionの`advancedSettingsEnabled`を保持する。OFFのactionでは`yousei`、`shihai`、`kazanari`を0とし、OFFのreactionでは`yousei`と`shihai`だけを0とする。reaction damageは変更しない。
- ONへの切り替えだけでは再計算せず、OFF時にcanonical inputが実際に変わる場合だけinvalidateと再計算を一度行う。OFF後にONへ戻しても、sanitizeされた0値から過去のhidden valueを復元しない。cloneもenabled stateとcanonical inputを同時にコピーする。
- Check/Attackのadvanced settings event chainを`advanced-settings-changed`および`combo-advanced-settings-changed`へ統一し、対象Vueコンポーネントのprops/emitsとside unionを型付き契約へ変更した。
- advanced settings checkbox自身へ`label="高度な設定"`を設定し、実装markupの属性順に依存するテストをsemantic source/controller behaviorのテストへ置き換えた。

## 非対象

CalculationClient全体の型再設計、runtime adapterの全面TypeScript化、AttackRunner lifecycle、全Vueコンポーネントの型付け、chart accessibility、UIデザイン、計算アルゴリズム、resource policy、R26の再修正、公開準備はR27-Aの対象外である。

## 検証

- `npm run verify:all`: 成功。Vitestは105 files / 1099 tests、typecheck・ESLint・Markdown lint（84 files / 0 issues）・build（454 modules）・diff checkが成功した。
- production browser smokeはCheck・Attack・Backtrackの全経路で成功し、precomputed requestsは0件、AttackのD10 requestsは0件、browser diagnosticsは0件だった。
- reference verificationは32 assets、reference Vitest 7 files / 53 tests、generator 18 tests、simulation 13 tests、Ruff、runtime DX 20,000 casesが成功した。runtime DXは比較許容誤差`0.000001000001`、最大絶対差`8.999999999999999e-7`、最大総和誤差`1.4432899320127035e-15`、非有限値0件、負値0件だった。
- `npm run benchmark:full-tail-attack`: 全ケース成功、result digestは`989000341.161962`、errorは全件`-`だった。
- `git status --short`: docs更新前の実装コミット時点でclean。最終docsコミット後もcleanを確認する。

R27-Bでは、今回確定したfeature stateを前提にruntime/application adapterの公開型と依存方向を整理する。
