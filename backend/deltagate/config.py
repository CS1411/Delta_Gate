"""Paths and policy loading. Runtime state lives under DELTAGATE_HOME (default: the repo root)."""

import os
import shutil
from pathlib import Path

import yaml

from deltagate.models import Policy

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / "policy.yaml"


def load_policy(path: Path | str = POLICY_PATH) -> Policy:
    return Policy.model_validate(yaml.safe_load(Path(path).read_text(encoding="utf-8")))


def _dir(name: str) -> Path:
    path = Path(os.environ.get("DELTAGATE_HOME") or ROOT) / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def data_dir() -> Path:
    return _dir("data")


def store_dir() -> Path:
    """The managed folder. Only deltagate.gate.store writes here."""
    return _dir("store")


def db_path() -> Path:
    return data_dir() / "deltagate.db"


def key_path() -> Path:
    return data_dir() / "signing_key.pem"


def soffice() -> str | None:
    """LibreOffice binary. DELTAGATE_SOFFICE overrides it ('off' = no LibreOffice, saved values stay absent)."""
    override = os.environ.get("DELTAGATE_SOFFICE")
    if override:
        return None if override == "off" else override
    candidates = [os.environ.get("SOFFICE"), shutil.which("soffice"),
                  r"C:\Program Files\LibreOffice\program\soffice.exe",
                  "/Applications/LibreOffice.app/Contents/MacOS/soffice"]
    return next((c for c in candidates if c and Path(c).exists()), None)
