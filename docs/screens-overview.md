# PropTrack — Screen-by-Screen Business Guide

What each screen is for and what you can do with it. Screens are listed in the order they appear in the left-hand navigation.

---

## Dashboard

The home screen — a set of report tabs giving a bird's-eye view of the portfolio's performance. All tabs share the same underlying invoice data and can be filtered by year and/or property; a "↓ Export PDF" button prints the currently selected tab.

- **Overview** — headline KPIs (income, expenses, net profit) for the selected year/property, with month-by-month income vs. expense bars and a running profit line.
- **Property Comparison** — side-by-side comparison of every property's income, expenses, and occupancy for the year, so it's easy to spot which properties are pulling their weight.
- **Occupancy Heatmap** — a calendar-style grid showing which nights were booked (from check-in/check-out dates on income invoices), to spot vacancy gaps at a glance.
- **Cash Flow** — running cumulative cash position over time.
- **Tax** — VAT/IGIC collected vs. paid per quarter, plus two tables listing suppliers and clients whose net activity for the year exceeded €3,000 (the same threshold logic used by the standalone Tax Report).
- **Calendar** — a booking calendar view of income invoices (check-in/check-out) across all properties.
- **Category P&L** — profit & loss broken down by category instead of by property.
- **Category Trend** — how spending/income in each category has moved over time.
- **Expense Breakdown** — a donut chart plus monthly table of where expense money is going, by category.
- **Income vs Forecast** — actual income compared against the forecast flows defined under Forecast, to see how reality is tracking against plan.
- **Expense Sunburst** — a drill-down sunburst chart (Property → Category → Contact → Invoice) for exploring where expenses came from.

## Reports

Standard, printable reports for accounting/compliance use, separate from the exploratory Dashboard tabs. Filtered by date range and property (the Tax Report uses a calendar year instead). Every report can be exported to PDF via "↓ Export PDF"; the IGIC and Rental reports additionally have a "↓ Export Excel" button.

- **P&L** — income and expenses grouped by category for the selected period, with IGIC (tax) subtotals and a Net Result figure.
- **IGIC Report** — one row per invoice in the period (Date, Invoice No, Property, Counterpart, Expense Net/IGIC/Gross, Income Net/IGIC/Gross, Rent Start/End, Reservation ID, Adults, Children) with column totals — the standard tax-filing worksheet.
- **Rental Report** — one row per booking/stay (income invoices with a check-in date): Property, Start/End Date, Nights, Client, average nightly rate, Income Net/IGIC/Gross, Booking ID, and guest counts — the standard occupancy/revenue worksheet.
- **Tax Report** — suppliers whose net expenses exceeded €3,000 in the selected calendar year, broken down by quarter (Q1–Q4) plus an annual total — used to identify who needs a tax certificate/declaration.

## Forecast

Planning tools for recurring or expected future income and expenses, kept separate from actual recorded invoices.

- **Forecast Flows** — define recurring or one-off expected cash flows (income or expense) with an amount, VAT rate, frequency (daily/weekly/monthly/quarterly/semi-annually/annually/one-off), a date range, and which propert(y/ies) they apply to. Flows can be versioned (a flow can have a "parent" flow it supersedes) to track changes to a forecast over time without losing history.
- **Forecast View** — a calendar/timeline visualization of the flows defined above, showing expected cash flow over time. Feeds the Dashboard's "Income vs Forecast" tab for actual-vs-plan comparison.

## Invoices

The core transaction ledger — every income and expense record in the system.

- The main list supports filtering by type (Income/Expense), property, date range, and free-text search, plus sorting; a summary row shows the total count and gross amount for whatever is currently filtered.
- **Bulk edit** — select multiple invoices via checkboxes and apply a category and/or property change to all of them in one action.
- **New/Edit Invoice** (modal) — captures type, category, property (or "All Properties"), contact, date, description, amounts (base/tax/gross, with automatic tax calculation that can be overridden manually), and — for income (rental) invoices — booking reference, check-in/check-out, and guest counts. A supplier/client can be created inline without leaving the form. A "Use Template" picker (new invoices only) pre-fills category, description, and amount from a saved Invoice Template. File attachments (receipts, contracts) can be uploaded to Google Drive directly from the form, and a comment thread lets users leave notes on an invoice (visible when editing an existing one).
- **Cancel** — soft-deletes an invoice (marks it inactive) rather than removing it, preserving history; cancelled invoices show struck-through and dimmed in the list.
- **Import from Excel** (wizard) — upload a spreadsheet of invoices, review a validated preview (errors, warnings, and duplicate detection against existing invoices), optionally hand-edit cells inline, then import — creating new invoices and/or updating existing ones (matched by Internal ID), auto-creating any new suppliers/clients or categories referenced in the file along the way.
- **Export Excel** — export the currently filtered invoice list to a spreadsheet, with a configurable, savable set of columns (via the Export Config screen).

## Regular Invoices

A quick-entry screen for recurring supplier billing. Instead of creating each recurring invoice from scratch every period, this screen pre-fills one row per active **Property Contract** defined on a supplier (see Contacts, below) — including generating extra rows when a supplier has more than one contract against the same property (e.g., two separate service contracts). Each row shows the property, category, and description pre-filled, with just the date and amount left to enter; a green preview of the invoice ID it will receive appears as each row becomes ready. Rows can be sorted by supplier, property, category, date, amount, or readiness. "Save All" creates one invoice per completed row in a single action.

## Properties

The register of managed properties.

- Each property has a Name, a Short ID (used as the prefix for generated invoice numbers, e.g. `ABC001/2026`), an Address, and free-text Notes.
- Clicking into a property opens a detail panel showing its invoice history (grouped by year, with income/expense totals) and a document library for property-level attachments (leases, insurance, certificates, etc.) stored on Google Drive.
- The **Connection Diagram** visualizes how a property's invoices connect to categories and suppliers/clients — a drill-down view for understanding where a property's money comes from and goes to.
- Deleting a property is blocked if it has any invoices, to protect financial history.

## Contacts

The register of suppliers and clients, split into two tabs.

- Common fields: Name, Email, Tax ID, and a Default Description (pre-fills the invoice description whenever this contact is selected on a new invoice).
- **Suppliers** additionally get a Default Category (the category invoices default to) and a **Property Contracts** editor: one or more rows, each specifying a property (or "All Properties"), how many recurring contracts the supplier has against it, and optional per-contract overrides for category/description. This is what drives the Regular Invoices screen — a supplier with contracts on multiple properties (or several contracts on the same property) will generate that many rows there. The list shows a "Regular · N properties" badge for any supplier with at least one active contract.
- A text search box filters the currently active tab by name, email, tax ID, or description.

## Admin

Configuration and oversight tools, in three tabs.

- **Reference Data** — manage the shared lookup lists used throughout the app: property/supplier/client reference entries and, importantly, the Income and Expense **Categories** used to classify invoices. Entries in use elsewhere can't be deleted (shown with a usage-count badge).
- **Invoice Templates** — manage reusable presets (name, Income/Expense type, category, description, default amount) that show up as the "Use Template" picker when creating a new invoice — for one-off-but-repeated charges that don't fit the strictly recurring Regular Invoices model (e.g. an annual insurance renewal).
- **Activity Log** — a filterable audit trail (by action, table, date range) of every Created/Updated/Deleted/Exported action taken in the app, recording who did what and when — the accountability record for the whole system.
