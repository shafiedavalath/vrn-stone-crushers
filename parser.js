const fs = require('fs');

function parseOriginalInvoiceFormat(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  let sheetNo = 275;
  let date = '2026-11-05';
  let dayName = 'Thursday';
  let openingCash = 0;
  let closingCash = 0;

  const sales = [];
  const expenses = [];
  const otherPayments = [];

  let inExpenses = false;
  let headerFound = false;

  for (let line of lines) {
    // 1. Detect Metadata
    const sheetMatch = line.match(/No\.?,(\d+)/i);
    if (sheetMatch) sheetNo = parseInt(sheetMatch[1], 10);

    const dateMatch = line.match(/Date,(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) date = dateMatch[1];

    const dayMatch = line.match(/Day,([A-Za-z]+)/i);
    if (dayMatch) dayName = dayMatch[1];

    // Check for Expense header
    if (line.toLowerCase().startsWith('expense :') || line.toLowerCase().startsWith('expense:')) {
      inExpenses = true;
      continue;
    }

    // Check for vehicle table header
    if (line.includes('GP No.') && line.includes('Name & Vehicle No.' || line.includes('Vehicle'))) {
      headerFound = true;
      continue;
    }

    if (!headerFound) {
      continue; // Skip title and instructions rows before table starts
    }

    // Parse Opening / Closing Cash from side columns
    if (line.includes('Opening Balance')) {
      const parts = line.split(',');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes('Opening Balance')) {
          for (let j = i + 1; j < parts.length; j++) {
            const val = parseFloat(parts[j]);
            if (!isNaN(val)) { openingCash = val; break; }
          }
        }
      }
    }

    if (line.includes('CLOSING BALANCE')) {
      const parts = line.split(',');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes('CLOSING BALANCE')) {
          for (let j = i + 1; j < parts.length; j++) {
            const val = parseFloat(parts[j]);
            if (!isNaN(val)) { closingCash = val; break; }
          }
        }
      }
    }

    // Parse Expenses
    if (inExpenses) {
      if (line.startsWith('Added to the original') || line.startsWith('VRN STONE CRUSHERS – Daily Transactions')) {
        break; // Reached next sheet section
      }

      const parts = line.split(',');
      const desc = parts[0]?.trim();
      if (!desc || desc.toLowerCase().startsWith('expense') || desc.toLowerCase().startsWith('closing')) continue;

      let amount = 0;
      for (let i = 1; i < parts.length; i++) {
        const val = parseFloat(parts[i]);
        if (!isNaN(val) && val > 0) {
          amount = val;
          break;
        }
      }

      if (amount > 0) {
        if (desc.toLowerCase().includes('advance')) {
          otherPayments.push({
            description: desc,
            amount: amount,
            account_ledger: 'SAIDALAVI ADVANCE',
            category: 'Advance',
            payment_mode: 'Cash'
          });
        } else {
          let ledger = 'CRUSHER EXP';
          let category = 'General';
          const dl = desc.toLowerCase();
          if (dl.includes('jcb diesel')) { ledger = 'JCB DIESEL'; category = 'Fuel'; }
          else if (dl.includes('seeb diesel')) { ledger = 'JEEP DIESEL'; category = 'Fuel'; }
          else if (dl.includes('diesel')) { ledger = 'FUEL EXPENSE'; category = 'Fuel'; }
          else if (dl.includes('food')) { ledger = 'FOOD STAFF EXPENSE'; category = 'Food'; }
          else if (dl.includes('bolt') || dl.includes('maint')) { ledger = 'JCB MAINT'; category = 'Maintenance'; }
          else if (dl.includes('water')) { ledger = 'TANK WATER'; category = 'Utilities'; }
          else if (dl.includes('labor') || dl.includes('labour')) { ledger = 'MOJAHID DIRECT EXP'; category = 'Labor'; }

          expenses.push({
            description: desc,
            amount: amount,
            expense_ledger: ledger,
            category: category,
            payment_mode: 'Cash'
          });
        }
      }
      continue;
    }

    // Parse Vehicle Sales Row
    // Format: GP No. (0), Name & Vehicle (1), ROYALTY (2), M SAND (3), P SAND (4), DUST (5), 20 MM (6), SLURRY (7), Credit Sale (8), Cash Sale (9), Bank Sale (10)
    const cols = line.split(',');
    if (cols.length >= 10) {
      const vehicleRaw = cols[1]?.trim();
      if (!vehicleRaw || vehicleRaw.toUpperCase() === 'TOTAL' || vehicleRaw.includes('GP No')) continue;

      let item = 'M SAND';
      let unit = 'Ton';
      let qty = 0;

      // Check item columns
      if (cols[3]?.trim()) {
        item = 'M SAND';
        const raw = cols[3].trim();
        unit = raw.toUpperCase().includes('CFT') ? 'CFT' : 'Ton';
        qty = parseFloat(raw) || 0;
      } else if (cols[4]?.trim()) {
        item = 'P SAND';
        const raw = cols[4].trim();
        unit = raw.toUpperCase().includes('CFT') ? 'CFT' : 'Ton';
        qty = parseFloat(raw) || 0;
      } else if (cols[5]?.trim()) {
        item = 'DUST';
        const raw = cols[5].trim();
        unit = raw.toUpperCase().includes('CFT') ? 'CFT' : 'Ton';
        qty = parseFloat(raw) || 0;
      } else if (cols[6]?.trim()) {
        item = '20 MM';
        const raw = cols[6].trim();
        unit = raw.toUpperCase().includes('CFT') ? 'CFT' : 'Ton';
        qty = parseFloat(raw) || 0;
      } else if (cols[7]?.trim()) {
        item = 'SLURRY';
        const raw = cols[7].trim();
        unit = raw.toUpperCase().includes('CFT') ? 'CFT' : 'Ton';
        qty = parseFloat(raw) || 0;
      }

      // Check amount & mode
      const creditVal = parseFloat(cols[8]);
      const cashVal = parseFloat(cols[9]);
      const bankVal = parseFloat(cols[10]);

      let amount = 0;
      let payment_mode = 'Cash';

      if (!isNaN(creditVal) && creditVal > 0) {
        amount = creditVal;
        payment_mode = 'Credit';
      } else if (!isNaN(cashVal) && cashVal > 0) {
        amount = cashVal;
        payment_mode = 'Cash';
      } else if (!isNaN(bankVal) && bankVal > 0) {
        amount = bankVal;
        payment_mode = 'Bank';
      }

      if (amount > 0) {
        // Derive Customer Ledger
        let customer_ledger = '';
        let remarks = '';
        const vUpper = vehicleRaw.toUpperCase();

        if (vUpper.includes('(RAVI)') || vUpper.includes('RAVI')) {
          customer_ledger = 'RAVI ANNAN';
          remarks = '(Ravi)';
        } else if (vUpper.includes('KA34') || vUpper.includes('2865')) {
          customer_ledger = 'KA34 2865';
        } else if (vUpper.includes('KA50') || vUpper.includes('1264')) {
          customer_ledger = 'KA50 1264';
        } else if (vUpper.includes('KA09') || vUpper.includes('9537')) {
          customer_ledger = 'KA 09 B9537';
        } else if (vUpper.includes('KA18C 4954') || vUpper.includes('4954')) {
          customer_ledger = 'KA18C4954';
        } else if (vUpper.includes('KA16') || vUpper.includes('1965')) {
          customer_ledger = 'KA 16 B1965';
        } else if (vUpper.includes('KA54') || vUpper.includes('0860')) {
          customer_ledger = 'KA 54 0860';
        } else if (payment_mode === 'Credit') {
          customer_ledger = vehicleRaw.replace(/\(.*?\)/, '').trim();
        }

        const rate = qty > 0 ? (amount / qty) : 0;

        sales.push({
          gp_no: cols[0]?.trim() || '',
          vehicle_no: vehicleRaw.replace(/\(.*?\)/, '').trim(),
          item,
          unit,
          quantity: qty,
          rate: Number(rate.toFixed(2)),
          amount,
          payment_mode,
          customer_ledger,
          remarks
        });
      }
    }
  }

  // Derive calculated closing if not found
  let totalCashSales = sales.filter(s => s.payment_mode === 'Cash').reduce((a, b) => a + b.amount, 0);
  let totalCashExpenses = expenses.reduce((a, b) => a + b.amount, 0);
  let totalOtherPayments = otherPayments.reduce((a, b) => a + b.amount, 0);
  if (!closingCash) {
    closingCash = openingCash + totalCashSales - totalCashExpenses - totalOtherPayments;
  }

  return {
    sheetNo,
    date,
    dayName,
    openingCash,
    closingCash,
    sales,
    expenses,
    otherPayments,
    summary: {
      salesCount: sales.length,
      expensesCount: expenses.length,
      totalSales: sales.reduce((a, b) => a + b.amount, 0),
      cashSales: totalCashSales,
      creditSales: sales.filter(s => s.payment_mode === 'Credit').reduce((a, b) => a + b.amount, 0),
      totalExpenses: totalCashExpenses,
      otherPayments: totalOtherPayments,
      tonQty: sales.filter(s => s.unit === 'Ton').reduce((a, b) => a + b.quantity, 0),
      cftQty: sales.filter(s => s.unit === 'CFT').reduce((a, b) => a + b.quantity, 0)
    }
  };
}

module.exports = { parseOriginalInvoiceFormat };
