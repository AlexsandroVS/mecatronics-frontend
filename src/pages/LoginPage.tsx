import { useState } from 'react'
import { z } from 'zod'
import { login } from '../lib/inventory-api'
import { setAuthToken } from '../lib/auth'
import { ErrorBox } from '../ui/ErrorBox'
import { Icon } from '../ui/Icon'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Password requerido')
})

export function LoginPage(props: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldError(null)

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }

    setLoading(true)
    try {
      const res = await login(parsed.data)
      setAuthToken(res.token)
      props.onLogin()
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-title">Inventario Mecatrónica</div>
        <div className="auth-subtitle muted">Acceso para administración</div>

        {error ? <ErrorBox error={error} /> : null}

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <div className="label">Email</div>
            <div className="input">
              <Icon name="i-mail" className="input-icon" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="admin@tienda.com"
              />
            </div>
          </label>
          <label className="field">
            <div className="label">Password</div>
            <div className="input">
              <Icon name="i-lock" className="input-icon" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
          </label>
          {fieldError ? <div className="field-error">{fieldError}</div> : null}
          <div className="actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
