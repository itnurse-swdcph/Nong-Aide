const SUPABASE_URL = "https://aqhrfwqbroezrrcenyyb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1Q-EwiA-0-uUtMI37_Z04Q_QfCVhRw3";
const AUTH_API_URL = `${SUPABASE_URL}/functions/v1/auth-api`;
const DIRECTORY_API_URL = `${SUPABASE_URL}/functions/v1/ward-directory`;

const swdSupabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});
window.swdSupabase = swdSupabase;

let wardList = [];
let currentProfile = null;
const SESSION_KEYS = {
    ward: "aide_ward",
    role: "aide_role",
    profileId: "aide_profile_id"
};
const AVAILABLE_SYSTEMS = new Set([
    "equipment.html",
    "cloth-stock.html",
    "cloth-exchange.html",
    "sterile-exchange.html"
]);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker not registered', err));
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    await initializeAuth();
    await fetchWards();
    syncShellToggleVisibility();
});

async function initializeAuth() {
    if (!swdSupabase) {
        console.error('Supabase client failed to initialize');
        return;
    }

    try {
        const { data: { user } } = await swdSupabase.auth.getUser();
        if (user) {
            await restoreAuthenticatedUser(user);
        }
    } catch (error) {
        console.warn('Unable to restore Supabase session:', error);
        await clearLocalAuthState();
    }

    swdSupabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
            await restoreAuthenticatedUser(session.user);
        } else {
            currentProfile = null;
            await clearLocalAuthState(false);
            showLogin();
        }
    });
}

async function restoreAuthenticatedUser(user) {
    const { data: profile, error } = await swdSupabase
        .from('profiles')
        .select('id, auth_user_id, username, email, full_name, role, level, department_id, active, departments:department_id(id,name,active)')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (error || !profile || !profile.active) {
        console.warn('AIDE profile not available for authenticated user', error || 'inactive/missing profile');
        await swdSupabase.auth.signOut();
        return;
    }

    currentProfile = profile;
    const department = Array.isArray(profile.departments) ? profile.departments[0] : profile.departments;
    const ward = department?.name || '';

    sessionStorage.setItem(SESSION_KEYS.profileId, profile.id);
    sessionStorage.setItem(SESSION_KEYS.role, profile.role || 'NURSE');
    if (ward) sessionStorage.setItem(SESSION_KEYS.ward, ward);
    else sessionStorage.removeItem(SESSION_KEYS.ward);

    showDashboard(ward, profile.role || 'NURSE');
}

function syncShellToggleVisibility() {
    const toggleBtn = document.querySelector('[data-shell-toggle]');
    if (!toggleBtn) return;
    const dashboardVisible = !document.getElementById("dashboardSection")?.classList.contains("hidden");
    toggleBtn.classList.toggle("hidden", !dashboardVisible);
}

async function fetchWards() {
    const wardSelect = document.getElementById('wardInput');
    if (!wardSelect) return;

    try {
        wardSelect.innerHTML = '<option value="" selected disabled>กำลังโหลดรายชื่อหน่วยงาน...</option>';
        const response = await fetch(`${DIRECTORY_API_URL}?action=getWards&_=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        if (result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.message || 'รูปแบบข้อมูลหน่วยงานไม่ถูกต้อง');
        }

        wardList = result.data.filter(Boolean);
        wardSelect.innerHTML = '<option value="" selected disabled>-- กรุณาเลือกหน่วยงาน --</option>';
        wardList.forEach(ward => {
            const option = document.createElement('option');
            option.value = ward;
            option.textContent = ward;
            wardSelect.appendChild(option);
        });

        const savedWard = sessionStorage.getItem(SESSION_KEYS.ward);
        if (savedWard && wardList.includes(savedWard)) wardSelect.value = savedWard;
    } catch (error) {
        console.error("Error fetching wards:", error);
        wardSelect.innerHTML = '<option value="" selected disabled>ไม่สามารถโหลดรายชื่อหน่วยงานได้</option>';
    }
}

function checkLoginSession() {
    return initializeAuth();
}

async function enterSystem() {
    const wardInput = document.getElementById("wardInput")?.value.trim();

    if (!wardInput) {
        Swal.fire({
            icon: 'warning',
            title: 'แจ้งเตือน',
            text: 'กรุณาเลือกหน่วยงานก่อนเข้าสู่ระบบ',
            confirmButtonColor: '#003366',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    await showSupabaseLogin({ department: wardInput, title: `เข้าสู่ระบบ ${wardInput}` });
}

async function showSupabaseLogin({ department = '', title = 'เข้าสู่ระบบ' } = {}) {
    if (!swdSupabase) {
        Swal.fire({ icon: 'error', title: 'ระบบยืนยันตัวตนไม่พร้อมใช้งาน', text: 'ไม่สามารถเริ่ม Supabase Auth ได้' });
        return;
    }

    const result = await Swal.fire({
        title: `<i class="fas fa-user-lock"></i> ${title}`,
        html: `
            <input type="text" id="aideUsername" class="swal2-input" placeholder="ชื่อผู้ใช้" autocomplete="username">
            <input type="password" id="aidePassword" class="swal2-input" placeholder="รหัสผ่าน" autocomplete="current-password">
        `,
        confirmButtonColor: '#003366',
        confirmButtonText: 'เข้าสู่ระบบ',
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        allowOutsideClick: false,
        preConfirm: async () => {
            const username = document.getElementById('aideUsername')?.value.trim();
            const password = document.getElementById('aidePassword')?.value || '';

            if (!username || !password) {
                Swal.showValidationMessage('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
                return false;
            }

            try {
                const response = await fetch(AUTH_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_PUBLISHABLE_KEY
                    },
                    body: JSON.stringify({ action: 'login', username, password, department })
                });

                const payload = await response.json().catch(() => null);
                if (!response.ok || !payload || payload.status !== 'success' || !payload.data?.session) {
                    Swal.showValidationMessage(payload?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                    return false;
                }

                return payload.data;
            } catch (error) {
                console.error('AIDE login error:', error);
                Swal.showValidationMessage('ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้');
                return false;
            }
        }
    });

    if (!result.isConfirmed || !result.value?.session) return;

    const { session } = result.value;
    const { error } = await swdSupabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
    });

    if (error) {
        await swdSupabase.auth.signOut();
        Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบไม่สำเร็จ', text: error.message });
        return;
    }

    await restoreAuthenticatedUser(result.value.user);
}

function showDashboard(wardName, role = "NURSE") {
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("dashboardSection").classList.remove("hidden");

    document.getElementById("currentWardDisplay").classList.remove("hidden");
    document.getElementById("logoutBtn").classList.remove("hidden");
    document.getElementById("wardNameText").innerText = role === "ADMIN" ? "ADMIN MODE" : (wardName || 'ยังไม่ได้กำหนดหน่วยงาน');
    document.getElementById("logoutBtn").innerHTML = '<i class="fas fa-sign-out-alt"></i> ออกจากระบบ';
    document.getElementById("dashboardSubtitle").innerText = role === "ADMIN"
        ? "กรุณาเลือกระบบที่ต้องการจัดการในโหมดผู้ดูแลระบบ"
        : "กรุณาเลือกระบบที่ต้องการใช้งาน";

    document.getElementById("navMenu").classList.remove("active");
    window.AppShell?.closeSidebar?.();
    syncShellToggleVisibility();
}

async function clearLocalAuthState(redirect = true) {
    Object.values(SESSION_KEYS).forEach((key) => {
        try { sessionStorage.removeItem(key); } catch (error) {}
    });
    if (redirect) showLogin();
}

function showLogin() {
    const login = document.getElementById("loginSection");
    const dashboard = document.getElementById("dashboardSection");
    if (dashboard) dashboard.classList.add("hidden");
    if (login) login.classList.remove("hidden");
    document.getElementById("currentWardDisplay")?.classList.add("hidden");
    document.getElementById("logoutBtn")?.classList.add("hidden");
    document.getElementById("wardInput") && (document.getElementById("wardInput").value = "");
    window.AppShell?.closeSidebar?.();
    syncShellToggleVisibility();
}

async function logout() {
    const result = await Swal.fire({
        title: 'ออกจากระบบ?',
        text: 'คุณต้องการออกจากระบบ SWD Care Connect ใช่หรือไม่',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#003366',
        cancelButtonColor: '#d33',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;
    try {
        await swdSupabase?.auth.signOut();
    } finally {
        currentProfile = null;
        await clearLocalAuthState();
    }
}

function openSystem(url) {
    if (!AVAILABLE_SYSTEMS.has(url)) {
        Swal.fire({
            icon: 'info',
            title: 'ระบบนี้กำลังปรับปรุง',
            text: 'เมนูนี้ยังไม่พร้อมใช้งานในเวอร์ชันปัจจุบัน กรุณาใช้งานเมนูอื่นก่อนครับ',
            confirmButtonColor: '#003366',
            confirmButtonText: 'รับทราบ'
        });
        return;
    }

    if (!currentProfile) {
        Swal.fire({ icon: 'warning', title: 'กรุณาเข้าสู่ระบบ', text: 'ต้องยืนยันตัวตนก่อนใช้งานระบบย่อย' });
        return;
    }

    const currentWard = currentProfile.role === 'ADMIN'
        ? ''
        : (Array.isArray(currentProfile.departments) ? currentProfile.departments[0]?.name : currentProfile.departments?.name) || '';
    const currentRole = currentProfile.role || 'NURSE';
    const params = new URLSearchParams();

    if (currentWard) params.set("ward", currentWard);
    if (currentRole) params.set("role", currentRole);
    params.set("auth", "supabase");

    const queryString = params.toString();
    window.location.href = queryString ? `${url}?${queryString}` : url;
}

async function showAdminLogin() {
    await showSupabaseLogin({ title: 'เข้าสู่ระบบแอดมิน' });
}

function toggleMenu() {
    const navMenu = document.getElementById("navMenu");
    navMenu.classList.toggle("active");
    if (!document.getElementById("dashboardSection").classList.contains("hidden")) {
        window.AppShell?.toggleSidebar?.();
    }
}
