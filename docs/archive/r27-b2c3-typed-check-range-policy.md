# R27-B2c3: Typed CheckRangePolicy

## 目的

R27-B2c2までに型付けしたruntime境界へ、Checkのrange policy snapshotを追加した。表示要求、plannerへ渡す表示範囲、ResourceGuardが参照する計算方針を混同せず、既存の実行時検証とエラー意味論を維持したまま、`CheckRangePolicy`の公開契約をstrict TypeScriptへ移行することが目的である。

## 実装

- `src/runtime/CheckRangePolicy.js`を`src/runtime/CheckRangePolicy.ts`へ移行し、`CHECK_RANGE_POLICY_ERROR_CODE`と`createCheckRangePolicy`の公開exportを維持した。
- `createCheckRangePolicy(displayRequest, suppliedPolicy?)`の公開引数を`DisplayRequestSnapshot`と`RangePolicyInput`へ型付けした。内部ではunknown値を検証し、JavaScriptから渡される不正な入力に対する実行時ガードを残した。
- `displayRequest`の`min`、`max`、`mode`がown propertyであること、座標が非負safe integerであること、`min <= max`と点数のsafe integer条件を満たすことを検証する。エラーコード`invalid-display-request`、`invalid-display-min`、`invalid-display-max`、`invalid-display-mode`と、TypeErrorに付与する凍結済み`details`のshapeを維持した。
- 表示座標とmodeはpolicyへコピーしない。これらはplanner requestとして別に伝播し、policy snapshotはResourceGuardの計算資源方針だけを保持する。
- supplied policyはrootのnull、配列、primitiveを拒否し、列挙可能なown string keyを再帰的にcloneする。cloneは共有参照とcycleを維持し、callerのオブジェクトを変更・freezeしない。
- clone後のsnapshotをcycle-safeにdeep freezeする。`display: null`は検証時だけ空のdisplayとして扱い、返却snapshotでは`null`を保持する。`display.maxPoints`は非負safe integerまたはundefinedに限定する。
- 旧`calculationMax`と`display.defaultMin`／`defaultMax`は、値がundefinedであってもown propertyなら拒否する。その他の未知runtime keyは新たに拒否せず、plannerの完全なpolicy検証へ委ねる。
- CalculationClientの意味論は変更していない。display requestがない場合は従来どおりpolicyをそのまま渡し、display requestがある場合だけsnapshotを作成して計算へ渡す。

## 回帰テストと型検査

- `tests/checkRangePolicy.test.js`へ、detached snapshot、deep freeze、caller mutation isolation、共有参照・cycle、prototype由来propertyの拒否、safe-integer境界、mode検証、retired key、`display: null`、malformed policy rootを追加した。
- architecture／validation regressionの対象を`CheckRangePolicy.ts`へ更新し、旧`.js`参照がproduction境界に残らないことを固定した。
- `tests/typecheck/runtime-contracts.ts`へ、`DisplayRequestSnapshot`と`RangePolicyInput`を受けるfactory、及びretired `calculationMax`をpublic typeから拒否する型回帰を追加した。

## 非対象

Checkの計算式、plannerのrange policy merge、表示範囲の既定値、ResourceGuardの閾値、CalculationClientのrequest lifecycle、既存のlegacy compatibility adapterは変更していない。`CheckDisplayRequestSnapshot.js`と`RangePolicy.js`も今回の対象外である。

## 検証

`npm run verify:all`が成功した。Vitestは104 files／1112 tests、Markdown lintは90 files／0 issues、production buildは459 modulesだった。reference suiteは7 files／53 tests、generatorの通常テストは18件、simulationは13件、Ruffとruntime DX 20,000ケースも成功し、runtime DXの最大絶対差は`8.999999999999999e-7`、最大総和誤差は`1.4432899320127035e-15`だった。

`npm run verify:browser`もproduction browser smokeを含めて成功した。Check、Attack、Backtrackの表示、表示範囲の拒否・復帰、precomputed request 0、console warning／error 0、same-origin HTTP error 0を確認した。

`npm run benchmark:full-tail-attack`も成功した。result digestは`989000341.161962`で、DR 202／300／400／600／800D10、Attackの代表ケースを含む全ケースに実行errorはなかった。

## 次の作業

R27-B2c3完了後は、公開準備（ライセンス、出典、公開範囲、再生成手順）と、実測に基づくresource policy調整へ進む。Runtime Damage Roll Worker本体のTypeScript化は別sliceとして扱う。
