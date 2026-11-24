import type { StructuralFinding } from '../types'

// Pure model of the lost-link graph: finding in, nodes and edges (on a grid) out. No React, no layout pixels.
// Node convention from the engine: every element of a path is a column "Sheet!Col", except the LAST, which is the
// output cell. Nothing here knows a cell name: everything comes from the finding.

export type Role = 'region' | 'lost' | 'kept' | 'mid'
export interface GNode { id: string; col: number; row: number; role: Role; title: string; subtitle?: string; note?: string }
export interface GEdge { id: string; from: string; to: string; kind: 'lost' | 'kept'; label?: string }
export interface LostLinkModel {
  nodes: GNode[]
  edges: GEdge[]
  rows: number // grid rows used
  regionRef: string // "Payments!C", for the sentences around the graph
  lostOutput: string
  noPath: boolean // the engine gave no route from the region to the lost output
  keptEmpty: boolean // no other watched output still reaches the region
}

export const PER_ROW = 2 // nodes per grid row after the region; a longer path wraps (snakes) onto the next row

export function buildModel(finding: StructuralFinding, outputLabels: Record<string, string> = {}): LostLinkModel | null {
  const { region } = finding
  if (!region) return null
  const regionId = `${region.sheet}!${region.column}`
  const before = finding.path_before ?? []
  const kept = finding.kept ?? []
  const lostOutput = before.length > 0 ? before[before.length - 1] : (finding.output ?? finding.cell)
  const keptOutputs = new Set(kept.map((k) => k.output))

  // Which chains exist, in drawing order: the broken one first, then every kept one.
  const chains: { kind: 'lost' | 'kept'; path: string[]; output: string }[] = []
  chains.push({ kind: 'lost', path: before, output: lostOutput })
  for (const k of kept) chains.push({ kind: 'kept', path: k.path, output: k.output })

  const placed = new Map<string, GNode>()
  const edges: GEdge[] = []
  let row = 0

  const roleOf = (id: string): Role =>
    id === regionId ? 'region' : id === lostOutput ? 'lost' : keptOutputs.has(id) ? 'kept' : 'mid'
  const nodeFor = (id: string, col: number, r: number): GNode => {
    const role = roleOf(id)
    return {
      id, col, row: r, role, title: id,
      subtitle: role === 'region' ? (region.header ?? undefined) : outputLabels[id],
    }
  }

  chains.forEach((chain, index) => {
    const rest = chain.path.filter((id) => id !== regionId)
    if (chain.kind === 'lost' && chain.path.length === 0) {
      // "no path found": the output still gets a node, with no edge to the region, and a note on it.
      const node = nodeFor(chain.output, 1, row)
      node.note = 'no path found'
      placed.set(chain.output, node)
      row += 1
      return
    }
    if (chain.kind === 'kept' && chain.path.length === 0) {
      const node = nodeFor(chain.output, 1, row)
      node.note = 'path not available'
      if (!placed.has(chain.output)) placed.set(chain.output, node)
      row += 1
      return
    }
    rest.forEach((id, i) => {
      if (placed.has(id)) return // a column or output two chains share is drawn once
      const line = Math.floor(i / PER_ROW)
      const offset = i % PER_ROW
      const col = 1 + (line % 2 === 0 ? offset : PER_ROW - 1 - offset) // odd lines run right to left, so the wrap is short
      placed.set(id, nodeFor(id, col, row + line))
    })
    chain.path.slice(1).forEach((to, i) => {
      edges.push({
        id: `${index}:${i}`, from: chain.path[i], to, kind: chain.kind,
        label: i === 0 ? (chain.kind === 'lost' ? 'no longer connected' : 'still connected') : undefined,
      })
    })
    row += Math.max(1, Math.ceil(rest.length / PER_ROW))
  })

  const rows = Math.max(1, row)
  const middle = (rows - 1) / 2
  const region_: GNode = { id: regionId, col: 0, row: middle, role: 'region', title: regionId, subtitle: region.header ?? undefined }
  const nodes = [region_, ...[...placed.values()].filter((n) => n.id !== regionId)]
  const known = new Set(nodes.map((n) => n.id))
  return {
    nodes,
    edges: edges.filter((e) => known.has(e.from) && known.has(e.to)), // never an edge to a node we did not draw
    rows,
    regionRef: regionId,
    lostOutput,
    noPath: before.length === 0,
    keptEmpty: kept.length === 0,
  }
}
