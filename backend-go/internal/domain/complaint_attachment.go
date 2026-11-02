package domain

import "time"

// ComplaintAttachment representa una imagen adjunta a un reclamo (tabla
// complaint_attachments). Solo contiene metadatos: el archivo ya sanitizado
// vive en el almacenamiento de archivos bajo StorageKey.
//
// El nombre original del archivo no se guarda (puede contener datos
// personales) y StorageKey nunca sale en las respuestas de la API.
type ComplaintAttachment struct {
	ID          string `json:"id" db:"id"`
	ComplaintID string `json:"complaintId" db:"complaintId"`
	// StorageKey es el nombre interno y aleatorio del archivo en el almacenamiento.
	StorageKey string `json:"-" db:"storageKey"`
	// MimeType es el tipo real detectado por el contenido (no por la extensión).
	MimeType  string `json:"mimeType" db:"mimeType"`
	SizeBytes int64  `json:"sizeBytes" db:"sizeBytes"`
	Width     int    `json:"width" db:"width"`
	Height    int    `json:"height" db:"height"`
	// SHA256 del archivo guardado, en hexadecimal (integridad y duplicados).
	SHA256 string `json:"sha256" db:"sha256"`
	// MaskedRegions es la cantidad de zonas pixeladas (rostros, patentes) antes de guardar.
	MaskedRegions int       `json:"maskedRegions" db:"maskedRegions"`
	UploadedBy    *string   `json:"uploadedBy" db:"uploadedBy"`
	CreatedAt     time.Time `json:"createdAt" db:"createdAt"`
}
