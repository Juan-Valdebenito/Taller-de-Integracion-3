package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// BusRepository gestiona las operaciones de base de datos para buses.
type BusRepository struct {
	pool *pgxpool.Pool
}

func NewBusRepository(pool *pgxpool.Pool) *BusRepository {
	return &BusRepository{pool: pool}
}

const busSelectColumns = `
	id, patente, capacity, "currentPassengers", boardings, alightings, "schoolBoardings",
	status, "lastLatitude", "lastLongitude", "lastHeading", "lastSpeed", "lastLocationAt",
	"companyId", "routeId", "createdAt", "updatedAt"
`

func scanBus(row pgx.Row) (*domain.Bus, error) {
	var b domain.Bus
	err := row.Scan(
		&b.ID, &b.Patente, &b.Capacity, &b.CurrentPassengers, &b.Boardings, &b.Alightings, &b.SchoolBoardings,
		&b.Status, &b.LastLatitude, &b.LastLongitude, &b.LastHeading, &b.LastSpeed, &b.LastLocationAt,
		&b.CompanyID, &b.RouteID, &b.CreatedAt, &b.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// FindAll retorna todos los buses. Si routeID no es vacío, filtra por ruta.
func (r *BusRepository) FindAll(ctx context.Context, routeID string) ([]domain.Bus, error) {
	query := `SELECT ` + busSelectColumns + ` FROM buses`
	args := []interface{}{}

	if routeID != "" {
		query += ` WHERE "routeId" = $1`
		args = append(args, routeID)
	}
	query += ` ORDER BY "createdAt" DESC`

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("BusRepository.FindAll: %w", err)
	}
	defer rows.Close()

	var buses []domain.Bus
	for rows.Next() {
		var b domain.Bus
		if err := rows.Scan(
			&b.ID, &b.Patente, &b.Capacity, &b.CurrentPassengers, &b.Boardings, &b.Alightings, &b.SchoolBoardings,
			&b.Status, &b.LastLatitude, &b.LastLongitude, &b.LastHeading, &b.LastSpeed, &b.LastLocationAt,
			&b.CompanyID, &b.RouteID, &b.CreatedAt, &b.UpdatedAt,
		); err != nil {
			return nil, err
		}
		buses = append(buses, b)
	}
	return buses, nil
}

// FindByID retorna un bus por ID o nil si no existe.
func (r *BusRepository) FindByID(ctx context.Context, id string) (*domain.Bus, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+busSelectColumns+` FROM buses WHERE id = $1`, id)
	b, err := scanBus(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("BusRepository.FindByID: %w", err)
	}
	return b, nil
}

// FindActiveByRouteID retorna los buses activos en una ruta.
func (r *BusRepository) FindActiveByRouteID(ctx context.Context, routeID string) ([]domain.Bus, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+busSelectColumns+`
		FROM buses
		WHERE "routeId" = $1 AND status = 'ACTIVE'
	`, routeID)
	if err != nil {
		return nil, fmt.Errorf("BusRepository.FindActiveByRouteID: %w", err)
	}
	defer rows.Close()

	var buses []domain.Bus
	for rows.Next() {
		var b domain.Bus
		if err := rows.Scan(
			&b.ID, &b.Patente, &b.Capacity, &b.CurrentPassengers, &b.Boardings, &b.Alightings, &b.SchoolBoardings,
			&b.Status, &b.LastLatitude, &b.LastLongitude, &b.LastHeading, &b.LastSpeed, &b.LastLocationAt,
			&b.CompanyID, &b.RouteID, &b.CreatedAt, &b.UpdatedAt,
		); err != nil {
			return nil, err
		}
		buses = append(buses, b)
	}
	return buses, nil
}

// Create inserta un nuevo bus.
func (r *BusRepository) Create(ctx context.Context, patente string, capacity int, companyID string, routeID *string) (*domain.Bus, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO buses (id, patente, capacity, "currentPassengers", boardings, alightings, "schoolBoardings",
		                   status, "companyId", "routeId", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::TEXT, $1, $2, 0, 0, 0, 0, 'INACTIVE', $3, $4, NOW(), NOW())
		RETURNING `+busSelectColumns,
		patente, capacity, companyID, routeID,
	)
	return scanBus(row)
}

// Update actualiza los campos de un bus.
func (r *BusRepository) Update(ctx context.Context, id, patente string, capacity int, status domain.BusStatus, routeID *string) (*domain.Bus, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE buses SET patente = $1, capacity = $2, status = $3, "routeId" = $4, "updatedAt" = NOW()
		WHERE id = $5
		RETURNING `+busSelectColumns,
		patente, capacity, status, routeID, id,
	)
	b, err := scanBus(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("BusRepository.Update: %w", err)
	}
	return b, nil
}

// UpdateLocation actualiza la posición GPS de un bus.
func (r *BusRepository) UpdateLocation(ctx context.Context, id string, lat, lng float64, heading, speed *float64) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE buses
		SET "lastLatitude" = $1, "lastLongitude" = $2, "lastHeading" = $3, "lastSpeed" = $4,
		    "lastLocationAt" = $5, "updatedAt" = NOW()
		WHERE id = $6
	`, lat, lng, heading, speed, time.Now(), id)
	return err
}

// Delete elimina un bus por ID.
func (r *BusRepository) Delete(ctx context.Context, id string) error {
	cmd, err := r.pool.Exec(ctx, `DELETE FROM buses WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("BusRepository.Delete: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
