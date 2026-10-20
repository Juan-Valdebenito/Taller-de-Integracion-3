package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// ComplaintAttachmentRepository gestiona los metadatos de las imágenes adjuntas
// a reclamos (tabla complaint_attachments). Los archivos se guardan aparte.
type ComplaintAttachmentRepository struct {
	pool *pgxpool.Pool
}

func NewComplaintAttachmentRepository(pool *pgxpool.Pool) *ComplaintAttachmentRepository {
	return &ComplaintAttachmentRepository{pool: pool}
}

var (
	// ErrAttachmentDuplicate: la misma imagen (mismo SHA-256) ya está adjunta al reclamo.
	ErrAttachmentDuplicate = errors.New("esta imagen ya está adjunta al reclamo")
	// ErrAttachmentComplaintNotFound: el reclamo indicado no existe.
	ErrAttachmentComplaintNotFound = errors.New("el reclamo no existe")
)

// Mismo orden que scanAttachment.
const attachmentSelectColumns = `
	id, "complaintId", "storageKey", "mimeType", "sizeBytes", width, height,
	sha256, "maskedRegions", "uploadedBy", "createdAt"
`

func scanAttachment(row pgx.Row) (*domain.ComplaintAttachment, error) {
	var a domain.ComplaintAttachment
	err := row.Scan(
		&a.ID, &a.ComplaintID, &a.StorageKey, &a.MimeType, &a.SizeBytes, &a.Width, &a.Height,
		&a.SHA256, &a.MaskedRegions, &a.UploadedBy, &a.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// mapAttachmentInsertError traduce los errores de PostgreSQL del INSERT a
// errores con mensaje para el usuario.
func mapAttachmentInsertError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch {
		case pgErr.Code == "23505" && pgErr.ConstraintName == "uq_complaint_attachments_complaint_sha256":
			return ErrAttachmentDuplicate
		case pgErr.Code == "23503" && pgErr.ConstraintName == "complaint_attachments_complaintId_fkey":
			return ErrAttachmentComplaintNotFound
		}
	}
	return fmt.Errorf("ComplaintAttachmentRepository.Create: %w", err)
}

// Create guarda los metadatos de una imagen ya sanitizada y almacenada.
// Valida el adjunto con las reglas del dominio antes de ir a la base de datos;
// id y createdAt los asigna la base.
func (r *ComplaintAttachmentRepository) Create(ctx context.Context, att domain.ComplaintAttachment) (*domain.ComplaintAttachment, error) {
	if err := att.Validate(); err != nil {
		return nil, err
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO complaint_attachments (
			"complaintId", "storageKey", "mimeType", "sizeBytes", width, height,
			sha256, "maskedRegions", "uploadedBy"
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING `+attachmentSelectColumns,
		att.ComplaintID, att.StorageKey, att.MimeType, att.SizeBytes, att.Width, att.Height,
		att.SHA256, att.MaskedRegions, att.UploadedBy,
	)
	created, err := scanAttachment(row)
	if err != nil {
		return nil, mapAttachmentInsertError(err)
	}
	return created, nil
}

// FindByComplaintID lista las imágenes de un reclamo en orden de subida.
// Devuelve una lista vacía (no nil) si no tiene imágenes.
func (r *ComplaintAttachmentRepository) FindByComplaintID(ctx context.Context, complaintID string) ([]domain.ComplaintAttachment, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+attachmentSelectColumns+`
		FROM complaint_attachments
		WHERE "complaintId" = $1
		ORDER BY "createdAt", id
	`, complaintID)
	if err != nil {
		return nil, fmt.Errorf("ComplaintAttachmentRepository.FindByComplaintID: %w", err)
	}
	defer rows.Close()

	attachments := []domain.ComplaintAttachment{}
	for rows.Next() {
		a, err := scanAttachment(rows)
		if err != nil {
			return nil, fmt.Errorf("ComplaintAttachmentRepository.FindByComplaintID: %w", err)
		}
		attachments = append(attachments, *a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ComplaintAttachmentRepository.FindByComplaintID: %w", err)
	}
	return attachments, nil
}
