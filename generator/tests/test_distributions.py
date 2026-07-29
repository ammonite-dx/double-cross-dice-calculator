import numpy as np

from dx_precompute.d10 import generate_d10_distributions
from dx_precompute.dr import (
    _face_range_powers,
    _remaining_low_dice_distributions,
)
from dx_precompute.dx import generate_shihai_distributions
from dx_precompute.livingdead import generate_livingdead_distributions


def test_two_d10_distribution_is_triangular() -> None:
    distribution = generate_d10_distributions()[2]

    np.testing.assert_array_equal(
        distribution[2:21],
        np.asarray(
            [
                0.01,
                0.02,
                0.03,
                0.04,
                0.05,
                0.06,
                0.07,
                0.08,
                0.09,
                0.10,
                0.09,
                0.08,
                0.07,
                0.06,
                0.05,
                0.04,
                0.03,
                0.02,
                0.01,
            ]
        ),
    )


def test_livingdead_two_dice_matches_sum_minus_max_plus_one() -> None:
    distribution = generate_livingdead_distributions()[2]
    expected = np.zeros(1024)
    expected[2:12] = np.arange(19, 0, -2) / 100

    np.testing.assert_array_equal(distribution, expected)


def test_removing_smallest_of_two_low_dice_leaves_the_maximum() -> None:
    generated = _remaining_low_dice_distributions(1, _face_range_powers())[2]
    expected = np.zeros(1024)
    expected[1:6] = np.asarray([1, 3, 5, 7, 9]) / 25

    np.testing.assert_allclose(generated, expected, atol=1e-15)


def test_shihai_zero_one_die_critical_ten_is_normalized() -> None:
    distribution = generate_shihai_distributions(0)[1][8]

    assert distribution.sum() == 1
    assert distribution[1] == 0.1
    assert distribution[9] == 0.1
    assert distribution[10] == 0
    assert distribution[11] == 0.01
