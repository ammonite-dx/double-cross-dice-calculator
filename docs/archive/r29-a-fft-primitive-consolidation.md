# R29-A: FFT primitive consolidation

## 目的

production sourceに重複していたradix-2 FFTのtransform kernelを一つの低位primitiveへ集約した。高位のdistribution convolutionとRuntime Damage Rollの計算方式は統合せず、それぞれの責務を維持した。

## 対象と変更

開始時点のHEADは`f6b41b25d812cd64043ca6682c0b55364b87375a`だった。

`src/core/probability/Radix2FFT.js`に`transformRadix2FftInPlace(real, imaginary, inverse, signal)`を追加した。bit reversal、butterfly、inverse normalizationの演算順序は既存のcore FFTをそのまま移し、AbortSignalの確認位置と`AbortError`のname・messageを維持した。

`src/core/probability/FFT.js`はこのprimitiveを使うように変更した。distributionの線形畳み込み、FFT係数のcleanup、異常値の検査、公開exportは従来のままである。

`src/calculation/RuntimeDamageRollCalculator.js`はinverse FFTに同じprimitiveを使うように変更した。DR spectrum生成、有限support、overflow bucket、total-mass correction、`NUMERICAL_EPSILON = 1e-12`、resource estimate、Worker protocolは変更していない。

重複していた`src/calculation/RuntimeDamageRollFFT.js`は削除した。`experiments/runtime-dr/fft.js`は歴史的実装の再現性のため保持した。

## 回帰テスト

`tests/fft.test.js`に次を追加した。

- 4点impulseのforward transform
- 非自明な複素vectorのforward／inverse roundtrip
- primitiveへpre-aborted signalを渡した場合の`AbortError`
- `convolveDistributions`へpre-aborted signalを渡した場合の`AbortError`

既存のRuntime DR oracleとsupport・overflow・可変FFT長のテストは変更していない。

## Abort semantics follow-up

初回のkernel統合後に、`convolveDistributions()`の高位Abort checkpointが失われていたため、R29-Aのclosure follow-upで復元した。Abort判定を`throwIfFftAborted()`として共有primitiveからexportし、入力検証後、FFT長callback後、周波数領域の乗算後、inverse FFT後に従来のcheckpointを置いた。これにより、pre-aborted requestでは`onFftLength`を呼ばず、不正な`fftLength`より`AbortError`を優先する。

## 検証結果

- focused FFT Vitest: 16 tests passed
- `npm run verify:all`: 通常Vitest 88 files／1022 tests、production build 458 modules、browser smoke PASS
- browser smoke: Check／Attack／Backtrackのprecomputed requests 0、console warnings/errors 0、same-origin HTTP errors 0
- reference gate: 32 assets、reference Vitest 7 files／53 tests、generator通常18 tests、simulation 13 tests、ruff、runtime DX 20,000 cases passed
- `npm run test:experiments`: 11 files／65 tests passed
- `npm run verify:damage-roll-optimized`: 2030 distributions verified in 38.02 s
- `npm run verify:damage-roll-reference`: 2030 distributions verified in 126.75 s
- optimized／referenceの最大差は`5.976927000342358e-7`（kazanari=6、dice=8、value=55）
- production butterfly implementationの検索結果は`Radix2FFT.js`の1箇所のみで、`RuntimeDamageRollFFT`の参照は0件だった
- `npm run lint`、`npm run typecheck`、`npm run lint:markdown`、`git diff --check`が成功した

## コミット

- `ffe7422` `refactor: consolidate production FFT primitive`
- `bfc3e4c` `docs: record R29-A FFT consolidation`
- `0baf565` `fix: preserve FFT convolution abort checkpoints`
- docs follow-up: `docs: close R29-A abort follow-up`

## 次の作業

R29-Aを完了し、次はDamage aggregationのplan contract convergence（R29-B）へ進む。R29-AではTypeScript化、resource policy変更、Worker／API／MCP化、公開準備には着手していない。
