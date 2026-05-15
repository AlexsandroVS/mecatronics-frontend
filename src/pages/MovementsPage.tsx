import { useEffect, useMemo, useState } from 'react'
import { exportMovements, listMovementsGlobal, type InventoryMovementGlobal } from '../lib/inventory-api'
import { href } from '../lib/router'
import { useMediaQuery } from '../lib/useMediaQuery'
import { ErrorBox } from '../ui/ErrorBox'
import { Icon } from '../ui/Icon'

function movementLabel(t: InventoryMovementGlobal['type']): string {
  if (t === 'PURCHASE') return 'Compra'
  if (t === 'SALE') return 'Venta'
  if (t === 'WORKSHOP') return 'Taller'
  return 'Ajuste'
}

function todayYyyyMmDd(): string {
  const d = new Date()
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function daysAgoYyyyMmDd(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function downloadBlob(input: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(input.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = input.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function MovementsPage() {
  const isMobile = useMediaQuery('(max-width: 560px)')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<InventoryMovementGlobal[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const [dateFrom, setDateFrom] = useState<string>(() => daysAgoYyyyMmDd(7))
  const [dateTo, setDateTo] = useState<string>(() => todayYyyyMmDd())
  const [q, setQ] = useState('')

  const trimmed = useMemo(() => q.trim().toLowerCase(), [q])

  async function refresh(input?: { page?: number }) {
    setLoadError(null)
    setItems(null)
    const limit = 50
    const offset = ((input?.page ?? page) - 1) * limit
    try {
      const data = await listMovementsGlobal({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        offset
      })
      setItems(data)
    } catch (err) {
      setLoadError(err)
    }
  }

  useEffect(() => {
    refresh({ page })
  }, [page])

  const visible = useMemo(() => {
    if (!items) return null
    if (!trimmed) return items
    return items.filter((it) => {
      const hay = `${it.product.name} ${it.product.skuInternal} ${it.referenceDoc ?? ''} ${it.actorUser?.email ?? ''}`.toLowerCase()
      return hay.includes(trimmed)
    })
  }, [items, trimmed])

  async function onFilter(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    await refresh({ page: 1 })
  }

  async function onExport(format: 'PDF' | 'XLSX') {
    if (busy) return
    setBusy(true)
    try {
      const res = await exportMovements({
        format,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      })
      downloadBlob({ blob: res.blob, filename: res.filename ?? `movimientos-global.${format === 'PDF' ? 'pdf' : 'xlsx'}` })
    } catch (err) {
      setLoadError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Movimientos</h1>
        <div className="page-actions">
          <button type="button" className="secondary" onClick={() => void refresh({ page })}>
            Recargar
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Filtros y exportación</div>
        <form className="form" onSubmit={onFilter}>
          <div className="grid3">
            <label className="field">
              <div className="label">Desde</div>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="field">
              <div className="label">Hasta</div>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label className="field">
              <div className="label">Buscar</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Producto / documento / usuario" />
            </label>
          </div>
          <div className="actions">
            <button type="submit">Aplicar</button>
            <button type="button" className="download-btn pdf" disabled={busy} onClick={() => void onExport('PDF')} title="Descargar reporte en PDF">
              <Icon name="i-file-pdf" />
              PDF
              <Icon name="i-download" />
            </button>
            <button
              type="button"
              className="download-btn xlsx"
              disabled={busy}
              onClick={() => void onExport('XLSX')}
              title="Descargar reporte en Excel"
            >
              <Icon name="i-file-xls" />
              Excel
              <Icon name="i-download" />
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Registros (50 por página)</div>
        {loadError ? <ErrorBox error={loadError} /> : null}
        {!visible ? <div className="muted">Cargando…</div> : null}
        {visible ? (
          <>
            {isMobile ? (
              <div className="kv">
                {visible.map((it) => (
                  <div key={it.id} className="card" style={{ padding: 12, background: 'var(--surface-2)' }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div className="mono">{new Date(it.createdAt).toLocaleString()}</div>
                      <div className="mono">{movementLabel(it.type)}</div>
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 650 }}>
                      <a href={href({ name: 'product', id: it.product.id })}>{it.product.name}</a>
                    </div>
                    <div className="muted mono" style={{ marginTop: 2 }}>
                      {it.product.skuInternal}
                    </div>
                    <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                      <div className="muted">Mov</div>
                      <div className="mono">{it.quantity}</div>
                    </div>
                    <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
                      <div className="muted">Antes → Después</div>
                      <div className="mono">
                        {it.stockBefore} → {it.stockAfter}
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
                      <div className="muted">Documento</div>
                      <div className="mono">{it.referenceDoc ?? '—'}</div>
                    </div>
                    <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
                      <div className="muted">Usuario</div>
                      <div>{it.actorUser?.email ?? '—'}</div>
                    </div>
                  </div>
                ))}
                {!visible.length ? <div className="muted">Sin movimientos</div> : null}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table table-wide">
                  <thead>
                    <tr>
                      <th style={{ width: 175 }}>Fecha</th>
                      <th style={{ width: 320 }}>Producto</th>
                      <th style={{ width: 120 }}>Tipo</th>
                      <th style={{ width: 90 }}>Cant.</th>
                      <th style={{ width: 110 }}>Antes</th>
                      <th style={{ width: 110 }}>Después</th>
                      <th style={{ width: 160 }}>Documento</th>
                      <th style={{ width: 220 }}>Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((it) => (
                      <tr key={it.id}>
                        <td className="mono">{new Date(it.createdAt).toLocaleString()}</td>
                        <td>
                          <a href={href({ name: 'product', id: it.product.id })}>{it.product.name}</a>
                          <div className="muted mono">{it.product.skuInternal}</div>
                        </td>
                          <td className="mono">{movementLabel(it.type)}</td>
                        <td className="mono">{it.quantity}</td>
                        <td className="mono">{it.stockBefore}</td>
                        <td className="mono">{it.stockAfter}</td>
                        <td className="mono">{it.referenceDoc ?? '—'}</td>
                        <td>{it.actorUser?.email ?? '—'}</td>
                      </tr>
                    ))}
                    {!visible.length ? (
                      <tr>
                        <td colSpan={8} className="muted">
                          Sin movimientos
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pager">
              <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </button>
              <div className="muted">Página {page}</div>
              <button type="button" className="secondary" disabled={!items || items.length < 50} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
