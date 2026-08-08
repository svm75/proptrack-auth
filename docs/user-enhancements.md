# PropTrack User-Facing Enhancement Proposals

20 proposals, each with a business description and the exact Dataverse changes to make in the **Power Apps maker portal** (make.powerapps.com → your environment → Tables). Items 21+ were added after the original 20 and implemented directly.

## Status

| # | Enhancement | Status |
|---|---|---|
| 1 | Invoice payment tracking | ⬜ Not started |
| 2 | Invoice approval/review workflow | ⬜ Not started |
| 3 | Tenant/lease management | ⬜ Not started |
| 4 | Bank statement reconciliation | ⬜ Not started |
| 5 | Property expense budgets vs actuals | ⬜ Not started |
| 6 | Multi-currency support per property | ⬜ Not started |
| 7 | Client statement / owner report generation | ⬜ Not started |
| 8 | Bulk edit invoices | ✅ Done |
| 9 | Invoice templates for recurring one-off charges | ✅ Done |
| 10 | Notes/comments thread on invoices | ✅ Done |
| 11 | Multi-user roles & permissions | ⬜ Not started |
| 12 | Custom invoice numbering scheme per property | ⬜ Not started |
| 13 | Mobile receipt capture with photo attach | ⬜ Not started |
| 14 | Email-in invoice ingestion | ⬜ Not started |
| 15 | VAT/tax rate history | ⬜ Not started |
| 16 | Saved/custom dashboard views per user | ⬜ Not started |
| 17 | Property document library | ⬜ Not started |
| 18 | Maintenance/repair request tracking | ⬜ Not started |
| 19 | Multi-language UI support | ⬜ Not started |
| 20 | Custom fields per property type | ⬜ Not started |
| 21 | Dark / Light mode | ✅ Done |
| 22 | Standard Reports (P&L, IGIC, Rental, Tax) | ✅ Done |
| 23 | PropTrack V2 — Fluent UI design-system rewrite | ✅ Done |
| 24 | Owner occupancy tracking (incl./excl. occupancy %) | ✅ Done |
| 25 | Global search | ✅ Done |
| 26 | Quick Add menu | ✅ Done |
| 27 | Alerts | ✅ Done |
| 28 | Booking/occupancy conflict warnings | ✅ Done |
| 29 | Optional Internal ID (skip auto-numbering) | ✅ Done |
| 30 | Downloadable Excel import template | ✅ Done |

---

## 1. Invoice payment tracking

**Business description**
Invoices currently record what's owed but not whether or when it was actually paid. Adding due date, paid date, payment method, and a paid/unpaid status lets owners see outstanding balances at a glance and chase overdue payments instead of manually cross-checking bank statements.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Invoices` (`cr9b5_pt_invoice`) → Columns → **+ New column**:
>    - Display name `Due Date`, Name `cr9b5_duedate`, Data type **Date only**.
>    - Display name `Paid Date`, Name `cr9b5_paiddate`, Data type **Date only**.
>    - Display name `Payment Status`, Name `cr9b5_paymentstatus`, Data type **Choice**, values `Unpaid` / `Partially Paid` / `Paid`, default `Unpaid`.
>    - Display name `Payment Method`, Name `cr9b5_paymentmethod`, Data type **Choice**, values `Bank Transfer` / `Cash` / `Card` / `Other`.
> 2. Publish customizations.

---

## 2. Invoice approval/review workflow

**Business description**
Every invoice is created final today, with no draft/review step. A lightweight status (Draft → Pending Approval → Approved) lets a bookkeeper enter invoices for an owner or manager to review before they count toward reports, reducing entry errors reaching the books.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Invoices` (`cr9b5_pt_invoice`) → Columns → **+ New column** → Display name `Review Status`, Name `cr9b5_reviewstatus`, Data type **Choice**, values `Draft` / `Pending Approval` / `Approved`, default `Draft`.
> 2. Publish customizations.

---

## 3. Tenant/lease management

**Business description**
Income invoices reference a client but there's no structured record of who's renting a property, for what term, or at what rent — that context lives only in invoice descriptions today. A dedicated Tenant/Lease record ties income invoices to a lease term, making it possible to track vacancies, lease expiries, and rent history per unit.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_lease` → save.
> 2. Columns → **+ New column**:
>    - Display name `Property`, Name `cr9b5_property`, Data type **Lookup** → `Properties`.
>    - Display name `Tenant`, Name `cr9b5_tenant`, Data type **Lookup** → `Contacts`.
>    - Display name `Start Date`, Name `cr9b5_startdate`, Data type **Date only**.
>    - Display name `End Date`, Name `cr9b5_enddate`, Data type **Date only**.
>    - Display name `Monthly Rent`, Name `cr9b5_monthlyrent`, Data type **Currency**.
>    - Display name `Active`, Name `cr9b5_active`, Data type **Yes/No**, default `Yes`.
> 3. Table `Invoices` (`cr9b5_pt_invoice`) → Columns → **+ New column** → Display name `Lease`, Name `cr9b5_lease`, Data type **Lookup** → `pt_lease` (optional field, set only on income invoices).
> 4. Publish customizations.

---

## 4. Bank statement reconciliation

**Business description**
Confirming which invoices have actually cleared the bank is a manual, error-prone cross-check today. Importing a bank statement (CSV) and matching lines to invoices by amount/date turns reconciliation into a guided review instead of a spreadsheet exercise.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_bankline` → save.
> 2. Columns → **+ New column**:
>    - Display name `Date`, Name `cr9b5_date`, Data type **Date only**.
>    - Display name `Amount`, Name `cr9b5_amount`, Data type **Currency**.
>    - Display name `Description`, Name `cr9b5_description`, Data type **Single line of text**, max length 200.
>    - Display name `Matched Invoice`, Name `cr9b5_matchedinvoice`, Data type **Lookup** → `Invoices` (blank = unmatched).
>    - Display name `Reconciled`, Name `cr9b5_reconciled`, Data type **Yes/No**, default `No`.
> 3. Publish customizations.

---

## 5. Property expense budgets vs actuals

**Business description**
There's currently no way to set an expected annual/monthly budget per property or category and see how actual spend compares — the Dashboard only shows historical totals. Budget targets let owners spot overspending early instead of after year-end.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_budget` → save.
> 2. Columns → **+ New column**:
>    - Display name `Property`, Name `cr9b5_property`, Data type **Lookup** → `Properties`.
>    - Display name `Category`, Name `cr9b5_category`, Data type **Lookup** → `References`.
>    - Display name `Year`, Name `cr9b5_year`, Data type **Whole Number**.
>    - Display name `Budget Amount`, Name `cr9b5_budgetamount`, Data type **Currency**.
> 3. **Keys** tab → **+ New key** → select `cr9b5_property`, `cr9b5_category`, `cr9b5_year` → Save.
> 4. Publish customizations.

---

## 6. Multi-currency support per property

**Business description**
All amounts are currently treated as a single implicit currency (EUR). Owners with properties in different countries can't record invoices in local currency or see totals converted to a reporting currency, forcing manual conversion outside the app.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Properties` (`cr9b5_pt_property`) → Columns → **+ New column** → Display name `Currency`, Name `cr9b5_currency`, Data type **Choice**, values for each supported currency code (`EUR`, `USD`, `GBP`, …), default `EUR`.
> 2. Table `Invoices` (`cr9b5_pt_invoice`) → confirm existing amount columns (`cr9b5_baseamount`, `cr9b5_taxamount`, `cr9b5_totalgross`) are Currency-typed with a **Currency** field association; if the environment's base currency is fixed, add Columns → **+ New column** → Display name `Invoice Currency`, Name `cr9b5_invoicecurrency`, Data type **Choice** mirroring the property's list, so invoices can be filtered/displayed in their original currency alongside the base-currency amount Dataverse auto-converts.
> 3. Publish customizations.

---

## 7. Client statement / owner report generation

**Business description**
Owners currently have to be walked through the Dashboard or sent an export manually. A "Generate Statement" action that produces a shareable summary (income, expenses, net) for a chosen property and period would let managers send owners a periodic report with one click, and keep a record of what was sent.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_statement` → save.
> 2. Columns → **+ New column**:
>    - Display name `Property`, Name `cr9b5_property`, Data type **Lookup** → `Properties`.
>    - Display name `Period Start`, Name `cr9b5_periodstart`, Data type **Date only**.
>    - Display name `Period End`, Name `cr9b5_periodend`, Data type **Date only**.
>    - Display name `Sent To`, Name `cr9b5_sentto`, Data type **Lookup** → `Contacts`.
>    - Display name `Sent Date`, Name `cr9b5_sentdate`, Data type **Date and time**.
>    - Display name `Document Url`, Name `cr9b5_documenturl`, Data type **Single line of text**, max length 400 (link to the generated PDF, e.g. stored in Google Drive per the existing attachment pattern).
> 3. Publish customizations.

---

## 8. Bulk edit invoices ✅ Done

**Business description**
Correcting a category or property across many invoices (e.g. after a mis-categorization) currently means opening and editing each one individually. Multi-select with a batch "change category/property" action would turn a tedious repeated task into one operation.

**Dataverse changes (Maker Portal steps)**
> None. No table/column changes — uses the existing `Invoices` table's update API, just called for multiple selected row ids from one UI action.

**Implementation notes**
Shipped in [Invoices.tsx](../src/screens/Invoices.tsx): a checkbox column (with header "select all" of the currently filtered, non-cancelled rows) plus a bulk-action bar that appears once rows are selected, with "Set category…" / "Set property…" pickers and an Apply button that updates each selected invoice and logs one summary activity entry.

---

## 9. Invoice templates for recurring one-off charges ✅ Done

**Business description**
Regular Invoices (from item 1) covers strictly recurring supplier contracts, but many one-off-but-repeated charges (e.g. an annual insurance renewal, a one-time repair pattern) don't fit that model. A saved "invoice template" (pre-filled description/category/amount) that a user can pick from when creating a new invoice speeds up entry for these semi-regular cases.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_invoicetemplate` → save.
> 2. Columns → **+ New column**:
>    - Display name `Name`, Name `cr9b5_name`, Data type **Single line of text** (this becomes the primary column automatically if named to match, otherwise set as primary in table settings).
>    - Display name `Category`, Name `cr9b5_category`, Data type **Lookup** → `References`.
>    - Display name `Description`, Name `cr9b5_description`, Data type **Single line of text**, max length 200.
>    - Display name `Default Amount`, Name `cr9b5_defaultamount`, Data type **Currency** (optional).
>    - Display name `Type`, Name `cr9b5_type`, Data type **Choice**, values `Income` / `Expense`.
> 3. Publish customizations.

**Implementation notes**
Deployed as `svm_pt_invoicetemplate` (entity set `svm_pt_invoicetemplates`, fields `svm_pt_name`, `svm_category`, `svm_pt_description`, `svm_pt_defaultamount`, `svm_pt_type` with values `925060000` Income / `925060001` Expense) rather than the `cr9b5_` prefix above. [InvoiceForm.tsx](../src/screens/InvoiceForm.tsx) shows a "Use Template" picker (new invoices only, filtered by the matching income/expense type) that pre-fills category, description and default amount (recalculating tax) when chosen. Templates are managed (create/edit/delete) under **Admin → Invoice Templates** in [Admin.tsx](../src/screens/Admin.tsx), following the same list+modal pattern as Reference Data.

---

## 10. Notes/comments thread on invoices ✅ Done

**Business description**
Questions or context about a specific invoice (e.g. "confirmed with tenant, will pay late") currently have nowhere to live except the Description field, which is meant for the invoice itself. A simple comment thread per invoice supports back-and-forth between whoever enters invoices and whoever reviews them.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_invoicecomment` → save.
> 2. Columns → **+ New column**:
>    - Display name `Invoice`, Name `cr9b5_invoice`, Data type **Lookup** → `Invoices`.
>    - Display name `Comment`, Name `cr9b5_comment`, Data type **Multiple lines of text**.
>    - (The standard `Created By` and `Created On` columns present on every table cover author/timestamp — no extra column needed for those.)
> 3. Publish customizations.

**Implementation notes**
Deployed as `svm_pt_invoicecomment` (entity set `svm_pt_invoicecomments`, fields `svm_pt_comment` and `svm_Invoice` lookup) rather than the `cr9b5_` prefix above. [InvoiceForm.tsx](../src/screens/InvoiceForm.tsx) shows a comment thread (author + timestamp from the standard `Created By`/`Created On` columns) with an add box, visible when editing an existing invoice.

---

## 11. Multi-user roles & permissions

**Business description**
Everyone with access to the app today can see and edit everything. Distinct roles (e.g. Owner: read-only reports; Bookkeeper: full edit; Admin: full edit + user management) would let an owner safely give a bookkeeper or accountant access without exposing settings or other properties they shouldn't touch.

**Dataverse changes (Maker Portal steps)**
> 1. In the Power Platform admin center (not the maker portal table editor) → your environment → **Security roles** → **+ New role**, create `PropTrack Viewer` and `PropTrack Bookkeeper` roles with the appropriate read/write privileges on the `cr9b5_pt_*` and `svm_pt_*` tables.
> 2. **Users** → assign each app user the appropriate security role (in addition to the existing role that grants access to the Code App itself).
> 3. If property-level restriction is needed (a bookkeeper who should only see specific properties), enable **Row-level security** via table ownership: change `Properties` table ownership type to **User or team owned** (Tables → `Properties` → table properties → Ownership), then use **Share** on individual property records or team membership to scope access.
> 4. Publish customizations.

---

## 12. Custom invoice numbering scheme per property

**Business description**
Invoice IDs currently follow one fixed global pattern (`{shortId}{seq}/{year}`). Some owners want their own numbering convention per property (e.g. a custom prefix or a reset-per-year sequence) to match their existing bookkeeping records.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Properties` (`cr9b5_pt_property`) → Columns → **+ New column**:
>    - Display name `Invoice Prefix`, Name `cr9b5_invoiceprefix`, Data type **Single line of text**, max length 20 (optional override of the default short ID prefix).
>    - Display name `Reset Sequence Yearly`, Name `cr9b5_resetsequenceyearly`, Data type **Yes/No**, default `Yes` (matches current behavior; `No` keeps a running global sequence).
> 2. Publish customizations.

---

## 13. Mobile receipt capture with photo attach

**Business description**
Attaching a receipt today requires having the file already saved and uploading it from the invoice form. Letting a user snap a photo of a paper receipt directly from their phone and attach it (with optional OCR-assisted amount/date prefill) removes a manual scan-and-upload step in the field.

**Dataverse changes (Maker Portal steps)**
> None beyond what already exists. The `Attachments` table (`cr9b5_pt_attachment`) already links files (via Google Drive) to invoices/properties — this is a client-capability change (camera capture in the browser/PWA) plus, if OCR prefill is wanted, an external OCR service call feeding the existing invoice form fields; no new columns required.

---

## 14. Email-in invoice ingestion

**Business description**
Supplier invoices frequently arrive by email as PDF attachments. Forwarding such an email to a dedicated address and having a draft invoice auto-created (with the PDF attached and, where possible, amount/date parsed) would remove manual re-entry for the most common expense source.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Invoices` (`cr9b5_pt_invoice`) → confirm the `Review Status` column from item 2 exists (email-ingested invoices should land as `Draft` for confirmation, not go live automatically).
> 2. Power Automate → **+ New flow** → trigger **"When a new email arrives"** (Outlook/Exchange connector) scoped to the dedicated ingestion mailbox → parse sender/attachment → create an `Invoices` row with `cr9b5_reviewstatus = Draft` and save the attachment via the existing `Attachments` table pattern.
> 3. No new table columns required beyond item 2's `Review Status`.

---

## 15. VAT/tax rate history

**Business description**
Tax rates change over time (e.g. a VAT rate increase), but the app only supports one current rate per property (per item 15 of the efficiency list) with no record of what rate applied when. A rate history lets historical invoices keep the rate that was actually in effect, and correctly pre-fills the rate for new invoices based on their date.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_taxrate` → save.
> 2. Columns → **+ New column**:
>    - Display name `Property`, Name `cr9b5_property`, Data type **Lookup** → `Properties` (blank = applies to all properties by default).
>    - Display name `Effective From`, Name `cr9b5_effectivefrom`, Data type **Date only**.
>    - Display name `Rate`, Name `cr9b5_rate`, Data type **Decimal Number**, precision 2.
> 3. Publish customizations.

---

## 16. Saved/custom dashboard views per user

**Business description**
The Dashboard's tabs and filters reset every visit — a user who always checks the same property/year combination has to reapply filters each time. Letting each user save a named view (tab + filters) and land on their default one speeds up the daily check-in.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_dashboardview` → save.
> 2. Columns → **+ New column**:
>    - Display name `Name`, Name `cr9b5_name`, Data type **Single line of text** (set as primary column).
>    - Display name `Filters Json`, Name `cr9b5_filtersjson`, Data type **Multiple lines of text**.
>    - Display name `Is Default`, Name `cr9b5_isdefault`, Data type **Yes/No**, default `No`.
> 3. Confirm the standard `Owner` column scopes each saved view to the user who created it.
> 4. Publish customizations.

---

## 17. Property document library

**Business description**
Attachments today are tied specifically to invoices or (via the property panel) general property files, but there's no structured way to categorize important property documents — lease agreements, insurance policies, safety certificates — with expiry tracking. A typed document library with expiry dates lets owners get ahead of renewals instead of discovering a lapsed certificate reactively.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Attachments` (`cr9b5_pt_attachment`) → Columns → **+ New column**:
>    - Display name `Document Type`, Name `cr9b5_documenttype`, Data type **Choice**, values `Lease` / `Insurance` / `Safety Certificate` / `Other`.
>    - Display name `Expiry Date`, Name `cr9b5_expirydate`, Data type **Date only** (optional).
> 2. Publish customizations.

---

## 18. Maintenance/repair request tracking

**Business description**
Repair issues reported for a property (a leaking tap, a broken appliance) currently have no home in the app — they're tracked outside it, if at all, and only surface later as an expense invoice with no context. A lightweight maintenance ticket linked to a property (and, once resolved, to the resulting invoice) gives visibility into open issues and their cost.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_maintenancerequest` → save.
> 2. Columns → **+ New column**:
>    - Display name `Property`, Name `cr9b5_property`, Data type **Lookup** → `Properties`.
>    - Display name `Description`, Name `cr9b5_description`, Data type **Multiple lines of text**.
>    - Display name `Status`, Name `cr9b5_status`, Data type **Choice**, values `Open` / `In Progress` / `Resolved`, default `Open`.
>    - Display name `Reported Date`, Name `cr9b5_reporteddate`, Data type **Date only**.
>    - Display name `Resolved Invoice`, Name `cr9b5_resolvedinvoice`, Data type **Lookup** → `Invoices` (optional, set once the repair is billed).
> 3. Publish customizations.

---

## 19. Multi-language UI support

**Business description**
The app is currently English-only. Owners or bookkeepers who work in another language would benefit from a language preference that switches labels/messages, widening who can comfortably use the app day-to-day.

**Dataverse changes (Maker Portal steps)**
> 1. If a per-user preference should persist server-side (rather than just browser locale), Table `Contacts` is the wrong place (it represents suppliers/clients, not app users) — instead add the preference to Dataverse's built-in `systemuser` table via Power Platform admin center, or, simpler: **no schema change at all**, storing the language choice client-side (`localStorage`) since it's a per-browser UI preference, not business data.

---

## 20. Custom fields per property type

**Business description**
A short-term (holiday-let) property and a long-term-lease property track meaningfully different details (e.g. nightly rate and cleaning fee vs. lease term and deposit amount), but every property today has the same fixed field set. Letting the field set adapt to a chosen property type avoids cluttering every property with irrelevant fields.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Properties` (`cr9b5_pt_property`) → Columns → **+ New column** → Display name `Property Type`, Name `cr9b5_propertytype`, Data type **Choice**, values `Short-Term Rental` / `Long-Term Lease`.
> 2. Add type-specific optional columns on the same table (all nullable so they simply stay blank for the non-applicable type):
>    - Display name `Nightly Rate`, Name `cr9b5_nightlyrate`, Data type **Currency**.
>    - Display name `Cleaning Fee`, Name `cr9b5_cleaningfee`, Data type **Currency**.
>    - Display name `Standard Lease Term (months)`, Name `cr9b5_leasetermmonths`, Data type **Whole Number**.
>    - Display name `Standard Deposit Amount`, Name `cr9b5_depositamount`, Data type **Currency**.
> 3. Publish customizations.

---

## 21. Dark / Light mode ✅ Done

**Business description**
The app was light-theme-only, which is hard on the eyes in low-light conditions and doesn't match some users' OS-level dark mode preference. A toggle lets each user pick (and keep) their preferred appearance.

**Dataverse changes (Maker Portal steps)**
> None. Purely a client-side UI preference — stored in the browser (`localStorage`), not business data.

**Implementation notes**
Added a 🌙/☀️ toggle button in the app header ([App.tsx](../src/App.tsx)) that adds/removes a `dark` class on `<html>`, defaulting to the OS's `prefers-color-scheme` on first visit and persisting the choice to `localStorage`. Rather than adding `dark:` variants to every screen (the app's ~15 screens use fixed Tailwind gray/white utility classes throughout), [index.css](../src/index.css) defines a `.dark`-scoped override block that recolors the common surface/text/border utility classes (`bg-white`, `text-gray-*`, `border-gray-*`, etc.) app-wide. This covers the large majority of the UI consistently but isn't pixel-tuned on every individual accent chip (e.g. some colored status badges) — a reasonable v1, revisit if specific screens look off in dark mode.

---

## 22. Standard Reports (P&L, IGIC, Rental, Tax) ✅ Done

**Business description**
Owners and bookkeepers need standard, print/export-ready financial reports beyond the Dashboard's exploratory charts — a formal Profit & Loss, the specific worksheet format needed for IGIC (Canary Islands VAT) tax filing, an occupancy/revenue worksheet per booking, and a list of suppliers who crossed the €3,000/year threshold requiring a tax certificate. These need to be filterable by date range and property, and shareable as PDF or Excel rather than only viewable on screen.

**Dataverse changes (Maker Portal steps)**
> None. All four reports are computed client-side from the existing `Invoices`, `Properties`, `Contacts`, and `References` (Category) tables — no new tables or columns.

**Implementation notes**
Shipped as a new **Reports** screen ([Reports.tsx](../src/screens/Reports.tsx)), added as a subcategory under Dashboard in the nav (mirroring "Forecast Flows" under "Forecast" — see [App.tsx](../src/App.tsx)), with four tabs:
- **P&L** — income/expenses grouped by category with IGIC subtotals and Net Result, filtered by Date From/To + Property.
- **IGIC Report** — one row per invoice (Date, Invoice No, Property, Counterpart, Expense/Income Net/IGIC/Gross, Rent Start/End, Reservation ID, Adults, Children) with a totals row, plus a "↓ Export Excel" button.
- **Rental Report** — one row per stay on income invoices with a check-in date: Property, Start/End Date, Nights, Client, `avgNight` (Gross Income ÷ Nights), Income Net/IGIC/Gross, Booking ID, Total People, Adults, Children, Babies — with a totals row and its own "↓ Export Excel" button. (Originally used "Days"/gross-over-days; corrected to Nights-based per follow-up feedback, and Property was added as the first column after initial delivery.)
- **Tax Report** — suppliers whose net expenses exceeded €3,000 in a selected calendar year, broken down by quarter (Q1–Q4) + annual total; a supplier is included once their full-year total crosses the threshold (equivalent to "exceeded it at some point year-to-date" for a completed year). Reuses the same threshold logic already present in the Dashboard's Tax tab.

Every report also has a "↓ Export PDF" button using the same print-CSS approach as the Dashboard (`window.print()` with a print-only stylesheet that hides everything except the active report's title and content).

---

## 23. PropTrack V2 — Fluent UI design-system rewrite ✅ Done

**Business description**
The original app used Tailwind CSS utility classes throughout with an ad hoc visual style. A full rewrite onto Microsoft's Fluent UI v9 component library gives PropTrack a consistent, accessible, theme-aware design system (including proper dark mode) matching the look and feel of the user's other Power Apps Code Apps, plus a cleaner domain/data/hooks architecture underneath.

**Dataverse changes (Maker Portal steps)**
> None. Purely a client rewrite — every screen re-skinned onto `@fluentui/react-components`, `react-router-dom` for navigation, and a domain-typed data layer wrapping the existing generated Dataverse services. No table/column changes.

**Implementation notes**
Deployed as a **separate Power App, "PropTrack V2"** (its own `power.config.json` / app registration — see the repo `README.md`), so the original PropTrack (V1) keeps running untouched as a fallback. Every screen — Dashboard and all its tabs, Reports, Forecast, Invoices (+ New/Edit/Import/Export), Regular Invoices, Properties, Contacts, Admin — was rewritten onto Fluent UI components (`makeStyles`/`tokens`) with the Tailwind plugin fully removed at the end. Added: a dark rail navigation + topbar shell, teal brand theme with light/dark mode, route-level code-splitting (`React.lazy`/`Suspense` per screen — cut the initial bundle from one ~2.2MB chunk to a ~400KB shell plus per-screen chunks loaded on navigation).

---

## 24. Owner occupancy tracking (incl./excl. occupancy %) ✅ Done

**Business description**
Occupancy percentages previously only measured paying-guest nights against total available nights, with no way to record or account for periods the owner blocks out for personal use. A dedicated Owner Occupancy log — property, date range, guest counts — lets occupancy be reported two ways: **incl. owner** (owner-use nights count as occupied too — overall utilization) and **excl. owner** (paying-guest nights only — true rental performance), both against the same available-nights denominator.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_owneroccupancy` → save (creates entity set `svm_pt_owneroccupancies`, primary column `svm_pt_name`).
> 2. Columns → **+ New column**:
>    - Display name `Property`, Name `svm_pt_property`, Data type **Lookup** → `Properties` (`cr9b5_pt_property`).
>    - Display name `From Date`, Name `svm_pt_fromdate`, Data type **Date only**.
>    - Display name `To Date`, Name `svm_pt_todate`, Data type **Date only**.
>    - Display name `Adults`, Name `svm_pt_adults`, Data type **Whole Number**, default `0`.
>    - Display name `Children`, Name `svm_pt_children`, Data type **Whole Number**, default `0`.
>    - Display name `Babies`, Name `svm_pt_babies`, Data type **Whole Number**, default `0`.
> 3. Publish customizations.

**Implementation notes**
See [`docs/schema.md`](schema.md) for the full column reference. New **Owner Occupancy** screen (Invoices → Owner Occupancy) for managing blocks; also editable/deletable directly from a gray Calendar event. Occupancy math (`daysElapsedInYear()` for the current year's denominator, `ownerNightsForPeriod()` for the clipped owner-nights numerator adjustment) lives in [Dashboard.tsx](../src/screens/Dashboard.tsx) and is mirrored in [PropertyConnectionDiagram.tsx](../src/screens/PropertyConnectionDiagram.tsx) and the new [OccupancyTrend.tsx](../src/screens/OccupancyTrend.tsx) (per-month, per-property trend with an incl./excl. toggle).

---

## 25. Global search ✅ Done

**Business description**
Finding a specific property, contact, or invoice required navigating to the right screen first, then filtering. A search box available from anywhere in the app removes that extra hop.

**Dataverse changes (Maker Portal steps)**
> None. Client-code-only — debounced `contains()` OData queries against the existing `Properties`, `Contacts`, and `Invoices` tables.

**Implementation notes**
Shipped as [GlobalSearch.tsx](../src/components/GlobalSearch.tsx) in the app topbar ([Shell.tsx](../src/app/Shell.tsx)): a 300ms-debounced search across property name/short ID, contact name/tax ID, and invoice internal ID/description, grouped results dropdown, click-to-navigate (invoices deep-link via a `?search=` query param picked up by [Invoices.tsx](../src/screens/Invoices.tsx) on load).

---

## 26. Quick Add menu ✅ Done

**Business description**
Starting a new invoice, property, or contact always meant navigating to that screen first and finding the "+ Add" button. A single always-available menu shortcuts straight to a blank form for any of the three from wherever the user currently is.

**Dataverse changes (Maker Portal steps)**
> None. Client-code-only.

**Implementation notes**
Shipped as [QuickAdd.tsx](../src/components/QuickAdd.tsx) in the topbar: a menu with New Invoice / New Property / New Contact, each navigating to the relevant screen with a `?new=1` query param that the screen picks up on load to auto-open its existing create form (no new form logic — reuses each screen's own `openNew()`).

---

## 27. Alerts ✅ Done

**Business description**
Issues worth a look — overlapping bookings, an owner-occupancy block starting soon, an invoice missing a category — previously had no way to surface themselves; a user would only notice by chance while browsing the relevant screen. A single notifications entry point surfaces them proactively.

**Dataverse changes (Maker Portal steps)**
> None. Client-code-only — computed from existing `Invoices`, `Properties`, and `OwnerOccupancy` data.

**Implementation notes**
Shipped as [AlertsBell.tsx](../src/components/AlertsBell.tsx) in the topbar: a bell icon with a badge count and a dropdown listing (capped per category to keep it scannable) portfolio-wide booking/owner-occupancy overlap conflicts (reuses `nightsOverlap()`, see #28), owner occupancy blocks starting within the next 7 days, and invoices from the last 90 days with no category set. Clicking an alert navigates to the relevant screen.

---

## 28. Booking/occupancy conflict warnings ✅ Done

**Business description**
Nothing previously flagged when a new guest booking or owner-occupancy block was accidentally entered on dates that overlap an existing one for the same property — a mistake only caught later, if at all. A same-property, same-night overlap check surfaces this immediately as a warning, without blocking the save (a property can legitimately have more than one paying group under separate invoices at once, e.g. a group booking split across multiple invoices).

**Dataverse changes (Maker Portal steps)**
> None. Client-code-only.

**Implementation notes**
New `nightsOverlap()` helper ([src/domain/dateRanges.ts](../src/domain/dateRanges.ts)) treats two `[checkIn, checkOut)` ranges as conflicting only if they share an actual night — a checkout on the same date as another booking's check-in (normal same-day turnover) is not flagged. Used in [InvoiceForm.tsx](../src/screens/InvoiceForm.tsx) (guest-vs-guest and guest-vs-owner, on the Check-in/Check-out fields) and the new [OwnerOccupancyFormDialog.tsx](../src/components/OwnerOccupancyFormDialog.tsx) (owner-vs-guest and owner-vs-owner). Both render a non-blocking marigold warning banner listing the specific conflicting record(s); saving is never prevented.

---

## 29. Optional Internal ID (skip auto-numbering) ✅ Done

**Business description**
Every invoice previously required the auto-generated sequenced Internal ID (`{shortId}{seq}/{year}`). Some entries — miscellaneous or non-sequenced charges — don't need one, and forcing a sequence number on them wasted a slot in the running count.

**Dataverse changes (Maker Portal steps)**
> None. `Invoices.cr9b5_internalid` already allows blank values — this is a client-code-only change to skip the sequence-lookup/generation step when the option is selected.

**Implementation notes**
A "No Internal ID" / "Auto Internal ID" checkbox is available on: [InvoiceForm.tsx](../src/screens/InvoiceForm.tsx) (new invoices only), [RegularInvoices.tsx](../src/screens/RegularInvoices.tsx) (per row), and the Excel Import wizard ([InvoiceImport.tsx](../src/screens/InvoiceImport.tsx), per row, reserving sequence numbers up front for concurrent creates so they never collide). Everywhere an internal ID is displayed, a blank one renders as `—` / `(no internal ID)` rather than breaking the layout.

---

## 30. Downloadable Excel import template ✅ Done

**Business description**
Building an Excel file for the Invoice Import wizard from scratch meant guessing or reverse-engineering the exact expected column headers. A one-click "Download blank template" button removes that guesswork.

**Dataverse changes (Maker Portal steps)**
> None. Client-code-only.

**Implementation notes**
Shipped in [InvoiceImport.tsx](../src/screens/InvoiceImport.tsx)'s step 1: a "↓ Download blank template" button generates an `.xlsx` with the exact recognized header row (kept in sync with the parser's `HEADER_ALIASES`) plus one example data row, including the new "Auto Internal ID" column from #29.
