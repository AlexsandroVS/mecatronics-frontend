import { useEffect, useState } from 'react'
import { z } from 'zod'
import { listAuditLogs, type AuditLogItem } from '../lib/inventory-api'
import { href } from '../lib/router'
import { ErrorBox } from '../ui/ErrorBox'

const entityTypeSchema = z.enum(['Product', 'InventoryMovement', 'Brand', 'Category', 'User', 'ProductCompatibility'])

function metaHighlights(meta: unknown): Array<{ label: string; value: string }> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return []
  const m = meta as Record<string, unknown>

  const out: Array<{ label: string; value: string }> = []
  const push = (label: string, v: unknown) => {
    if (v === null || v === undefined) return
    const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
    if (!s.trim()) return
    out.push({ label, value: s })
  }

  push('Nombre', m.name)
  push('Marca', m.brandName)
  push('Categoría', m.categoryName)
  push('Repuesto', m.partName)
  push('Máquina', m.machineName)
  push('Documento', m.referenceDoc)
  push('Cantidad', m.quantity)
  push('Stock final', m.stockAfter)

  if (Array.isArray(m.changed)) {
    const list = m.changed.filter((x) => typeof x === 'string').slice(0, 8).join(', ')
    if (list) out.push({ label: 'Cambios', value: list })
  }

  return out.slice(0, 5)
}

export function AuditPage() {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<AuditLogItem[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)

  const [entityType, setEntityType] = useState<z.infer<typeof entityTypeSchema> | ''>('')
  const [entityIdRaw, setEntityIdRaw] = useState('')
  const [action, setAction] = useState('')

  async function refresh(input?: { page?: number }) {
    setLoadError(null)
    setItems(null)
    const entityId = entityIdRaw.trim() ? Number(entityIdRaw) : undefined
    try {
      const data = await listAuditLogs({
        page: input?.page ?? page,
        entityType: entityType || undefined,
        entityId: typeof entityId === 'number' && Number.isInteger(entityId) && entityId > 0 ? entityId : undefined,
        action: action.trim() ? action.trim() : undefined
      })
      setItems(data)
    } catch (err) {
      setLoadError(err)
    }
  }

  useEffect(() => {
    refresh({ page })
  }, [page])

  async function onFilter(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    await refresh({ page: 1 })
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Auditoría</h1>
        <div className="page-actions">
          <button type="button" className="secondary" onClick={() => void refresh({ page })}>
            Recargar
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Filtros</div>
        <form className="form" onSubmit={onFilter}>
          <div className="grid3">
            <label className="field">
              <div className="label">Entidad</div>
              <select value={entityType} onChange={(e) => setEntityType(e.target.value as typeof entityType)}>
                <option value="">Todas</option>
                {entityTypeSchema.options.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <div className="label">Entity ID</div>
              <input inputMode="numeric" value={entityIdRaw} onChange={(e) => setEntityIdRaw(e.target.value)} placeholder="Ej: 120" />
            </label>
            <label className="field">
              <div className="label">Acción</div>
              <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Ej: PRODUCT_UPDATE" />
            </label>
          </div>
          <div className="actions">
            <button type="submit">Aplicar</button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEntityType('')
                setEntityIdRaw('')
                setAction('')
                setPage(1)
                void refresh({ page: 1 })
              }}
            >
              Limpiar
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Eventos (20 por página)</div>
        {loadError ? <ErrorBox error={loadError} /> : null}
        {!items ? <div className="muted">Cargando…</div> : null}
        {items ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Fecha</th>
                  <th style={{ width: 240 }}>Usuario</th>
                  <th style={{ width: 220 }}>Acción</th>
                  <th style={{ width: 200 }}>Entidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="mono">{new Date(it.createdAt).toLocaleString()}</td>
                    <td className="mono">{it.actorUser ? it.actorUser.email : '—'}</td>
                    <td className="mono">{it.action}</td>
                    <td>
                      <div className="mono">
                        {it.entityType}
                        {typeof it.entityId === 'number' ? ` #${it.entityId}` : ''}
                      </div>
                      {it.entityType === 'Product' && typeof it.entityId === 'number' ? (
                        <a href={href({ name: 'product', id: it.entityId })}>Abrir producto</a>
                      ) : null}
                    </td>
                    <td>
                      {it.metadata ? (
                        <details className="details">
                          <summary>
                            <div className="details-title">Ver detalle</div>
                            <div className="muted mono">{Object.keys(it.metadata as Record<string, unknown>).length} campos</div>
                          </summary>
                          <div className="details-body">
                            {metaHighlights(it.metadata).length ? (
                              <div className="kv" style={{ marginBottom: 10 }}>
                                {metaHighlights(it.metadata).map((x) => (
                                  <div className="kv-row" key={x.label} style={{ gridTemplateColumns: '120px 1fr' }}>
                                    <div className="kv-k">{x.label}</div>
                                    <div className="kv-v">{x.value}</div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <pre className="mono audit-json">{JSON.stringify(it.metadata, null, 2)}</pre>
                          </div>
                        </details>
                      ) : (
                        <div className="muted">—</div>
                      )}
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Sin eventos
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="pager">
              <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </button>
              <div className="muted">Página {page}</div>
              <button type="button" className="secondary" disabled={!items || items.length < 20} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
