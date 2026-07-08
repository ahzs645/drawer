import { useState, type ReactNode } from 'react'

// A sidebar section that can be shown/hidden by clicking its header. The
// open/closed state is remembered per title in localStorage so the sidebar
// keeps its shape across reloads.

const key = (title: string) => `drawer.panel.${title}`

function initialOpen(title: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key(title))
    return v == null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function CollapsiblePanel({
  title,
  right,
  defaultOpen = true,
  className = '',
  children,
}: {
  title: string
  /** optional controls shown on the right of the header (e.g. a checkbox) */
  right?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => initialOpen(title, defaultOpen))
  const toggle = () => {
    setOpen((o) => {
      const next = !o
      try {
        localStorage.setItem(key(title), next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }
  return (
    <section className={`panel collapsible ${open ? 'open' : 'closed'} ${className}`}>
      <div className="panel-head">
        <button className="panel-toggle" onClick={toggle} aria-expanded={open}>
          <span className="chev">{open ? '▾' : '▸'}</span>
          <span className="panel-title">{title}</span>
        </button>
        {right && <div className="panel-head-right">{right}</div>}
      </div>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}
