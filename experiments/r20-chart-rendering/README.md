# R20 chart rendering experiment

This experiment compares the former dense Chart.js series with the R20 semantic projection for PMF display. It is deliberately outside the production bundle and does not invoke a calculation client, a worker, or a range calculation. The same finite uniform display is used for each logical range so that rendering density is the variable under test.

Run the normal desktop measurement from the repository root with `npm run benchmark:r20:chart-rendering`. A short run is `npm run benchmark:r20:chart-rendering:short`. Add `--cpu-4x` to the runner command for a Chrome CDP CPU-throttled run. The runner starts a dedicated Vite process and stops it in `finally`; no development server should be left running after completion.

The default cases contain 100, 1,000, 4,096, 16,384, and 20,000 logical integer coordinates. Each case records dense data construction, dense Chart.js update, projection/materialization, projected Chart.js update, rendered point counts, page errors, and Long Task entries. `maxRenderedPoints` is a chart-only budget and never enters a calculation or worker request. The page exposes the machine-readable result as `window.__r20ChartRenderingResult`.

The measurement is evidence for choosing display limits; it is not a promise that every device accepts `0..20000`. Interpret projection semantics and resource rejection together with the `DisplayRangePlanner` policy. A repeatable Long Task of at least 50 ms or a chart update that exceeds the available frame budget is a reason to revisit the policy or move rendering work to a separate phase.
