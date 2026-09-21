package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

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
	id, title, description, category, status, rating, "lineName", "adminResponse",
	"passengerId", "busId", "routeId", "companyId", "tripId", "createdAt", "updatedAt"
`

// ComplaintFilter define los filtros opcionales para la búsqueda avanzada de reclamos.
type ComplaintFilter struct {
	Status    *domain.ComplaintStatus
	Category  *domain.ComplaintCategory
	BusID     *string
	LineName  *string
	MinRating *int
	MaxRating *int
	CompanyID *string
}

func scanComplaint(row pgx.Row) (*domain.Complaint, error) {
	var c domain.Complaint
	err := row.Scan(
		&c.ID, &c.Title, &c.Description, &c.Category, &c.Status, &c.Rating, &c.LineName, &c.AdminResponse,
		&c.PassengerID, &c.BusID, &c.RouteID, &c.CompanyID, &c.TripID, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// FindAll retorna los reclamos aplicando filtros opcionales ordenados por fecha de creación.
func (r *ComplaintRepository) FindAll(ctx context.Context, filter ComplaintFilter) ([]domain.Complaint, error) {
	query := `
		SELECT ` + complaintSelectColumns + `
		FROM complaints
		WHERE 1=1
	`
	var args []any
	argIdx := 1

	if filter.Status != nil {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, *filter.Status)
		argIdx++
	}
	if filter.Category != nil {
		query += fmt.Sprintf(" AND category = $%d", argIdx)
		args = append(args, *filter.Category)
		argIdx++
	}
	if filter.BusID != nil && *filter.BusID != "" {
		query += fmt.Sprintf(" AND \"busId\" = $%d", argIdx)
		args = append(args, *filter.BusID)
		argIdx++
	}
	if filter.LineName != nil && *filter.LineName != "" {
		query += fmt.Sprintf(" AND \"lineName\" ILIKE $%d", argIdx)
		args = append(args, "%"+*filter.LineName+"%")
		argIdx++
	}
	if filter.MinRating != nil {
		query += fmt.Sprintf(" AND rating >= $%d", argIdx)
		args = append(args, *filter.MinRating)
		argIdx++
	}
	if filter.MaxRating != nil {
		query += fmt.Sprintf(" AND rating <= $%d", argIdx)
		args = append(args, *filter.MaxRating)
		argIdx++
	}
	if filter.CompanyID != nil && *filter.CompanyID != "" {
		query += fmt.Sprintf(" AND \"companyId\" = $%d", argIdx)
		args = append(args, *filter.CompanyID)
		argIdx++
	}

	query += ` ORDER BY "createdAt" DESC`

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("ComplaintRepository.FindAll: %w", err)
	}
	defer rows.Close()

	var complaints []domain.Complaint
	for rows.Next() {
		c, err := scanComplaint(rows)
		if err != nil {
			return nil, err
		}
		complaints = append(complaints, *c)
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

// Create inserta un nuevo reclamo con soporte para rating y lineName.
func (r *ComplaintRepository) Create(ctx context.Context,
	title, description string,
	category domain.ComplaintCategory,
	rating *int,
	lineName *string,
	passengerID, companyID string,
	busID, routeID, tripID *string,
) (*domain.Complaint, error) {
	// 1. Validar y normalizar busID para evitar violaciones de FK
	if busID != nil && *busID != "" {
		normalized := strings.ToLower(*busID)
		if strings.HasPrefix(normalized, "b-") {
			normalized = "bus-" + strings.TrimPrefix(normalized, "b-")
		}
		var validBusID string
		err := r.pool.QueryRow(ctx, `SELECT id FROM buses WHERE id = $1 OR LOWER(id) = $2 LIMIT 1`, *busID, normalized).Scan(&validBusID)
		if err == nil {
			busID = &validBusID
		} else {
			busID = nil
		}
	}

	// 2. Validar routeID
	if routeID != nil && *routeID != "" {
		var validRouteID string
		err := r.pool.QueryRow(ctx, `SELECT id FROM routes WHERE id = $1 LIMIT 1`, *routeID).Scan(&validRouteID)
		if err != nil {
			routeID = nil
		}
	}

	// 3. Validar companyID
	if companyID != "" {
		var validCompID string
		err := r.pool.QueryRow(ctx, `SELECT id FROM companies WHERE id = $1 LIMIT 1`, companyID).Scan(&validCompID)
		if err != nil {
			_ = r.pool.QueryRow(ctx, `SELECT id FROM companies LIMIT 1`).Scan(&companyID)
		}
	} else {
		_ = r.pool.QueryRow(ctx, `SELECT id FROM companies LIMIT 1`).Scan(&companyID)
	}

	// 4. Validar passengerID
	if passengerID != "" {
		var validPassID string
		err := r.pool.QueryRow(ctx, `SELECT id FROM users WHERE id = $1 LIMIT 1`, passengerID).Scan(&validPassID)
		if err != nil {
			err = r.pool.QueryRow(ctx, `SELECT id FROM users WHERE role = 'PASSENGER' LIMIT 1`).Scan(&passengerID)
			if err != nil {
				_ = r.pool.QueryRow(ctx, `SELECT id FROM users LIMIT 1`).Scan(&passengerID)
			}
		}
	} else {
		_ = r.pool.QueryRow(ctx, `SELECT id FROM users WHERE role = 'PASSENGER' LIMIT 1`).Scan(&passengerID)
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO complaints (
			id, title, description, category, status, rating, "lineName", "adminResponse",
			"passengerId", "busId", "routeId", "companyId", "tripId", "createdAt", "updatedAt"
		) VALUES (
			gen_random_uuid()::TEXT, $1, $2, $3, 'PENDING', $4, $5, NULL,
			$6, $7, $8, $9, $10, NOW(), NOW()
		)
		RETURNING `+complaintSelectColumns,
		title, description, category, rating, lineName, passengerID, busID, routeID, companyID, tripID,
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
