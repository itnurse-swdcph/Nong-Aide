import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const PUBLISHABLE_KEY = PUBLISHABLE_KEYS.default;
const SECRET_KEY = SECRET_KEYS.default;

const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const authClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

async function login(body: Record<string, unknown>) {
  const username = clean(body.username);
  const password = String(body.password ?? "");
  const selectedDepartment = clean(body.department);

  if (!username || !password) {
    return jsonResponse({ status: "error", message: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" }, 400);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, auth_user_id, username, email, full_name, role, level, department_id, active, departments:department_id(id,name,active)")
    .ilike("username", username)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || !profile.active || !profile.auth_user_id || !profile.email) {
    return jsonResponse({ status: "error", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, 401);
  }

  const department = Array.isArray(profile.departments) ? profile.departments[0] : profile.departments;
  if (selectedDepartment && profile.role !== "ADMIN" && (!department || department.name !== selectedDepartment)) {
    return jsonResponse({ status: "error", message: "ผู้ใช้ไม่มีสิทธิ์เข้าใช้งานหน่วยงานที่เลือก" }, 403);
  }

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: profile.email,
    password,
  });

  if (authError || !authData.session || !authData.user) {
    return jsonResponse({ status: "error", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, 401);
  }

  return jsonResponse({
    status: "success",
    data: {
      session: authData.session,
      user: authData.user,
      profile: {
        id: profile.id,
        auth_user_id: profile.auth_user_id,
        username: profile.username,
        full_name: profile.full_name,
        role: profile.role,
        level: profile.level,
        department_id: profile.department_id,
        department_name: department?.name || null,
      },
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ status: "error", message: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    if (clean(body?.action) !== "login") {
      return jsonResponse({ status: "error", message: "ไม่รู้จัก action" }, 404);
    }
    return await login(body);
  } catch (error) {
    console.error(error);
    return jsonResponse({
      status: "error",
      message: "เกิดข้อผิดพลาดในการเชื่อมต่อระบบยืนยันตัวตน",
    }, 500);
  }
});
