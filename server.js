const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const { parseOriginalInvoiceFormat } = require('./parser');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'crusher.db');
const ACCOUNTS_PATH = path.join(__dirname, 'data', 'accounts.json');

// Connect to SQLite
const db = new DatabaseSync(DB_PATH);

// Load Accounts
let accounts = [];
try {
  accounts = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf8'));
} catch (e) {
  console.error('Error loading accounts:', e);
}

// Categorized Accounts
const categorizedAccounts = {
  all: accounts,
  customers: accounts.filter(a => a.classification === 'Customer (Receivable)'),
  expenses: accounts.filter(a => a.nature === 'Debit' && a.group === 'Expenses'),
  payables: accounts.filter(a => a.nature === 'Credit' && a.group === 'Liabilities'),
  advances: accounts.filter(a => a.classification === 'Other Asset / Advance' && a.name.toLowerCase().includes('adv')),
  sales: accounts.filter(a => a.group === 'Income' && a.subgroup === 'Sales')
};

// Helper to send JSON
function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Helper to parse POST request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // API ROUTES
    if (pathname === '/api/accounts') {
      return sendJSON(res, categorizedAccounts);
    }

    if (pathname === '/api/dashboard') {
      const selectedDate = parsedUrl.query.date || '2026-11-05';
      
      // Selected day sheet
      const sheet = db.prepare('SELECT * FROM daily_sheets WHERE date = ?').get(selectedDate) || null;
      
      // Selected day sales
      const sales = db.prepare('SELECT * FROM sales_transactions WHERE date = ? ORDER BY id ASC').all(selectedDate);
      
      // Selected day expenses
      const expenses = db.prepare('SELECT * FROM expense_transactions WHERE date = ? ORDER BY id ASC').all(selectedDate);
      
      // Selected day other payments
      const otherPayments = db.prepare('SELECT * FROM other_payments WHERE date = ? ORDER BY id ASC').all(selectedDate);

      // Product Summary for the selected day
      const productSummary = {};
      sales.forEach(s => {
        if (!productSummary[s.item]) {
          productSummary[s.item] = {
            item: s.item,
            tonQty: 0,
            tonAmount: 0,
            cftQty: 0,
            cftAmount: 0,
            totalAmount: 0,
            trips: 0
          };
        }
        productSummary[s.item].trips += 1;
        productSummary[s.item].totalAmount += s.amount;
        if (s.unit === 'Ton') {
          productSummary[s.item].tonQty += s.quantity;
          productSummary[s.item].tonAmount += s.amount;
        } else if (s.unit === 'CFT') {
          productSummary[s.item].cftQty += s.quantity;
          productSummary[s.item].cftAmount += s.amount;
        }
      });

      // Expense Category Summary
      const expenseByCategory = {};
      expenses.forEach(e => {
        const cat = e.category || 'General';
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + e.amount;
      });

      // Monthly aggregation (November 2026 or selected month)
      const monthPrefix = selectedDate.substring(0, 7); // e.g. '2026-11'
      const monthSheets = db.prepare('SELECT * FROM daily_sheets WHERE date LIKE ?').all(monthPrefix + '%');
      
      const monthStats = {
        month: monthPrefix,
        totalSales: 0,
        totalCashSales: 0,
        totalCreditSales: 0,
        totalExpenses: 0,
        totalOtherPayments: 0,
        totalTon: 0,
        totalCFT: 0,
        daysCount: monthSheets.length
      };

      monthSheets.forEach(s => {
        monthStats.totalSales += s.total_sales_amount;
        monthStats.totalCashSales += s.total_cash_sales;
        monthStats.totalCreditSales += s.total_credit_sales;
        monthStats.totalExpenses += s.total_cash_expenses;
        monthStats.totalOtherPayments += s.total_other_cash_payments;
        monthStats.totalTon += s.total_ton;
        monthStats.totalCFT += s.total_cft;
      });

      // All-time totals
      const allSheets = db.prepare('SELECT * FROM daily_sheets ORDER BY date DESC').all();
      let allSales = 0, allExpenses = 0, allTon = 0, allCFT = 0;
      allSheets.forEach(s => {
        allSales += s.total_sales_amount;
        allExpenses += s.total_cash_expenses;
        allTon += s.total_ton;
        allCFT += s.total_cft;
      });

      // Cash Reconciliation Status
      let reconciliation = { ok: true, difference: 0, details: [] };
      if (sheet) {
        const calcClosing = (sheet.opening_cash || 0) + (sheet.total_cash_sales || 0) + (sheet.total_customer_receipts || 0) - (sheet.total_cash_expenses || 0) - (sheet.total_other_cash_payments || 0);
        const diff = Math.round((calcClosing - (sheet.closing_cash || 0)) * 100) / 100;
        reconciliation.ok = Math.abs(diff) < 0.01;
        reconciliation.difference = diff;
        reconciliation.calculatedClosing = calcClosing;
      }

      return sendJSON(res, {
        selectedDate,
        sheet,
        salesCount: sales.length,
        expensesCount: expenses.length,
        productSummary: Object.values(productSummary),
        expenseByCategory,
        monthStats,
        allTime: {
          totalSales: allSales,
          totalExpenses: allExpenses,
          totalTon: allTon,
          totalCFT: allCFT,
          sheetsCount: allSheets.length
        },
        reconciliation,
        recentSheets: allSheets.slice(0, 10)
      });
    }

    if (pathname === '/api/sheets') {
      const sheets = db.prepare('SELECT * FROM daily_sheets ORDER BY date DESC').all();
      return sendJSON(res, sheets);
    }

    if (pathname === '/api/sheet' && method === 'GET') {
      const selectedDate = parsedUrl.query.date || '2026-11-05';
      const sheet = db.prepare('SELECT * FROM daily_sheets WHERE date = ?').get(selectedDate) || null;
      const sales = db.prepare('SELECT * FROM sales_transactions WHERE date = ? ORDER BY id ASC').all(selectedDate);
      const expenses = db.prepare('SELECT * FROM expense_transactions WHERE date = ? ORDER BY id ASC').all(selectedDate);
      const otherPayments = db.prepare('SELECT * FROM other_payments WHERE date = ? ORDER BY id ASC').all(selectedDate);
      const receipts = db.prepare('SELECT * FROM customer_receipts WHERE date = ? ORDER BY id ASC').all(selectedDate);

      return sendJSON(res, {
        date: selectedDate,
        sheet,
        sales,
        expenses,
        otherPayments,
        receipts
      });
    }

    if (pathname === '/api/sheet' && method === 'POST') {
      const payload = await parseBody(req);
      const {
        date,
        sheet_no,
        day_name,
        opening_cash = 0,
        notes = '',
        sales = [],
        expenses = [],
        other_payments = []
      } = payload;

      if (!date) {
        return sendJSON(res, { error: 'Date is required' }, 400);
      }

      // Compute aggregates
      let total_sales_amount = 0;
      let total_cash_sales = 0;
      let total_credit_sales = 0;
      let total_bank_sales = 0;
      let total_ton = 0;
      let total_cft = 0;

      sales.forEach(s => {
        const amt = Number(s.amount) || 0;
        const qty = Number(s.quantity) || 0;
        total_sales_amount += amt;

        if (s.payment_mode === 'Cash') total_cash_sales += amt;
        else if (s.payment_mode === 'Credit') total_credit_sales += amt;
        else if (s.payment_mode === 'Bank') total_bank_sales += amt;

        if (s.unit === 'Ton') total_ton += qty;
        else if (s.unit === 'CFT') total_cft += qty;
      });

      let total_cash_expenses = 0;
      expenses.forEach(e => {
        const amt = Number(e.amount) || 0;
        if (e.payment_mode === 'Cash' || !e.payment_mode) {
          total_cash_expenses += amt;
        }
      });

      let total_other_cash_payments = 0;
      other_payments.forEach(o => {
        const amt = Number(o.amount) || 0;
        if (o.payment_mode === 'Cash' || !o.payment_mode) {
          total_other_cash_payments += amt;
        }
      });

      const closing_cash = Number(opening_cash) + total_cash_sales - total_cash_expenses - total_other_cash_payments;

      // Atomic Save
      db.exec('BEGIN TRANSACTION;');

      try {
        // Upsert Daily Sheet
        const upsertSheet = db.prepare(`
          INSERT INTO daily_sheets (
            date, sheet_no, day_name, opening_cash, closing_cash,
            total_sales_amount, total_cash_sales, total_credit_sales, total_bank_sales,
            total_cash_expenses, total_other_cash_payments, total_customer_receipts,
            total_ton, total_cft, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET
            sheet_no = excluded.sheet_no,
            day_name = excluded.day_name,
            opening_cash = excluded.opening_cash,
            closing_cash = excluded.closing_cash,
            total_sales_amount = excluded.total_sales_amount,
            total_cash_sales = excluded.total_cash_sales,
            total_credit_sales = excluded.total_credit_sales,
            total_bank_sales = excluded.total_bank_sales,
            total_cash_expenses = excluded.total_cash_expenses,
            total_other_cash_payments = excluded.total_other_cash_payments,
            total_ton = excluded.total_ton,
            total_cft = excluded.total_cft,
            notes = excluded.notes
        `);

        upsertSheet.run(
          date,
          sheet_no || 0,
          day_name || '',
          opening_cash,
          closing_cash,
          total_sales_amount,
          total_cash_sales,
          total_credit_sales,
          total_bank_sales,
          total_cash_expenses,
          total_other_cash_payments,
          total_ton,
          total_cft,
          notes
        );

        // Clear existing transactions for this date
        db.prepare('DELETE FROM sales_transactions WHERE date = ?').run(date);
        db.prepare('DELETE FROM expense_transactions WHERE date = ?').run(date);
        db.prepare('DELETE FROM other_payments WHERE date = ?').run(date);

        // Insert Sales
        const insertSale = db.prepare(`
          INSERT INTO sales_transactions (
            date, sheet_no, gp_no, vehicle_no, item, unit, quantity, rate, amount,
            payment_mode, sales_ledger, customer_ledger, remarks, row_check
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        sales.forEach(s => {
          const qty = Number(s.quantity) || 0;
          const amt = Number(s.amount) || 0;
          const rate = qty > 0 ? (amt / qty) : (Number(s.rate) || 0);
          const salesLedger = s.sales_ledger || (s.item ? s.item + ' SALES' : 'Sales - Products');
          let check = 'OK';
          if (s.payment_mode === 'Credit' && !s.customer_ledger) {
            check = 'Credit sale needs customer ledger';
          }
          insertSale.run(
            date,
            sheet_no || 0,
            s.gp_no || '',
            s.vehicle_no || '',
            s.item || 'M SAND',
            s.unit || 'Ton',
            qty,
            rate,
            amt,
            s.payment_mode || 'Cash',
            salesLedger,
            s.customer_ledger || '',
            s.remarks || '',
            check
          );
        });

        // Insert Expenses
        const insertExpense = db.prepare(`
          INSERT INTO expense_transactions (
            date, sheet_no, description, expense_ledger, payment_mode, amount, category
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        expenses.forEach(e => {
          let cat = e.category || 'General';
          const descLower = (e.description || '').toLowerCase();
          if (descLower.includes('diesel') || descLower.includes('petrol') || descLower.includes('fuel')) cat = 'Fuel';
          else if (descLower.includes('food') || descLower.includes('mess')) cat = 'Food';
          else if (descLower.includes('water') || descLower.includes('tanker')) cat = 'Utilities';
          else if (descLower.includes('bolt') || descLower.includes('maint') || descLower.includes('repair')) cat = 'Maintenance';
          else if (descLower.includes('labor') || descLower.includes('salary') || descLower.includes('wages')) cat = 'Labor';

          insertExpense.run(
            date,
            sheet_no || 0,
            e.description || '',
            e.expense_ledger || '',
            e.payment_mode || 'Cash',
            Number(e.amount) || 0,
            cat
          );
        });

        // Insert Other Payments
        const insertOther = db.prepare(`
          INSERT INTO other_payments (
            date, sheet_no, description, account_ledger, payment_mode, amount, category
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        other_payments.forEach(o => {
          insertOther.run(
            date,
            sheet_no || 0,
            o.description || '',
            o.account_ledger || 'SAIDALAVI ADVANCE',
            o.payment_mode || 'Cash',
            Number(o.amount) || 0,
            o.category || 'Advance'
          );
        });

        db.exec('COMMIT;');
        return sendJSON(res, { success: true, date, closing_cash, total_sales_amount });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('Save error:', err);
        return sendJSON(res, { error: err.message }, 500);
      }
    }

    if (pathname === '/api/upload-original-sheet' && method === 'POST') {
      const payload = await parseBody(req);
      const csvText = payload.csvText || payload.text || '';
      const autoSave = payload.autoSave !== false; // default true

      if (!csvText.trim()) {
        return sendJSON(res, { error: 'Sheet content is empty' }, 400);
      }

      const parsed = parseOriginalInvoiceFormat(csvText);

      if (autoSave && parsed.date) {
        // Save automatically to DB
        db.exec('BEGIN TRANSACTION;');
        try {
          const upsertSheet = db.prepare(`
            INSERT INTO daily_sheets (
              date, sheet_no, day_name, opening_cash, closing_cash,
              total_sales_amount, total_cash_sales, total_credit_sales, total_bank_sales,
              total_cash_expenses, total_other_cash_payments, total_customer_receipts,
              total_ton, total_cft, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
              sheet_no = excluded.sheet_no,
              day_name = excluded.day_name,
              opening_cash = excluded.opening_cash,
              closing_cash = excluded.closing_cash,
              total_sales_amount = excluded.total_sales_amount,
              total_cash_sales = excluded.total_cash_sales,
              total_credit_sales = excluded.total_credit_sales,
              total_bank_sales = excluded.total_bank_sales,
              total_cash_expenses = excluded.total_cash_expenses,
              total_other_cash_payments = excluded.total_other_cash_payments,
              total_ton = excluded.total_ton,
              total_cft = excluded.total_cft,
              notes = excluded.notes
          `);

          upsertSheet.run(
            parsed.date,
            parsed.sheetNo,
            parsed.dayName,
            parsed.openingCash,
            parsed.closingCash,
            parsed.summary.totalSales,
            parsed.summary.cashSales,
            parsed.summary.creditSales,
            0,
            parsed.summary.totalExpenses,
            parsed.summary.otherPayments,
            parsed.summary.tonQty,
            parsed.summary.cftQty,
            'Uploaded from Original Invoice Format'
          );

          db.prepare('DELETE FROM sales_transactions WHERE date = ?').run(parsed.date);
          db.prepare('DELETE FROM expense_transactions WHERE date = ?').run(parsed.date);
          db.prepare('DELETE FROM other_payments WHERE date = ?').run(parsed.date);

          const insertSale = db.prepare(`
            INSERT INTO sales_transactions (
              date, sheet_no, gp_no, vehicle_no, item, unit, quantity, rate, amount,
              payment_mode, sales_ledger, customer_ledger, remarks, row_check
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          parsed.sales.forEach(s => {
            const salesLedger = s.item ? s.item + ' SALES' : 'M SAND SALES';
            insertSale.run(
              parsed.date,
              parsed.sheetNo,
              s.gp_no || '',
              s.vehicle_no,
              s.item,
              s.unit,
              s.quantity,
              s.rate,
              s.amount,
              s.payment_mode,
              salesLedger,
              s.customer_ledger || '',
              s.remarks || '',
              'OK'
            );
          });

          const insertExpense = db.prepare(`
            INSERT INTO expense_transactions (
              date, sheet_no, description, expense_ledger, payment_mode, amount, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          parsed.expenses.forEach(e => {
            insertExpense.run(
              parsed.date,
              parsed.sheetNo,
              e.description,
              e.expense_ledger,
              e.payment_mode,
              e.amount,
              e.category
            );
          });

          const insertOther = db.prepare(`
            INSERT INTO other_payments (
              date, sheet_no, description, account_ledger, payment_mode, amount, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          parsed.otherPayments.forEach(o => {
            insertOther.run(
              parsed.date,
              parsed.sheetNo,
              o.description,
              o.account_ledger,
              o.payment_mode,
              o.amount,
              o.category
            );
          });

          db.exec('COMMIT;');
        } catch (err) {
          db.exec('ROLLBACK;');
          console.error('Error auto-saving parsed original sheet:', err);
          return sendJSON(res, { error: err.message }, 500);
        }
      }

      return sendJSON(res, {
        success: true,
        saved: autoSave,
        parsed
      });
    }

    if (pathname === '/api/parse-raw-sheet' && method === 'POST') {
      const payload = await parseBody(req);
      const rawText = payload.text || '';
      
      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
      const parsedSales = [];
      const parsedExpenses = [];
      const parsedOthers = [];
      let detectedDate = '2026-11-05';
      let detectedSheetNo = 275;

      for (const line of lines) {
        // Date detection
        const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})|Date,\s*(\d{4}-\d{2}-\d{2})/i);
        if (dateMatch) {
          detectedDate = dateMatch[1] || dateMatch[2];
        }

        const sheetMatch = line.match(/No\.?,?\s*(\d+)/i);
        if (sheetMatch) {
          detectedSheetNo = parseInt(sheetMatch[1], 10);
        }

        // Vehicle line detection: KA..., Tractor, etc.
        // e.g. KA14B 3300,,12.38,,,,,,10700
        // or KA34A 2865, M SAND, Ton, 11.95, 10400, Credit
        const isVehicle = line.match(/(KA\s*\d+[A-Z0-9\s]*|Tractor|TN\s*\d+|KL\s*\d+)/i);
        if (isVehicle) {
          const parts = line.split(/[,\t]+/).map(p => p.trim());
          const vehicle = parts[0] || parts[1] || isVehicle[1];
          
          let item = 'M SAND';
          let unit = 'Ton';
          let qty = 0;
          let amount = 0;
          let mode = 'Cash';
          let customerLedger = '';
          let remarks = '';

          // Look for quantities, units, and amounts
          for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (p.toUpperCase().includes('CFT')) {
              unit = 'CFT';
              const num = parseFloat(p);
              if (!isNaN(num)) qty = num;
            } else if (p.toUpperCase() === 'P SAND') {
              item = 'P SAND';
            } else if (p.toUpperCase() === 'DUST') {
              item = 'DUST';
            } else if (p.toUpperCase() === '20 MM') {
              item = '20 MM';
            } else if (p.toUpperCase() === 'SLURRY') {
              item = 'SLURRY';
            } else if (p.toUpperCase() === 'CREDIT') {
              mode = 'Credit';
            } else if (p.toUpperCase() === 'BANK') {
              mode = 'Bank';
            } else if (p.includes('(Ravi)')) {
              remarks = '(Ravi)';
              customerLedger = 'RAVI ANNAN';
            }

            const val = parseFloat(p);
            if (!isNaN(val)) {
              if (val > 1000 && amount === 0) {
                amount = val;
              } else if (val < 100 && qty === 0 && val > 0) {
                qty = val;
              }
            }
          }

          // Check if credit in sheet columns (Credit column usually right before Cash)
          if (line.toLowerCase().includes('credit') || vehicle.includes('2865') || remarks.includes('Ravi')) {
            // Check vehicle patterns
            if (vehicle.includes('2865')) customerLedger = 'KA34 2865';
          }

          parsedSales.push({
            vehicle_no: vehicle.replace(/^[,\s]+/, ''),
            item,
            unit,
            quantity: qty,
            amount: amount,
            rate: qty > 0 ? (amount / qty) : 0,
            payment_mode: mode,
            customer_ledger: customerLedger,
            remarks
          });
          continue;
        }

        // Expense / Payment detection
        // e.g. "JCB diesel,,,,5000", "Staff food expenses,,,,924", "Advance paid to Saidalavi,,,,200"
        const isExpense = line.match(/(diesel|food|bolt|water|labor|petrol|advance|expense|rent|salary|recharge|maint|repair)/i);
        if (isExpense) {
          const parts = line.split(/[,\t]+/).map(p => p.trim()).filter(Boolean);
          const desc = parts[0];
          let amount = 0;
          for (let i = 1; i < parts.length; i++) {
            const val = parseFloat(parts[i]);
            if (!isNaN(val) && val > 0) {
              amount = val;
              break;
            }
          }

          if (desc.toLowerCase().includes('advance')) {
            parsedOthers.push({
              description: desc,
              account_ledger: 'SAIDALAVI ADVANCE',
              payment_mode: 'Cash',
              amount: amount,
              category: 'Advance'
            });
          } else {
            let ledger = 'OTHER EXPENSE';
            let cat = 'General';
            const dl = desc.toLowerCase();
            if (dl.includes('jcb diesel')) { ledger = 'JCB DIESEL'; cat = 'Fuel'; }
            else if (dl.includes('seeb diesel') || dl.includes('jeep diesel')) { ledger = 'JEEP DIESEL'; cat = 'Fuel'; }
            else if (dl.includes('diesel')) { ledger = 'FUEL EXPENSE'; cat = 'Fuel'; }
            else if (dl.includes('food')) { ledger = 'FOOD STAFF EXPENSE'; cat = 'Food'; }
            else if (dl.includes('bolt') || dl.includes('maint')) { ledger = 'JCB MAINT'; cat = 'Maintenance'; }
            else if (dl.includes('water')) { ledger = 'TANK WATER'; cat = 'Utilities'; }
            else if (dl.includes('labor') || dl.includes('labour')) { ledger = 'MOJAHID DIRECT EXP'; cat = 'Labor'; }

            parsedExpenses.push({
              description: desc,
              expense_ledger: ledger,
              payment_mode: 'Cash',
              amount: amount,
              category: cat
            });
          }
        }
      }

      return sendJSON(res, {
        detectedDate,
        detectedSheetNo,
        sales: parsedSales,
        expenses: parsedExpenses,
        otherPayments: parsedOthers
      });
    }

    if (pathname === '/api/pnl') {
      const period = parsedUrl.query.period || 'daily';
      const targetDate = parsedUrl.query.date || '2026-11-05';
      const monthPrefix = targetDate.substring(0, 7);

      let sales = [];
      let expenses = [];
      let totalTon = 0;
      let totalCFT = 0;

      if (period === 'daily') {
        sales = db.prepare('SELECT * FROM sales_transactions WHERE date = ?').all(targetDate);
        expenses = db.prepare('SELECT * FROM expense_transactions WHERE date = ?').all(targetDate);
        const sheet = db.prepare('SELECT * FROM daily_sheets WHERE date = ?').get(targetDate);
        if (sheet) {
          totalTon = sheet.total_ton;
          totalCFT = sheet.total_cft;
        }
      } else {
        sales = db.prepare('SELECT * FROM sales_transactions WHERE date LIKE ?').all(monthPrefix + '%');
        expenses = db.prepare('SELECT * FROM expense_transactions WHERE date LIKE ?').all(monthPrefix + '%');
        const sheets = db.prepare('SELECT * FROM daily_sheets WHERE date LIKE ?').all(monthPrefix + '%');
        sheets.forEach(s => {
          totalTon += s.total_ton;
          totalCFT += s.total_cft;
        });
      }

      // Revenue by Product
      const revenueByProduct = {};
      let totalRevenue = 0;
      sales.forEach(s => {
        const item = s.item || 'M SAND';
        revenueByProduct[item] = (revenueByProduct[item] || 0) + s.amount;
        totalRevenue += s.amount;
      });

      // Variable Costs by Category
      const variableCosts = {};
      let totalVariableCost = 0;
      expenses.forEach(e => {
        const cat = e.category || 'General';
        variableCosts[cat] = (variableCosts[cat] || 0) + e.amount;
        totalVariableCost += e.amount;
      });

      // Fixed Overheads
      const fixedRows = db.prepare('SELECT * FROM fixed_overheads').all();
      let monthlyFixedTotal = 0;
      fixedRows.forEach(r => monthlyFixedTotal += r.monthly_amount);

      // Daily fixed cost = Monthly / 26 days
      const allocatedFixedCost = period === 'daily' ? (monthlyFixedTotal / 26) : monthlyFixedTotal;

      const grossMargin = totalRevenue - totalVariableCost;
      const grossMarginPct = totalRevenue > 0 ? ((grossMargin / totalRevenue) * 100) : 0;
      const netProfit = grossMargin - allocatedFixedCost;
      const netProfitPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

      // Key Metrics
      const totalEquivalentTon = totalTon + (totalCFT / 20); // 1 Ton ~= 18-20 CFT
      const costPerTon = totalEquivalentTon > 0 ? ((totalVariableCost + allocatedFixedCost) / totalEquivalentTon) : 0;
      const fuelCost = variableCosts['Fuel'] || 0;
      const fuelCostPerTon = totalEquivalentTon > 0 ? (fuelCost / totalEquivalentTon) : 0;
      const realizationPerTon = totalTon > 0 ? (totalRevenue / totalTon) : 0;

      return sendJSON(res, {
        period,
        targetDate,
        totalRevenue,
        revenueByProduct,
        totalVariableCost,
        variableCosts,
        grossMargin,
        grossMarginPct,
        allocatedFixedCost,
        fixedOverheadsBreakdown: fixedRows.map(r => ({
          name: r.name,
          category: r.category,
          monthly: r.monthly_amount,
          allocated: period === 'daily' ? (r.monthly_amount / 26) : r.monthly_amount
        })),
        netProfit,
        netProfitPct,
        totalTon,
        totalCFT,
        totalEquivalentTon,
        costPerTon,
        fuelCostPerTon,
        realizationPerTon
      });
    }

    if (pathname === '/api/customer-ledgers') {
      const creditSales = db.prepare(`
        SELECT customer_ledger, vehicle_no, item, unit, quantity, amount, date, remarks
        FROM sales_transactions
        WHERE payment_mode = 'Credit' OR customer_ledger != ''
        ORDER BY date DESC
      `).all();

      const receipts = db.prepare('SELECT * FROM customer_receipts ORDER BY date DESC').all();

      const customerMap = {};

      creditSales.forEach(s => {
        const cust = s.customer_ledger || s.vehicle_no || 'Unassigned Customer';
        if (!customerMap[cust]) {
          customerMap[cust] = {
            customer: cust,
            totalTrips: 0,
            totalTon: 0,
            totalCFT: 0,
            totalBilled: 0,
            totalReceived: 0,
            balance: 0,
            transactions: []
          };
        }
        customerMap[cust].totalTrips += 1;
        if (s.unit === 'Ton') customerMap[cust].totalTon += s.quantity;
        else if (s.unit === 'CFT') customerMap[cust].totalCFT += s.quantity;
        customerMap[cust].totalBilled += s.amount;
        customerMap[cust].transactions.push(s);
      });

      receipts.forEach(r => {
        const cust = r.customer_ledger;
        if (customerMap[cust]) {
          customerMap[cust].totalReceived += r.amount;
        } else {
          customerMap[cust] = {
            customer: cust,
            totalTrips: 0,
            totalTon: 0,
            totalCFT: 0,
            totalBilled: 0,
            totalReceived: r.amount,
            balance: 0,
            transactions: []
          };
        }
      });

      // Calculate balance
      Object.values(customerMap).forEach(c => {
        c.balance = c.totalBilled - c.totalReceived;
      });

      return sendJSON(res, Object.values(customerMap));
    }

    if (pathname === '/api/customer-receipt' && method === 'POST') {
      const payload = await parseBody(req);
      const { customer_ledger, date, payment_mode = 'Cash', amount = 0, reference_no = '', remarks = '' } = payload;

      if (!customer_ledger || !amount) {
        return sendJSON(res, { error: 'Customer and amount are required' }, 400);
      }

      const stmt = db.prepare(`
        INSERT INTO customer_receipts (date, customer_ledger, payment_mode, amount, reference_no, remarks)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(date || new Date().toISOString().slice(0, 10), customer_ledger, payment_mode, Number(amount), reference_no, remarks);

      // If Cash, update today's sheet customer receipts
      if (payment_mode === 'Cash' && date) {
        db.prepare(`
          UPDATE daily_sheets
          SET total_customer_receipts = total_customer_receipts + ?,
              closing_cash = closing_cash + ?
          WHERE date = ?
        `).run(Number(amount), Number(amount), date);
      }

      return sendJSON(res, { success: true });
    }

    if (pathname === '/api/projections') {
      // Derive baseline from actual daily sheet if available
      const latestSheet = db.prepare('SELECT * FROM daily_sheets ORDER BY date DESC LIMIT 1').get();
      let actualDailyCap = 242.79;
      let actualAvgRate = 877.71;
      let actualFuelPerTon = 65.89;
      let actualLaborPerTon = 12.36;
      let actualMaintPerTon = 2.97;

      if (latestSheet && latestSheet.total_ton > 0) {
        actualDailyCap = Number(latestSheet.total_ton.toFixed(1));
        actualAvgRate = Number((latestSheet.total_sales_amount / latestSheet.total_ton).toFixed(2));
        
        const fuelExp = db.prepare("SELECT SUM(amount) as amt FROM expense_transactions WHERE (category = 'Fuel' OR description LIKE '%diesel%') AND date = ?").get(latestSheet.date);
        if (fuelExp && fuelExp.amt) actualFuelPerTon = Number((fuelExp.amt / latestSheet.total_ton).toFixed(2));

        const laborExp = db.prepare("SELECT SUM(amount) as amt FROM expense_transactions WHERE (category = 'Labor' OR description LIKE '%labor%' OR description LIKE '%labour%') AND date = ?").get(latestSheet.date);
        if (laborExp && laborExp.amt) actualLaborPerTon = Number((laborExp.amt / latestSheet.total_ton).toFixed(2));

        const maintExp = db.prepare("SELECT SUM(amount) as amt FROM expense_transactions WHERE (category = 'Maintenance' OR description LIKE '%bolt%' OR description LIKE '%maint%') AND date = ?").get(latestSheet.date);
        if (maintExp && maintExp.amt) actualMaintPerTon = Number((maintExp.amt / latestSheet.total_ton).toFixed(2));
      }

      const dailyCap = Number(parsedUrl.query.dailyCapacity) || actualDailyCap;
      const workingDays = Number(parsedUrl.query.workingDays) || 26;
      const avgRatePerTon = Number(parsedUrl.query.avgRate) || actualAvgRate;
      const fuelPerTon = Number(parsedUrl.query.fuelPerTon) || actualFuelPerTon;
      const laborPerTon = actualLaborPerTon;
      const maintPerTon = actualMaintPerTon;
      const royaltyPerTon = 0; // Royalty is captured in sales sheet if any

      const variableCostPerTon = Number((fuelPerTon + laborPerTon + maintPerTon).toFixed(2));
      const contributionMarginPerTon = Number((avgRatePerTon - variableCostPerTon).toFixed(2));

      // Fixed overheads
      const fixedRows = db.prepare('SELECT * FROM fixed_overheads').all();
      let fixedMonthly = 0;
      fixedRows.forEach(r => fixedMonthly += r.monthly_amount);

      // Breakeven
      const breakevenTonsMonth = contributionMarginPerTon > 0 ? (fixedMonthly / contributionMarginPerTon) : 0;
      const breakevenDaysMonth = dailyCap > 0 ? (breakevenTonsMonth / dailyCap) : 0;
      const breakevenRevenue = breakevenTonsMonth * avgRatePerTon;

      // 30, 60, 90 Day Projections
      const monthlyTonnage = dailyCap * workingDays;
      const monthlyRevenue = monthlyTonnage * avgRatePerTon;
      const monthlyVarCost = monthlyTonnage * variableCostPerTon;
      const monthlyNetProfit = monthlyRevenue - monthlyVarCost - fixedMonthly;

      const forecast30 = {
        days: workingDays,
        tonnage: monthlyTonnage,
        revenue: monthlyRevenue,
        variableCost: monthlyVarCost,
        fixedCost: fixedMonthly,
        netProfit: monthlyNetProfit,
        marginPct: ((monthlyNetProfit / monthlyRevenue) * 100).toFixed(1)
      };

      const forecast60 = {
        days: workingDays * 2,
        tonnage: monthlyTonnage * 2,
        revenue: monthlyRevenue * 2,
        variableCost: monthlyVarCost * 2,
        fixedCost: fixedMonthly * 2,
        netProfit: monthlyNetProfit * 2,
        marginPct: ((monthlyNetProfit / monthlyRevenue) * 100).toFixed(1)
      };

      const forecast90 = {
        days: workingDays * 3,
        tonnage: monthlyTonnage * 3,
        revenue: monthlyRevenue * 3,
        variableCost: monthlyVarCost * 3,
        fixedCost: fixedMonthly * 3,
        netProfit: monthlyNetProfit * 3,
        marginPct: ((monthlyNetProfit / monthlyRevenue) * 100).toFixed(1)
      };

      // Sensitivity table
      const sensitivity = [
        { scenario: 'Base Case (Normal)', rate: avgRatePerTon, diesel: fuelPerTon, volume: dailyCap, profit: monthlyNetProfit },
        { scenario: 'Diesel Price Hike (+₹15/ton)', rate: avgRatePerTon, diesel: fuelPerTon + 15, volume: dailyCap, profit: monthlyRevenue - (monthlyTonnage * (variableCostPerTon + 15)) - fixedMonthly },
        { scenario: 'Price Drop (-₹50/ton)', rate: avgRatePerTon - 50, diesel: fuelPerTon, volume: dailyCap, profit: (monthlyTonnage * (avgRatePerTon - 50)) - monthlyVarCost - fixedMonthly },
        { scenario: 'Monsoon Slowdown (18 Days)', rate: avgRatePerTon, diesel: fuelPerTon, volume: dailyCap, profit: (dailyCap * 18 * avgRatePerTon) - (dailyCap * 18 * variableCostPerTon) - fixedMonthly },
        { scenario: 'Peak Demand (+20% Volume)', rate: avgRatePerTon, diesel: fuelPerTon, volume: dailyCap * 1.2, profit: (dailyCap * 1.2 * workingDays * avgRatePerTon) - (dailyCap * 1.2 * workingDays * variableCostPerTon) - fixedMonthly }
      ];

      return sendJSON(res, {
        params: { dailyCap, workingDays, avgRatePerTon, variableCostPerTon, fixedMonthly },
        breakeven: {
          breakevenTonsMonth: Math.round(breakevenTonsMonth),
          breakevenDaysMonth: Number(breakevenDaysMonth.toFixed(1)),
          breakevenRevenue: Math.round(breakevenRevenue),
          contributionMarginPerTon
        },
        forecast30,
        forecast60,
        forecast90,
        sensitivity
      });
    }

    if (pathname === '/api/reports/daily') {
      const selectedDate = parsedUrl.query.date || '2026-11-05';
      const sheet = db.prepare('SELECT * FROM daily_sheets WHERE date = ?').get(selectedDate) || {};
      const sales = db.prepare('SELECT * FROM sales_transactions WHERE date = ? ORDER BY id ASC').all(selectedDate);
      const expenses = db.prepare('SELECT * FROM expense_transactions WHERE date = ? ORDER BY id ASC').all(selectedDate);
      const otherPayments = db.prepare('SELECT * FROM other_payments WHERE date = ? ORDER BY id ASC').all(selectedDate);

      // WhatsApp text generation
      let waText = `*VRN STONE CRUSHERS - DAILY REPORT*\n`;
      waText += `📅 Date: ${selectedDate} (${sheet.day_name || ''})\n`;
      waText += `📑 Sheet No: ${sheet.sheet_no || '275'}\n`;
      waText += `--------------------------------\n`;
      waText += `🚛 Total Trips: ${sales.length}\n`;
      waText += `⚖️ Dispatch: ${sheet.total_ton || 0} Ton | ${sheet.total_cft || 0} CFT\n`;
      waText += `💰 Total Sales: ₹${(sheet.total_sales_amount || 0).toLocaleString('en-IN')}\n`;
      waText += `   💵 Cash Sales: ₹${(sheet.total_cash_sales || 0).toLocaleString('en-IN')}\n`;
      waText += `   📋 Credit Sales: ₹${(sheet.total_credit_sales || 0).toLocaleString('en-IN')}\n`;
      waText += `--------------------------------\n`;
      waText += `⛽ Expenses: ₹${(sheet.total_cash_expenses || 0).toLocaleString('en-IN')}\n`;
      expenses.forEach((e, idx) => {
        waText += `   ${idx + 1}. ${e.description}: ₹${e.amount.toLocaleString('en-IN')}\n`;
      });
      if (otherPayments.length > 0) {
        waText += `💳 Advances / Other: ₹${(sheet.total_other_cash_payments || 0).toLocaleString('en-IN')}\n`;
        otherPayments.forEach(o => {
          waText += `   • ${o.description}: ₹${o.amount.toLocaleString('en-IN')}\n`;
        });
      }
      waText += `--------------------------------\n`;
      waText += `💼 Cash Balance:\n`;
      waText += `   Opening: ₹${(sheet.opening_cash || 0).toLocaleString('en-IN')}\n`;
      waText += `   Net Cash In: ₹${(sheet.total_cash_sales || 0).toLocaleString('en-IN')}\n`;
      waText += `   Total Payments: ₹${((sheet.total_cash_expenses || 0) + (sheet.total_other_cash_payments || 0)).toLocaleString('en-IN')}\n`;
      waText += `   👉 *Closing Cash: ₹${(sheet.closing_cash || 0).toLocaleString('en-IN')}*\n`;

      return sendJSON(res, {
        sheet,
        sales,
        expenses,
        otherPayments,
        whatsappText: waText
      });
    }

    // STATIC FILE SERVING
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'public', 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(content);

  } catch (error) {
    console.error('Server error:', error);
    sendJSON(res, { error: error.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`VRN Stone Crusher Portal running on http://localhost:${PORT}`);
});
