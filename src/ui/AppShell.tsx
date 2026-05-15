import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { searchProducts, type ProductSearchItem } from '../lib/inventory-api'
import { href, navigate, type Route } from '../lib/router'
import { ErrorBox } from './ErrorBox'
import { Icon } from './Icon'

export function AppShell(props: { route: Route; children: ReactNode; showTopbar?: boolean; onLogout?: () => void }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<ProductSearchItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const trimmed = useMemo(() => q.trim(), [q])

  useEffect(() => {
    if (!props.showTopbar) return
    if (trimmed.length < 2) {
      setItems(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const t = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      searchProducts(trimmed, { limit: 20 })
        .then((data) => {
          if (cancelled) return
          setItems(data)
        })
        .catch((err) => {
          if (cancelled) return
          setItems([])
          setError(err)
        })
        .finally(() => {
          if (cancelled) return
          setLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [trimmed, props.showTopbar])

  function onPick(p: ProductSearchItem) {
    setQ('')
    setItems(null)
    navigate({ name: 'product', id: p.id })
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="Mecatronics" />
          <div className="brand-text">
            <div className="brand-title">Mecatronics</div>
            <div className="brand-subtitle">Sistema de inventario</div>
          </div>
        </div>

        <nav className="nav">
          <a className={props.route.name === 'products' || props.route.name === 'product' ? 'nav-link active' : 'nav-link'} href={href({ name: 'products' })}>
            <Icon name="i-box" className="nav-icon" /> Productos
          </a>
          <a className={props.route.name === 'brands' ? 'nav-link active' : 'nav-link'} href={href({ name: 'brands' })}>
            <Icon name="i-tag" className="nav-icon" /> Marcas
          </a>
          <a className={props.route.name === 'categories' ? 'nav-link active' : 'nav-link'} href={href({ name: 'categories' })}>
            <Icon name="i-grid" className="nav-icon" /> Categorías
          </a>
          <a className={props.route.name === 'movements' ? 'nav-link active' : 'nav-link'} href={href({ name: 'movements' })}>
            <Icon name="i-move" className="nav-icon" /> Movimientos
          </a>
          <a className={props.route.name === 'audit' ? 'nav-link active' : 'nav-link'} href={href({ name: 'audit' })}>
            <Icon name="i-clipboard" className="nav-icon" /> Auditoría
          </a>
          <a className={props.route.name === 'users' ? 'nav-link active' : 'nav-link'} href={href({ name: 'users' })}>
            <Icon name="i-lock" className="nav-icon" /> Usuarios
          </a>
        </nav>
      </aside>

      <main className="main">
        {props.showTopbar ? (
          <div className="topbar">
            <div className="topbar-inner">
              <div className="search">
                <div className="input search-input">
                  <Icon name="i-search" className="input-icon" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto (SKU o nombre)" />
                </div>
                {loading ? <div className="search-hint">Buscando…</div> : null}
                {error ? (
                  <div className="search-panel">
                    <ErrorBox title="Error de búsqueda" error={error} />
                  </div>
                ) : null}
                {items ? (
                  <div className="search-panel">
                    {items.length ? (
                      <div className="search-list">
                        {items.map((p) => (
                          <button key={p.id} type="button" className="search-item" onClick={() => onPick(p)}>
                            <div className="search-item-title">{p.name}</div>
                            <div className="search-item-meta mono">{p.skuInternal}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="muted">Sin resultados</div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="topbar-actions">
                <button type="button" className="secondary" onClick={() => navigate({ name: 'products' })}>
                  Inicio
                </button>
                {props.onLogout ? (
                  <button type="button" className="secondary" onClick={props.onLogout}>
                    Salir
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        <div className="content">{props.children}</div>
      </main>
    </div>
  )
}
