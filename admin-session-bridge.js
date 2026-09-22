(function () {
    const ADMIN_ROLES = new Set(['ADMIN', 'admin']);
    const ROLE_KEY = 'aide_role';

    function normalizeAdminSession() {
        try {
            if (ADMIN_ROLES.has(sessionStorage.getItem(ROLE_KEY))) {
                sessionStorage.setItem(ROLE_KEY, 'admin');
                return true;
            }
        } catch (error) {}
        return false;
    }

    function normalizeAdminNavigation() {
        try {
            if (sessionStorage.getItem(ROLE_KEY) !== 'admin') return;
            document.querySelectorAll('.app-shell-link[data-shell-href]').forEach((link) => {
                const target = link.getAttribute('data-shell-href') || link.getAttribute('href') || 'index.html';
                const cleanTarget = target.split('?')[0];
                const params = new URLSearchParams();
                params.set('role', 'admin');
                params.set('auth', 'supabase');
                link.href = `${cleanTarget}?${params.toString()}`;
            });
        } catch (error) {}
    }

    function install() {
        normalizeAdminSession();
        normalizeAdminNavigation();

        document.addEventListener('click', (event) => {
            const link = event.target.closest?.('.app-shell-link[data-shell-href]');
            if (!link) return;
            try {
                if (sessionStorage.getItem(ROLE_KEY) !== 'admin') return;
                const target = link.getAttribute('data-shell-href');
                if (!target) return;
                event.preventDefault();
                if (typeof window.openSystem === 'function') {
                    window.openSystem(target);
                } else {
                    const params = new URLSearchParams({ role: 'admin', auth: 'supabase' });
                    window.location.href = `${target}?${params.toString()}`;
                }
            } catch (error) {}
        }, true);

        const observer = new MutationObserver(() => {
            if (normalizeAdminSession()) normalizeAdminNavigation();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });

        window.setTimeout(normalizeAdminSession, 100);
        window.setTimeout(normalizeAdminSession, 300);
        window.setTimeout(normalizeAdminSession, 700);
        window.setTimeout(normalizeAdminNavigation, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
})();
