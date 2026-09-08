-- =============================================================================
-- PropTrack V2 — NAS-native document storage (final migration addendum)
-- =============================================================================
-- Applied after 001-006. Extends proptrack.attachments (0 live records at the time
-- this was applied — see migration.md) to support NAS-native file storage as the
-- primary target for NEW uploads, while preserving google_drive_id/google_drive_url
-- as legacy/nullable columns for existing (external) attachment references.
--
-- New columns:
--   storage_path       relative path under DOCUMENTS_ROOT, e.g.
--                       'Properties/Property A/Contracts/<uuid>.pdf'. NULL for
--                       legacy Google-Drive-only rows.
--   original_filename  the filename the user uploaded (shown on download).
--   stored_filename     the UUID-based filename actually written to disk
--                       (collision-safe by construction).
--   mime_type           validated MIME type at upload time.
--   file_size            bytes, from the written file (not client-supplied).
--
-- file_name (legacy) is left in place, still populated for both storage paths, so
-- existing list/read code (mappers.ts, Properties.tsx) keeps working unmodified.
-- =============================================================================

ALTER TABLE proptrack.attachments
    ADD COLUMN storage_path      TEXT,
    ADD COLUMN original_filename TEXT,
    ADD COLUMN stored_filename   TEXT,
    ADD COLUMN mime_type         TEXT,
    ADD COLUMN file_size         BIGINT;

COMMENT ON COLUMN proptrack.attachments.storage_path IS
  'Relative path under DOCUMENTS_ROOT (NAS-native storage). NULL for legacy Google-Drive-only rows.';
COMMENT ON COLUMN proptrack.attachments.google_drive_id IS
  'Legacy Google Drive file ID. Retained for existing external references only — no longer written for new uploads (see storage_path).';
COMMENT ON COLUMN proptrack.attachments.google_drive_url IS
  'Legacy Google Drive view URL. Retained for existing external references only — no longer written for new uploads (see storage_path).';

-- A row is either NAS-native (storage_path set) or legacy-Drive (google_drive_id/url
-- set) or neither yet (in-progress client state) — never enforce mutual exclusivity
-- here since the app may in principle hold both during a future manual migration;
-- this is documentation-only, not a CHECK constraint, to avoid over-constraining.
