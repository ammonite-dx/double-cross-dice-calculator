from collections import Counter, defaultdict
from collections.abc import Callable
from functools import cache
from itertools import product

import numpy as np

DISTRIBUTION_SIZE = 1024
D10_FACES = tuple(range(1, 11))
Rolls = tuple[int, ...]


def enumerate_roll_distribution(
    dice: int,
    evaluate: Callable[[Rolls], int],
) -> np.ndarray:
    """Enumerate D10 outcomes without using production probability helpers."""
    counts: Counter[int] = Counter()
    for rolls in product(D10_FACES, repeat=dice):
        counts[evaluate(rolls)] += 1

    distribution = np.zeros(DISTRIBUTION_SIZE, dtype=np.float64)
    denominator = 10**dice
    for value, count in counts.items():
        distribution[value] = count / denominator
    return distribution


def enumerate_d10_sum(dice: int) -> np.ndarray:
    return enumerate_roll_distribution(dice, sum)


def enumerate_livingdead(dice: int) -> np.ndarray:
    def evaluate(rolls: Rolls) -> int:
        if not rolls:
            return 0
        return sum(rolls) - max(rolls) + 1

    return enumerate_roll_distribution(dice, evaluate)


@cache
def _reroll_sum_counts(dice: int) -> Counter[int]:
    counts = Counter({0: 1})
    for _ in range(dice):
        next_counts: Counter[int] = Counter()
        for current_sum, count in counts.items():
            for face in D10_FACES:
                next_counts[current_sum + face] += count
        counts = next_counts
    return counts


def enumerate_kazanari(dice: int, kazanari: int) -> np.ndarray:
    """Enumerate initial rolls and exact reroll-sum counts."""
    distribution = np.zeros(DISTRIBUTION_SIZE, dtype=np.float64)
    initial_probability = 1 / 10**dice

    for rolls in product(D10_FACES, repeat=dice):
        rerolled = sorted(face for face in rolls if face <= 5)[:kazanari]
        retained_total = sum(rolls) - sum(rerolled)
        reroll_counts = _reroll_sum_counts(len(rerolled))
        reroll_denominator = 10 ** len(rerolled)

        for reroll_total, count in reroll_counts.items():
            distribution[retained_total + reroll_total] += (
                initial_probability * count / reroll_denominator
            )

    return distribution


@cache
def _dx_round_counts(
    dice: int,
    critical: int,
    shihai: int,
) -> tuple[Counter[int], Counter[int]]:
    terminal_faces: Counter[int] = Counter()
    continuing_dice: Counter[int] = Counter()

    for rolls in product(D10_FACES, repeat=dice):
        critical_dice = sum(face >= critical for face in rolls)
        if critical_dice > shihai:
            continuing_dice[critical_dice] += 1
        else:
            terminal_face = sorted(rolls, reverse=True)[shihai]
            terminal_faces[terminal_face] += 1

    return terminal_faces, continuing_dice


def enumerate_dx(dice: int, critical: int, shihai: int) -> np.ndarray:
    """Enumerate each active roll and propagate critical states."""
    distribution = np.zeros(DISTRIBUTION_SIZE, dtype=np.float64)
    if dice <= shihai:
        distribution[0] = 1.0
        return distribution

    states: dict[tuple[int, int], float] = {(dice, 0): 1.0}
    while states:
        next_states: defaultdict[tuple[int, int], float] = defaultdict(float)
        for (active_dice, accumulated), state_probability in states.items():
            terminal_faces, continuing_dice = _dx_round_counts(
                active_dice,
                critical,
                shihai,
            )
            denominator = 10**active_dice

            for terminal_face, count in terminal_faces.items():
                value = min(
                    DISTRIBUTION_SIZE - 1,
                    accumulated + terminal_face,
                )
                distribution[value] += (
                    state_probability * count / denominator
                )

            for next_dice, count in continuing_dice.items():
                probability = state_probability * count / denominator
                next_accumulated = accumulated + 10
                if next_accumulated >= DISTRIBUTION_SIZE - 1:
                    distribution[-1] += probability
                else:
                    next_states[(next_dice, next_accumulated)] += probability

        states = dict(next_states)

    return distribution
