import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { ApiError } from '../lib/api'
import { createUser, deleteUser, listUsers, patchUser, type UserAdmin } from '../lib/inventory-api'
import { ErrorBox } from '../ui/ErrorBox'

const createUserSchema = z.object({
  email: z.string().email('Email inválido').max(200),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(200),
  role: z.enum(['ADMIN', 'STAFF'])
})

const patchUserSchema = z
  .object({
    email: z.string().email('Email inválido').max(200).optional(),
    password: z.string().min(8, 'Mínimo 8 caracteres').max(200).optional(),
    role: z.enum(['ADMIN', 'STAFF']).optional()
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Debe enviar al menos un campo' })

function cmpUser(a: UserAdmin, b: UserAdmin) {
  const ra = a.role === 'ADMIN' ? 0 : 1
  const rb = b.role === 'ADMIN' ? 0 : 1
  if (ra !== rb) return ra - rb
  const byEmail = a.email.localeCompare(b.email)
  if (byEmail !== 0) return byEmail
  return a.id - b.id
}

export function UsersPage() {
  const [items, setItems] = useState<UserAdmin[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'STAFF'>('STAFF')
  const [formError, setFormError] = useState<unknown>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editRole, setEditRole] = useState<'ADMIN' | 'STAFF'>('STAFF')
  const [editError, setEditError] = useState<unknown>(null)
  const [editFieldError, setEditFieldError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const forbiddenTitle = useMemo(() => {
    if (!(loadError instanceof ApiError)) return undefined
    return loadError.code === 'FORBIDDEN' ? 'Requiere admin' : undefined
  }, [loadError])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    listUsers()
      .then((data) => {
        if (cancelled) return
        setItems(data.slice().sort(cmpUser))
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFieldError(null)

    const parsed = createUserSchema.safeParse({ email, password, role })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }

    setSaving(true)
    try {
      const created = await createUser(parsed.data)
      setItems((prev) => (prev ? [...prev, created].sort(cmpUser) : [created]))
      setEmail('')
      setPassword('')
      setRole('STAFF')
    } catch (err) {
      setFormError(err)
    } finally {
      setSaving(false)
    }
  }

  function openEdit(u: UserAdmin) {
    setEditOpen(true)
    setEditId(u.id)
    setEditEmail(u.email)
    setEditPassword('')
    setEditRole(u.role)
    setEditError(null)
    setEditFieldError(null)
  }

  function closeEdit() {
    setEditOpen(false)
    setEditId(null)
    setEditEmail('')
    setEditPassword('')
    setEditRole('STAFF')
    setEditError(null)
    setEditFieldError(null)
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (editId === null) return
    setEditError(null)
    setEditFieldError(null)

    const payload: { email?: string; password?: string; role?: 'ADMIN' | 'STAFF' } = {}
    if (editEmail.trim()) payload.email = editEmail.trim()
    if (editPassword.trim()) payload.password = editPassword.trim()
    payload.role = editRole

    const parsed = patchUserSchema.safeParse(payload)
    if (!parsed.success) {
      setEditFieldError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }

    setEditSaving(true)
    try {
      const updated = await patchUser(editId, parsed.data)
      setItems((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)).sort(cmpUser) : prev))
      closeEdit()
    } catch (err) {
      setEditError(err)
    } finally {
      setEditSaving(false)
    }
  }

  async function onDelete(u: UserAdmin) {
    if (!window.confirm(`Eliminar usuario ${u.email}?`)) return
    try {
      await deleteUser(u.id)
      setItems((prev) => (prev ? prev.filter((x) => x.id !== u.id) : prev))
    } catch (err) {
      setLoadError(err)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Usuarios</h1>
      </div>

      {loadError ? <ErrorBox title={forbiddenTitle} error={loadError} /> : null}

      <div className="card">
        <div className="card-title">Nuevo usuario</div>
        {formError ? <ErrorBox title={formError instanceof ApiError && formError.code === 'FORBIDDEN' ? 'Requiere admin' : undefined} error={formError} /> : null}
        <form className="form" onSubmit={onCreate}>
          <div className="grid3">
            <label className="field">
              <div className="label">Email</div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@correo.com" />
            </label>
            <label className="field">
              <div className="label">Contraseña</div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 8 caracteres" />
            </label>
            <label className="field">
              <div className="label">Rol</div>
              <select value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'STAFF')}>
                <option value="STAFF">Normal</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
          </div>
          {fieldError ? <div className="field-error">{fieldError}</div> : null}
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Crear'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Listado</div>
        {!items ? <div className="muted">Cargando…</div> : null}
        {items ? (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>ID</th>
                <th>Email</th>
                <th style={{ width: 120 }}>Rol</th>
                <th style={{ width: 190 }}>Creado</th>
                <th style={{ width: 210 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.id}</td>
                  <td className="mono">{u.email}</td>
                  <td>{u.role === 'ADMIN' ? 'Admin' : 'Normal'}</td>
                  <td className="mono">{new Date(u.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="row">
                      <button type="button" className="small secondary" onClick={() => openEdit(u)}>
                        Editar
                      </button>
                      <button type="button" className="small danger" onClick={() => void onDelete(u)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin usuarios
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
      </div>

      {editOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => (e.target === e.currentTarget ? closeEdit() : null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Editar usuario</div>
              <button type="button" className="secondary" onClick={closeEdit} disabled={editSaving}>
                Cerrar
              </button>
            </div>
            {editError ? <ErrorBox title={editError instanceof ApiError && editError.code === 'FORBIDDEN' ? 'Requiere admin' : undefined} error={editError} /> : null}
            <form className="form" onSubmit={onSaveEdit}>
              <div className="grid2">
                <label className="field">
                  <div className="label">Email</div>
                  <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">Rol</div>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value as 'ADMIN' | 'STAFF')}>
                    <option value="STAFF">Normal</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <div className="label">Nueva contraseña (opcional)</div>
                <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="dejar vacío para no cambiar" />
              </label>
              {editFieldError ? <div className="field-error">{editFieldError}</div> : null}
              <div className="actions">
                <button type="submit" disabled={editSaving}>
                  {editSaving ? 'Guardando…' : 'Guardar'}
                </button>
                <button type="button" className="secondary" onClick={closeEdit} disabled={editSaving}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

