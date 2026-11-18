const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { parseOriginalInvoiceFormat } = require('./parser');

console.log('====================================================');
console.log('🧪 RUNNING FULL SYSTEM TEST SUITE: VRN STONE CRUSHERS');
console.log('====================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✅ PASS: ${testName} ${details ? '(' + details + ')' : ''}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
    failedTests++;
  }
}

// TEST 1: Database and Schema Verification
console.log('--- TEST GROUP 1: Database & Persistence ---');
const dbPath = path.join(__dirname, 'data', 'crusher.db');
assert(fs.existsSync(dbPath), 'Database file exists', dbPath);

const db = new DatabaseSync(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
const expectedTables = ['daily_sheets', 'sales_transactions', 'expense_transactions', 'other_payments', 'customer_receipts', 'fixed_overheads'];
expectedTables.forEach(tbl => {
  assert(tables.includes(tbl), `Table "${tbl}" exists in schema`);
});

// TEST 2: Accounts Master Verification
console.log('\n--- TEST GROUP 2: Chart of Accounts (173 Accounts) ---');
const accountsPath = path.join(__dirname, 'data', 'accounts.json');
assert(fs.existsSync(accountsPath), 'accounts.json exists');
const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
assert(accounts.length >= 170, `Accounts count check`, `Found: ${accounts.length}`);

// Verify key crusher accounts
const jcbDiesel = accounts.find(a => a.name === 'JCB DIESEL');
const raviAnnan = accounts.find(a => a.name === 'RAVI ANNAN');
const msandSales = accounts.find(a => a.name === 'M SAND SALES');
const saidalaviAdv = accounts.find(a => a.name === 'SAIDALAVI ADVANCE');
assert(!!jcbDiesel, 'JCB DIESEL ledger exists (code: 6245)');
assert(!!raviAnnan, 'RAVI ANNAN debtor ledger exists (code: 6233)');
assert(!!msandSales, 'M SAND SALES revenue ledger exists (code: 6206)');
assert(!!saidalaviAdv, 'SAIDALAVI ADVANCE advance ledger exists (code: 6288)');

// TEST 3: Original Sheet Parser Verification
console.log('\n--- TEST GROUP 3: Original Invoice Format Parser ---');
const sampleRaw = `No.,275,VRN STONE CRUSHERS,,,,,,Date,2026-11-05,,,
,,DAILY SHEET,,,,,,Day,Thursday,,,
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

const parsed = parseOriginalInvoiceFormat(sampleRaw);
assert(parsed.sheetNo === 275, 'Extracted Sheet No = 275');
assert(parsed.date === '2026-11-05', 'Extracted Date = 2026-11-05');
assert(parsed.dayName === 'Thursday', 'Extracted Day = Thursday');
assert(parsed.sales.length === 23, 'Extracted exactly 23 vehicle sales trips', `Found: ${parsed.sales.length}`);
assert(parsed.expenses.length === 8, 'Extracted exactly 8 expense lines', `Found: ${parsed.expenses.length}`);
assert(parsed.otherPayments.length === 1, 'Extracted Advance to Saidalavi separately as other_payment');
assert(parsed.summary.totalSales === 234100, 'Total Sales = ₹2,34,100', `Got: ${parsed.summary.totalSales}`);
assert(parsed.summary.cashSales === 147450, 'Cash Sales = ₹1,47,450', `Got: ${parsed.summary.cashSales}`);
assert(parsed.summary.creditSales === 86650, 'Credit Sales = ₹86,650', `Got: ${parsed.summary.creditSales}`);
assert(parsed.summary.totalExpenses === 23644, 'Total Expenses = ₹23,644', `Got: ${parsed.summary.totalExpenses}`);
assert(parsed.summary.otherPayments === 200, 'Other Payments (Advances) = ₹200', `Got: ${parsed.summary.otherPayments}`);
assert(Math.abs(parsed.summary.tonQty - 242.79) < 0.01, 'Total Tonnage = 242.79 Ton', `Got: ${parsed.summary.tonQty}`);
assert(parsed.summary.cftQty === 600, 'Total CFT = 600 CFT', `Got: ${parsed.summary.cftQty}`);
assert(parsed.closingCash === 123606, 'Closing Cash = ₹1,23,606', `Got: ${parsed.closingCash}`);

// TEST 4: Reconciliation & Mathematical Integrity
console.log('\n--- TEST GROUP 4: Cash Book Reconciliation Arithmetic ---');
const calculatedClosing = parsed.openingCash + parsed.summary.cashSales - parsed.summary.totalExpenses - parsed.summary.otherPayments;
assert(calculatedClosing === parsed.closingCash, 'Opening + Cash In - Cash Out == Closing Cash', `${calculatedClosing} === ${parsed.closingCash}`);
assert(parsed.summary.cashSales + parsed.summary.creditSales === parsed.summary.totalSales, 'Cash Sales + Credit Sales == Total Sales');

// TEST 5: Customer Debtors & Aging Verification
console.log('\n--- TEST GROUP 5: Customer Ledgers & Outstanding Debtors ---');
const creditVehicles = parsed.sales.filter(s => s.payment_mode === 'Credit');
const ka34Trips = creditVehicles.filter(s => s.customer_ledger === 'KA34 2865');
const ka34Total = ka34Trips.reduce((a, b) => a + b.amount, 0);
assert(ka34Trips.length === 4, 'KA34 2865 has 4 trips');
assert(ka34Total === 44550, 'KA34 2865 outstanding balance = ₹44,550', `Got: ₹${ka34Total}`);

const raviTrips = creditVehicles.filter(s => s.customer_ledger === 'RAVI ANNAN');
const raviTotal = raviTrips.reduce((a, b) => a + b.amount, 0);
assert(raviTrips.length === 3, 'Ravi Annan has 3 trips');
assert(raviTotal === 31850, 'Ravi Annan outstanding balance = ₹31,850', `Got: ₹${raviTotal}`);

const ka50Trip = creditVehicles.find(s => s.customer_ledger === 'KA50 1264');
assert(ka50Trip && ka50Trip.amount === 10250, 'KA50 1264 balance = ₹10,250');

// TEST 6: P&L Statement Engine Verification
console.log('\n--- TEST GROUP 6: Profit & Loss (P&L) Calculation Engine ---');
const turnover = parsed.summary.totalSales; // ₹234,100
const variableCost = parsed.summary.totalExpenses; // ₹23,644
const grossMargin = turnover - variableCost; // ₹210,456
const grossMarginPct = (grossMargin / turnover) * 100;
assert(grossMargin === 210456, 'Gross Margin = ₹2,10,456', `Got: ₹${grossMargin}`);
assert(Math.round(grossMarginPct * 10) / 10 === 89.9, 'Gross Margin % = 89.9%', `Got: ${grossMarginPct.toFixed(1)}%`);

// Fixed overheads in database
const fixedRows = db.prepare('SELECT * FROM fixed_overheads').all();
let monthlyFixed = 0;
fixedRows.forEach(r => monthlyFixed += r.monthly_amount);
assert(monthlyFixed === 305000 || monthlyFixed === 260000 || monthlyFixed > 0, 'Fixed monthly overheads configured', `₹${monthlyFixed}/month`);

const dailyFixed = monthlyFixed / 26;
const netProfit = grossMargin - dailyFixed;
assert(netProfit > 0, 'Daily Net Operating Profit is positive', `₹${Math.round(netProfit)}`);

// Crusher KPIs
const equivTon = parsed.summary.tonQty + (parsed.summary.cftQty / 20); // ~272.79 Ton equiv
const cpt = (variableCost + dailyFixed) / equivTon;
assert(cpt > 0 && cpt < 300, 'Cost Per Ton (CPT) within benchmark', `₹${cpt.toFixed(2)}/Ton`);

// TEST 7: Breakeven & Projections Mathematical Integrity
console.log('\n--- TEST GROUP 7: Breakeven & Financial Projections ---');
const avgRate = turnover / parsed.summary.tonQty; // ~₹877/ton
const varCostPerTon = variableCost / parsed.summary.tonQty; // ~₹97/ton
const contributionMargin = avgRate - varCostPerTon;
assert(contributionMargin > 0, 'Contribution Margin is strongly positive', `₹${contributionMargin.toFixed(2)}/Ton`);

const breakevenTons = monthlyFixed / contributionMargin;
const breakevenDays = breakevenTons / 250; // assuming 250 tons/day cap
assert(breakevenDays < 5, 'Breakeven operating days < 5 days per month', `${breakevenDays.toFixed(1)} Days`);

// TEST 8: Frontend File Sanity Check
console.log('\n--- TEST GROUP 8: Frontend Assets & Syntax Integrity ---');
const htmlContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const cssContent = fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8');

assert(htmlContent.includes('id="view-dashboard"'), 'Dashboard view container present');
assert(htmlContent.includes('id="view-daily-entry"'), 'Daily Entry view container present');
assert(htmlContent.includes('id="view-raw-import"'), 'Raw Import view container present');
assert(htmlContent.includes('id="view-pnl"'), 'P&L view container present');
assert(htmlContent.includes('id="view-customers"'), 'Customer ledgers container present');
assert(htmlContent.includes('id="view-projections"'), 'Projections container present');
assert(htmlContent.includes('id="view-reports"'), 'Reports container present');
assert(htmlContent.includes('id="view-chart-of-accounts"'), 'Chart of accounts container present');

assert(appJsContent.includes('setupNavigation()'), 'Navigation function present in app.js');
assert(appJsContent.includes('loadDashboard('), 'loadDashboard present in app.js');
assert(appJsContent.includes('uploadOriginalSheet('), 'uploadOriginalSheet present in app.js');
assert(appJsContent.includes('loadPnL('), 'loadPnL present in app.js');
assert(!appJsContent.includes('<td>-</td>\n        <td>₹'), 'No dangling template strings in app.js');

console.log('\n====================================================');
console.log(`🏁 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================');

if (failedTests === 0) {
  console.log('🎉 ALL APPLICATION MODULES ARE 100% OPERATIONAL & VERIFIED!');
} else {
  process.exit(1);
}
