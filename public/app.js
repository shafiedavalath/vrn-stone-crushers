// VRN Stone Crushers Frontend Controller
let currentAccounts = { all: [], customers: [], expenses: [], payables: [], advances: [], sales: [] };
let currentDate = '2026-11-05';
let activeSheet = null;

// DOM Elements
const views = document.querySelectorAll('.view-section');
const navItems = document.querySelectorAll('.nav-item');
const globalDateInput = document.getElementById('globalDateInput');
const globalDayName = document.getElementById('globalDayName');
const topCashBalance = document.getElementById('topCashBalance');
const pageHeaderTitle = document.getElementById('pageHeaderTitle');

// Initialize App
function initApp() {
  setupNavigation();
  setupEventListeners();
  loadAccounts().catch(console.error);
  loadDashboard(currentDate).catch(console.error);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Setup Tab Navigation
function setupNavigation() {
  const items = document.querySelectorAll('.nav-item');
  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.dataset.view;
      if (targetView) {
        switchView(targetView);
      }
    });
  });
}

function switchView(viewName) {
  const allNavs = document.querySelectorAll('.nav-item');
  const allViews = document.querySelectorAll('.view-section');

  allNavs.forEach(nav => {
    if (nav.dataset.view === viewName) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  allViews.forEach(v => {
    v.classList.remove('active');
    v.style.display = 'none';
  });

  const targetSection = document.getElementById(`view-${viewName}`);
  if (targetSection) {
    targetSection.classList.add('active');
    targetSection.style.display = 'block';
  }

  // Always reset scroll to top on view change
  window.scrollTo(0, 0);
  const mainWrapper = document.querySelector('.main-wrapper');
  if (mainWrapper) mainWrapper.scrollTop = 0;

  const titles = {
    'dashboard': 'Operations Dashboard',
    'daily-entry': 'Daily Sheet Entry Grid',
    'raw-import': 'Quick Sheet Ingestion',
    'pnl': 'Profit & Loss Statement (P&L)',
    'customers': 'Customer Ledgers & Debtors Aging',
    'expenses': 'Diesel & Operational Costs',
    'projections': 'Financial Projections & Breakeven Simulator',
    'reports': 'Daily Reports & WhatsApp Briefing',
    'chart-of-accounts': 'Chart of Accounts Directory'
  };
  const titleEl = document.getElementById('pageHeaderTitle');
  if (titleEl) {
    titleEl.textContent = titles[viewName] || 'VRN Stone Crushers';
  }

  // Load relevant data on tab switch with safe error handling
  try {
    if (viewName === 'daily-entry') loadDailyEntrySheet(currentDate);
    else if (viewName === 'pnl') loadPnL(currentDate, 'daily');
    else if (viewName === 'customers') loadCustomerLedgers();
    else if (viewName === 'expenses') loadExpenseAnalytics(currentDate);
    else if (viewName === 'projections') loadProjections();
    else if (viewName === 'reports') loadDailyReport(currentDate);
    else if (viewName === 'chart-of-accounts') renderChartOfAccounts();
    else if (viewName === 'dashboard') loadDashboard(currentDate);
  } catch (err) {
    console.error(`Error loading view ${viewName}:`, err);
  }
}
window.switchView = switchView;

// Event Listeners
function setupEventListeners() {
  document.getElementById('globalDateInput')?.addEventListener('change', async (e) => {
    currentDate = e.target.value;
    updateDayName(currentDate);
    await loadDashboard(currentDate);
  });

  document.getElementById('btnQuickWhatsApp')?.addEventListener('click', () => switchView('reports'));
  document.getElementById('btnNewSheet')?.addEventListener('click', () => switchView('daily-entry'));

  document.getElementById('btnAddSaleRow')?.addEventListener('click', () => addSaleRow());
  document.getElementById('btnAddExpenseRow')?.addEventListener('click', () => addExpenseRow());
  document.getElementById('btnAddOtherRow')?.addEventListener('click', () => addOtherRow());
  document.getElementById('btnSaveDailySheet')?.addEventListener('click', saveDailySheet);

  // Raw import listeners
  document.getElementById('btnUploadOriginalSheet')?.addEventListener('click', uploadOriginalSheet);
  document.getElementById('btnLoadSampleData')?.addEventListener('click', loadSampleRawData);
  document.getElementById('btnImportParsedSheet')?.addEventListener('click', applyParsedToEntryForm);

  // File Drag & Drop
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileUploadInput');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--primary)';
      dropZone.style.background = 'rgba(245, 158, 11, 0.1)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '#475569';
      dropZone.style.background = 'rgba(15, 23, 42, 0.4)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#475569';
      dropZone.style.background = 'rgba(15, 23, 42, 0.4)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        readFileIntoInput(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        readFileIntoInput(e.target.files[0]);
      }
    });
  }

  // PnL toggles
  document.getElementById('pnlToggleDaily')?.addEventListener('click', () => {
    const dBtn = document.getElementById('pnlToggleDaily');
    const mBtn = document.getElementById('pnlToggleMonthly');
    if (dBtn) dBtn.className = 'btn btn-primary btn-sm';
    if (mBtn) mBtn.className = 'btn btn-outline btn-sm';
    loadPnL(currentDate, 'daily');
  });
  document.getElementById('pnlToggleMonthly')?.addEventListener('click', () => {
    const dBtn = document.getElementById('pnlToggleDaily');
    const mBtn = document.getElementById('pnlToggleMonthly');
    if (dBtn) dBtn.className = 'btn btn-outline btn-sm';
    if (mBtn) mBtn.className = 'btn btn-primary btn-sm';
    loadPnL(currentDate, 'monthly');
  });

  // Receipt Modal
  document.getElementById('btnOpenReceiptModal')?.addEventListener('click', openReceiptModal);
  document.getElementById('btnCloseReceiptModal')?.addEventListener('click', closeReceiptModal);
  document.getElementById('btnCancelReceipt')?.addEventListener('click', closeReceiptModal);
  document.getElementById('btnSubmitReceipt')?.addEventListener('click', submitReceipt);

  // Projections Sliders
  ['sliderDailyCap', 'sliderWorkingDays', 'sliderAvgRate', 'sliderFuelPT'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateProjections);
  });

  // Copy WhatsApp Text
  document.getElementById('btnCopyWhatsApp')?.addEventListener('click', () => {
    const preview = document.getElementById('whatsappTextPreview');
    if (!preview) return;
    const text = preview.innerText;
    navigator.clipboard.writeText(text).then(() => {
      alert('WhatsApp summary copied to clipboard! Paste it into WhatsApp.');
    });
  });

  // Search accounts
  document.getElementById('searchAccountInput')?.addEventListener('input', (e) => {
    renderChartOfAccounts(e.target.value);
  });
}

function updateDayName(dateStr) {
  const d = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const name = days[d.getDay()] || '';
  globalDayName.textContent = `(${name})`;
  const entryDay = document.getElementById('entryDayName');
  if (entryDay) entryDay.value = name;
}

// Load Accounts from API
async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts');
    currentAccounts = await res.json();
    populateCustomerDropdown();
  } catch (err) {
    console.error('Error loading accounts:', err);
  }
}

function populateCustomerDropdown() {
  const sel = document.getElementById('receiptCustomerSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Customer --</option>';
  currentAccounts.customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.name} (${c.code})`;
    sel.appendChild(opt);
  });
}

// 1. Load Dashboard
async function loadDashboard(date) {
  try {
    const res = await fetch(`/api/dashboard?date=${date}`);
    const data = await res.json();
    activeSheet = data.sheet;

    // Header Cash Pill
    const closing = data.sheet ? data.sheet.closing_cash : 0;
    topCashBalance.textContent = `₹${closing.toLocaleString('en-IN')}`;

    // Reconciliation Alert
    const rBanner = document.getElementById('reconciliationBanner');
    if (data.reconciliation && data.reconciliation.ok) {
      rBanner.className = 'alert alert-success';
      rBanner.innerHTML = `
        <div>
          <strong>✅ Cash Book Reconciled:</strong> Opening Cash (₹${(data.sheet?.opening_cash || 0).toLocaleString('en-IN')}) + Cash Sales (₹${(data.sheet?.total_cash_sales || 0).toLocaleString('en-IN')}) − Cash Payments (₹${((data.sheet?.total_cash_expenses || 0) + (data.sheet?.total_other_cash_payments || 0)).toLocaleString('en-IN')}) = Closing Cash <strong>₹${closing.toLocaleString('en-IN')}</strong>. All records match!
        </div>
        <span class="badge-tag badge-success">Balanced</span>
      `;
    } else {
      rBanner.className = 'alert alert-warning';
      rBanner.innerHTML = `
        <div>
          <strong>⚠️ Cash Discrepancy:</strong> Calculated Closing Cash does not match entered closing. Difference: ₹${data.reconciliation?.difference || 0}
        </div>
        <span class="badge-tag badge-warning">Check Ledger</span>
      `;
    }

    // Top KPIs
    document.getElementById('dashTotalSales').textContent = `₹${(data.sheet?.total_sales_amount || 0).toLocaleString('en-IN')}`;
    document.getElementById('dashTripsCount').textContent = `${data.salesCount || 0} Trips`;
    document.getElementById('dashCashCredit').textContent = `₹${(data.sheet?.total_cash_sales || 0).toLocaleString('en-IN')} / ₹${(data.sheet?.total_credit_sales || 0).toLocaleString('en-IN')}`;
    document.getElementById('dashTonnage').textContent = `${data.sheet?.total_ton || 0} Ton`;
    document.getElementById('dashExpenses').textContent = `₹${(data.sheet?.total_cash_expenses || 0).toLocaleString('en-IN')}`;
    document.getElementById('dashCashSurplus').textContent = `₹${closing.toLocaleString('en-IN')}`;

    const avgRate = (data.sheet?.total_ton || 0) > 0 ? (data.sheet.total_sales_amount / data.sheet.total_ton) : 0;
    document.getElementById('dashAvgRate').textContent = `₹${avgRate.toFixed(2)}`;

    // Product breakdown table
    const pTbody = document.querySelector('#dashProductTable tbody');
    pTbody.innerHTML = '';
    data.productSummary.forEach(p => {
      const row = document.createElement('tr');
      const avg = p.tonQty > 0 ? (p.tonAmount / p.tonQty).toFixed(2) : (p.cftQty > 0 ? (p.cftAmount / p.cftQty).toFixed(2) + ' / CFT' : '0');
      row.innerHTML = `
        <td><strong style="color: var(--primary);">${p.item}</strong></td>
        <td class="text-right">${p.tonQty > 0 ? p.tonQty.toFixed(2) : '-'}</td>
        <td class="text-right">${p.cftQty > 0 ? p.cftQty : '-'}</td>
        <td class="text-right">₹${p.totalAmount.toLocaleString('en-IN')}</td>
        <td class="text-right" style="color: #38bdf8;">₹${avg}</td>
      `;
      pTbody.appendChild(row);
    });

    // Expense breakdown table
    const eTbody = document.querySelector('#dashExpenseTable tbody');
    eTbody.innerHTML = '';
    const totalExp = Object.values(data.expenseByCategory).reduce((a, b) => a + b, 0);
    for (const [cat, amt] of Object.entries(data.expenseByCategory)) {
      const pct = totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) : 0;
      let comps = 'Miscellaneous running expenses';
      if (cat === 'Fuel') comps = 'JCB, Hitachi & Jeep Diesel';
      if (cat === 'Labor') comps = 'Operator wages & batta';
      if (cat === 'Utilities') comps = 'Water tanker & electricity';
      if (cat === 'Maintenance') comps = 'JCB Bolts, belts & spares';
      if (cat === 'Food') comps = 'Staff mess & meals';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong style="color: #f87171;">${cat}</strong></td>
        <td style="color: var(--text-dark);">${comps}</td>
        <td class="text-right">₹${amt.toLocaleString('en-IN')}</td>
        <td class="text-right"><span class="badge-tag badge-warning">${pct}%</span></td>
      `;
      eTbody.appendChild(row);
    }

    // Month summary cards
    if (data.monthStats) {
      document.getElementById('monthTotalSales').textContent = `₹${data.monthStats.totalSales.toLocaleString('en-IN')}`;
      document.getElementById('monthCashSales').textContent = `₹${data.monthStats.totalCashSales.toLocaleString('en-IN')}`;
      document.getElementById('monthExpenses').textContent = `₹${data.monthStats.totalExpenses.toLocaleString('en-IN')}`;
      document.getElementById('monthTonnage').textContent = `${data.monthStats.totalTon.toFixed(2)} Ton`;
    }

  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

// 2. Daily Sheet Entry View
async function loadDailyEntrySheet(date) {
  try {
    const res = await fetch(`/api/sheet?date=${date}`);
    const data = await res.json();
    
    document.getElementById('entryDate').value = date;
    document.getElementById('entrySheetNo').value = data.sheet?.sheet_no || 275;
    document.getElementById('entryOpeningCash').value = data.sheet?.opening_cash || 0;
    document.getElementById('entryDayName').value = data.sheet?.day_name || 'Thursday';

    const sTbody = document.getElementById('entrySalesTbody');
    sTbody.innerHTML = '';
    if (data.sales && data.sales.length > 0) {
      data.sales.forEach((s, idx) => addSaleRow(s, idx + 1));
    } else {
      addSaleRow({}, 1);
    }

    const eTbody = document.getElementById('entryExpenseTbody');
    eTbody.innerHTML = '';
    if (data.expenses && data.expenses.length > 0) {
      data.expenses.forEach(e => addExpenseRow(e));
    }

    const oTbody = document.getElementById('entryOtherTbody');
    oTbody.innerHTML = '';
    if (data.otherPayments && data.otherPayments.length > 0) {
      data.otherPayments.forEach(o => addOtherRow(o));
    }

    recalcDailyEntryCash();
  } catch (err) {
    console.error('Error loading daily sheet for entry:', err);
  }
}

function addSaleRow(data = {}, rowNum = null) {
  const tbody = document.getElementById('entrySalesTbody');
  const tr = document.createElement('tr');
  const count = rowNum || tbody.children.length + 1;

  const itemOptions = ['M SAND', 'P SAND', 'DUST', '20 MM', 'SLURRY'].map(item => 
    `<option value="${item}" ${data.item === item ? 'selected' : ''}>${item}</option>`
  ).join('');

  const unitOptions = ['Ton', 'CFT'].map(u => 
    `<option value="${u}" ${data.unit === u ? 'selected' : ''}>${u}</option>`
  ).join('');

  const modeOptions = ['Cash', 'Credit', 'Bank'].map(m => 
    `<option value="${m}" ${data.payment_mode === m ? 'selected' : ''}>${m}</option>`
  ).join('');

  // Customer dropdown
  let custOptions = '<option value="">-- No Customer (Cash) --</option>';
  currentAccounts.customers.forEach(c => {
    custOptions += `<option value="${c.name}" ${data.customer_ledger === c.name ? 'selected' : ''}>${c.name}</option>`;
  });

  tr.innerHTML = `
    <td style="color: var(--text-dark);">${count}</td>
    <td><input type="text" class="table-input" name="gp_no" value="${data.gp_no || ''}" style="width: 70px;"></td>
    <td><input type="text" class="table-input" name="vehicle_no" value="${data.vehicle_no || ''}" placeholder="e.g. KA14B 3300" style="width: 140px;" required></td>
    <td><select class="table-input" name="item">${itemOptions}</select></td>
    <td><select class="table-input" name="unit" style="width: 65px;">${unitOptions}</select></td>
    <td><input type="number" step="0.01" class="table-input qty-input" name="quantity" value="${data.quantity || ''}" style="width: 80px;"></td>
    <td><input type="number" step="1" class="table-input amount-input" name="amount" value="${data.amount || ''}" style="width: 100px;" required></td>
    <td><select class="table-input mode-input" name="payment_mode" style="width: 80px;">${modeOptions}</select></td>
    <td><select class="table-input cust-input" name="customer_ledger" style="width: 150px;">${custOptions}</select></td>
    <td><input type="text" class="table-input" name="remarks" value="${data.remarks || ''}" placeholder="e.g. (Ravi)" style="width: 90px;"></td>
    <td><button class="btn btn-outline btn-sm" onclick="this.closest('tr').remove(); recalcDailyEntryCash();" style="padding: 2px 6px; color: #ef4444;">✕</button></td>
  `;

  // Live recalculate
  tr.querySelector('.amount-input').addEventListener('input', recalcDailyEntryCash);
  tr.querySelector('.mode-input').addEventListener('change', recalcDailyEntryCash);

  tbody.appendChild(tr);
  recalcDailyEntryCash();
}

function addExpenseRow(data = {}) {
  const tbody = document.getElementById('entryExpenseTbody');
  const tr = document.createElement('tr');

  let expOptions = '<option value="">-- Select Expense Ledger --</option>';
  currentAccounts.expenses.forEach(e => {
    expOptions += `<option value="${e.name}" ${data.expense_ledger === e.name ? 'selected' : ''}>${e.name}</option>`;
  });

  tr.innerHTML = `
    <td><input type="text" class="table-input" name="description" value="${data.description || ''}" placeholder="e.g. JCB diesel" required></td>
    <td><input type="number" class="table-input exp-amount-input" name="amount" value="${data.amount || ''}" required></td>
    <td><select class="table-input" name="expense_ledger">${expOptions}</select></td>
    <td><button class="btn btn-outline btn-sm" onclick="this.closest('tr').remove(); recalcDailyEntryCash();" style="padding: 2px 6px; color: #ef4444;">✕</button></td>
  `;

  tr.querySelector('.exp-amount-input').addEventListener('input', recalcDailyEntryCash);
  tbody.appendChild(tr);
  recalcDailyEntryCash();
}

function addOtherRow(data = {}) {
  const tbody = document.getElementById('entryOtherTbody');
  const tr = document.createElement('tr');

  let advOptions = '<option value="">-- Select Advance Ledger --</option>';
  currentAccounts.advances.forEach(a => {
    advOptions += `<option value="${a.name}" ${data.account_ledger === a.name ? 'selected' : ''}>${a.name}</option>`;
  });

  tr.innerHTML = `
    <td><input type="text" class="table-input" name="description" value="${data.description || ''}" placeholder="e.g. Advance paid to Saidalavi" required></td>
    <td><input type="number" class="table-input other-amount-input" name="amount" value="${data.amount || ''}" required></td>
    <td><select class="table-input" name="account_ledger">${advOptions}</select></td>
    <td><button class="btn btn-outline btn-sm" onclick="this.closest('tr').remove(); recalcDailyEntryCash();" style="padding: 2px 6px; color: #ef4444;">✕</button></td>
  `;

  tr.querySelector('.other-amount-input').addEventListener('input', recalcDailyEntryCash);
  tbody.appendChild(tr);
  recalcDailyEntryCash();
}

function recalcDailyEntryCash() {
  const opening = Number(document.getElementById('entryOpeningCash').value) || 0;
  
  let cashSales = 0;
  document.querySelectorAll('#entrySalesTbody tr').forEach(tr => {
    const mode = tr.querySelector('[name="payment_mode"]')?.value;
    const amt = Number(tr.querySelector('[name="amount"]')?.value) || 0;
    if (mode === 'Cash') cashSales += amt;
  });

  let cashExpenses = 0;
  document.querySelectorAll('#entryExpenseTbody tr').forEach(tr => {
    const amt = Number(tr.querySelector('[name="amount"]')?.value) || 0;
    cashExpenses += amt;
  });

  let otherPayments = 0;
  document.querySelectorAll('#entryOtherTbody tr').forEach(tr => {
    const amt = Number(tr.querySelector('[name="amount"]')?.value) || 0;
    otherPayments += amt;
  });

  const closing = opening + cashSales - cashExpenses - otherPayments;

  document.getElementById('calcOpeningCash').textContent = `₹${opening.toLocaleString('en-IN')}`;
  document.getElementById('calcCashSales').textContent = `₹${cashSales.toLocaleString('en-IN')}`;
  document.getElementById('calcCashExpenses').textContent = `₹${cashExpenses.toLocaleString('en-IN')}`;
  document.getElementById('calcOtherPayments').textContent = `₹${otherPayments.toLocaleString('en-IN')}`;
  document.getElementById('calcClosingCash').textContent = `₹${closing.toLocaleString('en-IN')}`;
}

async function saveDailySheet() {
  const date = document.getElementById('entryDate').value;
  const sheet_no = parseInt(document.getElementById('entrySheetNo').value, 10);
  const day_name = document.getElementById('entryDayName').value;
  const opening_cash = Number(document.getElementById('entryOpeningCash').value) || 0;

  const sales = [];
  document.querySelectorAll('#entrySalesTbody tr').forEach(tr => {
    const vehicle = tr.querySelector('[name="vehicle_no"]')?.value;
    if (!vehicle) return;
    sales.push({
      gp_no: tr.querySelector('[name="gp_no"]')?.value || '',
      vehicle_no: vehicle,
      item: tr.querySelector('[name="item"]')?.value || 'M SAND',
      unit: tr.querySelector('[name="unit"]')?.value || 'Ton',
      quantity: Number(tr.querySelector('[name="quantity"]')?.value) || 0,
      amount: Number(tr.querySelector('[name="amount"]')?.value) || 0,
      payment_mode: tr.querySelector('[name="payment_mode"]')?.value || 'Cash',
      customer_ledger: tr.querySelector('[name="customer_ledger"]')?.value || '',
      remarks: tr.querySelector('[name="remarks"]')?.value || ''
    });
  });

  const expenses = [];
  document.querySelectorAll('#entryExpenseTbody tr').forEach(tr => {
    const desc = tr.querySelector('[name="description"]')?.value;
    const amt = Number(tr.querySelector('[name="amount"]')?.value) || 0;
    if (!desc || amt <= 0) return;
    expenses.push({
      description: desc,
      amount: amt,
      expense_ledger: tr.querySelector('[name="expense_ledger"]')?.value || '',
      payment_mode: 'Cash'
    });
  });

  const other_payments = [];
  document.querySelectorAll('#entryOtherTbody tr').forEach(tr => {
    const desc = tr.querySelector('[name="description"]')?.value;
    const amt = Number(tr.querySelector('[name="amount"]')?.value) || 0;
    if (!desc || amt <= 0) return;
    other_payments.push({
      description: desc,
      amount: amt,
      account_ledger: tr.querySelector('[name="account_ledger"]')?.value || 'SAIDALAVI ADVANCE',
      payment_mode: 'Cash'
    });
  });

  try {
    const res = await fetch('/api/sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date, sheet_no, day_name, opening_cash, sales, expenses, other_payments
      })
    });

    const result = await res.json();
    if (result.success) {
      alert(`✅ Sheet #${sheet_no} for ${date} saved successfully!\nClosing Cash: ₹${result.closing_cash.toLocaleString('en-IN')}`);
      currentDate = date;
      globalDateInput.value = date;
      await loadDashboard(date);
      switchView('dashboard');
    } else {
      alert('Error saving sheet: ' + (result.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to connect to server: ' + err.message);
  }
}

// 3. Raw Sheet Ingestion Engine
let parsedDataCache = null;

function readFileIntoInput(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('rawSheetInput').value = e.target.result;
    alert(`📂 Loaded file "${file.name}"! Click "Process & Auto-Derive Everything" to proceed.`);
  };
  reader.readAsText(file);
}

function loadSampleRawData() {
  document.getElementById('rawSheetInput').value = `No.,275,VRN STONE CRUSHERS,,,,,,Date,2026-11-05,,,
,,DAILY SHEET,,,,,,Day,Thursday,,,
Change the yellow date (J1) to show any day. Everything below fills automatically from Daily Transactions.,,,,,,,,,,,,
GP No.,Name & Vehicle No.,ROYALTY,M SAND,P SAND,DUST,20 MM,SLURRY,Credit Sale,Cash Sale,Bank Sale (added),,
,KA14B 3300,,12.38,,,,,,10700,,,1
,KA18D 2817,,11.79,,,,,,10250,,,2
,KA09AA 5022,,12.09,,,,,,10500,,,3
,KA35 5854,,19.05,,,,,,16400,,,4
,KA11A 8928,,11.48,,,,,,10000,,,5
,KA18D 0215,,12.69,,,,,,10900,,,6
,KA18C 4290,,12.48,,,,,,10700,,,7
,KA22A 7520,,12.24,,,,,,10600,,,8
,KA50 1264,,11.8,,,,,10250,,,,9
,KA34A 2865,,11.95,,,,,10400,,,,10
,KA35A 1656 (Ravi),,11.48,,,,,10000,,,,11
,KA66 4919,,,11.72,,,,,12300,,,12
,KA21 3455,,110 CFT,,,,,,4600,,,13
,Tractor,,,3.73,,,,,4100,,,14
,KA35 1656 (Ravi),,11.22,,,,,9750,,,,15
,KA18C 4290,,12.01,,,,,,10300,,,16
,KA34A 2865,,15.07,,,,,13100,,,,17
,KA09B 9537,,11.18,,,,,,9700,,,18
,KA24 3418,,245 CFT,,,,,,10300,,,19
,KA14B 1010 (Ravi),,14.23,,,,,12100,,,,20
,KA34A 2865,,12.17,,,,,10600,,,,21
,KA24 3418,,,,245 CFT,,,,6100,,,22
,KA34A 2865,,12.03,,,,,10450,,,,23
,,,,,,,,,,,,
,TOTAL,,227.34 + 355 CFT,15.45,245 CFT,,,86650,147450,0,,
,,,,,,,,,,,,
,,,,,,,,,,,,
Expense :,,,,,,,,,,,,
Ravichandran diesel,,,,10000,,,,,,,,24
JCB diesel,,,,5000,Opening Balance :,,,,0,,,25
Staff food expenses,,,,924,Cash received from customers / other (added),,,,0,,,26
JCB Bolt expense,,,,720,TOTAL CASH,,,,147450,,,27
Water tanker Beta,,,,100,,,,,,,,28
Mujeeb water tanker payment (1 load),,,,2900,Expense :,,,,23844,,,29
Advance paid to Saidalavi,,,,200,,,,,,,,30
Seeb diesel,,,,1000,,,,,,,,31
Mujahid labor ale,,,,3000,CLOSING BALANCE :,,,,123606,,,32
`;
}

async function uploadOriginalSheet() {
  const text = document.getElementById('rawSheetInput').value;
  if (!text.trim()) {
    return alert('Please paste your original daily sheet rows or drop a CSV file first.');
  }

  const autoSave = document.getElementById('chkAutoSave').checked;

  try {
    const res = await fetch('/api/upload-original-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText: text, autoSave })
    });

    const data = await res.json();
    if (!data.success) {
      return alert('Error processing sheet: ' + (data.error || 'Unknown error'));
    }

    parsedDataCache = data.parsed;

    // Update preview table
    const tbody = document.getElementById('previewTbody');
    tbody.innerHTML = '';
    let count = 1;

    data.parsed.sales.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color: var(--text-dark);">${count++}</td>
        <td><span class="badge-tag badge-info">Sale</span></td>
        <td><strong>${s.vehicle_no}</strong></td>
        <td><span style="color: var(--primary); font-weight: 600;">${s.item}</span></td>
        <td>${s.unit}</td>
        <td>${s.quantity}</td>
        <td class="text-right">₹${s.amount.toLocaleString('en-IN')}</td>
        <td><span class="badge-tag ${s.payment_mode === 'Cash' ? 'badge-success' : 'badge-warning'}">${s.payment_mode}</span></td>
        <td style="color: #38bdf8;">${s.customer_ledger || (s.item + ' SALES')}</td>
      `;
      tbody.appendChild(tr);
    });

    data.parsed.expenses.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color: var(--text-dark);">${count++}</td>
        <td><span class="badge-tag badge-danger">Expense</span></td>
        <td><strong>${e.description}</strong></td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td class="text-right">₹${e.amount.toLocaleString('en-IN')}</td>
        <td>Cash</td>
        <td style="color: #f87171;">${e.expense_ledger}</td>
      `;
      tbody.appendChild(tr);
    });

    data.parsed.otherPayments.forEach(o => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color: var(--text-dark);">${count++}</td>
        <td><span class="badge-tag" style="background: rgba(168, 85, 247, 0.2); color: #c084fc;">Advance</span></td>
        <td><strong>${o.description}</strong></td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td class="text-right">₹${o.amount.toLocaleString('en-IN')}</td>
        <td>Cash</td>
        <td style="color: #c084fc;">${o.account_ledger}</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('previewSummaryPill').textContent = 
      `${data.parsed.summary.salesCount} Trips · ₹${data.parsed.summary.totalSales.toLocaleString('en-IN')} · Closing Cash: ₹${data.parsed.closingCash.toLocaleString('en-IN')}`;

    document.getElementById('parsePreviewArea').style.display = 'block';

    if (autoSave) {
      currentDate = data.parsed.date;
      globalDateInput.value = currentDate;
      await loadDashboard(currentDate);
      alert(`🎉 Sheet #${data.parsed.sheetNo} for ${data.parsed.date} successfully processed and saved!\n\n• Sales: ₹${data.parsed.summary.totalSales.toLocaleString('en-IN')} (${data.parsed.summary.salesCount} Trips)\n• Volume: ${data.parsed.summary.tonQty.toFixed(2)} Ton + ${data.parsed.summary.cftQty} CFT\n• Expenses: ₹${data.parsed.summary.totalExpenses.toLocaleString('en-IN')}\n• Closing Cash: ₹${data.parsed.closingCash.toLocaleString('en-IN')}\n\nAll accounts, P&L, customer balances, and reports have been automatically derived!`);
      switchView('dashboard');
    }

  } catch (err) {
    alert('Failed to connect to server: ' + err.message);
  }
}

function applyParsedToEntryForm() {
  if (!parsedDataCache) return;

  switchView('daily-entry');
  if (parsedDataCache.detectedDate) {
    document.getElementById('entryDate').value = parsedDataCache.detectedDate;
  }
  if (parsedDataCache.detectedSheetNo) {
    document.getElementById('entrySheetNo').value = parsedDataCache.detectedSheetNo;
  }

  const sTbody = document.getElementById('entrySalesTbody');
  sTbody.innerHTML = '';
  parsedDataCache.sales.forEach((s, idx) => addSaleRow(s, idx + 1));

  const eTbody = document.getElementById('entryExpenseTbody');
  eTbody.innerHTML = '';
  parsedDataCache.expenses.forEach(e => addExpenseRow(e));

  const oTbody = document.getElementById('entryOtherTbody');
  oTbody.innerHTML = '';
  parsedDataCache.otherPayments.forEach(o => addOtherRow(o));

  recalcDailyEntryCash();
  alert('Loaded parsed lines into Daily Entry form! Review and hit "Save Daily Sheet".');
}

// 4. Profit & Loss View
async function loadPnL(date, period = 'daily') {
  try {
    const res = await fetch(`/api/pnl?date=${date}&period=${period}`);
    const data = await res.json();

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('pnlTurnover', `₹${(data.totalRevenue || 0).toLocaleString('en-IN')}`);
    setTxt('pnlVolume', `${(data.totalTon || 0).toFixed(2)} Ton + ${(data.totalCFT || 0)} CFT`);
    setTxt('pnlVarCost', `₹${(data.totalVariableCost || 0).toLocaleString('en-IN')}`);
    setTxt('pnlFixedCost', `₹${Math.round(data.allocatedFixedCost || 0).toLocaleString('en-IN')}`);
    setTxt('pnlNetProfit', `₹${Math.round(data.netProfit || 0).toLocaleString('en-IN')} (${(data.netProfitPct || 0).toFixed(1)}%)`);

    // Benchmarks
    setTxt('kpiCPT', `₹${(data.costPerTon || 0).toFixed(2)} / Ton`);
    setTxt('kpiFuelPT', `₹${(data.fuelCostPerTon || 0).toFixed(2)} / Ton`);
    setTxt('kpiRealPT', `₹${(data.realizationPerTon || 0).toFixed(2)} / Ton`);

    const tbody = document.getElementById('pnlTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Section 1: Revenue
    const rHeader = document.createElement('tr');
    rHeader.innerHTML = `<td colspan="5" style="background: rgba(56, 189, 248, 0.1); font-weight: 700; color: var(--accent);">I. REVENUE FROM OPERATIONS</td>`;
    tbody.appendChild(rHeader);

    if (data.revenueByProduct) {
      for (const [prod, amt] of Object.entries(data.revenueByProduct)) {
        const tr = document.createElement('tr');
        const pct = data.totalRevenue > 0 ? ((amt / data.totalRevenue) * 100).toFixed(1) : '0.0';
        tr.innerHTML = `
          <td style="padding-left: 28px;">${prod} Sales</td>
          <td style="color: var(--text-dark);">${prod} SALES</td>
          <td class="text-right">₹${Number(amt).toLocaleString('en-IN')}</td>
          <td class="text-right">-</td>
          <td class="text-right">${pct}%</td>
        `;
        tbody.appendChild(tr);
      }
    }

    const rTotal = document.createElement('tr');
    rTotal.style.fontWeight = '700';
    rTotal.innerHTML = `
      <td>TOTAL REVENUE (A)</td>
      <td></td>
      <td class="text-right" style="color: #38bdf8;">₹${(data.totalRevenue || 0).toLocaleString('en-IN')}</td>
      <td class="text-right">₹${(data.realizationPerTon || 0).toFixed(2)}</td>
      <td class="text-right">100.0%</td>
    `;
    tbody.appendChild(rTotal);

    // Section 2: Variable Costs
    const vHeader = document.createElement('tr');
    vHeader.innerHTML = `<td colspan="5" style="background: rgba(239, 68, 68, 0.1); font-weight: 700; color: #f87171;">II. VARIABLE OPERATING COSTS (DIRECT)</td>`;
    tbody.appendChild(vHeader);

    const equivTon = (data.totalEquivalentTon && data.totalEquivalentTon > 0) ? data.totalEquivalentTon : 1;

    if (data.variableCosts) {
      for (const [cat, amt] of Object.entries(data.variableCosts)) {
        const tr = document.createElement('tr');
        const pt = (amt / equivTon).toFixed(2);
        const pct = data.totalRevenue > 0 ? ((amt / data.totalRevenue) * 100).toFixed(1) : '0.0';
        tr.innerHTML = `
          <td style="padding-left: 28px;">${cat} Costs</td>
          <td style="color: var(--text-dark);">${cat === 'Fuel' ? 'JCB, Jeep & Fuel Exp' : cat}</td>
          <td class="text-right">₹${Number(amt).toLocaleString('en-IN')}</td>
          <td class="text-right">₹${pt}</td>
          <td class="text-right">${pct}%</td>
        `;
        tbody.appendChild(tr);
      }
    }

    const vTotal = document.createElement('tr');
    vTotal.style.fontWeight = '700';
    vTotal.innerHTML = `
      <td>TOTAL DIRECT COSTS (B)</td>
      <td></td>
      <td class="text-right" style="color: #ef4444;">₹${(data.totalVariableCost || 0).toLocaleString('en-IN')}</td>
      <td class="text-right">₹${((data.totalVariableCost || 0) / equivTon).toFixed(2)}</td>
      <td class="text-right">${data.totalRevenue > 0 ? (((data.totalVariableCost || 0) / data.totalRevenue) * 100).toFixed(1) : '0.0'}%</td>
    `;
    tbody.appendChild(vTotal);

    // Gross Margin
    const gmRow = document.createElement('tr');
    gmRow.style.fontWeight = '800';
    gmRow.style.background = 'rgba(255, 255, 255, 0.04)';
    gmRow.innerHTML = `
      <td>OPERATING GROSS MARGIN (A − B)</td>
      <td></td>
      <td class="text-right" style="color: #10b981;">₹${(data.grossMargin || 0).toLocaleString('en-IN')}</td>
      <td class="text-right">₹${((data.grossMargin || 0) / equivTon).toFixed(2)}</td>
      <td class="text-right" style="color: #10b981;">${(data.grossMarginPct || 0).toFixed(1)}%</td>
    `;
    tbody.appendChild(gmRow);

    // Section 3: Fixed Overheads
    const fHeader = document.createElement('tr');
    fHeader.innerHTML = `<td colspan="5" style="background: rgba(245, 158, 11, 0.1); font-weight: 700; color: #fbbf24;">III. FIXED PLANT OVERHEADS (${period === 'daily' ? 'Amortized Daily' : 'Full Month'})</td>`;
    tbody.appendChild(fHeader);

    if (data.fixedOverheadsBreakdown) {
      data.fixedOverheadsBreakdown.forEach(f => {
        const tr = document.createElement('tr');
        const pt = (f.allocated / equivTon).toFixed(2);
        const pct = data.totalRevenue > 0 ? ((f.allocated / data.totalRevenue) * 100).toFixed(1) : '0.0';
        tr.innerHTML = `
          <td style="padding-left: 28px;">${f.name}</td>
          <td style="color: var(--text-dark);">${f.category}</td>
          <td class="text-right">₹${Math.round(f.allocated).toLocaleString('en-IN')}</td>
          <td class="text-right">₹${pt}</td>
          <td class="text-right">${pct}%</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Net Profit
    const npRow = document.createElement('tr');
    npRow.style.fontWeight = '800';
    npRow.style.background = 'rgba(16, 185, 129, 0.15)';
    npRow.innerHTML = `
      <td style="font-size: 14px; color: #fff;">👉 NET OPERATING PROFIT (EBITDA)</td>
      <td></td>
      <td class="text-right" style="color: #34d399; font-size: 15px;">₹${Math.round(data.netProfit || 0).toLocaleString('en-IN')}</td>
      <td class="text-right" style="color: #34d399;">₹${((data.netProfit || 0) / equivTon).toFixed(2)}</td>
      <td class="text-right" style="color: #34d399; font-size: 14px;">${(data.netProfitPct || 0).toFixed(1)}%</td>
    `;
    tbody.appendChild(npRow);

  } catch (err) {
    console.error('Error loading PnL:', err);
  }
}

// 5. Customer Ledgers View
async function loadCustomerLedgers() {
  try {
    const res = await fetch('/api/customer-ledgers');
    const customers = await res.json();

    const tbody = document.getElementById('customerLedgerTbody');
    tbody.innerHTML = '';

    customers.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color: var(--primary);">${c.customer}</strong></td>
        <td>${c.totalTrips}</td>
        <td>${c.totalTon > 0 ? c.totalTon.toFixed(2) + ' Ton' : '-'}</td>
        <td>${c.totalCFT > 0 ? c.totalCFT + ' CFT' : '-'}</td>
        <td class="text-right">₹${c.totalBilled.toLocaleString('en-IN')}</td>
        <td class="text-right" style="color: #10b981;">₹${c.totalReceived.toLocaleString('en-IN')}</td>
        <td class="text-right"><strong style="color: ${c.balance > 0 ? '#ef4444' : '#10b981'};">₹${c.balance.toLocaleString('en-IN')}</strong></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="quickPayCustomer('${c.customer}')" style="padding: 3px 8px; font-size: 11px;">Collect ₹</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading customer ledgers:', err);
  }
}

function openReceiptModal() {
  document.getElementById('receiptModal').classList.add('active');
}

function closeReceiptModal() {
  document.getElementById('receiptModal').classList.remove('active');
}

function quickPayCustomer(custName) {
  openReceiptModal();
  document.getElementById('receiptCustomerSelect').value = custName;
}

async function submitReceipt() {
  const customer_ledger = document.getElementById('receiptCustomerSelect').value;
  const date = document.getElementById('receiptDateInput').value;
  const payment_mode = document.getElementById('receiptModeSelect').value;
  const amount = Number(document.getElementById('receiptAmountInput').value);
  const reference_no = document.getElementById('receiptRefInput').value;
  const remarks = document.getElementById('receiptRemarksInput').value;

  if (!customer_ledger || !amount) {
    return alert('Please select a customer and enter an amount.');
  }

  try {
    const res = await fetch('/api/customer-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_ledger, date, payment_mode, amount, reference_no, remarks })
    });
    const result = await res.json();
    if (result.success) {
      alert(`✅ Recorded payment receipt of ₹${amount.toLocaleString('en-IN')} for ${customer_ledger}!`);
      closeReceiptModal();
      await loadCustomerLedgers();
      await loadDashboard(currentDate);
    }
  } catch (err) {
    alert('Error submitting receipt: ' + err.message);
  }
}

// 6. Diesel & Expenses View
async function loadExpenseAnalytics(date) {
  try {
    const res = await fetch(`/api/sheet?date=${date}`);
    const data = await res.json();

    const fTbody = document.getElementById('fuelTbody');
    const mTbody = document.getElementById('maintTbody');
    fTbody.innerHTML = '';
    mTbody.innerHTML = '';

    (data.expenses || []).forEach(e => {
      const isFuel = (e.category === 'Fuel') || (e.description.toLowerCase().includes('diesel'));
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${e.description}</strong></td>
        <td>${isFuel ? e.expense_ledger : (e.category || 'General')}</td>
        <td class="text-right">₹${e.amount.toLocaleString('en-IN')}</td>
      `;
      if (isFuel) {
        fTbody.appendChild(tr);
      } else {
        mTbody.appendChild(tr);
      }
    });

  } catch (err) {
    console.error('Error loading expenses analytics:', err);
  }
}

// 7. Projections & Breakeven Simulator
let projectionsInitialized = false;

async function loadProjections() {
  if (!projectionsInitialized && activeSheet && activeSheet.total_ton > 0) {
    const dailyCapEl = document.getElementById('sliderDailyCap');
    const avgRateEl = document.getElementById('sliderAvgRate');
    const fuelPtEl = document.getElementById('sliderFuelPT');
    if (dailyCapEl) dailyCapEl.value = Math.round(activeSheet.total_ton);
    if (avgRateEl) avgRateEl.value = Math.round(activeSheet.total_sales_amount / activeSheet.total_ton);
    if (fuelPtEl) fuelPtEl.value = 66; // Real diesel cost: ₹16,000 / 242.79T = ₹65.90/ton
    projectionsInitialized = true;
  }
  updateProjections();
}

async function updateProjections() {
  const dailyCap = document.getElementById('sliderDailyCap').value;
  const workingDays = document.getElementById('sliderWorkingDays').value;
  const avgRate = document.getElementById('sliderAvgRate').value;
  const fuelPT = document.getElementById('sliderFuelPT').value;

  document.getElementById('valDailyCap').textContent = `${dailyCap} Tons`;
  document.getElementById('valWorkingDays').textContent = `${workingDays} Days`;
  document.getElementById('valAvgRate').textContent = `₹${avgRate}`;
  document.getElementById('valFuelPT').textContent = `₹${fuelPT}`;

  try {
    const res = await fetch(`/api/projections?dailyCapacity=${dailyCap}&workingDays=${workingDays}&avgRate=${avgRate}&fuelPerTon=${fuelPT}`);
    const data = await res.json();

    document.getElementById('projFixedMonthly').textContent = `₹${data.params.fixedMonthly.toLocaleString('en-IN')}`;
    document.getElementById('projCM').textContent = `₹${data.breakeven.contributionMarginPerTon} / Ton`;
    document.getElementById('projBreakevenTons').textContent = `${data.breakeven.breakevenTonsMonth.toLocaleString('en-IN')} Tons / Month`;
    document.getElementById('projBreakevenDays').textContent = `${data.breakeven.breakevenDaysMonth} Days`;

    // Forecast table
    const fTbody = document.getElementById('projForecastTbody');
    fTbody.innerHTML = '';
    [
      { name: '30-Day (1 Month)', d: data.forecast30 },
      { name: '60-Day (2 Months)', d: data.forecast60 },
      { name: '90-Day (Quarterly)', d: data.forecast90 }
    ].forEach(f => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color: var(--accent);">${f.name}</strong></td>
        <td>${f.d.days} Days</td>
        <td>${f.d.tonnage.toLocaleString('en-IN')} Ton</td>
        <td class="text-right">₹${f.d.revenue.toLocaleString('en-IN')}</td>
        <td class="text-right">₹${f.d.variableCost.toLocaleString('en-IN')}</td>
        <td class="text-right">₹${f.d.fixedCost.toLocaleString('en-IN')}</td>
        <td class="text-right" style="color: #10b981; font-weight: 700;">₹${f.d.netProfit.toLocaleString('en-IN')}</td>
        <td class="text-right"><span class="badge-tag badge-success">${f.d.marginPct}%</span></td>
      `;
      fTbody.appendChild(tr);
    });

    // Sensitivity Table
    const sTbody = document.getElementById('sensitivityTbody');
    sTbody.innerHTML = '';
    data.sensitivity.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${s.scenario}</strong></td>
        <td>₹${s.rate} / Ton</td>
        <td>₹${s.diesel} / Ton</td>
        <td>${s.volume} Ton/Day</td>
        <td class="text-right"><strong style="color: ${s.profit > 0 ? '#10b981' : '#ef4444'};">₹${Math.round(s.profit).toLocaleString('en-IN')}</strong></td>
      `;
      sTbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Error updating projections:', err);
  }
}

// 8. Daily & WhatsApp Reports
async function loadDailyReport(date) {
  try {
    const res = await fetch(`/api/reports/daily?date=${date}`);
    const data = await res.json();

    document.getElementById('whatsappTextPreview').textContent = data.whatsappText;
    document.getElementById('printDateHeader').textContent = `Date: ${date} (${data.sheet.day_name || ''}) · Sheet No. ${data.sheet.sheet_no || 275}`;

    let bodyHtml = `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
        <tr style="border-bottom: 1px solid #000;">
          <th style="color: #000; background: none; padding: 4px;">#</th>
          <th style="color: #000; background: none; padding: 4px;">Vehicle</th>
          <th style="color: #000; background: none; padding: 4px;">Item</th>
          <th style="color: #000; background: none; padding: 4px;">Qty</th>
          <th style="color: #000; background: none; padding: 4px; text-align: right;">Amount</th>
          <th style="color: #000; background: none; padding: 4px;">Mode</th>
        </tr>
    `;

    (data.sales || []).forEach((s, i) => {
      bodyHtml += `
        <tr style="border-bottom: 1px dotted #ccc;">
          <td style="color: #000; padding: 4px;">${i + 1}</td>
          <td style="color: #000; padding: 4px;">${s.vehicle_no}</td>
          <td style="color: #000; padding: 4px;">${s.item}</td>
          <td style="color: #000; padding: 4px;">${s.quantity} ${s.unit}</td>
          <td style="color: #000; padding: 4px; text-align: right;">₹${s.amount.toLocaleString('en-IN')}</td>
          <td style="color: #000; padding: 4px;">${s.payment_mode}</td>
        </tr>
      `;
    });

    bodyHtml += `
      <tr style="border-top: 1px solid #000; font-weight: bold;">
        <td colspan="3" style="color: #000; padding: 6px 4px;">TOTAL SALES</td>
        <td style="color: #000; padding: 6px 4px;">${data.sheet.total_ton} Ton</td>
        <td style="color: #000; padding: 6px 4px; text-align: right;">₹${(data.sheet.total_sales_amount || 0).toLocaleString('en-IN')}</td>
        <td></td>
      </tr>
      </table>
      <div style="border-top: 2px dashed #000; padding-top: 8px;">
        <strong>EXPENSES:</strong> ₹${(data.sheet.total_cash_expenses || 0).toLocaleString('en-IN')} | 
        <strong>CLOSING CASH:</strong> ₹${(data.sheet.closing_cash || 0).toLocaleString('en-IN')}
      </div>
    `;

    document.getElementById('printBody').innerHTML = bodyHtml;
  } catch (err) {
    console.error('Error loading report:', err);
  }
}

// 9. Chart of Accounts Directory
function renderChartOfAccounts(filterText = '') {
  const tbody = document.getElementById('chartOfAccountsTbody');
  tbody.innerHTML = '';

  const filter = filterText.toLowerCase();
  const list = currentAccounts.all.filter(a => 
    a.name.toLowerCase().includes(filter) || a.code.includes(filter) || a.classification.toLowerCase().includes(filter)
  );

  list.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${a.code}</code></td>
      <td><strong>${a.name}</strong></td>
      <td>${a.group}</td>
      <td style="color: var(--text-dark);">${a.subgroup}</td>
      <td><span class="badge-tag ${a.type === 'Asset' ? 'badge-info' : (a.type === 'Liability' ? 'badge-warning' : (a.type === 'Income' ? 'badge-success' : 'badge-danger'))}">${a.type}</span></td>
      <td>${a.nature}</td>
      <td>${a.classification}</td>
    `;
    tbody.appendChild(tr);
  });
}
