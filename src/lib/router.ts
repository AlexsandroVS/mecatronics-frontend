import { useEffect, useMemo, useState } from 'react'

export type Route =
  | Readonly<{ name: 'products' }>
  | Readonly<{ name: 'product'; id: number }>
  | Readonly<{ name: 'movements' }>
  | Readonly<{ name: 'brands' }>
  | Readonly<{ name: 'categories' }>
  | Readonly<{ name: 'audit' }>
  | Readonly<{ name: 'users' }>

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#/, '').replace(/^\/+/, '')
  const parts = clean ? clean.split('/') : []

  if (parts[0] === 'products' && parts[1]) {
    const id = Number(parts[1])
    if (Number.isInteger(id) && id > 0) return { name: 'product', id }
  }

  if (parts[0] === 'brands') return { name: 'brands' }
  if (parts[0] === 'categories') return { name: 'categories' }
  if (parts[0] === 'movements') return { name: 'movements' }
  if (parts[0] === 'audit') return { name: 'audit' }
  if (parts[0] === 'users') return { name: 'users' }
  return { name: 'products' }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'products':
      return '#/products'
    case 'product':
      return `#/products/${route.id}`
    case 'movements':
      return '#/movements'
    case 'brands':
      return '#/brands'
    case 'categories':
      return '#/categories'
    case 'audit':
      return '#/audit'
    case 'users':
      return '#/users'
  }
}

export function parseRouteHash(hash: string): Route {
  return parseHash(hash)
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return useMemo(() => parseHash(hash), [hash])
}

export function navigate(route: Route) {
  window.location.hash = href(route)
}
