import os
from functools import lru_cache
from pathlib import Path


def _ancestor_paths(start: Path) -> list[Path]:
    return [start, *start.parents]


@lru_cache(maxsize=1)
def resolve_schema_dir() -> Path:
    override = os.getenv("SCHEMA_DIR")
    if override:
        return Path(override).expanduser()

    here = Path(__file__).resolve()
    for base in _ancestor_paths(here):
        for candidate in (
            base / "packages" / "shared_types" / "schemas",
            base / "app" / "shared_schemas",
            base / "shared_schemas",
        ):
            if candidate.exists():
                return candidate

    return here.parents[1] / "shared_schemas"


@lru_cache(maxsize=1)
def resolve_media_root() -> Path:
    override = os.getenv("MEDIA_ROOT")
    if override:
        return Path(override).expanduser()

    here = Path(__file__).resolve()
    for base in _ancestor_paths(here):
        output_dir = base / "output"
        if output_dir.exists():
            return output_dir / "media"

    return Path.cwd() / "output" / "media"
