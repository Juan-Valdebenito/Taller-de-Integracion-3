-- ============================================================
-- Imágenes adjuntas a los reclamos (enviadas desde la app móvil)
-- ============================================================
--
-- Solo se guardan los metadatos: el archivo vive en el almacenamiento de
-- archivos con un nombre interno aleatorio ("storageKey"). El nombre original
-- del archivo no se guarda (puede contener datos personales) y la imagen se
-- guarda ya sanitizada (sin metadatos EXIF/GPS).

CREATE TABLE complaint_attachments (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "complaintId"   TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    -- Nombre interno en el almacenamiento; nunca se expone en la API.
    "storageKey"    TEXT NOT NULL UNIQUE,
    -- Tipo real detectado por el contenido del archivo (no por la extensión).
    "mimeType"      TEXT NOT NULL CHECK ("mimeType" IN ('image/jpeg', 'image/png')),
    -- Tamaño del archivo ya sanitizado. Red de seguridad: la API limita antes.
    "sizeBytes"     INTEGER NOT NULL CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
    width           INTEGER NOT NULL CHECK (width > 0),
    height          INTEGER NOT NULL CHECK (height > 0),
    -- SHA-256 en hexadecimal del archivo guardado (integridad y duplicados).
    sha256          CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    -- Cantidad de zonas pixeladas (rostros, patentes) antes de guardar.
    "maskedRegions" INTEGER NOT NULL DEFAULT 0 CHECK ("maskedRegions" >= 0),
    "uploadedBy"    TEXT REFERENCES users(id) ON DELETE SET NULL,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- La misma imagen no se adjunta dos veces al mismo reclamo.
    CONSTRAINT uq_complaint_attachments_complaint_sha256 UNIQUE ("complaintId", sha256)
);

-- Listar los adjuntos de un reclamo en orden de subida.
CREATE INDEX idx_complaint_attachments_complaint
    ON complaint_attachments("complaintId", "createdAt");
