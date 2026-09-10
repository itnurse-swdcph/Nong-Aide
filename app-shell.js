(function () {
    const APP_VERSION = '2026.09.11.05';
    const APP_VERSION_FILE = 'app-version.json';
    const VERSION_NOTICE_KEY = 'swd_app_version_notice';

    const LEGACY_EQUIPMENT_API = 'https://script.google.com/macros/s/AKfycbxwDfAX8Jmu8WRqQGPf_JQWZWWuRITawJ3QSf0abeVdtDGaq4NYKGIEnPEauRAW7RjqoA/exec';
    const SUPABASE_EQUIPMENT_API = 'https://aqhrfwqbroezrrcenyyb.supabase.co/functions/v1/equipment-api';
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        try {
            const originalUrl = typeof input === 'string' ? input : (input && input.url) || '';
            if (originalUrl.startsWith(LEGACY_EQUIPMENT_API)) {
                const url = new URL(originalUrl);
                const target = new URL(SUPABASE_EQUIPMENT_API);
                url.searchParams.forEach((value, key) => target.searchParams.set(key, value));
                if (typeof input === 'string') return nativeFetch(target.toString(), init);
                return nativeFetch(new Request(target.toString(), input), init);
            }
        } catch (error) { console.warn('Equipment API migration bridge failed', error); }
        return nativeFetch(input, init);
    };

    const PAGE_LINKS = [
        { href: 'index.html', label: 'หน้าหลัก', icon: 'fa-house' },
        { href: 'equipment.html', label: 'ตรวจนับครุภัณฑ์', icon: 'fa-stethoscope' },
        { href: 'cloth-stock.html', label: 'Stock เครื่องผ้า', icon: 'fa-shirt' },
        { href: 'cloth-exchange.html', label: 'แลกผ้าสะอาด', icon: 'fa-sync-alt' },
        { href: 'sterile-exchange.html', label: 'วัสดุปราศจากเชื้อ', icon: 'fa-syringe' }
    ];
    const PAGINATED_TABLE_IDS = [
        'userDashAwaitBody', 'userDashProcessingBody', 'userDashCompletedBody', 'adminQueueBody', 'adminProcessingBody', 'adminWaitingBody', 'adminHistoryBody',
        'unitDashboardAwaitBody', 'unitDashboardCompletedBody', 'unitRequestBody', 'laundryPendingReceiveBody', 'laundryPendingIssueBody', 'laundryQueueBody',
        'laundryHistoryBody', 'stockRequestTableBody', 'adminBody'
    ];
    const TABLE_PAGE_SIZE = 10;
    const tablePageState = {};

    function getCurrentContext() {
        const query = new URLSearchParams(window.location.search);
        const candidates = {
            ward: [query.get('ward'), sessionStorage.getItem('aide_ward'), sessionStorage.getItem('sterile_ward')],
            role: [query.get('role'), sessionStorage.getItem('aide_role'), sessionStorage.getItem('sterile_role')]
        };
        const context = {};
        Object.keys(candidates).forEach((key) => {
            const value = candidates[key].find((item) => item && String(item).trim());
            if (value) context[key] = String(value).trim();
        });
        return context;
    }
    function buildHref(target) {
        const context = getCurrentContext();
        const params = new URLSearchParams();
        if (context.ward) params.set('ward', context.ward);
        if (context.role) params.set('role', context.role);
        const suffix = params.toString();
        return suffix ? `${target}?${suffix}` : target;
    }
    function getCurrentFile() {
        const pathname = window.location.pathname || '';
        const match = pathname.match(/([^\\/]+)$/);
        return (match && match[1]) ? match[1].toLowerCase() : 'index.html';
    }
    function setSidebarState(open) {
        const sidebar = document.querySelector('.app-shell-sidebar');
        const overlay = document.querySelector('.app-shell-overlay');
        if (!sidebar || !overlay) return;
        sidebar.classList.toggle('open', open);
        overlay.classList.toggle('open', open);
        document.body.classList.toggle('shell-sidebar-open', open);
    }
    function makeShellButton(className, icon, label, handler, options = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `nav-btn shell-topbar-btn ${className}`;
        button.innerHTML = `<i class="fas ${icon}"></i><span>${label}</span>`;
        if (options.id) button.id = options.id;
        if (options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
        button.addEventListener('click', handler);
        return button;
    }
    function logoutToHome() {
        const clearKeys = ['aide_ward', 'aide_role', 'sterile_ward', 'sterile_role', 'currentUser', 'currentRole', 'currentBuildingIds'];
        clearKeys.forEach((key) => { try { sessionStorage.removeItem(key); } catch (error) {} });
        window.location.href = 'index.html';
    }

    // The sidebar is the single source of truth for system navigation.
    // The topbar only keeps utility actions so navigation is not duplicated.
    function removeDuplicateUtilityControls(navbar) {
        if (!navbar) return;
        const utilityLabels = ['รีเฟรช', 'ออกจากระบบ'];
        navbar.querySelectorAll('a, button').forEach((element) => {
            if (element.closest('[data-shell-controls]')) return;
            const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
            const aria = (element.getAttribute('aria-label') || '').trim();
            const title = (element.getAttribute('title') || '').trim();
            const combined = `${text} ${aria} ${title}`;
            if (utilityLabels.some((label) => combined.includes(label))) {
                element.classList.add('shell-duplicate-utility');
            }
        });
    }

    function injectTopbarControls() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;
        const containers = [navbar.querySelector('.nav-actions'), navbar.querySelector('#navMenu'), navbar.querySelector('.nav-right')].filter(Boolean);
        if (!containers.length) return;
        const target = containers[0];

        target.querySelectorAll('[data-shell-controls]').forEach((node) => node.remove());

        const controls = document.createElement('div');
        controls.className = 'shell-topbar-controls';
        controls.setAttribute('data-shell-controls', 'true');
        controls.appendChild(makeShellButton('shell-menu-toggle', 'fa-bars', 'เมนู', () => window.AppShell.toggleSidebar(), { ariaLabel: 'เปิดเมนูระบบ' }));
        controls.appendChild(makeShellButton('shell-refresh', 'fa-rotate', 'รีเฟรช', () => window.location.reload(), { ariaLabel: 'รีเฟรชหน้า' }));
        controls.appendChild(makeShellButton('shell-logout', 'fa-right-from-bracket', 'ออกจากระบบ', logoutToHome, { ariaLabel: 'ออกจากระบบ' }));
        target.prepend(controls);

        const duplicateTargets = ['หน้าหลัก', 'ตรวจนับครุภัณฑ์', 'Stock เครื่องผ้า', 'แลกผ้าสะอาด', 'วัสดุปราศจากเชื้อ'];
        target.querySelectorAll('a, button').forEach((element) => {
            if (element.closest('[data-shell-controls]')) return;
            const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
            const href = (element.getAttribute('href') || '').toLowerCase();
            const duplicateByText = duplicateTargets.some((label) => text.includes(label));
            const duplicateByHref = PAGE_LINKS.some((item) => href.split('?')[0].endsWith(item.href));
            if (duplicateByText || duplicateByHref) element.classList.add('shell-duplicate-nav');
        });
        removeDuplicateUtilityControls(navbar);
    }
    function markActiveLinks() {
        const currentFile = getCurrentFile();
        document.querySelectorAll('.app-shell-sidebar [data-shell-href]').forEach((link) => {
            const target = String(link.getAttribute('data-shell-href') || '').split('?')[0].toLowerCase();
            link.setAttribute('href', buildHref(target || 'index.html'));
            const isActive = target === currentFile || (!target && currentFile === 'index.html');
            link.classList.toggle('active', isActive);
            if (isActive) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        });
    }
    function closeOnExternalClick() {
        const sidebar = document.querySelector('.app-shell-sidebar');
        const overlay = document.querySelector('.app-shell-overlay');
        if (!sidebar || !overlay) return;
        overlay.addEventListener('click', () => setSidebarState(false));
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setSidebarState(false); });
    }
    function paginateTableBody(tbody) {
        const rows = Array.from(tbody.children).filter(row => !row.classList.contains('empty-row'));
        const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
        const page = Math.min(Math.max(1, tablePageState[tbody.id] || 1), totalPages);
        tablePageState[tbody.id] = page;
        rows.forEach((row, index) => { row.hidden = index < (page - 1) * TABLE_PAGE_SIZE || index >= page * TABLE_PAGE_SIZE; });
        const tableWrap = tbody.closest('.table-wrap');
        if (!tableWrap) return;
        let pagination = tableWrap.parentElement.querySelector(`[data-app-pagination="${tbody.id}"]`);
        if (rows.length <= TABLE_PAGE_SIZE) { if (pagination) pagination.remove(); return; }
        if (!pagination) {
            pagination = document.createElement('div');
            pagination.className = 'app-table-pagination';
            pagination.dataset.appPagination = tbody.id;
            tableWrap.insertAdjacentElement('afterend', pagination);
        }
        const start = (page - 1) * TABLE_PAGE_SIZE + 1;
        const end = Math.min(page * TABLE_PAGE_SIZE, rows.length);
        pagination.innerHTML = `<span>แสดง ${start}-${end} จาก ${rows.length} รายการ | หน้า ${page}/${totalPages}</span><span class="app-table-pagination-actions"><button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>ก่อนหน้า</button><button type="button" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>ถัดไป</button></span>`;
        pagination.querySelectorAll('button[data-page]').forEach(button => button.addEventListener('click', () => { tablePageState[tbody.id] = Number(button.dataset.page); paginateTableBody(tbody); }));
    }
    function bindTablePagination() {
        PAGINATED_TABLE_IDS.forEach(id => {
            const tbody = document.getElementById(id);
            if (!tbody || tbody.dataset.paginationBound) return;
            tbody.dataset.paginationBound = 'true';
            new MutationObserver(() => paginateTableBody(tbody)).observe(tbody, { childList: true });
            paginateTableBody(tbody);
        });
    }
    function compareVersions(left, right) {
        const a = String(left || '').split('.').map(Number), b = String(right || '').split('.').map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
            const av = Number.isFinite(a[i]) ? a[i] : 0, bv = Number.isFinite(b[i]) ? b[i] : 0;
            if (av !== bv) return av - bv;
        }
        return 0;
    }
    async function updateApplication() {
        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(registration => registration.unregister()));
            }
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
            }
        } finally {
            const url = new URL(window.location.href);
            url.searchParams.set('app_updated', Date.now().toString());
            window.location.replace(url.toString());
        }
    }
    function showVersionNotice(remoteVersion) {
        const noticeKey = `${VERSION_NOTICE_KEY}:${remoteVersion}`;
        if (sessionStorage.getItem(noticeKey)) return;
        sessionStorage.setItem(noticeKey, '1');
        const show = () => {
            if (typeof window.Swal === 'undefined') {
                if (window.confirm(`มีระบบเวอร์ชันใหม่ ${remoteVersion} ต้องการอัปเดตระบบหรือไม่`)) updateApplication();
                return;
            }
            window.Swal.fire({ icon: 'info', title: 'พบเวอร์ชันใหม่ของระบบ', html: `เวอร์ชันปัจจุบัน <b>${APP_VERSION}</b><br>เวอร์ชันใหม่ <b>${remoteVersion}</b>`, confirmButtonText: 'อัปเดตระบบอัตโนมัติ', cancelButtonText: 'ไว้ภายหลัง', showCancelButton: true, allowOutsideClick: false, confirmButtonColor: '#003366' }).then(result => { if (result.isConfirmed) updateApplication(); });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true }); else show();
    }
    async function checkApplicationVersion() {
        if (new URLSearchParams(window.location.search).has('app_updated')) {
            const url = new URL(window.location.href); url.searchParams.delete('app_updated'); window.history.replaceState({}, document.title, url.toString());
        }
        try {
            const response = await window.fetch(`${APP_VERSION_FILE}?_=${Date.now()}`, { cache: 'no-store', silentLoading: true });
            if (!response.ok) return;
            const data = await response.json();
            const remoteVersion = String(data.version || '').trim();
            if (remoteVersion && compareVersions(remoteVersion, APP_VERSION) > 0) showVersionNotice(remoteVersion);
            else if (remoteVersion) localStorage.setItem('swd_app_version', remoteVersion);
        } catch (error) { console.warn('ไม่สามารถตรวจสอบเวอร์ชันระบบได้', error); }
    }
    function init() {
        const sidebar = document.querySelector('.app-shell-sidebar');
        if (!sidebar) return;
        document.body.classList.add('has-app-shell');
        injectTopbarControls(); markActiveLinks(); closeOnExternalClick(); bindTablePagination(); checkApplicationVersion();
    }
    window.AppShell = {
        navigate(target) { window.location.href = buildHref(target); },
        openSidebar() { setSidebarState(true); },
        closeSidebar() { setSidebarState(false); },
        toggleSidebar() { const sidebar = document.querySelector('.app-shell-sidebar'); if (!sidebar) return; setSidebarState(!sidebar.classList.contains('open')); },
        refreshLinks() { markActiveLinks(); },
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();