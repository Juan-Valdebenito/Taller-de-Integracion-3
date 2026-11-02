-- ============================================================
-- Tokens de notificaciones push (Expo Push) de la app móvil
-- ============================================================
--
-- Un token identifica un teléfono, no una cuenta: si otra cuenta inicia sesión
-- en el mismo teléfono, el token pasa a esa cuenta (por eso es único). Una
-- cuenta puede tener varios teléfonos.

CREATE TABLE push_tokens (
    token       TEXT PRIMARY KEY CHECK (char_length(token) <= 200),
    "userId"    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Buscar los teléfonos de una cuenta al enviarle una notificación.
CREATE INDEX idx_push_tokens_user ON push_tokens("userId");
