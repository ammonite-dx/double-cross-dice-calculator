from dataclasses import dataclass
from math import log, sqrt

import numpy as np
import pytest
from scipy.stats import chisquare
from simulation_rolls import (
    simulate_d10_sum,
    simulate_dx,
    simulate_kazanari,
    simulate_livingdead,
)

from dx_precompute.d10 import generate_d10_distributions
from dx_precompute.dr import generate_kazanari_distributions
from dx_precompute.dx import generate_shihai_distributions
from dx_precompute.livingdead import generate_livingdead_distributions

TRIALS = 200_000
FAMILY_ALPHA = 0.01
MINIMUM_EXPECTED_COUNT = 5


@dataclass(frozen=True)
class SimulationCase:
    dataset: str
    dice: int
    seed: int
    critical: int | None = None
    effect: int = 0

    @property
    def identifier(self) -> str:
        parameters = [self.dataset, f"dice={self.dice}"]
        if self.critical is not None:
            parameters.append(f"critical={self.critical}")
        if self.effect:
            parameters.append(f"effect={self.effect}")
        return ", ".join(parameters)


CASES = (
    SimulationCase("d10", 1, 1001),
    SimulationCase("d10", 99, 1002),
    SimulationCase("d10", 223, 1003),
    SimulationCase("livingdead", 1, 2001),
    SimulationCase("livingdead", 99, 2002),
    SimulationCase("livingdead", 219, 2003),
    SimulationCase("dx", 1, 3001, critical=10),
    SimulationCase("dx", 10, 3002, critical=8),
    SimulationCase("dx", 20, 3003, critical=7, effect=3),
    SimulationCase("dx", 99, 3004, critical=2, effect=19),
    SimulationCase("dr", 1, 4001),
    SimulationCase("dr", 50, 4002, effect=3),
    SimulationCase("dr", 202, 4003, effect=9),
)
CASE_ALPHA = FAMILY_ALPHA / len(CASES)
DKW_LIMIT = sqrt(log(2 / CASE_ALPHA) / (2 * TRIALS))


@pytest.fixture(scope="module")
def expected_distributions() -> dict[str, object]:
    return {
        "d10": generate_d10_distributions(),
        "livingdead": generate_livingdead_distributions(),
        "dx": {
            shihai: generate_shihai_distributions(shihai)
            for shihai in {case.effect for case in CASES if case.dataset == "dx"}
        },
        "dr": {
            kazanari: generate_kazanari_distributions(kazanari)
            for kazanari in {
                case.effect for case in CASES if case.dataset == "dr"
            }
        },
    }


def _expected_distribution(
    case: SimulationCase,
    generated: dict[str, object],
) -> np.ndarray:
    if case.dataset in {"d10", "livingdead"}:
        return generated[case.dataset][case.dice]  # type: ignore[index]
    if case.dataset == "dx":
        assert case.critical is not None
        return generated["dx"][case.effect][case.dice][  # type: ignore[index]
            case.critical - 2
        ]
    return generated["dr"][case.effect][case.dice]  # type: ignore[index]


def _simulate(case: SimulationCase) -> np.ndarray:
    rng = np.random.default_rng(case.seed)
    if case.dataset == "d10":
        return simulate_d10_sum(rng, TRIALS, case.dice)
    if case.dataset == "livingdead":
        return simulate_livingdead(rng, TRIALS, case.dice)
    if case.dataset == "dx":
        assert case.critical is not None
        return simulate_dx(
            rng,
            TRIALS,
            case.dice,
            case.critical,
            case.effect,
        )
    return simulate_kazanari(
        rng,
        TRIALS,
        case.dice,
        case.effect,
    )


def _merge_chi_square_bins(
    observed: np.ndarray,
    expected_counts: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    observed_bins: list[float] = []
    expected_bins: list[float] = []
    observed_total = 0.0
    expected_total = 0.0

    for observed_count, expected_count in zip(
        observed,
        expected_counts,
        strict=True,
    ):
        observed_total += float(observed_count)
        expected_total += float(expected_count)
        if expected_total >= MINIMUM_EXPECTED_COUNT:
            observed_bins.append(observed_total)
            expected_bins.append(expected_total)
            observed_total = 0.0
            expected_total = 0.0

    if expected_total or observed_total:
        if expected_bins:
            observed_bins[-1] += observed_total
            expected_bins[-1] += expected_total
        else:
            observed_bins.append(observed_total)
            expected_bins.append(expected_total)

    observed_array = np.asarray(observed_bins)
    expected_array = np.asarray(expected_bins)
    expected_array *= observed_array.sum() / expected_array.sum()
    return observed_array, expected_array


@pytest.mark.simulation
@pytest.mark.parametrize("case", CASES, ids=lambda case: case.identifier)
def test_precomputed_distribution_matches_simulation(
    case: SimulationCase,
    expected_distributions: dict[str, object],
) -> None:
    expected = _expected_distribution(case, expected_distributions)
    expected = expected / expected.sum()
    samples = _simulate(case)
    observed = np.bincount(samples, minlength=expected.size)

    empirical_cdf = np.cumsum(observed) / TRIALS
    expected_cdf = np.cumsum(expected)
    cdf_difference = float(
        np.max(np.abs(empirical_cdf - expected_cdf))
    )

    observed_bins, expected_bins = _merge_chi_square_bins(
        observed,
        expected * TRIALS,
    )
    if expected_bins.size > 1:
        statistic, p_value = chisquare(
            observed_bins,
            f_exp=expected_bins,
        )
    else:
        statistic = 0.0
        p_value = 1.0

    print(
        f"{case.identifier}: chi2={statistic:.3f}, "
        f"p={p_value:.6g}, cdf={cdf_difference:.6g}, "
        f"dkw={DKW_LIMIT:.6g}"
    )
    assert p_value >= CASE_ALPHA
    assert cdf_difference <= DKW_LIMIT
