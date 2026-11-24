import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo } from 'react'
import type { StructuralFinding } from '../types'
import { IconAlertTriangle } from './Icons'
import { buildModel, type GNode, type Role } from './lostLinkModel'

const COL_W = 300
const ROW_H = 130
const NODE_W = 190
const CRIMSON = '#A44A3F'
const WOOD = '#7F7D74'

const ROLE_STYLE: Record<Role, { box: string; tag?: string; tagClass?: string }> = {
  region: {
    box: 'border-[#36452B] bg-[#36452B] text-[#F8F7F4]',
    tag: 'input region',
    tagClass: 'text-[#D7D0C5]',
  },
  lost: {
    box: 'border-[#A44A3F] border-2 bg-[#EEDADA]/75 text-[#36452B]',
    tag: 'link severed',
    tagClass: 'text-[#A44A3F]',
  },
  kept: {
    box: 'border-[#8A9646] bg-[#FFFFFF] text-[#36452B]',
    tag: 'still connected',
    tagClass: 'text-[#8A9646]',
  },
  mid: {
    box: 'border-[#D7D0C5] bg-[#FFFFFF] text-[#36452B]',
  },
}

type FlowNode = Node<{ node: GNode }, 'cell'>

function CellNode({ data }: NodeProps<FlowNode>) {
  const { node } = data
  const style = ROLE_STYLE[node.role]
  return (
    <div className={`rounded-lg border px-3 py-2 text-center shadow-xs ${style.box}`} style={{ width: NODE_W }}>
      <Handle id="tl" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="tr" type="target" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="tt" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="tb" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="sl" type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="sr" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="st" type="source" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="sb" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="font-mono text-sm font-semibold leading-tight">{node.title}</div>
      {node.subtitle && <div className="mt-0.5 text-xs leading-tight opacity-85">{node.subtitle}</div>}
      {style.tag && <div className={`mt-1 text-xs font-bold ${style.tagClass ?? ''}`}>{style.tag}</div>}
      {node.note && <div className="mt-1 text-xs font-bold text-[#A44A3F]">{node.note}</div>}
    </div>
  )
}

const nodeTypes = { cell: CellNode }

type RouteEdgeType = Edge<{ words?: string; colour: string }, 'route'>
function RouteEdge(props: EdgeProps<RouteEdgeType>) {
  const [path, x, y] = getSmoothStepPath(props)
  const { words, colour } = props.data ?? { colour: WOOD }
  return (
    <>
      <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} />
      {words && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded border border-[#D7D0C5] bg-[#FFFFFF] px-2 py-0.5 text-xs font-semibold shadow-xs"
            style={{ color: colour, transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
          >
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
  outputLabels?: Record<string, string>
}

export default function LostLinkGraph({ finding, outputLabels }: Props) {
  const model = useMemo(() => buildModel(finding, outputLabels), [finding, outputLabels])
  useEffect(() => {
    if (!model) console.warn('LostLinkGraph: lost_link finding without a region, nothing drawn', finding)
  }, [model, finding])
  if (!model) return null

  const at = new Map(model.nodes.map((n) => [n.id, n]))
  const nodes: FlowNode[] = model.nodes.map((n) => ({
    id: n.id,
    type: 'cell',
    position: { x: n.col * COL_W, y: n.row * ROW_H },
    data: { node: n },
    draggable: false,
    selectable: false,
    connectable: false,
  }))
  const edges: RouteEdgeType[] = model.edges.map((e) => {
    const a = at.get(e.from)!
    const b = at.get(e.to)!
    const [sourceHandle, targetHandle] =
      b.col === a.col
        ? b.row > a.row
          ? ['sb', 'tt']
          : ['st', 'tb']
        : a.role === 'region' && e.kind === 'lost'
          ? ['st', 'tl']
          : b.col > a.col
            ? ['sr', 'tl']
            : ['sl', 'tr']
    const lost = e.kind === 'lost'
    const colour = lost ? CRIMSON : WOOD
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle,
      targetHandle,
      type: 'route',
      selectable: false,
      className: lost ? 'animate-dg-dash' : undefined,
      data: { words: e.label, colour },
      style: {
        stroke: colour,
        strokeWidth: lost ? 3 : 2.25,
        strokeDasharray: lost ? '8 5' : undefined,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: colour },
    }
  })
  const height = Math.max(1, model.rows) * ROW_H + 40

  return (
    <figure className="space-y-3" aria-label="Lost link graph">
      <div className="rounded-lg border border-[#D7D0C5] bg-[#F8F7F4]" style={{ height }}>
        <ReactFlow
          className="light"
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.08, minZoom: 0.85, maxZoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          panOnDrag={false}
          preventScrolling={false}
        />
      </div>

      <ul className="space-y-1.5 text-sm">
        <li className="flex items-center gap-3 font-semibold text-[#A44A3F]">
          <svg width="36" height="8" aria-hidden="true" className="shrink-0">
            <line x1="0" y1="4" x2="36" y2="4" stroke={CRIMSON} strokeWidth="3" strokeDasharray="8 5" />
          </svg>
          <span>
            {model.noPath
              ? `No path found from ${model.regionRef} to ${model.lostOutput}: it is no longer connected.`
              : `${model.lostOutput} is no longer connected to ${model.regionRef}.`}
          </span>
        </li>
        {model.keptEmpty ? (
          <li className="flex items-center gap-2 rounded-md border border-[#A44A3F]/35 bg-[#EEDADA]/65 px-3 py-2 font-semibold text-[#A44A3F]">
            <IconAlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              No other watched output still reaches {model.regionRef}. Nothing is left that depends on it.
            </span>
          </li>
        ) : (
          <li className="flex items-center gap-3 text-[#36452B]/80">
            <svg width="36" height="8" aria-hidden="true" className="shrink-0">
              <line x1="0" y1="4" x2="36" y2="4" stroke={WOOD} strokeWidth="2.5" />
            </svg>
            <span>
              Still connected: {(finding.kept ?? []).map((k) => k.output).join(', ')}{' '}
              {(finding.kept ?? []).length === 1 ? 'still reaches' : 'still reach'} {model.regionRef}.
            </span>
          </li>
        )}
      </ul>
    </figure>
  )
}
