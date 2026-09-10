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
  const { data, error } = await supabase
    .from("departments")
    .select("name")
    .eq("active", true)
    .order("name");

  if (error) throw error;
  return [...new Set((data || []).map((row: any) => clean(row.name)).filter(Boolean))];
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
