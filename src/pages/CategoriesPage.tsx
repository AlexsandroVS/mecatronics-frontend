import { useEffect, useState } from 'react'
import { z } from 'zod'
import { ApiError } from '../lib/api'
import { createCategory, listCategories, patchCategory, type Category } from '../lib/inventory-api'
import { ErrorBox } from '../ui/ErrorBox'

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(120, 'Máximo 120 caracteres')
})

export function CategoriesPage() {
  const [items, setItems] = useState<Category[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)

  const [name, setName] = useState('')
  const [formError, setFormError] = useState<unknown>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<unknown>(null)
  const [editFieldError, setEditFieldError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    listCategories()
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

    const parsed = createCategorySchema.safeParse({ name })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Categoría inválida')
      return
    }

    setSaving(true)
    try {
      const created = await createCategory(parsed.data)
      setItems((prev) => (prev ? [created, ...prev] : [created]))
      setName('')
    } catch (err) {
      setFormError(err)
    } finally {
      setSaving(false)
    }
  }

  function openEdit(c: Category) {
    setEditTarget(c)
    setEditName(c.name)
    setEditError(null)
    setEditFieldError(null)
    setEditOpen(true)
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditError(null)
    setEditFieldError(null)

    const parsed = createCategorySchema.safeParse({ name: editName })
    if (!parsed.success) {
      setEditFieldError(parsed.error.issues[0]?.message ?? 'Categoría inválida')
      return
    }

    setEditSaving(true)
    try {
      const updated = await patchCategory(editTarget.id, { name: parsed.data.name })
      setItems((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev))
      setEditOpen(false)
      setEditTarget(null)
    } catch (err) {
      setEditError(err)
      if (err instanceof ApiError && err.code === 'FORBIDDEN') {
        setEditFieldError('Solo ADMIN puede editar categorías')
      }
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Categorías</h1>
      </div>

      {editOpen && editTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">Editar categoría</div>
                <div className="muted mono">#{editTarget.id}</div>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditOpen(false)
                  setEditTarget(null)
                }}
                disabled={editSaving}
              >
                Cerrar
              </button>
            </div>

            {editError ? <ErrorBox error={editError} /> : null}
            {editFieldError ? <div className="field-error">{editFieldError}</div> : null}

            <form className="form" onSubmit={onSaveEdit}>
              <label className="field">
                <div className="label">Nombre</div>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <div className="actions">
                <button type="submit" disabled={editSaving}>
                  {editSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">Nueva categoría</div>
        {formError ? <ErrorBox error={formError} /> : null}
        <form className="form" onSubmit={onCreate}>
          <div className="grid2">
            <label className="field">
              <div className="label">Nombre</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Motosierras" />
            </label>
            <div className="field">
              <div className="label">Descripción</div>
              <div className="muted">Las categorías ya no tienen niveles.</div>
            </div>
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
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.id}</td>
                  <td>{c.name}</td>
                  <td>
                    <button type="button" className="small secondary" onClick={() => openEdit(c)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  )
}
