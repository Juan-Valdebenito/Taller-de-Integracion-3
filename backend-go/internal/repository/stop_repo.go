package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// StopRepository gestiona las operaciones de base de datos para paraderos.
type StopRepository struct {
	pool *pgxpool.Pool
}

func NewStopRepository(pool *pgxpool.Pool) *StopRepository {
	return &StopRepository{pool: pool}
}

const stopSelectColumns = `id, name, latitude, longitude, "order", "routeId"`

func scanStop(row pgx.Row) (*domain.Stop, error) {
	var s domain.Stop
	err := row.Scan(&s.ID, &s.Name, &s.Latitude, &s.Longitude, &s.Order, &s.RouteID)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// FindByID retorna un paradero por ID o nil si no existe.
func (r *StopRepository) FindByID(ctx context.Context, id string) (*domain.Stop, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+stopSelectColumns+` FROM stops WHERE id = $1`, id)
	s, err := scanStop(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("StopRepository.FindByID: %w", err)
	}
	return s, nil
}

// Create inserta un nuevo paradero asociado a una ruta.
func (r *StopRepository) Create(ctx context.Context, name string, latitude, longitude float64, order int, routeID string) (*domain.Stop, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO stops (id, name, latitude, longitude, "order", "routeId")
		VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, $5)
		RETURNING `+stopSelectColumns,
		name, latitude, longitude, order, routeID,
	)
	return scanStop(row)
}

// Update actualiza los datos de un paradero existente.
func (r *StopRepository) Update(ctx context.Context, id, name string, latitude, longitude float64, order int) (*domain.Stop, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE stops SET name = $1, latitude = $2, longitude = $3, "order" = $4
		WHERE id = $5
		RETURNING `+stopSelectColumns,
		name, latitude, longitude, order, id,
	)
	s, err := scanStop(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("StopRepository.Update: %w", err)
	}
	return s, nil
}

// Delete elimina un paradero por ID.
func (r *StopRepository) Delete(ctx context.Context, id string) error {
	cmd, err := r.pool.Exec(ctx, `DELETE FROM stops WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("StopRepository.Delete: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
