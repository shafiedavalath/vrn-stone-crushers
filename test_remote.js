const https = require('https');

const BASE_URL = 'https://earliest-attorney-fioricet-fig.trycloudflare.com';

console.log('================================================================');
console.log(`🌐 REMOTE INTEGRATION & API TEST SUITE`);
console.log(`Target: ${BASE_URL}`);
console.log('================================================================\n');

function fetchJson(endpoint) {
  return new Promise((resolve, reject) => {
    https.get(`${BASE_URL}${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function fetchText(endpoint) {
  return new Promise((resolve, reject) => {
    https.get(`${BASE_URL}${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    }).on('error', reject);
  });
}

async function runRemoteTests() {
  let passed = 0;
  let failed = 0;

  function assert(cond, name, note = '') {
    if (cond) {
      console.log(`✅ PASS: ${name} ${note ? '(' + note + ')' : ''}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name} ${note ? '(' + note + ')' : ''}`);
      failed++;
    }
  }

  try {
    // 1. Static Assets
    console.log('--- 1. Testing Remote Static Web Assets ---');
    const indexRes = await fetchText('/');
    assert(indexRes.status === 200 && indexRes.text.includes('VRN CRUSHERS'), 'Remote index.html serves 200 OK');

    const cssRes = await fetchText('/style.css');
    assert(cssRes.status === 200 && cssRes.text.includes('--primary'), 'Remote style.css serves 200 OK');

    const jsRes = await fetchText('/app.js?v=2.1');
    assert(jsRes.status === 200 && jsRes.text.includes('VRN Stone Crushers Frontend Controller'), 'Remote app.js serves 200 OK');

    // 2. Dashboard API
    console.log('\n--- 2. Testing Remote Dashboard API ---');
    const dash = await fetchJson('/api/dashboard?date=2026-11-05');
    assert(dash.status === 200, 'Dashboard endpoint status 200');
    assert(dash.data.sheet.total_sales_amount === 234100, 'Dashboard actual sales = ₹2,34,100', `Got: ₹${dash.data.sheet.total_sales_amount}`);
    assert(dash.data.sheet.total_cash_sales === 147450, 'Dashboard cash sales = ₹1,47,450', `Got: ₹${dash.data.sheet.total_cash_sales}`);
    assert(dash.data.sheet.total_credit_sales === 86650, 'Dashboard credit sales = ₹86,650', `Got: ₹${dash.data.sheet.total_credit_sales}`);
    assert(dash.data.sheet.closing_cash === 123606, 'Dashboard closing cash = ₹1,23,606', `Got: ₹${dash.data.sheet.closing_cash}`);
    assert(dash.data.reconciliation.ok === true, 'Dashboard cash book balanced');

    // 3. Sheet API
    console.log('\n--- 3. Testing Remote Daily Sheet API ---');
    const sheetRes = await fetchJson('/api/sheet?date=2026-11-05');
    assert(sheetRes.status === 200, 'Sheet endpoint status 200');
    assert(sheetRes.data.sales.length === 23, 'Sheet contains all 23 vehicle sales trips', `Found: ${sheetRes.data.sales.length}`);
    assert(sheetRes.data.expenses.length === 8, 'Sheet contains all 8 expense records', `Found: ${sheetRes.data.expenses.length}`);
    assert(sheetRes.data.otherPayments.length === 1, 'Sheet contains Saidalavi advance (₹200)');

    // 4. P&L API
    console.log('\n--- 4. Testing Remote Profit & Loss (P&L) API ---');
    const pnlRes = await fetchJson('/api/pnl?date=2026-11-05&period=daily');
    assert(pnlRes.status === 200, 'P&L endpoint status 200');
    assert(pnlRes.data.totalRevenue === 234100, 'P&L Revenue = ₹2,34,100');
    assert(pnlRes.data.grossMargin === 210456, 'P&L Gross Margin = ₹2,10,456 (89.9%)');
    assert(pnlRes.data.costPerTon > 0, 'Cost Per Ton calculated', `₹${pnlRes.data.costPerTon.toFixed(2)}/Ton`);
    assert(pnlRes.data.fuelCostPerTon > 0, 'Diesel Cost Per Ton calculated', `₹${pnlRes.data.fuelCostPerTon.toFixed(2)}/Ton`);

    // 5. Customer Ledgers API
    console.log('\n--- 5. Testing Remote Customer Debtors Ledgers ---');
    const custRes = await fetchJson('/api/customer-ledgers');
    assert(custRes.status === 200, 'Customer Ledgers endpoint status 200');
    const ka34 = custRes.data.find(c => c.customer === 'KA34 2865');
    assert(ka34 && ka34.balance === 44550, 'Customer KA34 2865 balance = ₹44,550');
    const ravi = custRes.data.find(c => c.customer === 'RAVI ANNAN');
    assert(ravi && ravi.balance === 31850, 'Customer RAVI ANNAN balance = ₹31,850');

    // 6. Projections API
    console.log('\n--- 6. Testing Remote Projections & Breakeven Simulator ---');
    const projRes = await fetchJson('/api/projections');
    assert(projRes.status === 200, 'Projections endpoint status 200');
    assert(projRes.data.breakeven.breakevenDaysMonth < 5, 'Breakeven operating days verified', `${projRes.data.breakeven.breakevenDaysMonth} days`);
    assert(projRes.data.forecast30.revenue > 0, '30-Day forecast revenue calculated', `₹${projRes.data.forecast30.revenue.toLocaleString('en-IN')}`);

    // 7. Reports API
    console.log('\n--- 7. Testing Remote Daily Reports & WhatsApp Summary ---');
    const repRes = await fetchJson('/api/reports/daily?date=2026-11-05');
    assert(repRes.status === 200, 'Reports endpoint status 200');
    assert(repRes.data.whatsappText.includes('VRN STONE CRUSHERS - DAILY REPORT'), 'WhatsApp message generated with header');
    assert(repRes.data.whatsappText.includes('Closing Cash: ₹1,23,606'), 'WhatsApp message contains exact closing cash balance');

    // 8. Accounts API
    console.log('\n--- 8. Testing Remote Chart of Accounts Directory ---');
    const accRes = await fetchJson('/api/accounts');
    assert(accRes.status === 200, 'Accounts endpoint status 200');
    assert(accRes.data.all.length >= 170, 'Remote accounts directory contains all 170+ accounts', `Total: ${accRes.data.all.length}`);

    console.log('\n================================================================');
    console.log(`🏁 REMOTE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    if (failed === 0) {
      console.log('🎉 LIVE REMOTE DEPLOYMENT IS FULLY FUNCTIONAL AND VERIFIED!');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Remote test failed with error:', err);
    process.exit(1);
  }
}

runRemoteTests();
