import { useEffect, useState } from 'react'
import { BrandsPage } from './pages/BrandsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { AuditPage } from './pages/AuditPage'
import { LoginPage } from './pages/LoginPage'
import { MovementsPage } from './pages/MovementsPage'
import { ProductPage } from './pages/ProductPage'
import { ProductsPage } from './pages/ProductsPage'
import { UsersPage } from './pages/UsersPage'
import { clearAuthToken, getAuthToken } from './lib/auth'
import { me } from './lib/inventory-api'
import { useRoute } from './lib/router'
import { AppShell } from './ui/AppShell'

export default function App() {
  const route = useRoute()
  const [ready, setReady] = useState(false)
  const [isAuthed, setIsAuthed] = useState(() => getAuthToken() !== null)

  useEffect(() => {
    if (!isAuthed) {
      setReady(true)
      return
    }

    let cancelled = false
    me()
      .then(() => {
        if (cancelled) return
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        clearAuthToken()
        setIsAuthed(false)
        setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthed])

  function onLogout() {
    clearAuthToken()
    setIsAuthed(false)
  }

  if (!ready) {
    return (
      <AppShell route={route}>
        <div className="muted">Cargando…</div>
      </AppShell>
    )
  }

  if (!isAuthed) {
    return <LoginPage onLogin={() => setIsAuthed(true)} />
  }

  return (
    <AppShell route={route} showTopbar onLogout={onLogout}>
      {route.name === 'products' ? <ProductsPage /> : null}
      {route.name === 'product' ? <ProductPage id={route.id} /> : null}
      {route.name === 'brands' ? <BrandsPage /> : null}
      {route.name === 'categories' ? <CategoriesPage /> : null}
      {route.name === 'movements' ? <MovementsPage /> : null}
      {route.name === 'audit' ? <AuditPage /> : null}
      {route.name === 'users' ? <UsersPage /> : null}
    </AppShell>
  )
}
