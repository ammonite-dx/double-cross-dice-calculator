# R23 visual prototypes

These stylesheets are injected only by `prototype-runner.mjs`. They are comparison candidates, not production CSS, and no selector here is part of the application contract.

- `visual-parity.css` measures the reference-oriented field height, padding, and header alignment candidate.
- `advanced-setting-parity.css` scopes header alignment to the marked `高度な設定` controls.
- `setting-form-parity.css` scopes field geometry to marked SettingForm rows.
- `backtrack-other-reduction-compound-label.css` groups the two Backtrack fields under one visual label without changing their columns.
- `backtrack-other-reduction-wide.css` widens the mobile nested field group (candidate A).
- `backtrack-other-reduction-stack.css` stacks the mobile nested fields (candidate B).
- `footer-flex.css` tests a normal-flow flex shell for short pages without fixed positioning.

The old `visual-parity.css` uses broad selectors and is retained only as rejected decision evidence. Backtrack 6/8/9px label variants are applied to the built JavaScript response by the runner. The source tree remains unchanged.
