"""Pydantic contracts (build rules, section 5). The single source of types shared by engine, gate, API and MCP.

CheckResult and Policy (Phase 1); edit ops and Decision (Phase 2, the gate).
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

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


# --- the gate (Phase 2) -------------------------------------------------------------------------

Scalar = str | int | float | bool | None


def _not_a_formula(value):
    """A value op must not smuggle a formula in: openpyxl would store '=...' text as one."""
    if isinstance(value, str) and value.startswith("="):
        raise ValueError("a value must not start with '='; use set_formula for formulas")
    return value


class SetValue(BaseModel):
    op: Literal["set_value"]
    cell: str
    value: Scalar
    _check = field_validator("value")(_not_a_formula)


class SetFormula(BaseModel):
    op: Literal["set_formula"]
    cell: str
    formula: str

    @field_validator("formula")
    @classmethod
    def _is_formula(cls, formula):
        if not formula.startswith("=") or len(formula) < 2:
            raise ValueError("a formula must start with '='")
        return formula


class AppendRow(BaseModel):
    op: Literal["append_row"]
    sheet: str
    values: list[Scalar] = Field(min_length=1)

    @field_validator("values")
    @classmethod
    def _no_formulas(cls, values):
        return [_not_a_formula(v) for v in values]


EditOp = Annotated[SetValue | SetFormula | AppendRow, Field(discriminator="op")]


class Impact(BaseModel):
    cell: str
    delta: float


class GroupDecision(BaseModel):
    group_id: str
    status: Literal["PASS", "HELD", "CANT_VERIFY_HELD"]
    reasons: list[str]
    impacts: list[Impact]  # the group's solo effect per watched output; empty when it cannot be verified


class Decision(BaseModel):
    edit_id: str
    session_id: str
    status: Literal["PASS", "HELD", "PARTIAL", "DENIED", "APPROVED", "ROLLED_BACK"]
    groups: list[GroupDecision]
    committed_version: str | None
    check: CheckResult | None  # the full Check (exact Shapley), built when a group is held; None when all pass
