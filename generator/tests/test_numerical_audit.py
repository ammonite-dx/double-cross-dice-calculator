import numpy as np

from dx_precompute.constants import (
    DISTRIBUTION_SIZE,
    DX_CRITICAL_VALUES,
    KAZANARI_VALUES,
    SHIHAI_VALUES,
)
from dx_precompute.d10 import generate_raw_d10_distributions
from dx_precompute.dr import generate_raw_kazanari_distributions
from dx_precompute.dx import generate_raw_shihai_distributions
from dx_precompute.livingdead import (
    generate_raw_livingdead_distributions,
)
from dx_precompute.polynomials import (
    round_normalized_probabilities,
)

RAW_PROBABILITY_TOLERANCE = 1e-12
RAW_TOTAL_TOLERANCE = 1e-10
SAVED_TOTAL_TOLERANCE = 1e-12
ROUNDING_TOLERANCE = 1e-6 + 1e-12


def _audit_distribution(
    raw: np.ndarray,
    context: str,
) -> np.ndarray:
    assert raw.shape == (DISTRIBUTION_SIZE,), context
    assert np.all(np.isfinite(raw)), context
    assert float(raw.min()) >= -RAW_PROBABILITY_TOLERANCE, context
    assert float(raw.max()) <= 1 + RAW_PROBABILITY_TOLERANCE, context

    raw_total = float(raw.sum())
    assert abs(raw_total - 1) <= RAW_TOTAL_TOLERANCE, context
    saved = round_normalized_probabilities(raw)

    assert np.all(np.isfinite(saved)), context
    assert np.all(saved >= 0), context
    assert np.all(saved <= 1), context
    assert (
        float(np.max(np.abs(saved - raw), initial=0))
        <= ROUNDING_TOLERANCE
    ), context

    saved_total = float(saved.sum())
    assert abs(saved_total - 1) <= SAVED_TOTAL_TOLERANCE, context

    return saved


def _assert_support(
    distribution: np.ndarray,
    minimum: int,
    maximum: int,
    context: str,
) -> None:
    assert not np.any(distribution[:minimum]), context
    assert not np.any(distribution[maximum + 1 :]), context


def test_d10_full_range_numerical_audit() -> None:
    for dice, raw in enumerate(generate_raw_d10_distributions()):
        context = f"d10 dice={dice}"
        saved = _audit_distribution(raw, context)
        minimum = 0 if dice == 0 else dice
        maximum = min(10 * dice, DISTRIBUTION_SIZE - 1)
        _assert_support(saved, minimum, maximum, context)


def test_livingdead_full_range_numerical_audit() -> None:
    for dice, raw in enumerate(generate_raw_livingdead_distributions()):
        context = f"livingdead dice={dice}"
        saved = _audit_distribution(raw, context)
        minimum = 0 if dice == 0 else dice
        maximum = (
            0
            if dice == 0
            else min(10 * dice - 9, DISTRIBUTION_SIZE - 1)
        )
        _assert_support(saved, minimum, maximum, context)


def test_dx_full_range_numerical_audit() -> None:
    for shihai in SHIHAI_VALUES:
        generated = generate_raw_shihai_distributions(shihai)
        for dice, critical_entries in enumerate(generated):
            for critical, raw in zip(
                DX_CRITICAL_VALUES,
                critical_entries,
                strict=True,
            ):
                context = (
                    f"dx dice={dice}, critical={critical}, "
                    f"shihai={shihai}"
                )
                saved = _audit_distribution(raw, context)

                if dice <= shihai:
                    expected = np.zeros(DISTRIBUTION_SIZE)
                    expected[0] = 1
                    np.testing.assert_array_equal(saved, expected)
                    continue

                _assert_support(
                    saved,
                    1,
                    10 if critical == 11 else DISTRIBUTION_SIZE - 1,
                    context,
                )
                if critical <= 10:
                    assert not np.any(saved[10:-1:10]), context


def test_dr_full_range_numerical_audit() -> None:
    for kazanari in KAZANARI_VALUES:
        generated = generate_raw_kazanari_distributions(kazanari)
        for dice, raw in enumerate(generated):
            context = f"dr dice={dice}, kazanari={kazanari}"
            saved = _audit_distribution(raw, context)
            minimum = 0 if dice == 0 else dice
            maximum = min(10 * dice, DISTRIBUTION_SIZE - 1)
            _assert_support(saved, minimum, maximum, context)
