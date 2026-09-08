// PropTrack V2 — table registry for Dataverse export (Step 4).
// Source of truth: power.config.json's databaseReferences, cross-checked
// against migration.md §6 (Dataverse Schema) and §Target PostgreSQL Schema.
// One entry per in-scope table: Dataverse entity set (the OData collection
// name to GET) and logical name (used for file naming / metadata only).

export const TABLES = [
  { key: 'properties', entitySet: 'cr9b5_pt_properties', logicalName: 'cr9b5_pt_property' },
  { key: 'contacts', entitySet: 'cr9b5_pt_contacts', logicalName: 'cr9b5_pt_contact' },
  { key: 'references', entitySet: 'cr9b5_pt_references', logicalName: 'cr9b5_pt_reference' },
  { key: 'attachments', entitySet: 'cr9b5_pt_attachments', logicalName: 'cr9b5_pt_attachment' },
  { key: 'invoices', entitySet: 'cr9b5_pt_invoices', logicalName: 'cr9b5_pt_invoice' },
  { key: 'activitylogs', entitySet: 'cr9b5_pt_activitylogs', logicalName: 'cr9b5_pt_activitylog' },
  { key: 'forecastflows', entitySet: 'cr9b5_pt_forecastflows', logicalName: 'cr9b5_pt_forecastflow' },
  { key: 'forecastflowproperties', entitySet: 'cr9b5_forecastproperties', logicalName: 'cr9b5_forecastproperty' },
  { key: 'suppliercontracts', entitySet: 'svm_pt_suppliercontracts', logicalName: 'svm_pt_suppliercontract' },
  { key: 'invoicecomments', entitySet: 'svm_pt_invoicecomments', logicalName: 'svm_pt_invoicecomment' },
  { key: 'invoicetemplates', entitySet: 'svm_pt_invoicetemplates', logicalName: 'svm_pt_invoicetemplate' },
  { key: 'owneroccupancies', entitySet: 'svm_pt_owneroccupancies', logicalName: 'svm_pt_owneroccupancy' },
  { key: 'forecastscenarios', entitySet: 'svm_forecastscenarios', logicalName: 'svm_forecastscenario' },
  { key: 'forecastflowcomponents', entitySet: 'svm_forecastflowcomponents', logicalName: 'svm_forecastflowcomponent' },
];

export const DATAVERSE_ORG_URL = 'https://org2b25b8b9.crm17.dynamics.com';
