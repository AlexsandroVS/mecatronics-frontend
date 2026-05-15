import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import {
  addCompatibility,
  createProduct,
  cloudinarySign,
  exportProducts,
  listBrands,
  listCategories,
  listProducts,
  searchProducts,
  type Brand,
  type Category,
  type ProductListItem,
  type ProductSearchItem
} from '../lib/inventory-api'
import { href, navigate } from '../lib/router'
import { useMediaQuery } from '../lib/useMediaQuery'
import { ErrorBox } from '../ui/ErrorBox'
import { Icon } from '../ui/Icon'

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

const moneySchema = z.string().regex(/^\d+(\.\d+)?$/, 'Formato inválido (ej: 10.00)')

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(160, 'Máximo 160 caracteres'),
  description: z.string().trim().min(1).max(4000).nullable(),
  kind: z.enum(['MACHINE', 'PART', 'CONSUMABLE', 'ACCESSORY']),
  brandId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  stockMin: z.number().int().min(0),
  priceCost: moneySchema,
  priceSell: moneySchema,
  imageUrls: z.array(z.string().url()).max(1).optional(),
  specs: z
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
    .optional(),
  attributes: z
    .array(z.object({ key: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(160) }))
    .max(40)
    .optional()
})

export function ProductsPage() {
  const isMobile = useMediaQuery('(max-width: 560px)')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ProductListItem[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [listKind, setListKind] = useState<'ALL' | ProductListItem['kind']>('ALL')
  const [listStock, setListStock] = useState<'ALL' | 'LOW'>('ALL')
  const [listSort, setListSort] = useState<'NAME' | 'STOCK'>('NAME')
  const [listDir, setListDir] = useState<'ASC' | 'DESC'>('ASC')
  const [exporting, setExporting] = useState(false)

  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<unknown>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'MACHINE' | 'PART' | 'CONSUMABLE' | 'ACCESSORY'>('PART')
  const [machineCategory, setMachineCategory] = useState<'CHAINSAWS' | 'PUMPS' | 'GENERATORS' | 'CLEANING_GARDEN'>('CHAINSAWS')
  const [cleaningGardenType, setCleaningGardenType] = useState<'PRESSURE_WASHER' | 'BRUSHCUTTER' | 'CUT_OFF_SAW' | 'LAWN_MOWER'>(
    'PRESSURE_WASHER'
  )
  const [machineSubtype, setMachineSubtype] = useState<
    'CHAINSAW' | 'GENERATOR' | 'PRESSURE_WASHER' | 'WATER_PUMP' | 'BRUSHCUTTER' | 'CUT_OFF_SAW' | 'LAWN_MOWER' | 'OTHER'
  >('CHAINSAW')
  const [brandIdRaw, setBrandIdRaw] = useState('')
  const [categoryIdRaw, setCategoryIdRaw] = useState('')
  const [stockMinRaw, setStockMinRaw] = useState('0')
  const [priceCost, setPriceCost] = useState('0.00')
  const [priceSell, setPriceSell] = useState('0.00')
  const [imageUrlsRaw, setImageUrlsRaw] = useState('')

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

  const [genPowerNominalRaw, setGenPowerNominalRaw] = useState('')
  const [genPowerMaxRaw, setGenPowerMaxRaw] = useState('')
  const [genVoltageRaw, setGenVoltageRaw] = useState('')
  const [genTankLitersRaw, setGenTankLitersRaw] = useState('')
  const [genStartType, setGenStartType] = useState<'MANUAL' | 'ELECTRIC' | 'BATTERY' | 'OTHER'>('MANUAL')
  const [genDisplacementCcRaw, setGenDisplacementCcRaw] = useState('')

  const [pwPressureMaxRaw, setPwPressureMaxRaw] = useState('')
  const [pwPressureWorkRaw, setPwPressureWorkRaw] = useState('')
  const [pwPressureUnit, setPwPressureUnit] = useState<'PSI' | 'BAR'>('PSI')
  const [pwFlowRateRaw, setPwFlowRateRaw] = useState('')
  const [pwFlowUnit, setPwFlowUnit] = useState<'L_MIN' | 'L_H'>('L_MIN')
  const [pwDriveType, setPwDriveType] = useState<'ELECTRIC' | 'COMBUSTION' | 'OTHER'>('ELECTRIC')
  const [pwHoseLengthMRaw, setPwHoseLengthMRaw] = useState('')
  const [pwMaxInletTempCRaw, setPwMaxInletTempCRaw] = useState('')

  const [pumpFlowMaxRaw, setPumpFlowMaxRaw] = useState('')
  const [pumpHeadMaxMRaw, setPumpHeadMaxMRaw] = useState('')
  const [pumpInletDiameterIn, setPumpInletDiameterIn] = useState('')
  const [pumpOutletDiameterIn, setPumpOutletDiameterIn] = useState('')
  const [pumpPhases, setPumpPhases] = useState<'MONO' | 'TRI'>('MONO')
  const [pumpVoltageRaw, setPumpVoltageRaw] = useState('')
  const [pumpFluidType, setPumpFluidType] = useState<'CLEAN' | 'DIRTY' | 'OTHER'>('CLEAN')
  const [pumpSolidPassMmRaw, setPumpSolidPassMmRaw] = useState('')

  const [bcPowerRaw, setBcPowerRaw] = useState('')
  const [bcPowerUnit, setBcPowerUnit] = useState<'HP' | 'KW'>('HP')
  const [bcDisplacementCcRaw, setBcDisplacementCcRaw] = useState('')
  const [bcVoltageRaw, setBcVoltageRaw] = useState('')
  const [bcCutDiameterMmRaw, setBcCutDiameterMmRaw] = useState('')
  const [bcToolType, setBcToolType] = useState<'NYLON' | 'BLADE_3T' | 'SAW_DISC' | 'OTHER'>('NYLON')
  const [bcWeightKgRaw, setBcWeightKgRaw] = useState('')

  const [cutDiscDiameterRaw, setCutDiscDiameterRaw] = useState('')
  const [cutDiscUnit, setCutDiscUnit] = useState<'IN' | 'MM'>('IN')
  const [cutDepthMaxRaw, setCutDepthMaxRaw] = useState('')
  const [cutPowerRaw, setCutPowerRaw] = useState('')
  const [cutPowerUnit, setCutPowerUnit] = useState<'HP' | 'KW'>('HP')
  const [cutWaterTankLRaw, setCutWaterTankLRaw] = useState('')
  const [cutWeightKgRaw, setCutWeightKgRaw] = useState('')

  const [mowerCutWidthRaw, setMowerCutWidthRaw] = useState('')
  const [mowerCutWidthUnit, setMowerCutWidthUnit] = useState<'CM' | 'IN'>('CM')
  const [mowerTraction, setMowerTraction] = useState<'MANUAL' | 'SELF' | 'VARIABLE' | 'HYDRO'>('MANUAL')
  const [mowerCollectorLRaw, setMowerCollectorLRaw] = useState('')
  const [mowerCutHeightRange, setMowerCutHeightRange] = useState('')
  const [mowerSurfaceM2Raw, setMowerSurfaceM2Raw] = useState('')

  const [compatQ, setCompatQ] = useState('')
  const [compatItems, setCompatItems] = useState<ProductSearchItem[] | null>(null)
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatError, setCompatError] = useState<unknown>(null)
  const [compatSelected, setCompatSelected] = useState<ProductSearchItem[]>([])

  const brandId = useMemo(() => Number(brandIdRaw), [brandIdRaw])
  const categoryId = useMemo(() => Number(categoryIdRaw), [categoryIdRaw])
  const stockMin = useMemo(() => Number(stockMinRaw), [stockMinRaw])
  const compatTrimmed = useMemo(() => compatQ.trim(), [compatQ])

  useEffect(() => {
    if (kind !== 'MACHINE') return
    if (machineCategory === 'CHAINSAWS') setMachineSubtype('CHAINSAW')
    else if (machineCategory === 'PUMPS') setMachineSubtype('WATER_PUMP')
    else if (machineCategory === 'GENERATORS') setMachineSubtype('GENERATOR')
    else setMachineSubtype(cleaningGardenType)
  }, [kind, machineCategory, cleaningGardenType])

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

  useEffect(() => {
    if (!formOpen) return
    if (!categories || categories.length === 0) return
    if (categoryIdRaw.trim()) return

    const pickByName = (needles: string[]) => {
      const lowerNeedles = needles.map((s) => s.toLowerCase())
      return categories.find((c) => lowerNeedles.some((n) => c.name.toLowerCase().includes(n)))?.id
    }

    const none = pickByName(['ninguna', 'sin categoría', 'sin categoria'])
    const picked =
      kind === 'MACHINE'
        ? pickByName(['maquinaria', 'máquina', 'equipos']) ?? categories[0].id
        : kind === 'PART'
          ? none ?? pickByName(['repuesto', 'partes', 'spare']) ?? categories[0].id
          : kind === 'CONSUMABLE'
            ? none ?? pickByName(['consumible', 'aceite', 'lubricante']) ?? categories[0].id
            : none ?? pickByName(['accesorio']) ?? categories[0].id

    setCategoryIdRaw(String(picked))
  }, [formOpen, categories, categoryIdRaw, kind])

  useEffect(() => {
    if (!formOpen) return
    if (kind === 'MACHINE') return
    if (compatTrimmed.length < 2) {
      setCompatItems(null)
      setCompatError(null)
      setCompatLoading(false)
      return
    }

    let cancelled = false
    const t = window.setTimeout(() => {
      setCompatLoading(true)
      setCompatError(null)
      searchProducts(compatTrimmed, { kind: 'MACHINE', machineSubtype: 'CHAINSAW', limit: 20 })
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
  }, [compatTrimmed, formOpen, kind])

  const selectedBrandName = useMemo(() => {
    if (!brands) return null
    const id = Number(brandIdRaw)
    if (!Number.isFinite(id)) return null
    return brands.find((b) => b.id === id)?.name ?? null
  }, [brands, brandIdRaw])

  const selectedCategoryName = useMemo(() => {
    if (!categories) return null
    const id = Number(categoryIdRaw)
    if (!Number.isFinite(id)) return null
    return categories.find((c) => c.id === id)?.name ?? null
  }, [categories, categoryIdRaw])

  function kindLabel(v: typeof kind) {
    if (v === 'MACHINE') return 'Maquinaria'
    if (v === 'PART') return 'Repuesto'
    if (v === 'CONSUMABLE') return 'Consumible'
    return 'Accesorio'
  }

  function machineSubtypeLabel(v: typeof machineSubtype) {
    if (v === 'CHAINSAW') return 'Motosierra'
    if (v === 'GENERATOR') return 'Generador'
    if (v === 'PRESSURE_WASHER') return 'Hidrolavadora'
    if (v === 'WATER_PUMP') return 'Bomba de agua'
    if (v === 'BRUSHCUTTER') return 'Desbrozadora/Bordeadora'
    if (v === 'CUT_OFF_SAW') return 'Cortadora de disco'
    if (v === 'LAWN_MOWER') return 'Cortacésped'
    return 'Otra maquinaria'
  }

  const qTrimmed = useMemo(() => q.trim(), [q])

  async function refreshProducts(input?: { query?: string; page?: number }) {
    setLoadError(null)
    setItems(null)
    try {
      const query = input?.query?.trim() ? input.query.trim() : undefined
      const data = await listProducts({
        q: query,
        page: input?.page ?? page,
        kind: listKind === 'ALL' ? undefined : listKind,
        lowStock: listStock === 'LOW' ? true : undefined,
        sort: listSort,
        dir: listDir
      })
      setItems(data)
    } catch (err) {
      setLoadError(err)
    }
  }

  async function onExportList(format: 'PDF' | 'XLSX') {
    if (exporting) return
    setExporting(true)
    try {
      const query = qTrimmed ? qTrimmed : undefined
      const res = await exportProducts({
        format,
        q: query,
        kind: listKind === 'ALL' ? undefined : listKind,
        lowStock: listStock === 'LOW' ? true : undefined,
        sort: listSort,
        dir: listDir
      })
      downloadBlob({ blob: res.blob, filename: res.filename ?? `productos.${format === 'PDF' ? 'pdf' : 'xlsx'}` })
    } catch (err) {
      setLoadError(err)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    refreshProducts({ page, query: qTrimmed })
  }, [page])

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (page !== 1) setPage(1)
      else void refreshProducts({ page: 1, query: qTrimmed })
    }, 250)
    return () => {
      window.clearTimeout(t)
    }
  }, [qTrimmed, listKind, listStock, listSort, listDir])

  function resetForm() {
    setName('')
    setDescription('')
    setKind('PART')
    setMachineCategory('CHAINSAWS')
    setCleaningGardenType('PRESSURE_WASHER')
    setMachineSubtype('CHAINSAW')
    setBrandIdRaw('')
    setCategoryIdRaw('')
    setStockMinRaw('0')
    setPriceCost('')
    setPriceSell('')
    setImageUrlsRaw('')
    setModelo('')
    setCilindradaCcRaw('')
    setPotenciaHpRaw('')
    setPesoKgRaw('')
    setEspadaRecomendadaPulg('')
    setPasoCadena('')
    setCodigoOem('')
    setViscosidad('')
    setCapacidadMlRaw('')
    setObservaciones('')
    setAttributes([])
    setGenPowerNominalRaw('')
    setGenPowerMaxRaw('')
    setGenVoltageRaw('')
    setGenTankLitersRaw('')
    setGenStartType('MANUAL')
    setGenDisplacementCcRaw('')

    setPwPressureMaxRaw('')
    setPwPressureWorkRaw('')
    setPwPressureUnit('PSI')
    setPwFlowRateRaw('')
    setPwFlowUnit('L_MIN')
    setPwDriveType('ELECTRIC')
    setPwHoseLengthMRaw('')
    setPwMaxInletTempCRaw('')

    setPumpFlowMaxRaw('')
    setPumpHeadMaxMRaw('')
    setPumpInletDiameterIn('')
    setPumpOutletDiameterIn('')
    setPumpPhases('MONO')
    setPumpVoltageRaw('')
    setPumpFluidType('CLEAN')
    setPumpSolidPassMmRaw('')

    setBcPowerRaw('')
    setBcPowerUnit('HP')
    setBcDisplacementCcRaw('')
    setBcVoltageRaw('')
    setBcCutDiameterMmRaw('')
    setBcToolType('NYLON')
    setBcWeightKgRaw('')

    setCutDiscDiameterRaw('')
    setCutDiscUnit('IN')
    setCutDepthMaxRaw('')
    setCutPowerRaw('')
    setCutPowerUnit('HP')
    setCutWaterTankLRaw('')
    setCutWeightKgRaw('')

    setMowerCutWidthRaw('')
    setMowerCutWidthUnit('CM')
    setMowerTraction('MANUAL')
    setMowerCollectorLRaw('')
    setMowerCutHeightRange('')
    setMowerSurfaceM2Raw('')
    setAdvancedOpen(false)
    setCompatQ('')
    setCompatItems(null)
    setCompatSelected([])
    setCompatError(null)
    setCompatLoading(false)
    setFormError(null)
    setFieldError(null)
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

  function addCompatibleMachine(p: ProductSearchItem) {
    if (compatSelected.some((x) => x.id === p.id)) return
    setCompatSelected((prev) => [...prev, p])
  }

  function removeCompatibleMachine(id: number) {
    setCompatSelected((prev) => prev.filter((p) => p.id !== id))
  }

  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0) return
    setFormError(null)
    setFieldError(null)

    setUploading(true)
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
        if (!res.ok || !url.success) {
          throw new Error('Fallo al subir imagen')
        }
        uploaded.push(url.data.secure_url)
      }

      const merged = uploaded.slice(0, 1)
      setImageUrlsRaw(merged.join('\n'))
    } catch (err) {
      setFormError(err)
    } finally {
      setUploading(false)
    }
  }

  async function onCreateProduct(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFieldError(null)

    const imageUrls = imageUrlsRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 1)

    const specs: Record<string, unknown> = {}
    if (modelo.trim()) specs.modelo = modelo.trim()
    if (kind === 'MACHINE' && (machineSubtype === 'CHAINSAW' || machineSubtype === 'BRUSHCUTTER') && cilindradaCcRaw.trim()) {
      const n = Number(cilindradaCcRaw)
      if (!Number.isFinite(n) || n <= 0) {
        setFieldError('cilindrada_cc inválida')
        return
      }
      specs.cilindrada_cc = n
    }
    if (kind === 'MACHINE' && machineSubtype === 'GENERATOR' && genDisplacementCcRaw.trim()) {
      const n = Number(genDisplacementCcRaw)
      if (!Number.isFinite(n) || n <= 0) {
        setFieldError('cilindrada_cc inválida')
        return
      }
      specs.cilindrada_cc = n
    }
    if (kind === 'MACHINE' && ['CHAINSAW', 'BRUSHCUTTER', 'WATER_PUMP', 'PRESSURE_WASHER'].includes(machineSubtype) && potenciaHpRaw.trim()) {
      const n = Number(potenciaHpRaw)
      if (!Number.isFinite(n) || n <= 0) {
        setFieldError('potencia_hp inválida')
        return
      }
      specs.potencia_hp = n
    }
    if (kind === 'MACHINE' && ['CHAINSAW', 'BRUSHCUTTER', 'PRESSURE_WASHER'].includes(machineSubtype) && pesoKgRaw.trim()) {
      const n = Number(pesoKgRaw)
      if (!Number.isFinite(n) || n <= 0) {
        setFieldError('peso_kg inválido')
        return
      }
      specs.peso_kg = n
    }
    if (kind === 'MACHINE' && machineSubtype === 'CHAINSAW' && pasoCadena.trim()) specs.paso_cadena = pasoCadena.trim()
    if (codigoOem.trim()) specs.codigo_oem = codigoOem.trim()
    if (kind === 'CONSUMABLE' && viscosidad.trim()) specs.viscosidad = viscosidad.trim()
    if (kind === 'CONSUMABLE' && capacidadMlRaw.trim()) {
      const n = Number(capacidadMlRaw)
      if (!Number.isInteger(n) || n <= 0) {
        setFieldError('capacidad_ml inválida')
        return
      }
      specs.capacidad_ml = n
    }
    if (observaciones.trim()) specs.observaciones = observaciones.trim()

    const dynamicAttributes: Array<{ key: string; value: string }> = []
    if (kind === 'MACHINE') {
      dynamicAttributes.push({ key: 'machine_subtype', value: machineSubtype })

      if (machineSubtype === 'GENERATOR') {
        if (genPowerNominalRaw.trim()) dynamicAttributes.push({ key: 'potencia_nominal_kw', value: genPowerNominalRaw.trim() })
        if (genPowerMaxRaw.trim()) dynamicAttributes.push({ key: 'potencia_max_kw', value: genPowerMaxRaw.trim() })
        if (genVoltageRaw.trim()) dynamicAttributes.push({ key: 'voltaje_v', value: genVoltageRaw.trim() })
        if (genTankLitersRaw.trim()) dynamicAttributes.push({ key: 'capacidad_tanque_l', value: genTankLitersRaw.trim() })
        if (genStartType) dynamicAttributes.push({ key: 'sistema_arranque', value: genStartType })
      }

      if (machineSubtype === 'PRESSURE_WASHER') {
        if (pwPressureMaxRaw.trim()) dynamicAttributes.push({ key: `presion_max_${pwPressureUnit.toLowerCase()}`, value: pwPressureMaxRaw.trim() })
        if (pwPressureWorkRaw.trim()) dynamicAttributes.push({ key: `presion_trabajo_${pwPressureUnit.toLowerCase()}`, value: pwPressureWorkRaw.trim() })
        if (pwFlowRateRaw.trim()) dynamicAttributes.push({ key: `caudal_${pwFlowUnit === 'L_MIN' ? 'lmin' : 'lh'}`, value: pwFlowRateRaw.trim() })
        if (pwDriveType) dynamicAttributes.push({ key: 'tipo_motor', value: pwDriveType })
        if (pwHoseLengthMRaw.trim()) dynamicAttributes.push({ key: 'longitud_manguera_m', value: pwHoseLengthMRaw.trim() })
        if (pwMaxInletTempCRaw.trim()) dynamicAttributes.push({ key: 'temperatura_entrada_max_c', value: pwMaxInletTempCRaw.trim() })
      }

      if (machineSubtype === 'WATER_PUMP') {
        if (pumpInletDiameterIn.trim()) dynamicAttributes.push({ key: 'diametro_succion_pulg', value: pumpInletDiameterIn.trim() })
        if (pumpOutletDiameterIn.trim()) dynamicAttributes.push({ key: 'diametro_descarga_pulg', value: pumpOutletDiameterIn.trim() })
        if (pumpFlowMaxRaw.trim()) dynamicAttributes.push({ key: 'caudal_max_lmin', value: pumpFlowMaxRaw.trim() })
        if (pumpHeadMaxMRaw.trim()) dynamicAttributes.push({ key: 'altura_max_m', value: pumpHeadMaxMRaw.trim() })
        if (advancedOpen) {
          if (pumpPhases) dynamicAttributes.push({ key: 'fases', value: pumpPhases })
          if (pumpVoltageRaw.trim()) dynamicAttributes.push({ key: 'voltaje_v', value: pumpVoltageRaw.trim() })
          if (pumpFluidType) dynamicAttributes.push({ key: 'tipo_fluido', value: pumpFluidType })
          if (pumpSolidPassMmRaw.trim()) dynamicAttributes.push({ key: 'paso_solidos_mm', value: pumpSolidPassMmRaw.trim() })
        }
      }

      if (machineSubtype === 'BRUSHCUTTER') {
        if (bcDisplacementCcRaw.trim()) dynamicAttributes.push({ key: 'brushcutter_displacement_cc', value: bcDisplacementCcRaw.trim() })
        if (bcVoltageRaw.trim()) dynamicAttributes.push({ key: 'brushcutter_voltage_v', value: bcVoltageRaw.trim() })
        if (bcPowerRaw.trim()) dynamicAttributes.push({ key: `brushcutter_power_${bcPowerUnit.toLowerCase()}`, value: bcPowerRaw.trim() })
        if (bcCutDiameterMmRaw.trim()) dynamicAttributes.push({ key: 'brushcutter_cut_diameter_mm', value: bcCutDiameterMmRaw.trim() })
        if (bcToolType) dynamicAttributes.push({ key: 'brushcutter_tool_type', value: bcToolType })
        if (bcWeightKgRaw.trim()) dynamicAttributes.push({ key: 'brushcutter_weight_kg', value: bcWeightKgRaw.trim() })
      }

      if (machineSubtype === 'CUT_OFF_SAW') {
        if (cutDiscDiameterRaw.trim()) dynamicAttributes.push({ key: `cutoff_disc_diameter_${cutDiscUnit.toLowerCase()}`, value: cutDiscDiameterRaw.trim() })
        if (cutDepthMaxRaw.trim()) dynamicAttributes.push({ key: 'cutoff_cut_depth_max', value: cutDepthMaxRaw.trim() })
        if (cutPowerRaw.trim()) dynamicAttributes.push({ key: `cutoff_power_${cutPowerUnit.toLowerCase()}`, value: cutPowerRaw.trim() })
        if (cutWaterTankLRaw.trim()) dynamicAttributes.push({ key: 'cutoff_water_tank_l', value: cutWaterTankLRaw.trim() })
        if (cutWeightKgRaw.trim()) dynamicAttributes.push({ key: 'cutoff_weight_kg', value: cutWeightKgRaw.trim() })
      }

      if (machineSubtype === 'LAWN_MOWER') {
        if (mowerCutWidthRaw.trim()) dynamicAttributes.push({ key: `mower_cut_width_${mowerCutWidthUnit.toLowerCase()}`, value: mowerCutWidthRaw.trim() })
        if (mowerTraction) dynamicAttributes.push({ key: 'mower_traction', value: mowerTraction })
        if (mowerCollectorLRaw.trim()) dynamicAttributes.push({ key: 'mower_collector_l', value: mowerCollectorLRaw.trim() })
        if (mowerCutHeightRange.trim()) dynamicAttributes.push({ key: 'mower_cut_height_range', value: mowerCutHeightRange.trim() })
        if (mowerSurfaceM2Raw.trim()) dynamicAttributes.push({ key: 'mower_surface_m2', value: mowerSurfaceM2Raw.trim() })
      }

      if (machineSubtype === 'CHAINSAW' && espadaRecomendadaPulg.trim()) {
        dynamicAttributes.push({ key: 'longitud_espada_pulg', value: espadaRecomendadaPulg.trim() })
      }
    }

    const cleanAttributes = [...attributes, ...dynamicAttributes]
      .map((a) => ({ key: a.key.trim(), value: a.value.trim() }))
      .filter((a) => a.key && a.value)

    const parsed = createProductSchema.safeParse({
      name,
      description: description.trim() ? description.trim() : null,
      kind,
      brandId,
      categoryId,
      stockMin,
      priceCost,
      priceSell,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      specs: Object.keys(specs).length ? specs : undefined,
      attributes: cleanAttributes.length ? cleanAttributes : undefined
    })

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Producto inválido')
      return
    }

    setSaving(true)
    try {
      const created = await createProduct(parsed.data)
      if (kind !== 'MACHINE' && compatSelected.length) {
        for (const m of compatSelected) {
          await addCompatibility({ partId: created.id, machineId: m.id })
        }
      }
      setFormOpen(false)
      resetForm()
      setPage(1)
      await refreshProducts({ query: q, page: 1 })
      navigate({ name: 'product', id: created.id })
    } catch (err) {
      setFormError(err)
    } finally {
      setSaving(false)
    }
  }

  const bootstrappingNeeded = brands?.length === 0 || categories?.length === 0

  return (
    <div className="page">
      <div className="page-header">
        <h1>Productos</h1>
        <div className="page-actions">
          <button
            type="button"
            className="download-btn pdf"
            disabled={exporting}
            onClick={() => void onExportList('PDF')}
            title="Descargar listado en PDF (según filtros)"
          >
            <Icon name="i-file-pdf" />
            PDF
            <Icon name="i-download" />
          </button>
          <button
            type="button"
            className="download-btn xlsx"
            disabled={exporting}
            onClick={() => void onExportList('XLSX')}
            title="Descargar listado en Excel (según filtros)"
          >
            <Icon name="i-file-xls" />
            Excel
            <Icon name="i-download" />
          </button>
          <button type="button" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? 'Cerrar' : 'Nuevo producto'}
          </button>
        </div>
      </div>

      {bootstrappingNeeded ? (
        <div className="card">
          <div className="card-title">Pre-requisitos</div>
          <div className="muted">
            Crea al menos 1 marca y 1 categoría antes de registrar productos.
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title" style={{ margin: 0 }}>
              Nuevo producto
            </div>
            <div className="row">
              <button type="button" className="secondary" onClick={() => setAdvancedOpen((v) => !v)} disabled={saving}>
                {advancedOpen ? 'Ocultar avanzado' : 'Avanzado'}
              </button>
              <button type="button" className="secondary" onClick={resetForm} disabled={saving}>
                Limpiar
              </button>
            </div>
          </div>
          {formError ? <ErrorBox error={formError} /> : null}
          <form className="product-form" onSubmit={onCreateProduct}>
            <div className="product-form-layout">
              <div className="product-form-main">
                <div className="form-section">
                  <div className="section-head">
                    <div className="section-title">Información básica</div>
                    <div className="section-subtitle">Nombre, tipo y una descripción corta para que sea fácil de ubicar.</div>
                  </div>

                  <div className="grid2">
                    <label className="field">
                      <div className="label">Nombre</div>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={kind === 'MACHINE' ? 'Ej: Motosierra Husqvarna 372XP' : 'Ej: Piñón / Polea de arranque'}
                      />
                    </label>
                    <label className="field">
                      <div className="label">Tipo</div>
                      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                        <option value="MACHINE">Maquinaria</option>
                        <option value="PART">Repuesto</option>
                        <option value="CONSUMABLE">Consumible</option>
                        <option value="ACCESSORY">Accesorio</option>
                      </select>
                    </label>
                  </div>

                  {kind === 'MACHINE' ? (
                    <div className="grid2">
                      <label className="field">
                        <div className="label">Categoría técnica</div>
                        <select value={machineCategory} onChange={(e) => setMachineCategory(e.target.value as typeof machineCategory)}>
                          <option value="CHAINSAWS">Motosierras</option>
                          <option value="PUMPS">Bombas y Motobombas</option>
                          <option value="GENERATORS">Generadores Eléctricos</option>
                          <option value="CLEANING_GARDEN">Limpieza y Jardinería</option>
                        </select>
                      </label>
                      {machineCategory === 'CLEANING_GARDEN' ? (
                        <label className="field">
                          <div className="label">Tipo</div>
                          <select value={cleaningGardenType} onChange={(e) => setCleaningGardenType(e.target.value as typeof cleaningGardenType)}>
                            <option value="PRESSURE_WASHER">Hidrolavadora</option>
                            <option value="BRUSHCUTTER">Desbrozadora/Bordeadora</option>
                            <option value="CUT_OFF_SAW">Cortadora de disco</option>
                            <option value="LAWN_MOWER">Cortacésped</option>
                          </select>
                        </label>
                      ) : (
                        <div className="field">
                          <div className="label">Tipo</div>
                          <div className="muted mono">{machineSubtypeLabel(machineSubtype)}</div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <label className="field">
                    <div className="label">Descripción (opcional)</div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder={kind === 'MACHINE' ? 'Ej: Equipo de uso profesional, incluye espada.' : 'Ej: Repuesto original / compatible.'}
                    />
                  </label>
                </div>

                <div className="form-section">
                  <div className="section-head">
                    <div className="section-title">Imagen</div>
                    <div className="section-subtitle">Normalmente es 1 imagen. Puedes subirla ahora o más adelante.</div>
                  </div>

                  <div className="grid2">
                    <label className="field">
                      <div className="label">Subir archivo</div>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploading}
                        onChange={(e) => {
                          void uploadImages(e.target.files)
                          e.currentTarget.value = ''
                        }}
                      />
                      <div className="muted">{uploading ? 'Subiendo…' : 'Subida directa a Cloudinary (requiere Cloudinary configurado en la API).'}</div>
                    </label>
                    <div className="field">
                      <div className="label">Estado</div>
                      <div className="muted">{imageUrlsRaw.trim() ? 'Imagen lista para guardar.' : 'Sin imagen (puedes subir ahora o luego).'}</div>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-head">
                    <div className="section-title">Datos técnicos</div>
                    <div className="section-subtitle">Se muestran según el tipo. Usa “Avanzado” para campos extra.</div>
                  </div>

                  {kind === 'MACHINE' || advancedOpen ? (
                <div className="grid3">
                  <label className="field">
                    <div className="label">Modelo (opcional)</div>
                    <input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ej: 372XP" />
                  </label>
                  <label className="field">
                    <div className="label">Código OEM (opcional)</div>
                    <input value={codigoOem} onChange={(e) => setCodigoOem(e.target.value)} placeholder="Ej: 0000-000-0000" />
                  </label>
                  <label className="field">
                    <div className="label">Observaciones (opcional)</div>
                    <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                  </label>
                </div>
              ) : (
                <div className="muted">Selecciona un tipo para mostrar los campos técnicos.</div>
              )}

              {kind === 'MACHINE' && machineSubtype === 'CHAINSAW' ? (
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
                    <input inputMode="decimal" value={espadaRecomendadaPulg} onChange={(e) => setEspadaRecomendadaPulg(e.target.value)} placeholder="Ej: 20" />
                  </label>
                  <label className="field">
                    <div className="label">Paso de cadena</div>
                    <input value={pasoCadena} onChange={(e) => setPasoCadena(e.target.value)} placeholder='3/8"' />
                  </label>
                </div>
              ) : null}

              {kind === 'MACHINE' && machineSubtype === 'GENERATOR' ? (
                <div className="grid3">
                  <label className="field">
                    <div className="label">Potencia nominal (kW)</div>
                    <input inputMode="decimal" value={genPowerNominalRaw} onChange={(e) => setGenPowerNominalRaw(e.target.value)} placeholder="Ej: 2.8" />
                  </label>
                  <label className="field">
                    <div className="label">Potencia máxima (kW)</div>
                    <input inputMode="decimal" value={genPowerMaxRaw} onChange={(e) => setGenPowerMaxRaw(e.target.value)} placeholder="Ej: 3.2" />
                  </label>
                  <label className="field">
                    <div className="label">Voltaje de salida (V)</div>
                    <input value={genVoltageRaw} onChange={(e) => setGenVoltageRaw(e.target.value)} placeholder="Ej: 220 o 110/220" />
                  </label>
                  <label className="field">
                    <div className="label">Tanque de combustible (L)</div>
                    <input inputMode="decimal" value={genTankLitersRaw} onChange={(e) => setGenTankLitersRaw(e.target.value)} placeholder="Ej: 15" />
                  </label>
                  <label className="field">
                    <div className="label">Tipo de arranque</div>
                    <select value={genStartType} onChange={(e) => setGenStartType(e.target.value as typeof genStartType)}>
                      <option value="MANUAL">Manual (retráctil)</option>
                      <option value="ELECTRIC">Eléctrico</option>
                      <option value="BATTERY">Batería</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </label>
                  <label className="field">
                    <div className="label">Cilindrada (cc)</div>
                    <input inputMode="decimal" value={genDisplacementCcRaw} onChange={(e) => setGenDisplacementCcRaw(e.target.value)} placeholder="Ej: 196" />
                  </label>
                </div>
              ) : null}

              {kind === 'MACHINE' && machineSubtype === 'PRESSURE_WASHER' ? (
                <div className="grid3">
                  <label className="field">
                    <div className="label">Unidad de presión</div>
                    <select value={pwPressureUnit} onChange={(e) => setPwPressureUnit(e.target.value as typeof pwPressureUnit)}>
                      <option value="PSI">PSI</option>
                      <option value="BAR">bar</option>
                    </select>
                  </label>
                  <label className="field">
                    <div className="label">Presión máxima</div>
                    <input inputMode="decimal" value={pwPressureMaxRaw} onChange={(e) => setPwPressureMaxRaw(e.target.value)} placeholder={pwPressureUnit === 'PSI' ? 'Ej: 2000' : 'Ej: 140'} />
                  </label>
                  <label className="field">
                    <div className="label">Presión de trabajo</div>
                    <input inputMode="decimal" value={pwPressureWorkRaw} onChange={(e) => setPwPressureWorkRaw(e.target.value)} placeholder={pwPressureUnit === 'PSI' ? 'Ej: 1700' : 'Ej: 110'} />
                  </label>
                  <label className="field">
                    <div className="label">Unidad de caudal</div>
                    <select value={pwFlowUnit} onChange={(e) => setPwFlowUnit(e.target.value as typeof pwFlowUnit)}>
                      <option value="L_MIN">L/min</option>
                      <option value="L_H">L/h</option>
                    </select>
                  </label>
                  <label className="field">
                    <div className="label">Caudal</div>
                    <input inputMode="decimal" value={pwFlowRateRaw} onChange={(e) => setPwFlowRateRaw(e.target.value)} placeholder={pwFlowUnit === 'L_MIN' ? 'Ej: 7.5' : 'Ej: 450'} />
                  </label>
                  <label className="field">
                    <div className="label">Accionamiento</div>
                    <select value={pwDriveType} onChange={(e) => setPwDriveType(e.target.value as typeof pwDriveType)}>
                      <option value="ELECTRIC">Eléctrico</option>
                      <option value="COMBUSTION">Combustión</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </label>
                  <label className="field">
                    <div className="label">Longitud de manguera (m)</div>
                    <input inputMode="decimal" value={pwHoseLengthMRaw} onChange={(e) => setPwHoseLengthMRaw(e.target.value)} placeholder="Ej: 8" />
                  </label>
                  <label className="field">
                    <div className="label">Temp. máxima de entrada (°C)</div>
                    <input inputMode="decimal" value={pwMaxInletTempCRaw} onChange={(e) => setPwMaxInletTempCRaw(e.target.value)} placeholder="Ej: 40" />
                  </label>
                </div>
              ) : null}

              {kind === 'MACHINE' && machineSubtype === 'WATER_PUMP' ? (
                <>
                  <div className="grid3">
                    <label className="field">
                      <div className="label">Potencia (HP)</div>
                      <input inputMode="decimal" value={potenciaHpRaw} onChange={(e) => setPotenciaHpRaw(e.target.value)} placeholder="Ej: 1.0" />
                    </label>
                    <label className="field">
                      <div className="label">Succión (pulg)</div>
                      <input value={pumpInletDiameterIn} onChange={(e) => setPumpInletDiameterIn(e.target.value)} placeholder='Ej: 1"' />
                    </label>
                    <label className="field">
                      <div className="label">Descarga (pulg)</div>
                      <input value={pumpOutletDiameterIn} onChange={(e) => setPumpOutletDiameterIn(e.target.value)} placeholder='Ej: 1"' />
                    </label>
                    <label className="field">
                      <div className="label">Caudal máx (L/min)</div>
                      <input inputMode="decimal" value={pumpFlowMaxRaw} onChange={(e) => setPumpFlowMaxRaw(e.target.value)} placeholder="Ej: 80" />
                    </label>
                    <label className="field">
                      <div className="label">Altura máx (m)</div>
                      <input inputMode="decimal" value={pumpHeadMaxMRaw} onChange={(e) => setPumpHeadMaxMRaw(e.target.value)} placeholder="Ej: 22" />
                    </label>
                  </div>
                  {advancedOpen ? (
                    <div className="grid3" style={{ marginTop: 10 }}>
                      <label className="field">
                        <div className="label">Fases</div>
                        <select value={pumpPhases} onChange={(e) => setPumpPhases(e.target.value as typeof pumpPhases)}>
                          <option value="MONO">Monofásica</option>
                          <option value="TRI">Trifásica</option>
                        </select>
                      </label>
                      <label className="field">
                        <div className="label">Voltaje (V)</div>
                        <input value={pumpVoltageRaw} onChange={(e) => setPumpVoltageRaw(e.target.value)} placeholder={pumpPhases === 'MONO' ? 'Ej: 220' : 'Ej: 220/380'} />
                      </label>
                      <label className="field">
                        <div className="label">Tipo de fluido</div>
                        <select value={pumpFluidType} onChange={(e) => setPumpFluidType(e.target.value as typeof pumpFluidType)}>
                          <option value="CLEAN">Agua limpia</option>
                          <option value="DIRTY">Agua sucia</option>
                          <option value="OTHER">Otro</option>
                        </select>
                      </label>
                      <label className="field">
                        <div className="label">Paso de sólidos (mm)</div>
                        <input inputMode="decimal" value={pumpSolidPassMmRaw} onChange={(e) => setPumpSolidPassMmRaw(e.target.value)} placeholder="Ej: 30" />
                      </label>
                    </div>
                  ) : null}
                </>
              ) : null}

              {kind === 'MACHINE' && machineSubtype === 'BRUSHCUTTER' ? (
                <div className="grid3">
                  <label className="field">
                    <div className="label">Cilindrada (cc) o Voltaje (V)</div>
                    <div className="row">
                      <input inputMode="decimal" value={bcDisplacementCcRaw} onChange={(e) => setBcDisplacementCcRaw(e.target.value)} placeholder="cc (ej: 45)" />
                      <input inputMode="decimal" value={bcVoltageRaw} onChange={(e) => setBcVoltageRaw(e.target.value)} placeholder="V (ej: 36)" />
                    </div>
                  </label>
                  <label className="field">
                    <div className="label">Potencia</div>
                    <div className="row">
                      <input inputMode="decimal" value={bcPowerRaw} onChange={(e) => setBcPowerRaw(e.target.value)} placeholder="Ej: 2.2" />
                      <select value={bcPowerUnit} onChange={(e) => setBcPowerUnit(e.target.value as typeof bcPowerUnit)}>
                        <option value="HP">HP</option>
                        <option value="KW">kW</option>
                      </select>
                    </div>
                  </label>
                  <label className="field">
                    <div className="label">Diámetro de corte (mm)</div>
                    <input inputMode="decimal" value={bcCutDiameterMmRaw} onChange={(e) => setBcCutDiameterMmRaw(e.target.value)} placeholder="Ej: 420" />
                  </label>
                  <label className="field">
                    <div className="label">Herramienta de corte</div>
                    <select value={bcToolType} onChange={(e) => setBcToolType(e.target.value as typeof bcToolType)}>
                      <option value="NYLON">Nylon</option>
                      <option value="BLADE_3T">Cuchilla 3 puntas</option>
                      <option value="SAW_DISC">Disco sierra</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </label>
                  <label className="field">
                    <div className="label">Peso (kg)</div>
                    <input inputMode="decimal" value={bcWeightKgRaw} onChange={(e) => setBcWeightKgRaw(e.target.value)} placeholder="Ej: 8.2" />
                  </label>
                </div>
              ) : null}

              {kind === 'MACHINE' && machineSubtype === 'CUT_OFF_SAW' ? (
                <div className="grid3">
                  <label className="field">
                    <div className="label">Diámetro de disco</div>
                    <div className="row">
                      <input inputMode="decimal" value={cutDiscDiameterRaw} onChange={(e) => setCutDiscDiameterRaw(e.target.value)} placeholder={cutDiscUnit === 'IN' ? 'Ej: 14' : 'Ej: 350'} />
                      <select value={cutDiscUnit} onChange={(e) => setCutDiscUnit(e.target.value as typeof cutDiscUnit)}>
                        <option value="IN">pulg</option>
                        <option value="MM">mm</option>
                      </select>
                    </div>
                  </label>
                  <label className="field">
                    <div className="label">Profundidad de corte (máx)</div>
                    <input value={cutDepthMaxRaw} onChange={(e) => setCutDepthMaxRaw(e.target.value)} placeholder="Ej: 125 mm" />
                  </label>
                  <label className="field">
                    <div className="label">Potencia</div>
                    <div className="row">
                      <input inputMode="decimal" value={cutPowerRaw} onChange={(e) => setCutPowerRaw(e.target.value)} placeholder="Ej: 5.5" />
                      <select value={cutPowerUnit} onChange={(e) => setCutPowerUnit(e.target.value as typeof cutPowerUnit)}>
                        <option value="HP">HP</option>
                        <option value="KW">kW</option>
                      </select>
                    </div>
                  </label>
                  <label className="field">
                    <div className="label">Tanque de agua (L)</div>
                    <input inputMode="decimal" value={cutWaterTankLRaw} onChange={(e) => setCutWaterTankLRaw(e.target.value)} placeholder="Ej: 12" />
                  </label>
                  <label className="field">
                    <div className="label">Peso (kg)</div>
                    <input inputMode="decimal" value={cutWeightKgRaw} onChange={(e) => setCutWeightKgRaw(e.target.value)} placeholder="Ej: 10.5" />
                  </label>
                </div>
              ) : null}

              {kind === 'MACHINE' && machineSubtype === 'LAWN_MOWER' ? (
                <div className="grid3">
                  <label className="field">
                    <div className="label">Ancho de corte</div>
                    <div className="row">
                      <input inputMode="decimal" value={mowerCutWidthRaw} onChange={(e) => setMowerCutWidthRaw(e.target.value)} placeholder={mowerCutWidthUnit === 'CM' ? 'Ej: 53' : 'Ej: 21'} />
                      <select value={mowerCutWidthUnit} onChange={(e) => setMowerCutWidthUnit(e.target.value as typeof mowerCutWidthUnit)}>
                        <option value="CM">cm</option>
                        <option value="IN">pulg</option>
                      </select>
                    </div>
                  </label>
                  <label className="field">
                    <div className="label">Tracción</div>
                    <select value={mowerTraction} onChange={(e) => setMowerTraction(e.target.value as typeof mowerTraction)}>
                      <option value="MANUAL">Manual</option>
                      <option value="SELF">Autopropulsada</option>
                      <option value="VARIABLE">Velocidad variable</option>
                      <option value="HYDRO">Hidrostática</option>
                    </select>
                  </label>
                  <label className="field">
                    <div className="label">Recolector (L)</div>
                    <input inputMode="decimal" value={mowerCollectorLRaw} onChange={(e) => setMowerCollectorLRaw(e.target.value)} placeholder="Ej: 65" />
                  </label>
                  <label className="field">
                    <div className="label">Altura de corte (rango)</div>
                    <input value={mowerCutHeightRange} onChange={(e) => setMowerCutHeightRange(e.target.value)} placeholder="Ej: 20–100 mm" />
                  </label>
                  <label className="field">
                    <div className="label">Superficie recomendada (m²)</div>
                    <input inputMode="numeric" value={mowerSurfaceM2Raw} onChange={(e) => setMowerSurfaceM2Raw(e.target.value)} placeholder="Ej: 800" />
                  </label>
                </div>
              ) : null}

              {kind === 'CONSUMABLE' ? (
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

              {advancedOpen ? (
                <div className="form-subsection" style={{ marginTop: 10 }}>
                  <div className="subsection-title">Atributos extra (avanzado)</div>
                  {attributes.map((a, idx) => (
                    <div className="row" key={idx}>
                      <input value={a.key} onChange={(e) => updateAttribute(idx, { key: e.target.value })} placeholder="clave (ej: voltaje_v)" />
                      <input value={a.value} onChange={(e) => updateAttribute(idx, { value: e.target.value })} placeholder="valor (ej: 220)" />
                      <button type="button" className="secondary" onClick={() => removeAttribute(idx)}>
                        Quitar
                      </button>
                    </div>
                  ))}
                  <div className="actions">
                    <button type="button" className="secondary" onClick={addAttribute}>
                      Agregar atributo
                    </button>
                  </div>
                </div>
              ) : null}
                </div>

                {kind !== 'MACHINE' ? (
                  <div className="form-section">
                    <div className="section-head">
                      <div className="section-title">Compatibilidad (opcional)</div>
                      <div className="section-subtitle">Asocia este producto a una o más motosierras.</div>
                    </div>

                    {compatError ? <ErrorBox title="Error de búsqueda" error={compatError} /> : null}
                    <div className="field">
                      <div className="label">Buscar motosierra</div>
                      <input value={compatQ} onChange={(e) => setCompatQ(e.target.value)} placeholder="Ej: 372XP, 365, 585..." />
                      {compatLoading ? <div className="muted">Buscando…</div> : null}
                      {compatItems ? (
                        <div className="search-list search-list-small" style={{ marginTop: 8 }}>
                          {compatItems.map((it) => (
                            <button key={it.id} type="button" className="search-item" onClick={() => addCompatibleMachine(it)}>
                              <div className="search-item-title">{it.name}</div>
                              <div className="search-item-meta mono">{it.skuInternal}</div>
                            </button>
                          ))}
                          {!compatItems.length ? <div className="muted">Sin resultados</div> : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="chips">
                      {compatSelected.map((m) => (
                        <button key={m.id} type="button" className="chip" onClick={() => removeCompatibleMachine(m.id)}>
                          {m.name} <span className="mono">({m.skuInternal})</span> ×
                        </button>
                      ))}
                      {!compatSelected.length ? <div className="muted">Sin motosierras asociadas</div> : null}
                    </div>
                  </div>
                ) : null}

                <div className="form-section">
                  <div className="section-head">
                    <div className="section-title">Inventario</div>
                    <div className="section-subtitle">Marca, categoría y stock mínimo.</div>
                  </div>

                  <div className="grid3">
                    <label className="field">
                      <div className="label">Marca</div>
                      <select value={brandIdRaw} onChange={(e) => setBrandIdRaw(e.target.value)}>
                        <option value="">Seleccionar…</option>
                        {brands?.map((b) => (
                          <option key={b.id} value={String(b.id)}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <div className="label">Categoría</div>
                      <select value={categoryIdRaw} onChange={(e) => setCategoryIdRaw(e.target.value)}>
                        <option value="">Seleccionar…</option>
                        {categories?.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <div className="label">Stock mínimo</div>
                      <input inputMode="numeric" value={stockMinRaw} onChange={(e) => setStockMinRaw(e.target.value)} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="product-form-side">
                <div className="card product-form-summary">
                  <div className="card-title">Resumen</div>
                  <div className="kv">
                    <div className="kv-row">
                      <div className="kv-k">Nombre</div>
                      <div className="kv-v">{name.trim() ? name.trim() : <span className="muted">—</span>}</div>
                    </div>
                    <div className="kv-row">
                      <div className="kv-k">Tipo</div>
                      <div className="kv-v">
                        {kindLabel(kind)}
                        {kind === 'MACHINE' ? ` · ${machineSubtypeLabel(machineSubtype)}` : ''}
                      </div>
                    </div>
                    <div className="kv-row">
                      <div className="kv-k">Marca</div>
                      <div className="kv-v">{selectedBrandName ?? <span className="muted">—</span>}</div>
                    </div>
                    <div className="kv-row">
                      <div className="kv-k">Categoría</div>
                      <div className="kv-v">{selectedCategoryName ?? <span className="muted">—</span>}</div>
                    </div>
                    <div className="kv-row">
                      <div className="kv-k">Stock mín</div>
                      <div className="kv-v mono">{stockMinRaw.trim() ? stockMinRaw.trim() : '0'}</div>
                    </div>
                    {kind !== 'MACHINE' ? (
                      <div className="kv-row">
                        <div className="kv-k">Compatibilidad</div>
                        <div className="kv-v">{compatSelected.length ? `${compatSelected.length} motosierras` : <span className="muted">—</span>}</div>
                      </div>
                    ) : null}
                    <div className="kv-row">
                      <div className="kv-k">Imagen</div>
                      <div className="kv-v">{imageUrlsRaw.trim() ? 'Lista' : <span className="muted">—</span>}</div>
                    </div>
                  </div>
                </div>

                <div className="card product-form-actions">
                  <div className="card-title">Acciones</div>
                  {fieldError ? <div className="field-error">{fieldError}</div> : null}
                  <div className="actions">
                    <button type="submit" disabled={saving || bootstrappingNeeded}>
                      {saving ? 'Guardando…' : 'Crear producto'}
                    </button>
                    <button type="button" className="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
                      Cancelar
                    </button>
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>
                    Revisa el resumen antes de guardar. Si necesitas más campos, activa “Avanzado”.
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title" style={{ margin: 0 }}>
            Listado
          </div>
          <div className="row">
            <div className="muted">{items ? `${items.length} resultados` : '—'}</div>
          </div>
        </div>

        <div className="list-toolbar">
          <label className="field">
            <div className="label">Buscar</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU o nombre" />
          </label>
          <label className="field">
            <div className="label">Tipo</div>
            <select value={listKind} onChange={(e) => setListKind(e.target.value as typeof listKind)}>
              <option value="ALL">Todos</option>
              <option value="MACHINE">Maquinaria</option>
              <option value="PART">Repuesto</option>
              <option value="CONSUMABLE">Consumible</option>
              <option value="ACCESSORY">Accesorio</option>
            </select>
          </label>
          <label className="field">
            <div className="label">Stock</div>
            <select value={listStock} onChange={(e) => setListStock(e.target.value as typeof listStock)}>
              <option value="ALL">Todos</option>
              <option value="LOW">Solo stock bajo</option>
            </select>
          </label>
          <label className="field">
            <div className="label">Ordenar</div>
            <select value={listSort} onChange={(e) => setListSort(e.target.value as typeof listSort)}>
              <option value="NAME">Nombre</option>
              <option value="STOCK">Stock</option>
            </select>
          </label>
          <label className="field">
            <div className="label">Dirección</div>
            <select value={listDir} onChange={(e) => setListDir(e.target.value as typeof listDir)}>
              <option value="ASC">Asc</option>
              <option value="DESC">Desc</option>
            </select>
          </label>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <div className="label">&nbsp;</div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setQ('')
                setListKind('ALL')
                setListStock('ALL')
                setListSort('NAME')
                setListDir('ASC')
                setPage(1)
              }}
            >
              Limpiar
            </button>
          </div>
        </div>

        {loadError ? <ErrorBox error={loadError} /> : null}
        {!items ? <div className="muted">Cargando…</div> : null}
        {items ? (
          <>
            {isMobile ? (
              <div className="kv">
                {items.map((p) => (
                  <div key={p.id} className="card" style={{ padding: 12, background: 'var(--surface-2)' }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div className="mono">#{p.id}</div>
                      <div className="muted">{kindLabel(p.kind)}</div>
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 650 }}>
                      <a href={href({ name: 'product', id: p.id })}>{p.name}</a>
                    </div>
                    <div className="muted mono" style={{ marginTop: 2 }}>
                      {p.skuInternal}
                    </div>
                    <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                      <div className="muted">Stock</div>
                      <div className={p.currentStock <= p.stockMin ? 'warn mono' : 'mono'}>{p.currentStock}</div>
                    </div>
                    <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
                      <div className="muted">Mín.</div>
                      <div className="mono">{p.stockMin}</div>
                    </div>
                    <div className="actions" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                      <button type="button" className="small" onClick={() => navigate({ name: 'product', id: p.id })}>
                        Ver
                      </button>
                    </div>
                  </div>
                ))}
                {!items.length ? <div className="muted">Sin resultados</div> : null}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table table-wide">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>ID</th>
                      <th style={{ width: 170 }}>SKU interno</th>
                      <th style={{ width: 460 }}>Nombre</th>
                      <th style={{ width: 140 }}>Tipo</th>
                      <th style={{ width: 120 }}>Stock</th>
                      <th style={{ width: 120 }}>Min</th>
                      <th style={{ width: 160 }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id}>
                        <td className="mono">{p.id}</td>
                        <td className="mono">{p.skuInternal}</td>
                        <td>
                          <a href={href({ name: 'product', id: p.id })}>{p.name}</a>
                        </td>
                        <td>{kindLabel(p.kind)}</td>
                        <td className={p.currentStock <= p.stockMin ? 'warn mono' : 'mono'}>{p.currentStock}</td>
                        <td className="mono">{p.stockMin}</td>
                        <td>
                          <button type="button" className="small" onClick={() => navigate({ name: 'product', id: p.id })}>
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!items.length ? (
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
            <div className="pager">
              <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </button>
              <div className="muted">Página {page}</div>
              <button type="button" className="secondary" disabled={items.length < 20} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
