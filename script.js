// 🔴 ใส่ URL Web App ที่ได้จาก Google Apps Script ตรงนี้
const API_URL = "https://script.google.com/macros/s/AKfycbx_xuBauWvjIYplrefNTSf6J0Y9ZzAv-FQhOvPk1SYC1qOU7C3sdrU6LL4wQI3Uz9dTeg/exec"; 

let wardList = [];

// เมื่อโหลดหน้าเว็บ
document.addEventListener("DOMContentLoaded", () => {
    checkLoginSession();
    fetchWards();
});

// ดึงข้อมูลหน่วยงานจาก Backend
async function fetchWards() {
    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        
        if (result.status === 'success') {
            wardList = result.data;
            const datalist = document.getElementById('wardsList');
            datalist.innerHTML = ''; // เคลียร์ของเก่า
            
            wardList.forEach(ward => {
                let option = document.createElement('option');
                option.value = ward;
                datalist.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error fetching wards:", error);
    }
}

// ตรวจสอบว่าเคยเลือกตึกไว้หรือยังใน Session ปัจจุบัน
function checkLoginSession() {
    const savedWard = sessionStorage.getItem("aide_ward");
    if (savedWard) {
        showDashboard(savedWard);
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
        sessionStorage.setItem("aide_ward", wardInput);
        Swal.close();
        showDashboard(wardInput);
    }, 800);
}

// ฟังก์ชันสลับไปหน้า Dashboard
function showDashboard(wardName) {
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("dashboardSection").classList.remove("hidden");
    
    // แสดง Navbar Item
    document.getElementById("currentWardDisplay").classList.remove("hidden");
    document.getElementById("logoutBtn").classList.remove("hidden");
    document.getElementById("wardNameText").innerText = wardName;
}

// ฟังก์ชันออกจากระบบ (เปลี่ยนตึก)
function logout() {
    Swal.fire({
        title: 'เปลี่ยนหน่วยงาน?',
        text: "คุณต้องการออกจากหน่วยงานปัจจุบันใช่หรือไม่",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#003366',
        cancelButtonColor: '#d33',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.removeItem("aide_ward");
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
    const currentWard = sessionStorage.getItem("aide_ward");
    // แปลงชื่อตึกเป็น URL Format แล้วแนบไป
    const fullUrl = `${url}?ward=${encodeURIComponent(currentWard)}`;
    window.open(fullUrl, '_blank');
}

// เปิด-ปิด เมนูมือถือ (Hamburger)
function toggleMenu() {
    const navMenu = document.getElementById("navMenu");
    navMenu.classList.toggle("active");
}
