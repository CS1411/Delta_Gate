import {
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Handle, MarkerType, Position, ReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo } from 'react'
import type { StructuralFinding } from '../types'
import { buildModel, type GNode, type Role } from './lostLinkModel'

// The lost-link mini-graph (React Flow). Dashed red = the route the watched output used to have to the lost input
// region; grey = the route another watched output still has. It only draws what the finding says: all logic is in
// lostLinkModel.ts, and StructuralPanel's text alert does not depend on this file (it is lazy-loaded).

const COL_W = 300 // 110 px between nodes: room for the edge labels
const ROW_H = 130
const NODE_W = 190
const RED = '#b91c1c'
const GREY = '#475569'

const ROLE_STYLE: Record<Role, { box: string; tag?: string }> = {
  region: { box: 'border-slate-900 bg-slate-900 text-white', tag: 'lost input' },
  lost: { box: 'border-red-700 border-4 bg-red-50 text-red-900', tag: '✕ lost the link' },
  kept: { box: 'border-slate-500 bg-slate-100 text-slate-900', tag: '✓ still reaches it' },
  mid: { box: 'border-slate-400 bg-white text-slate-800' },
}

type FlowNode = Node<{ node: GNode }, 'cell'>

function CellNode({ data }: NodeProps<FlowNode>) {
  const { node } = data
  const style = ROLE_STYLE[node.role]
  return (
    <div className={`rounded-xl border-2 px-3 py-2 text-center ${style.box}`} style={{ width: NODE_W }}>
      {/* every side can take an edge: the layout wraps rows, so links run in any direction */}
      <Handle id="tl" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="tr" type="target" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="tt" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="tb" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="sl" type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="sr" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="st" type="source" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="sb" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="font-mono text-base font-bold leading-tight">{node.title}</div>
      {node.subtitle && <div className="text-sm leading-tight">{node.subtitle}</div>}
      {style.tag && <div className="mt-1 text-sm font-bold">{style.tag}</div>}
      {node.note && <div className="mt-1 text-sm font-bold text-red-700">{node.note}</div>}
    </div>
  )
}

const nodeTypes = { cell: CellNode }

// An edge whose words are an HTML label (EdgeLabelRenderer), so they never depend on SVG text measuring.
type RouteEdgeType = Edge<{ words?: string; colour: string }, 'route'>
function RouteEdge(props: EdgeProps<RouteEdgeType>) {
  const [path, x, y] = getSmoothStepPath(props)
  const { words, colour } = props.data ?? { colour: GREY }
  return (
    <>
      <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} />
      {words && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan pointer-events-none absolute rounded bg-white px-2 py-0.5 text-base font-bold"
            style={{ color: colour, transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
            {words}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
const edgeTypes = { route: RouteEdge }

interface Props {
  finding: StructuralFinding
  outputLabels?: Record<string, string> // watched-output cell -> its label, for the node captions
}

export default function LostLinkGraph({ finding, outputLabels }: Props) {
  const model = useMemo(() => buildModel(finding, outputLabels), [finding, outputLabels])
  useEffect(() => {
    if (!model) console.warn('LostLinkGraph: lost_link finding without a region, nothing drawn', finding)
  }, [model, finding])
  if (!model) return null

  const at = new Map(model.nodes.map((n) => [n.id, n]))
  const nodes: FlowNode[] = model.nodes.map((n) => ({
    id: n.id, type: 'cell', position: { x: n.col * COL_W, y: n.row * ROW_H }, data: { node: n },
    draggable: false, selectable: false, connectable: false,
  }))
  const edges: RouteEdgeType[] = model.edges.map((e) => {
    const a = at.get(e.from)!
    const b = at.get(e.to)!
    const [sourceHandle, targetHandle] = b.col === a.col
      ? (b.row > a.row ? ['sb', 'tt'] : ['st', 'tb']) // a wrap between rows
      : a.role === 'region' && e.kind === 'lost'
        ? ['st', 'tl'] // the broken route leaves the top of the region, so it never runs over the grey ones
        : (b.col > a.col ? ['sr', 'tl'] : ['sl', 'tr'])
    const lost = e.kind === 'lost'
    const colour = lost ? RED : GREY
    return {
      id: e.id, source: e.from, target: e.to, sourceHandle, targetHandle, type: 'route', selectable: false,
      data: { words: e.label, colour },
      style: { stroke: colour, strokeWidth: lost ? 4 : 3, strokeDasharray: lost ? '10 6' : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color: colour },
    }
  })
  const height = Math.max(1, model.rows) * ROW_H + 40

  return (
    <figure className="mt-5 space-y-3" aria-label="Lost link graph">
      <div className="rounded-xl border border-slate-200 bg-white" style={{ height }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.05, minZoom: 0.9, maxZoom: 1 }}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false}
          zoomOnPinch={false} zoomOnDoubleClick={false} panOnDrag={false} preventScrolling={false} />
      </div>

      <ul className="space-y-1 text-lg">
        <li className="flex items-center gap-3 font-semibold text-red-800">
          <svg width="44" height="8" aria-hidden><line x1="0" y1="4" x2="44" y2="4" stroke={RED} strokeWidth="4" strokeDasharray="10 6" /></svg>
          {model.noPath
            ? <>No path found from {model.regionRef} to {model.lostOutput}: it is no longer connected.</>
            : <>{model.lostOutput} is no longer connected to {model.regionRef}.</>}
        </li>
        {model.keptEmpty ? (
          <li className="rounded-lg border-2 border-red-700 bg-red-50 px-3 py-2 font-bold text-red-900">
            ⚠ No other watched output still reaches {model.regionRef}. Nothing is left that depends on it.
          </li>
        ) : (
          <li className="flex items-center gap-3 text-slate-700">
            <svg width="44" height="8" aria-hidden><line x1="0" y1="4" x2="44" y2="4" stroke={GREY} strokeWidth="3" /></svg>
            Still connected: {(finding.kept ?? []).map((k) => k.output).join(', ')} {(finding.kept ?? []).length === 1 ? 'still reaches' : 'still reach'} {model.regionRef}.
          </li>
        )}
      </ul>
    </figure>
  )
}
