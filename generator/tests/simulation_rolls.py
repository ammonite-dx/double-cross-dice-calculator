from collections.abc import Iterator

import numpy as np

DISTRIBUTION_SIZE = 1024
DEFAULT_BATCH_SIZE = 5_000


def _batch_sizes(
    trials: int,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> Iterator[int]:
    remaining = trials
    while remaining:
        current = min(remaining, batch_size)
        yield current
        remaining -= current


def simulate_d10_sum(
    rng: np.random.Generator,
    trials: int,
    dice: int,
) -> np.ndarray:
    results = np.empty(trials, dtype=np.int32)
    offset = 0
    for size in _batch_sizes(trials):
        if dice == 0:
            batch = np.zeros(size, dtype=np.int32)
        else:
            rolls = rng.integers(
                1,
                11,
                size=(size, dice),
                dtype=np.int16,
            )
            batch = rolls.sum(axis=1, dtype=np.int32)
        results[offset : offset + size] = np.minimum(
            batch,
            DISTRIBUTION_SIZE - 1,
        )
        offset += size
    return results


def simulate_livingdead(
    rng: np.random.Generator,
    trials: int,
    dice: int,
) -> np.ndarray:
    results = np.empty(trials, dtype=np.int32)
    offset = 0
    for size in _batch_sizes(trials):
        if dice == 0:
            batch = np.zeros(size, dtype=np.int32)
        else:
            rolls = rng.integers(
                1,
                11,
                size=(size, dice),
                dtype=np.int16,
            )
            batch = (
                rolls.sum(axis=1, dtype=np.int32)
                - rolls.max(axis=1)
                + 1
            )
        results[offset : offset + size] = np.minimum(
            batch,
            DISTRIBUTION_SIZE - 1,
        )
        offset += size
    return results


def simulate_kazanari(
    rng: np.random.Generator,
    trials: int,
    dice: int,
    kazanari: int,
) -> np.ndarray:
    results = np.empty(trials, dtype=np.int32)
    selected_count = min(dice, kazanari)
    offset = 0

    for size in _batch_sizes(trials):
        if dice == 0:
            batch = np.zeros(size, dtype=np.int32)
        else:
            rolls = rng.integers(
                1,
                11,
                size=(size, dice),
                dtype=np.int16,
            )
            batch = rolls.sum(axis=1, dtype=np.int32)

            if selected_count:
                selected = np.partition(
                    rolls,
                    selected_count - 1,
                    axis=1,
                )[:, :selected_count]
                rerolled = selected <= 5
                rerolls = rng.integers(
                    1,
                    11,
                    size=selected.shape,
                    dtype=np.int16,
                )
                batch += np.where(
                    rerolled,
                    rerolls - selected,
                    0,
                ).sum(axis=1, dtype=np.int32)

        results[offset : offset + size] = np.minimum(
            batch,
            DISTRIBUTION_SIZE - 1,
        )
        offset += size

    return results


def simulate_dx(
    rng: np.random.Generator,
    trials: int,
    dice: int,
    critical: int,
    shihai: int,
) -> np.ndarray:
    if dice <= shihai:
        return np.zeros(trials, dtype=np.int32)

    results = np.empty(trials, dtype=np.int32)
    offset = 0
    for size in _batch_sizes(trials):
        active = np.full(size, dice, dtype=np.int16)
        accumulated = np.zeros(size, dtype=np.int32)
        batch_results = np.zeros(size, dtype=np.int32)

        while np.any(active):
            current_active = active
            active = np.zeros_like(current_active)
            for active_dice in np.unique(
                current_active[current_active > 0]
            ):
                indices = np.flatnonzero(current_active == active_dice)
                rolls = rng.integers(
                    1,
                    11,
                    size=(indices.size, int(active_dice)),
                    dtype=np.int16,
                )
                critical_dice = np.count_nonzero(
                    rolls >= critical,
                    axis=1,
                )
                continuing = critical_dice > shihai
                terminal = ~continuing

                if np.any(terminal):
                    terminal_indices = indices[terminal]
                    terminal_rolls = rolls[terminal]
                    rank_index = int(active_dice) - shihai - 1
                    terminal_faces = np.partition(
                        terminal_rolls,
                        rank_index,
                        axis=1,
                    )[:, rank_index]
                    batch_results[terminal_indices] = np.minimum(
                        accumulated[terminal_indices] + terminal_faces,
                        DISTRIBUTION_SIZE - 1,
                    )

                if np.any(continuing):
                    continuing_indices = indices[continuing]
                    accumulated[continuing_indices] += 10
                    overflow = (
                        accumulated[continuing_indices]
                        >= DISTRIBUTION_SIZE - 1
                    )
                    if np.any(overflow):
                        overflow_indices = continuing_indices[overflow]
                        batch_results[overflow_indices] = (
                            DISTRIBUTION_SIZE - 1
                        )
                    if np.any(~overflow):
                        next_indices = continuing_indices[~overflow]
                        active[next_indices] = critical_dice[
                            continuing
                        ][~overflow]

        results[offset : offset + size] = batch_results
        offset += size

    return results
