import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
let secretKey = ''
try { secretKey = secretKeysRaw ? JSON.parse(secretKeysRaw).default ?? '' : '' } catch (_) {}
secretKey = secretKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const db = createClient(SUPABASE_URL, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })

const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } })
const fail = (message: string, status = 400) => ok({ status: 'error', message }, status)
const clean = (v: unknown) => String(v ?? '').trim()
const statusMap = (v: unknown) => {
  const s = clean(v)
  if (['ปกติ','ปกติ/พร้อมใช้งาน','พร้อมใช้งาน','พร้อมใช้'].includes(s)) return 'ปกติ'
  if (['ถูกยืม','ถูกยืมใช้งาน','ถูกยืมภายใน'].includes(s)) return 'ถูกยืม'
  if (['ชำรุดส่งซ่อม','อยู่ระหว่างซ่อม'].includes(s)) return 'ชำรุดส่งซ่อม'
  if (s === 'รอจำหน่าย') return 'รอจำหน่าย'
  if (['แทงจำหน่าย','จำหน่าย'].includes(s)) return 'แทงจำหน่าย'
  return s || 'ปกติ'
}
const isoOrNull = (v: unknown) => {
  const s = clean(v); if (!s) return null
  const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const PAGE_SIZE = 1000

async function fetchAllRows<T = any>(buildQuery: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery(from, to)
    if (error) throw error
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

function toApiItem(r: any) {
  return {
    'RMC No': r.rmc_no,
    'เลขครุภัณฑ์': r.item_id,
    'ชื่อครุภัณฑ์': r.name,
    'ยี่ห้อ': r.brand,
    'ชื่อรุ่น': r.model,
    'ประเภทครุภัณฑ์': r.type,
    'ประเภทเครื่องมือ': r.tool_type,
    'หน่วยงาน': r.owner_ward,
    'ใช้งานที่': r.usage_ward,
    'ตำแหน่งย่อย (Sub-location)': r.sub_location,
    'RISK LEVEL': r.risk_level,
    'ความถี่การตรวจนับ (เดือน)': r.inspection_frequency,
    'สถานะ': r.status,
    'URL รูปภาพปก': r.image_url,
    'วันที่ตรวจล่าสุด': r.last_inspection_date,
    'รายละเอียดครุภัณฑ์': r.detail_link,
    _rmcNo: r.rmc_no,
    _ownerWard: r.owner_ward,
    _usageWard: r.usage_ward,
  }
}

async function findItem(itemId?: unknown, rmcNo?: unknown) {
  const id = clean(itemId), rmc = clean(rmcNo)
  if (rmc) {
    const { data, error } = await db.from('equipment_items').select('*').eq('rmc_no', rmc).maybeSingle()
    if (error) throw error
    if (data) return data
  }
  if (id) {
    const { data, error } = await db.from('equipment_items').select('*').eq('item_id', id).limit(2)
    if (error) throw error
    if (data?.length === 1) return data[0]
    if (data?.length > 1) throw new Error('พบเลขครุภัณฑ์ซ้ำหลายรายการ กรุณาระบุ RMC No')
  }
  return null
}

async function listItems(ward = '') {
  const w = clean(ward)
  const rows = await fetchAllRows<any>((from, to) => {
    let q = db.from('equipment_items').select('*').order('seq', { ascending: true }).range(from, to)
    if (w) q = q.or(`owner_ward.eq.${w},usage_ward.eq.${w}`)
    return q
  })
  return rows.map(toApiItem)
}

async function latestHistory(item: any, params: any) {
  const keys = [clean(params.itemId), clean(params.originalItemId), clean(item?.item_id), clean(item?.rmc_no)].filter(Boolean)
  let rows: any[] = []
  for (const key of keys) {
    const { data, error } = await db.from('equipment_history').select('*').eq('item_id', key).order('ts', { ascending: false }).limit(1)
    if (error) throw error
    if (data?.length) { rows = data; break }
  }
  const h = rows[0]
  if (!h) return null
  return { timestamp: h.ts, itemId: h.item_id, inspectorName: h.inspector_name, ward: h.ward, status: h.status, note: h.note, imageUrl: h.image_url, rowNumber: h.id }
}

async function inspectionWindowStatus() {
  const { data, error } = await db.from('equipment_inspection_windows').select('*').order('open_date', { ascending: false })
  if (error) throw error
  const now = new Date()
  const windows = (data ?? []).map(w => ({ periodKey: w.period_key, targetYear: Number(w.target_year), targetMonth: Number(w.target_month), openDate: w.open_date, closeDate: w.close_date }))
  const current = windows.find(w => new Date(w.openDate) <= now && now <= new Date(w.closeDate)) ?? null
  return { isOpen: !!current, currentWindow: current, windows }
}

async function departmentReport(fiscalYear: unknown) {
  const fy = Number(fiscalYear) || new Date().getFullYear() + 543
  const startYear = fy - 543
  const startDate = new Date(Date.UTC(startYear - 1, 9, 1))
  const endDate = new Date(Date.UTC(startYear, 9, 1))
  const months = Array.from({ length: 12 }, (_, i) => ({ y: i < 3 ? startYear - 1 : startYear, m: (9 + i) % 12 }))

  const items = await fetchAllRows<any>((from, to) => db.from('equipment_items').select('rmc_no,item_id,owner_ward,usage_ward,inspection_frequency').order('seq', { ascending: true }).range(from, to))
  const history = await fetchAllRows<any>((from, to) => db.from('equipment_history').select('id,item_id,ts,status,ward').gte('ts', startDate.toISOString()).lt('ts', endDate.toISOString()).order('id', { ascending: true }).range(from, to))

  const departments = [...new Set((items ?? []).map(x => clean(x.owner_ward || x.usage_ward)).filter(Boolean))].sort()
  const rows = departments.map(department => {
    const deptItems = (items ?? []).filter(x => clean(x.owner_ward || x.usage_ward) === department)
    const total = deptItems.length
    const idToCanonical = new Map<string, string>()
    for (const item of deptItems) {
      const canonical = clean(item.item_id) || clean(item.rmc_no)
      if (!canonical) continue
      for (const key of [clean(item.item_id), clean(item.rmc_no)].filter(Boolean)) idToCanonical.set(key, canonical)
    }

    const monthRows = months.map(({ y, m }) => {
      const seen = new Set<string>()
      for (const h of history ?? []) {
        const d = new Date(h.ts)
        if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m) continue
        const canonical = idToCanonical.get(clean(h.item_id))
        if (canonical) seen.add(canonical)
      }
      const inspected = Math.min(seen.size, total)
      // ปัจจุบันฐานข้อมูลไม่มีตารางกำหนดเดือนเฉพาะรายครุภัณฑ์
      // จึงถือว่าหน่วยงานที่มีครุภัณฑ์มีรอบตรวจในทุกเดือนของปีงบประมาณ
      // และ "ทำครบ" หมายถึงตรวจได้ครบจำนวนครุภัณฑ์ของหน่วยงานในเดือนนั้น
      const due = total
      return { display: `${inspected}/${total}`, inspected, total, due }
    })

    const completedMonths = monthRows.filter(x => x.due > 0 && x.inspected >= x.due).length
    const requiredMonths = monthRows.filter(x => x.due > 0).length
    const totalRequired = monthRows.reduce((s, x) => s + x.due, 0)
    const totalInspected = monthRows.reduce((s, x) => s + x.inspected, 0)
    return {
      department,
      months: monthRows,
      total,
      inspected: Math.min(total, Math.max(...monthRows.map(x => x.inspected), 0)),
      percentage: totalRequired ? (totalInspected / totalRequired) * 100 : 0,
      requiredMonths,
      completedMonths,
    }
  })

  return { fiscalYear: fy, rows, generatedAt: new Date().toISOString(), dataCounts: { equipmentItems: items.length, equipmentHistory: history.length } }
}

async function handleGet(req: Request) {
  const url = new URL(req.url), action = clean(url.searchParams.get('action'))
  if (action === 'getApiInfo') return ok({ status: 'success', data: { version: '2026-09-11-report-pagination-mou-fix', backend: 'Supabase' } })
  if (action === 'getAllItems') return ok({ status: 'success', data: await listItems() })
  if (action === 'getItemsByWard') return ok({ status: 'success', data: await listItems(url.searchParams.get('ward') ?? '') })
  if (action === 'getInspectionWindowStatus') return ok({ status: 'success', data: await inspectionWindowStatus() })
  if (action === 'getDepartmentSummaryReport') return ok({ status: 'success', data: await departmentReport(url.searchParams.get('fiscalYear')) })
  if (action === 'getLatestInspectionRecord') {
    const item = await findItem(url.searchParams.get('itemId'), url.searchParams.get('rmcNo'))
    if (!item) return fail('ไม่พบครุภัณฑ์ที่ต้องการ')
    const record = await latestHistory(item, Object.fromEntries(url.searchParams.entries()))
    return record ? ok({ status: 'success', data: { inspectionRecord: record } }) : fail('ไม่พบบันทึกการตรวจล่าสุด', 404)
  }
  return fail('ไม่รู้จัก action: ' + action, 404)
}

async function handlePost(req: Request) {
  const data = await req.json(), action = clean(data.action)
  if (action === 'getApiInfo') return ok({ status: 'success', data: { version: '2026-09-11-report-pagination-mou-fix', backend: 'Supabase' } })

  if (action === 'saveInspectionWindow') {
    const y = Number(data.targetYear), m = Number(data.targetMonth)
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return fail('ปีหรือเดือนไม่ถูกต้อง')
    const periodKey = `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-01 00:00:00`
    const row = { period_key: periodKey, target_year: y, target_month: m, open_date: isoOrNull(data.openDate), close_date: isoOrNull(data.closeDate), updated_at: new Date().toISOString() }
    const { data: saved, error } = await db.from('equipment_inspection_windows').upsert(row, { onConflict: 'period_key' }).select().single()
    if (error) throw error
    return ok({ status: 'success', data: saved })
  }

  if (action === 'addEquipment') {
    const x = data.itemData || {}, rmc = clean(x.rmcNo) || clean(x.itemId)
    if (!rmc || !clean(x.itemId) || !clean(x.name)) return fail('กรุณากรอก RMC No/เลขครุภัณฑ์ และชื่อครุภัณฑ์')
    const row = { rmc_no: rmc, item_id: clean(x.itemId) || null, name: clean(x.name), brand: clean(x.brand), model: clean(x.model), type: clean(x.type), tool_type: clean(x.toolType), owner_ward: clean(x.ownerWard), usage_ward: clean(x.ownerWard), sub_location: clean(x.subLoc), risk_level: clean(x.riskLevel) || 'Low', purchase_price: x.purchasePrice === '' ? null : Number(x.purchasePrice) || null, inspection_frequency: Number(x.freq) || 1, status: 'ปกติ' }
    const { data: saved, error } = await db.from('equipment_items').insert(row).select().single()
    if (error) throw error
    return ok({ status: 'success', data: { updatedItem: toApiItem(saved) } })
  }

  if (action === 'editEquipment') {
    const x = data.itemData || {}, old = await findItem(data.oldItemId, x.rmcNo)
    if (!old) return fail('ไม่พบครุภัณฑ์ที่ต้องการแก้ไข', 404)
    const row = { rmc_no: clean(x.rmcNo) || old.rmc_no, item_id: clean(x.itemId) || null, name: clean(x.name), brand: clean(x.brand), model: clean(x.model), type: clean(x.type), tool_type: clean(x.toolType), owner_ward: clean(x.ownerWard), usage_ward: old.usage_ward || clean(x.ownerWard), sub_location: clean(x.subLoc), risk_level: clean(x.riskLevel) || old.risk_level, inspection_frequency: Number(x.freq) || 1 }
    if (row.rmc_no !== old.rmc_no) {
      const { error: de } = await db.from('equipment_items').delete().eq('rmc_no', old.rmc_no); if (de) throw de
      const { data: saved, error } = await db.from('equipment_items').insert({ ...row, status: old.status, last_inspection_date: old.last_inspection_date, image_url: old.image_url, detail_link: old.detail_link, seq: old.seq }).select().single(); if (error) throw error
      return ok({ status: 'success', data: { updatedItem: toApiItem(saved) } })
    }
    const { data: saved, error } = await db.from('equipment_items').update(row).eq('rmc_no', old.rmc_no).select().single(); if (error) throw error
    return ok({ status: 'success', data: { updatedItem: toApiItem(saved) } })
  }

  if (action === 'deleteEquipment') {
    const item = await findItem(data.itemId, data.rmcNo); if (!item) return fail('ไม่พบครุภัณฑ์ที่ต้องการลบ', 404)
    const { error } = await db.from('equipment_items').delete().eq('rmc_no', item.rmc_no); if (error) throw error
    return ok({ status: 'success' })
  }

  if (action === 'pullEquipment') {
    const item = await findItem(data.itemId, data.rmcNo || data.originalItemId); if (!item) return fail('ไม่พบครุภัณฑ์ที่ต้องการย้าย', 404)
    const newWard = clean(data.newWard); if (!newWard) return fail('ไม่พบหน่วยงานปลายทาง')
    const now = new Date().toISOString()
    const { data: updated, error: ue } = await db.from('equipment_items').update({ usage_ward: newWard, status: 'ปกติ', last_inspection_date: now }).eq('rmc_no', item.rmc_no).select().single(); if (ue) throw ue
    const { error: he } = await db.from('equipment_history').insert({ ts: now, item_id: item.item_id || item.rmc_no, inspector_name: clean(data.inspectorName) || 'ระบบ', ward: newWard, status: 'ย้ายหน่วยงาน', note: clean(data.note) || `ย้ายหน่วยงานไป ${newWard}` }); if (he) throw he
    return ok({ status: 'success', data: { updatedItem: toApiItem(updated) } })
  }

  if (action === 'updateStatus' || action === 'editInspectionRecord') {
    const item = await findItem(data.itemId, data.rmcNo || data.originalItemId); if (!item) return fail('ไม่พบครุภัณฑ์ที่ต้องการบันทึก', 404)
    const now = new Date().toISOString(), newStatus = statusMap(data.status), newWard = clean(data.borrowedWard)
    const update = { status: newStatus, last_inspection_date: now, sub_location: clean(data.subLocation) || item.sub_location, usage_ward: (newStatus === 'ถูกยืม' || newStatus === 'ย้ายหน่วยงาน') && newWard ? newWard : item.usage_ward }
    if (action === 'editInspectionRecord' && data.historyRowNumber) {
      const historyId = Number(data.historyRowNumber)
      if (Number.isFinite(historyId)) {
        const { data: h, error } = await db.from('equipment_history').update({ ts: now, inspector_name: clean(data.inspectorName), ward: clean(data.ward) || item.usage_ward || item.owner_ward, status: newStatus, note: clean(data.note), image_url: clean(data.existingImageUrl) || null }).eq('id', historyId).select().maybeSingle(); if (error) throw error; if (!h) return fail('ไม่พบบันทึกการตรวจที่ต้องการแก้ไข', 404)
      }
    } else {
      const { error } = await db.from('equipment_history').insert({ ts: now, item_id: item.item_id || item.rmc_no, inspector_name: clean(data.inspectorName) || clean(data.inspector) || '', ward: clean(data.ward) || clean(data.borrowedWard) || item.usage_ward || item.owner_ward || '', status: newStatus, note: clean(data.note), image_url: clean(data.existingImageUrl) || null }); if (error) throw error
    }
    const { data: saved, error: se } = await db.from('equipment_items').update(update).eq('rmc_no', item.rmc_no).select().single(); if (se) throw se
    return ok({ status: 'success', data: { updatedItem: toApiItem(saved) } })
  }

  return fail('ไม่รู้จัก action: ' + action, 404)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try { return req.method === 'GET' ? await handleGet(req) : await handlePost(req) }
  catch (e) { console.error(e); return fail(e instanceof Error ? e.message : String(e), 500) }
})