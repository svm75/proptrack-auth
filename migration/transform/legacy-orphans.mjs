// Step 5A — authoritative legacy-orphan exception list, extracted directly
// from migration/reports/step5-transform-validation.json (the Step 5
// pre-load validation run against the untouched Step 4 export). Exactly
// these 11 GUIDs, across exactly these 3 tables, get is_legacy_orphan =
// true. Nothing else does — this list is never grown heuristically.

export const LEGACY_ORPHAN_IDS = {
  supplier_contracts: new Set([
    '1c3aabe1-b3a0-4690-82f6-52534c74a8bd',
    'f4614442-594c-44b7-b5fb-54450299b2c9',
    '7b562427-e7c5-4b06-8c06-734450774c98',
    '252524fd-f042-46fc-9a26-7ab243391e1e',
    'c4c3a697-fd9e-4936-b7f8-fa3b8bc61834',
  ]),
  invoice_comments: new Set([
    '34e0b113-41d9-461a-b702-0bb8039c82af',
    'f56d6749-9439-42e8-9391-2cea9597678c',
    'd0c51877-2b90-4cce-88ec-6b1497a7cb2d',
    'ff055ebc-d92c-4711-a3e9-ca4683d9bb55',
    '95e505fe-1561-4ade-a061-d5eacdcb4fc2',
  ]),
  forecast_flow_components: new Set([
    '2c8dd29d-b5e8-401d-9b38-d17e8d478b8f',
  ]),
};
