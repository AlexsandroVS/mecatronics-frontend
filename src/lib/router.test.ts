import { describe, expect, it } from 'vitest'
import { href, parseRouteHash } from './router'

describe('router', () => {
  it('parses products', () => {
    expect(parseRouteHash('#/products')).toEqual({ name: 'products' })
    expect(parseRouteHash('')).toEqual({ name: 'products' })
  })

  it('parses product detail', () => {
    expect(parseRouteHash('#/products/10')).toEqual({ name: 'product', id: 10 })
  })

  it('parses brands/categories', () => {
    expect(parseRouteHash('#/brands')).toEqual({ name: 'brands' })
    expect(parseRouteHash('#/categories')).toEqual({ name: 'categories' })
    expect(parseRouteHash('#/audit')).toEqual({ name: 'audit' })
  })

  it('generates href', () => {
    expect(href({ name: 'products' })).toBe('#/products')
    expect(href({ name: 'product', id: 2 })).toBe('#/products/2')
    expect(href({ name: 'brands' })).toBe('#/brands')
    expect(href({ name: 'categories' })).toBe('#/categories')
    expect(href({ name: 'audit' })).toBe('#/audit')
  })
})
