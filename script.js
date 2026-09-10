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
    await fetchWards();
    restoreSelectedDepartment();
    syncShellToggleVisibility();
});

function restoreSelectedDepartment() {
    const savedWard = sessionStorage.getItem(SESSION_KEYS.ward);
    const wardSelect = document.getElementById('wardInput');
    if (wardSelect && savedWard && wardList.includes(savedWard)) {
        wardSelect.value = savedWard;
    }
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
    } catch (error) {
        console.error("Error fetching wards:", error);
        wardSelect.innerHTML = '<option value="" selected disabled>ไม่สามารถโหลดรายชื่อหน่วยงานได้</option>';
    }
}

/**
 * User flow: choose a department and enter immediately.
 * No username/password popup is shown for ordinary users.
 */
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

    if (!wardList.includes(wardInput)) {
        Swal.fire({
            icon: 'error',
            title: 'ไม่พบหน่วยงาน',
            text: 'กรุณาเลือกหน่วยงานจากรายการที่ระบบกำหนด',
            confirmButtonColor: '#003366',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    currentProfile = {
        id: null,
        auth_user_id: null,
        role: 'NURSE',
        department_id: null,
        department_name: wardInput,
        active: true,
        is_department_session: true
    };

    sessionStorage.setItem(SESSION_KEYS.ward, wardInput);
    sessionStorage.setItem(SESSION_KEYS.role, 'NURSE');
    sessionStorage.removeItem(SESSION_KEYS.profileId);

    showDashboard(wardInput, 'NURSE');
}

/**
 * Admin authentication remains separate from the ordinary user flow.
 */
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
                console.error('AIDE admin login error:', error);
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

    const profile = result.value.profile || {};
    currentProfile = {
        ...profile,
        role: profile.role || 'ADMIN',
        department_name: profile.department_name || '',
        active: true
    };
    sessionStorage.setItem(SESSION_KEYS.role, 'ADMIN');
    sessionStorage.removeItem(SESSION_KEYS.ward);
    sessionStorage.removeItem(SESSION_KEYS.profileId);
    showDashboard('', 'ADMIN');
}

function showDashboard(wardName, role = "NURSE") {
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("dashboardSection").classList.remove("hidden");

    document.getElementById("currentWardDisplay").classList.remove("hidden");
    document.getElementById("logoutBtn").classList.remove("hidden");
    document.getElementById("wardNameText").innerText = role === "ADMIN" ? "ADMIN MODE" : (wardName || 'ยังไม่ได้กำหนดหน่วยงาน');
    document.getElementById("logoutBtn").innerHTML = '<i class="fas fa-sign-out-alt"></i> เปลี่ยนหน่วยงาน';
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
    currentProfile = null;
    if (redirect) showLogin();
}

function showLogin() {
    const login = document.getElementById("loginSection");
    const dashboard = document.getElementById("dashboardSection");
    if (dashboard) dashboard.classList.add("hidden");
    if (login) login.classList.remove("hidden");
    document.getElementById("currentWardDisplay")?.classList.add("hidden");
    document.getElementById("logoutBtn")?.classList.add("hidden");
    const wardInput = document.getElementById("wardInput");
    if (wardInput) wardInput.value = "";
    window.AppShell?.closeSidebar?.();
    syncShellToggleVisibility();
}

async function logout() {
    const isAdmin = currentProfile?.role === 'ADMIN' || sessionStorage.getItem(SESSION_KEYS.role) === 'ADMIN';
    const result = await Swal.fire({
        title: isAdmin ? 'ออกจากระบบแอดมิน?' : 'เปลี่ยนหน่วยงาน?',
        text: isAdmin ? 'คุณต้องการออกจากระบบแอดมินใช่หรือไม่' : 'คุณต้องการกลับไปเลือกหน่วยงานใหม่ใช่หรือไม่',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#003366',
        cancelButtonColor: '#d33',
        confirmButtonText: isAdmin ? 'ใช่, ออกจากระบบ' : 'เลือกหน่วยงานใหม่',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        if (isAdmin) await swdSupabase?.auth.signOut();
    } finally {
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
        const savedWard = sessionStorage.getItem(SESSION_KEYS.ward);
        const savedRole = sessionStorage.getItem(SESSION_KEYS.role);
        if (savedWard) {
            currentProfile = { role: savedRole || 'NURSE', department_name: savedWard, active: true, is_department_session: true };
        } else if (savedRole === 'ADMIN') {
            currentProfile = { role: 'ADMIN', department_name: '', active: true };
        }
    }

    if (!currentProfile) {
        Swal.fire({ icon: 'warning', title: 'กรุณาเลือกหน่วยงาน', text: 'กรุณาเลือกหน่วยงานก่อนใช้งานระบบย่อย' });
        return;
    }

    const currentWard = currentProfile.role === 'ADMIN'
        ? ''
        : (currentProfile.department_name || '');
    const currentRole = currentProfile.role || 'NURSE';
    const params = new URLSearchParams();

    if (currentWard) params.set("ward", currentWard);
    if (currentRole) params.set("role", currentRole);
    params.set("auth", currentProfile.role === 'ADMIN' ? "supabase" : "department");

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
