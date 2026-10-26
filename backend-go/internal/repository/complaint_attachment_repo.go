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
	// ErrAttachmentNotFound: la imagen no existe (o no pertenece a ese reclamo).
	ErrAttachmentNotFound = errors.New("la imagen no existe")
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

// queryRower: lo común entre el pool y una transacción, para reutilizar el INSERT.
type queryRower interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func insertAttachment(ctx context.Context, db queryRower, att domain.ComplaintAttachment) (*domain.ComplaintAttachment, error) {
	row := db.QueryRow(ctx, `
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

// Create guarda los metadatos de una imagen ya sanitizada y almacenada.
// Valida el adjunto con las reglas del dominio antes de ir a la base de datos;
// id y createdAt los asigna la base. Para respetar el máximo de imágenes por
// reclamo usar CreateWithinLimit.
func (r *ComplaintAttachmentRepository) Create(ctx context.Context, att domain.ComplaintAttachment) (*domain.ComplaintAttachment, error) {
	if err := att.Validate(); err != nil {
		return nil, err
	}
	return insertAttachment(ctx, r.pool, att)
}

// CreateWithinLimit guarda la imagen solo si el reclamo tiene menos de
// domain.MaxAttachmentsPerComplaint. Bloquea la fila del reclamo (SELECT … FOR
// UPDATE) mientras cuenta y guarda: dos subidas simultáneas no pueden pasar
// ambas el límite.
func (r *ComplaintAttachmentRepository) CreateWithinLimit(ctx context.Context, att domain.ComplaintAttachment) (*domain.ComplaintAttachment, error) {
	if err := att.Validate(); err != nil {
		return nil, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("ComplaintAttachmentRepository.CreateWithinLimit: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // sin efecto después de Commit

	var locked string
	if err := tx.QueryRow(ctx, `SELECT id FROM complaints WHERE id = $1 FOR UPDATE`, att.ComplaintID).Scan(&locked); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAttachmentComplaintNotFound
		}
		return nil, fmt.Errorf("ComplaintAttachmentRepository.CreateWithinLimit: %w", err)
	}

	var current int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM complaint_attachments WHERE "complaintId" = $1`, att.ComplaintID).Scan(&current); err != nil {
		return nil, fmt.Errorf("ComplaintAttachmentRepository.CreateWithinLimit: %w", err)
	}
	if err := domain.CanAddAttachment(current); err != nil {
		return nil, err
	}

	created, err := insertAttachment(ctx, tx, att)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("ComplaintAttachmentRepository.CreateWithinLimit: %w", err)
	}
	return created, nil
}

// FindByID busca una imagen de un reclamo. Exige ambos ids para que no se pueda
// acceder a la imagen de otro reclamo adivinando su id. Devuelve nil si no existe.
func (r *ComplaintAttachmentRepository) FindByID(ctx context.Context, complaintID, id string) (*domain.ComplaintAttachment, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+attachmentSelectColumns+`
		FROM complaint_attachments
		WHERE id = $1 AND "complaintId" = $2
	`, id, complaintID)
	a, err := scanAttachment(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("ComplaintAttachmentRepository.FindByID: %w", err)
	}
	return a, nil
}

// CountByComplaintID devuelve cuántas imágenes tiene un reclamo.
func (r *ComplaintAttachmentRepository) CountByComplaintID(ctx context.Context, complaintID string) (int, error) {
	var count int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM complaint_attachments WHERE "complaintId" = $1`, complaintID).Scan(&count); err != nil {
		return 0, fmt.Errorf("ComplaintAttachmentRepository.CountByComplaintID: %w", err)
	}
	return count, nil
}

// Delete borra los metadatos de una imagen de un reclamo y los devuelve, para
// que quien llama borre también el archivo (StorageKey) del almacenamiento.
// Devuelve ErrAttachmentNotFound si no existe en ese reclamo.
func (r *ComplaintAttachmentRepository) Delete(ctx context.Context, complaintID, id string) (*domain.ComplaintAttachment, error) {
	row := r.pool.QueryRow(ctx, `
		DELETE FROM complaint_attachments
		WHERE id = $1 AND "complaintId" = $2
		RETURNING `+attachmentSelectColumns,
		id, complaintID,
	)
	a, err := scanAttachment(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAttachmentNotFound
		}
		return nil, fmt.Errorf("ComplaintAttachmentRepository.Delete: %w", err)
	}
	return a, nil
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
