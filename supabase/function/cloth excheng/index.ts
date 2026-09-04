// Supabase Edge Function: cloth-exchange
// Replaces the legacy Google Apps Script (EXCHANGE_API) backend for the "cloth exchange" module (cloth-exchange.html).
// Supports every legacy action, with responses shaped as { status: 'success'|'error', message, data }

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_VERSION = "2026.09.03.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function ok(data: unknown, message = "") {
  return jsonResponse({ status: "success", message, data });
}

function fail(message: string, status = 400) {
  return jsonResponse({ status: "error", message }, status);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------- Mappers: DB row (snake_case) -> Front-end shape (camelCase) ----------

function mapClothMaster(row: any) {
  return { itemName: row.item_name, mainCategory: row.main_category, parLevel: row.par_level };
}

function mapRequestHeader(row: any) {
  return {
    requestId: row.id,
    requestNo: row.request_no,
    requestDate: row.request_date,
    ward: row.ward,
    shift: row.shift,
    status: row.status,
    requesterName: row.requester_signature,
    submittedAt: row.submitted_at,
    laundryReceiverName: row.laundry_receiver_name,
    laundryReceivedAt: row.laundry_received_at,
    laundryIssuerName: row.laundry_issuer_name,
    laundryIssuedAt: row.laundry_issued_at,
    wardReceiverName: row.ward_receiver_name,
    wardReceivedAt: row.ward_received_at,
    lastUpdatedAt: row.last_updated_at,
    lastUpdatedBy: row.last_updated_by,
  };
}

function mapRequestLine(row: any) {
  return {
    rowId: row.id,
    lineNo: row.line_no,
    itemName: row.cloth_item,
    mainCategory: row.main_category,
    parLevel: row.par_level,
    stockBalance: row.stock_balance,
    sentLaundryQty: row.sent_laundry_qty,
    suggestedQty: row.suggested_qty,
    requestedQty: row.requested_qty,
    wardNote: row.ward_note,
    laundryReceivedQty: row.laundry_received_qty,
    issuedQty: row.issued_qty,
    outstandingQty: row.outstanding_qty,
    laundryNote: row.laundry_note,
  };
}

function mapStockRequest(row: any) {
  return {
    requestId: row.id,
    ward: row.ward,
    itemName: row.item_name,
    mainCategory: row.main_category,
    currentPar: row.current_par,
    requestedPar: row.requested_par,
    reason: row.reason,
    requestType: row.request_type,
    status: row.status,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// FIX (2026-09-03): getWardExchangeRequests / getLaundryExchangeRequests used to
// omit totalRequested/totalIssued/totalOutstanding on each request header
// (unlike the old GAS backend, which always included them). This forced the
// frontend (enrichRequestsWithTotals in cloth-exchange.html) to call
// action=getExchangeRequestDetail separately for EVERY row it loaded (N+1),
// and the laundry/admin pages auto-refresh every 30s on top of that -> a huge
// burst of repeated requests (14,000+ calls/day observed in real logs) that
// made the page hang ("system stuck loading"), especially as request volume grew.
//
// Fix: compute totals for all requests with a single aggregation query
// (group by request_id) and attach them to every header before responding,
// so the frontend never needs to call the detail endpoint per row again.
//
// FIX round 2 (2026-09-04 01:53 UTC): the first version used
// .in("request_id", ids) with all 2,400+ request ids crammed into one query,
// which made PostgREST build a URL that was too long and returned
// "Bad Request" (visible in the function logs at the exact times the 500s
// occurred) -> switched to reading exchange_request_lines in full (or joined
// and filtered by ward for a single ward) and aggregating in code instead,
// so no id list is ever sent via the query string.
//
// FIX round 3 (2026-09-04 02:05 UTC): round 2 didn't error, but
// totalRequested/Issued/Outstanding came back as 0 for every request. Cause:
// exchange_request_lines has ~15,800 rows, but PostgREST/Supabase caps rows
// returned per request at 1,000 by default, silently, with no error. An
// unranged select() therefore only ever read the first 1,000 rows, so totals
// were missing for most requests -> fixed by paginating through all rows in
// chunks of 1,000 via .range() before aggregating.
// ---------------------------------------------------------------------------
const LINES_PAGE_SIZE = 1000;

async function fetchLineTotalsByRequestId(ward?: string) {
  const totalsByRequestId = new Map<string, { totalRequested: number; totalIssued: number; totalOutstanding: number }>();

  let from = 0;
  for (;;) {
    let query = supabase
      .from("exchange_request_lines")
      .select(
        ward
          ? "request_id, requested_qty, issued_qty, outstanding_qty, exchange_requests!inner(ward)"
          : "request_id, requested_qty, issued_qty, outstanding_qty",
      )
      .range(from, from + LINES_PAGE_SIZE - 1);
    if (ward) query = query.eq("exchange_requests.ward", ward);

    const { data, error } = await query;
    if (error) throw error;

    for (const line of data || []) {
      const current = totalsByRequestId.get(line.request_id) || {
        totalRequested: 0,
        totalIssued: 0,
        totalOutstanding: 0,
      };
      current.totalRequested += Number(line.requested_qty) || 0;
      current.totalIssued += Number(line.issued_qty) || 0;
      current.totalOutstanding += Number(line.outstanding_qty) || 0;
      totalsByRequestId.set(line.request_id, current);
    }

    if (!data || data.length < LINES_PAGE_SIZE) break;
    from += LINES_PAGE_SIZE;
  }

  return totalsByRequestId;
}

async function attachRequestTotals(headers: any[], ward?: string) {
  if (headers.length === 0) return headers;

  const totalsByRequestId = await fetchLineTotalsByRequestId(ward);

  return headers.map((h) => ({
    ...h,
    ...(totalsByRequestId.get(h.requestId) || { totalRequested: 0, totalIssued: 0, totalOutstanding: 0 }),
  }));
}

async function nextRequestNo(requestDate: string): Promise<string> {
  const ymd = (requestDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const prefix = `CL-REQ-${ymd}-`;
  const { count } = await supabase
    .from("exchange_requests")
    .select("id", { count: "exact", head: true })
    .like("request_no", `${prefix}%`);
  const seq = String((count || 0) + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

async function logStatus(
  requestId: string,
  requestNo: string,
  fromStatus: string | null,
  toStatus: string,
  actorWard: string | null,
  actorName: string | null,
  action: string,
  note?: string,
) {
  await supabase.from("exchange_status_log").insert({
    request_id: requestId,
    request_no: requestNo,
    from_status: fromStatus,
    to_status: toStatus,
    actor_ward: actorWard,
    actor_name: actorName,
    action,
    note: note || null,
  });
}

// ---------- Action handlers: READ ----------

async function getAppMeta() {
  const { data: wards, error } = await supabase
    .from("ward_settings")
    .select("ward, bed_count, is_active")
    .order("ward");
  if (error) throw error;
  return {
    version: APP_VERSION,
    wards: (wards || []).map((w: any) => ({ ward: w.ward, bedCount: w.bed_count, isActive: w.is_active })),
  };
}

async function getExchangeMaster(ward: string) {
  const { data, error } = await supabase
    .from("cloth_master")
    .select("*")
    .eq("ward", ward)
    .eq("is_active", true)
    .order("main_category")
    .order("item_name");
  if (error) throw error;
  return (data || []).map(mapClothMaster);
}

async function getGlobalClothMaster() {
  const { data, error } = await supabase
    .from("cloth_master")
    .select("item_name, main_category")
    .eq("is_active", true)
    .order("main_category")
    .order("item_name");
  if (error) throw error;
  const seen = new Set<string>();
  const result: any[] = [];
  for (const row of data || []) {
    if (seen.has(row.item_name)) continue;
    seen.add(row.item_name);
    result.push({ itemName: row.item_name, mainCategory: row.main_category });
  }
  return result;
}

async function getWardExchangeRequests(ward: string) {
  const { data, error } = await supabase
    .from("exchange_requests")
    .select("*")
    .eq("ward", ward)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachRequestTotals((data || []).map(mapRequestHeader), ward);
}

async function getLaundryExchangeRequests() {
  const { data, error } = await supabase
    .from("exchange_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachRequestTotals((data || []).map(mapRequestHeader));
}

async function getStockRequests(ward: string | null) {
  let query = supabase.from("stock_requests").select("*").order("requested_at", { ascending: false });
  if (ward) query = query.eq("ward", ward);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapStockRequest);
}

async function getWardStockReport(ward: string | null) {
  let wardQuery = supabase.from("ward_settings").select("ward, bed_count").order("ward");
  if (ward) wardQuery = wardQuery.eq("ward", ward);
  const { data: wards, error: wardErr } = await wardQuery;
  if (wardErr) throw wardErr;

  const results = [];
  for (const w of wards || []) {
    const { data: masterItems, error: masterErr } = await supabase
      .from("cloth_master")
      .select("item_name, main_category, par_level")
      .eq("ward", w.ward)
      .eq("is_active", true);
    if (masterErr) throw masterErr;

    const { data: lines, error: lineErr } = await supabase
      .from("exchange_request_lines")
      .select("cloth_item, main_category, stock_balance, requested_qty, issued_qty, outstanding_qty, request_id, exchange_requests!inner(ward, created_at)")
      .eq("exchange_requests.ward", w.ward)
      .order("exchange_requests(created_at)", { ascending: false });
    if (lineErr) throw lineErr;

    const items = (masterItems || []).map((m: any) => {
      const itemLines = (lines || []).filter((l: any) => l.cloth_item === m.item_name);
      const latest = itemLines[0];
      const totalRequested = itemLines.reduce((s: number, l: any) => s + (Number(l.requested_qty) || 0), 0);
      const totalIssued = itemLines.reduce((s: number, l: any) => s + (Number(l.issued_qty) || 0), 0);
      const totalOutstanding = itemLines.reduce((s: number, l: any) => s + (Number(l.outstanding_qty) || 0), 0);
      return {
        itemName: m.item_name,
        mainCategory: m.main_category,
        parLevel: m.par_level,
        totalStock: latest ? latest.stock_balance : null,
        totalRequested,
        totalIssued,
        totalOutstanding,
      };
    });

    results.push({ ward: w.ward, bedCount: w.bed_count, items });
  }

  return ward ? (results[0] || null) : results;
}

async function getExchangeRequestDetail(requestId: string) {
  const { data: header, error: headerErr } = await supabase
    .from("exchange_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (headerErr) throw headerErr;

  const { data: lines, error: lineErr } = await supabase
    .from("exchange_request_lines")
    .select("*")
    .eq("request_id", requestId)
    .order("line_no");
  if (lineErr) throw lineErr;

  return { header: mapRequestHeader(header), lines: (lines || []).map(mapRequestLine) };
}

// ---------- Action handlers: WRITE ----------

async function submitExchangeRequest(body: any) {
  const { ward, requestDate, shift, requesterName, lines } = body;
  if (!ward || !requestDate || !shift || !requesterName || !Array.isArray(lines)) {
    throw new Error("ข้อมูลไม่ครบสำหรับสร้างใบเบิก");
  }
  const requestNo = await nextRequestNo(requestDate);
  const now = new Date().toISOString();

  const { data: header, error: headerErr } = await supabase
    .from("exchange_requests")
    .insert({
      request_no: requestNo,
      request_date: requestDate,
      ward,
      shift,
      status: "submitted",
      requester_name: requesterName,
      requester_signature: requesterName,
      submitted_at: now,
      last_updated_at: now,
      last_updated_by: requesterName,
    })
    .select()
    .single();
  if (headerErr) throw headerErr;

  const lineRows = lines
    .filter((l: any) => Number(l.requestedQty) > 0)
    .map((l: any, idx: number) => ({
      request_id: header.id,
      line_no: idx + 1,
      cloth_item: l.itemName,
      main_category: l.mainCategory,
      par_level: l.parLevel,
      stock_balance: l.stockBalance,
      sent_laundry_qty: l.sentLaundryQty,
      suggested_qty: l.suggestedQty,
      requested_qty: l.requestedQty,
      ward_note: l.wardNote || null,
    }));
  if (lineRows.length > 0) {
    const { error: lineErr } = await supabase.from("exchange_request_lines").insert(lineRows);
    if (lineErr) throw lineErr;
  }

  await logStatus(header.id, requestNo, null, "submitted", ward, requesterName, "submit_request");

  return { requestId: header.id, requestNo };
}

async function updateExchangeRequest(body: any) {
  const { requestId, ward, requestDate, shift, requesterName, lines } = body;
  if (!requestId) throw new Error("ไม่พบ requestId");

  const { data: existing, error: getErr } = await supabase
    .from("exchange_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (getErr) throw getErr;
  if (existing.status !== "submitted") {
    throw new Error("ไม่สามารถแก้ไขใบเบิกที่ถูกดำเนินการแล้วได้");
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("exchange_requests")
    .update({
      ward,
      request_date: requestDate,
      shift,
      requester_name: requesterName,
      requester_signature: requesterName,
      last_updated_at: now,
      last_updated_by: requesterName,
    })
    .eq("id", requestId);
  if (updateErr) throw updateErr;

  await supabase.from("exchange_request_lines").delete().eq("request_id", requestId);
  const lineRows = (lines || [])
    .filter((l: any) => Number(l.requestedQty) > 0 || Number(l.stockBalance) > 0 || Number(l.sentLaundryQty) > 0 || l.wardNote)
    .map((l: any, idx: number) => ({
      request_id: requestId,
      line_no: idx + 1,
      cloth_item: l.itemName,
      main_category: l.mainCategory,
      par_level: l.parLevel,
      stock_balance: l.stockBalance,
      sent_laundry_qty: l.sentLaundryQty,
      suggested_qty: l.suggestedQty,
      requested_qty: l.requestedQty,
      ward_note: l.wardNote || null,
    }));
  if (lineRows.length > 0) {
    const { error: lineErr } = await supabase.from("exchange_request_lines").insert(lineRows);
    if (lineErr) throw lineErr;
  }

  await logStatus(requestId, existing.request_no, existing.status, existing.status, ward, requesterName, "update_request");

  return { requestId, requestNo: existing.request_no };
}

async function receiveExchangeRequest(body: any) {
  const { requestId, receiverName, note } = body;
  if (!requestId || !receiverName) throw new Error("ข้อมูลไม่ครบสำหรับลงรับใบเบิก");

  const { data: existing, error: getErr } = await supabase
    .from("exchange_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (getErr) throw getErr;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("exchange_requests")
    .update({
      status: "received",
      laundry_receiver_name: receiverName,
      laundry_received_at: now,
      last_updated_at: now,
      last_updated_by: receiverName,
    })
    .eq("id", requestId);
  if (error) throw error;

  await logStatus(requestId, existing.request_no, existing.status, "received", null, receiverName, "receive_request", note);
  return { requestId, requestNo: existing.request_no };
}

async function issueExchangeRequest(body: any) {
  const { requestId, issuerName, note, lines } = body;
  if (!requestId || !issuerName || !Array.isArray(lines)) throw new Error("ข้อมูลไม่ครบสำหรับบันทึกการจ่ายผ้า");

  const { data: existing, error: getErr } = await supabase
    .from("exchange_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (getErr) throw getErr;

  let anyOutstanding = false;
  for (const l of lines) {
    const outstanding = Math.max(Number(l.requestedQty || 0) - Number(l.issuedQty || 0), 0);
    if (outstanding > 0) anyOutstanding = true;
    const { error } = await supabase
      .from("exchange_request_lines")
      .update({
        laundry_received_qty: l.receivedQty,
        issued_qty: l.issuedQty,
        outstanding_qty: outstanding,
        laundry_note: l.laundryNote || null,
      })
      .eq("request_id", requestId)
      .eq("line_no", l.lineNo);
    if (error) throw error;
  }

  const newStatus = anyOutstanding ? "partial_issued" : "issued_waiting_receipt";
  const now = new Date().toISOString();
  const { error: headerErr } = await supabase
    .from("exchange_requests")
    .update({
      status: newStatus,
      laundry_issuer_name: issuerName,
      laundry_issued_at: now,
      last_updated_at: now,
      last_updated_by: issuerName,
    })
    .eq("id", requestId);
  if (headerErr) throw headerErr;

  await logStatus(requestId, existing.request_no, existing.status, newStatus, null, issuerName, "issue_request", note);
  return { requestId, requestNo: existing.request_no, status: newStatus };
}

async function confirmExchangeReceipt(body: any) {
  const { requestId, receiverName, note } = body;
  if (!requestId || !receiverName) throw new Error("ข้อมูลไม่ครบสำหรับลงรับผ้า");

  const { data: existing, error: getErr } = await supabase
    .from("exchange_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (getErr) throw getErr;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("exchange_requests")
    .update({
      status: "completed",
      ward_receiver_name: receiverName,
      ward_received_at: now,
      last_updated_at: now,
      last_updated_by: receiverName,
    })
    .eq("id", requestId);
  if (error) throw error;

  await logStatus(requestId, existing.request_no, existing.status, "completed", existing.ward, receiverName, "confirm_receipt", note);
  return { requestId, requestNo: existing.request_no };
}

async function processStockRequest(body: any) {
  const { requestId, decision, adminName } = body;
  if (!requestId || !decision || !adminName) throw new Error("ข้อมูลไม่ครบสำหรับดำเนินการคำขอ");

  const { data: existing, error: getErr } = await supabase
    .from("stock_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (getErr) throw getErr;

  const newStatus = decision === "approve" ? "approved" : "rejected";
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("stock_requests")
    .update({ status: newStatus, approved_by: adminName, approved_at: now, updated_at: now })
    .eq("id", requestId);
  if (error) throw error;

  if (newStatus === "approved") {
    await supabase.from("cloth_master").upsert(
      {
        ward: existing.ward,
        item_name: existing.item_name,
        main_category: existing.main_category,
        par_level: existing.requested_par,
        is_active: true,
      },
      { onConflict: "ward,item_name" },
    );
  }

  return { requestId, status: newStatus };
}

async function updateWardStockLevels(body: any) {
  const { ward, items } = body;
  if (!ward || !Array.isArray(items)) throw new Error("ข้อมูลไม่ครบสำหรับบันทึก STOCK หน่วยงาน");

  const rows = items.map((it: any) => ({
    ward,
    item_name: it.itemName,
    main_category: it.mainCategory,
    par_level: it.parLevel,
    is_active: true,
  }));
  const { error } = await supabase.from("cloth_master").upsert(rows, { onConflict: "ward,item_name" });
  if (error) throw error;

  return { ward, updated: rows.length };
}

async function submitStockRequest(body: any) {
  const { ward, reason, items } = body;
  if (!ward || !reason || !Array.isArray(items) || items.length === 0) {
    throw new Error("ข้อมูลไม่ครบสำหรับส่งคำขอปรับปรุง STOCK");
  }

  const rows = items.map((it: any) => ({
    ward,
    item_name: it.itemName,
    main_category: it.mainCategory,
    current_par: it.currentPar,
    requested_par: it.requestedPar,
    request_type: it.requestType,
    reason,
    status: "pending",
  }));
  const { data, error } = await supabase.from("stock_requests").insert(rows).select();
  if (error) throw error;

  return { created: (data || []).length };
}

// ---------- Router ----------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const action = url.searchParams.get("action");
      switch (action) {
        case "getAppMeta":
          return ok(await getAppMeta());
        case "getExchangeMaster":
          return ok(await getExchangeMaster(url.searchParams.get("ward") || ""));
        case "getGlobalClothMaster":
          return ok(await getGlobalClothMaster());
        case "getWardExchangeRequests":
          return ok(await getWardExchangeRequests(url.searchParams.get("ward") || ""));
        case "getStockRequests":
          return ok(await getStockRequests(url.searchParams.get("ward")));
        case "getWardStockReport":
          return ok(await getWardStockReport(url.searchParams.get("ward")));
        case "getLaundryExchangeRequests":
          return ok(await getLaundryExchangeRequests());
        case "getExchangeRequestDetail":
          return ok(await getExchangeRequestDetail(url.searchParams.get("requestId") || ""));
        default:
          return fail(`ไม่รู้จัก action: ${action}`, 404);
      }
    }

    if (req.method === "POST") {
      const body = await req.json();
      switch (body.action) {
        case "submitExchangeRequest":
          return ok(await submitExchangeRequest(body), "สร้างใบเบิกสำเร็จ");
        case "updateExchangeRequest":
          return ok(await updateExchangeRequest(body), "บันทึกการแก้ไขสำเร็จ");
        case "receiveExchangeRequest":
          return ok(await receiveExchangeRequest(body), "ลงรับใบเบิกสำเร็จ");
        case "issueExchangeRequest":
          return ok(await issueExchangeRequest(body), "บันทึกการจ่ายผ้าสำเร็จ");
        case "confirmExchangeReceipt":
          return ok(await confirmExchangeReceipt(body), "ลงรับผ้าสำเร็จ");
        case "processStockRequest":
          return ok(await processStockRequest(body), "ดำเนินการคำขอสำเร็จ");
        case "updateWardStockLevels":
          return ok(await updateWardStockLevels(body), "บันทึก STOCK สำเร็จ");
        case "submitStockRequest":
          return ok(await submitStockRequest(body), "ส่งคำขอปรับปรุง STOCK สำเร็จ");
        default:
          return fail(`ไม่รู้จัก action: ${body.action}`, 404);
      }
    }

    return fail("Method not allowed", 405);
  } catch (err) {
    console.error(err);
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
});
