from __future__ import annotations

from math import comb

import numpy as np

from .constants import DR_DICE_COUNT, FFT_SIZE, WORKING_DISTRIBUTION_SIZE
from .polynomials import (
    Distribution,
    aggregate_overflow,
    convolution_powers,
    die_distribution,
    round_normalized_probabilities,
    subtract_shifted,
)


def _face_range_powers() -> dict[int, list[Distribution]]:
    powers = {
        first_face: convolution_powers(
            die_distribution(
                range(first_face, 6),
                0.2,
                size=WORKING_DISTRIBUTION_SIZE,
            ),
            DR_DICE_COUNT,
            size=WORKING_DISTRIBUTION_SIZE,
        )
        for first_face in range(1, 6)
    }
    empty = [
        np.zeros(WORKING_DISTRIBUTION_SIZE, dtype=np.float64)
        for _ in range(DR_DICE_COUNT)
    ]
    empty[0][0] = 1.0
    powers[6] = empty
    return powers


def _remaining_low_dice_distributions(
    max_rerolls: int,
    face_range_powers: dict[int, list[Distribution]],
) -> list[Distribution]:
    """
    Distribution of the low dice that remain after removing the smallest dice.

    The threshold face partitions rolls into values below, equal to, and above
    the final removed die. Values below the threshold are all removed, so only
    their count is required.
    """
    distributions = [
        np.zeros(WORKING_DISTRIBUTION_SIZE, dtype=np.float64)
        for _ in range(DR_DICE_COUNT)
    ]

    for dice in range(max_rerolls + 1, DR_DICE_COUNT):
        distribution = distributions[dice]
        for threshold in range(1, 6):
            below_probability = (threshold - 1) / 5
            for below_count in range(max_rerolls):
                if below_count > dice:
                    break
                if below_probability == 0.0 and below_count > 0:
                    continue

                removed_at_threshold = max_rerolls - below_count
                remaining_count = dice - below_count
                if removed_at_threshold > remaining_count:
                    continue

                below_weight = comb(dice, below_count) * (
                    below_probability**below_count
                )
                eligible = face_range_powers[threshold][remaining_count].copy()

                for threshold_count in range(removed_at_threshold):
                    above_count = remaining_count - threshold_count
                    excluded_weight = (
                        comb(remaining_count, threshold_count)
                        * 0.2**threshold_count
                    )
                    subtract_shifted(
                        eligible,
                        face_range_powers[threshold + 1][above_count],
                        threshold * threshold_count,
                        excluded_weight,
                    )

                shift = threshold * removed_at_threshold
                distribution[: WORKING_DISTRIBUTION_SIZE - shift] += (
                    below_weight * eligible[shift:]
                )

        distribution[np.abs(distribution) < 1e-15] = 0.0

    return distributions


def generate_raw_kazanari_distributions(
    kazanari: int,
) -> list[Distribution]:
    """Generate distributions indexed by damage-roll dice count."""
    one_d10 = die_distribution(range(1, 11), 0.1, size=FFT_SIZE)
    one_high_die = die_distribution(range(6, 11), 0.2, size=FFT_SIZE)
    d10_fourier = np.fft.rfft(one_d10)
    high_fourier = np.fft.rfft(one_high_die)

    if kazanari == 0:
        return [
            aggregate_overflow(
                np.fft.irfft(d10_fourier**dice, n=FFT_SIZE),
                WORKING_DISTRIBUTION_SIZE,
            )
            for dice in range(DR_DICE_COUNT)
        ]

    low_remaining = _remaining_low_dice_distributions(
        kazanari,
        _face_range_powers(),
    )
    low_remaining_fourier = [
        np.fft.rfft(distribution, n=FFT_SIZE)
        for distribution in low_remaining
    ]

    result: list[Distribution] = []
    reroll_fourier = d10_fourier**kazanari
    for dice in range(DR_DICE_COUNT):
        total_fourier = np.zeros(FFT_SIZE // 2 + 1, dtype=np.complex128)
        denominator = 2.0**dice

        for low_count in range(dice + 1):
            weight = comb(dice, low_count) / denominator
            high_count = dice - low_count
            if low_count <= kazanari:
                term = d10_fourier**low_count
            else:
                term = reroll_fourier * low_remaining_fourier[low_count]
            total_fourier += weight * term * high_fourier**high_count

        distribution = aggregate_overflow(
            np.fft.irfft(total_fourier, n=FFT_SIZE),
            WORKING_DISTRIBUTION_SIZE,
        )
        distribution[np.abs(distribution) < 1e-15] = 0.0
        result.append(distribution)

    return result


def generate_kazanari_distributions(kazanari: int) -> list[Distribution]:
    return [
        round_normalized_probabilities(distribution)
        for distribution in generate_raw_kazanari_distributions(kazanari)
    ]
