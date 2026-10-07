# R30-prep: B01 order-statistic tail acceleration

## Scope

This work addresses B01 from the [independent repository review](../repository-review-and-kiss-plan.md): positive 《支配の領域》 previously evaluated a binomial survival probability by summing up to $L=\min(r,n-r+1)$ terms, where $r=m+1$. A score planner repeatedly called this sum during tail-cutoff search before it applied resource limits, so a rejected request could occupy the main thread for seconds.

The production algorithm now evaluates $P(K\ge r)=I_q(r,n-r+1)$ using one regularized incomplete-beta primitive. It uses a two-argument modified-Lentz continued fraction that carries $x$ and its complement as separate known values, internal symmetry to evaluate the smaller side, and a stable log front factor using `log1p` relative differences and Stirling corrections. This avoids reconstructing a small probability from a rounded `1 - x`. There is no size-based switch between direct summation and another method, and `shihai=0` keeps its separate maximum-tail formula. The two-argument recurrence follows the form used by [Boost.Math's incomplete-beta implementation](https://github.com/boostorg/math/blob/develop/include/boost/math/special_functions/beta.hpp).

For $L=\min(r,n-r+1)$, the continued-fraction iteration budget is $\min(100000,\lceil4\sqrt{L}+32\rceil)$. Each iteration must satisfy the $2\times10^{-14}$ convergence tolerance; failure to converge throws instead of returning an approximation. The mathematical tail remains the exact order-statistic model, evaluated in floating-point arithmetic.

`ScoreRangePlanner` estimates the same iteration budget as the producer. For unbounded-support score plans it includes up to 42 tail evaluations from `findTailCutoff`, one additional tail-certificate evaluation, and the order-statistic distribution pass. Finite-support plans omit the tail-search portion. No Worker, policy threshold, fixed dice limit, or UI change was introduced.

## Measurements

All results are single local observations, not cross-device performance guarantees. The Node measurements used the same Windows 11 x64 environment with Node 22.23.2 before and after the implementation. The browser remeasurement used source modules served and transformed by the Vite development server in Headless Chrome 154; it is not a production-build benchmark.

| Case | Before: planner | Before: producer | After: planner | After: producer |
| --- | --- | --- | --- | --- |
| 100,000,000 dice, critical 10, shihai 50,000,000 | 13,391.7 ms, rejected as `cpu-work` | Not reached | 2.6 ms, accepted; 23,110,395 operations; 184,883,160 CPU work | 0.7 ms; working length 8; total mass 1 |
| 1,000,000 dice, critical 10, shihai 500,000 | 133.0 ms, accepted | 99.3 ms | 0.25 ms, accepted; 2,338,299 operations | 0.13 ms; working length 8; total mass 1 |
| Typical 8D / 20D / 100D | 0.20 / 0.12 / 0.09 ms | 0.32 / 0.14 / 0.07 ms | 0.23 / 0.21 / 0.10 ms | 0.31 / 0.12 / 0.05 ms |

In Headless Chrome 154, the 100,000,000-dice planner and producer took 1.5 ms and 0.4 ms. A 1,000,000-dice opposed Check with the same score on action and reaction took 0.2 ms to plan and 1.6 ms to calculate; both result masses were 1 and the Long Task observer reported no entries. A direct central-rank tail evaluation with $n=100000000$, $r=50000001$, and $q=0.5$ took 0.7 ms and returned `0.4999601057718085`; SciPy 1.18.0 `scipy.special.betainc` produced `0.49996010577205957`, an absolute difference of approximately $2.5\times10^{-13}$.

### B01-A numerical-stability follow-up (2026-10-07)

The initial symmetry transform computed the complementary argument as `1 - q`. For small $q$ and a very large second beta shape, that rounded complement discarded enough relative precision to move the resulting tail by more than the score-tail error budget. The incomplete-beta primitive now passes the known pair $(q,1-q)$ through the two-argument continued fraction and the log front factor without reconstructing the small member from the rounded large member. The continued-fraction iteration budget, operation estimate, policy thresholds, and worker boundary are unchanged.

The regression grid calls the production `oneDieTail()` to create $q$ and covers $n=10^6,10^8,10^9,10^{12}$ with `required=2` (`shihai=1`, critical 10), a central rank, ranks near 90% of $n$, critical 8, and a near-maximum rank. For `required=2`, expected values use the exact identity $P(K\ge2)=1-(1-q)^n-nq(1-q)^{n-1}$ evaluated at 70-digit Decimal precision; the $10^{12}$ result also agrees with SciPy 1.18.0 `betainc`. SciPy's result for some less extreme `required=2` cases differed from this elementary closed form, so those fixtures use the high-precision identity instead of treating the special-function result as an oracle. The near-maximum case uses $P(K\ge n-1)=q^n+n(1-q)q^{n-1}$; central and other non-edge cases retain fixed SciPy references.

| Re-measured tail | Node 22.23.2 | Headless Chrome 154 | Reference / result |
| --- | ---: | ---: | --- |
| $n=100,000,000$, $r=50,000,001$, $q=0.5$ | 0.25 ms | 0.5 ms | `0.4999601057720554`; SciPy difference about $4.2\times10^{-15}$ |
| $n=1,000,000,000,000$, $r=2$, critical 10, value 116 | 0.014 ms | 0.1 ms | `0.9084218055567689`; agrees with the 70-digit closed form and SciPy |

The 1T edge evaluation converged within its unchanged iteration budget. The added tests also verify the result range, score-tail monotonicity, nonnegative PMF buckets and unit mass, and that `findTailCutoff` keeps the 1T case on the correct side of its $8\times10^{-9}$ error budget. The benchmark observed no browser Long Task. These are representative cases, not a guarantee over every safe-integer input.

The reproducible benchmark is `npm run benchmark:dx-order-statistic`. It reports Node and browser measurements, planner operations and memory estimates, producer mass, the full Check path, and browser Long Task entries. Timing is intentionally not asserted in CI.

## Numerical and regression validation

`tests/dxOrderStatistic.test.js` compares small cases against independent direct enumeration, checks the $r=1$ and $r=n$ identities, validates monotonicity, and compares large values against fixed SciPy and high-precision closed-form references. The reference generators are not JavaScript test dependencies. The grid includes DX-generated probabilities at $n=10^6,10^8,10^9,10^{12}$, critical 8 and 10, required rank 2, central and near-maximum ranks, and the trillion-dice regression at value 116. The planner test verifies both sides of the tail-cutoff error-budget boundary.

The planner tests verify that the 100,000,000-dice reviewed request is accepted under the unchanged default policy and that its CPU estimate includes producer work plus the maximum tail-search and certificate evaluations. Finite-support planner estimates do not charge for a tail search they skip.

## Outcome

B01 is **CLOSED / GREEN** for the reviewed planner, producer, Check, and numerical-stability cases. The complement-precision follow-up restores agreement for the trillion-dice regression while retaining the 100M central-rank performance and unchanged policy thresholds. The measurements are representative evidence, not a guarantee for all devices or inputs. Reopen admission or Worker-boundary work if real use reveals a calculation Long Task of at least 50 ms or repeated evaluations near the iteration cap.
