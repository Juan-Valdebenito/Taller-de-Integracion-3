package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// RouteRepository gestiona las operaciones de base de datos para rutas y paradas.
type RouteRepository struct {
	pool *pgxpool.Pool
}

func NewRouteRepository(pool *pgxpool.Pool) *RouteRepository {
	return &RouteRepository{pool: pool}
}

const routeSelectColumns = `id, name, code, description, "isActive", "companyId", "createdAt", "updatedAt"`

func scanRoute(row pgx.Row) (*domain.Route, error) {
	var rt domain.Route
	err := row.Scan(&rt.ID, &rt.Name, &rt.Code, &rt.Description, &rt.IsActive, &rt.CompanyID, &rt.CreatedAt, &rt.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &rt, nil
}

// FindAll retorna todas las rutas.
func (r *RouteRepository) FindAll(ctx context.Context) ([]domain.Route, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+routeSelectColumns+` FROM routes ORDER BY "createdAt" DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("RouteRepository.FindAll: %w", err)
	}
	defer rows.Close()

	var routes []domain.Route
	for rows.Next() {
		var rt domain.Route
		if err := rows.Scan(&rt.ID, &rt.Name, &rt.Code, &rt.Description, &rt.IsActive, &rt.CompanyID, &rt.CreatedAt, &rt.UpdatedAt); err != nil {
			return nil, err
		}
		routes = append(routes, rt)
	}
	return routes, nil
}

// FindByID retorna una ruta por ID o nil si no existe.
func (r *RouteRepository) FindByID(ctx context.Context, id string) (*domain.Route, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+routeSelectColumns+` FROM routes WHERE id = $1`, id)
	rt, err := scanRoute(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("RouteRepository.FindByID: %w", err)
	}
	return rt, nil
}

// FindStopsByRouteID retorna las paradas de una ruta ordenadas por posición.
func (r *RouteRepository) FindStopsByRouteID(ctx context.Context, routeID string) ([]domain.Stop, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, latitude, longitude, "order", "routeId"
		FROM stops WHERE "routeId" = $1 ORDER BY "order" ASC
	`, routeID)
	if err != nil {
		return nil, fmt.Errorf("RouteRepository.FindStopsByRouteID: %w", err)
	}
	defer rows.Close()

	var stops []domain.Stop
	for rows.Next() {
		var s domain.Stop
		if err := rows.Scan(&s.ID, &s.Name, &s.Latitude, &s.Longitude, &s.Order, &s.RouteID); err != nil {
			return nil, err
		}
		stops = append(stops, s)
	}
	return stops, nil
}

// Create inserta una nueva ruta.
func (r *RouteRepository) Create(ctx context.Context, name, code string, description *string, companyID string) (*domain.Route, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO routes (id, name, code, description, "isActive", "companyId", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::TEXT, $1, $2, $3, TRUE, $4, NOW(), NOW())
		RETURNING `+routeSelectColumns,
		name, code, description, companyID,
	)
	return scanRoute(row)
}

// Update actualiza los campos de una ruta.
func (r *RouteRepository) Update(ctx context.Context, id, name, code string, description *string, isActive bool) (*domain.Route, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE routes SET name = $1, code = $2, description = $3, "isActive" = $4, "updatedAt" = NOW()
		WHERE id = $5
		RETURNING `+routeSelectColumns,
		name, code, description, isActive, id,
	)
	rt, err := scanRoute(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("RouteRepository.Update: %w", err)
	}
	return rt, nil
}

// Delete elimina una ruta por ID.
func (r *RouteRepository) Delete(ctx context.Context, id string) error {
	cmd, err := r.pool.Exec(ctx, `DELETE FROM routes WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("RouteRepository.Delete: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
