# PropTrack Efficiency Enhancement Proposals

20 proposals, each with a business description and the exact Dataverse changes to make in the **Power Apps maker portal** (make.powerapps.com → your environment → Tables).

## Status

| # | Enhancement | Status |
|---|---|---|
| 1 | Supplier–Property Regular Contracts | ✅ Done |
| 2 | Id-indexed lookup maps for name resolution | ✅ Done |
| 3 | Batched invoice import instead of serial per-row saves | ✅ Done |
| 4 | Cached Google Drive folder IDs | ✅ Done |
| 5 | Server-side filtered/paginated invoice queries | ✅ Done |
| 6 | Alternate keys / indexes on frequently filtered fields | ⬜ Not started |
| 7 | Dedicated Category entity | ⬜ Not started |
| 8 | Precomputed monthly/yearly financial summary table | ⬜ Not started |
| 9 | Automated recurring-invoice generation | ⬜ Not started |
| 10 | Rollup field for invoice count per property | ⬜ Not started |
| 11 | Dataverse-enforced uniqueness for Property Short ID | ✅ Done |
| 12 | Native Dataverse autonumber for invoice sequence/internal ID | ⬜ Not started |
| 13 | Incremental (delta) refresh after mutations | ✅ Done |
| 14 | Server-persisted export templates | ⬜ Not started |
| 15 | Configurable VAT/tax rate per property or country | ⬜ Not started |
| 16 | Precomputed occupancy calendar table | ⬜ Not started |
| 17 | Reuse created-record response instead of full contact refetch | ✅ Done |
| 18 | Attachment folder-id caching (property + invoice level) | ⬜ Not started |
| 19 | Activity log archiving/retention flow | ⬜ Not started |
| 20 | Batch category/contact existence checks during import | ✅ Done |
| 21 | Route-level code-splitting | ✅ Done |

---

## 1. Supplier–Property Regular Contracts ✅ Done

**Business description**
Suppliers can now be marked "regular" per property, with a contract count, so a supplier billing two contracts to Property A and one to Property B produces three pre-filled rows in Regular Invoices instead of one generic row. Each supplier also carries a default category that flows into every generated row, cutting repetitive manual selection each billing cycle.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_suppliercontract` → save (creates entity set `svm_pt_suppliercontracts`, primary column `svm_pt_defaultdescription` "Default Description").
> 2. On that table → Columns → **+ New column** for each:
>    - Display name `Contact`, Name `svm_pt_contact`, Data type **Lookup** → related table `Contacts` (`cr9b5_pt_contact`).
>    - Display name `Property`, Name `svm_property`, Data type **Lookup** → related table `Properties` (`cr9b5_pt_property`).
>    - Display name `allproperties`, Name `svm_pt_allproperties`, Data type **Yes/No**, default `No`.
>    - Display name `Contract Count`, Name `svm_pt_contractcount`, Data type **Whole Number**, default `1`.
>    - Display name `Default Category`, Name `svm_defaultcategory`, Data type **Lookup** → related table `References` (`cr9b5_pt_reference`).
>    - Display name `Active`, Name `svm_pt_active`, Data type **Yes/No**, default `Yes`.
> 3. On table `Contacts` → Columns → **+ New column** → Display name `Default Category`, Name `svm_defaultcategory`, Data type **Lookup** → related table `References` (`cr9b5_pt_reference`).
> 4. Publish customizations.

**Implementation notes**
Shipped and confirmed live. Code changes:
- [RegularInvoices.tsx](../src/screens/RegularInvoices.tsx) — expands active contracts into one row per contract-count unit, pre-fills property/category, and previews the next invoice ID (in green) per row as it becomes ready; added a Sort by (Supplier/Property/Category/Date/Amount/Ready) control.
- [Contacts.tsx](../src/screens/Contacts.tsx) — supplier form now has a "Default Category" picker and a "Property Contracts" sub-editor (add/edit/remove rows) instead of the old single Regular Supplier toggle; supplier list shows a "Regular · N properties" badge and the resolved default category; added a text search box (name/email/tax ID/description).

---

## 2. Id-indexed lookup maps for name resolution ✅ Done

**Business description**
Invoice and property lists currently resolve supplier/property names by scanning the full contact/property array for every row, on every render — noticeably slower as data grows and while filtering/typing. Switching to a one-time id→name index (as already done on the Dashboard and Import screens) makes lists and exports snappy regardless of dataset size.

**Dataverse changes (Maker Portal steps)**
> None. This is a client-code-only change (build `Map`s once from the existing `Contacts`/`Properties` tables instead of `Array.find()` per row).

**Implementation notes**
Shipped in [Invoices.tsx](../src/screens/Invoices.tsx) (`propertyById`/`contactById` maps, `useMemo`'d off `properties`/`contacts`, used by `propName`/`contactName`/`contactWithTax` — including in the Excel export path) and [Properties.tsx](../src/screens/Properties.tsx) (`contactById` map used by the property detail panel's `contactName`). One-off single-record lookups elsewhere (e.g. duplicate short-ID check, selected-property lookups) were left as `Array.find()` since they aren't in a per-row render loop.

---

## 3. Batched invoice import instead of serial per-row saves ✅ Done

**Business description**
Importing an Excel sheet of invoices currently sends one sequential network request per row — a 500-row file means 500+ round trips, making large imports slow and fragile to interruption. Batching creates (Dataverse `$batch`) or running bounded-concurrency parallel writes would cut import time dramatically and give users faster feedback.

**Dataverse changes (Maker Portal steps)**
> None. No table/column changes — this is a client-side change to how `InvoiceImport.tsx` calls the existing `Invoices` table's create API (`$batch` request or bounded `Promise.all` concurrency instead of one `await` per row).

**Implementation notes**
Shipped in [InvoiceImport.tsx](../src/screens/InvoiceImport.tsx)'s `runImport()`: invoice rows are now processed in bounded-concurrency batches of 8 via `Promise.all` per chunk (instead of one `await` per row), and new-contact creation is likewise parallelized. Progress reporting and per-row error handling (`failed++`) are preserved. `$batch` wasn't used since the generated data client doesn't expose it — bounded concurrency gets most of the win with far less risk.

---

## 4. Cached Google Drive folder IDs ✅ Done

**Business description**
Every file attachment upload currently re-walks the Drive folder path (Property → Invoices → InternalId) with up to 4 sequential lookups/creates, even though the folders almost always already exist. Storing the resolved folder ID once removes that repeated latency from every upload.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Properties` (`cr9b5_pt_property`) → Columns → **+ New column** → Display name `Google Drive Folder Id`, Name `cr9b5_googledrivefolderid`, Data type **Single line of text**, max length 100.
> 2. Table `Invoices` (`cr9b5_pt_invoice`) → Columns → **+ New column** → same Display name/Name/Data type as above.
> 3. Publish customizations.

**Implementation notes**
Deployed as `svm_pt_googledrivefolderid` on both `Properties` and `Invoices` (not the `cr9b5_` prefix above). [Properties.tsx](../src/screens/Properties.tsx)'s `handleFileSelect` and [InvoiceForm.tsx](../src/screens/InvoiceForm.tsx)'s `handleFileSelect` both check the cached id first (property's own field, or a local `driveFolderId` state seeded from the invoice record) before calling `getOrCreateFolder`, and persist the resolved id back (best-effort, fire-and-forget) the first time it's resolved so later sessions hit the cache too.

---

## 5. Server-side filtered/paginated invoice queries ✅ Done

**Business description**
Screens load the entire invoice table (up to 5000 rows) on every visit and refilter client-side. As invoice history grows across years, this means downloading and re-processing data the user never looks at. Pushing common filters (property, date range, type) to the server query reduces payload and speeds up initial load.

**Dataverse changes (Maker Portal steps)**
> None. No table/column changes — pass `$filter`/`$top`/`$skip` scoped to the active screen filters in the existing `Invoices` table queries instead of `maxPageSize: 5000` unfiltered.

**Implementation notes**
Shipped in [Invoices.tsx](../src/screens/Invoices.tsx): `load()` was split into `loadRefData()` (properties/contacts/categories, fetched once) and `loadInvoices()`, which builds an OData `$filter` from the Type/Property/Date-range controls (`buildInvoiceFilter()`) and re-runs whenever those change. Free-text search stays client-side over the resulting (already-scoped) set since it fires on every keystroke and isn't worth a round trip per character.

---

## 6. Alternate keys / indexes on frequently filtered fields

**Business description**
Lookups by internal ID (dedupe during import) and by property+year (dashboard/property detail) currently rely on unindexed scans or client-side filtering. Declaring proper Dataverse alternate keys/indexes on these fields keeps queries fast as row counts scale into the tens of thousands.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Invoices` (`cr9b5_pt_invoice`) → **Keys** tab → **+ New key** → Name `internalid_key` → select column `cr9b5_internalid` → Save (creates a unique alternate key, indexed automatically).
> 2. Table `Invoices` → **Indexes** tab (if available in your environment tier) → **+ New index** → select columns `cr9b5_property` and `cr9b5_date`, in that order → Save.
> 3. Publish customizations.

---

## 7. Dedicated Category entity

**Business description**
Categories are currently squeezed into the generic `cr9b5_pt_reference` table alongside properties, suppliers, and clients, filtered by a numeric `referencetype` code. This overloads one table with unrelated purposes, complicates queries, and risks accidental cross-type leakage. A dedicated Category entity is clearer, faster to query, and easier to extend (e.g., income/expense sub-grouping).

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_category` → save.
> 2. On that table → Columns → **+ New column**:
>    - Display name `Type`, Name `cr9b5_type`, Data type **Choice**, values `Income` / `Expense`.
>    - Display name `Sort Order`, Name `cr9b5_sortorder`, Data type **Whole Number**.
>    - Display name `Active`, Name `cr9b5_active`, Data type **Yes/No**, default `Yes`.
> 3. Table `Invoices` (`cr9b5_pt_invoice`) → column `cr9b5_categoryid` → edit → change lookup target from `References` to `pt_category` (requires deleting and recreating the lookup column if Dataverse doesn't allow retargeting in place; export existing category data first).
> 4. Table `pt_suppliercontract` → column `svm_defaultcategory`, and table `Contacts` → column `svm_defaultcategory` → same retarget to `pt_category`.
> 5. Data → Export rows from `References` where Reference Type = Income/Expense Category via Advanced Find, re-import into `pt_category` using Import Data Wizard, mapping old GUIDs so dependent lookups can be re-pointed.
> 6. Publish customizations.

---

## 8. Precomputed monthly/yearly financial summary table

**Business description**
The Dashboard recomputes monthly/yearly totals, per-property comparisons, and tax summaries from the full invoice set on every load, redoing the same aggregation work repeatedly across tabs and sessions. A maintained summary table (updated on invoice save) turns expensive client-side aggregation into a fast, single-row lookup.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_monthlysummary` → save.
> 2. Columns → **+ New column**:
>    - Display name `Property`, Name `cr9b5_property`, Data type **Lookup** → `Properties` (leave blank for "all properties" rows).
>    - Display name `Year`, Name `cr9b5_year`, Data type **Whole Number**.
>    - Display name `Month`, Name `cr9b5_month`, Data type **Whole Number**.
>    - Display name `Income Total`, Name `cr9b5_incometotal`, Data type **Currency**.
>    - Display name `Expense Total`, Name `cr9b5_expensetotal`, Data type **Currency**.
>    - Display name `Tax Total`, Name `cr9b5_taxtotal`, Data type **Currency**.
> 3. **Keys** tab → **+ New key** → select `cr9b5_property`, `cr9b5_year`, `cr9b5_month` → Save.
> 4. Power Automate (in the same environment) → **+ New flow** → Trigger "When a row is added, modified or deleted" on table `Invoices` → add logic to upsert the matching `pt_monthlysummary` row.
> 5. Publish customizations.

---

## 9. Automated recurring-invoice generation

**Business description**
Regular Invoices still require a person to open the screen each period and click save on the pre-filled rows. For genuinely fixed recurring charges (e.g., a management fee), auto-generating the invoice on schedule (with a review/approve step) removes a manual monthly chore entirely.

**Dataverse changes (Maker Portal steps)**
> 1. Table `pt_suppliercontract` → Columns → **+ New column**:
>    - Display name `Auto Generate`, Name `svm_pt_autogenerate`, Data type **Yes/No**, default `No`.
>    - Display name `Frequency`, Name `svm_pt_frequency`, Data type **Choice**, values `Monthly` / `Quarterly` / `Annual`.
>    - Display name `Last Generated Date`, Name `svm_pt_lastgenerateddate`, Data type **Date only**.
> 2. Table `Invoices` (`cr9b5_pt_invoice`) → confirm `statecode`/`statuscode` already support a draft-style status; if not, add Choice column `Review Status` (`cr9b5_reviewstatus`) with values `Draft` / `Approved`.
> 3. Power Automate → **+ New flow** → **Scheduled cloud flow**, recurrence daily → query due `pt_suppliercontract` rows → create `Invoices` rows with `cr9b5_reviewstatus = Draft`.
> 4. Publish customizations.

---

## 10. Rollup field for invoice count per property

**Business description**
The Properties screen fetches a slimmed invoice list purely to count invoices per property tile, and re-fetches whenever the deletion guard needs a count. A Dataverse rollup field maintains this count natively, removing the extra query entirely.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Properties` (`cr9b5_pt_property`) → Columns → **+ New column** → Display name `Invoice Count`, Name `cr9b5_invoicecount`, Data type **Rollup** → Aggregate function `Count`, related entity `Invoices`, related column `cr9b5_property` → Save.
> 2. Publish customizations. (Rollups recalculate on Dataverse's schedule, ~every 12 hours, or via the "Recalculate" action.)

---

## 11. Dataverse-enforced uniqueness for Property Short ID ✅ Done

**Business description**
Short ID uniqueness (used to build internal invoice IDs) is currently checked with a client-side linear scan before save, which is both extra client work and a race condition risk with concurrent edits. Enforcing it at the database level guarantees correctness and removes the manual check.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Properties` (`cr9b5_pt_property`) → **Keys** tab → **+ New key** → Name `shortid_key` → select column `cr9b5_shortid` → Save.
> 2. Publish customizations.

**Implementation notes**
Deployed as alternate key `svm_shortid` on `Properties.cr9b5_shortid` (key name only — the underlying column stays `cr9b5_shortid`). No code change was needed: [Properties.tsx](../src/screens/Properties.tsx)'s `saveProperty()` already did a client-side duplicate check for a fast, friendly error *and* already wraps the create/update call in `try/catch` surfacing `e.message` — so the new server-side key now acts as a correctness backstop (e.g. two concurrent creates) without any UX regression.

---

## 12. Native Dataverse autonumber for invoice sequence/internal ID

**Business description**
Generating the next invoice sequence number today requires a query (`orderby desc, top 1`) before every save. An autonumber column computes this atomically at the database level, eliminating the extra round trip and any risk of duplicate numbers under concurrent saves.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Invoices` (`cr9b5_pt_invoice`) → Columns → **+ New column** → Display name `Sequence No`, Name `cr9b5_sequenceno`, Data type **Autonumber**, format `{property-shortid}-{SEQNUM:4}-{year}` (or the closest supported autonumber pattern — Dataverse autonumber patterns don't support per-property-scoped resets, only a global `SEQNUM`, so confirm the numbering rule with the business before committing to this).
> 2. Publish customizations.

---

## 13. Incremental (delta) refresh after mutations ✅ Done

**Business description**
After every single invoice save, cancel, or import action, the Invoices screen reloads the entire dataset from scratch. For a user making several quick edits in a row, this means repeatedly re-downloading everything just to reflect one row's change. Patching local state (or a scoped re-fetch of the modified id) keeps the UI responsive.

**Dataverse changes (Maker Portal steps)**
> None. Client-code-only — use the record already returned by the create/update call to patch local state instead of calling `getAll()` again.

**Implementation notes**
Shipped: [InvoiceForm.tsx](../src/screens/InvoiceForm.tsx)'s `onSaved` now passes back the saved record — the create path uses what the `create()` call already returns; the edit path builds the merged record client-side (Dataverse `update()` calls don't reliably return a full representation) from the known payload plus form state. [Invoices.tsx](../src/screens/Invoices.tsx) upserts that record directly into local state (`upsertInvoiceLocal`) instead of reloading, and `cancelInvoice` patches the `statecode`/`statuscode` locally instead of a full reload too. Bulk edit and Excel import still trigger a scoped `loadInvoices()` (not a full ref-data reload) since those touch many rows at once.

---

## 14. Server-persisted export templates

**Business description**
Saved Excel export column templates currently live only in browser `localStorage`, so they don't follow the user across devices and are lost if the browser storage is cleared. Persisting them in Dataverse makes them reusable and shareable across sessions/users with no re-configuration.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_exporttemplate` → save.
> 2. Columns → **+ New column**:
>    - Display name `Columns Json`, Name `cr9b5_columns`, Data type **Multiple lines of text**.
>    - Display name `Shared`, Name `cr9b5_shared`, Data type **Yes/No**, default `No`.
> 3. Confirm the standard `Owner` column (present on every custom table by default) is used to scope private templates to the creating user.
> 4. Publish customizations.

---

## 15. Configurable VAT/tax rate per property or country

**Business description**
Tax auto-calculation is hardcoded to a flat 7% rate across the whole app, forcing manual correction for any property under a different tax regime. Making the default rate configurable per property removes that repeated manual override.

**Dataverse changes (Maker Portal steps)**
> 1. Table `Properties` (`cr9b5_pt_property`) → Columns → **+ New column** → Display name `Default Tax Rate`, Name `cr9b5_defaulttaxrate`, Data type **Decimal Number**, precision 2 (leave optional/no default so the client falls back to the existing 7% constant when unset).
> 2. Publish customizations.

---

## 16. Precomputed occupancy calendar table

**Business description**
The Occupancy Heatmap tab walks every income invoice day-by-day between check-in/check-out on every dashboard load to build the occupied-days map. For properties with long histories, this repeated per-load computation is unnecessary — maintaining a lightweight per-day occupancy table (or letting invoice save populate it) removes the recomputation.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_occupancyday` → save.
> 2. Columns → **+ New column**:
>    - Display name `Property`, Name `cr9b5_property`, Data type **Lookup** → `Properties`.
>    - Display name `Date`, Name `cr9b5_date`, Data type **Date only**.
>    - Display name `Invoice`, Name `cr9b5_invoice`, Data type **Lookup** → `Invoices`.
> 3. **Keys** tab → **+ New key** → select `cr9b5_property`, `cr9b5_date` → Save.
> 4. Power Automate → **+ New flow** → trigger on `Invoices` create/update/delete (income type only) → add/remove `pt_occupancyday` rows between check-in and check-out dates.
> 5. Publish customizations.

---

## 17. Reuse created-record response instead of full contact refetch ✅ Done

**Business description**
When a new supplier/client is created inline from the invoice form, the app reloads the entire contact list just to re-select the one new record. The create call already returns the full new record — using it directly avoids an unnecessary full-table fetch on every inline contact creation.

**Dataverse changes (Maker Portal steps)**
> None. Client-code-only — use the record returned by the `Contacts` create call directly instead of calling `getAll({ maxPageSize: 5000 })` afterward.

**Implementation notes**
Shipped in [InvoiceForm.tsx](../src/screens/InvoiceForm.tsx)'s `saveNewContact()`: the created record from `Cr9b5_pt_contactsService.create()` is inserted directly into local `contacts` state (sorted) and immediately selected, replacing the follow-up `getAll({ maxPageSize: 5000 })` call.

---

## 18. Attachment folder-id caching (property + invoice level)

**Business description**
Companion to #4: attachment lookups for a given property or invoice repeatedly resolve the same Drive folder tree on every panel open. Caching the resolved IDs directly on the owning record means subsequent opens skip the Drive API round trips entirely.

**Dataverse changes (Maker Portal steps)**
> Shares the columns added in #4 (`cr9b5_googledrivefolderid` on `Properties` and `Invoices`) — no additional table/column changes needed beyond that item.

---

## 19. Activity log archiving/retention flow

**Business description**
The activity log is a pure append-only audit table with one row per user action, growing indefinitely. Left unmanaged, it will eventually slow down any query that touches it (even indirectly) and inflate storage. A scheduled archive/retention flow keeps the live table lean while preserving history in cold storage.

**Dataverse changes (Maker Portal steps)**
> 1. Tables → **+ New table** → Display name `pt_activitylogarchive` → save, then Columns → **+ New column** for each existing column on `Activity Logs` (`cr9b5_action`, `cr9b5_tablemame`, `cr9b5_recordname`, `cr9b5_details`, `cr9b5_timestamp`, `cr9b5_user`) with matching Display name/Data type, to mirror the source table shape.
> 2. Power Automate → **+ New flow** → **Scheduled cloud flow**, recurrence monthly → query `Activity Logs` rows with `cr9b5_timestamp` older than 24 months → create matching rows in `pt_activitylogarchive` → delete the originals.
> 3. Publish customizations.

---

## 20. Batch category/contact existence checks during import ✅ Done

**Business description**
The Excel import wizard checks whether each new category name already exists with a separate query per unique name inside a loop. Batching this into a single "does any of these names exist" query up front (already-deduplicated names) removes N small round trips down to one.

**Dataverse changes (Maker Portal steps)**
> None. Client-code-only — issue one `References` query with an `or`-chain filter over all deduplicated new category/contact names instead of one query per name inside the import loop.

**Implementation notes**
Shipped in [InvoiceImport.tsx](../src/screens/InvoiceImport.tsx)'s `runImport()`: deduplicated new category names are grouped by reference type (Income/Expense) and checked with one `or`-chain filtered query per type (at most 2 queries total) instead of one query per name; any names still missing afterward are created concurrently via `Promise.all` rather than serially.

---

## 21. Route-level code-splitting ✅ Done

**Business description**
Every screen — Dashboard's charting libraries, the Excel import/export dependency, every other screen — shipped in a single JavaScript bundle, so visiting any one screen downloaded and parsed all of them. Splitting by route means a user only downloads the code for the screen they're actually on, speeding up first load and navigation to lighter screens.

**Dataverse changes (Maker Portal steps)**
> None. Build/client-code-only.

**Implementation notes**
Shipped in [routes.tsx](../src/app/routes.tsx): every top-level screen is now a `React.lazy()` import wrapped in a single `<Suspense>` with a centered spinner fallback, instead of static imports. Dropped the single ~2.2MB production chunk to a ~400KB shell (app framework + Fluent UI core) plus per-screen chunks fetched on navigation — Dashboard's Recharts-heavy chunk (~680KB) and the `xlsx` dependency (~420KB, only needed by Invoice Import/Export) no longer block loading any other screen.
