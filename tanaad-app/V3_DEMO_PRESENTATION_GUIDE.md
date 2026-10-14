# Tanaad Management System (v3) — Demo Presentation Guide

> **Cheat Sheet for Client / Stakeholder Presentation**  
> *Target Audience:* Factory owners (CEOs), plant managers, and floor supervisors in Kampala, Uganda.

---

## 1. The 30-Second Opening Pitch
*(Say this right after opening the app on your screen or tablet)*

> *"Tanaad runs three industrial manufacturing operations in Kampala: plastic woven mats, carrier bags (Tanaad Packages Ltd), and an HDPE recycling plant. Today, they operate largely on paper books, handwritten roll stickers, and WhatsApp.*
> 
> *In version 3, we eliminated all unnecessary enterprise clutter and built a **calm, 5-destination system**. It is designed so that any supervisor or cashier on a noisy factory floor can complete their daily task in **under one minute with zero training**."*

---

## 2. Demo Credentials & Quick Access

* **App URL:** Local: `http://localhost:5173/` (or your Vercel deployment URL)
* **Shared Tablet PIN:** `1234` (Tap any worker's face/name and enter `1234`)
* **Standard Login:** Any demo password works with the listed accounts.
* **Key Demo User:** **Moses Tumusiime** (Site Manager, Mats Factory) — has full access to all 5 site tabs.
* **CEO Demo User:** **Hassan Warsame** (CEO, Group HQ) — has access to the 3-site executive cockpit.

---

## 3. Simplified Feature-by-Feature Guide

### Feature 1: Today’s Actions (`/s/mats/today`)
* **What it is:** The digital shift book and daily to-do checklist for the plant.
* **Why it matters:** Replaces handwritten shift logs and WhatsApp reminders. Floor staff see exactly what is done and what is pending.
* **What you see on screen:**
  * **Shift Status Banner:** Current shift (Day shift 07:00–19:00), hours elapsed, and live shift progress.
  * **Top 4 KPIs:** Headcount on shift (36), unlogged machines (1), expected cash (UGX 26.17M), open alerts (7).
  * **Your Guided Shift Workflow:** Numbered step-by-step checklist (`Step 1`, `Step 2`, `Step 3`...) with progress bars and direct action buttons (`Mark attendance →`, `Log machines →`, `Open cash book →`).
* **What to say / do:**
  * Point to the **Step 1 to Step 5 checklist**: *"Instead of navigating through menus, a supervisor simply follows this checklist from start of shift to close of day."*

---

### Feature 2: Production & Machine Output Report (`/s/mats/reports/production`)
* **What it is:** The daily shift output, machine performance, and scrap/waste report.
* **Why it matters:** Factory owners lose money when looms sit idle or raw resin is wasted. This replaces the paper machine register.
* **What you see on screen:**
  * **Top 4 KPI Cards:** Total Output Produced (302 units / 892 kg), Target Attainment (52%), Scrap & Waste Rate (7.9%), Total Downtime (354 min).
  * **Machine Floor Table:** Every machine (Loom 1 through Loom 15), assigned operator, product woven, output pieces vs target, performance badge, and downtime.
  * **Downtime Reason Tags:** When output is below rate, the supervisor logs the cause (*"20 min · thread break"* or *"211 min · mechanical repair"*).
  * **Material Balance & Yield:** Raw input resin (1,435 kg) vs Finished output (892 kg) vs Measured waste (113 kg).
* **What to say / do:**
  * Toggle between **Day shift** and **Night shift**.
  * Click the **Print** or **CSV** button: *"At 19:00, the shift report can be exported or printed instantly for management."*

---

### Feature 3: Worker Attendance & Daily Payroll Report (`/s/mats/reports/attendance`)
* **What it is:** The digital roll-call sheet and automated casual payroll settlement.
* **Why it matters:** In Kampala factories, casual laborers are hired daily and paid cash. Ghost workers and payroll disputes are major sources of cash leakage.
* **What you see on screen:**
  * **Summary Numbers:** Present on shift (31), Absent (2), Casual laborers on floor (23), **Casual Payroll Due (UGX 288,000)**.
  * **Department Breakdown:** Headcount by section (*Weaving: 7, Finishing: 16, Loading: 5, Extrusion: 1, Maintenance: 1*).
  * **Workforce Register Table:** Worker name, avatar, department, engagement (Permanent staff vs Casual worker), attendance status (`Present`, `Half day`, `Absent`), and daily pay due.
* **What to say / do:**
  * Highlight the casual wage calculation: *"For casual workers, daily pay is computed automatically (UGX 15,000 for full day, UGX 7,500 for half day), so the cashier knows the exact cash payout required at the end of the day."*

---

### Feature 4: Daily Cash & Expenses Summary (`/s/mats/reports/cash`)
* **What it is:** The digital cash-and-sales ledger for the cashier's drawer and safe.
* **Why it matters:** Replaces the paper petty cash notebook and ensures every shilling taken in or spent is categorized and traceable.
* **What you see on screen:**
  * **Summary Numbers:** Opening Balance (UGX 22.99M), Money In (+UGX 4.70M), Money Out (-UGX 1.52M), Expected Closing Balance (UGX 26.17M).
  * **Where Money Went Today:** Categorized expense cards (*Materials: UGX 576k, Spares: UGX 357k, Staff Food: UGX 278k, Utilities: UGX 236k, Transport: UGX 71k*).
  * **Chronological Cash Ledger:** Every single receipt and expense voucher with time, payee, category, amount, and running drawer balance.
* **What to say / do:**
  * *"At the end of the day, the cashier enters the count of 50k, 20k, and 10k notes. The system instantly verifies if the cash drawer matches the ledger before signing off."*

---

### Feature 5: Dispatch & Gate Weighbridge Report (`/s/mats/reports/dispatch`)
* **What it is:** The logistics loading log and gate scale security verification.
* **The Killer Factory Story to Tell:**
  > *"The owners once lost 200 woven mats on a lorry dispatched to Rwanda because a storekeeper miscounted by hand. This screen guarantees that can never happen again."*
* **What you see on screen:**
  * **Summary Numbers:** Total Loads Dispatched (18 lorries), Bundles Loaded (721 bundles), Gross Scale Weight (58,782 kg), Gate Holds (0 held).
  * **Lorry Log Table:** Delivery Note # (e.g. `DN-00009`), Customer & Destination (*Owino Market, Kigali Rwanda, Juba South Sudan*), Vehicle plate (`UBK 442X`), Driver name, Expected weight vs Gate scale weight, Variance %, and Gate status (`Cleared & Passed`).
* **What to say / do:**
  * Explain the ±2% tolerance: *"Every bundle is scanned with a barcode. When the lorry drives onto the gate weighbridge, the scale weight is compared against the expected bundle weight. If the weight is short by more than 2%, the gate locks and holds the lorry."*

---

### Feature 6: CEO 3-Site Group Overview (`/g/cockpit`)
* **What it is:** The executive command center for company owners (Hassan Warsame & partner).
* **Why it matters:** The CEOs cannot physically be in three factories at the same time. This screen gives them complete visibility from their phone or laptop.
* **What you see on screen:**
  * **The 3 Factories Side-by-Side:**
    1. **Mats Factory**
    2. **Bags Factory (Tanaad Packages Ltd)**
    3. **Recycling Plant**
  * **The 5 Vital Metrics per Site:**
    1. Cash expected in safe (UGX)
    2. Headcount on shift
    3. Output produced so far
    4. Measured scrap/waste rate %
    5. Dispatches sent
  * **Decisions & Approvals:** Pending approvals for customer credit limits, unusual expenses, or gate overrides.
* **What to say / do:**
  * *"The CEOs get a unified view of the entire group. If an export client in Juba needs credit approval, the CEO can approve or reject it with a single tap from anywhere."*

---

### Feature 7: Shared Tablet PIN Login
* **What it is:** Sign in by selecting your name/photo and typing a 4-digit PIN (`1234`).
* **Why it matters:** Factory supervisors, mechanics, and cashiers do not have company email addresses or laptops. They share a tablet on the shop floor.
* **How it works:**
  1. The tablet stays on the login screen.
  2. The worker selects the plant (*Mats Factory*).
  3. Visual photo cards show active floor workers.
  4. The worker taps their name, punches `1234` on the big numeric keypad, and is inside their work area in under 5 seconds.

---

## 4. Recommended 5-Minute Presentation Script

| Step & Time | Screen | Talking Points |
| :--- | :--- | :--- |
| **Step 1 (1 min)** | `/s/mats/today` | *"Welcome. Here is the home screen for the Mats Factory. Notice how clean the sidebar is: only 5 primary buttons. We have the shift clock, live KPIs, and the guided shift checklist."* |
| **Step 2 (1 min)** | `/s/mats/reports/production` | *"Clicking Production Report shows today's machine floor. We can see all 15 looms, operator names, output vs target, and waste rate. When a loom is down, the supervisor records the reason right here."* |
| **Step 3 (1 min)** | `/s/mats/reports/attendance` | *"Next is Attendance & Wages. We see 31 workers present, 2 absent, and department coverage. Notice that for casual labor, the daily payroll (UGX 288k) is calculated automatically for daily cash settlement."* |
| **Step 4 (1 min)** | `/s/mats/reports/cash` | *"In Cash & Expenses, the cashier sees the opening balance, sales receipts, and floor expenses (spares, food, fuel) with a running drawer balance. At closing, they count notes to reconcile."* |
| **Step 5 (45 sec)**| `/s/mats/reports/dispatch` | *"In Dispatch & Gate, every lorry load is logged. Bundles are scanned, and the weighbridge verifies the weight before the gate opens. If mats are missing, the lorry is held."* |
| **Conclusion (15 sec)**| `/g/cockpit` | *"Finally, the owners open Group HQ. They see all three factories side-by-side with 5 vital numbers each, giving complete operational control."* |

---

## 5. FAQs / Questions Clients Might Ask

1. **"What if the internet drops on the factory floor?"**
   * *Answer:* The app is a Progressive Web App (PWA) with full offline support. All attendance, machine logs, and cash entries save directly to the local tablet and sync automatically when the connection returns.
2. **"Can workers tamper with numbers or delete records?"**
   * *Answer:* No. The system runs an append-only ledger. Nothing is ever silently deleted; corrections require an explicit note, preserving a clear audit trail.
3. **"Can we add other languages like Luganda or Somali?"**
   * *Answer:* Yes. All user-facing text is modular and ready for localized translations.
