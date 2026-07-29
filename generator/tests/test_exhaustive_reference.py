import numpy as np
import pytest
from reference_rolls import (
    enumerate_d10_sum,
    enumerate_dx,
    enumerate_kazanari,
    enumerate_livingdead,
)

from dx_precompute.d10 import generate_d10_distributions
from dx_precompute.dr import generate_kazanari_distributions
from dx_precompute.dx import generate_shihai_distributions
from dx_precompute.livingdead import generate_livingdead_distributions

ROUNDING_TOLERANCE = 1e-6 + 1e-12
EXHAUSTIVE_DICE = range(5)
ACCEPTED_KAZANARI = range(10)
ACCEPTED_SHIHAI = range(20)
CRITICAL_VALUES = range(2, 12)


@pytest.fixture(scope="module")
def d10_distributions() -> list[np.ndarray]:
    return generate_d10_distributions()


@pytest.fixture(scope="module")
def livingdead_distributions() -> list[np.ndarray]:
    return generate_livingdead_distributions()


@pytest.fixture(scope="module")
def kazanari_distributions() -> dict[int, list[np.ndarray]]:
    return {
        kazanari: generate_kazanari_distributions(kazanari)
        for kazanari in ACCEPTED_KAZANARI
    }


def test_d10_matches_independent_exhaustive_enumeration(
    d10_distributions: list[np.ndarray],
) -> None:
    for dice in EXHAUSTIVE_DICE:
        np.testing.assert_allclose(
            d10_distributions[dice],
            enumerate_d10_sum(dice),
            atol=ROUNDING_TOLERANCE,
            rtol=0,
            err_msg=f"d10 dice={dice}",
        )


def test_livingdead_matches_independent_exhaustive_enumeration(
    livingdead_distributions: list[np.ndarray],
) -> None:
    for dice in EXHAUSTIVE_DICE:
        np.testing.assert_allclose(
            livingdead_distributions[dice],
            enumerate_livingdead(dice),
            atol=ROUNDING_TOLERANCE,
            rtol=0,
            err_msg=f"livingdead dice={dice}",
        )


def test_kazanari_matches_independent_exhaustive_enumeration(
    kazanari_distributions: dict[int, list[np.ndarray]],
) -> None:
    for kazanari in ACCEPTED_KAZANARI:
        for dice in EXHAUSTIVE_DICE:
            np.testing.assert_allclose(
                kazanari_distributions[kazanari][dice],
                enumerate_kazanari(dice, kazanari),
                atol=ROUNDING_TOLERANCE,
                rtol=0,
                err_msg=f"dr dice={dice}, kazanari={kazanari}",
            )


def test_dx_matches_independent_state_enumeration() -> None:
    for shihai in ACCEPTED_SHIHAI:
        generated = generate_shihai_distributions(shihai)
        for dice in EXHAUSTIVE_DICE:
            for critical in CRITICAL_VALUES:
                np.testing.assert_allclose(
                    generated[dice][critical - 2],
                    enumerate_dx(dice, critical, shihai),
                    atol=ROUNDING_TOLERANCE,
                    rtol=0,
                    err_msg=(
                        f"dx dice={dice}, critical={critical}, "
                        f"shihai={shihai}"
                    ),
                )
