import sqlite3
import json

db_path = "data/crusher.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Enable WAL mode for high concurrency
cursor.execute("PRAGMA journal_mode=WAL;")

# 1. Daily Sheets
cursor.execute("""
CREATE TABLE IF NOT EXISTS daily_sheets (
    date TEXT PRIMARY KEY,
    sheet_no INTEGER,
    day_name TEXT,
    opening_cash REAL DEFAULT 0,
    closing_cash REAL DEFAULT 0,
    total_sales_amount REAL DEFAULT 0,
    total_cash_sales REAL DEFAULT 0,
    total_credit_sales REAL DEFAULT 0,
    total_bank_sales REAL DEFAULT 0,
    total_cash_expenses REAL DEFAULT 0,
    total_other_cash_payments REAL DEFAULT 0,
    total_customer_receipts REAL DEFAULT 0,
    total_ton REAL DEFAULT 0,
    total_cft REAL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""")

# 2. Sales Transactions
cursor.execute("""
CREATE TABLE IF NOT EXISTS sales_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    sheet_no INTEGER,
    gp_no TEXT,
    vehicle_no TEXT,
    item TEXT,
    unit TEXT,
    quantity REAL,
    rate REAL,
    amount REAL,
    payment_mode TEXT,
    sales_ledger TEXT,
    customer_ledger TEXT,
    remarks TEXT,
    row_check TEXT DEFAULT 'OK'
);
""")

# 3. Expense Transactions
cursor.execute("""
CREATE TABLE IF NOT EXISTS expense_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    sheet_no INTEGER,
    description TEXT,
    expense_ledger TEXT,
    payment_mode TEXT,
    amount REAL,
    category TEXT
);
""")

# 4. Other Payments (Advances, Capital, etc.)
cursor.execute("""
CREATE TABLE IF NOT EXISTS other_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    sheet_no INTEGER,
    description TEXT,
    account_ledger TEXT,
    payment_mode TEXT,
    amount REAL,
    category TEXT
);
""")

# 5. Customer Receipts (Collection against credit sales)
cursor.execute("""
CREATE TABLE IF NOT EXISTS customer_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    customer_ledger TEXT,
    payment_mode TEXT,
    amount REAL,
    reference_no TEXT,
    remarks TEXT
);
""")

# 6. Fixed Overheads Settings (for Monthly P&L and Projections)
cursor.execute("""
CREATE TABLE IF NOT EXISTS fixed_overheads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    monthly_amount REAL,
    category TEXT
);
""")

# Seed Fixed Overheads (typical crusher monthly structure)
overheads = [
    ("Machinery Loan EMI / Lease", 85000.0, "Finance"),
    ("Permanent Staff & Operator Salaries", 75000.0, "Salaries"),
    ("Quarry Land Lease & Rent", 40000.0, "Rent"),
    ("Plant Machinery Depreciation Provision", 35000.0, "Depreciation"),
    ("Mining Royalty & Environmental Permits", 25000.0, "Regulatory"),
    ("Power / Grid Base Tariff", 30000.0, "Utilities"),
    ("General Admin & Insurance", 15000.0, "Admin")
]

for name, amt, cat in overheads:
    cursor.execute("""
    INSERT OR IGNORE INTO fixed_overheads (name, monthly_amount, category)
    VALUES (?, ?, ?)
    """, (name, amt, cat))

# Now seed Sheet 275 (2026-11-05)
cursor.execute("DELETE FROM sales_transactions WHERE date = '2026-11-05'");
cursor.execute("DELETE FROM expense_transactions WHERE date = '2026-11-05'");
cursor.execute("DELETE FROM other_payments WHERE date = '2026-11-05'");
cursor.execute("DELETE FROM daily_sheets WHERE date = '2026-11-05'");

# Insert Sheet 275
cursor.execute("""
INSERT INTO daily_sheets (
    date, sheet_no, day_name, opening_cash, closing_cash,
    total_sales_amount, total_cash_sales, total_credit_sales, total_bank_sales,
    total_cash_expenses, total_other_cash_payments, total_customer_receipts,
    total_ton, total_cft, notes
) VALUES (
    '2026-11-05', 275, 'Thursday', 0, 123606,
    234100, 147450, 86650, 0,
    23644, 200, 0,
    242.79, 600, 'Original daily sheet entry from VRN Stone Crushers Book'
)
""")

# Sales from Day 275
sales_data = [
    ("2026-11-05", 275, "", "KA14B 3300", "M SAND", "Ton", 12.38, 864.30, 10700.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA18D 2817", "M SAND", "Ton", 11.79, 869.38, 10250.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA09AA 5022", "M SAND", "Ton", 12.09, 868.49, 10500.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA35 5854", "M SAND", "Ton", 19.05, 860.89, 16400.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA11A 8928", "M SAND", "Ton", 11.48, 871.08, 10000.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA18D 0215", "M SAND", "Ton", 12.69, 858.94, 10900.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA18C 4290", "M SAND", "Ton", 12.48, 857.37, 10700.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA22A 7520", "M SAND", "Ton", 12.24, 866.01, 10600.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA50 1264", "M SAND", "Ton", 11.80, 868.64, 10250.0, "Credit", "M SAND SALES", "KA50 1264", "", "Credit sale needs customer ledger"),
    ("2026-11-05", 275, "", "KA34A 2865", "M SAND", "Ton", 11.95, 870.29, 10400.0, "Credit", "M SAND SALES", "KA34 2865", "", "OK"),
    ("2026-11-05", 275, "", "KA35A 1656", "M SAND", "Ton", 11.48, 871.08, 10000.0, "Credit", "M SAND SALES", "RAVI ANNAN", "(Ravi)", "Credit sale needs customer ledger"),
    ("2026-11-05", 275, "", "KA66 4919", "P SAND", "Ton", 11.72, 1049.49, 12300.0, "Cash", "P SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA21 3455", "M SAND", "CFT", 110.0, 41.82, 4600.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "Tractor", "P SAND", "Ton", 3.73, 1099.20, 4100.0, "Cash", "P SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA35 1656", "M SAND", "Ton", 11.22, 868.98, 9750.0, "Credit", "M SAND SALES", "RAVI ANNAN", "(Ravi)", "Credit sale needs customer ledger"),
    ("2026-11-05", 275, "", "KA18C 4290", "M SAND", "Ton", 12.01, 857.62, 10300.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA34A 2865", "M SAND", "Ton", 15.07, 869.28, 13100.0, "Credit", "M SAND SALES", "KA34 2865", "", "OK"),
    ("2026-11-05", 275, "", "KA09B 9537", "M SAND", "Ton", 11.18, 867.62, 9700.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA24 3418", "M SAND", "CFT", 245.0, 42.04, 10300.0, "Cash", "M SAND SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA14B 1010", "M SAND", "Ton", 14.23, 850.32, 12100.0, "Credit", "M SAND SALES", "RAVI ANNAN", "(Ravi)", "Credit sale needs customer ledger"),
    ("2026-11-05", 275, "", "KA34A 2865", "M SAND", "Ton", 12.17, 870.99, 10600.0, "Credit", "M SAND SALES", "KA34 2865", "", "OK"),
    ("2026-11-05", 275, "", "KA24 3418", "DUST", "CFT", 245.0, 24.90, 6100.0, "Cash", "DUST SALES", "", "", "OK"),
    ("2026-11-05", 275, "", "KA34A 2865", "M SAND", "Ton", 12.03, 868.66, 10450.0, "Credit", "M SAND SALES", "KA34 2865", "", "OK")
]

cursor.executemany("""
INSERT INTO sales_transactions (
    date, sheet_no, gp_no, vehicle_no, item, unit, quantity, rate, amount,
    payment_mode, sales_ledger, customer_ledger, remarks, row_check
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", sales_data)

# Expenses from Day 275
expenses_data = [
    ("2026-11-05", 275, "Ravichandran diesel", "FUEL EXPENSE", "Cash", 10000.0, "Fuel"),
    ("2026-11-05", 275, "JCB diesel", "JCB DIESEL", "Cash", 5000.0, "Fuel"),
    ("2026-11-05", 275, "Staff food expenses", "FOOD STAFF EXPENSE", "Cash", 924.0, "Food"),
    ("2026-11-05", 275, "JCB Bolt expense", "JCB MAINT", "Cash", 720.0, "Maintenance"),
    ("2026-11-05", 275, "Water tanker Beta", "TANK WATER", "Cash", 100.0, "Utilities"),
    ("2026-11-05", 275, "Mujeeb water tanker payment (1 load)", "TANK WATER", "Cash", 2900.0, "Utilities"),
    ("2026-11-05", 275, "Seeb diesel", "JEEP DIESEL", "Cash", 1000.0, "Fuel"),
    ("2026-11-05", 275, "Mujahid labor ale", "MOJAHID DIRECT EXP", "Cash", 3000.0, "Labor")
]

cursor.executemany("""
INSERT INTO expense_transactions (
    date, sheet_no, description, expense_ledger, payment_mode, amount, category
) VALUES (?, ?, ?, ?, ?, ?, ?)
""", expenses_data)

# Other payment (Advance)
cursor.execute("""
INSERT INTO other_payments (
    date, sheet_no, description, account_ledger, payment_mode, amount, category
) VALUES ('2026-11-05', 275, 'Advance paid to Saidalavi', 'SAIDALAVI ADVANCE', 'Cash', 200.0, 'Advance')
""")

conn.commit()
conn.close()
print("Database initialized & seeded successfully at data/crusher.db")
