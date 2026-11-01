-- ============================================================
-- Rollback: tokens de notificaciones push
-- ============================================================

DROP INDEX IF EXISTS idx_push_tokens_user;
DROP TABLE IF EXISTS push_tokens;
