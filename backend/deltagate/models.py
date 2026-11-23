"""Pydantic contracts (build rules, section 5). The single source of types shared by engine, gate, API and MCP.

Phase 1 holds CheckResult and Policy. Edit ops and Decision arrive with the gate in Phase 2.
"""

from typing import Literal

from pydantic import BaseModel

SavedBy = Literal["Microsoft Excel", "LibreOffice", "none"]
GroupType = Literal["data", "logic", "structural"]
FindingKind = Literal[
    "typed_over_formula", "shortened_range", "protected_formula_edit", "rows_deleted_in_range", "lost_link"
]


class WatchedOutput(BaseModel):
    cell: str
    label: str


class Policy(BaseModel):
    watched_outputs: list[WatchedOutput]
    impact_limit_abs: float
    drift_budget: float
    protected: list[str] = []


class Verification(BaseModel):
    saved_by: SavedBy  # the app that wrote the base file's saved values
    formula_cells: int
    matched: int
    mismatched: list[str]


class Group(BaseModel):
    group_id: str
    label: str
    type: GroupType
    cells: list[str]


class Attribution(BaseModel):
    group_id: str
    solo: float
    share: float
    interaction: float


class Output(BaseModel):
    cell: str
    label: str
    # None = no saved value and the engine cannot compute it. We say so instead of guessing.
    base: float | None
    new: float | None
    delta_observed: float | None
    delta_verified: float
    delta_unverified: float | None
    attribution: list[Attribution]


class StructuralFinding(BaseModel):
    kind: FindingKind
    cell: str
    output: str | None  # the watched output this reaches, if any
    message: str


class Unverifiable(BaseModel):
    cell: str
    reason: str


class CheckResult(BaseModel):
    check_id: str
    mode: Literal["check", "gate", "session_audit"]
    base_version: str
    new_version: str
    verification: Verification
    groups: list[Group]
    outputs: list[Output]
    structural: list[StructuralFinding]
    unverifiable: list[Unverifiable]
    coverage: float  # share of formula cells the engine can compute and that match the saved values
