(function () {
    const APP_VERSION = '2026.09.11.07';
    const APP_VERSION_FILE = 'app-version.json';
    const VERSION_NOTICE_KEY = 'swd_app_version_notice';
    const SIDEBAR_STATE_KEY = 'swd_sidebar_collapsed';
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
    function isMobileLayout() { return window.matchMedia('(max-width: 1100px)').matches; }
    function setSidebarState(open) {
        const sidebar = document.querySelector('.app-shell-sidebar');
        const overlay = document.querySelector('.app-shell-overlay');
        if (!sidebar || !overlay) return;
        sidebar.classList.toggle('open', open);
        overlay.classList.toggle('open', open);
        document.body.classList.toggle('shell-sidebar-open', open);
    }
    function setSidebarCollapsed(collapsed, persist = true) {
        if (isMobileLayout()) return;
        document.body.classList.toggle('shell-sidebar-collapsed', collapsed);
        const button = document.querySelector('.shell-sidebar-collapse-toggle');
        if (button) {
            button.setAttribute('aria-label', collapsed ? 'แสดง Sidebar' : 'ซ่อน Sidebar');
            button.setAttribute('title', collapsed ? 'แสดง Sidebar' : 'ซ่อน Sidebar');
            button.innerHTML = `<i class="fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}"></i>`;
        }
        if (persist) {
            try { localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? '1' : '0'); } catch (error) {}
        }
    }
    function restoreSidebarState() {
        if (isMobileLayout()) return;
        let collapsed = false;
        try { collapsed = localStorage.getItem(SIDEBAR_STATE_KEY) === '1'; } catch (error) {}
        setSidebarCollapsed(collapsed, false);
    }
    function clearSessionAndHome() {
        ['aide_ward', 'aide_role', 'sterile_ward', 'sterile_role', 'currentUser', 'currentRole', 'currentBuildingIds'].forEach((key) => {
            try { sessionStorage.removeItem(key); } catch (error) {}
        });
        window.location.href = 'index.html';
    }
    function makeButton(className, icon, label, handler) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `app-shell-action ${className}`;
        button.innerHTML = `<i class="fas ${icon}"></i><span>${label}</span>`;
        button.addEventListener('click', handler);
        return button;
    }
    function ensureMobileToggle() {
        if (document.querySelector('.shell-mobile-toggle')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'shell-mobile-toggle';
        button.setAttribute('aria-label', 'เปิดเมนูระบบ');
        button.setAttribute('title', 'เปิดเมนูระบบ');
        button.innerHTML = '<i class="fas fa-bars"></i>';
        button.addEventListener('click', () => setSidebarState(true));
        document.body.appendChild(button);
    }
    function ensureSidebarCollapseToggle(sidebar) {
        if (sidebar.querySelector('.shell-sidebar-collapse-toggle')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'shell-sidebar-collapse-toggle';
        button.setAttribute('aria-label', 'ซ่อน Sidebar');
        button.setAttribute('title', 'ซ่อน Sidebar');
        button.innerHTML = '<i class="fas fa-chevron-left"></i>';
        button.addEventListener('click', () => setSidebarCollapsed(!document.body.classList.contains('shell-sidebar-collapsed')));
        sidebar.appendChild(button);
    }
    function createSidebar() {
        let sidebar = document.querySelector('.app-shell-sidebar');
        if (sidebar) { ensureMobileToggle(); ensureSidebarCollapseToggle(sidebar); return sidebar; }
        sidebar = document.createElement('aside');
        sidebar.className = 'app-shell-sidebar';
        sidebar.setAttribute('aria-label', 'เมนูหลักของระบบ');
        sidebar.innerHTML = `
            <div class="app-shell-brand">
                <img src="icon-192.png" alt="SWD Care Connect">
                <div class="app-shell-brand-copy"><strong>SWD Care Connect</strong><span>ระบบบริหารจัดการงานหน่วยงานอัจฉริยะ</span></div>
            </div>
            <div class="app-shell-context" id="shellContext"></div>
            <div class="app-shell-section"><div class="app-shell-section-title">เมนูหลัก</div><nav class="app-shell-nav" id="shellMainNav"></nav></div>
            <div class="app-shell-section app-shell-utility-section"><div class="app-shell-section-title">การใช้งาน</div><div class="app-shell-actions" id="shellActions"></div></div>
            <div class="app-shell-footer">© 2026 Developed By Natnarinthorn</div>
        `;
        document.body.prepend(sidebar);
        const nav = sidebar.querySelector('#shellMainNav');
        PAGE_LINKS.forEach((item) => {
            const link = document.createElement('a');
            link.className = 'app-shell-link';
            link.dataset.shellHref = item.href;
            link.href = buildHref(item.href);
            link.innerHTML = `<i class="fas ${item.icon}"></i><span>${item.label}</span>`;
            nav.appendChild(link);
        });
        const actions = sidebar.querySelector('#shellActions');
        actions.appendChild(makeButton('shell-action-refresh', 'fa-rotate', 'รีเฟรชหน้า', () => window.location.reload()));
        const legacyChange = document.querySelector('#logoutBtn');
        if (legacyChange) {
            legacyChange.classList.remove('hidden');
            legacyChange.classList.add('app-shell-action', 'shell-change-unit');
            legacyChange.innerHTML = '<i class="fas fa-right-left"></i><span>เปลี่ยนหน่วยงาน</span>';
            actions.appendChild(legacyChange);
        } else {
            actions.appendChild(makeButton('shell-action-logout', 'fa-right-from-bracket', 'ออกจากระบบ', clearSessionAndHome));
        }
        const legacyWard = document.querySelector('#currentWardDisplay');
        if (legacyWard) {
            const context = sidebar.querySelector('#shellContext');
            context.appendChild(legacyWard);
            legacyWard.classList.remove('hidden');
            legacyWard.classList.add('app-shell-context-chip');
        }
        ensureSidebarCollapseToggle(sidebar);
        ensureMobileToggle();
        return sidebar;
    }
    function buildLayout() {
        const sidebar = createSidebar();
        let layout = document.querySelector('.app-shell-layout');
        if (layout) return layout;
        layout = document.createElement('div');
        layout.className = 'app-shell-layout';
        const main = document.createElement('main');
        main.className = 'app-shell-main';
        const movable = Array.from(document.body.children).filter((node) => node !== sidebar && !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName) && !node.classList.contains('shell-mobile-toggle') && !node.classList.contains('app-shell-overlay'));
        movable.forEach((node) => {
            if (node.classList.contains('navbar')) node.remove();
            else main.appendChild(node);
        });
        layout.appendChild(main);
        sidebar.insertAdjacentElement('afterend', layout);
        const overlay = document.createElement('div');
        overlay.className = 'app-shell-overlay';
        document.body.appendChild(overlay);
        return layout;
    }
    function markActiveLinks() {
        const currentFile = getCurrentFile();
        document.querySelectorAll('.app-shell-sidebar [data-shell-href]').forEach((link) => {
            const target = String(link.getAttribute('data-shell-href') || '').split('?')[0].toLowerCase();
            link.href = buildHref(target || 'index.html');
            const active = target === currentFile || (!target && currentFile === 'index.html');
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        });
    }
    function bindNavigation() {
        const overlay = document.querySelector('.app-shell-overlay');
        if (overlay) overlay.addEventListener('click', () => setSidebarState(false));
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setSidebarState(false); });
        window.addEventListener('resize', () => {
            if (isMobileLayout()) {
                document.body.classList.remove('shell-sidebar-collapsed');
            } else {
                restoreSidebarState();
            }
        });
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
            pagination = document.createElement('div'); pagination.className = 'app-table-pagination'; pagination.dataset.appPagination = tbody.id;
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
            const url = new URL(window.location.href); url.searchParams.set('app_updated', Date.now().toString()); window.location.replace(url.toString());
        }
    }
    function showVersionNotice(remoteVersion) {
        const noticeKey = `${VERSION_NOTICE_KEY}:${remoteVersion}`;
        if (sessionStorage.getItem(noticeKey)) return;
        sessionStorage.setItem(noticeKey, '1');
        const show = () => {
            if (typeof window.Swal === 'undefined') { if (window.confirm(`มีระบบเวอร์ชันใหม่ ${remoteVersion} ต้องการอัปเดตระบบหรือไม่`)) updateApplication(); return; }
            window.Swal.fire({ icon: 'info', title: 'พบเวอร์ชันใหม่ของระบบ', html: `เวอร์ชันปัจจุบัน <b>${APP_VERSION}</b><br>เวอร์ชันใหม่ <b>${remoteVersion}</b>`, confirmButtonText: 'อัปเดตระบบอัตโนมัติ', cancelButtonText: 'ไว้ภายหลัง', showCancelButton: true, allowOutsideClick: false, confirmButtonColor: '#003366' }).then(result => { if (result.isConfirmed) updateApplication(); });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true }); else show();
    }
    async function checkApplicationVersion() {
        if (new URLSearchParams(window.location.search).has('app_updated')) { const url = new URL(window.location.href); url.searchParams.delete('app_updated'); window.history.replaceState({}, document.title, url.toString()); }
        try {
            const response = await window.fetch(`${APP_VERSION_FILE}?_=${Date.now()}`, { cache: 'no-store', silentLoading: true });
            if (!response.ok) return;
            const data = await response.json();
            const remoteVersion = String(data.version || '').trim();
            if (remoteVersion && compareVersions(remoteVersion, APP_VERSION) > 0) showVersionNotice(remoteVersion); else if (remoteVersion) localStorage.setItem('swd_app_version', remoteVersion);
        } catch (error) { console.warn('ไม่สามารถตรวจสอบเวอร์ชันระบบได้', error); }
    }
    function init() {
        if (document.body.classList.contains('no-app-shell')) return;
        document.body.classList.add('has-app-shell');
        buildLayout(); markActiveLinks(); bindNavigation(); bindTablePagination(); restoreSidebarState(); checkApplicationVersion();
    }
    window.AppShell = {
        navigate(target) { window.location.href = buildHref(target); },
        openSidebar() { setSidebarState(true); },
        closeSidebar() { setSidebarState(false); },
        toggleSidebar() { const sidebar = document.querySelector('.app-shell-sidebar'); if (isMobileLayout()) { setSidebarState(!sidebar?.classList.contains('open')); } else { setSidebarCollapsed(!document.body.classList.contains('shell-sidebar-collapsed')); } },
        refreshLinks() { markActiveLinks(); },
        collapseSidebar() { setSidebarCollapsed(true); },
        expandSidebar() { setSidebarCollapsed(false); }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();