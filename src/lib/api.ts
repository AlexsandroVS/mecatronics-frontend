import { z } from 'zod'
import { getAuthToken } from './auth'

export type ApiErrorDetail = Readonly<{ path: string; message: string }>

export type ApiErrorPayload = Readonly<{
  error: { code: string; message: string; details?: readonly ApiErrorDetail[] }
  requestId?: string
}>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: readonly ApiErrorDetail[]
  readonly requestId?: string

  constructor(input: { status: number; code: string; message: string; details?: readonly ApiErrorDetail[]; requestId?: string }) {
    super(input.message)
    this.status = input.status
    this.code = input.code
    this.details = input.details
    this.requestId = input.requestId
  }
}

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional()
  }),
  requestId: z.string().optional()
})

function apiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  return raw?.replace(/\/+$/, '') ?? 'http://localhost:3000'
}

export async function apiFetch<TResponse>(input: { path: string; init?: RequestInit; parse: (data: unknown) => TResponse }): Promise<TResponse> {
  const hasBody = input.init?.body !== undefined && input.init?.body !== null
  const token = getAuthToken()

  const res = await fetch(`${apiBaseUrl()}${input.path}`, {
    ...input.init,
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(input.init?.headers ?? {})
    }
  })

  const text = await res.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      throw new ApiError({ status: res.status, code: 'PARSE_ERROR', message: 'Respuesta inválida del servidor' })
    }
  }

  if (!res.ok) {
    const parsed = errorSchema.safeParse(data)
    if (parsed.success) {
      throw new ApiError({
        status: res.status,
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        details: parsed.data.error.details,
        requestId: parsed.data.requestId
      })
    }

    throw new ApiError({
      status: res.status,
      code: 'HTTP_ERROR',
      message: `Error HTTP ${res.status}`
    })
  }

  return input.parse(data)
}

export async function apiDownload(input: { path: string; init?: RequestInit }): Promise<{
  blob: Blob
  filename: string | null
  contentType: string | null
}> {
  const token = getAuthToken()

  const res = await fetch(`${apiBaseUrl()}${input.path}`, {
    ...input.init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(input.init?.headers ?? {})
    }
  })

  const buf = await res.arrayBuffer()

  if (!res.ok) {
    let data: unknown = undefined
    try {
      const text = new TextDecoder().decode(buf)
      data = text ? (JSON.parse(text) as unknown) : undefined
    } catch {
      throw new ApiError({ status: res.status, code: 'HTTP_ERROR', message: `Error HTTP ${res.status}` })
    }

    const parsed = errorSchema.safeParse(data)
    if (parsed.success) {
      throw new ApiError({
        status: res.status,
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        details: parsed.data.error.details,
        requestId: parsed.data.requestId
      })
    }

    throw new ApiError({ status: res.status, code: 'HTTP_ERROR', message: `Error HTTP ${res.status}` })
  }

  const contentType = res.headers.get('content-type')
  const cd = res.headers.get('content-disposition')
  const filename = cd?.match(/filename="([^"]+)"/)?.[1] ?? null
  const blob = new Blob([buf], { type: contentType ?? 'application/octet-stream' })
  return { blob, filename, contentType }
}
