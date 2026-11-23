"""Session Audit: snapshot a workbook before someone uses an AI inside Excel, then Check the file after.

We cannot block an agent that edits through Excel's own APIs, so we audit its result: the snapshot is an
exact byte copy (saved values and the app that saved them included), and complete() is an ordinary Check
of snapshot -> after with mode "session_audit".

Snapshots live in data/session_audits/<id>.xlsx, outside store/: they are not managed versions.
"""

import hashlib
import re
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

from deltagate import config
from deltagate.engine.check import check
from deltagate.models import CheckResult, Policy

_ID = re.compile(r"sa_[0-9a-f]{12}")


@dataclass(frozen=True)
class Snapshot:
    snapshot_id: str
    sha256: str


def _dir() -> Path:
    path = config.data_dir() / "session_audits"
    path.mkdir(exist_ok=True)
    return path


def path_of(snapshot_id: str) -> Path:
    """The snapshot file. KeyError for a malformed or unknown id (ids come from HTTP: never a path)."""
    path = _dir() / f"{snapshot_id}.xlsx"
    if not _ID.fullmatch(snapshot_id) or not path.is_file():
        raise KeyError(snapshot_id)
    return path


def snapshot(source: Path | str) -> Snapshot:
    snapshot_id = f"sa_{uuid.uuid4().hex[:12]}"
    target = _dir() / f"{snapshot_id}.xlsx"
    shutil.copyfile(source, target)
    return Snapshot(snapshot_id, hashlib.sha256(target.read_bytes()).hexdigest())


def complete(snapshot_id: str, after: Path | str, policy: Policy) -> CheckResult:
    return check(path_of(snapshot_id), after, policy, mode="session_audit")
