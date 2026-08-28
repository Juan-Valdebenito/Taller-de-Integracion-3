package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// ComplaintRepository gestiona las operaciones de base de datos para reclamos.
type ComplaintRepository struct {
	pool *pgxpool.Pool
}

func NewComplaintRepository(pool *pgxpool.Pool) *ComplaintRepository {
	return &ComplaintRepository{pool: pool}
}

const complaintSelectColumns = `
	id, title, description, category, status, "adminResponse",
	"passengerId", "busId", "routeId", "companyId", "tripId", "createdAt", "updatedAt"
`

func scanComplaint(row pgx.Row) (*domain.Complaint, error) {
	var c domain.Complaint
	err := row.Scan(
		&c.ID, &c.Title, &c.Description, &c.Category, &c.Status, &c.AdminResponse,
		&c.PassengerID, &c.BusID, &c.RouteID, &c.CompanyID, &c.TripID, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// FindAll retorna todos los reclamos ordenados por fecha de creación (más reciente primero).
func (r *ComplaintRepository) FindAll(ctx context.Context) ([]domain.Complaint, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+complaintSelectColumns+`
		FROM complaints
		ORDER BY "createdAt" DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("ComplaintRepository.FindAll: %w", err)
	}
	defer rows.Close()

	var complaints []domain.Complaint
	for rows.Next() {
		var c domain.Complaint
		if err := rows.Scan(
			&c.ID, &c.Title, &c.Description, &c.Category, &c.Status, &c.AdminResponse,
			&c.PassengerID, &c.BusID, &c.RouteID, &c.CompanyID, &c.TripID, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		complaints = append(complaints, c)
	}
	return complaints, nil
}

// FindByID retorna un reclamo por ID o nil si no existe.
func (r *ComplaintRepository) FindByID(ctx context.Context, id string) (*domain.Complaint, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+complaintSelectColumns+` FROM complaints WHERE id = $1
	`, id)
	c, err := scanComplaint(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("ComplaintRepository.FindByID: %w", err)
	}
	return c, nil
}

// Create inserta un nuevo reclamo.
func (r *ComplaintRepository) Create(ctx context.Context,
	title, description string,
	category domain.ComplaintCategory,
	passengerID, companyID string,
	busID, routeID, tripID *string,
) (*domain.Complaint, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO complaints (
			id, title, description, category, status, "adminResponse",
			"passengerId", "busId", "routeId", "companyId", "tripId", "createdAt", "updatedAt"
		) VALUES (
			gen_random_uuid()::TEXT, $1, $2, $3, 'PENDING', NULL,
			$4, $5, $6, $7, $8, NOW(), NOW()
		)
		RETURNING `+complaintSelectColumns,
		title, description, category, passengerID, busID, routeID, companyID, tripID,
	)
	return scanComplaint(row)
}

// UpdateStatus actualiza el estado de un reclamo y la respuesta del administrador.
func (r *ComplaintRepository) UpdateStatus(ctx context.Context, id string, status domain.ComplaintStatus, adminResponse *string) (*domain.Complaint, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE complaints
		SET status = $1, "adminResponse" = $2, "updatedAt" = NOW()
		WHERE id = $3
		RETURNING `+complaintSelectColumns,
		status, adminResponse, id,
	)
	c, err := scanComplaint(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("ComplaintRepository.UpdateStatus: %w", err)
	}
	return c, nil
}

// Delete elimina un reclamo por ID.
func (r *ComplaintRepository) Delete(ctx context.Context, id string) error {
	cmd, err := r.pool.Exec(ctx, `DELETE FROM complaints WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("ComplaintRepository.Delete: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
