# VRN Stone Crushers - Accounts & Operations Management Portal

A dedicated, offline-ready, high-performance management portal for **VRN Stone Crushers**.

---

## 🚀 Quick Start

The server is already running on your machine at:
👉 **[http://localhost:3000](http://localhost:3000)**

To start or restart the portal at any time from terminal:
```bash
./run.sh
# or
node --experimental-sqlite server.js
```

---

## ⛰️ Key Features Built for VRN Stone Crushers

### 1. 📊 Operations Dashboard & Live Pulse
- **Real-Time KPIs**: Daily Sales Turnover (₹2,34,100), Cash vs Credit split (₹1,47,450 / ₹86,650), Total Dispatched Tonnage (242.79 Ton + 600 CFT), Operational Expenses (₹23,644), and Closing Cash in Hand (₹1,23,606).
- **Product Sales Realization**: Granular breakdown of **M-Sand**, **P-Sand**, **Stone Dust**, **20 MM**, and **Slurry**, tracking both **Tons** and **CFT** with weighted average rates.
- **Cash Book Reconciliation Alert**: Automatically validates that `Opening Cash + Cash Sales + Customer Receipts - Cash Expenses - Advances = Closing Cash`.

### 2. 📝 Daily Sheet Entry Grid (Paper Match)
- Mirrors the exact layout of the physical daily sheet (Sheet No. 275).
- Fast vehicle dispatch rows with Gate Pass (GP) No., Vehicle No., Material, Ton / CFT quantity, Rate, Amount, Mode (Cash / Credit / Bank), Customer Ledger, and Remarks.
- Daily Expense vouchers and Advance / Other Payment rows with live cash calculation.

### 3. ⚡ Quick Sheet Ingestion (Raw Text / Excel / CSV Paste)
- Paste unformatted text or CSV rows directly from Excel or daily log messages.
- The intelligent parser automatically extracts vehicle numbers, separates M-Sand from Dust, detects CFT vs Ton, maps ledgers (e.g. `JCB diesel` → `JCB DIESEL`, `food` → `FOOD STAFF EXPENSE`, `Saidalavi` → `SAIDALAVI ADVANCE`).

### 4. 📈 Profit & Loss (P&L) Engine
- **Daily P&L & Monthly P&L**:
  - **Turnover / Revenue** (M-Sand, P-Sand, Dust, 20mm).
  - **Variable Direct Costs** (Diesel/Fuel, Operator Labor, Spares & Maintenance, Water).
  - **Operating Gross Margin** (₹2,10,456 / 89.9%).
  - **Fixed Overhead Allocation** (Machinery Loans / EMIs, Quarry Lease / Rent, Permanent Operator Salaries, Machinery Depreciation Provision, Mining Royalty).
  - **Net Operating Profit (EBITDA)**.
- **Crusher Performance Benchmarks**:
  - **Cost Per Ton (CPT)**: The primary KPI for quarry profitability.
  - **Diesel Cost Per Ton**: Tracks fuel efficiency across genset, JCB, and fleet.
  - **Average Realization Per Ton**.

### 5. 👥 Customer Ledgers & Debtors Aging (Credit Book)
- Tracks all credit dispatches by contractor / vehicle account (e.g. `KA34 2865`, `RAVI ANNAN`, `KA50 1264`, `MEDANI CRUSHER`, `REJI`).
- Shows total trips, tonnage taken, total billed amount, total payments received, and outstanding debit balance.
- **One-Click Payment Collection Modal**: Record Cash or Bank receipt from customer, automatically crediting their balance and updating the Cash Book.

### 6. ⛽ Diesel & Operating Cost Analytics
- Machine-wise diesel spend tracking (JCB, Hitachi, Genset, Jeeps).
- Spare parts and wear monitoring (JCB bolts, belts, screen mesh).

### 7. 🔮 Projections & Breakeven Simulator
- **Interactive Financial Modeling**:
  - Adjust Daily Capacity (100 – 600 Tons/day).
  - Adjust Working Days per month.
  - Adjust Average Selling Price per Ton (₹650 – ₹1,200).
  - Adjust Diesel Cost per Ton (₹40 – ₹150).
- **Live Calculated Outputs**:
  - Monthly Breakeven Tonnage (e.g. 361 Tons / month).
  - Breakeven Operating Days (under 1.5 days of crushing covers all monthly fixed costs!).
  - 30-Day, 60-Day, and 90-Day rolling revenue and cash flow forecasts.
  - What-If sensitivity scenarios (Diesel hike, monsoon drop, peak season surge).

### 8. 📑 Daily Reports & WhatsApp Briefing
- Instant WhatsApp summary formatted with emojis and clear sections, ready to copy and send to partners/management at the end of every shift.
- Printable voucher layout ready for PDF export or paper filing.

### 9. ⚙️ Master Chart of Accounts
- Contains all **173 ledger accounts** from VRN Stone Crushers Chart of Accounts pre-configured.

---

## 📁 System Architecture

```
├── data/
│   ├── crusher.db        # SQLite database (Daily sheets, sales, expenses, ledgers)
│   └── accounts.json     # 173 accounts master
├── public/
│   ├── index.html        # Single-page application frontend
│   ├── style.css         # Modern dark-mode styling
│   └── app.js            # Reactive frontend controller
├── server.js             # Node.js backend with SQLite API engine
├── run.sh                # Launcher script
└── init_db.py            # Database schema & seeder
```
