import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_VERSION = "2026.09.04.1";

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

// ---------- Mappers ----------

function mapRequestHeader(row: any) {
  return {
    requestId: row.id,
    requestNo: row.request_no,
    requestDate: row.request_date,
    ward: row.ward,
    shift: row.shift,
    status: row.status,
    requesterName: row.requester_name,
    submittedAt: row.submitted_at,
    adminReceiverName: row.admin_receiver_name,
    adminReceivedAt: row.admin_received_at,
    adminCountedAt: row.admin_counted_at,
    adminIssuerName: row.admin_issuer_name,
    adminIssuedAt: row.admin_issued_at,
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
    itemName: row.item_name,
    mainCategory: row.main_category,
    unit: row.unit,
    carriedQty: row.carried_qty,
    exchangedQty: row.exchanged_qty,
    requestedQty: row.requested_qty,
    wardNote: row.ward_note,
    countedQty: row.counted_qty,
    issuedQty: row.issued_qty,
    outstandingQty: row.outstanding_qty,
    adminNote: row.admin_note,
  };
}

const LINES_PAGE_SIZE = 1000;

async function fetchLineTotalsByRequestId(ward?: string) {
  const totalsByRequestId = new Map<string, { totalRequested: number; totalCounted: number; totalIssued: number; totalOutstanding: number }>();

  let from = 0;
  for (;;) {
    let query = supabase
      .from("sterile_request_lines")
      .select(
        ward
          ? "request_id, requested_qty, counted_qty, issued_qty, outstanding_qty, sterile_requests!inner(ward)"
          : "request_id, requested_qty, counted_qty, issued_qty, outstanding_qty",
      )
      .range(from, from + LINES_PAGE_SIZE - 1);
    
    if (ward) query = query.eq("sterile_requests.ward", ward);

    const { data, error } = await query;
    if (error) throw error;

    for (const line of data || []) {
      const current = totalsByRequestId.get(line.request_id) || {
        totalRequested: 0,
        totalCounted: 0,
        totalIssued: 0,
        totalOutstanding: 0,
      };
      current.totalRequested += Number(line.requested_qty) || 0;
      current.totalCounted += Number(line.counted_qty) || 0;
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
    ...(totalsByRequestId.get(h.requestId) || { totalRequested: 0, totalCounted: 0, totalIssued: 0, totalOutstanding: 0 }),
  }));
}

async function nextRequestNo(): Promise<string> {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const prefix = `ST-REQ-${today}-`;
  
  const { count } = await supabase
    .from("sterile_requests")
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
  await supabase.from("sterile_status_log").insert({
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
  return { checkedAt: new Date().toISOString(), version: APP_VERSION };
}

async function getSterileMaster(ward: string) {
  const { data: masterData, error: masterErr } = await supabase
    .from("sterile_master")
    .select("*")
    .eq("is_active", true)
    .order("main_category")
    .order("item_name");
  if (masterErr) throw masterErr;

  const { data: carryData, error: carryErr } = await supabase
    .from("sterile_carry_forward")
    .select("item_name, outstanding_qty")
    .eq("ward", ward)
    .gt("outstanding_qty", 0);
  if (carryErr) throw carryErr;

  const carryMap = new Map();
  for (const c of carryData || []) {
    carryMap.set(c.item_name, c.outstanding_qty);
  }

  return (masterData || []).map((m: any) => ({
    itemId: m.id,
    itemName: m.item_name,
    mainCategory: m.main_category,
    unit: m.unit,
    carriedQty: carryMap.get(m.item_name) || 0,
  }));
}

async function getWardRequests(ward: string) {
  const { data, error } = await supabase
    .from("sterile_requests")
    .select("*")
    .eq("ward", ward)
    .order("last_updated_at", { ascending: false });
  if (error) throw error;
  return attachRequestTotals((data || []).map(mapRequestHeader), ward);
}

async function getAdminRequests(status?: string) {
  let query = supabase.from("sterile_requests").select("*").order("last_updated_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return attachRequestTotals((data || []).map(mapRequestHeader));
}

async function getRequestDetail(requestId: string) {
  const { data: header, error: headerErr } = await supabase
    .from("sterile_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (headerErr) throw headerErr;

  const { data: lines, error: lineErr } = await supabase
    .from("sterile_request_lines")
    .select("*")
    .eq("request_id", requestId)
    .order("line_no");
  if (lineErr) throw lineErr;

  return { header: mapRequestHeader(header), lines: (lines || []).map(mapRequestLine) };
}

// ---------- Action handlers: WRITE ----------

async function submitRequest(body: any) {
  const { requestId: existingId, ward, requestDate, shift, requesterName, lines } = body;
  if (!ward || !requestDate || !shift || !requesterName || !Array.isArray(lines)) {
    throw new Error("ข้อมูลไม่ครบสำหรับสร้างใบเบิก");
  }
  
  if (existingId) {
    // Check if can be updated
    const { data: existing, error: getErr } = await supabase
      .from("sterile_requests")
      .select("*")
      .eq("id", existingId)
      .single();
    if (getErr) throw getErr;
    if (existing.status !== "submitted") throw new Error("ไม่สามารถแก้ไขใบเบิกที่ถูกดำเนินการแล้วได้");
    
    const now = new Date().toISOString();
    await supabase.from("sterile_requests").update({
      ward, request_date: requestDate, shift, requester_name: requesterName,
      last_updated_at: now, last_updated_by: requesterName
    }).eq("id", existingId);
    
    await supabase.from("sterile_request_lines").delete().eq("request_id", existingId);
    
    const lineRows = lines.map((l: any, idx: number) => ({
      request_id: existingId,
      line_no: idx + 1,
      item_name: l.itemName,
      main_category: l.mainCategory,
      unit: l.unit,
      carried_qty: Number(l.carriedQty) || 0,
      exchanged_qty: Number(l.exchangedQty) || 0,
      requested_qty: Number(l.requestedQty) || 0,
      ward_note: l.wardNote || null,
    }));
    await supabase.from("sterile_request_lines").insert(lineRows);
    await logStatus(existingId, existing.request_no, existing.status, existing.status, ward, requesterName, "update_request");
    return { requestId: existingId, requestNo: existing.request_no };
  } else {
    // Create new
    const requestNo = await nextRequestNo();
    const now = new Date().toISOString();
    const { data: header, error: headerErr } = await supabase
      .from("sterile_requests")
      .insert({
        request_no: requestNo,
        request_date: requestDate,
        ward,
        shift,
        status: "submitted",
        requester_name: requesterName,
        submitted_at: now,
        last_updated_at: now,
        last_updated_by: requesterName,
      })
      .select()
      .single();
    if (headerErr) throw headerErr;

    const lineRows = lines.map((l: any, idx: number) => ({
      request_id: header.id,
      line_no: idx + 1,
      item_name: l.itemName,
      main_category: l.mainCategory,
      unit: l.unit,
      carried_qty: Number(l.carriedQty) || 0,
      exchanged_qty: Number(l.exchangedQty) || 0,
      requested_qty: Number(l.requestedQty) || 0,
      ward_note: l.wardNote || null,
    }));
    
    if (lineRows.length > 0) {
      await supabase.from("sterile_request_lines").insert(lineRows);
      
      // Clear carry forward for requested items
      for (const row of lineRows) {
        await supabase.from("sterile_carry_forward")
          .update({ outstanding_qty: 0, updated_at: now })
          .eq("ward", ward)
          .eq("item_name", row.item_name);
      }
    }
    
    await logStatus(header.id, requestNo, null, "submitted", ward, requesterName, "submit_request");
    return { requestId: header.id, requestNo };
  }
}

async function adminReceiveRequest(body: any) {
  const { requestId, receiverName } = body;
  const { data: existing, error: getErr } = await supabase.from("sterile_requests").select("*").eq("id", requestId).single();
  if (getErr) throw getErr;
  if (existing.status !== "submitted") throw new Error("ใบเบิกนี้ถูกรับไปแล้ว");

  const now = new Date().toISOString();
  await supabase.from("sterile_requests").update({
    status: "received",
    admin_receiver_name: receiverName,
    admin_received_at: now,
    last_updated_at: now,
    last_updated_by: receiverName,
  }).eq("id", requestId);
  
  await logStatus(requestId, existing.request_no, existing.status, "received", null, receiverName, "admin_receive_request");
  return { requestId, status: "received" };
}

async function adminRecordCount(body: any) {
  const { requestId, actorName, lines } = body;
  const { data: existing, error: getErr } = await supabase.from("sterile_requests").select("*").eq("id", requestId).single();
  if (getErr) throw getErr;

  for (const l of lines) {
    await supabase.from("sterile_request_lines")
      .update({ counted_qty: Number(l.countedQty) || 0, admin_note: l.adminNote || null })
      .eq("request_id", requestId)
      .eq("line_no", l.lineNo);
  }

  const now = new Date().toISOString();
  await supabase.from("sterile_requests").update({
    status: "processing",
    admin_counted_at: now,
    last_updated_at: now,
    last_updated_by: actorName || existing.admin_receiver_name,
  }).eq("id", requestId);
  
  await logStatus(requestId, existing.request_no, existing.status, "processing", null, actorName, "admin_record_count");
  return { requestId, status: "processing" };
}

async function adminIssueRequest(body: any) {
  const { requestId, issuerName, lines } = body;
  const { data: existing, error: getErr } = await supabase.from("sterile_requests").select("*").eq("id", requestId).single();
  if (getErr) throw getErr;
  if (!["processing", "awaiting_afternoon"].includes(existing.status)) {
    throw new Error("ใบเบิกนี้ยังไม่พร้อมสำหรับบันทึกการจ่าย");
  }

  for (const l of lines || []) {
    const { data: sourceLine, error: lineErr } = await supabase
      .from("sterile_request_lines")
      .select("requested_qty, issued_qty")
      .eq("request_id", requestId)
      .eq("line_no", l.lineNo)
      .single();
    if (lineErr) throw lineErr;

    const requestedQty = Number(sourceLine.requested_qty) || 0;
    const issuedQty = Math.min(Math.max(Number(l.issuedQty) || 0, 0), requestedQty);
    const outstandingQty = Math.max(requestedQty - issuedQty, 0);
    const { error: updateErr } = await supabase.from("sterile_request_lines")
      .update({
        issued_qty: issuedQty,
        outstanding_qty: outstandingQty,
        admin_note: l.adminNote !== undefined ? l.adminNote : null
      })
      .eq("request_id", requestId)
      .eq("line_no", l.lineNo);
    if (updateErr) throw updateErr;
  }

  const { data: totals, error: totalsErr } = await supabase
    .from("sterile_request_lines")
    .select("outstanding_qty")
    .eq("request_id", requestId);
  if (totalsErr) throw totalsErr;
  const totalOutstanding = (totals || []).reduce((sum: number, line: any) => sum + (Number(line.outstanding_qty) || 0), 0);
  const nextStatus = totalOutstanding > 0 ? "awaiting_afternoon" : "issued_waiting_receipt";
  const now = new Date().toISOString();
  const { error: headerErr } = await supabase.from("sterile_requests").update({
    status: nextStatus,
    admin_issuer_name: issuerName,
    admin_issued_at: now,
    last_updated_at: now,
    last_updated_by: issuerName,
  }).eq("id", requestId);
  if (headerErr) throw headerErr;

  await logStatus(requestId, existing.request_no, existing.status, nextStatus, null, issuerName,
    nextStatus === "awaiting_afternoon" ? "admin_issue_partial_waiting_afternoon" : "admin_issue_request",
    nextStatus === "awaiting_afternoon" ? `ยังจ่ายไม่ครบ คงเหลือรวม ${totalOutstanding}` : undefined);
  return { requestId, status: nextStatus, totalOutstanding };
}

async function confirmWardReceipt(body: any) {
  const { requestId, receiverName } = body;
  const { data: existing, error: getErr } = await supabase.from("sterile_requests").select("*").eq("id", requestId).single();
  if (getErr) throw getErr;
  if (existing.status !== "issued_waiting_receipt") throw new Error("ใบเบิกนี้ยังไม่อยู่ในสถานะรอรับของ");

  const now = new Date().toISOString();
  await supabase.from("sterile_requests").update({
    status: "completed",
    ward_receiver_name: receiverName,
    ward_received_at: now,
    last_updated_at: now,
    last_updated_by: receiverName,
  }).eq("id", requestId);

  // Update carry forward for outstanding items
  const { data: lines } = await supabase.from("sterile_request_lines").select("*").eq("request_id", requestId);
  for (const l of lines || []) {
    const outstanding = Number(l.outstanding_qty) || 0;
    if (outstanding > 0) {
      // Upsert into sterile_carry_forward
      const { data: cf } = await supabase.from("sterile_carry_forward")
        .select("outstanding_qty").eq("ward", existing.ward).eq("item_name", l.item_name).maybeSingle();
      
      if (cf) {
        await supabase.from("sterile_carry_forward")
          .update({ outstanding_qty: Number(cf.outstanding_qty) + outstanding, updated_at: now })
          .eq("ward", existing.ward).eq("item_name", l.item_name);
      } else {
        await supabase.from("sterile_carry_forward")
          .insert({
            ward: existing.ward,
            item_name: l.item_name,
            main_category: l.main_category,
            unit: l.unit,
            outstanding_qty: outstanding,
            updated_at: now
          });
      }
    }
  }

  await logStatus(requestId, existing.request_no, existing.status, "completed", existing.ward, receiverName, "confirm_ward_receipt");
  return { requestId, status: "completed" };
}

async function getSterileMasterAdmin() {
  const { data, error } = await supabase.from('sterile_master').select('*').order('is_active', { ascending: false }).order('main_category').order('item_name');
  if (error) throw error;
  return (data || []).map((m: any) => ({ itemId: m.id, itemName: m.item_name, mainCategory: m.main_category, unit: m.unit, isActive: m.is_active, createdAt: m.created_at }));
}
async function saveSterileMaster(body: any) {
  if (body.actorWard !== 'จ่ายกลาง') throw new Error('ไม่มีสิทธิ์จัดการรายการคลัง');
  const itemName = String(body.itemName || '').trim(), mainCategory = String(body.mainCategory || '').trim(), unit = String(body.unit || '').trim();
  if (!itemName || !mainCategory || !unit) throw new Error('กรุณากรอกชื่อรายการ ประเภท และหน่วยนับให้ครบ');
  const payload = { item_name: itemName, main_category: mainCategory, unit, is_active: true };
  const result = body.itemId ? await supabase.from('sterile_master').update(payload).eq('id', body.itemId).select().single() : await supabase.from('sterile_master').insert(payload).select().single();
  if (result.error) throw result.error;
  return { itemId: result.data.id };
}
async function deactivateSterileMaster(body: any) {
  if (body.actorWard !== 'จ่ายกลาง') throw new Error('ไม่มีสิทธิ์จัดการรายการคลัง');
  if (!body.itemId) throw new Error('ไม่พบรหัสรายการคลัง');
  const { error } = await supabase.from('sterile_master').update({ is_active: false }).eq('id', body.itemId);
  if (error) throw error;
  return { itemId: body.itemId, isActive: false };
}
// ---------- Router ----------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "POST") {
      const body = await req.json();
      switch (body.action) {
        case "getAppMeta":
          return ok(await getAppMeta());
        case "getSterileMaster":
          return ok(await getSterileMaster(body.ward));
        case "getSterileMasterAdmin":
          if (body.actorWard !== "จ่ายกลาง") return fail("ไม่มีสิทธิ์จัดการรายการคลัง", 403);
          return ok(await getSterileMasterAdmin());
        case "saveSterileMaster":
          return ok(await saveSterileMaster(body), "บันทึกรายการคลังสำเร็จ");
        case "deactivateSterileMaster":
          return ok(await deactivateSterileMaster(body), "ปิดใช้งานรายการคลังสำเร็จ");
        case "getWardRequests":
          return ok(await getWardRequests(body.ward));
        case "getAdminRequests":
          return ok(await getAdminRequests(body.status));
        case "getRequestDetail":
          return ok(await getRequestDetail(body.requestId));
        case "submitRequest":
        case "updateRequest":
          return ok(await submitRequest(body), "สร้างใบเบิกสำเร็จ");
        case "adminReceiveRequest":
          return ok(await adminReceiveRequest(body), "รับใบเบิกสำเร็จ");
        case "adminRecordCount":
          return ok(await adminRecordCount(body), "บันทึกรายการตอบรับสำเร็จ");
        case "adminIssueRequest":
          return ok(await adminIssueRequest(body), "บันทึกการจ่ายของสำเร็จ");
        case "confirmWardReceipt":
          return ok(await confirmWardReceipt(body), "รับของและปิดงานสำเร็จ");
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
