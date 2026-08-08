# Runtime DX browser performance experiment

This experiment compares direct main-thread execution with a resident module Worker for `calculateDxDistribution({ dice, critical, shihai })`. It imports the production calculator from `src/calculation/DxCalculator.js`; the experiment does not copy the distribution algorithm. The Worker transfers the calculated 2048-element `Float64Array` back to the page.

## Run

From the repository root, start the existing Vite development server with `npm run dev -- --host 127.0.0.1`, then open `http://127.0.0.1:3000/experiments/runtime-dx/browser-benchmark.html` in Codex In-app Browser. Leave the page open until it reports `Benchmark complete.` and copy `window.__runtimeDxBenchmarkResult` from the rendered JSON if a machine-readable record is needed. Stop the Vite process after the experiment.

The page performs three warm-up calls and 30 measured warm calls for each case. It also performs four uninterrupted cycles across all four cases to approximate continuous input. For each case, a fresh Worker is created once, its first response includes Worker construction/module startup, and the same Worker handles the warm calls. The separate continuous-input Worker is also resident for all of its cycles.

## Cases

| Case | Input |
| --- | --- |
| shihai=0 representative | `dice=20, critical=8, shihai=0` |
| shihai>0 representative | `dice=20, critical=8, shihai=3` |
| shihai=0 maximum candidate | `dice=99, critical=2, shihai=0` |
| shihai>0 maximum candidate | `dice=99, critical=2, shihai=19` |

The page validates every returned distribution for length, finite values, non-negative probabilities, values at most one, and a total within `1e-8` of one. It compares every Worker result with the main-thread result for the same input and records the maximum absolute difference and differing-bin count.

## Measurement environment and result

Measured on 2026-08-08 in Codex In-app Browser, Chrome 151.0.0.0 on Windows 10. The browser reported `hardwareConcurrency=16`, `deviceMemory=32`, viewport `1280x720`, device pixel ratio `1.5`, and `crossOriginIsolated=false`. CPU throttling and low-speed mobile emulation were not measured because the available browser API did not provide a supported throttle control.

The table below is the second complete run after a page reload. Each warm column contains 30 samples in `median / p95 / max` milliseconds. The last column is the Worker warm round-trip increment over the corresponding main-thread result in the same run, also in `median / p95 / max` milliseconds.

| Case | Main warm median / p95 / max | Worker warm round-trip median / p95 / max | Worker increment |
| --- | ---: | ---: | ---: |
| shihai=0 representative | 0.3 / 0.5 / 0.6 | 0.5 / 0.8 / 0.8 | +0.2 / +0.3 / +0.2 |
| shihai>0 representative | 0.7 / 1.2 / 1.3 | 0.9 / 1.4 / 1.4 | +0.2 / +0.2 / +0.1 |
| shihai=0 maximum candidate | 0.2 / 0.4 / 0.5 | 0.3 / 0.6 / 0.6 | +0.1 / +0.2 / +0.1 |
| shihai>0 maximum candidate | 9.4 / 11.3 / 11.8 | 10.1 / 11.7 / 12.8 | +0.7 / +0.4 / +1.0 |

The first response from a fresh Worker, including Worker construction and module startup, was `9.4 / 8.9 / 8.3 / 18.1` ms for the four cases in the second run. The first-ever page run, before the browser cache was warm, measured `22.3 / 8.8 / 7.6 / 13.9` ms. The Worker was reused for all warm calls within each case; the four per-case Workers were independent so each case has its own startup observation.

The uninterrupted continuous-input sequence ran four cycles over all four cases. The second run measured main-thread `median / p95 / max` of `0.1 / 0.4 / 0.4`, `0.4 / 0.6 / 0.6`, `0.1 / 0.2 / 0.2`, and `5.9 / 6.4 / 6.4` ms, respectively. The resident Worker measured `0.5 / 1.0 / 1.0`, `0.8 / 2.0 / 2.0`, `0.2 / 0.5 / 0.5`, and `8.8 / 10.1 / 10.1` ms, respectively. These continuous-input values have only four samples per case and are supplementary to the 30-sample warm measurements.

Both complete runs had no detected Long Tasks, with the `longtask` PerformanceObserver supported. Every main and Worker result was a 2048-element `Float64Array`; all totals were one within the validation tolerance, with no non-finite, negative, or greater-than-one values. Every repeated result matched exactly: `differentValueCount=0` and `maxAbsoluteDifference=0`.

Console and page diagnostics were clean in both runs: `tab.dev.logs` returned no warning or error entries, and the page recorded no error or unhandled rejection. Five successful `worker.js` resource entries were observed per run (four independent case Workers plus the continuous-input Worker), and every Worker reported ready. The first uncached Worker resource had a nonzero transfer, and subsequent cached resources also had nonzero transfer entries. The exposed browser API does not provide an HTTP status or failed-request listing, so failed-request status was not independently measurable; no failed load surfaced through the page error/console checks or the resource entries used here.

The transferred result buffer is 2048 `Float64` values, or 16 KiB of numeric payload. Worker heap/process resident memory was not exposed by the available browser API and was not measured.

## Decision guidance

For the current input range, direct main-thread execution is the first candidate. The measured maximum warm main-thread call stayed below the 16.7 ms 60 Hz frame budget in both runs (`11.8` and `12.0` ms maximum), and no Long Task was observed. The Worker did not reduce computation time; its warm round-trip added about `0.1` to `0.7` ms at the median and up to `1.0` ms at the maximum in the second run, while also requiring startup, message lifecycle, error handling, termination, and resident memory.

The Worker remains a reasonable follow-up if the supported input range expands, if UI work overlaps the calculation, or if measurements on slower devices push main-thread work over 16.7 ms. Those are future hypotheses, not conclusions from this run. The production UI was not connected by this experiment.
