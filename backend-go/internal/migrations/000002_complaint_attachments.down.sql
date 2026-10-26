-- ============================================================
-- Rollback: imágenes adjuntas a los reclamos
-- ============================================================
-- Borra solo los metadatos; los archivos del almacenamiento se limpian aparte.

DROP INDEX IF EXISTS idx_complaint_attachments_complaint;
DROP TABLE IF EXISTS complaint_attachments;
