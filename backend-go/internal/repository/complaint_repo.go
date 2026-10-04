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
// Pagination define los parámetros opcionales de paginación.
type Pagination struct {
	Page  int
	Limit int
}

// ComplaintFilter define los filtros opcionales para la búsqueda avanzada de reclamos.
type ComplaintFilter struct {
	Status    *domain.ComplaintStatus
	Category  *domain.ComplaintCategory
	BusID     *string
	LineName  *string
	Rating    *int
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
	c.UserID = c.PassengerID
	c.Comment = c.Description
	return &c, nil
}

// FindAll retorna los reclamos aplicando filtros opcionales y paginación ordenados por fecha de creación.
func (r *ComplaintRepository) FindAll(ctx context.Context, filter ComplaintFilter, pagination ...Pagination) ([]domain.Complaint, error) {
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
	if filter.Rating != nil {
		query += fmt.Sprintf(" AND rating = $%d", argIdx)
		args = append(args, *filter.Rating)
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

	if len(pagination) > 0 {
		p := pagination[0]
		if p.Limit > 0 {
			query += fmt.Sprintf(" LIMIT $%d", argIdx)
			args = append(args, p.Limit)
			argIdx++
			if p.Page > 1 {
				offset := (p.Page - 1) * p.Limit
				query += fmt.Sprintf(" OFFSET $%d", argIdx)
				args = append(args, offset)
				argIdx++
			}
		}
	}

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

// GetStats ejecuta una consulta agregada para calcular métricas completas de reclamos.
func (r *ComplaintRepository) GetStats(ctx context.Context, companyID *string) (*domain.ComplaintStats, error) {
	stats := &domain.ComplaintStats{
		ByCategory: make(map[string]int),
		ByLine:     make(map[string]int),
		ByStatus:   make(map[string]int),
	}

	var compIDVal any = nil
	if companyID != nil && *companyID != "" {
		compIDVal = *companyID
	}

	// 1. Resumen global (total, avg rating / CSAT, tasa resolución, conteos)
	row := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*)::int AS total_complaints,
			COALESCE(AVG(rating), 0)::float8 AS avg_rating,
			COALESCE(
				ROUND((COUNT(*) FILTER (WHERE status = 'RESOLVED')::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 2),
				0
			)::float8 AS resolved_pct,
			COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
			COUNT(*) FILTER (WHERE status = 'IN_REVIEW')::int AS in_review_count,
			COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved_count,
			COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_count
		FROM complaints
		WHERE ($1::text IS NULL OR "companyId" = $1)
	`, compIDVal)

	if err := row.Scan(
		&stats.TotalComplaints,
		&stats.AverageRating,
		&stats.ResolvedPercentage,
		&stats.PendingCount,
		&stats.InReviewCount,
		&stats.ResolvedCount,
		&stats.RejectedCount,
	); err != nil {
		return nil, fmt.Errorf("ComplaintRepository.GetStats summary: %w", err)
	}

	stats.CSAT = stats.AverageRating
	stats.ByStatus[string(domain.ComplaintStatusPending)] = stats.PendingCount
	stats.ByStatus[string(domain.ComplaintStatusInReview)] = stats.InReviewCount
	stats.ByStatus[string(domain.ComplaintStatusResolved)] = stats.ResolvedCount
	stats.ByStatus[string(domain.ComplaintStatusRejected)] = stats.RejectedCount

	// 2. Distribución por categoría
	catRows, err := r.pool.Query(ctx, `
		SELECT category, COUNT(*)::int
		FROM complaints
		WHERE ($1::text IS NULL OR "companyId" = $1)
		GROUP BY category
	`, compIDVal)
	if err == nil {
		defer catRows.Close()
		for catRows.Next() {
			var cat string
			var count int
			if err := catRows.Scan(&cat, &count); err == nil {
				stats.ByCategory[cat] = count
			}
		}
	}

	// 3. Distribución por línea de transporte (7A, 7B, 1C, etc.)
	lineRows, err := r.pool.Query(ctx, `
		SELECT COALESCE(NULLIF("lineName", ''), 'Sin Línea') AS line, COUNT(*)::int
		FROM complaints
		WHERE ($1::text IS NULL OR "companyId" = $1)
		GROUP BY "lineName"
	`, compIDVal)
	if err == nil {
		defer lineRows.Close()
		for lineRows.Next() {
			var line string
			var count int
			if err := lineRows.Scan(&line, &count); err == nil {
				stats.ByLine[line] = count
			}
		}
	}

	return stats, nil
}
