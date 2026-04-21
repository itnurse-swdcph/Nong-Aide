
        const EXCHANGE_API = 'https://script.google.com/macros/s/AKfycbwB42c0EM8n64wEGm76Ap5Kq-VSJKaBNfCPnBUEEN_TztQ_f5za1bOlJU_vfYo05T7nVw/exec';
        const APP_VERSION = '2026.04.21.01';
        const SESSION_KEYS = { ward: 'aide_ward', role: 'aide_role' };
        const ADMIN_PASSWORD = '11450';
        const STATUS_LABELS = {
            draft: 'เธเธเธฑเธเธฃเนเธฒเธ',
            submitted: 'เธชเนเธเธเธณเธเธญเนเธฅเนเธง',
            received: 'เธเธฒเธเธเธฑเธเธเธญเธเธฃเธฑเธเนเธเนเธฅเนเธง',
            processing: 'เธเธณเธฅเธฑเธเธเธฑเธ”เธเนเธฒ',
            partial_issued: 'เธเนเธฒเธขเธเธฒเธเธชเนเธงเธ',
            issued_waiting_receipt: 'เธเนเธฒเธขเธเธฃเธ เธฃเธญเธซเธเนเธงเธขเธเธฒเธเธฃเธฑเธ',
            completed: 'เน€เธชเธฃเนเธเธชเธดเนเธ',
            cancelled: 'เธขเธเน€เธฅเธดเธ'
        };

        const urlParams = new URLSearchParams(window.location.search);
        let currentWard = urlParams.get('ward') || sessionStorage.getItem(SESSION_KEYS.ward) || '';
        let currentRole = urlParams.get('role') || sessionStorage.getItem(SESSION_KEYS.role) || 'user';
        let masterItems = [];
        let unitRequests = [];
        let allRequests = [];
        let selectedUnitRequest = null;
        let selectedLaundryRequest = null;
        let selectedAdminRequest = null;
        let lastKnownServerVersion = APP_VERSION;
        let hasShownReloadPrompt = false;

        const isAdminMode = () => currentRole === 'admin';
        const isLaundryWard = () => !isAdminMode() && currentWard === 'เธเธฑเธเธเธญเธ';

        document.addEventListener('DOMContentLoaded', bootstrap);

        async function bootstrap() {
            if (!currentWard && !isAdminMode()) {
                setLoading(false);
                showNotice('เนเธกเนเธเธเธซเธเนเธงเธขเธเธฒเธ', 'เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเธเธฒเธเธซเธเนเธฒเธซเธฅเธฑเธเธเนเธญเธ', 'warning');
                updateHeader();
                return;
            }

            if (currentWard) sessionStorage.setItem(SESSION_KEYS.ward, currentWard);
            sessionStorage.setItem(SESSION_KEYS.role, currentRole);
            updateHeader();
            setLoading(true, 'เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ');

            if (isAdminMode()) {
                await loadAdminWorkspace();
            } else if (isLaundryWard()) {
                await loadLaundryWorkspace();
            } else {
                await loadUnitWorkspace();
            }

            setLoading(false);
            checkForAppUpdate(false);
            window.setInterval(() => checkForAppUpdate(false), 120000);
        }

        function setLoading(isLoading, text) {
            document.getElementById('loaderText').innerText = text || 'เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ';
            document.getElementById('loader').classList.toggle('hidden', !isLoading);
            document.getElementById('app').classList.toggle('hidden', isLoading);
        }

        function updateHeader() {
            let title = 'เธฃเธฐเธเธเธชเนเธเนเธฅเธเธเนเธฒเธชเธฐเธญเธฒเธ”';
            let wardText = currentWard || '-';
            let roleText = 'เธซเธเนเธงเธขเธเธฒเธ';

            if (isAdminMode()) {
                title = 'เธฃเธฐเธเธเธชเนเธเนเธฅเธเธเนเธฒเธชเธฐเธญเธฒเธ” : Admin';
                wardText = 'เธ เธฒเธเธฃเธงเธกเธ—เธฑเนเธเธญเธเธเนเธเธฃ';
                roleText = 'Admin';
            } else if (isLaundryWard()) {
                roleText = 'เธเธฑเธเธเธญเธ';
            }

            document.title = title;
            document.getElementById('systemTitle').innerText = title;
            document.getElementById('navWardText').innerText = `เธซเธเนเธงเธขเธเธฒเธ: ${wardText}`;
            document.getElementById('navRoleText').innerText = `เธเธ—เธเธฒเธ—: ${roleText}`;
            document.getElementById('btnAdminLogin').classList.toggle('hidden', isAdminMode());
            document.getElementById('btnExitAdmin').classList.toggle('hidden', !isAdminMode());
        }

        function showNotice(title, detail, type = 'info') {
            const el = document.getElementById('globalNotice');
            el.className = 'notice';
            el.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
            el.classList.remove('hidden');
            if (type === 'warning') el.style.borderLeft = '4px solid var(--warning)';
            else if (type === 'danger') el.style.borderLeft = '4px solid var(--danger)';
            else el.style.borderLeft = '4px solid var(--navy)';
        }

        function hideNotice() {
            document.getElementById('globalNotice').classList.add('hidden');
        }

        function showLoadingPopup(text = 'เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ...') {
            Swal.fire({
                title: text,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => Swal.showLoading()
            });
        }

        function hideLoadingPopup() {
            if (Swal.isVisible()) Swal.close();
        }

        async function withLoadingPopup(text, task) {
            showLoadingPopup(text);
            try {
                return await task();
            } finally {
                hideLoadingPopup();
            }
        }

        function openRecordModal(title, subtitle, html) {
            document.getElementById('recordModalTitle').innerText = title || 'เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธฃเธฒเธขเธเธฒเธฃ';
            document.getElementById('recordModalSubtitle').innerText = subtitle || '';
            document.getElementById('recordModalBody').innerHTML = html || '';
            document.getElementById('recordModal').classList.remove('hidden');
            document.body.classList.add('modal-open');
        }

        function closeRecordModal() {
            document.getElementById('recordModal').classList.add('hidden');
            document.getElementById('recordModalBody').innerHTML = '';
            document.body.classList.remove('modal-open');
        }

        function handleRecordModalBackdrop(event) {
            if (event.target.id === 'recordModal') {
                closeRecordModal();
            }
        }

        async function fetchAppMeta() {
            ensureExchangeApiReady();
            const response = await fetch(`${EXCHANGE_API}?action=getAppMeta`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || 'เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเน€เธงเธญเธฃเนเธเธฑเธเนเธกเนเธชเธณเน€เธฃเนเธ');
            return result.data || {};
        }

        async function checkForAppUpdate(forcePrompt) {
            try {
                const meta = await fetchAppMeta();
                const serverVersion = String(meta.version || '').trim();
                if (!serverVersion) return;
                lastKnownServerVersion = serverVersion;
                if (serverVersion === APP_VERSION) return;
                if (!forcePrompt && hasShownReloadPrompt) return;
                hasShownReloadPrompt = true;
                Swal.fire({
                    icon: 'info',
                    title: 'เธกเธตเธฃเธฐเธเธเน€เธงเธญเธฃเนเธเธฑเธเนเธซเธกเน',
                    text: 'เธซเธเนเธฒเธ—เธตเนเน€เธเธดเธ”เธญเธขเธนเนเน€เธเนเธเน€เธงเธญเธฃเนเธเธฑเธเน€เธเนเธฒ เธเธฃเธธเธ“เธฒเนเธซเธฅเธ”เธซเธเนเธฒเธฃเธฐเธเธเนเธซเธกเนเน€เธเธทเนเธญเนเธเนเธเธฒเธเน€เธงเธญเธฃเนเธเธฑเธเธฅเนเธฒเธชเธธเธ”',
                    allowOutsideClick: false,
                    confirmButtonText: 'เนเธซเธฅเธ”เธซเธเนเธฒเนเธซเธกเน',
                    cancelButtonText: 'เธ เธฒเธขเธซเธฅเธฑเธ',
                    showCancelButton: true
                }).then(result => {
                    if (result.isConfirmed) {
                        reloadPage();
                    }
                });
            } catch (error) {
                console.warn('Unable to check app version', error);
            }
        }

        async function loadUnitWorkspace() {
            hideNotice();
            showSection('unitWorkspace');
            const [masterResult, requestResult] = await Promise.allSettled([
                fetchExchangeMaster(),
                fetchWardRequests()
            ]);

            if (masterResult.status === 'rejected') {
                showNotice('เนเธซเธฅเธ” master เนเธกเนเธชเธณเน€เธฃเนเธ', masterResult.reason?.message || 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธเธทเนเธญเธกเธ•เนเธญ API เนเธ”เน', 'danger');
            }
            if (requestResult.status === 'rejected') {
                showNotice('เนเธซเธฅเธ”เธฃเธฒเธขเธเธฒเธฃเนเธเน€เธเธดเธเนเธกเนเธชเธณเน€เธฃเนเธ', requestResult.reason?.message || 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธเธทเนเธญเธกเธ•เนเธญ API เนเธ”เน', 'warning');
            }

            document.getElementById('requestDate').value = new Date().toISOString().slice(0, 10);
            renderUnitWorkspace();
        }

        async function loadLaundryWorkspace() {
            hideNotice();
            showSection('laundryWorkspace');
            const tasks = [fetchAllRequests()];

            const results = await Promise.allSettled(tasks);
            if (results.some(result => result.status === 'rejected')) {
                showNotice('เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเนเธกเนเธเธฃเธ', 'เธเธฒเธเธชเนเธงเธเธเธญเธเธฃเธฐเธเธเน€เธเธทเนเธญเธกเธ•เนเธญ API เนเธกเนเธชเธณเน€เธฃเนเธ', 'warning');
            }

            renderLaundryWorkspace();
        }

        async function loadAdminWorkspace() {
            hideNotice();
            showSection('adminWorkspace');
            const result = await Promise.allSettled([fetchAllRequests()]);
            if (result[0].status === 'rejected') {
                showNotice('เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเนเธกเนเธชเธณเน€เธฃเนเธ', result[0].reason?.message || 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธเธทเนเธญเธกเธ•เนเธญ API เนเธ”เน', 'danger');
            }
            renderAdminWorkspace();
        }

        function showSection(ids) {
            ['unitWorkspace', 'laundryWorkspace', 'adminWorkspace'].forEach(id => {
                document.getElementById(id).classList.add('hidden');
            });

            const list = Array.isArray(ids) ? ids : [ids];
            list.forEach(id => document.getElementById(id).classList.remove('hidden'));
        }

        async function fetchExchangeMaster() {
            ensureExchangeApiReady();
            const response = await fetch(`${EXCHANGE_API}?action=getExchangeMaster&ward=${encodeURIComponent(currentWard)}`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || 'เนเธซเธฅเธ” master เนเธกเนเธชเธณเน€เธฃเนเธ');
            masterItems = Array.isArray(result.data) ? result.data : [];
        }

        async function fetchWardRequests() {
            ensureExchangeApiReady();
            const response = await fetch(`${EXCHANGE_API}?action=getWardExchangeRequests&ward=${encodeURIComponent(currentWard)}`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || 'เนเธซเธฅเธ”เธฃเธฒเธขเธเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ');
            unitRequests = Array.isArray(result.data) ? result.data : [];
        }

        async function fetchAllRequests() {
            ensureExchangeApiReady();
            const response = await fetch(`${EXCHANGE_API}?action=getLaundryExchangeRequests`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || 'เนเธซเธฅเธ”เธฃเธฒเธขเธเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ');
            allRequests = Array.isArray(result.data) ? result.data : [];
        }

        async function fetchRequestDetail(requestId) {
            ensureExchangeApiReady();
            const response = await fetch(`${EXCHANGE_API}?action=getExchangeRequestDetail&requestId=${encodeURIComponent(requestId)}`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || 'เนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธกเนเธชเธณเน€เธฃเนเธ');
            return result.data;
        }

        function renderUnitWorkspace() {
            const createTabBtn = document.getElementById('unitCreateTabBtn');
            const requestPanel = document.getElementById('unitRequest');
            const hideCreate = isLaundryWard();

            createTabBtn.classList.toggle('hidden', hideCreate);
            requestPanel.classList.toggle('hidden', hideCreate);

            if (hideCreate && requestPanel.classList.contains('active')) {
                requestPanel.classList.remove('active');
                document.getElementById('unitDashboard').classList.add('active');
                const tabs = document.querySelectorAll('#unitWorkspace .tab-btn');
                tabs.forEach(btn => btn.classList.remove('active'));
                if (tabs[0]) tabs[0].classList.add('active');
            }

            document.getElementById('unitOpenMetric').innerText = unitRequests.filter(req => ['submitted', 'received', 'processing', 'partial_issued'].includes(req.status)).length.toLocaleString();
            document.getElementById('unitAwaitMetric').innerText = unitRequests.filter(req => req.status === 'issued_waiting_receipt').length.toLocaleString();
            document.getElementById('dashSubmitted').innerText = unitRequests.filter(req => req.status === 'submitted').length.toLocaleString();
            document.getElementById('dashProcessing').innerText = unitRequests.filter(req => ['received', 'processing', 'partial_issued'].includes(req.status)).length.toLocaleString();
            document.getElementById('dashWaitingReceipt').innerText = unitRequests.filter(req => req.status === 'issued_waiting_receipt').length.toLocaleString();
            document.getElementById('dashCompleted').innerText = unitRequests.filter(req => req.status === 'completed').length.toLocaleString();
            renderRequestFormRows();
            renderUnitRequestTables();
        }

        function renderRequestFormRows() {
            const tbody = document.getElementById('requestLineBody');
            if (masterItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃ master เธเธญเธเธซเธเนเธงเธขเธเธฒเธเธเธตเน</td></tr>`;
                return;
            }

            tbody.innerHTML = masterItems.map((item, index) => `
                <tr>
                    <td>${escapeHtml(item.itemName)}</td>
                    <td>${item.parLevel}</td>
                    <td><input class="number-input" type="number" min="0" id="stockBalance-${index}" placeholder="เธเธเน€เธซเธฅเธทเธญ" oninput="recalculateLine(${index})"></td>
                    <td><input class="number-input" type="number" min="0" id="sentLaundry-${index}" placeholder="เธชเนเธเธเธฑเธ"></td>
                    <td><input class="number-input" type="number" value="${item.parLevel}" id="suggestedQty-${index}" readonly></td>
                    <td><input class="number-input" type="number" min="0" id="requestedQty-${index}" placeholder="เธเธญเน€เธเธดเธ"></td>
                    <td><input class="text-input" type="text" id="wardNote-${index}" placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธ"></td>
                </tr>
            `).join('');
        }

        function recalculateLine(index) {
            const par = Number(masterItems[index].parLevel || 0);
            const stock = Number(document.getElementById(`stockBalance-${index}`).value || 0);
            const suggested = Math.max(par - stock, 0);
            document.getElementById(`suggestedQty-${index}`).value = suggested;
        }

        async function submitExchangeRequest(event) {
            event.preventDefault();
            ensureExchangeApiReady();

            const requesterName = document.getElementById('requesterName').value.trim();
            const requestDate = document.getElementById('requestDate').value;
            const shift = document.getElementById('requestShift').value;
            if (!requesterName || !requestDate || !shift) {
                Swal.fire({ icon: 'warning', title: 'เธเธฃเธญเธเธเนเธญเธกเธนเธฅเนเธซเนเธเธฃเธ' });
                return;
            }

            const lines = masterItems.map((item, index) => {
                const stockBalance = Number(document.getElementById(`stockBalance-${index}`).value || 0);
                const sentLaundryQty = Number(document.getElementById(`sentLaundry-${index}`).value || 0);
                const suggestedQty = Math.max(Number(item.parLevel || 0) - stockBalance, 0);
                const requestedQty = Number(document.getElementById(`requestedQty-${index}`).value || 0);
                const wardNote = document.getElementById(`wardNote-${index}`).value.trim();
                return {
                    itemName: item.itemName,
                    mainCategory: item.mainCategory,
                    parLevel: item.parLevel,
                    stockBalance,
                    sentLaundryQty,
                    suggestedQty,
                    requestedQty,
                    wardNote
                };
            });

            if (!lines.some(line => line.requestedQty > 0)) {
                Swal.fire({ icon: 'warning', title: 'เธขเธฑเธเนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธเธญเน€เธเธดเธ' });
                return;
            }

            const overs = lines.filter(line => line.requestedQty > line.suggestedQty && !line.wardNote);
            if (overs.length > 0) {
                Swal.fire({ icon: 'warning', title: 'เธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธเธญเน€เธเธดเธเธเธณเธเธงเธเนเธเธฐเธเธณเธ•เนเธญเธเธกเธตเธซเธกเธฒเธขเน€เธซเธ•เธธ' });
                return;
            }

            const btn = document.getElementById('submitRequestBtn');
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> เธเธณเธฅเธฑเธเธชเนเธ`;

            try {
                const response = await fetch(EXCHANGE_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'submitExchangeRequest',
                        ward: currentWard,
                        requestDate,
                        shift,
                        requesterName,
                        lines
                    })
                });
                const result = await response.json();
                if (!response.ok || result.status !== 'success') {
                    throw new Error(result.message || 'เธชเธฃเนเธฒเธเนเธเน€เธเธดเธเนเธกเนเธชเธณเน€เธฃเนเธ');
                }

                await fetchWardRequests();
                renderUnitWorkspace();
                Swal.fire({
                    icon: 'success',
                    title: 'เธชเธฃเนเธฒเธเนเธเน€เธเธดเธเนเธฅเนเธง',
                    text: `เน€เธฅเธเธ—เธตเนเนเธเน€เธเธดเธ ${result.data.requestNo}`
                });
                document.getElementById('exchangeRequestForm').reset();
                document.getElementById('requestDate').value = new Date().toISOString().slice(0, 10);
                renderRequestFormRows();
                switchPanel('unitWorkspace', 'unitRequests');
                await openUnitRequest(result.data.requestId);
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธชเนเธเนเธเน€เธเธดเธเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-floppy-disk"></i> เธชเนเธเนเธเน€เธเธดเธ`;
            }
        }

        function renderUnitRequestTables() {
            const dashboardBody = document.getElementById('unitDashboardBody');
            const requestBody = document.getElementById('unitRequestBody');
            const rows = unitRequests.slice().sort((a, b) => sortByDate(b.updatedAt || b.requestDate, a.updatedAt || a.requestDate));

            if (rows.length === 0) {
                const emptyRow = `<tr><td colspan="8" style="text-align:center;">เธขเธฑเธเนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃ</td></tr>`;
                dashboardBody.innerHTML = emptyRow;
                requestBody.innerHTML = emptyRow;
                return;
            }

            dashboardBody.innerHTML = rows.slice(0, 5).map(row => `
                <tr>
                    <td>${escapeHtml(row.requestNo)}</td>
                    <td>${escapeHtml(formatThaiDate(row.requestDate))}</td>
                    <td>${escapeHtml(row.shift)}</td>
                    <td>${renderStatus(row.status)}</td>
                    <td>${row.totalRequested}</td>
                    <td>${row.totalOutstanding}</td>
                    <td><button class="table-btn" onclick="openUnitRequest('${escapeJs(row.requestId)}')">เธ”เธน</button></td>
                </tr>
            `).join('');

            requestBody.innerHTML = rows.map(row => `
                <tr>
                    <td>${escapeHtml(row.requestNo)}</td>
                    <td>${escapeHtml(formatThaiDate(row.requestDate))}</td>
                    <td>${escapeHtml(row.shift)}</td>
                    <td>${renderStatus(row.status)}</td>
                    <td>${row.totalRequested}</td>
                    <td>${row.totalIssued}</td>
                    <td>${row.totalOutstanding}</td>
                    <td>
                        <button class="table-btn" onclick="openUnitRequest('${escapeJs(row.requestId)}')">เธ”เธน</button>
                        <button class="table-btn" onclick="loadAndPrintRequest('${escapeJs(row.requestId)}', 'request')">เธเธดเธกเธเนเนเธเน€เธเธดเธ</button>
                    </td>
                </tr>
            `).join('');
        }

        async function openUnitRequest(requestId) {
            try {
                selectedUnitRequest = await fetchRequestDetail(requestId);
                renderUnitDetailCard();
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function renderUnitDetailCard() {
            const card = document.getElementById('unitDetailCard');
            const detail = selectedUnitRequest;
            if (!detail) {
                card.classList.add('hidden');
                return;
            }

            const canConfirm = ['partial_issued', 'issued_waiting_receipt'].includes(detail.header.status);
            card.classList.remove('hidden');
            card.innerHTML = `
                <div class="section-head">
                    <div>
                        <h3>เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธเน€เธเธดเธ ${escapeHtml(detail.header.requestNo)}</h3>
                        <p>${escapeHtml(detail.header.ward)} | ${escapeHtml(formatThaiDate(detail.header.requestDate))} | ${renderStatus(detail.header.status)}</p>
                    </div>
                    <div class="actions" style="margin-top:0;">
                        <button class="ghost-btn" type="button" onclick="printRequestDocument(selectedUnitRequest, 'request')">เธเธดเธกเธเนเนเธเน€เธเธดเธ</button>
                    </div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>เธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</th>
                                <th>Par</th>
                                <th>เธเธเน€เธซเธฅเธทเธญ</th>
                                <th>เธชเนเธเธเธฑเธ</th>
                                <th>เนเธเธฐเธเธณ</th>
                                <th>เธเธญเน€เธเธดเธ</th>
                                <th>เธฃเธฑเธเธเธฃเธดเธ</th>
                                <th>เธเนเธฒเธข</th>
                                <th>เธเธเธเนเธฒเธ</th>
                                <th>เธซเธกเธฒเธขเน€เธซเธ•เธธ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${detail.lines.map(line => `
                                <tr>
                                    <td>${escapeHtml(line.itemName)}</td>
                                    <td>${line.parLevel}</td>
                                    <td>${line.stockBalance}</td>
                                    <td>${line.sentLaundryQty}</td>
                                    <td>${line.suggestedQty}</td>
                                    <td>${line.requestedQty}</td>
                                    <td>${line.laundryReceivedQty || '-'}</td>
                                    <td>${line.issuedQty || '-'}</td>
                                    <td>${line.outstandingQty || 0}</td>
                                    <td>${escapeHtml(line.laundryNote || line.wardNote || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${canConfirm ? `
                    <div class="field-grid" style="margin-top:14px;">
                        <label class="field">
                            เธเธนเนเธฃเธฑเธเธเนเธฒ
                            <input type="text" id="wardReceiverName" placeholder="เธเธทเนเธญ-เธเธฒเธกเธชเธเธธเธฅ">
                        </label>
                        <label class="field">
                            เธซเธกเธฒเธขเน€เธซเธ•เธธ
                            <textarea id="wardReceiptNote" placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฒเธฃเธฃเธฑเธเธเนเธฒ"></textarea>
                        </label>
                    </div>
                    <div class="actions">
                        <button class="primary-btn" type="button" onclick="confirmWardReceipt()">เธฅเธเธฃเธฑเธเธเนเธฒ</button>
                    </div>
                ` : ''}
            `;
        }

        async function confirmWardReceipt() {
            if (!selectedUnitRequest) return;
            const receiverName = document.getElementById('wardReceiverName').value.trim();
            const note = document.getElementById('wardReceiptNote').value.trim();
            if (!receiverName) {
                Swal.fire({ icon: 'warning', title: 'เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธเธนเนเธฃเธฑเธเธเนเธฒ' });
                return;
            }

            try {
                const response = await fetch(EXCHANGE_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'confirmExchangeReceipt',
                        requestId: selectedUnitRequest.header.requestId,
                        receiverName,
                        note
                    })
                });
                const result = await response.json();
                if (!response.ok || result.status !== 'success') throw new Error(result.message || 'เธฅเธเธฃเธฑเธเธเนเธฒเนเธกเนเธชเธณเน€เธฃเนเธ');
                await fetchWardRequests();
                if (isLaundryWard()) await fetchAllRequests();
                renderUnitWorkspace();
                if (isLaundryWard()) renderLaundryWorkspace();
                await openUnitRequest(selectedUnitRequest.header.requestId);
                Swal.fire({ icon: 'success', title: 'เธฅเธเธฃเธฑเธเธเนเธฒเนเธฅเนเธง' });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธฅเธเธฃเธฑเธเธเนเธฒเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function renderLaundryWorkspace() {
            document.getElementById('laundryNewMetric').innerText = allRequests.filter(row => ['submitted', 'received', 'processing'].includes(row.status)).length.toLocaleString();
            document.getElementById('laundryAwaitMetric').innerText = allRequests.filter(row => ['partial_issued', 'issued_waiting_receipt'].includes(row.status)).length.toLocaleString();
            const queueRows = allRequests.filter(row => !['completed', 'cancelled'].includes(row.status)).sort((a, b) => sortByDate(b.updatedAt || b.requestDate, a.updatedAt || a.requestDate));
            const historyRows = allRequests.filter(row => ['completed', 'cancelled'].includes(row.status)).sort((a, b) => sortByDate(b.updatedAt || b.requestDate, a.updatedAt || a.requestDate));

            document.getElementById('laundryQueueBody').innerHTML = queueRows.length === 0
                ? `<tr><td colspan="8" style="text-align:center;">เนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃ</td></tr>`
                : queueRows.map(row => `
                    <tr>
                        <td>${escapeHtml(row.requestNo)}</td>
                        <td>${escapeHtml(row.ward)}</td>
                        <td>${escapeHtml(formatThaiDate(row.requestDate))}</td>
                        <td>${escapeHtml(row.shift)}</td>
                        <td>${renderStatus(row.status)}</td>
                        <td>${row.totalRequested}</td>
                        <td>${row.totalOutstanding}</td>
                        <td><button class="table-btn" onclick="openLaundryRequest('${escapeJs(row.requestId)}')">เน€เธเธดเธ”</button></td>
                    </tr>
                `).join('');

            document.getElementById('laundryHistoryBody').innerHTML = historyRows.length === 0
                ? `<tr><td colspan="7" style="text-align:center;">เนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃ</td></tr>`
                : historyRows.map(row => `
                    <tr>
                        <td>${escapeHtml(row.requestNo)}</td>
                        <td>${escapeHtml(row.ward)}</td>
                        <td>${escapeHtml(formatThaiDate(row.requestDate))}</td>
                        <td>${renderStatus(row.status)}</td>
                        <td>${row.totalIssued}</td>
                        <td>${row.totalOutstanding}</td>
                        <td><button class="table-btn" onclick="openLaundryRequest('${escapeJs(row.requestId)}')">เธ”เธน</button></td>
                    </tr>
                `).join('');
        }

        async function openLaundryRequest(requestId) {
            try {
                selectedLaundryRequest = await fetchRequestDetail(requestId);
                renderLaundryDetailCard();
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function renderLaundryDetailCard() {
            const card = document.getElementById('laundryDetailCard');
            const detail = selectedLaundryRequest;
            if (!detail) {
                card.classList.add('hidden');
                return;
            }

            const visibleLines = getExchangeDisplayLines(detail.lines);

            card.classList.remove('hidden');
            card.innerHTML = `
                <div class="section-head">
                    <div>
                        <h3>เธเธฑเธ”เธเธฒเธฃเนเธเน€เธเธดเธ ${escapeHtml(detail.header.requestNo)}</h3>
                        <p>${escapeHtml(detail.header.ward)} | ${escapeHtml(formatThaiDate(detail.header.requestDate))} | ${renderStatus(detail.header.status)}</p>
                    </div>
                    <div class="actions" style="margin-top:0;">
                        <button class="ghost-btn" type="button" onclick="printRequestDocument(selectedLaundryRequest, 'request')">เธเธดเธกเธเนเนเธเน€เธเธดเธ</button>
                        <button class="ghost-btn" type="button" onclick="printRequestDocument(selectedLaundryRequest, 'issue')">เธเธดเธกเธเนเนเธเธเธณเธเนเธฒเธข</button>
                    </div>
                </div>
                <div class="field-grid">
                    <label class="field">
                        เธเธนเนเธฃเธฑเธเนเธเน€เธเธดเธ
                        <input type="text" id="laundryReceiverName" value="${escapeHtml(detail.header.laundryReceiverName || '')}">
                    </label>
                    <label class="field">
                        เธเธนเนเธเนเธฒเธขเธเนเธฒ
                        <input type="text" id="laundryIssuerName" value="${escapeHtml(detail.header.laundryIssuerName || '')}">
                    </label>
                    <label class="field">
                        เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฑเธเธเธญเธ
                        <textarea id="laundryHeaderNote" placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธเธฃเธงเธก"></textarea>
                    </label>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>เธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</th>
                                <th class="ward-head">เธเธณเธเธงเธเธเธเธเธฅเธฑเธ</th>
                                <th class="ward-head">เธเธเน€เธซเธฅเธทเธญ</th>
                                <th class="ward-head">เธชเนเธเธเธฑเธ</th>
                                <th class="ward-head">เธเธญเน€เธเธดเธ</th>
                                <th class="laundry-head">เธฃเธฑเธเธเธฃเธดเธ</th>
                                <th class="laundry-head">เธเนเธฒเธข</th>
                                <th class="laundry-head">เธเธเธเนเธฒเธ</th>
                                <th class="laundry-head">เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฑเธเธเธญเธ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${visibleLines.length === 0 ? `
                                <tr>
                                    <td colspan="9" style="text-align:center;">เนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธ•เนเธญเธเน€เธเธดเธเธซเธฃเธทเธญเธชเนเธเธเธฑเธ</td>
                                </tr>
                            ` : visibleLines.map(line => `
                                <tr>
                                    <td>${escapeHtml(line.itemName)}</td>
                                    <td class="ward-col">${line.parLevel}</td>
                                    <td class="ward-col">${line.stockBalance}</td>
                                    <td class="ward-col">${line.sentLaundryQty}</td>
                                    <td class="ward-col">${line.requestedQty}</td>
                                    <td class="laundry-col"><input class="number-input" type="number" min="0" value="${line.laundryReceivedQty > 0 ? line.laundryReceivedQty : ''}" placeholder="เธฃเธฑเธเธเธฃเธดเธ" id="laundryReceived-${line._index}" oninput="recalculateLaundryOutstanding(${line._index}, ${line.requestedQty})"></td>
                                    <td class="laundry-col"><input class="number-input" type="number" min="0" value="${line.issuedQty > 0 ? line.issuedQty : ''}" placeholder="เธเนเธฒเธข" id="laundryIssued-${line._index}" oninput="recalculateLaundryOutstanding(${line._index}, ${line.requestedQty})"></td>
                                    <td class="laundry-col"><input class="number-input" type="number" value="${line.outstandingQty || 0}" id="laundryOutstanding-${line._index}" readonly></td>
                                    <td class="laundry-col"><input class="text-input" type="text" value="${escapeHtml(line.laundryNote || '')}" id="laundryNote-${line._index}" placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฑเธเธเธญเธ"></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="actions">
                    <button class="ghost-btn" type="button" onclick="receiveRequestAtLaundry()">เธฅเธเธฃเธฑเธเนเธเน€เธเธดเธ</button>
                    <button class="primary-btn" type="button" onclick="issueRequestAtLaundry()">เธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเธเนเธฒ</button>
                </div>
            `;
        }

        function recalculateLaundryOutstanding(index, requestedQty) {
            const issued = Number(document.getElementById(`laundryIssued-${index}`).value || 0);
            document.getElementById(`laundryOutstanding-${index}`).value = Math.max(requestedQty - issued, 0);
        }

        async function receiveRequestAtLaundry() {
            if (!selectedLaundryRequest) return;
            const receiverName = document.getElementById('laundryReceiverName').value.trim();
            const note = document.getElementById('laundryHeaderNote').value.trim();
            if (!receiverName) {
                Swal.fire({ icon: 'warning', title: 'เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธเธนเนเธฃเธฑเธเนเธเน€เธเธดเธ' });
                return;
            }

            try {
                const response = await fetch(EXCHANGE_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'receiveExchangeRequest',
                        requestId: selectedLaundryRequest.header.requestId,
                        receiverName,
                        note
                    })
                });
                const result = await response.json();
                if (!response.ok || result.status !== 'success') throw new Error(result.message || 'เธฅเธเธฃเธฑเธเนเธเนเธกเนเธชเธณเน€เธฃเนเธ');
                await fetchAllRequests();
                renderLaundryWorkspace();
                if (isLaundryWard()) await fetchWardRequests();
                if (isLaundryWard()) renderUnitWorkspace();
                await openLaundryRequest(selectedLaundryRequest.header.requestId);
                Swal.fire({ icon: 'success', title: 'เธฅเธเธฃเธฑเธเนเธเน€เธเธดเธเนเธฅเนเธง' });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธฅเธเธฃเธฑเธเนเธเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        async function issueRequestAtLaundry() {
            if (!selectedLaundryRequest) return;
            const issuerName = document.getElementById('laundryIssuerName').value.trim();
            const note = document.getElementById('laundryHeaderNote').value.trim();
            if (!issuerName) {
                Swal.fire({ icon: 'warning', title: 'เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธเธนเนเธเนเธฒเธขเธเนเธฒ' });
                return;
            }

            const lines = selectedLaundryRequest.lines.map((line, index) => {
                const receivedInput = document.getElementById(`laundryReceived-${index}`);
                const issuedInput = document.getElementById(`laundryIssued-${index}`);
                const noteInput = document.getElementById(`laundryNote-${index}`);
                return {
                    lineNo: line.lineNo,
                    requestedQty: line.requestedQty,
                    receivedQty: Number(receivedInput ? receivedInput.value : (line.laundryReceivedQty || 0)),
                    issuedQty: Number(issuedInput ? issuedInput.value : (line.issuedQty || 0)),
                    laundryNote: noteInput ? noteInput.value.trim() : (line.laundryNote || '')
                };
            });

            const invalid = lines.some(line => line.issuedQty > line.requestedQty && !line.laundryNote);
            if (invalid) {
                Swal.fire({ icon: 'warning', title: 'เธ–เนเธฒเธเนเธฒเธขเน€เธเธดเธเธขเธญเธ”เธ—เธตเนเธเธญ เธ•เนเธญเธเธกเธตเธซเธกเธฒเธขเน€เธซเธ•เธธ' });
                return;
            }

            try {
                const response = await fetch(EXCHANGE_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'issueExchangeRequest',
                        requestId: selectedLaundryRequest.header.requestId,
                        issuerName,
                        note,
                        lines
                    })
                });
                const result = await response.json();
                if (!response.ok || result.status !== 'success') throw new Error(result.message || 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเนเธกเนเธชเธณเน€เธฃเนเธ');
                await fetchAllRequests();
                renderLaundryWorkspace();
                if (isLaundryWard()) await fetchWardRequests();
                if (isLaundryWard()) renderUnitWorkspace();
                await openLaundryRequest(selectedLaundryRequest.header.requestId);
                Swal.fire({ icon: 'success', title: 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเนเธฅเนเธง' });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function renderAdminWorkspace() {
            document.getElementById('adminTotalMetric').innerText = allRequests.length.toLocaleString();
            document.getElementById('adminOpenMetric').innerText = allRequests.filter(row => !['completed', 'cancelled'].includes(row.status)).length.toLocaleString();
            const tbody = document.getElementById('adminBody');
            const rows = allRequests.slice().sort((a, b) => sortByDate(b.updatedAt || b.requestDate, a.updatedAt || a.requestDate));
            tbody.innerHTML = rows.length === 0
                ? `<tr><td colspan="8" style="text-align:center;">เนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃ</td></tr>`
                : rows.map(row => `
                    <tr>
                        <td>${escapeHtml(row.requestNo)}</td>
                        <td>${escapeHtml(row.ward)}</td>
                        <td>${escapeHtml(formatThaiDate(row.requestDate))}</td>
                        <td>${escapeHtml(row.shift)}</td>
                        <td>${renderStatus(row.status)}</td>
                        <td>${row.totalRequested}</td>
                        <td>${row.totalOutstanding}</td>
                        <td><button class="table-btn" onclick="openAdminRequest('${escapeJs(row.requestId)}')">เธ”เธน</button></td>
                    </tr>
                `).join('');
        }

        async function openAdminRequest(requestId) {
            try {
                selectedAdminRequest = await fetchRequestDetail(requestId);
                const card = document.getElementById('adminDetailCard');
                card.classList.remove('hidden');
                card.innerHTML = `
                    <div class="section-head">
                        <div>
                            <h3>${escapeHtml(selectedAdminRequest.header.requestNo)}</h3>
                            <p>${escapeHtml(selectedAdminRequest.header.ward)} | ${escapeHtml(formatThaiDate(selectedAdminRequest.header.requestDate))} | ${renderStatus(selectedAdminRequest.header.status)}</p>
                        </div>
                        <div class="actions" style="margin-top:0;">
                            <button class="ghost-btn" type="button" onclick="printRequestDocument(selectedAdminRequest, 'request')">เธเธดเธกเธเนเนเธเน€เธเธดเธ</button>
                            <button class="ghost-btn" type="button" onclick="printRequestDocument(selectedAdminRequest, 'issue')">เธเธดเธกเธเนเนเธเธเธณเธเนเธฒเธข</button>
                        </div>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>เธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</th>
                                    <th>Par</th>
                                    <th>เธเธเน€เธซเธฅเธทเธญ</th>
                                    <th>เธชเนเธเธเธฑเธ</th>
                                    <th>เธเธญเน€เธเธดเธ</th>
                                    <th>เธฃเธฑเธเธเธฃเธดเธ</th>
                                    <th>เธเนเธฒเธข</th>
                                    <th>เธเธเธเนเธฒเธ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${selectedAdminRequest.lines.map(line => `
                                    <tr>
                                        <td>${escapeHtml(line.itemName)}</td>
                                        <td>${line.parLevel}</td>
                                        <td>${line.stockBalance}</td>
                                        <td>${line.sentLaundryQty}</td>
                                        <td>${line.requestedQty}</td>
                                        <td>${line.laundryReceivedQty || '-'}</td>
                                        <td>${line.issuedQty || '-'}</td>
                                        <td>${line.outstandingQty || 0}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function renderStatus(status) {
            const label = STATUS_LABELS[status] || status || '-';
            return `<span class="status-pill status-${escapeAttribute(status || '')}">${escapeHtml(label)}</span>`;
        }

        function openUsageGuide() {
            document.getElementById('usageGuideModal').classList.remove('hidden');
            document.body.classList.add('guide-open');
        }

        function closeUsageGuide() {
            document.getElementById('usageGuideModal').classList.add('hidden');
            document.body.classList.remove('guide-open');
        }

        function handleGuideBackdrop(event) {
            if (event.target.id === 'usageGuideModal') {
                closeUsageGuide();
            }
        }

        function sortByDate(a, b) {
            return parseDateValue(a) - parseDateValue(b);
        }

        function parseDateValue(value) {
            if (!value) return 0;
            const direct = Date.parse(value);
            if (!Number.isNaN(direct)) return direct;
            const text = String(value).replace(' เธ.', '');
            const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
            if (!match) return 0;
            let year = Number(match[3]);
            if (year > 2400) year -= 543;
            return new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)).getTime();
        }

        async function loadAndPrintRequest(requestId, mode) {
            try {
                const detail = await fetchRequestDetail(requestId);
                printRequestDocument(detail, mode);
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เนเธซเธฅเธ”เน€เธญเธเธชเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function printRequestDocument(detail, mode) {
            const isIssue = mode === 'issue';
            const title = isIssue ? 'เนเธเธเธณเธเนเธฒเธขเธเนเธฒเธชเธฐเธญเธฒเธ”' : 'เนเธเน€เธเธดเธ/เนเธฅเธเธเนเธฒเธชเธฐเธญเธฒเธ”';
            const printableLines = detail.lines.filter(line => Number(line.requestedQty || 0) > 0 || Number(line.sentLaundryQty || 0) > 0);
            const signBlock = isIssue
                ? `
                    <div style="display:flex; justify-content:space-between; gap:24px; margin-top:32px;">
                        <div style="width:32%; text-align:center;">เธเธนเนเธฃเธฑเธเนเธเน€เธเธดเธ<br><br>........................................<br>${escapeHtml(detail.header.laundryReceiverName || '')}</div>
                        <div style="width:32%; text-align:center;">เธเธนเนเธเนเธฒเธขเธเนเธฒ<br><br>........................................<br>${escapeHtml(detail.header.laundryIssuerName || '')}</div>
                        <div style="width:32%; text-align:center;">เธเธนเนเธฃเธฑเธเธเนเธฒ<br><br>........................................<br>${escapeHtml(detail.header.wardReceiverName || '')}</div>
                    </div>
                `
                : `
                    <div style="display:flex; justify-content:flex-end; margin-top:32px;">
                        <div style="width:32%; text-align:center;">เธเธนเนเธชเนเธเนเธเน€เธเธดเธ<br><br>........................................<br>${escapeHtml(detail.header.requesterName || '')}</div>
                    </div>
                `;

            const html = `
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>${title}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700&display=swap');
                        body { font-family: 'Sarabun', sans-serif; padding: 24px; color: #172b4d; }
                        .hospital { text-align: center; font-size: 18px; font-weight: 700; margin-bottom: 6px; }
                        .title { text-align: center; font-size: 20px; font-weight: 700; margin: 0 0 12px 0; }
                        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
                        th, td { border: 1px solid #cbd6e2; padding: 8px; font-size: 12px; }
                        th { background: #edf4fb; }
                        .head { display:flex; justify-content:space-between; gap:24px; }
                        .head div { font-size:13px; line-height:1.8; }
                    </style>
                </head>
                <body>
                    <div class="hospital">เนเธฃเธเธเธขเธฒเธเธฒเธฅเธชเธกเน€เธ”เนเธเธเธฃเธฐเธขเธธเธเธฃเธฒเธเธชเธงเนเธฒเธเนเธ”เธเธ”เธดเธ</div>
                    <div class="title">${title}</div>
                    <div class="head">
                        <div>
                            เน€เธฅเธเธ—เธตเนเนเธเน€เธเธดเธ: ${escapeHtml(detail.header.requestNo)}<br>
                            เธซเธเนเธงเธขเธเธฒเธ: ${escapeHtml(detail.header.ward)}<br>
                            เธงเธฑเธเธ—เธตเน: ${escapeHtml(formatThaiDate(detail.header.requestDate))}<br>
                            เน€เธงเธฃ: ${escapeHtml(detail.header.shift)}
                        </div>
                        <div>
                            เธชเธ–เธฒเธเธฐ: ${escapeHtml(STATUS_LABELS[detail.header.status] || detail.header.status)}<br>
                            เธชเนเธเนเธเน€เธกเธทเนเธญ: ${escapeHtml(formatThaiDateTime(detail.header.submittedAt || '-'))}<br>
                            เธฃเธฑเธเนเธเน€เธกเธทเนเธญ: ${escapeHtml(formatThaiDateTime(detail.header.laundryReceivedAt || '-'))}<br>
                            เธเนเธฒเธขเน€เธกเธทเนเธญ: ${escapeHtml(formatThaiDateTime(detail.header.laundryIssuedAt || '-'))}
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2">เธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</th>
                                <th colspan="5">เธชเนเธงเธเธเธญเธเธซเธเนเธงเธขเธเธนเนเนเธเน</th>
                                <th colspan="4">เธชเนเธงเธเธเธญเธเธเธฒเธเธเธฑเธเธเธญเธ</th>
                            </tr>
                            <tr>
                                <th>Stock</th>
                                <th>เธเธเน€เธซเธฅเธทเธญ</th>
                                <th>เธชเนเธเธเธฑเธ</th>
                                <th>เธเธญเน€เธเธดเธ</th>
                                <th>เธซเธกเธฒเธขเน€เธซเธ•เธธ</th>
                                <th>เธฃเธฑเธเธเธฃเธดเธ</th>
                                <th>เธเนเธฒเธข</th>
                                <th>เธเธเธเนเธฒเธ</th>
                                <th>เธซเธกเธฒเธขเน€เธซเธ•เธธ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(printableLines.length ? printableLines : []).map(line => `
                                <tr>
                                    <td>${escapeHtml(line.itemName)}</td>
                                    <td>${line.parLevel}</td>
                                    <td>${line.stockBalance}</td>
                                    <td>${line.sentLaundryQty}</td>
                                    <td>${line.requestedQty}</td>
                                    <td>${escapeHtml(line.wardNote || '-')}</td>
                                    <td>${line.laundryReceivedQty || '-'}</td>
                                    <td>${line.issuedQty || '-'}</td>
                                    <td>${line.outstandingQty || 0}</td>
                                    <td>${escapeHtml(line.laundryNote || '-')}</td>
                                </tr>
                            `).join('') || `<tr><td colspan="10" style="text-align:center;">เนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธเธญเน€เธเธดเธ</td></tr>`}
                        </tbody>
                    </table>
                    ${signBlock}
                    <script>window.print();<\/script>
                </body>
                </html>
            `;

            const printWindow = window.open('', '_blank');
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
        }

        function ensureExchangeApiReady() {
            if (!EXCHANGE_API || EXCHANGE_API === 'YOUR_CLOTH_EXCHANGE_WEBAPP_URL') {
                throw new Error('เธเธฃเธธเธ“เธฒเธ•เธฑเนเธเธเนเธฒ EXCHANGE_API เนเธเนเธเธฅเน cloth-exchange.html');
            }
        }

        function switchPanel(sectionId, panelId, button) {
            document.querySelectorAll(`#${sectionId} .panel`).forEach(panel => panel.classList.remove('active'));
            document.getElementById(panelId).classList.add('active');
            if (button) {
                document.querySelectorAll(`#${sectionId} .tab-btn`).forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            }
        }

        function showAdminLogin() {
            Swal.fire({
                title: 'เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ Admin',
                html: `<input type="password" id="adminPass" class="swal2-input" placeholder="เธฃเธซเธฑเธชเธเนเธฒเธ">`,
                showCancelButton: true,
                confirmButtonText: 'เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ',
                cancelButtonText: 'เธขเธเน€เธฅเธดเธ',
                preConfirm: () => {
                    const password = document.getElementById('adminPass').value.trim();
                    if (password !== ADMIN_PASSWORD) {
                        Swal.showValidationMessage('เธฃเธซเธฑเธชเธเนเธฒเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ');
                        return false;
                    }
                    return true;
                }
            }).then(async result => {
                if (!result.isConfirmed) return;
                currentRole = 'admin';
                sessionStorage.setItem(SESSION_KEYS.role, 'admin');
                updateHeader();
                setLoading(true, 'เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ');
                await loadAdminWorkspace();
                setLoading(false);
            });
        }

        function exitAdminMode() {
            currentRole = 'user';
            sessionStorage.setItem(SESSION_KEYS.role, 'user');
            if (currentWard) {
                window.location.href = `${window.location.pathname}?ward=${encodeURIComponent(currentWard)}`;
            } else {
                window.location.href = 'index.html';
            }
        }

        function goHome() {
            window.location.href = 'index.html';
        }

        function reloadPage() {
            window.location.reload();
        }

        function logoutSystem() {
            Swal.fire({
                title: 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธ?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'เธขเธทเธเธขเธฑเธ',
                cancelButtonText: 'เธขเธเน€เธฅเธดเธ'
            }).then(result => {
                if (!result.isConfirmed) return;
                sessionStorage.removeItem(SESSION_KEYS.ward);
                sessionStorage.removeItem(SESSION_KEYS.role);
                window.location.href = 'index.html';
            });
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function escapeAttribute(value) {
            return escapeHtml(value).replace(/`/g, '&#96;');
        }

        function escapeJs(value) {
            return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        }

        function formatThaiDate(value) {
            const date = parseToDate(value);
            if (!date) return value || '-';
            return new Intl.DateTimeFormat('th-TH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }).format(date);
        }

        function formatThaiDateTime(value) {
            const date = parseToDate(value);
            if (!date) return value || '-';
            return new Intl.DateTimeFormat('th-TH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        }

        function parseToDate(value) {
            if (!value || value === '-') return null;
            if (value instanceof Date) return value;
            const direct = new Date(value);
            if (!Number.isNaN(direct.getTime())) return direct;
            const text = String(value).replace(' เธ.', '').trim();
            const isoLike = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoLike) {
                return new Date(Number(isoLike[1]), Number(isoLike[2]) - 1, Number(isoLike[3]));
            }
            const thaiLike = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
            if (!thaiLike) return null;
            let year = Number(thaiLike[3]);
            if (year > 2400) year -= 543;
            return new Date(
                year,
                Number(thaiLike[2]) - 1,
                Number(thaiLike[1]),
                Number(thaiLike[4] || 0),
                Number(thaiLike[5] || 0),
                Number(thaiLike[6] || 0)
            );
        }

        function getExchangeDisplayLines(lines) {
            return (Array.isArray(lines) ? lines : [])
                .map((line, index) => ({ ...line, _index: index }))
                .filter(line => Number(line.requestedQty || 0) > 0 || Number(line.sentLaundryQty || 0) > 0);
        }

        let editableUnitLines = [];

        function getStatusLabel(status) {
            const labelMap = {
                draft: 'เธเธเธฑเธเธฃเนเธฒเธ',
                submitted: 'เธฃเธญเธเธฑเธเธเธญเธเธฃเธฑเธเนเธเน€เธเธดเธ',
                received: 'เธเธดเธงเธฃเธญเธเนเธฒเธขเธเนเธฒ',
                processing: 'เธเธดเธงเธฃเธญเธเนเธฒเธขเธเนเธฒ',
                partial_issued: 'เธเนเธฒเธขเนเธฅเนเธงเธฃเธญเธซเธเนเธงเธขเธเธฒเธเธฅเธเธฃเธฑเธ',
                issued_waiting_receipt: 'เธเนเธฒเธขเนเธฅเนเธงเธฃเธญเธซเธเนเธงเธขเธเธฒเธเธฅเธเธฃเธฑเธ',
                completed: 'เน€เธชเธฃเนเธเธชเธดเนเธ',
                cancelled: 'เธขเธเน€เธฅเธดเธ'
            };
            return labelMap[status] || STATUS_LABELS[status] || status || '-';
        }

        function renderStatus(status) {
            const label = getStatusLabel(status);
            return `<span class="status-pill status-${escapeAttribute(status || '')}">${escapeHtml(label)}</span>`;
        }

        async function loadAndPrintRequest(requestId, mode) {
            try {
                const detail = await withLoadingPopup('เธเธณเธฅเธฑเธเน€เธ•เธฃเธตเธขเธกเน€เธญเธเธชเธฒเธฃ...', async () => fetchRequestDetail(requestId));
                printRequestDocument(detail, mode);
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เนเธซเธฅเธ”เน€เธญเธเธชเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        async function printSelectedRequest(detail, mode) {
            if (!detail) return;
            await withLoadingPopup('เธเธณเธฅเธฑเธเน€เธ•เธฃเธตเธขเธกเน€เธญเธเธชเธฒเธฃ...', async () => detail);
            printRequestDocument(detail, mode);
        }

        function getFilteredLaundryRequests() {
            const keyword = (document.getElementById('laundrySearchInput')?.value || '').trim().toLowerCase();
            const startDate = document.getElementById('laundryDateStart')?.value || '';
            const endDate = document.getElementById('laundryDateEnd')?.value || '';

            return allRequests.filter(row => {
                const textMatch = !keyword || [row.requestNo, row.ward].some(value => String(value || '').toLowerCase().includes(keyword));
                if (!textMatch) return false;

                const requestDate = parseToDate(row.requestDate);
                if (startDate) {
                    const start = parseToDate(startDate);
                    if (requestDate && start && requestDate < start) return false;
                }
                if (endDate) {
                    const end = parseToDate(endDate);
                    if (requestDate && end) {
                        end.setHours(23, 59, 59, 999);
                        if (requestDate > end) return false;
                    }
                }
                return true;
            }).sort((a, b) => sortByDate(b.updatedAt || b.requestDate, a.updatedAt || a.requestDate));
        }

        function renderLaundryRows(rows, bodyId, mode) {
            const tbody = document.getElementById(bodyId);
            if (!tbody) return;

            if (!rows.length) {
                const colspan = mode === 'receive' ? 6 : 7;
                tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;">เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃ</td></tr>`;
                return;
            }

            tbody.innerHTML = rows.map(row => `
                <tr>
                    <td>${escapeHtml(row.requestNo)}</td>
                    <td>${escapeHtml(row.ward)}</td>
                    <td>${escapeHtml(formatThaiDate(row.requestDate))}</td>
                    <td>${escapeHtml(row.shift || '-')}</td>
                    <td>${mode === 'receipt' ? row.totalIssued : row.totalRequested}</td>
                    ${mode === 'receive' ? '' : `<td>${row.totalOutstanding}</td>`}
                    <td><button class="table-btn" onclick="openLaundryRequest('${escapeJs(row.requestId)}')">เน€เธเธดเธ”เธ”เธน</button></td>
                </tr>
            `).join('');
        }

        function renderLaundryWorkspace() {
            const filteredRows = getFilteredLaundryRequests();
            const waitReceiveRows = filteredRows.filter(row => row.status === 'submitted');
            const waitIssueRows = filteredRows.filter(row => ['received', 'processing'].includes(row.status));
            const waitReceiptRows = filteredRows.filter(row => ['partial_issued', 'issued_waiting_receipt'].includes(row.status));
            const historyRows = filteredRows.filter(row => ['completed', 'cancelled'].includes(row.status));

            const legacyTabs = document.getElementById('laundryLegacyTabs');
            const legacyQueueCard = document.getElementById('laundryQueueBody')?.closest('.card');
            const legacyDetailCard = document.getElementById('laundryDetailCard');
            const legacyHistoryPanel = document.getElementById('laundryHistory');
            if (legacyTabs) legacyTabs.classList.add('hidden');
            if (legacyQueueCard) legacyQueueCard.classList.add('hidden');
            if (legacyDetailCard) legacyDetailCard.classList.add('hidden');
            if (legacyHistoryPanel) legacyHistoryPanel.classList.add('hidden');

            document.getElementById('laundryPendingReceiveMetric').innerText = waitReceiveRows.length.toLocaleString();
            document.getElementById('laundryPendingIssueMetric').innerText = waitIssueRows.length.toLocaleString();
            document.getElementById('laundryPendingReceiptMetric').innerText = waitReceiptRows.length.toLocaleString();
            document.getElementById('laundryPendingReceiveCount').innerText = `${waitReceiveRows.length.toLocaleString()} เธฃเธฒเธขเธเธฒเธฃ`;
            document.getElementById('laundryPendingIssueCount').innerText = `${waitIssueRows.length.toLocaleString()} เธฃเธฒเธขเธเธฒเธฃ`;
            document.getElementById('laundryPendingReceiptCount').innerText = `${waitReceiptRows.length.toLocaleString()} เธฃเธฒเธขเธเธฒเธฃ`;

            renderLaundryRows(waitReceiveRows, 'laundryPendingReceiveBody', 'receive');
            renderLaundryRows(waitIssueRows, 'laundryPendingIssueBody', 'issue');
            renderLaundryRows(waitReceiptRows, 'laundryPendingReceiptBody', 'receipt');

            document.getElementById('laundryHistoryBody').innerHTML = historyRows.length === 0
                ? `<tr><td colspan="6" style="text-align:center;">เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃ</td></tr>`
                : historyRows.map(row => `
                    <tr>
                        <td>${escapeHtml(row.requestNo)}</td>
                        <td>${escapeHtml(row.ward)}</td>
                        <td>${escapeHtml(formatThaiDate(row.requestDate))}</td>
                        <td>${renderStatus(row.status)}</td>
                        <td>${row.totalIssued}</td>
                        <td><button class="table-btn" onclick="openLaundryRequest('${escapeJs(row.requestId)}')">เน€เธเธดเธ”เธ”เธน</button></td>
                    </tr>
                `).join('');
        }

        function applyLaundryFilters() {
            renderLaundryWorkspace();
        }

        function resetLaundryFilters() {
            const searchInput = document.getElementById('laundrySearchInput');
            const startInput = document.getElementById('laundryDateStart');
            const endInput = document.getElementById('laundryDateEnd');
            if (searchInput) searchInput.value = '';
            if (startInput) startInput.value = '';
            if (endInput) endInput.value = '';
            renderLaundryWorkspace();
        }

        async function refreshLaundryWorkspace() {
            try {
                await withLoadingPopup('เธเธณเธฅเธฑเธเธฃเธตเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเธเธฑเธเธเธญเธ...', async () => {
                    await fetchAllRequests();
                });
                renderLaundryWorkspace();
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธฃเธตเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function buildUnitDetailHtml(detail) {
            const canConfirm = ['partial_issued', 'issued_waiting_receipt'].includes(detail.header.status);
            const canEdit = detail.header.status === 'submitted' && !detail.header.laundryReceivedAt;

            return `
                <div class="section-head">
                    <div>
                        <h3>เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธเน€เธเธดเธ ${escapeHtml(detail.header.requestNo)}</h3>
                        <p>${escapeHtml(detail.header.ward)} | ${escapeHtml(formatThaiDate(detail.header.requestDate))} | ${renderStatus(detail.header.status)}</p>
                    </div>
                    <div class="inline-actions">
                        <button class="ghost-btn" type="button" onclick="printSelectedRequest(selectedUnitRequest, 'request')">เธเธดเธกเธเนเนเธเน€เธเธดเธ</button>
                        ${canEdit ? `<button class="primary-btn" type="button" onclick="openEditUnitRequest()">เนเธเนเนเธเนเธเน€เธเธดเธ</button>` : ''}
                    </div>
                </div>
                <div class="summary-grid">
                    <div class="summary-box"><small>เธเธนเนเธชเนเธเนเธเน€เธเธดเธ</small><strong>${escapeHtml(detail.header.requesterName || '-')}</strong></div>
                    <div class="summary-box"><small>เธเธฑเธเธเธญเธเธฃเธฑเธเนเธเน€เธเธดเธ</small><strong>${escapeHtml(detail.header.laundryReceiverName || '-')}</strong></div>
                    <div class="summary-box"><small>เธเธนเนเธเนเธฒเธขเธเนเธฒ</small><strong>${escapeHtml(detail.header.laundryIssuerName || '-')}</strong></div>
                    <div class="summary-box"><small>เน€เธงเธฅเธฒเธฅเนเธฒเธชเธธเธ”</small><strong>${escapeHtml(formatThaiDateTime(detail.header.lastUpdatedAt || detail.header.submittedAt || '-'))}</strong></div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>เธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</th>
                                <th>Par</th>
                                <th>เธเธเน€เธซเธฅเธทเธญ</th>
                                <th>เธชเนเธเธเธฑเธ</th>
                                <th>เนเธเธฐเธเธณ</th>
                                <th>เธเธญเน€เธเธดเธ</th>
                                <th>เธฃเธฑเธเธเธฃเธดเธ</th>
                                <th>เธเนเธฒเธข</th>
                                <th>เธเธเธเนเธฒเธ</th>
                                <th>เธซเธกเธฒเธขเน€เธซเธ•เธธ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${detail.lines.map(line => `
                                <tr>
                                    <td>${escapeHtml(line.itemName)}</td>
                                    <td>${line.parLevel}</td>
                                    <td>${line.stockBalance}</td>
                                    <td>${line.sentLaundryQty}</td>
                                    <td>${line.suggestedQty}</td>
                                    <td>${line.requestedQty}</td>
                                    <td>${line.laundryReceivedQty || '-'}</td>
                                    <td>${line.issuedQty || '-'}</td>
                                    <td>${line.outstandingQty || 0}</td>
                                    <td>${escapeHtml(line.laundryNote || line.wardNote || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${canConfirm ? `
                    <div class="field-grid">
                        <label class="field">
                            เธเธนเนเธฃเธฑเธเธเนเธฒ
                            <input type="text" id="wardReceiverName" placeholder="เธเธทเนเธญ-เธเธฒเธกเธชเธเธธเธฅ">
                        </label>
                        <label class="field">
                            เธซเธกเธฒเธขเน€เธซเธ•เธธ
                            <textarea id="wardReceiptNote" placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฒเธฃเธฃเธฑเธเธเนเธฒ"></textarea>
                        </label>
                    </div>
                    <div class="modal-form-actions">
                        <button class="primary-btn" type="button" onclick="confirmWardReceipt()">เธฅเธเธฃเธฑเธเธเนเธฒ</button>
                    </div>
                ` : ''}
            `;
        }

        function getEditableRequestLines(detail) {
            const sourceItems = masterItems.length
                ? masterItems.map(item => ({
                    itemName: item.itemName,
                    mainCategory: item.mainCategory,
                    parLevel: Number(item.parLevel || 0)
                }))
                : detail.lines.map(line => ({
                    itemName: line.itemName,
                    mainCategory: line.mainCategory,
                    parLevel: Number(line.parLevel || 0)
                }));

            const savedByItem = {};
            let maxLineNo = 0;
            detail.lines.forEach(line => {
                savedByItem[line.itemName] = line;
                maxLineNo = Math.max(maxLineNo, Number(line.lineNo || 0));
            });

            return sourceItems.map((item, index) => {
                const saved = savedByItem[item.itemName] || {};
                const parLevel = Number(saved.parLevel ?? item.parLevel ?? 0);
                const stockBalance = Number(saved.stockBalance || 0);
                return {
                    lineNo: Number(saved.lineNo || (maxLineNo + index + 1)),
                    itemName: item.itemName,
                    mainCategory: saved.mainCategory || item.mainCategory || item.itemName,
                    parLevel,
                    stockBalance,
                    sentLaundryQty: Number(saved.sentLaundryQty || 0),
                    suggestedQty: Number(saved.suggestedQty ?? Math.max(parLevel - stockBalance, 0)),
                    requestedQty: Number(saved.requestedQty || 0),
                    wardNote: saved.wardNote || ''
                };
            });
        }

        function buildEditUnitRequestHtml(detail) {
            editableUnitLines = getEditableRequestLines(detail);
            return `
                <div class="section-head">
                    <div>
                        <h3>เนเธเนเนเธเนเธเน€เธเธดเธ ${escapeHtml(detail.header.requestNo)}</h3>
                        <p>เนเธเนเนเธเนเธ”เนเน€เธเธเธฒเธฐเธเนเธญเธเธ—เธตเนเธเธฑเธเธเธญเธเธเธฐเธฅเธเธฃเธฑเธเนเธเน€เธเธดเธ</p>
                    </div>
                </div>
                <div class="field-grid">
                    <label class="field">
                        เธงเธฑเธเธ—เธตเนเนเธเน€เธเธดเธ
                        <input type="date" id="editRequestDate" value="${escapeAttribute(detail.header.requestDate || '')}">
                    </label>
                    <label class="field">
                        เน€เธงเธฃ
                        <select id="editRequestShift">
                            <option value="">เน€เธฅเธทเธญเธเน€เธงเธฃ</option>
                            <option value="เน€เธเนเธฒ" ${detail.header.shift === 'เน€เธเนเธฒ' ? 'selected' : ''}>เน€เธเนเธฒ</option>
                            <option value="เธเนเธฒเธข" ${detail.header.shift === 'เธเนเธฒเธข' ? 'selected' : ''}>เธเนเธฒเธข</option>
                            <option value="เธ”เธถเธ" ${detail.header.shift === 'เธ”เธถเธ' ? 'selected' : ''}>เธ”เธถเธ</option>
                        </select>
                    </label>
                    <label class="field">
                        เธเธนเนเธชเนเธเนเธเน€เธเธดเธ
                        <input type="text" id="editRequesterName" value="${escapeAttribute(detail.header.requesterName || '')}">
                    </label>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>เธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</th>
                                <th>Par</th>
                                <th>เธเธเน€เธซเธฅเธทเธญ</th>
                                <th>เธชเนเธเธเธฑเธ</th>
                                <th>เนเธเธฐเธเธณ</th>
                                <th>เธเธญเน€เธเธดเธ</th>
                                <th>เธซเธกเธฒเธขเน€เธซเธ•เธธ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${editableUnitLines.map((line, index) => `
                                <tr>
                                    <td>
                                        ${escapeHtml(line.itemName)}
                                        <input type="hidden" id="edit-lineNo-${index}" value="${line.lineNo}">
                                        <input type="hidden" id="edit-itemName-${index}" value="${escapeAttribute(line.itemName)}">
                                        <input type="hidden" id="edit-mainCategory-${index}" value="${escapeAttribute(line.mainCategory)}">
                                        <input type="hidden" id="edit-par-${index}" value="${line.parLevel}">
                                    </td>
                                    <td>${line.parLevel}</td>
                                    <td><input class="number-input" type="number" min="0" id="edit-stock-${index}" value="${line.stockBalance}" oninput="recalculateEditableLine(${index})"></td>
                                    <td><input class="number-input" type="number" min="0" id="edit-sent-${index}" value="${line.sentLaundryQty}"></td>
                                    <td><input class="number-input" type="number" id="edit-suggested-${index}" value="${line.suggestedQty}" readonly></td>
                                    <td><input class="number-input" type="number" min="0" id="edit-requested-${index}" value="${line.requestedQty}"></td>
                                    <td><input class="text-input" type="text" id="edit-note-${index}" value="${escapeAttribute(line.wardNote || '')}"></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-form-actions">
                    <button class="ghost-btn" type="button" onclick="openUnitRequest('${escapeJs(detail.header.requestId)}')">เธขเธเน€เธฅเธดเธ</button>
                    <button class="primary-btn" type="button" onclick="saveUnitRequestEdit()">เธเธฑเธเธ—เธถเธเธเธฒเธฃเนเธเนเนเธ</button>
                </div>
            `;
        }

        function recalculateEditableLine(index) {
            const par = Number(document.getElementById(`edit-par-${index}`).value || 0);
            const stock = Number(document.getElementById(`edit-stock-${index}`).value || 0);
            document.getElementById(`edit-suggested-${index}`).value = Math.max(par - stock, 0);
        }

        async function openUnitRequest(requestId) {
            try {
                selectedUnitRequest = await withLoadingPopup('เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธเน€เธเธดเธ...', async () => fetchRequestDetail(requestId));
                openRecordModal(
                    `เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ” ${selectedUnitRequest.header.requestNo}`,
                    'เธเนเธญเธกเธนเธฅเนเธเน€เธเธดเธเธเธญเธเธซเธเนเธงเธขเธเธฒเธ เนเธชเธ”เธเนเธเธฃเธนเธเนเธเธเธเนเธญเธเธญเธฑเธเธเธฅเธฒเธเธเธญ',
                    buildUnitDetailHtml(selectedUnitRequest)
                );
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function openEditUnitRequest() {
            if (!selectedUnitRequest) return;
            openRecordModal(
                `เนเธเนเนเธ ${selectedUnitRequest.header.requestNo}`,
                'เนเธเนเนเธเธเนเธญเธกเธนเธฅเนเธเน€เธเธดเธเธเนเธญเธเธเธฑเธเธเธญเธเธฃเธฑเธเนเธ',
                buildEditUnitRequestHtml(selectedUnitRequest)
            );
        }

        async function saveUnitRequestEdit() {
            if (!selectedUnitRequest) return;

            const requesterName = document.getElementById('editRequesterName').value.trim();
            const requestDate = document.getElementById('editRequestDate').value;
            const shift = document.getElementById('editRequestShift').value;
            if (!requesterName || !requestDate || !shift) {
                Swal.fire({ icon: 'warning', title: 'เธเธฃเธญเธเธเนเธญเธกเธนเธฅเนเธซเนเธเธฃเธ' });
                return;
            }

            const lines = editableUnitLines.map((line, index) => {
                const stockBalance = Number(document.getElementById(`edit-stock-${index}`).value || 0);
                const sentLaundryQty = Number(document.getElementById(`edit-sent-${index}`).value || 0);
                const requestedQty = Number(document.getElementById(`edit-requested-${index}`).value || 0);
                const wardNote = document.getElementById(`edit-note-${index}`).value.trim();
                const parLevel = Number(document.getElementById(`edit-par-${index}`).value || 0);
                return {
                    lineNo: Number(document.getElementById(`edit-lineNo-${index}`).value || line.lineNo),
                    itemName: document.getElementById(`edit-itemName-${index}`).value,
                    mainCategory: document.getElementById(`edit-mainCategory-${index}`).value,
                    parLevel,
                    stockBalance,
                    sentLaundryQty,
                    suggestedQty: Math.max(parLevel - stockBalance, 0),
                    requestedQty,
                    wardNote
                };
            });

            if (!lines.some(line => line.requestedQty > 0 || line.stockBalance > 0 || line.sentLaundryQty > 0 || line.wardNote)) {
                Swal.fire({ icon: 'warning', title: 'เธขเธฑเธเนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธเธญเน€เธเธดเธ' });
                return;
            }

            const overs = lines.filter(line => line.requestedQty > line.suggestedQty && !line.wardNote);
            if (overs.length) {
                Swal.fire({ icon: 'warning', title: 'เธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธเธญเน€เธเธดเธเธเธณเธเธงเธเนเธเธฐเธเธณเธ•เนเธญเธเธกเธตเธซเธกเธฒเธขเน€เธซเธ•เธธ' });
                return;
            }

            try {
                await withLoadingPopup('เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธเธเธฒเธฃเนเธเนเนเธ...', async () => {
                    const response = await fetch(EXCHANGE_API, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'updateExchangeRequest',
                            requestId: selectedUnitRequest.header.requestId,
                            ward: currentWard,
                            requestDate,
                            shift,
                            requesterName,
                            lines
                        })
                    });
                    const result = await response.json();
                    if (!response.ok || result.status !== 'success') {
                        throw new Error(result.message || 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเนเธเนเนเธเนเธกเนเธชเธณเน€เธฃเนเธ');
                    }
                });

                await fetchWardRequests();
                renderUnitWorkspace();
                await openUnitRequest(selectedUnitRequest.header.requestId);
                Swal.fire({ icon: 'success', title: 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเนเธเนเนเธเนเธฅเนเธง' });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเนเธเนเนเธเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        async function confirmWardReceipt() {
            if (!selectedUnitRequest) return;
            const receiverName = document.getElementById('wardReceiverName')?.value.trim() || '';
            const note = document.getElementById('wardReceiptNote')?.value.trim() || '';
            if (!receiverName) {
                Swal.fire({ icon: 'warning', title: 'เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธเธนเนเธฃเธฑเธเธเนเธฒ' });
                return;
            }

            try {
                await withLoadingPopup('เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธเธเธฒเธฃเธฅเธเธฃเธฑเธเธเนเธฒ...', async () => {
                    const response = await fetch(EXCHANGE_API, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'confirmExchangeReceipt',
                            requestId: selectedUnitRequest.header.requestId,
                            receiverName,
                            note
                        })
                    });
                    const result = await response.json();
                    if (!response.ok || result.status !== 'success') throw new Error(result.message || 'เธฅเธเธฃเธฑเธเธเนเธฒเนเธกเนเธชเธณเน€เธฃเนเธ');
                });

                await fetchWardRequests();
                renderUnitWorkspace();
                await openUnitRequest(selectedUnitRequest.header.requestId);
                Swal.fire({ icon: 'success', title: 'เธฅเธเธฃเธฑเธเธเนเธฒเนเธฅเนเธง' });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธฅเธเธฃเธฑเธเธเนเธฒเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function buildLaundryDetailHtml(detail) {
            const visibleLines = getExchangeDisplayLines(detail.lines);
            const canReceive = detail.header.status === 'submitted';
            const canIssue = ['received', 'processing'].includes(detail.header.status);
            const isWaitingUnit = ['partial_issued', 'issued_waiting_receipt'].includes(detail.header.status);

            return `
                <div class="section-head">
                    <div>
                        <h3>เธเธฒเธเธเธฑเธเธเธญเธ ${escapeHtml(detail.header.requestNo)}</h3>
                        <p>${escapeHtml(detail.header.ward)} | ${escapeHtml(formatThaiDate(detail.header.requestDate))} | ${renderStatus(detail.header.status)}</p>
                    </div>
                    <div class="inline-actions">
                        <button class="ghost-btn" type="button" onclick="printSelectedRequest(selectedLaundryRequest, 'request')">เธเธดเธกเธเนเนเธเน€เธเธดเธ</button>
                        <button class="ghost-btn" type="button" onclick="printSelectedRequest(selectedLaundryRequest, 'issue')">เธเธดเธกเธเนเนเธเธเธณเธเนเธฒเธข</button>
                    </div>
                </div>
                <div class="summary-grid">
                    <div class="summary-box"><small>เธซเธเนเธงเธขเธเธฒเธ</small><strong>${escapeHtml(detail.header.ward)}</strong></div>
                    <div class="summary-box"><small>เธเธนเนเธฃเธฑเธเนเธเน€เธเธดเธ</small><strong>${escapeHtml(detail.header.laundryReceiverName || '-')}</strong></div>
                    <div class="summary-box"><small>เธเธนเนเธเนเธฒเธขเธเนเธฒ</small><strong>${escapeHtml(detail.header.laundryIssuerName || '-')}</strong></div>
                    <div class="summary-box"><small>เธญเธฑเธเน€เธ”เธ•เธฅเนเธฒเธชเธธเธ”</small><strong>${escapeHtml(formatThaiDateTime(detail.header.lastUpdatedAt || '-'))}</strong></div>
                </div>
                <div class="field-grid">
                    ${(canReceive || canIssue) ? `
                        <label class="field">
                            ${canReceive ? 'เธเธนเนเธฃเธฑเธเนเธเน€เธเธดเธ' : 'เธเธนเนเธเนเธฒเธขเธเนเธฒ'}
                            <input type="text" id="${canReceive ? 'laundryReceiverName' : 'laundryIssuerName'}" value="${escapeAttribute(canReceive ? (detail.header.laundryReceiverName || '') : (detail.header.laundryIssuerName || ''))}">
                        </label>
                        <label class="field">
                            เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฑเธเธเธญเธ
                            <textarea id="laundryHeaderNote" placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธเธฃเธงเธก"></textarea>
                        </label>
                    ` : `
                        <div class="summary-box"><small>เธเธนเนเธฃเธฑเธเนเธเน€เธเธดเธ</small><strong>${escapeHtml(detail.header.laundryReceiverName || '-')}</strong></div>
                        <div class="summary-box"><small>เธเธนเนเธเนเธฒเธขเธเนเธฒ</small><strong>${escapeHtml(detail.header.laundryIssuerName || '-')}</strong></div>
                    `}
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>เธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</th>
                                <th class="ward-head">Par</th>
                                <th class="ward-head">เธเธเน€เธซเธฅเธทเธญ</th>
                                <th class="ward-head">เธชเนเธเธเธฑเธ</th>
                                <th class="ward-head">เธเธญเน€เธเธดเธ</th>
                                <th class="laundry-head">เธเนเธฒเธข</th>
                                <th class="laundry-head">เธเธเธเนเธฒเธ</th>
                                <th class="laundry-head">เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฑเธเธเธญเธ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${visibleLines.length === 0 ? `
                                <tr><td colspan="8" style="text-align:center;">เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</td></tr>
                            ` : visibleLines.map(line => `
                                <tr>
                                    <td>${escapeHtml(line.itemName)}</td>
                                    <td class="ward-col">${line.parLevel}</td>
                                    <td class="ward-col">${line.stockBalance}</td>
                                    <td class="ward-col">${line.sentLaundryQty}</td>
                                    <td class="ward-col">${line.requestedQty}</td>
                                    <td class="laundry-col">
                                        ${canIssue
                                            ? `<input class="number-input" type="number" min="0" value="${line.issuedQty > 0 ? line.issuedQty : ''}" placeholder="เธเนเธฒเธข" id="laundryIssued-${line._index}" oninput="recalculateLaundryOutstanding(${line._index}, ${line.requestedQty})">`
                                            : `${line.issuedQty || '-'}`
                                        }
                                    </td>
                                    <td class="laundry-col">
                                        ${canIssue
                                            ? `<input class="number-input" type="number" value="${line.outstandingQty || 0}" id="laundryOutstanding-${line._index}" readonly>`
                                            : `${line.outstandingQty || 0}`
                                        }
                                    </td>
                                    <td class="laundry-col">
                                        ${canIssue
                                            ? `<input class="text-input" type="text" value="${escapeAttribute(line.laundryNote || '')}" id="laundryNote-${line._index}" placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฑเธเธเธญเธ">`
                                            : `${escapeHtml(line.laundryNote || '-')}`
                                        }
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${canReceive ? `
                    <div class="modal-form-actions">
                        <button class="primary-btn" type="button" onclick="receiveRequestAtLaundry()">เธฅเธเธฃเธฑเธเนเธเน€เธเธดเธ</button>
                    </div>
                ` : ''}
                ${canIssue ? `
                    <div class="modal-form-actions">
                        <button class="primary-btn" type="button" onclick="issueRequestAtLaundry()">เธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเธเนเธฒ</button>
                    </div>
                ` : ''}
                ${isWaitingUnit ? `<p class="muted-text">เธฃเธฒเธขเธเธฒเธฃเธเธตเนเธเนเธฒเธขเธเนเธฒเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง เนเธฅเธฐเธเธณเธฅเธฑเธเธฃเธญเนเธซเนเธซเธเนเธงเธขเธเธฒเธเธฅเธเธฃเธฑเธเธเนเธฒเนเธเธฃเธฐเธเธ</p>` : ''}
            `;
        }

        async function openLaundryRequest(requestId) {
            try {
                selectedLaundryRequest = await withLoadingPopup('เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธเธฒเธเธเธฑเธเธเธญเธ...', async () => fetchRequestDetail(requestId));
                openRecordModal(
                    `เธเธฒเธเธเธฑเธเธเธญเธ ${selectedLaundryRequest.header.requestNo}`,
                    'เน€เธเธดเธ”เธ”เธนเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธฅเธฐเธ—เธณเธฃเธฒเธขเธเธฒเธฃเนเธเธฃเธนเธเนเธเธเธเนเธญเธเธญเธฑเธเธเธฅเธฒเธเธเธญ',
                    buildLaundryDetailHtml(selectedLaundryRequest)
                );
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        async function receiveRequestAtLaundry() {
            if (!selectedLaundryRequest) return;
            const receiverName = document.getElementById('laundryReceiverName')?.value.trim() || '';
            const note = document.getElementById('laundryHeaderNote')?.value.trim() || '';
            if (!receiverName) {
                Swal.fire({ icon: 'warning', title: 'เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธเธนเนเธฃเธฑเธเนเธเน€เธเธดเธ' });
                return;
            }

            try {
                await withLoadingPopup('เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธเธฃเธฑเธเนเธเน€เธเธดเธ...', async () => {
                    const response = await fetch(EXCHANGE_API, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'receiveExchangeRequest',
                            requestId: selectedLaundryRequest.header.requestId,
                            receiverName,
                            note
                        })
                    });
                    const result = await response.json();
                    if (!response.ok || result.status !== 'success') throw new Error(result.message || 'เธฅเธเธฃเธฑเธเนเธเนเธกเนเธชเธณเน€เธฃเนเธ');
                });

                await fetchAllRequests();
                renderLaundryWorkspace();
                await openLaundryRequest(selectedLaundryRequest.header.requestId);
                Swal.fire({ icon: 'success', title: 'เธฅเธเธฃเธฑเธเนเธเน€เธเธดเธเนเธฅเนเธง' });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธฅเธเธฃเธฑเธเนเธเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        async function issueRequestAtLaundry() {
            if (!selectedLaundryRequest) return;
            const issuerName = document.getElementById('laundryIssuerName')?.value.trim() || '';
            const note = document.getElementById('laundryHeaderNote')?.value.trim() || '';
            if (!issuerName) {
                Swal.fire({ icon: 'warning', title: 'เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธเธนเนเธเนเธฒเธขเธเนเธฒ' });
                return;
            }

            const lines = selectedLaundryRequest.lines.map((line, index) => {
                const issuedInput = document.getElementById(`laundryIssued-${index}`);
                const noteInput = document.getElementById(`laundryNote-${index}`);
                return {
                    lineNo: line.lineNo,
                    requestedQty: line.requestedQty,
                    issuedQty: Number(issuedInput ? issuedInput.value : (line.issuedQty || 0)),
                    laundryNote: noteInput ? noteInput.value.trim() : (line.laundryNote || '')
                };
            });

            const invalid = lines.some(line => line.issuedQty > line.requestedQty && !line.laundryNote);
            if (invalid) {
                Swal.fire({ icon: 'warning', title: 'เธ–เนเธฒเธเนเธฒเธขเน€เธเธดเธเธขเธญเธ”เธ—เธตเนเธเธญ เธ•เนเธญเธเธกเธตเธซเธกเธฒเธขเน€เธซเธ•เธธ' });
                return;
            }

            try {
                await withLoadingPopup('เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเธเนเธฒ...', async () => {
                    const response = await fetch(EXCHANGE_API, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'issueExchangeRequest',
                            requestId: selectedLaundryRequest.header.requestId,
                            issuerName,
                            note,
                            lines
                        })
                    });
                    const result = await response.json();
                    if (!response.ok || result.status !== 'success') throw new Error(result.message || 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเนเธกเนเธชเธณเน€เธฃเนเธ');
                });

                await fetchAllRequests();
                renderLaundryWorkspace();
                await openLaundryRequest(selectedLaundryRequest.header.requestId);
                Swal.fire({ icon: 'success', title: 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเธเนเธฒเนเธฅเนเธง' });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเธเนเธฒเธขเนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        function buildAdminDetailHtml(detail) {
            return `
                <div class="section-head">
                    <div>
                        <h3>${escapeHtml(detail.header.requestNo)}</h3>
                        <p>${escapeHtml(detail.header.ward)} | ${escapeHtml(formatThaiDate(detail.header.requestDate))} | ${renderStatus(detail.header.status)}</p>
                    </div>
                    <div class="inline-actions">
                        <button class="ghost-btn" type="button" onclick="printSelectedRequest(selectedAdminRequest, 'request')">เธเธดเธกเธเนเนเธเน€เธเธดเธ</button>
                        <button class="ghost-btn" type="button" onclick="printSelectedRequest(selectedAdminRequest, 'issue')">เธเธดเธกเธเนเนเธเธเธณเธเนเธฒเธข</button>
                    </div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>เธฃเธฒเธขเธเธฒเธฃเธเนเธฒ</th>
                                <th>Par</th>
                                <th>เธเธเน€เธซเธฅเธทเธญ</th>
                                <th>เธชเนเธเธเธฑเธ</th>
                                <th>เธเธญเน€เธเธดเธ</th>
                                <th>เธฃเธฑเธเธเธฃเธดเธ</th>
                                <th>เธเนเธฒเธข</th>
                                <th>เธเธเธเนเธฒเธ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${detail.lines.map(line => `
                                <tr>
                                    <td>${escapeHtml(line.itemName)}</td>
                                    <td>${line.parLevel}</td>
                                    <td>${line.stockBalance}</td>
                                    <td>${line.sentLaundryQty}</td>
                                    <td>${line.requestedQty}</td>
                                    <td>${line.laundryReceivedQty || '-'}</td>
                                    <td>${line.issuedQty || '-'}</td>
                                    <td>${line.outstandingQty || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        async function openAdminRequest(requestId) {
            try {
                selectedAdminRequest = await withLoadingPopup('เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”...', async () => fetchRequestDetail(requestId));
                openRecordModal(
                    `เธ เธฒเธเธฃเธงเธก ${selectedAdminRequest.header.requestNo}`,
                    'เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธเน€เธเธดเธเธชเธณเธซเธฃเธฑเธเธเธนเนเธ”เธนเนเธฅเธฃเธฐเธเธ',
                    buildAdminDetailHtml(selectedAdminRequest)
                );
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เนเธซเธฅเธ”เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธกเนเธชเธณเน€เธฃเนเธ', text: error.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”' });
            }
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !document.getElementById('recordModal').classList.contains('hidden')) {
                closeRecordModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !document.getElementById('usageGuideModal').classList.contains('hidden')) {
                closeUsageGuide();
            }
        });
    
