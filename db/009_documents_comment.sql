-- =============================================================================
-- PropTrack V2 — Document Management, comment field (Phase 1 completion)
-- =============================================================================
-- Applied after 001-008. A free-text remarks field, distinct from `description`
-- (description = what the document IS; comment = notes about it — e.g. "renewed
-- verbally with landlord, paperwork pending").
-- =============================================================================

ALTER TABLE proptrack.attachments ADD COLUMN comment TEXT;
COMMENT ON COLUMN proptrack.attachments.comment IS
  'Free-text remarks about the document, distinct from description. Documents tab only.';
