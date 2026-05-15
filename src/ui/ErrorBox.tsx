import type { ApiError } from '../lib/api'

export function ErrorBox(props: { title?: string; error: unknown }) {
  const e = props.error as Partial<ApiError> | undefined

  const message =
    typeof e?.message === 'string' ? e.message : props.error instanceof Error ? props.error.message : 'Error inesperado'

  const details = Array.isArray(e?.details) ? e.details : undefined
  const requestId = typeof e?.requestId === 'string' ? e.requestId : undefined

  return (
    <div className="error-box" role="alert">
      <div className="error-title">{props.title ?? 'Error'}</div>
      <div className="error-message">{message}</div>
      {details?.length ? (
        <ul className="error-details">
          {details.map((d) => (
            <li key={`${d.path}:${d.message}`}>
              <span className="mono">{d.path}</span>: {d.message}
            </li>
          ))}
        </ul>
      ) : null}
      {requestId ? <div className="error-request">requestId: {requestId}</div> : null}
    </div>
  )
}

