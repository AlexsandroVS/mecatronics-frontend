import { useEffect, useState } from 'react'
import { z } from 'zod'
import { ApiError } from '../lib/api'
import { createBrand, listBrands, patchBrand, type Brand } from '../lib/inventory-api'
import { ErrorBox } from '../ui/ErrorBox'

const createBrandSchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(120, 'Máximo 120 caracteres')
})

export function BrandsPage() {
  const [items, setItems] = useState<Brand[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)

  const [name, setName] = useState('')
  const [formError, setFormError] = useState<unknown>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState<unknown>(null)
  const [editFieldError, setEditFieldError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    listBrands()
      .then((data) => {
        if (cancelled) return
        setItems(data)
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

    const parsed = createBrandSchema.safeParse({ name })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Nombre inválido')
      return
    }

    setSaving(true)
    try {
      const created = await createBrand(parsed.data)
      setItems((prev) => (prev ? [created, ...prev].sort((a, b) => a.name.localeCompare(b.name)) : [created]))
      setName('')
    } catch (err) {
      setFormError(err)
    } finally {
      setSaving(false)
    }
  }

  function openEdit(b: Brand) {
    setEditId(b.id)
    setEditName(b.name)
    setEditError(null)
    setEditFieldError(null)
  }

  function closeEdit() {
    setEditId(null)
    setEditName('')
    setEditError(null)
    setEditFieldError(null)
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (editId === null) return
    setEditError(null)
    setEditFieldError(null)

    const parsed = createBrandSchema.safeParse({ name: editName })
    if (!parsed.success) {
      setEditFieldError(parsed.error.issues[0]?.message ?? 'Nombre inválido')
      return
    }

    setEditSaving(true)
    try {
      const updated = await patchBrand(editId, parsed.data)
      setItems((prev) => (prev ? prev.map((b) => (b.id === updated.id ? updated : b)).sort((a, b) => a.name.localeCompare(b.name)) : prev))
      closeEdit()
    } catch (err) {
      setEditError(err)
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Marcas</h1>
      </div>

      <div className="card">
        <div className="card-title">Nueva marca</div>
        {formError ? <ErrorBox error={formError} /> : null}
        <form className="form" onSubmit={onCreate}>
          <label className="field">
            <div className="label">Nombre</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Husqvarna" />
            {fieldError ? <div className="field-error">{fieldError}</div> : null}
          </label>
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Crear'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Listado</div>
        {loadError ? <ErrorBox error={loadError} /> : null}
        {!items ? <div className="muted">Cargando…</div> : null}
        {items ? (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>ID</th>
                <th>Nombre</th>
                <th style={{ width: 160 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.id}</td>
                  <td>{b.name}</td>
                  <td>
                    <button type="button" className="small secondary" onClick={() => openEdit(b)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {editId !== null ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => (e.target === e.currentTarget ? closeEdit() : null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Editar marca</div>
              <button type="button" className="secondary" onClick={closeEdit} disabled={editSaving}>
                Cerrar
              </button>
            </div>
            {editError ? <ErrorBox title={editError instanceof ApiError && editError.code === 'FORBIDDEN' ? 'Requiere admin' : undefined} error={editError} /> : null}
            <form className="form" onSubmit={onSaveEdit}>
              <label className="field">
                <div className="label">Nombre</div>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                {editFieldError ? <div className="field-error">{editFieldError}</div> : null}
              </label>
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
