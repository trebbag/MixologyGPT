from typing import Any, List


def _diff_values(path: str, before: Any, after: Any, changes: List[dict]) -> None:
    if isinstance(before, dict) and isinstance(after, dict):
        keys = set(before.keys()) | set(after.keys())
        for key in sorted(keys):
            next_path = f"{path}.{key}" if path else key
            _diff_values(next_path, before.get(key), after.get(key), changes)
        return
    if isinstance(before, list) and isinstance(after, list):
        if before != after:
            changes.append({"path": path, "before": before, "after": after})
        return
    if before != after:
        changes.append({"path": path, "before": before, "after": after})


def diff_snapshots(before: dict, after: dict) -> dict:
    changes: List[dict] = []
    _diff_values("", before or {}, after or {}, changes)
    return {"changes": changes}
