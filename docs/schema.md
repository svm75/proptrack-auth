# PropTrack — Dataverse Schema Reference

Every table PropTrack reads/writes, its business-relevant columns, and how the tables relate. Standard Dataverse system columns (Created By/On, Modified By/On, Owner, Business Unit, Version Number, etc.) exist on every table but are omitted below for brevity — they're never used by the app.

Two naming prefixes are in play: tables created early in the project use `cr9b5_` (the environment's original publisher prefix); tables added later use `svm_` (a different publisher prefix). There's no functional difference — just note it when looking a table up in the maker portal.

---

## Entity relationship overview

```
Properties ──┬──< Invoices >──┬── Contacts (Suppliers/Clients)
             │                 │
             ├──< SupplierContracts >── Contacts (suppliers only)
             │                 │
             ├──< Attachments  ├── References (Category)
             │                 │
             ├──< ForecastFlowProperties >── ForecastFlows ──── References (Category)
             │                                    │                  Contacts (counterparty)
             │                                    └── ForecastFlows (self, "Version Parent")
             │
Invoices ──< Attachments
Invoices ──< InvoiceComments
InvoiceTemplates ──── References (Category)
ActivityLogs                                  (append-only, no relationships)
```

`>──<` marks a many-to-one lookup (arrow points at the "one" side). Most business relationships run through **Invoices** as the hub: a property, a supplier/client, and a category all meet on each invoice row.

---

## Properties — `cr9b5_pt_property` (entity set `cr9b5_pt_properties`)

The register of managed properties.

| Column | Type | Notes |
|---|---|---|
| `cr9b5_pt_propertyid` | Guid | Primary key |
| `cr9b5_name` | Text (850) | Primary name |
| `cr9b5_shortid` | Text (100) | Short code used as the invoice-number prefix (e.g. `ABC` → `ABC001/2026`). **Alternate key `svm_shortid`** enforces uniqueness at the database level. |
| `cr9b5_address` | Text (100) | |
| `cr9b5_notes` | Text (100) | Free-text notes |
| `svm_pt_googledrivefolderid` | Text (100) | Cached Google Drive folder ID for this property's document library, resolved once and reused to avoid re-walking the Drive folder path on every attachment upload |

Referenced by: `Invoices.cr9b5_property`, `SupplierContracts.svm_property`, `Attachments.cr9b5_propertyid`, `ForecastFlowProperties.cr9b5_propertyid`.

---

## Contacts — `cr9b5_pt_contact` (entity set `cr9b5_pt_contacts`)

Suppliers and clients share one table, distinguished by `cr9b5_role`.

| Column | Type | Notes |
|---|---|---|
| `cr9b5_pt_contactid` | Guid | Primary key |
| `cr9b5_name` | Text (850) | Primary name |
| `cr9b5_role` | Choice | `Supplier` (233100000) / `Client` (233100001) |
| `cr9b5_email` | Text (100) | |
| `cr9b5_taxid` | Text (100) | |
| `cr9b5_defaultdescription` | Text (100) | Pre-fills the Description field when this contact is picked on a new invoice |
| `cr9b5_regularsupplier` | Yes/No | Legacy "is a recurring supplier" flag; superseded by the `SupplierContracts` table below (kept in sync automatically — true whenever the supplier has at least one active contract) |
| `svm_defaultcategory` | Lookup → References | Supplier-level default category, used as the fallback category on Regular Invoices when a specific contract doesn't override it |

Referenced by: `Invoices.cr9b5_contact`, `SupplierContracts.svm_pt_contact`, `Attachments.cr9b5_contactid`, `ForecastFlows.cr9b5_contactid`.

---

## Invoices — `cr9b5_pt_invoice` (entity set `cr9b5_pt_invoices`)

The core transaction ledger. Despite the name, both income and expense records live here, distinguished by `cr9b5_type`.

| Column | Type | Notes |
|---|---|---|
| `cr9b5_pt_invoiceid` | Guid | Primary key |
| `cr9b5_internalid` | Text (850) | Primary name; the human-readable invoice number, e.g. `ABC001/2026` |
| `cr9b5_globalsequence` | Whole number | The running sequence number encoded in `cr9b5_internalid`; queried (`orderby desc, top 1`) to compute the next value per year |
| `cr9b5_year` | Whole number | Invoice year, denormalized for fast year-scoped queries |
| `cr9b5_type` | Choice | **`Expense` = 233100000, `Income` = 233100001`** — note the code names these constants `TYPE_INCOMING`/`TYPE_OUTGOING` respectively (money incoming to/outgoing from the property owner), which reads backwards from the picklist labels — a common source of confusion when touching this field |
| `cr9b5_date` | DateTime | Invoice date |
| `cr9b5_description` | Memo (100) | |
| `cr9b5_property` | Lookup → Properties | Blank when `cr9b5_allproperties` is set |
| `cr9b5_allproperties` | Yes/No | Invoice applies across every property rather than one specific one |
| `cr9b5_contact` | Lookup → Contacts | The supplier (expense) or client (income) on this invoice |
| `cr9b5_categoryid` | Lookup → References | See "The References table's dual role" below |
| `cr9b5_baseamount` / `cr9b5_taxamount` / `cr9b5_totalgross` | Currency | Net, tax, and gross amounts |
| `cr9b5_taxrate` | Text (100) | Stored as text (e.g. `"7"`) rather than a number, or `"n/a"` when manual |
| `cr9b5_taxismanual` | Yes/No | True when the tax amount was hand-entered instead of auto-calculated at the default 7% rate |
| `cr9b5_bookingreference` | Text (100) | Booking/reservation ID — income invoices only |
| `cr9b5_checkin` / `cr9b5_checkout` | DateTime | Stay dates — income invoices only |
| `cr9b5_nights` / `cr9b5_days` | Whole number | Stay length |
| `cr9b5_adults` / `cr9b5_children` / `cr9b5_babies` | Whole number | Guest counts |
| `svm_pt_googledrivefolderid` | Text (100) | Cached Drive folder ID for this invoice's attachments (same caching pattern as on Properties) |
| `statecode` / `statuscode` | State/Status | Cancelling an invoice sets `statecode = Inactive` (soft delete — history is preserved, never hard-deleted) |

Referenced by: `Attachments.cr9b5_invoiceid`, `InvoiceComments.svm_invoice`.

---

## References — `cr9b5_pt_reference` (entity set `cr9b5_pt_references`)

A single generic lookup table shared across several unrelated purposes, discriminated by `cr9b5_referencetype`. This is the one table worth understanding carefully before querying it.

| Column | Type | Notes |
|---|---|---|
| `cr9b5_pt_referenceid` | Guid | Primary key |
| `cr9b5_value` | Text (850) | Primary name — the display label |
| `cr9b5_referencetype` | Choice | See below |
| `cr9b5_sortorder` | Whole number | Display order within a type |

**`cr9b5_referencetype` values actually in use** (⚠️ the deployed picklist has more options than the schema file's declared enum list — 233100005/233100006 exist and are used by the app code but aren't documented in the schema's own `enum` array; always check the live picklist in the maker portal, not just the generated TypeScript types, before adding a new reference type):

| Value | Code | Used for |
|---|---|---|
| Property | 233100000 | (legacy — properties now live in their own table) |
| Supplier | 233100001 | (legacy — superseded by the Contacts table) |
| Client | 233100002 | (legacy — superseded by the Contacts table) |
| Incoming Invoice | 233100003 | Attachment "type" options for expense invoices |
| Outgoing Invoice | 233100004 | Attachment "type" options for income invoices |
| **Income Category** | **233100005** | Categories selectable on income invoices — *not declared in the schema file's enum list* |
| **Expense Category** | **233100006** | Categories selectable on expense invoices, supplier contracts' default category, invoice templates — *not declared in the schema file's enum list* |

In practice, "category" throughout the app (`Invoices.cr9b5_categoryid`, `SupplierContracts.svm_defaultcategory`, `Contacts.svm_defaultcategory`, `InvoiceTemplates.svm_category`) means "a References row with type 233100005 or 233100006" — there is no dedicated Category table (a "split into its own table" change is proposed but not implemented; see `efficiency-enhancements.md` #7).

Note `Attachments.cr9b5_referencetype` is a **separate, independent picklist** on a different table that happens to share the same attribute name and a similar-looking value set (`Property` / `Incoming Invoice` / `Outgoing Invoice` at 233100000–233100002) — don't confuse the two when filtering.

---

## SupplierContracts — `svm_pt_suppliercontract` (entity set `svm_pt_suppliercontracts`)

Junction table between a supplier and the propert(y/ies) they bill against, added to support "regular supplier per property, with a contract count" (drives the Regular Invoices screen).

| Column | Type | Notes |
|---|---|---|
| `svm_pt_suppliercontractid` | Guid | Primary key |
| `svm_pt_defaultdescription` | Text (850) | Primary name; also the description override for this contract |
| `svm_pt_contact` | Lookup → Contacts | The supplier |
| `svm_property` | Lookup → Properties | Blank when `svm_pt_allproperties` is set |
| `svm_pt_allproperties` | Yes/No | Contract applies to every property |
| `svm_pt_contractcount` | Whole number | How many recurring invoice rows this contract generates on Regular Invoices (e.g. `2` for two separate service contracts against the same property) |
| `svm_defaultcategory` | Lookup → References | Overrides the supplier's own default category for this specific contract, if set |
| `svm_pt_active` | Yes/No | Inactive contracts are excluded from Regular Invoices without deleting the row |

One supplier can have multiple `SupplierContracts` rows (one per property relationship); Regular Invoices expands each row into `svm_pt_contractcount` entry rows.

---

## InvoiceTemplates — `svm_pt_invoicetemplate` (entity set `svm_pt_invoicetemplates`)

Reusable presets offered as "Use Template" when creating a new invoice — for recurring-but-not-fixed-schedule charges (e.g. an annual insurance renewal) that don't fit the strictly per-property `SupplierContracts` model.

| Column | Type | Notes |
|---|---|---|
| `svm_pt_invoicetemplateid` | Guid | Primary key |
| `svm_pt_name` | Text (850) | Primary name — the template's display name in the picker |
| `svm_pt_type` | Choice | `Income` = 925060000, `Expense` = 925060001 — **note this is a different numeric range from `Invoices.cr9b5_type`**, don't mix them up |
| `svm_category` | Lookup → References | |
| `svm_pt_description` | Text (100) | Pre-fills the invoice description |
| `svm_pt_defaultamount` | Currency | Pre-fills the base amount (optional) |

---

## InvoiceComments — `svm_pt_invoicecomment` (entity set `svm_pt_invoicecomments`)

A simple comment thread attached to an invoice, for back-and-forth between whoever enters invoices and whoever reviews them.

| Column | Type | Notes |
|---|---|---|
| `svm_pt_invoicecommentid` | Guid | Primary key |
| `svm_pt_name` | Text (850) | Primary name (not surfaced in the UI — comments are identified by their content/timestamp) |
| `svm_invoice` | Lookup → Invoices | |
| `svm_pt_comment` | Memo (100) | The comment text |

Author and timestamp come from the standard `createdby`/`createdon` system columns rather than dedicated fields.

---

## Attachments — `cr9b5_pt_attachment` (entity set `cr9b5_pt_attachments`)

Links a file (hosted in Google Drive — Dataverse stores only the file's Drive ID/URL, never the binary itself) to either an Invoice or a Property.

| Column | Type | Notes |
|---|---|---|
| `cr9b5_pt_attachmentid` | Guid | Primary key |
| `cr9b5_filename` | Text (850) | Primary name |
| `cr9b5_googledriveid` / `cr9b5_googledriveurl` | Text (100) | Drive file ID and shareable link |
| `cr9b5_invoiceid` | Lookup → Invoices | Set for invoice attachments |
| `cr9b5_propertyid` | Lookup → Properties | Set for property document-library attachments |
| `cr9b5_propertyidinvoice` | Lookup → Properties | A second property lookup on the table; present in the schema but not currently set or queried anywhere in the app code — likely reserved for a future property-scoped attachment query that hasn't been built yet |
| `cr9b5_contactid` | Lookup → Contacts | Optional — who supplied/is associated with the file |
| `cr9b5_attachtype` | Lookup → References | Sub-type of the attachment (e.g. "Receipt", "Lease") |
| `cr9b5_referencetype` | Choice | `Property` / `Incoming Invoice` / `Outgoing Invoice` (233100000–233100002) — this table's own independent picklist, see the References section above |
| `cr9b5_uploadedon` | DateTime | |

---

## ForecastFlows — `cr9b5_pt_forecastflow` (entity set `cr9b5_pt_forecastflows`)

Planned/expected recurring or one-off cash flows, kept separate from actual `Invoices` records.

| Column | Type | Notes |
|---|---|---|
| `cr9b5_pt_forecastflowid` | Guid | Primary key |
| `cr9b5_name` | Text (850) | Primary name |
| `cr9b5_type` | Choice | `Income` = 233100000, `Expense` = 233100001 — **the reverse numbering from `Invoices.cr9b5_type`**, another easy mix-up |
| `cr9b5_frequency` | Choice | `One-off` / `Daily` / `Weekly` / `Monthly` / `Quarterly` / `Semi-annually` / `Annually` (233100000–233100006) |
| `cr9b5_daysofweek` | Text (100) | Free-form day-of-week specifier for weekly flows |
| `cr9b5_startdate` / `cr9b5_enddate` | DateTime | Validity window |
| `cr9b5_netamount` / `cr9b5_vatamount` / `cr9b5_grossamount` | Currency | |
| `cr9b5_vatrate` | Text (100) | |
| `cr9b5_vatismanual` | Yes/No | |
| `cr9b5_allproperties` | Yes/No | When false, the specific properties are listed via `ForecastFlowProperties` below |
| `cr9b5_categoryid` | Lookup → References | |
| `cr9b5_contactid` | Lookup → Contacts | The counterparty |
| `cr9b5_parentflowid` | Lookup → ForecastFlows (self) | Points to the flow this one supersedes, enabling a version history of a forecast without losing prior versions |
| `cr9b5_notes` | Memo (2000) | |

## ForecastFlowProperties — `cr9b5_forecastproperty` (entity set `cr9b5_forecastproperties`)

Pure many-to-many junction: which specific properties a `ForecastFlow` applies to, when it isn't flagged `cr9b5_allproperties`.

| Column | Type | Notes |
|---|---|---|
| `cr9b5_forecastpropertyid` | Guid | Primary key |
| `cr9b5_name` | Text (850) | Primary name |
| `cr9b5_forecastflowid` | Lookup → ForecastFlows | |
| `cr9b5_propertyid` | Lookup → Properties | |

---

## ActivityLogs — `cr9b5_pt_activitylog` (entity set `cr9b5_pt_activitylogs`)

Append-only audit trail. No relationships — every action is recorded as free-standing facts rather than linked to the actual record (so the log survives even if the underlying record is later hard-deleted).

| Column | Type | Notes |
|---|---|---|
| `cr9b5_pt_activitylogid` | Guid | Primary key |
| `cr9b5_logid` | Text (850) | Primary name |
| `cr9b5_action` | Choice | `Created` / `Updated` / `Deleted` / `Exported` (233100000–233100003) |
| `cr9b5_tablemame` | Choice | `Invoice` / `Contact` / `Property` / `Attachment` (233100000–233100003) — note the typo in the attribute name ("tablemame" instead of "tablename"), which is permanent since renaming a Dataverse column's logical name isn't supported |
| `cr9b5_recordname` | Text (100) | Human-readable identifier of the affected record (e.g. an invoice's internal ID) |
| `cr9b5_details` | Memo (100) | Optional extra context (e.g. which fields changed) |
| `cr9b5_timestamp` | DateTime | |
| `cr9b5_user` | Text (100) | Plain text, not a system-user lookup |

---

## Known schema quirks worth remembering

1. **Mixed publisher prefixes** — `cr9b5_` (original) vs `svm_` (added later) across tables; there's no semantic difference, just check which one a given table actually uses before writing a query.
2. **`Invoices.cr9b5_type` and `ForecastFlows.cr9b5_type` use opposite numbering** for Income/Expense (233100000/233100001 swapped between the two tables) — always double-check which table you're filtering before hardcoding a type constant.
3. **`InvoiceTemplates.svm_pt_type` uses a completely different numeric range** (925060000/925060001) from either of the above.
4. **The References table's `cr9b5_referencetype` picklist has live values (233100005/233100006 for Income/Expense Category) that aren't listed in the schema file's own `enum` array** — the generated TypeScript types under `src/generated/` will look incomplete for this field; trust the maker portal's live picklist definition instead.
5. **`Attachments.cr9b5_referencetype` is an unrelated picklist that happens to share a name** with `References.cr9b5_referencetype` — don't assume they're the same option set.
6. **No dedicated Category or Tax-Rate-History tables exist** — categories are References rows filtered by type; tax rate is a flat 7% constant in the client code, not a Dataverse column (see the enhancement docs for proposals to change both).
7. **Alternate keys currently in place**: `Properties.cr9b5_shortid` (key name `svm_shortid`) is the only one — internal ID uniqueness on Invoices is still enforced client-side only (proposed as an enhancement, not yet implemented).
