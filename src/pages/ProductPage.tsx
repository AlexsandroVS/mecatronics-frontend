import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { ApiError } from '../lib/api'
import {
  addCompatibility,
  cloudinarySign,
  createMovement,
  exportMovements,
  getCompatibilities,
  getProduct,
  listBrands,
  listCategories,
  listMovements,
  patchProduct,
  removeCompatibility,
  searchProducts,
  type Brand,
  type Category,
  type Compatibilities,
  type InventoryMovement,
  type MovementType,
  type ProductSearchItem,
  type Product
} from '../lib/inventory-api'
import { navigate } from '../lib/router'
import { useMediaQuery } from '../lib/useMediaQuery'
import { ErrorBox } from '../ui/ErrorBox'
import { Icon } from '../ui/Icon'

const createMovementTypeSchema = z.enum(['PURCHASE', 'SALE', 'ADJUSTMENT'])

const createMovementSchema = z
  .object({
    type: createMovementTypeSchema,
    quantity: z.number().int(),
    referenceDoc: z.string().trim().min(1).max(120).nullable()
  })
  .superRefine((val, ctx) => {
    if (val.type === 'ADJUSTMENT') {
      if (val.quantity === 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Debe ser distinto de 0' })
      return
    }
    if (val.quantity <= 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Debe ser > 0' })
  })

const moneySchema = z.string().regex(/^\d+(\.\d+)?$/, 'Formato inválido (ej: 10.00)')

const specsSchema = z
  .object({
    modelo: z.string().trim().min(1).max(120).optional(),
    cilindrada_cc: z.number().positive().optional(),
    potencia_kw: z.number().positive().optional(),
    potencia_hp: z.number().positive().optional(),
    peso_kg: z.number().positive().optional(),
    espada_recomendada_pulg: z.string().trim().min(1).max(40).optional(),
    paso_cadena: z.string().trim().min(1).max(40).optional(),
    codigo_oem: z.string().trim().min(1).max(80).optional(),
    viscosidad: z.string().trim().min(1).max(80).optional(),
    capacidad_ml: z.number().int().positive().optional(),
    observaciones: z.string().trim().min(1).max(400).optional()
  })
  .partial()

const attributesSchema = z
  .array(z.object({ key: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(160) }))
  .max(40)

function parseTechnicalSpecs(input: unknown): {
  known: z.infer<typeof specsSchema>
  machineSubtype: string | null
  attributes: Array<{ key: string; value: string }>
} {
  const knownKeys = new Set([
    'modelo',
    'cilindrada_cc',
    'potencia_kw',
    'potencia_hp',
    'peso_kg',
    'espada_recomendada_pulg',
    'paso_cadena',
    'codigo_oem',
    'viscosidad',
    'capacidad_ml',
    'observaciones'
  ])

  const known: Record<string, unknown> = {}
  let machineSubtype: string | null = null
  const attributes: Array<{ key: string; value: string }> = []
  const hiddenKeys = new Set([
    'potencia_nominal_kw',
    'potencia_max_kw',
    'voltaje_v',
    'capacidad_tanque_l',
    'sistema_arranque',
    'presion_max_psi',
    'presion_max_bar',
    'presion_trabajo_psi',
    'presion_trabajo_bar',
    'caudal_lmin',
    'caudal_lh',
    'longitud_manguera_m',
    'temperatura_entrada_max_c',
    'tipo_motor',
    'diametro_succion_pulg',
    'diametro_descarga_pulg',
    'caudal_max_lmin',
    'caudal_max_m3_h',
    'altura_max_m',
    'fases',
    'tipo_fluido',
    'paso_solidos_mm',
    'longitud_espada_pulg'
  ])
  const hiddenPrefixes = [
    'generator_',
    'pressure_washer_',
    'pump_',
    'brushcutter_',
    'cutoff_',
    'mower_'
  ]

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (knownKeys.has(k)) known[k] = v
      else {
        if (k === 'machine_subtype') {
          if (typeof v === 'string' && v.trim()) machineSubtype = v.trim()
          continue
        }
        if (hiddenKeys.has(k)) continue
        if (hiddenPrefixes.some((p) => k.startsWith(p))) continue
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') attributes.push({ key: k, value: String(v) })
      }
    }
  }

  return { known: specsSchema.parse(known), machineSubtype, attributes }
}

const patchProductSchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(160, 'Máximo 160 caracteres'),
  description: z.string().trim().min(1).max(4000).nullable(),
  kind: z.enum(['MACHINE', 'PART', 'CONSUMABLE', 'ACCESSORY']),
  stockMin: z.number().int().min(0),
  priceCost: moneySchema,
  priceSell: moneySchema,
  imageUrls: z.array(z.string().url()).max(1).optional(),
  specs: specsSchema.optional(),
  attributes: attributesSchema.optional()
})

function downloadBlob(input: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(input.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = input.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ProductPage(props: { id: number }) {
  const isMobile = useMediaQuery('(max-width: 560px)')
  const [product, setProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<InventoryMovement[] | null>(null)
  const [compat, setCompat] = useState<Compatibilities | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [machineSubtype, setMachineSubtype] = useState<string | null>(null)

  const [type, setType] = useState<MovementType>('PURCHASE')
  const [quantityRaw, setQuantityRaw] = useState('1')
  const [referenceDoc, setReferenceDoc] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<unknown>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [movementOpen, setMovementOpen] = useState(false)
  const [kardexType, setKardexType] = useState<'ALL' | MovementType>('ALL')
  const [kardexOrder, setKardexOrder] = useState<'DESC' | 'ASC'>('DESC')
  const [kardexQ, setKardexQ] = useState('')
  const [reportDateFrom, setReportDateFrom] = useState('')
  const [reportDateTo, setReportDateTo] = useState('')
  const [reportBusy, setReportBusy] = useState(false)

  const [compatQ, setCompatQ] = useState('')
  const [compatKind, setCompatKind] = useState<'PART' | 'CONSUMABLE' | 'ACCESSORY'>('PART')
  const [compatItems, setCompatItems] = useState<ProductSearchItem[] | null>(null)
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatError, setCompatError] = useState<unknown>(null)
  const [compatSaving, setCompatSaving] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<unknown>(null)
  const [editFieldError, setEditFieldError] = useState<string | null>(null)
  const [editUploading, setEditUploading] = useState(false)

  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editKind, setEditKind] = useState<Product['kind']>('PART')
  const [editMachineSubtype, setEditMachineSubtype] = useState<
    'CHAINSAW' | 'GENERATOR' | 'PRESSURE_WASHER' | 'WATER_PUMP' | 'BRUSHCUTTER' | 'CUT_OFF_SAW' | 'LAWN_MOWER' | 'OTHER'
  >('CHAINSAW')
  const [editStockMinRaw, setEditStockMinRaw] = useState('0')
  const [editPriceCost, setEditPriceCost] = useState('')
  const [editPriceSell, setEditPriceSell] = useState('')
  const [editImageUrlsRaw, setEditImageUrlsRaw] = useState('')

  const [modelo, setModelo] = useState('')
  const [cilindradaCcRaw, setCilindradaCcRaw] = useState('')
  const [potenciaHpRaw, setPotenciaHpRaw] = useState('')
  const [pesoKgRaw, setPesoKgRaw] = useState('')
  const [espadaRecomendadaPulg, setEspadaRecomendadaPulg] = useState('')
  const [pasoCadena, setPasoCadena] = useState('')
  const [codigoOem, setCodigoOem] = useState('')
  const [viscosidad, setViscosidad] = useState('')
  const [capacidadMlRaw, setCapacidadMlRaw] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [attributes, setAttributes] = useState<Array<{ key: string; value: string }>>([])

  const [editGenPowerNominalRaw, setEditGenPowerNominalRaw] = useState('')
  const [editGenPowerMaxRaw, setEditGenPowerMaxRaw] = useState('')
  const [editGenVoltageRaw, setEditGenVoltageRaw] = useState('')
  const [editGenTankLitersRaw, setEditGenTankLitersRaw] = useState('')
  const [editGenStartType, setEditGenStartType] = useState<'MANUAL' | 'ELECTRIC' | 'BATTERY' | 'OTHER'>('MANUAL')
  const [editGenDisplacementCcRaw, setEditGenDisplacementCcRaw] = useState('')

  const [editPwPressureMaxRaw, setEditPwPressureMaxRaw] = useState('')
  const [editPwPressureWorkRaw, setEditPwPressureWorkRaw] = useState('')
  const [editPwPressureUnit, setEditPwPressureUnit] = useState<'PSI' | 'BAR'>('PSI')
  const [editPwFlowRateRaw, setEditPwFlowRateRaw] = useState('')
  const [editPwFlowUnit, setEditPwFlowUnit] = useState<'L_MIN' | 'L_H'>('L_MIN')
  const [editPwDriveType, setEditPwDriveType] = useState<'ELECTRIC' | 'COMBUSTION' | 'OTHER'>('ELECTRIC')
  const [editPwHoseLengthMRaw, setEditPwHoseLengthMRaw] = useState('')
  const [editPwMaxInletTempCRaw, setEditPwMaxInletTempCRaw] = useState('')

  const [editPumpFlowMaxRaw, setEditPumpFlowMaxRaw] = useState('')
  const [editPumpFlowUnit, setEditPumpFlowUnit] = useState<'M3_H' | 'L_MIN'>('M3_H')
  const [editPumpHeadMaxMRaw, setEditPumpHeadMaxMRaw] = useState('')
  const [editPumpInletDiameterIn, setEditPumpInletDiameterIn] = useState('')
  const [editPumpOutletDiameterIn, setEditPumpOutletDiameterIn] = useState('')
  const [editPumpPhases, setEditPumpPhases] = useState<'MONO' | 'TRI'>('MONO')
  const [editPumpVoltageRaw, setEditPumpVoltageRaw] = useState('')
  const [editPumpFluidType, setEditPumpFluidType] = useState<'CLEAN' | 'DIRTY' | 'OTHER'>('CLEAN')
  const [editPumpSolidPassMmRaw, setEditPumpSolidPassMmRaw] = useState('')

  const [editBcPowerRaw, setEditBcPowerRaw] = useState('')
  const [editBcPowerUnit, setEditBcPowerUnit] = useState<'HP' | 'KW'>('HP')
  const [editBcDisplacementCcRaw, setEditBcDisplacementCcRaw] = useState('')
  const [editBcVoltageRaw, setEditBcVoltageRaw] = useState('')
  const [editBcCutDiameterMmRaw, setEditBcCutDiameterMmRaw] = useState('')
  const [editBcToolType, setEditBcToolType] = useState<'NYLON' | 'BLADE_3T' | 'SAW_DISC' | 'OTHER'>('NYLON')
  const [editBcWeightKgRaw, setEditBcWeightKgRaw] = useState('')

  const [editCutDiscDiameterRaw, setEditCutDiscDiameterRaw] = useState('')
  const [editCutDiscUnit, setEditCutDiscUnit] = useState<'IN' | 'MM'>('IN')
  const [editCutDepthMaxRaw, setEditCutDepthMaxRaw] = useState('')
  const [editCutPowerRaw, setEditCutPowerRaw] = useState('')
  const [editCutPowerUnit, setEditCutPowerUnit] = useState<'HP' | 'KW'>('HP')
  const [editCutWaterTankLRaw, setEditCutWaterTankLRaw] = useState('')
  const [editCutWeightKgRaw, setEditCutWeightKgRaw] = useState('')

  const [editMowerCutWidthRaw, setEditMowerCutWidthRaw] = useState('')
  const [editMowerCutWidthUnit, setEditMowerCutWidthUnit] = useState<'CM' | 'IN'>('CM')
  const [editMowerTraction, setEditMowerTraction] = useState<'MANUAL' | 'SELF' | 'VARIABLE' | 'HYDRO'>('MANUAL')
  const [editMowerCollectorLRaw, setEditMowerCollectorLRaw] = useState('')
  const [editMowerCutHeightRange, setEditMowerCutHeightRange] = useState('')
  const [editMowerSurfaceM2Raw, setEditMowerSurfaceM2Raw] = useState('')

  const quantity = useMemo(() => Number(quantityRaw), [quantityRaw])
  const compatTrimmed = useMemo(() => compatQ.trim(), [compatQ])
  const brandName = useMemo(() => {
    if (!product || !brands) return null
    return brands.find((b) => b.id === product.brandId)?.name ?? null
  }, [brands, product])
  const categoryName = useMemo(() => {
    if (!product || !categories) return null
    return categories.find((c) => c.id === product.categoryId)?.name ?? null
  }, [categories, product])
  const primaryImageUrl = useMemo(() => (product?.imageUrls?.[0] ? product.imageUrls[0] : null), [product])
  const compatEnabled = useMemo(() => {
    if (!product) return false
    return product.kind !== 'MACHINE' || machineSubtype === 'CHAINSAW'
  }, [product, machineSubtype])
  const kardexTrimmed = useMemo(() => kardexQ.trim().toLowerCase(), [kardexQ])
  const visibleMovements = useMemo(() => {
    if (!movements) return null
    const sorted = [...movements].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const base = kardexOrder === 'ASC' ? sorted : sorted.slice().reverse()
    return base.filter((m) => {
      if (kardexType !== 'ALL' && m.type !== kardexType) return false
      if (!kardexTrimmed) return true
      const doc = (m.referenceDoc ?? '').toLowerCase()
      const user = (m.actorUser?.email ?? '').toLowerCase()
      return doc.includes(kardexTrimmed) || user.includes(kardexTrimmed)
    })
  }, [movements, kardexOrder, kardexType, kardexTrimmed])
  const kardexSummary = useMemo(() => {
    const list = visibleMovements ?? []
    let inQty = 0
    let outQty = 0
    let net = 0
    for (const m of list) {
      const delta = m.stockAfter - m.stockBefore
      net += delta
      if (delta > 0) inQty += delta
      if (delta < 0) outQty += -delta
    }
    return { count: list.length, inQty, outQty, net }
  }, [visibleMovements])

  useEffect(() => {
    if (!movementOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMovementOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [movementOpen])

  function openEdit() {
    setEditOpen(true)
    window.setTimeout(() => {
      document.getElementById('edit-product')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([listBrands(), listCategories()])
      .then(([b, c]) => {
        if (cancelled) return
        setBrands(b)
        setCategories(c)
      })
      .catch(() => {
        if (cancelled) return
        setBrands([])
        setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function refresh() {
    setLoadError(null)
    setProduct(null)
    setMovements(null)
    setCompat(null)
    try {
      const p = await getProduct(props.id)
      const parsed = parseTechnicalSpecs(p.technicalSpecs)
      const compatEnabled = p.kind !== 'MACHINE' || parsed.machineSubtype === null || parsed.machineSubtype === 'CHAINSAW'

      const hasFrom = !!reportDateFrom.trim()
      const hasTo = !!reportDateTo.trim()
      const dateFrom = hasFrom && hasTo ? reportDateFrom.trim() : undefined
      const dateTo = hasFrom && hasTo ? reportDateTo.trim() : undefined

      const [m, c] = await Promise.all([
        listMovements({ productId: props.id, limit: 50, dateFrom, dateTo }),
        compatEnabled ? getCompatibilities(props.id) : Promise.resolve(null)
      ])
      setProduct(p)
      setMovements(m)
      setCompat(c)
    } catch (err) {
      setLoadError(err)
    }
  }

  async function refreshMovementsOnly() {
    setLoadError(null)
    try {
      const hasFrom = !!reportDateFrom.trim()
      const hasTo = !!reportDateTo.trim()
      const dateFrom = hasFrom && hasTo ? reportDateFrom.trim() : undefined
      const dateTo = hasFrom && hasTo ? reportDateTo.trim() : undefined
      const m = await listMovements({ productId: props.id, limit: 50, dateFrom, dateTo })
      setMovements(m)
    } catch (err) {
      setLoadError(err)
    }
  }

  async function onExportKardex(format: 'PDF' | 'XLSX') {
    if (reportBusy) return
    const hasFrom = !!reportDateFrom.trim()
    const hasTo = !!reportDateTo.trim()
    if ((hasFrom && !hasTo) || (!hasFrom && hasTo)) {
      setLoadError(new Error('Debes llenar Desde y Hasta para usar rango'))
      return
    }

    setReportBusy(true)
    try {
      const res = await exportMovements({
        format,
        productId: props.id,
        dateFrom: hasFrom ? reportDateFrom.trim() : undefined,
        dateTo: hasTo ? reportDateTo.trim() : undefined
      })
      downloadBlob({ blob: res.blob, filename: res.filename ?? `movimientos-producto-${props.id}.${format === 'PDF' ? 'pdf' : 'xlsx'}` })
    } catch (err) {
      setLoadError(err)
    } finally {
      setReportBusy(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [props.id])

  useEffect(() => {
    if (!movements) return
    const hasFrom = !!reportDateFrom.trim()
    const hasTo = !!reportDateTo.trim()
    if ((hasFrom && !hasTo) || (!hasFrom && hasTo)) return
    refreshMovementsOnly()
  }, [reportDateFrom, reportDateTo])

  useEffect(() => {
    if (!product) return

    setEditName(product.name)
    setEditDescription(product.description ?? '')
    setEditKind(product.kind)
    setEditStockMinRaw(String(product.stockMin))
    setEditPriceCost(product.priceCost)
    setEditPriceSell(product.priceSell)
    setEditImageUrlsRaw(product.imageUrls.join('\n'))

    const parsed = parseTechnicalSpecs(product.technicalSpecs)
    const ms = product.kind === 'MACHINE' ? (parsed.machineSubtype ?? 'CHAINSAW') : parsed.machineSubtype
    setMachineSubtype(ms)
    if (ms === 'CHAINSAW') setEditMachineSubtype('CHAINSAW')
    else if (ms === 'GENERATOR') setEditMachineSubtype('GENERATOR')
    else if (ms === 'PRESSURE_WASHER') setEditMachineSubtype('PRESSURE_WASHER')
    else if (ms === 'WATER_PUMP') setEditMachineSubtype('WATER_PUMP')
    else if (ms === 'BRUSHCUTTER') setEditMachineSubtype('BRUSHCUTTER')
    else if (ms === 'CUT_OFF_SAW') setEditMachineSubtype('CUT_OFF_SAW')
    else if (ms === 'LAWN_MOWER') setEditMachineSubtype('LAWN_MOWER')
    else if (ms) setEditMachineSubtype('OTHER')
    setModelo(parsed.known.modelo ?? '')
    setCilindradaCcRaw(parsed.known.cilindrada_cc ? String(parsed.known.cilindrada_cc) : '')
    setPotenciaHpRaw(parsed.known.potencia_hp ? String(parsed.known.potencia_hp) : '')
    setPesoKgRaw(parsed.known.peso_kg ? String(parsed.known.peso_kg) : '')
    setEspadaRecomendadaPulg(parsed.known.espada_recomendada_pulg ?? '')
    setPasoCadena(parsed.known.paso_cadena ?? '')
    setCodigoOem(parsed.known.codigo_oem ?? '')
    setViscosidad(parsed.known.viscosidad ?? '')
    setCapacidadMlRaw(parsed.known.capacidad_ml ? String(parsed.known.capacidad_ml) : '')
    setObservaciones(parsed.known.observaciones ?? '')
    setAttributes(parsed.attributes)

    const raw = product.technicalSpecs
    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
    const read = (k: string): string => {
      const v = obj[k]
      if (v === null || v === undefined) return ''
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      return ''
    }

    const swordLen = read('longitud_espada_pulg')
    if (swordLen) setEspadaRecomendadaPulg(swordLen)

    setEditGenPowerNominalRaw(read('potencia_nominal_kw') || read('generator_power_nominal_kw'))
    setEditGenPowerMaxRaw(read('potencia_max_kw') || read('generator_power_max_kw'))
    setEditGenVoltageRaw(read('voltaje_v') || read('generator_voltage_v'))
    setEditGenTankLitersRaw(read('capacidad_tanque_l') || read('generator_tank_l'))
    setEditGenStartType(((read('sistema_arranque') || read('generator_start_type')) as typeof editGenStartType) || 'MANUAL')
    setEditGenDisplacementCcRaw(read('cilindrada_cc') || read('generator_displacement_cc'))

    const pwMaxPsi = read('presion_max_psi') || read('pressure_washer_pressure_max_psi')
    const pwMaxBar = read('presion_max_bar') || read('pressure_washer_pressure_max_bar')
    const pwWorkPsi = read('presion_trabajo_psi') || read('pressure_washer_pressure_work_psi')
    const pwWorkBar = read('presion_trabajo_bar') || read('pressure_washer_pressure_work_bar')
    if (pwMaxBar || pwWorkBar) setEditPwPressureUnit('BAR')
    else setEditPwPressureUnit('PSI')
    setEditPwPressureMaxRaw(pwMaxBar || pwMaxPsi)
    setEditPwPressureWorkRaw(pwWorkBar || pwWorkPsi)

    const pwFlowLMin = read('caudal_lmin') || read('pressure_washer_flow_l_min')
    const pwFlowLH = read('caudal_lh') || read('pressure_washer_flow_l_h')
    if (pwFlowLH) setEditPwFlowUnit('L_H')
    else setEditPwFlowUnit('L_MIN')
    setEditPwFlowRateRaw(pwFlowLH || pwFlowLMin)
    setEditPwDriveType(((read('tipo_motor') || read('pressure_washer_drive_type')) as typeof editPwDriveType) || 'ELECTRIC')
    setEditPwHoseLengthMRaw(read('longitud_manguera_m') || read('pressure_washer_hose_m'))
    setEditPwMaxInletTempCRaw(read('temperatura_entrada_max_c') || read('pressure_washer_inlet_temp_max_c'))

    const pumpFlowM3H = read('caudal_max_m3_h') || read('pump_flow_max_m3_h')
    const pumpFlowLMin = read('caudal_max_lmin') || read('pump_flow_max_l_min')
    if (pumpFlowLMin) setEditPumpFlowUnit('L_MIN')
    else setEditPumpFlowUnit('M3_H')
    setEditPumpFlowMaxRaw(pumpFlowLMin || pumpFlowM3H)
    setEditPumpHeadMaxMRaw(read('altura_max_m') || read('pump_head_max_m'))
    setEditPumpInletDiameterIn(read('diametro_succion_pulg') || read('pump_inlet_in'))
    setEditPumpOutletDiameterIn(read('diametro_descarga_pulg') || read('pump_outlet_in'))
    setEditPumpPhases(((read('fases') || read('pump_phases')) as typeof editPumpPhases) || 'MONO')
    setEditPumpVoltageRaw(read('voltaje_v') || read('pump_voltage_v'))
    setEditPumpFluidType(((read('tipo_fluido') || read('pump_fluid_type')) as typeof editPumpFluidType) || 'CLEAN')
    setEditPumpSolidPassMmRaw(read('paso_solidos_mm') || read('pump_solid_pass_mm'))

    const bcPowerHp = read('brushcutter_power_hp')
    const bcPowerKw = read('brushcutter_power_kw')
    if (bcPowerKw) setEditBcPowerUnit('KW')
    else setEditBcPowerUnit('HP')
    setEditBcPowerRaw(bcPowerKw || bcPowerHp)
    setEditBcDisplacementCcRaw(read('brushcutter_displacement_cc'))
    setEditBcVoltageRaw(read('brushcutter_voltage_v'))
    setEditBcCutDiameterMmRaw(read('brushcutter_cut_diameter_mm'))
    setEditBcToolType((read('brushcutter_tool_type') as typeof editBcToolType) || 'NYLON')
    setEditBcWeightKgRaw(read('brushcutter_weight_kg'))

    const cutDiscIn = read('cutoff_disc_diameter_in')
    const cutDiscMm = read('cutoff_disc_diameter_mm')
    if (cutDiscMm) setEditCutDiscUnit('MM')
    else setEditCutDiscUnit('IN')
    setEditCutDiscDiameterRaw(cutDiscMm || cutDiscIn)
    setEditCutDepthMaxRaw(read('cutoff_cut_depth_max'))
    const cutPowerHp = read('cutoff_power_hp')
    const cutPowerKw = read('cutoff_power_kw')
    if (cutPowerKw) setEditCutPowerUnit('KW')
    else setEditCutPowerUnit('HP')
    setEditCutPowerRaw(cutPowerKw || cutPowerHp)
    setEditCutWaterTankLRaw(read('cutoff_water_tank_l'))
    setEditCutWeightKgRaw(read('cutoff_weight_kg'))

    const mowerWidthCm = read('mower_cut_width_cm')
    const mowerWidthIn = read('mower_cut_width_in')
    if (mowerWidthIn) setEditMowerCutWidthUnit('IN')
    else setEditMowerCutWidthUnit('CM')
    setEditMowerCutWidthRaw(mowerWidthIn || mowerWidthCm)
    setEditMowerTraction((read('mower_traction') as typeof editMowerTraction) || 'MANUAL')
    setEditMowerCollectorLRaw(read('mower_collector_l'))
    setEditMowerCutHeightRange(read('mower_cut_height_range'))
    setEditMowerSurfaceM2Raw(read('mower_surface_m2'))

    setEditError(null)
    setEditFieldError(null)
  }, [product?.id])

  useEffect(() => {
    setCompatItems(null)
    setCompatError(null)
    setCompatLoading(false)

    if (!product) return
    const compatEnabled = product.kind !== 'MACHINE' || machineSubtype === 'CHAINSAW'
    if (!compatEnabled) return
    if (compatTrimmed.length < 2) return

    let cancelled = false
    const t = window.setTimeout(() => {
      setCompatLoading(true)
      const kind = product.kind === 'MACHINE' ? compatKind : 'MACHINE'
      searchProducts(compatTrimmed, product.kind === 'MACHINE' ? { kind } : { kind, machineSubtype: 'CHAINSAW' })
        .then((data) => {
          if (cancelled) return
          setCompatItems(data)
        })
        .catch((err) => {
          if (cancelled) return
          setCompatItems([])
          setCompatError(err)
        })
        .finally(() => {
          if (cancelled) return
          setCompatLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [compatTrimmed, compatKind, product, machineSubtype])

  async function onAddCompatibility(item: ProductSearchItem) {
    if (!product) return
    setCompatSaving(true)
    setCompatError(null)
    try {
      if (product.kind === 'MACHINE') {
        await addCompatibility({ partId: item.id, machineId: product.id })
      } else {
        await addCompatibility({ partId: product.id, machineId: item.id })
      }
      setCompatQ('')
      setCompatItems(null)
      const c = await getCompatibilities(product.id)
      setCompat(c)
    } catch (err) {
      setCompatError(err)
    } finally {
      setCompatSaving(false)
    }
  }

  async function onRemoveCompatibility(item: ProductSearchItem) {
    if (!product) return
    setCompatSaving(true)
    setCompatError(null)
    try {
      if (product.kind === 'MACHINE') {
        await removeCompatibility({ partId: item.id, machineId: product.id })
      } else {
        await removeCompatibility({ partId: product.id, machineId: item.id })
      }
      const c = await getCompatibilities(product.id)
      setCompat(c)
    } catch (err) {
      setCompatError(err)
    } finally {
      setCompatSaving(false)
    }
  }

  function addAttribute() {
    setAttributes((prev) => [...prev, { key: '', value: '' }])
  }

  function updateAttribute(index: number, input: { key?: string; value?: string }) {
    setAttributes((prev) => prev.map((a, i) => (i === index ? { key: input.key ?? a.key, value: input.value ?? a.value } : a)))
  }

  function removeAttribute(index: number) {
    setAttributes((prev) => prev.filter((_, i) => i !== index))
  }

  async function uploadEditImages(files: FileList | null) {
    if (!files || files.length === 0) return
    setEditError(null)
    setEditFieldError(null)

    setEditUploading(true)
    try {
      const sign = await cloudinarySign()
      const uploaded: string[] = []

      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        form.append('api_key', sign.apiKey)
        form.append('timestamp', String(sign.timestamp))
        form.append('folder', sign.folder)
        form.append('signature', sign.signature)

        const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`, { method: 'POST', body: form })
        const data = (await res.json()) as unknown
        const url = z.object({ secure_url: z.string().url() }).safeParse(data)
        if (!res.ok || !url.success) throw new Error('Fallo al subir imagen')
        uploaded.push(url.data.secure_url)
      }

      const merged = uploaded.slice(0, 1)
      setEditImageUrlsRaw(merged.join('\n'))
    } catch (err) {
      setEditError(err)
    } finally {
      setEditUploading(false)
    }
  }

  async function onSaveProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!product) return
    setEditError(null)
    setEditFieldError(null)

    const stockMin = Number(editStockMinRaw)
    if (!Number.isInteger(stockMin) || stockMin < 0) {
      setEditFieldError('stockMin inválido')
      return
    }

    const imageUrls = editImageUrlsRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 1)

    const specs: Record<string, unknown> = {}
    if (modelo.trim()) specs.modelo = modelo.trim()
    if (editKind === 'MACHINE' && (editMachineSubtype === 'CHAINSAW' || editMachineSubtype === 'BRUSHCUTTER') && cilindradaCcRaw.trim()) {
      const n = Number(cilindradaCcRaw)
      if (!Number.isFinite(n) || n <= 0) {
        setEditFieldError('cilindrada_cc inválida')
        return
      }
      specs.cilindrada_cc = n
    }
    if (editKind === 'MACHINE' && editMachineSubtype === 'GENERATOR' && editGenDisplacementCcRaw.trim()) {
      const n = Number(editGenDisplacementCcRaw)
      if (!Number.isFinite(n) || n <= 0) {
        setEditFieldError('cilindrada_cc inválida')
        return
      }
      specs.cilindrada_cc = n
    }
    if (editKind === 'MACHINE' && ['CHAINSAW', 'BRUSHCUTTER', 'WATER_PUMP', 'PRESSURE_WASHER'].includes(editMachineSubtype) && potenciaHpRaw.trim()) {
      const n = Number(potenciaHpRaw)
      if (!Number.isFinite(n) || n <= 0) {
        setEditFieldError('potencia_hp inválida')
        return
      }
      specs.potencia_hp = n
    }
    if (editKind === 'MACHINE' && ['CHAINSAW', 'BRUSHCUTTER', 'PRESSURE_WASHER'].includes(editMachineSubtype) && pesoKgRaw.trim()) {
      const n = Number(pesoKgRaw)
      if (!Number.isFinite(n) || n <= 0) {
        setEditFieldError('peso_kg inválida')
        return
      }
      specs.peso_kg = n
    }
    if (editKind === 'MACHINE' && editMachineSubtype === 'CHAINSAW' && pasoCadena.trim()) specs.paso_cadena = pasoCadena.trim()
    if (codigoOem.trim()) specs.codigo_oem = codigoOem.trim()
    if (viscosidad.trim()) specs.viscosidad = viscosidad.trim()
    if (capacidadMlRaw.trim()) {
      const n = Number(capacidadMlRaw)
      if (!Number.isInteger(n) || n <= 0) {
        setEditFieldError('capacidad_ml inválida')
        return
      }
      specs.capacidad_ml = n
    }
    if (observaciones.trim()) specs.observaciones = observaciones.trim()

    const dynamicAttributes: Array<{ key: string; value: string }> = []
    if (editKind === 'MACHINE') {
      dynamicAttributes.push({ key: 'machine_subtype', value: editMachineSubtype })

      if (editMachineSubtype === 'GENERATOR') {
        if (editGenPowerNominalRaw.trim()) dynamicAttributes.push({ key: 'potencia_nominal_kw', value: editGenPowerNominalRaw.trim() })
        if (editGenPowerMaxRaw.trim()) dynamicAttributes.push({ key: 'potencia_max_kw', value: editGenPowerMaxRaw.trim() })
        if (editGenVoltageRaw.trim()) dynamicAttributes.push({ key: 'voltaje_v', value: editGenVoltageRaw.trim() })
        if (editGenTankLitersRaw.trim()) dynamicAttributes.push({ key: 'capacidad_tanque_l', value: editGenTankLitersRaw.trim() })
        if (editGenStartType) dynamicAttributes.push({ key: 'sistema_arranque', value: editGenStartType })
      }

      if (editMachineSubtype === 'PRESSURE_WASHER') {
        if (editPwPressureMaxRaw.trim()) dynamicAttributes.push({ key: `presion_max_${editPwPressureUnit.toLowerCase()}`, value: editPwPressureMaxRaw.trim() })
        if (editPwPressureWorkRaw.trim()) dynamicAttributes.push({ key: `presion_trabajo_${editPwPressureUnit.toLowerCase()}`, value: editPwPressureWorkRaw.trim() })
        if (editPwFlowRateRaw.trim()) dynamicAttributes.push({ key: `caudal_${editPwFlowUnit === 'L_MIN' ? 'lmin' : 'lh'}`, value: editPwFlowRateRaw.trim() })
        if (editPwDriveType) dynamicAttributes.push({ key: 'tipo_motor', value: editPwDriveType })
        if (editPwHoseLengthMRaw.trim()) dynamicAttributes.push({ key: 'longitud_manguera_m', value: editPwHoseLengthMRaw.trim() })
        if (editPwMaxInletTempCRaw.trim()) dynamicAttributes.push({ key: 'temperatura_entrada_max_c', value: editPwMaxInletTempCRaw.trim() })
      }

      if (editMachineSubtype === 'WATER_PUMP') {
        if (editPumpInletDiameterIn.trim()) dynamicAttributes.push({ key: 'diametro_succion_pulg', value: editPumpInletDiameterIn.trim() })
        if (editPumpOutletDiameterIn.trim()) dynamicAttributes.push({ key: 'diametro_descarga_pulg', value: editPumpOutletDiameterIn.trim() })
        if (editPumpFlowMaxRaw.trim()) dynamicAttributes.push({ key: 'caudal_max_lmin', value: editPumpFlowMaxRaw.trim() })
        if (editPumpHeadMaxMRaw.trim()) dynamicAttributes.push({ key: 'altura_max_m', value: editPumpHeadMaxMRaw.trim() })
        if (editPumpPhases) dynamicAttributes.push({ key: 'fases', value: editPumpPhases })
        if (editPumpVoltageRaw.trim()) dynamicAttributes.push({ key: 'voltaje_v', value: editPumpVoltageRaw.trim() })
        if (editPumpFluidType) dynamicAttributes.push({ key: 'tipo_fluido', value: editPumpFluidType })
        if (editPumpSolidPassMmRaw.trim()) dynamicAttributes.push({ key: 'paso_solidos_mm', value: editPumpSolidPassMmRaw.trim() })
      }

      if (editMachineSubtype === 'BRUSHCUTTER') {
        if (editBcDisplacementCcRaw.trim()) dynamicAttributes.push({ key: 'brushcutter_displacement_cc', value: editBcDisplacementCcRaw.trim() })
        if (editBcVoltageRaw.trim()) dynamicAttributes.push({ key: 'brushcutter_voltage_v', value: editBcVoltageRaw.trim() })
        if (editBcPowerRaw.trim()) dynamicAttributes.push({ key: `brushcutter_power_${editBcPowerUnit.toLowerCase()}`, value: editBcPowerRaw.trim() })
        if (editBcCutDiameterMmRaw.trim()) dynamicAttributes.push({ key: 'brushcutter_cut_diameter_mm', value: editBcCutDiameterMmRaw.trim() })
        if (editBcToolType) dynamicAttributes.push({ key: 'brushcutter_tool_type', value: editBcToolType })
        if (editBcWeightKgRaw.trim()) dynamicAttributes.push({ key: 'brushcutter_weight_kg', value: editBcWeightKgRaw.trim() })
      }

      if (editMachineSubtype === 'CUT_OFF_SAW') {
        if (editCutDiscDiameterRaw.trim()) dynamicAttributes.push({ key: `cutoff_disc_diameter_${editCutDiscUnit.toLowerCase()}`, value: editCutDiscDiameterRaw.trim() })
        if (editCutDepthMaxRaw.trim()) dynamicAttributes.push({ key: 'cutoff_cut_depth_max', value: editCutDepthMaxRaw.trim() })
        if (editCutPowerRaw.trim()) dynamicAttributes.push({ key: `cutoff_power_${editCutPowerUnit.toLowerCase()}`, value: editCutPowerRaw.trim() })
        if (editCutWaterTankLRaw.trim()) dynamicAttributes.push({ key: 'cutoff_water_tank_l', value: editCutWaterTankLRaw.trim() })
        if (editCutWeightKgRaw.trim()) dynamicAttributes.push({ key: 'cutoff_weight_kg', value: editCutWeightKgRaw.trim() })
      }

      if (editMachineSubtype === 'LAWN_MOWER') {
        if (editMowerCutWidthRaw.trim())
          dynamicAttributes.push({ key: `mower_cut_width_${editMowerCutWidthUnit.toLowerCase()}`, value: editMowerCutWidthRaw.trim() })
        if (editMowerTraction) dynamicAttributes.push({ key: 'mower_traction', value: editMowerTraction })
        if (editMowerCollectorLRaw.trim()) dynamicAttributes.push({ key: 'mower_collector_l', value: editMowerCollectorLRaw.trim() })
        if (editMowerCutHeightRange.trim()) dynamicAttributes.push({ key: 'mower_cut_height_range', value: editMowerCutHeightRange.trim() })
        if (editMowerSurfaceM2Raw.trim()) dynamicAttributes.push({ key: 'mower_surface_m2', value: editMowerSurfaceM2Raw.trim() })
      }

      if (editMachineSubtype === 'CHAINSAW' && espadaRecomendadaPulg.trim()) {
        dynamicAttributes.push({ key: 'longitud_espada_pulg', value: espadaRecomendadaPulg.trim() })
      }
    }

    const cleanAttributes = [...attributes, ...dynamicAttributes]
      .map((a) => ({ key: a.key.trim(), value: a.value.trim() }))
      .filter((a) => a.key && a.value)

    const parsed = patchProductSchema.safeParse({
      name: editName,
      description: editDescription.trim() ? editDescription.trim() : null,
      kind: editKind,
      stockMin,
      priceCost: editPriceCost,
      priceSell: editPriceSell,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      specs: Object.keys(specs).length ? specs : undefined,
      attributes: cleanAttributes.length ? cleanAttributes : undefined
    })

    if (!parsed.success) {
      setEditFieldError(parsed.error.issues[0]?.message ?? 'Producto inválido')
      return
    }

    setEditSaving(true)
    try {
      const updated = await patchProduct(product.id, parsed.data)
      setProduct(updated)
      setEditOpen(false)
    } catch (err) {
      setEditError(err)
    } finally {
      setEditSaving(false)
    }
  }

  async function onCreateMovement(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFieldError(null)

    const parsed = createMovementSchema.safeParse({
      type,
      quantity,
      referenceDoc: referenceDoc.trim() ? referenceDoc.trim() : null
    })

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Movimiento inválido')
      return
    }

    setSaving(true)
    try {
      await createMovement({ productId: props.id, ...parsed.data })
      setQuantityRaw('1')
      setReferenceDoc('')
      await refresh()
      setMovementOpen(false)
    } catch (err) {
      setFormError(err)
    } finally {
      setSaving(false)
    }
  }

  function kindLabel(kind: Product['kind']) {
    if (kind === 'MACHINE') return 'Maquinaria'
    if (kind === 'PART') return 'Repuesto'
    if (kind === 'CONSUMABLE') return 'Consumible'
    return 'Accesorio'
  }

  function machineSubtypeLabel(v: string | null) {
    if (!v) return null
    if (v === 'CHAINSAW') return 'Motosierra'
    if (v === 'GENERATOR') return 'Generador'
    if (v === 'PRESSURE_WASHER') return 'Hidrolavadora'
    if (v === 'WATER_PUMP') return 'Bomba de agua'
    if (v === 'BRUSHCUTTER') return 'Desbrozadora/Bordeadora'
    if (v === 'CUT_OFF_SAW') return 'Cortadora de disco'
    if (v === 'LAWN_MOWER') return 'Cortacésped'
    return 'Otra maquinaria'
  }

  function movementLabel(t: MovementType) {
    if (t === 'PURCHASE') return 'Compra'
    if (t === 'SALE') return 'Venta'
    if (t === 'WORKSHOP') return 'Taller'
    return 'Ajuste'
  }

  function productSpecItems(): Array<{ label: string; value: string }> {
    if (!product) return []
    const raw = product.technicalSpecs
    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
    const read = (k: string) => {
      const v = obj[k]
      if (v === null || v === undefined) return null
      if (typeof v === 'string') return v.trim() ? v.trim() : null
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      return null
    }

    const out: Array<{ label: string; value: string }> = []

    const modeloV = read('modelo')
    if (modeloV) out.push({ label: 'Modelo', value: modeloV })
    const oemV = read('codigo_oem')
    if (oemV) out.push({ label: 'Código OEM', value: oemV })

    if (product.kind === 'CONSUMABLE') {
      const vis = read('viscosidad')
      if (vis) out.push({ label: 'Viscosidad', value: vis })
      const cap = read('capacidad_ml')
      if (cap) out.push({ label: 'Capacidad', value: `${cap} ml` })
    }

    if (product.kind === 'MACHINE') {
      if (machineSubtype === 'CHAINSAW') {
        const cc = read('cilindrada_cc')
        if (cc) out.push({ label: 'Cilindrada', value: `${cc} cc` })
        const hp = read('potencia_hp')
        if (hp) out.push({ label: 'Potencia', value: `${hp} HP` })
        const peso = read('peso_kg')
        if (peso) out.push({ label: 'Peso', value: `${peso} kg` })
        const espada = read('longitud_espada_pulg') || read('espada_recomendada_pulg')
        if (espada) out.push({ label: 'Espada', value: `${espada}"` })
        const paso = read('paso_cadena')
        if (paso) out.push({ label: 'Paso de cadena', value: paso })
      }

      if (machineSubtype === 'GENERATOR') {
        const pNom = read('potencia_nominal_kw') || read('generator_power_nominal_kw')
        if (pNom) out.push({ label: 'Potencia nominal', value: `${pNom} kW` })
        const pMax = read('potencia_max_kw') || read('generator_power_max_kw')
        if (pMax) out.push({ label: 'Potencia máxima', value: `${pMax} kW` })
        const volt = read('voltaje_v') || read('generator_voltage_v')
        if (volt) out.push({ label: 'Voltaje', value: `${volt} V` })
        const tank = read('capacidad_tanque_l') || read('generator_tank_l')
        if (tank) out.push({ label: 'Tanque', value: `${tank} L` })
        const start = read('sistema_arranque') || read('generator_start_type')
        if (start) out.push({ label: 'Arranque', value: start })
        const disp = read('cilindrada_cc') || read('generator_displacement_cc')
        if (disp) out.push({ label: 'Cilindrada', value: `${disp} cc` })
      }

      if (machineSubtype === 'PRESSURE_WASHER') {
        const pMaxBar = read('presion_max_bar') || read('pressure_washer_pressure_max_bar')
        const pMaxPsi = read('presion_max_psi') || read('pressure_washer_pressure_max_psi')
        if (pMaxBar || pMaxPsi) out.push({ label: 'Presión máxima', value: `${pMaxBar ?? pMaxPsi} ${pMaxBar ? 'bar' : 'PSI'}` })
        const pWorkBar = read('presion_trabajo_bar') || read('pressure_washer_pressure_work_bar')
        const pWorkPsi = read('presion_trabajo_psi') || read('pressure_washer_pressure_work_psi')
        if (pWorkBar || pWorkPsi) out.push({ label: 'Presión trabajo', value: `${pWorkBar ?? pWorkPsi} ${pWorkBar ? 'bar' : 'PSI'}` })
        const flowLH = read('caudal_lh') || read('pressure_washer_flow_l_h')
        const flowLMin = read('caudal_lmin') || read('pressure_washer_flow_l_min')
        if (flowLH || flowLMin) out.push({ label: 'Caudal', value: `${flowLH ?? flowLMin} ${flowLH ? 'L/h' : 'L/min'}` })
        const drive = read('tipo_motor') || read('pressure_washer_drive_type')
        if (drive) out.push({ label: 'Accionamiento', value: drive })
        const hose = read('longitud_manguera_m') || read('pressure_washer_hose_m')
        if (hose) out.push({ label: 'Manguera', value: `${hose} m` })
        const temp = read('temperatura_entrada_max_c') || read('pressure_washer_inlet_temp_max_c')
        if (temp) out.push({ label: 'Temp entrada máx', value: `${temp} °C` })
      }

      if (machineSubtype === 'WATER_PUMP') {
        const hp = read('potencia_hp')
        if (hp) out.push({ label: 'Potencia', value: `${hp} HP` })
        const qLMin = read('caudal_max_lmin') || read('pump_flow_max_l_min')
        const qM3H = read('caudal_max_m3_h') || read('pump_flow_max_m3_h')
        if (qLMin || qM3H) out.push({ label: 'Caudal máx', value: `${qLMin ?? qM3H} ${qLMin ? 'L/min' : 'm³/h'}` })
        const head = read('altura_max_m') || read('pump_head_max_m')
        if (head) out.push({ label: 'Altura máx', value: `${head} m` })
        const inD = read('diametro_succion_pulg') || read('pump_inlet_in')
        if (inD) out.push({ label: 'Succión', value: `${inD}"` })
        const outD = read('diametro_descarga_pulg') || read('pump_outlet_in')
        if (outD) out.push({ label: 'Descarga', value: `${outD}"` })
        const phases = read('fases') || read('pump_phases')
        if (phases) out.push({ label: 'Fases', value: phases })
        const v = read('voltaje_v') || read('pump_voltage_v')
        if (v) out.push({ label: 'Voltaje', value: `${v} V` })
        const fluid = read('tipo_fluido') || read('pump_fluid_type')
        if (fluid) out.push({ label: 'Fluido', value: fluid })
        const solids = read('paso_solidos_mm') || read('pump_solid_pass_mm')
        if (solids) out.push({ label: 'Paso de sólidos', value: `${solids} mm` })
      }
    }

    const obs = read('observaciones')
    if (obs) out.push({ label: 'Observaciones', value: obs })

    return out
  }

  const specItems = productSpecItems()

  return (
    <div className="page">
      <div className="page-header">
        <h1>Producto</h1>
        <div className="page-actions">
          <button type="button" className="secondary" onClick={() => navigate({ name: 'products' })}>
            Volver
          </button>
        </div>
      </div>

      {loadError ? <ErrorBox error={loadError} /> : null}

      {product ? (
        <div className="card product-hero">
          <div className="product-hero-media">
            {primaryImageUrl ? (
              <a href={primaryImageUrl} target="_blank" rel="noreferrer" className="product-hero-link">
                <img src={primaryImageUrl} alt="" className="product-hero-img" />
              </a>
            ) : (
              <div className="product-hero-placeholder">Sin imagen</div>
            )}
          </div>

          <div className="product-hero-info">
            <div className="product-hero-title-row">
              <div>
                <div className="product-hero-title">{product.name}</div>
                <div className="muted mono">
                  {kindLabel(product.kind)}
                  {product.kind === 'MACHINE' && machineSubtypeLabel(machineSubtype) ? ` · ${machineSubtypeLabel(machineSubtype)}` : ''}
                </div>
              </div>
              <button type="button" className="secondary" onClick={openEdit}>
                Editar
              </button>
            </div>

            <div className="stat-grid">
              <div className="stat">
                <div className="stat-k">SKU</div>
                <div className="stat-v mono">{product.skuInternal}</div>
              </div>
              <div className="stat">
                <div className="stat-k">Marca</div>
                <div className="stat-v">{brandName ?? `#${product.brandId}`}</div>
              </div>
              <div className="stat">
                <div className="stat-k">Categoría</div>
                <div className="stat-v">{categoryName ?? `#${product.categoryId}`}</div>
              </div>
              <div className={product.currentStock <= product.stockMin ? 'stat bad' : 'stat good'}>
                <div className="stat-k">Stock</div>
                <div className="stat-v mono">{product.currentStock}</div>
                <div className="stat-sub">{product.currentStock <= product.stockMin ? 'Stock bajo' : 'Stock bueno'}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {product ? (
        <div className="product-detail-layout">
          <div className="product-detail-main">
            <div className="card">
              <details className="details" open>
                <summary>
                  <div className="details-title">Detalles del producto</div>
                  <div className="muted mono">
                    Actualizado: {new Date(product.updatedAt).toLocaleString()}
                  </div>
                </summary>

                <div className="details-body">
                  <div className="grid2">
                    <div>
                      <div className="product-desc-title">Descripción</div>
                      {product.description ? <div className="product-desc-body">{product.description}</div> : <div className="muted">Sin descripción.</div>}
                    </div>
                    <div>
                      <div className="product-desc-title">Datos técnicos</div>
                      {specItems.length ? (
                        <div className="spec-grid">
                          {specItems.map((it) => (
                            <div className="spec-row" key={it.label}>
                              <div className="spec-k">{it.label}</div>
                              <div className="spec-v">{it.value}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="muted">Sin datos técnicos registrados.</div>
                      )}
                    </div>
                  </div>

                  {attributes.length ? (
                    <div style={{ marginTop: 12 }}>
                      <div className="product-desc-title">Otros atributos</div>
                      <div className="spec-grid">
                        {attributes.map((a) => (
                          <div className="spec-row" key={`${a.key}:${a.value}`}>
                            <div className="spec-k">{a.key}</div>
                            <div className="spec-v">{a.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            </div>
          </div>

          <div className="product-detail-side">
            <div className="card">
              <div className="card-title">Acciones</div>
              <div className="actions">
                <button type="button" onClick={() => setMovementOpen(true)} disabled={saving || !product}>
                  Registrar movimiento
                </button>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                El movimiento se registra en una ventana emergente para mantener el detalle más limpio.
              </div>
            </div>

            {compatEnabled ? (
              <div className="card">
                <div className="card-title">{product.kind === 'MACHINE' ? 'Repuestos compatibles' : 'Motosierras compatibles'}</div>
                {compatError ? <ErrorBox error={compatError} /> : null}
                {!compat ? <div className="muted">Cargando…</div> : null}
                {compat ? (
                  <>
                    {product.kind === 'MACHINE' ? (
                      <div className="compat-list">
                        {compat.parts.map((p) => (
                          <div className="compat-row" key={p.id}>
                            <button type="button" className="compat-link" onClick={() => navigate({ name: 'product', id: p.id })}>
                              {p.name}
                            </button>
                            {editOpen ? (
                              <button type="button" className="small secondary" disabled={compatSaving} onClick={() => onRemoveCompatibility(p)}>
                                Quitar
                              </button>
                            ) : null}
                          </div>
                        ))}
                        {!compat.parts.length ? <div className="muted">Sin repuestos asociados</div> : null}
                      </div>
                    ) : (
                      <div className="compat-list">
                        {compat.machines.map((m) => (
                          <div className="compat-row" key={m.id}>
                            <button type="button" className="compat-link" onClick={() => navigate({ name: 'product', id: m.id })}>
                              {m.name}
                            </button>
                            {editOpen ? (
                              <button type="button" className="small secondary" disabled={compatSaving} onClick={() => onRemoveCompatibility(m)}>
                                Quitar
                              </button>
                            ) : null}
                          </div>
                        ))}
                        {!compat.machines.length ? <div className="muted">Sin motosierras asociadas</div> : null}
                      </div>
                    )}

                    {editOpen ? (
                      <div className="card" style={{ padding: 12, marginTop: 12 }}>
                        <div className="card-title">Agregar compatibilidad</div>
                        <div className="row row-wrap">
                          <input
                            value={compatQ}
                            onChange={(e) => setCompatQ(e.target.value)}
                            placeholder={product.kind === 'MACHINE' ? 'Buscar repuesto/consumible…' : 'Buscar motosierra…'}
                          />
                          {product.kind === 'MACHINE' ? (
                            <select value={compatKind} onChange={(e) => setCompatKind(e.target.value as typeof compatKind)}>
                              <option value="PART">Repuesto</option>
                              <option value="CONSUMABLE">Consumible</option>
                              <option value="ACCESSORY">Accesorio</option>
                            </select>
                          ) : null}
                        </div>
                        {compatLoading ? <div className="muted">Buscando…</div> : null}
                        {compatItems ? (
                          <div className="search-list" style={{ marginTop: 8 }}>
                            {compatItems.map((it) => (
                              <button key={it.id} type="button" className="search-item" disabled={compatSaving} onClick={() => onAddCompatibility(it)}>
                                <div className="search-item-title">{it.name}</div>
                                <div className="search-item-meta mono">
                                  {it.skuInternal} · {kindLabel(it.kind)}
                                </div>
                              </button>
                            ))}
                            {!compatItems.length ? <div className="muted">Sin resultados</div> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="muted" style={{ marginTop: 10 }}>
                        Para agregar o quitar compatibilidades, entra en “Editar”.
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">Kardex (últimos 50)</div>
        {!movements ? <div className="muted">Cargando…</div> : null}
        {movements ? (
          <>
            <div className="grid3">
              <label className="field">
                <div className="label">Tipo</div>
                <select value={kardexType} onChange={(e) => setKardexType(e.target.value as 'ALL' | MovementType)}>
                  <option value="ALL">Todos</option>
                  <option value="PURCHASE">Compra (entrada)</option>
                  <option value="SALE">Venta (salida)</option>
                  <option value="ADJUSTMENT">Ajuste</option>
                </select>
              </label>
              <label className="field">
                <div className="label">Orden</div>
                <select value={kardexOrder} onChange={(e) => setKardexOrder(e.target.value as 'DESC' | 'ASC')}>
                  <option value="DESC">Más recientes primero</option>
                  <option value="ASC">Más antiguos primero</option>
                </select>
              </label>
              <label className="field">
                <div className="label">Buscar</div>
                <input value={kardexQ} onChange={(e) => setKardexQ(e.target.value)} placeholder="Documento o usuario" />
              </label>
            </div>

            <div className="grid3" style={{ marginTop: 10 }}>
              <label className="field">
                <div className="label">Desde (reporte)</div>
                <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)} />
              </label>
              <label className="field">
                <div className="label">Hasta (reporte)</div>
                <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)} />
              </label>
              <div className="field">
                <div className="label">Descargar</div>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="download-btn pdf"
                    disabled={reportBusy}
                    onClick={() => void onExportKardex('PDF')}
                    title="Descargar reporte del producto en PDF"
                  >
                    <Icon name="i-file-pdf" />
                    PDF
                    <Icon name="i-download" />
                  </button>
                  <button
                    type="button"
                    className="download-btn xlsx"
                    disabled={reportBusy}
                    onClick={() => void onExportKardex('XLSX')}
                    title="Descargar reporte del producto en Excel"
                  >
                    <Icon name="i-file-xls" />
                    Excel
                    <Icon name="i-download" />
                  </button>
                </div>
              </div>
            </div>

            <div className="chips">
              <div className="chip">
                <span className="muted">Movimientos</span>
                <span className="mono">{kardexSummary.count}</span>
              </div>
              <div className="chip">
                <span className="muted">Entradas</span>
                <span className="mono" style={{ color: 'var(--primary)' }}>
                  +{kardexSummary.inQty}
                </span>
              </div>
              <div className="chip">
                <span className="muted">Salidas</span>
                <span className="mono" style={{ color: 'var(--danger)' }}>
                  -{kardexSummary.outQty}
                </span>
              </div>
              <div className="chip">
                <span className="muted">Neto</span>
                <span
                  className="mono"
                  style={{
                    color: kardexSummary.net > 0 ? 'var(--primary)' : kardexSummary.net < 0 ? 'var(--danger)' : 'var(--muted)'
                  }}
                >
                  {kardexSummary.net > 0 ? `+${kardexSummary.net}` : String(kardexSummary.net)}
                </span>
              </div>
            </div>

            {isMobile ? (
              <div className="kv">
                {(visibleMovements ?? []).map((m) => {
                  const delta = m.stockAfter - m.stockBefore
                  return (
                    <div key={m.id} className="card" style={{ padding: 12, background: 'var(--surface-2)' }}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <div className="mono">{new Date(m.createdAt).toLocaleString()}</div>
                        <div className="mono">{movementLabel(m.type)}</div>
                      </div>
                      <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                        <div className="muted">Mov</div>
                        <div
                          className="mono"
                          style={{ color: delta > 0 ? 'var(--primary)' : delta < 0 ? 'var(--danger)' : 'var(--muted)' }}
                          title={`Cantidad registrada: ${m.quantity}`}
                        >
                          {delta > 0 ? `+${delta}` : String(delta)}
                        </div>
                      </div>
                      <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
                        <div className="muted">Antes → Después</div>
                        <div className="mono">
                          {m.stockBefore} → {m.stockAfter}
                        </div>
                      </div>
                      <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
                        <div className="muted">Documento</div>
                        <div className="mono">{m.referenceDoc ?? '—'}</div>
                      </div>
                      <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
                        <div className="muted">Usuario</div>
                        <div>{m.actorUser?.email ?? '—'}</div>
                      </div>
                    </div>
                  )
                })}
                {visibleMovements && !visibleMovements.length ? <div className="muted">Sin resultados</div> : null}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table table-wide">
                  <thead>
                    <tr>
                      <th style={{ width: 170 }}>Fecha/hora</th>
                      <th style={{ width: 120 }}>Tipo</th>
                      <th style={{ width: 90 }}>Mov</th>
                      <th style={{ width: 120 }}>Stock inicial</th>
                      <th style={{ width: 120 }}>Stock final</th>
                      <th style={{ width: 160 }}>Documento</th>
                      <th style={{ width: 220 }}>Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(visibleMovements ?? []).map((m) => {
                      const delta = m.stockAfter - m.stockBefore
                      return (
                        <tr key={m.id}>
                          <td className="mono">{new Date(m.createdAt).toLocaleString()}</td>
                          <td className="mono">{movementLabel(m.type)}</td>
                          <td
                            className="mono"
                            style={{ color: delta > 0 ? 'var(--primary)' : delta < 0 ? 'var(--danger)' : 'var(--muted)' }}
                            title={`Cantidad registrada: ${m.quantity}`}
                          >
                            {delta > 0 ? `+${delta}` : String(delta)}
                          </td>
                          <td className="mono">{m.stockBefore}</td>
                          <td className="mono">{m.stockAfter}</td>
                          <td className="mono">{m.referenceDoc ?? '—'}</td>
                          <td>{m.actorUser?.email ?? '—'}</td>
                        </tr>
                      )
                    })}
                    {visibleMovements && !visibleMovements.length ? (
                      <tr>
                        <td colSpan={7} className="muted">
                          Sin resultados
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>

      {product && editOpen ? (
        <div className="card" id="edit-product">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title" style={{ margin: 0 }}>
              Editar producto
            </div>
            <button type="button" className="secondary" onClick={() => setEditOpen(false)} disabled={editSaving || editUploading}>
              Cerrar
            </button>
          </div>

          {editError ? <ErrorBox error={editError} /> : null}

          <form className="form" onSubmit={onSaveProduct}>
              <div className="grid2">
                <label className="field">
                  <div className="label">Nombre</div>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">Tipo</div>
                  <select value={editKind} onChange={(e) => setEditKind(e.target.value as Product['kind'])}>
                    <option value="MACHINE">Maquinaria</option>
                    <option value="PART">Repuesto</option>
                    <option value="CONSUMABLE">Consumible</option>
                    <option value="ACCESSORY">Accesorio</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <div className="label">Descripción (opcional)</div>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
              </label>

              <div className="grid2">
                <label className="field">
                  <div className="label">Stock mínimo</div>
                  <input inputMode="numeric" value={editStockMinRaw} onChange={(e) => setEditStockMinRaw(e.target.value)} />
                </label>
              </div>

              <div className="card" style={{ padding: 12 }}>
                <div className="card-title">Imágenes (Cloudinary)</div>
                <div className="grid2">
                  <label className="field">
                    <div className="label">Subir archivos</div>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={editUploading || editSaving}
                      onChange={(e) => {
                        void uploadEditImages(e.target.files)
                        e.currentTarget.value = ''
                      }}
                    />
                    <div className="muted">{editUploading ? 'Subiendo…' : 'Subida directa a Cloudinary (requiere Cloudinary configurado en la API).'}</div>
                  </label>
                  <div className="field">
                    <div className="label">Estado</div>
                    <div className="muted">{editImageUrlsRaw.trim() ? 'Imagen lista para guardar.' : 'Sin imagen.'}</div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 12 }}>
                <div className="card-title">Características</div>
                <div className="grid3">
                  <label className="field">
                    <div className="label">Modelo (opcional)</div>
                    <input value={modelo} onChange={(e) => setModelo(e.target.value)} />
                  </label>
                  <label className="field">
                    <div className="label">Código OEM (opcional)</div>
                    <input value={codigoOem} onChange={(e) => setCodigoOem(e.target.value)} />
                  </label>
                  <label className="field">
                    <div className="label">Observaciones (opcional)</div>
                    <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                  </label>
                </div>

                {editKind === 'MACHINE' ? (
                  <>
                    <label className="field">
                      <div className="label">Subtipo (campos técnicos)</div>
                      <select value={editMachineSubtype} onChange={(e) => setEditMachineSubtype(e.target.value as typeof editMachineSubtype)}>
                        <option value="CHAINSAW">Motosierra</option>
                        <option value="GENERATOR">Generador</option>
                        <option value="PRESSURE_WASHER">Hidrolavadora</option>
                        <option value="WATER_PUMP">Bomba de agua</option>
                        <option value="BRUSHCUTTER">Desbrozadora/Bordeadora</option>
                        <option value="CUT_OFF_SAW">Cortadora de disco</option>
                        <option value="LAWN_MOWER">Cortacésped</option>
                        <option value="OTHER">Otra maquinaria</option>
                      </select>
                    </label>

                    {editMachineSubtype === 'CHAINSAW' ? (
                      <div className="grid3">
                        <label className="field">
                          <div className="label">Cilindrada (cc)</div>
                          <input inputMode="decimal" value={cilindradaCcRaw} onChange={(e) => setCilindradaCcRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Potencia (HP)</div>
                          <input inputMode="decimal" value={potenciaHpRaw} onChange={(e) => setPotenciaHpRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Peso (kg)</div>
                          <input inputMode="decimal" value={pesoKgRaw} onChange={(e) => setPesoKgRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Longitud de espada (pulg)</div>
                          <input inputMode="decimal" value={espadaRecomendadaPulg} onChange={(e) => setEspadaRecomendadaPulg(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Paso de cadena</div>
                          <input value={pasoCadena} onChange={(e) => setPasoCadena(e.target.value)} />
                        </label>
                      </div>
                    ) : null}

                    {editMachineSubtype === 'GENERATOR' ? (
                      <div className="grid3">
                        <label className="field">
                          <div className="label">Potencia nominal (kW)</div>
                          <input inputMode="decimal" value={editGenPowerNominalRaw} onChange={(e) => setEditGenPowerNominalRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Potencia máxima (kW)</div>
                          <input inputMode="decimal" value={editGenPowerMaxRaw} onChange={(e) => setEditGenPowerMaxRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Voltaje de salida (V)</div>
                          <input value={editGenVoltageRaw} onChange={(e) => setEditGenVoltageRaw(e.target.value)} placeholder="Ej: 220 o 110/220" />
                        </label>
                        <label className="field">
                          <div className="label">Tanque (L)</div>
                          <input inputMode="decimal" value={editGenTankLitersRaw} onChange={(e) => setEditGenTankLitersRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Arranque</div>
                          <select value={editGenStartType} onChange={(e) => setEditGenStartType(e.target.value as typeof editGenStartType)}>
                            <option value="MANUAL">Manual</option>
                            <option value="ELECTRIC">Eléctrico</option>
                            <option value="BATTERY">Batería</option>
                            <option value="OTHER">Otro</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Cilindrada (cc)</div>
                          <input inputMode="decimal" value={editGenDisplacementCcRaw} onChange={(e) => setEditGenDisplacementCcRaw(e.target.value)} />
                        </label>
                      </div>
                    ) : null}

                    {editMachineSubtype === 'PRESSURE_WASHER' ? (
                      <div className="grid3">
                        <label className="field">
                          <div className="label">Unidad de presión</div>
                          <select value={editPwPressureUnit} onChange={(e) => setEditPwPressureUnit(e.target.value as typeof editPwPressureUnit)}>
                            <option value="PSI">PSI</option>
                            <option value="BAR">bar</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Presión máxima</div>
                          <input inputMode="decimal" value={editPwPressureMaxRaw} onChange={(e) => setEditPwPressureMaxRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Presión de trabajo</div>
                          <input inputMode="decimal" value={editPwPressureWorkRaw} onChange={(e) => setEditPwPressureWorkRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Unidad de caudal</div>
                          <select value={editPwFlowUnit} onChange={(e) => setEditPwFlowUnit(e.target.value as typeof editPwFlowUnit)}>
                            <option value="L_MIN">L/min</option>
                            <option value="L_H">L/h</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Caudal</div>
                          <input inputMode="decimal" value={editPwFlowRateRaw} onChange={(e) => setEditPwFlowRateRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Accionamiento</div>
                          <select value={editPwDriveType} onChange={(e) => setEditPwDriveType(e.target.value as typeof editPwDriveType)}>
                            <option value="ELECTRIC">Eléctrico</option>
                            <option value="COMBUSTION">Combustión</option>
                            <option value="OTHER">Otro</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Manguera (m)</div>
                          <input inputMode="decimal" value={editPwHoseLengthMRaw} onChange={(e) => setEditPwHoseLengthMRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Temp entrada máx (°C)</div>
                          <input inputMode="decimal" value={editPwMaxInletTempCRaw} onChange={(e) => setEditPwMaxInletTempCRaw(e.target.value)} />
                        </label>
                      </div>
                    ) : null}

                    {editMachineSubtype === 'WATER_PUMP' ? (
                      <div className="grid3">
                        <label className="field">
                          <div className="label">Unidad de caudal</div>
                          <select value={editPumpFlowUnit} onChange={(e) => setEditPumpFlowUnit(e.target.value as typeof editPumpFlowUnit)}>
                            <option value="M3_H">m³/h</option>
                            <option value="L_MIN">L/min</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Caudal máximo</div>
                          <input inputMode="decimal" value={editPumpFlowMaxRaw} onChange={(e) => setEditPumpFlowMaxRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Altura manométrica (m)</div>
                          <input inputMode="decimal" value={editPumpHeadMaxMRaw} onChange={(e) => setEditPumpHeadMaxMRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Succión (pulg)</div>
                          <input value={editPumpInletDiameterIn} onChange={(e) => setEditPumpInletDiameterIn(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Descarga (pulg)</div>
                          <input value={editPumpOutletDiameterIn} onChange={(e) => setEditPumpOutletDiameterIn(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Fases</div>
                          <select value={editPumpPhases} onChange={(e) => setEditPumpPhases(e.target.value as typeof editPumpPhases)}>
                            <option value="MONO">Monofásica</option>
                            <option value="TRI">Trifásica</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Voltaje (V)</div>
                          <input value={editPumpVoltageRaw} onChange={(e) => setEditPumpVoltageRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Tipo de fluido</div>
                          <select value={editPumpFluidType} onChange={(e) => setEditPumpFluidType(e.target.value as typeof editPumpFluidType)}>
                            <option value="CLEAN">Agua limpia</option>
                            <option value="DIRTY">Agua sucia</option>
                            <option value="OTHER">Otro</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Paso de sólidos (mm)</div>
                          <input inputMode="decimal" value={editPumpSolidPassMmRaw} onChange={(e) => setEditPumpSolidPassMmRaw(e.target.value)} />
                        </label>
                      </div>
                    ) : null}

                    {editMachineSubtype === 'BRUSHCUTTER' ? (
                      <div className="grid3">
                        <label className="field">
                          <div className="label">Cilindrada (cc)</div>
                          <input inputMode="decimal" value={editBcDisplacementCcRaw} onChange={(e) => setEditBcDisplacementCcRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Voltaje (V)</div>
                          <input inputMode="decimal" value={editBcVoltageRaw} onChange={(e) => setEditBcVoltageRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Potencia</div>
                          <div className="row">
                            <input inputMode="decimal" value={editBcPowerRaw} onChange={(e) => setEditBcPowerRaw(e.target.value)} />
                            <select value={editBcPowerUnit} onChange={(e) => setEditBcPowerUnit(e.target.value as typeof editBcPowerUnit)}>
                              <option value="HP">HP</option>
                              <option value="KW">kW</option>
                            </select>
                          </div>
                        </label>
                        <label className="field">
                          <div className="label">Diámetro de corte (mm)</div>
                          <input inputMode="decimal" value={editBcCutDiameterMmRaw} onChange={(e) => setEditBcCutDiameterMmRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Herramienta de corte</div>
                          <select value={editBcToolType} onChange={(e) => setEditBcToolType(e.target.value as typeof editBcToolType)}>
                            <option value="NYLON">Nylon</option>
                            <option value="BLADE_3T">Cuchilla 3 puntas</option>
                            <option value="SAW_DISC">Disco sierra</option>
                            <option value="OTHER">Otro</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Peso (kg)</div>
                          <input inputMode="decimal" value={editBcWeightKgRaw} onChange={(e) => setEditBcWeightKgRaw(e.target.value)} />
                        </label>
                      </div>
                    ) : null}

                    {editMachineSubtype === 'CUT_OFF_SAW' ? (
                      <div className="grid3">
                        <label className="field">
                          <div className="label">Diámetro de disco</div>
                          <div className="row">
                            <input inputMode="decimal" value={editCutDiscDiameterRaw} onChange={(e) => setEditCutDiscDiameterRaw(e.target.value)} />
                            <select value={editCutDiscUnit} onChange={(e) => setEditCutDiscUnit(e.target.value as typeof editCutDiscUnit)}>
                              <option value="IN">pulg</option>
                              <option value="MM">mm</option>
                            </select>
                          </div>
                        </label>
                        <label className="field">
                          <div className="label">Profundidad máx</div>
                          <input value={editCutDepthMaxRaw} onChange={(e) => setEditCutDepthMaxRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Potencia</div>
                          <div className="row">
                            <input inputMode="decimal" value={editCutPowerRaw} onChange={(e) => setEditCutPowerRaw(e.target.value)} />
                            <select value={editCutPowerUnit} onChange={(e) => setEditCutPowerUnit(e.target.value as typeof editCutPowerUnit)}>
                              <option value="HP">HP</option>
                              <option value="KW">kW</option>
                            </select>
                          </div>
                        </label>
                        <label className="field">
                          <div className="label">Tanque de agua (L)</div>
                          <input inputMode="decimal" value={editCutWaterTankLRaw} onChange={(e) => setEditCutWaterTankLRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Peso (kg)</div>
                          <input inputMode="decimal" value={editCutWeightKgRaw} onChange={(e) => setEditCutWeightKgRaw(e.target.value)} />
                        </label>
                      </div>
                    ) : null}

                    {editMachineSubtype === 'LAWN_MOWER' ? (
                      <div className="grid3">
                        <label className="field">
                          <div className="label">Ancho de corte</div>
                          <div className="row">
                            <input inputMode="decimal" value={editMowerCutWidthRaw} onChange={(e) => setEditMowerCutWidthRaw(e.target.value)} />
                            <select value={editMowerCutWidthUnit} onChange={(e) => setEditMowerCutWidthUnit(e.target.value as typeof editMowerCutWidthUnit)}>
                              <option value="CM">cm</option>
                              <option value="IN">pulg</option>
                            </select>
                          </div>
                        </label>
                        <label className="field">
                          <div className="label">Tracción</div>
                          <select value={editMowerTraction} onChange={(e) => setEditMowerTraction(e.target.value as typeof editMowerTraction)}>
                            <option value="MANUAL">Manual</option>
                            <option value="SELF">Autopropulsada</option>
                            <option value="VARIABLE">Velocidad variable</option>
                            <option value="HYDRO">Hidrostática</option>
                          </select>
                        </label>
                        <label className="field">
                          <div className="label">Recolector (L)</div>
                          <input inputMode="decimal" value={editMowerCollectorLRaw} onChange={(e) => setEditMowerCollectorLRaw(e.target.value)} />
                        </label>
                        <label className="field">
                          <div className="label">Altura corte (rango)</div>
                          <input value={editMowerCutHeightRange} onChange={(e) => setEditMowerCutHeightRange(e.target.value)} placeholder="Ej: 20–100 mm" />
                        </label>
                        <label className="field">
                          <div className="label">Superficie recomendada (m²)</div>
                          <input inputMode="numeric" value={editMowerSurfaceM2Raw} onChange={(e) => setEditMowerSurfaceM2Raw(e.target.value)} />
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {editKind === 'CONSUMABLE' ? (
                  <div className="grid3">
                    <label className="field">
                      <div className="label">Viscosidad</div>
                      <input value={viscosidad} onChange={(e) => setViscosidad(e.target.value)} />
                    </label>
                    <label className="field">
                      <div className="label">Capacidad (ml)</div>
                      <input inputMode="numeric" value={capacidadMlRaw} onChange={(e) => setCapacidadMlRaw(e.target.value)} />
                    </label>
                  </div>
                ) : null}

                <div className="card" style={{ padding: 10, marginTop: 10 }}>
                  <div className="card-title">Atributos extra</div>
                  {attributes.map((a, idx) => (
                    <div className="row" key={idx}>
                      <input value={a.key} onChange={(e) => updateAttribute(idx, { key: e.target.value })} placeholder="clave" />
                      <input value={a.value} onChange={(e) => updateAttribute(idx, { value: e.target.value })} placeholder="valor" />
                      <button type="button" className="secondary" onClick={() => removeAttribute(idx)} disabled={editSaving}>
                        Quitar
                      </button>
                    </div>
                  ))}
                  <div className="actions">
                    <button type="button" className="secondary" onClick={addAttribute} disabled={editSaving}>
                      Agregar atributo
                    </button>
                  </div>
                </div>
              </div>

              {editFieldError ? <div className="field-error">{editFieldError}</div> : null}
              <div className="actions">
                <button type="submit" disabled={editSaving || editUploading}>
                  {editSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
          </form>
        </div>
      ) : null}

      {movementOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMovementOpen(false)
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">Registrar movimiento</div>
                {product ? <div className="muted mono">{product.skuInternal}</div> : null}
              </div>
              <button type="button" className="secondary" onClick={() => setMovementOpen(false)} disabled={saving}>
                Cerrar
              </button>
            </div>

            {formError ? <ErrorBox error={formError} /> : null}
            {formError instanceof ApiError && formError.code === 'CONFLICT' ? <div className="muted">Verifica el stock antes de registrar una salida.</div> : null}

            <form className="form" onSubmit={onCreateMovement}>
              <div className="grid3">
                <label className="field">
                  <div className="label">Tipo</div>
                  <select value={type} onChange={(e) => setType(e.target.value as MovementType)}>
                    <option value="PURCHASE">Compra (entrada)</option>
                    <option value="SALE">Venta (salida)</option>
                    <option value="ADJUSTMENT">Ajuste</option>
                  </select>
                </label>
                <label className="field">
                  <div className="label">Cantidad</div>
                  <input inputMode="numeric" value={quantityRaw} onChange={(e) => setQuantityRaw(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">Documento (opcional)</div>
                  <input value={referenceDoc} onChange={(e) => setReferenceDoc(e.target.value)} placeholder="Ej: OC-001" />
                </label>
              </div>
              {fieldError ? <div className="field-error">{fieldError}</div> : null}
              <div className="actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'Registrando…' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
