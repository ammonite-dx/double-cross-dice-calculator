from __future__ import annotations

import argparse
import sys
from pathlib import Path
from time import perf_counter

from .assets import (
    ALL_DATASETS,
    compare_assets,
    default_output_directory,
    default_reference_directory,
    generate_assets,
    write_assets,
)
from .constants import KAZANARI_VALUES, SHIHAI_VALUES


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate versioned probability assets offline.",
    )
    parser.add_argument(
        "command",
        choices=("generate", "verify"),
        help="write assets or compare generated values with existing assets",
    )
    parser.add_argument(
        "--dataset",
        action="append",
        choices=ALL_DATASETS,
        dest="datasets",
        help="limit work to a dataset; may be specified more than once",
    )
    parser.add_argument(
        "--shihai",
        action="append",
        type=int,
        help="limit dx generation to a shihai value",
    )
    parser.add_argument(
        "--kazanari",
        action="append",
        type=int,
        help="limit dr generation to a kazanari value",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=default_output_directory(),
        help="asset output directory",
    )
    parser.add_argument(
        "--reference",
        type=Path,
        default=default_reference_directory(),
        help="reference asset directory used by verify",
    )
    return parser


def _validated_values(
    values: list[int] | None,
    allowed: range,
    label: str,
) -> tuple[int, ...]:
    selected = tuple(allowed if values is None else dict.fromkeys(values))
    invalid = set(selected) - set(allowed)
    if invalid:
        raise ValueError(f"invalid {label}: {', '.join(map(str, sorted(invalid)))}")
    return selected


def main() -> None:
    args = _parser().parse_args()
    datasets = tuple(ALL_DATASETS if args.datasets is None else args.datasets)

    try:
        shihai_values = _validated_values(args.shihai, SHIHAI_VALUES, "shihai")
        kazanari_values = _validated_values(
            args.kazanari,
            KAZANARI_VALUES,
            "kazanari",
        )
        started = perf_counter()
        assets = generate_assets(
            datasets,
            shihai_values=shihai_values,
            kazanari_values=kazanari_values,
        )
        elapsed = perf_counter() - started

        if args.command == "verify":
            issues = compare_assets(assets, args.reference)
            if issues:
                print("\n".join(issues), file=sys.stderr)
                raise SystemExit(1)
            print(f"Verified {len(assets)} assets in {elapsed:.2f}s.")
            return

        complete = (
            set(datasets) == set(ALL_DATASETS)
            and shihai_values == tuple(SHIHAI_VALUES)
            and kazanari_values == tuple(KAZANARI_VALUES)
        )
        write_assets(assets, args.output, write_manifest=complete)
        print(f"Generated {len(assets)} assets in {elapsed:.2f}s.")
        if not complete:
            print("Skipped manifest because only part of the dataset was generated.")
    except ValueError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
