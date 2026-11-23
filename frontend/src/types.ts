// Copied from backend/deltagate/models.py (the contract). Change there first, then here.

export type SavedBy = 'Microsoft Excel' | 'LibreOffice' | 'none'
export type GroupType = 'data' | 'logic' | 'structural'
export type FindingKind =
  | 'typed_over_formula' | 'shortened_range' | 'protected_formula_edit' | 'rows_deleted_in_range' | 'lost_link'

export interface Verification { saved_by: SavedBy; formula_cells: number; matched: number; mismatched: string[] }
export interface Group { group_id: string; label: string; type: GroupType; cells: string[] }
export interface Attribution { group_id: string; solo: number; share: number; interaction: number }
export interface Output {
  cell: string
  label: string
  base: number | null // null = unknown, never 0
  new: number | null
  delta_observed: number | null
  delta_verified: number
  delta_unverified: number | null
  attribution: Attribution[]
}
export interface StructuralFinding { kind: FindingKind; cell: string; output: string | null; message: string }
export interface Unverifiable { cell: string; reason: string }
export interface CheckResult {
  check_id: string
  mode: 'check' | 'gate' | 'session_audit'
  base_version: string
  new_version: string
  verification: Verification
  groups: Group[]
  outputs: Output[]
  structural: StructuralFinding[]
  unverifiable: Unverifiable[]
  coverage: number
}

export interface Impact { cell: string; delta: number }
export interface GroupDecision {
  group_id: string
  status: 'PASS' | 'HELD' | 'CANT_VERIFY_HELD'
  reasons: string[]
  impacts: Impact[] // solo effect per watched output; empty for CANT_VERIFY_HELD
}
export interface Decision {
  edit_id: string
  session_id: string
  status: 'PASS' | 'HELD' | 'PARTIAL' | 'DENIED' | 'APPROVED' | 'ROLLED_BACK'
  groups: GroupDecision[]
  committed_version: string | null
  check: CheckResult | null
}
