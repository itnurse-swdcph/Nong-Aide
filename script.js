// 🔴 ใส่ URL Web App ที่ได้จาก Google Apps Script ตรงนี้ (ใช้ URL เดิมที่เคยทำ)
const API_URL = "https://script.google.com/macros/s/AKfycbx_xuBauWvjIYplrefNTSf6J0Y9ZzAv-FQhOvPk1SYC1qOU7C3sdrU6LL4wQI3Uz9dTeg/exec"; 

let wardList = [];
const SESSION_KEYS = {
    ward: "aide_ward",
    role: "aide_role"
};
const ADMIN_CREDENTIALS = {
    username: "11450",
    password: "11450"
};

// --- PWA Service Worker Registration (4. บันทึกหน้าจอเป็นแอพ) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker not registered', err));
    });
}
// ----------------------------------------------------------------

// เมื่อโหลดหน้าเว็บ
document.addEventListener("DOMContentLoaded", () => {
    checkLoginSession();
    fetchWards();
});

// ดึงข้อมูลหน่วยงานจาก Backend
async function fetchWards() {
    if (API_URL === "YOUR_WEB_APP_URL_FROM_GAS_HERE") return; // ป้องกัน Error ถ้ายังไม่ได้ใส่ URL

    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        
        if (result.status === 'success') {
            wardList = result.data;
            const wardSelect = document.getElementById('wardInput');
            wardSelect.innerHTML = '<option value="" selected disabled>-- กรุณาเลือกหน่วยงาน --</option>';
            
            wardList.forEach(ward => {
                let option = document.createElement('option');
                option.value = ward;
                option.textContent = ward;
                wardSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error fetching wards:", error);
        const wardSelect = document.getElementById('wardInput');
        if (wardSelect) {
            wardSelect.innerHTML = '<option value="" selected disabled>ไม่สามารถโหลดรายชื่อหน่วยงานได้</option>';
        }
    }
}

// ตรวจสอบว่าเคยเลือกตึกไว้หรือยังใน Session ปัจจุบัน
function checkLoginSession() {
    const savedRole = sessionStorage.getItem(SESSION_KEYS.role);
    const savedWard = sessionStorage.getItem(SESSION_KEYS.ward);

    if (savedRole === "admin") {
        showDashboard("", "admin");
    } else if (savedWard) {
        showDashboard(savedWard, "user");
    }
}

// ฟังก์ชันปุ่มเข้าสู่ระบบ
function enterSystem() {
    const wardInput = document.getElementById("wardInput").value.trim();
    
    if (!wardInput) {
        Swal.fire({
            icon: 'warning',
            title: 'แจ้งเตือน',
            text: 'กรุณาเลือกหรือพิมพ์ชื่อหน่วยงานครับ',
            confirmButtonColor: '#003366',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    // Custom Loader สวยๆ
    Swal.fire({
        title: 'กำลังเข้าสู่ระบบ...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // จำลองการดีเลย์เล็กน้อยให้ดู Smooth
    setTimeout(() => {
        sessionStorage.setItem(SESSION_KEYS.ward, wardInput);
        sessionStorage.setItem(SESSION_KEYS.role, "user");
        Swal.close();
        showDashboard(wardInput, "user");
    }, 800);
}

// ฟังก์ชันสลับไปหน้า Dashboard
function showDashboard(wardName, role = "user") {
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("dashboardSection").classList.remove("hidden");
    
    // แสดง Navbar Item
    document.getElementById("currentWardDisplay").classList.remove("hidden");
    document.getElementById("logoutBtn").classList.remove("hidden");
    document.getElementById("wardNameText").innerText = role === "admin" ? "ADMIN MODE" : wardName;
    document.getElementById("logoutBtn").innerHTML = role === "admin"
        ? '<i class="fas fa-sign-out-alt"></i> ออกจากระบบแอดมิน'
        : '<i class="fas fa-sign-out-alt"></i> เปลี่ยนหน่วยงาน';
    document.getElementById("dashboardSubtitle").innerText = role === "admin"
        ? "กรุณาเลือกระบบที่ต้องการจัดการในโหมดผู้ดูแลระบบ"
        : "กรุณาเลือกระบบที่ต้องการใช้งาน";
    
    // ปิดเมนูมือถือถ้าเปิดอยู่
    document.getElementById("navMenu").classList.remove("active");
}

// ฟังก์ชันออกจากระบบ (เปลี่ยนตึก)
function logout() {
    const currentRole = sessionStorage.getItem(SESSION_KEYS.role) || "user";

    // ปิดเมนูมือถือถ้าเปิดอยู่
    document.getElementById("navMenu").classList.remove("active");

    Swal.fire({
        title: currentRole === "admin" ? 'ออกจากระบบแอดมิน?' : 'เปลี่ยนหน่วยงาน?',
        text: currentRole === "admin"
            ? "คุณต้องการออกจากโหมดผู้ดูแลระบบใช่หรือไม่"
            : "คุณต้องการออกจากหน่วยงานปัจจุบันใช่หรือไม่",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#003366',
        cancelButtonColor: '#d33',
        confirmButtonText: currentRole === "admin" ? 'ใช่, ออกจากระบบ' : 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.removeItem(SESSION_KEYS.ward);
            sessionStorage.removeItem(SESSION_KEYS.role);
            document.getElementById("wardInput").value = "";
            
            // ซ่อน Dashboard กลับไปหน้า Login
            document.getElementById("dashboardSection").classList.add("hidden");
            document.getElementById("loginSection").classList.remove("hidden");
            
            // ซ่อนเมนูด้านบน
            document.getElementById("currentWardDisplay").classList.add("hidden");
            document.getElementById("logoutBtn").classList.add("hidden");
        }
    });
}

// ฟังก์ชันเปิดระบบย่อย (เปิด Tab ใหม่ พร้อมส่งชื่อตึกไปใน URL)
function openSystem(url) {
    const currentWard = sessionStorage.getItem(SESSION_KEYS.ward);
    const currentRole = sessionStorage.getItem(SESSION_KEYS.role) || "user";
    const params = new URLSearchParams();

    if (currentRole === "admin") {
        params.set("role", "admin");
    } else if (currentWard) {
        params.set("ward", currentWard);
    }

    const queryString = params.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    window.open(fullUrl, '_blank');
}

function showAdminLogin() {
    Swal.fire({
        title: '<i class="fas fa-user-shield"></i> เข้าสู่ระบบแอดมิน',
        html: `
            <input type="text" id="adminUser" class="swal2-input" placeholder="ชื่อผู้ใช้">
            <input type="password" id="adminPass" class="swal2-input" placeholder="รหัสผ่าน">
        `,
        confirmButtonColor: '#003366',
        confirmButtonText: 'เข้าสู่ระบบ',
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        preConfirm: () => {
            const username = document.getElementById('adminUser').value.trim();
            const password = document.getElementById('adminPass').value.trim();

            if (!username || !password) {
                Swal.showValidationMessage('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
                return false;
            }

            if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
                Swal.showValidationMessage('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                return false;
            }

            return true;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.removeItem(SESSION_KEYS.ward);
            sessionStorage.setItem(SESSION_KEYS.role, "admin");
            showDashboard("", "admin");
        }
    });
}

// เปิด-ปิด เมนูมือถือ (Hamburger)
function toggleMenu() {
    const navMenu = document.getElementById("navMenu");
    navMenu.classList.toggle("active");
}
