import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const SECRET_KEY = SECRET_KEYS.default;
const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEPARTMENTS = [
  "กลุ่มการพยาบาล",
  "การพยาบาลชุมชน (COC)",
  "กุมารเวชกรรม",
  "คลินิกฝากครรภ์",
  "คลินิกโรคเรื้อรัง",
  "เคมีบำบัด",
  "จ่ายกลาง",
  "ซักฟอก",
  "ไตเทียม (CAPD)",
  "ไตเทียม (HD)",
  "ทันตกรรม",
  "เทคนิคการแพทย์และพยาธิวิทยาคลินิก",
  "พัสดุ",
  "พิเศษปาริฉัตร",
  "พิเศษพวงชมพู",
  "แพทย์แผนไทย",
  "รังสีวิทยา",
  "รักษ์ใจปันสุข",
  "วิสัญญี",
  "เวชกรรมฟื้นฟู",
  "เวชกรรมฟื้นฟูปฐมภูมิ",
  "เวชกรรมสังคม",
  "ศสม.หนองทุ่ม",
  "ออร์โธปิดิกส์",
  "ศัลยกรรมทั่วไป",
  "ศูนย์เครื่องมือแพทย์",
  "ศูนย์รักษ์สุขภาพ",
  "ศูนย์สำรองเครื่องมือแพทย์",
  "สงฆ์อาพาธ",
  "ส่องกล้อง",
  "สูติ-นรีเวช",
  "หลอดเลือดสมอง",
  "ห้องคลอด",
  "ห้องผ่าตัด",
  "อาชีวเวชกรรม",
  "อายุรกรรมชาย",
  "อายุรกรรมหญิง",
  "อุบัติเหตุและฉุกเฉิน",
  "ศูนย์เปล",
  "ICU",
  "NICU-SNB",
  "OPD",
  "OPD ตา",
  "OPD จิตเวช"
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function getWards() {
  // Keep the selectable departments exactly as the approved AIDE master list.
  // Validate that Supabase still has the corresponding department records, but do not
  // let ordering, naming, or legacy rows change the user-facing selection list.
  const { data, error } = await supabase
    .from("departments")
    .select("name")
    .eq("active", true);
  if (error) throw error;

  const activeNames = new Set((data || []).map((row: any) => clean(row.name)).filter(Boolean));
  return DEPARTMENTS.filter((name) => activeNames.has(name));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ status: "error", message: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    const action = clean(url.searchParams.get("action"));
    if (action === "getWards" || action === "getAppMeta") {
      return jsonResponse({ status: "success", data: await getWards() });
    }
    return jsonResponse({ status: "error", message: "ไม่รู้จัก action: " + action }, 404);
  } catch (error) {
    console.error(error);
    return jsonResponse({ status: "error", message: "ไม่สามารถโหลดรายชื่อหน่วยงานได้" }, 500);
  }
});
