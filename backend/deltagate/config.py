"""Paths and policy loading."""

from pathlib import Path

import yaml

from deltagate.models import Policy

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / "policy.yaml"


def load_policy(path: Path | str = POLICY_PATH) -> Policy:
    return Policy.model_validate(yaml.safe_load(Path(path).read_text(encoding="utf-8")))
