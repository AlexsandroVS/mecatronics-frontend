import { z } from 'zod'
import { apiDownload, apiFetch } from './api'

export const brandSchema = z.object({
  id: z.number().int().positive(),
  name: z.string()
})
export type Brand = z.infer<typeof brandSchema>

export const categorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string()
})
export type Category = z.infer<typeof categorySchema>

export const productSchema = z.object({
  id: z.number().int().positive(),
  skuInternal: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(['MACHINE', 'PART', 'CONSUMABLE', 'ACCESSORY']),
  brandId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  technicalSpecs: z.unknown().nullable(),
  imageUrls: z.array(z.string()),
  stockMin: z.number().int(),
  priceCost: z.string(),
  priceSell: z.string(),
  currentStock: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type Product = z.infer<typeof productSchema>

export const productListItemSchema = z.object({
  id: z.number().int().positive(),
  skuInternal: z.string(),
  name: z.string(),
  kind: z.enum(['MACHINE', 'PART', 'CONSUMABLE', 'ACCESSORY']),
  currentStock: z.number().int(),
  stockMin: z.number().int(),
  priceSell: z.string()
})
export type ProductListItem = z.infer<typeof productListItemSchema>

export const productSearchItemSchema = z.object({
  id: z.number().int().positive(),
  skuInternal: z.string(),
  name: z.string(),
  kind: z.enum(['MACHINE', 'PART', 'CONSUMABLE', 'ACCESSORY'])
})
export type ProductSearchItem = z.infer<typeof productSearchItemSchema>

export const movementTypeSchema = z.enum(['PURCHASE', 'SALE', 'WORKSHOP', 'ADJUSTMENT'])
export type MovementType = z.infer<typeof movementTypeSchema>

const movementActorSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email()
})

export const inventoryMovementSchema = z.object({
  id: z.number().int().positive(),
  productId: z.number().int().positive(),
  type: movementTypeSchema,
  quantity: z.number().int(),
  stockBefore: z.number().int(),
  stockAfter: z.number().int(),
  referenceDoc: z.string().nullable(),
  actorUser: movementActorSchema.nullable(),
  createdAt: z.string()
})
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>

export const inventoryMovementGlobalSchema = inventoryMovementSchema.extend({
  product: z.object({
    id: z.number().int().positive(),
    skuInternal: z.string(),
    name: z.string()
  })
})
export type InventoryMovementGlobal = z.infer<typeof inventoryMovementGlobalSchema>

export const userSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'STAFF'])
})
export type User = z.infer<typeof userSchema>

export const userAdminSchema = userSchema.extend({
  createdAt: z.string()
})
export type UserAdmin = z.infer<typeof userAdminSchema>

export async function login(input: { email: string; password: string }): Promise<{ token: string; user: User }> {
  return apiFetch({
    path: '/auth/login',
    init: { method: 'POST', body: JSON.stringify(input) },
    parse: (data) => z.object({ token: z.string().min(1), user: userSchema }).parse(data)
  })
}

export async function me(): Promise<User | null> {
  return apiFetch({
    path: '/auth/me',
    parse: (data) => userSchema.nullable().parse(data)
  })
}

export async function listUsers(): Promise<UserAdmin[]> {
  return apiFetch({
    path: '/users',
    parse: (data) => z.array(userAdminSchema).parse(data)
  })
}

export async function createUser(input: { email: string; password: string; role: User['role'] }): Promise<UserAdmin> {
  return apiFetch({
    path: '/users',
    init: { method: 'POST', body: JSON.stringify(input) },
    parse: (data) => userAdminSchema.parse(data)
  })
}

export async function patchUser(id: number, input: { email?: string; password?: string; role?: User['role'] }): Promise<UserAdmin> {
  return apiFetch({
    path: `/users/${id}`,
    init: { method: 'PATCH', body: JSON.stringify(input) },
    parse: (data) => userAdminSchema.parse(data)
  })
}

export async function deleteUser(id: number): Promise<void> {
  await apiFetch({
    path: `/users/${id}`,
    init: { method: 'DELETE' },
    parse: () => undefined
  })
}

const cloudinarySignSchema = z.object({
  cloudName: z.string().min(1),
  apiKey: z.string().min(1),
  timestamp: z.number().int(),
  folder: z.string().min(1),
  signature: z.string().min(1)
})

export async function cloudinarySign(input?: { folder?: string }): Promise<z.infer<typeof cloudinarySignSchema>> {
  const q = new URLSearchParams()
  if (input?.folder) q.set('folder', input.folder)
  return apiFetch({
    path: `/images/cloudinary/sign${q.size ? `?${q.toString()}` : ''}`,
    parse: (data) => cloudinarySignSchema.parse(data)
  })
}

export async function listBrands(): Promise<Brand[]> {
  return apiFetch({
    path: '/brands',
    parse: (data) => z.array(brandSchema).parse(data)
  })
}

export async function createBrand(input: { name: string }): Promise<Brand> {
  return apiFetch({
    path: '/brands',
    init: { method: 'POST', body: JSON.stringify(input) },
    parse: (data) => brandSchema.parse(data)
  })
}

export async function patchBrand(id: number, input: { name: string }): Promise<Brand> {
  return apiFetch({
    path: `/brands/${id}`,
    init: { method: 'PATCH', body: JSON.stringify(input) },
    parse: (data) => brandSchema.parse(data)
  })
}

export async function listCategories(): Promise<Category[]> {
  return apiFetch({
    path: `/categories`,
    parse: (data) => z.array(categorySchema).parse(data)
  })
}
export async function createCategory(input: { name: string }): Promise<Category> {
  return apiFetch({
    path: '/categories',
    init: { method: 'POST', body: JSON.stringify(input) },
    parse: (data) => categorySchema.parse(data)
  })
}

export async function patchCategory(id: number, input: { name: string }): Promise<Category> {
  return apiFetch({
    path: `/categories/${id}`,
    init: { method: 'PATCH', body: JSON.stringify(input) },
    parse: (data) => categorySchema.parse(data)
  })
}
export async function listProducts(input?: {
  q?: string
  page?: number
  kind?: ProductListItem['kind']
  lowStock?: boolean
  sort?: 'NAME' | 'STOCK' | 'PRICE_SELL'
  dir?: 'ASC' | 'DESC'
}): Promise<ProductListItem[]> {
  const q = new URLSearchParams()
  if (input?.q) q.set('q', input.q)
  if (input?.page !== undefined) q.set('page', String(input.page))
  if (input?.kind) q.set('kind', input.kind)
  if (input?.lowStock !== undefined) q.set('lowStock', String(input.lowStock))
  if (input?.sort) q.set('sort', input.sort)
  if (input?.dir) q.set('dir', input.dir)

  return apiFetch({
    path: `/products${q.size ? `?${q.toString()}` : ''}`,
    parse: (data) => z.array(productListItemSchema).parse(data)
  })
}

export async function searchProducts(
  q: string,
  input?: { kind?: ProductSearchItem['kind']; machineSubtype?: string; limit?: number }
): Promise<ProductSearchItem[]> {
  const qs = new URLSearchParams({ q })
  if (input?.kind) qs.set('kind', input.kind)
  if (input?.machineSubtype) qs.set('machineSubtype', input.machineSubtype)
  if (input?.limit !== undefined) qs.set('limit', String(input.limit))
  return apiFetch({
    path: `/products/search?${qs.toString()}`,
    parse: (data) => z.array(productSearchItemSchema).parse(data)
  })
}

export async function getProduct(id: number): Promise<Product> {
  return apiFetch({
    path: `/products/${id}`,
    parse: (data) => productSchema.parse(data)
  })
}

export async function createProduct(input: {
  name: string
  description?: string | null
  kind?: 'MACHINE' | 'PART' | 'CONSUMABLE' | 'ACCESSORY'
  brandId: number
  categoryId: number
  stockMin?: number
  priceCost: string
  priceSell: string
  imageUrls?: string[]
  specs?: Record<string, unknown>
  attributes?: { key: string; value: string }[]
}): Promise<Product> {
  return apiFetch({
    path: '/products',
    init: { method: 'POST', body: JSON.stringify(input) },
    parse: (data) => productSchema.parse(data)
  })
}


const compatibilitiesSchema = z.object({
  machines: z.array(productSearchItemSchema),
  parts: z.array(productSearchItemSchema)
})
export type Compatibilities = z.infer<typeof compatibilitiesSchema>

export async function getCompatibilities(productId: number): Promise<Compatibilities> {
  return apiFetch({
    path: `/compatibilities/${productId}`,
    parse: (data) => compatibilitiesSchema.parse(data)
  })
}

export async function addCompatibility(input: { partId: number; machineId: number }): Promise<void> {
  await apiFetch({
    path: '/compatibilities',
    init: { method: 'POST', body: JSON.stringify(input) },
    parse: () => null
  })
}

export async function removeCompatibility(input: { partId: number; machineId: number }): Promise<void> {
  await apiFetch({
    path: `/compatibilities/${input.partId}/${input.machineId}`,
    init: { method: 'DELETE' },
    parse: () => null
  })
}

export const auditLogItemSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.string(),
  actorUser: z
    .object({
      id: z.number().int().positive(),
      email: z.string().email(),
      role: z.enum(['ADMIN', 'STAFF'])
    })
    .nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.number().int().positive().nullable(),
  metadata: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable()
})
export type AuditLogItem = z.infer<typeof auditLogItemSchema>

export async function listAuditLogs(input?: {
  page?: number
  entityType?: string
  entityId?: number
  actorUserId?: number
  action?: string
}): Promise<AuditLogItem[]> {
  const q = new URLSearchParams()
  if (input?.page !== undefined) q.set('page', String(input.page))
  if (input?.entityType) q.set('entityType', input.entityType)
  if (input?.entityId !== undefined) q.set('entityId', String(input.entityId))
  if (input?.actorUserId !== undefined) q.set('actorUserId', String(input.actorUserId))
  if (input?.action) q.set('action', input.action)

  return apiFetch({
    path: `/audit-logs${q.size ? `?${q.toString()}` : ''}`,
    parse: (data) => z.array(auditLogItemSchema).parse(data)
  })
}

export async function patchProduct(
  id: number,
  input: Partial<{
    name: string
    description: string | null
    kind: 'MACHINE' | 'PART' | 'CONSUMABLE' | 'ACCESSORY'
    brandId: number
    categoryId: number
    stockMin: number
    priceCost: string
    priceSell: string
    imageUrls: string[]
    specs: Record<string, unknown>
    attributes: { key: string; value: string }[]
  }>
): Promise<Product> {
  return apiFetch({
    path: `/products/${id}`,
    init: { method: 'PATCH', body: JSON.stringify(input) },
    parse: (data) => productSchema.parse(data)
  })
}

export async function listMovements(input: {
  productId: number
  limit?: number
  offset?: number
  dateFrom?: string
  dateTo?: string
}): Promise<InventoryMovement[]> {
  const q = new URLSearchParams({ productId: String(input.productId) })
  if (input.limit !== undefined) q.set('limit', String(input.limit))
  if (input.offset !== undefined) q.set('offset', String(input.offset))
  if (input.dateFrom) q.set('dateFrom', input.dateFrom)
  if (input.dateTo) q.set('dateTo', input.dateTo)

  return apiFetch({
    path: `/inventory-movements?${q.toString()}`,
    parse: (data) => z.array(inventoryMovementSchema).parse(data)
  })
}

export async function listMovementsGlobal(input?: {
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}): Promise<InventoryMovementGlobal[]> {
  const q = new URLSearchParams()
  if (input?.dateFrom) q.set('dateFrom', input.dateFrom)
  if (input?.dateTo) q.set('dateTo', input.dateTo)
  if (input?.limit !== undefined) q.set('limit', String(input.limit))
  if (input?.offset !== undefined) q.set('offset', String(input.offset))

  return apiFetch({
    path: `/inventory-movements/global${q.size ? `?${q.toString()}` : ''}`,
    parse: (data) => z.array(inventoryMovementGlobalSchema).parse(data)
  })
}

export async function exportMovements(input: {
  format: 'PDF' | 'XLSX'
  productId?: number
  dateFrom?: string
  dateTo?: string
}): Promise<{ blob: Blob; filename: string | null }> {
  const q = new URLSearchParams({ format: input.format })
  if (input.productId !== undefined) q.set('productId', String(input.productId))
  if (input.dateFrom) q.set('dateFrom', input.dateFrom)
  if (input.dateTo) q.set('dateTo', input.dateTo)
  const res = await apiDownload({ path: `/inventory-movements/export?${q.toString()}` })
  return { blob: res.blob, filename: res.filename }
}

export async function exportProducts(input: {
  format: 'PDF' | 'XLSX'
  q?: string
  kind?: ProductListItem['kind']
  lowStock?: boolean
  sort?: 'NAME' | 'STOCK'
  dir?: 'ASC' | 'DESC'
}): Promise<{ blob: Blob; filename: string | null }> {
  const q = new URLSearchParams({ format: input.format })
  if (input.q) q.set('q', input.q)
  if (input.kind) q.set('kind', input.kind)
  if (input.lowStock !== undefined) q.set('lowStock', String(input.lowStock))
  if (input.sort) q.set('sort', input.sort)
  if (input.dir) q.set('dir', input.dir)
  const res = await apiDownload({ path: `/products/export?${q.toString()}` })
  return { blob: res.blob, filename: res.filename }
}

export async function createMovement(input: {
  productId: number
  type: MovementType
  quantity: number
  referenceDoc?: string | null
}): Promise<InventoryMovement> {
  return apiFetch({
    path: '/inventory-movements',
    init: { method: 'POST', body: JSON.stringify(input) },
    parse: (data) => inventoryMovementSchema.parse(data)
  })
}
