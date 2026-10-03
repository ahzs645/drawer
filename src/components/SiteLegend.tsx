import { siteLegendLayout } from '../docModel'
import type { DrawerDoc, Vec2 } from '../types'

interface Props {
  doc: DrawerDoc
  selectedSiteId: string | null
  /** page points of the selected site's visible markers, for connection lines */
  connections: Vec2[]
  onDown: (e: React.PointerEvent) => void
  onRowClick: (siteId: string) => void
}

/** The on-page numbered site list: drag to move, click a row to select the site. */
export function SiteLegendView({ doc, selectedSiteId, connections, onDown, onRowClick }: Props) {
  const layout = siteLegendLayout(doc)
  if (!layout) return null
  const g = doc.siteLegend!
  const width = Math.max(...layout.rows.map((r) => r.text.length), layout.heading.text.length) * g.fontSize * 0.56
  const selected = layout.rows.find((r) => r.siteId === selectedSiteId)
  return (
    <g className="site-legend" onPointerDown={onDown}>
      {selected &&
        connections.map((p, i) => (
          <path
            key={i}
            className="site-connection"
            d={`M${p.x} ${p.y} L${selected.x - 10} ${selected.y - selected.fontSize * 0.32}`}
            fill="none"
            stroke="#2874bd"
            strokeWidth={1.8}
            strokeDasharray="6 5"
            pointerEvents="none"
          />
        ))}
      {/* hit area for dragging the whole legend */}
      <rect
        x={g.pos.x - 6}
        y={g.pos.y - 4}
        width={width + 12}
        height={g.rowHeight * layout.rows.length + g.fontSize * 1.2}
        fill="transparent"
      />
      <text x={layout.heading.x} y={layout.heading.y} fontSize={layout.heading.fontSize} fontWeight={700} fill="#181818">
        {layout.heading.text}
      </text>
      {layout.rows.map((r) => (
        <g key={r.siteId} data-legend-site={r.siteId} onClick={() => onRowClick(r.siteId)}>
          {r.siteId === selectedSiteId && (
            <rect x={r.x - 5} y={r.top} width={width} height={r.height} rx={4} fill="#dce9fb" />
          )}
          <text x={r.x} y={r.y} fontSize={r.fontSize} fill="#181818">
            {r.text}
          </text>
        </g>
      ))}
    </g>
  )
}
