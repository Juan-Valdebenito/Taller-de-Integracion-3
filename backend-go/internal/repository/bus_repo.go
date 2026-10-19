package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
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

// BusFilter define los filtros avanzados para la búsqueda de buses.
type BusFilter struct {
	Line      *string
	Status    *domain.BusStatus
	RouteID   *string
	CompanyID *string
}

// BusDetail estructura enriquecida que incluye aforo actual y ruta asociada.
type BusDetail struct {
	domain.Bus
	OccupancyPercentage int           `json:"occupancyPercentage"`
	Route               *domain.Route `json:"route,omitempty"`
}

// buildBusFindAllQuery arma el SELECT de FindAll con los filtros presentes.
// Es una función pura para poder probar el SQL sin base de datos.
func buildBusFindAllQuery(filter BusFilter) (string, []any) {
	query := `SELECT ` + busSelectColumns + ` FROM buses WHERE 1=1`
	var args queryArgs

	if filter.RouteID != nil && *filter.RouteID != "" {
		query += ` AND "routeId" = ` + args.add(*filter.RouteID)
	}
	if filter.CompanyID != nil && *filter.CompanyID != "" {
		query += ` AND "companyId" = ` + args.add(*filter.CompanyID)
	}
	if filter.Status != nil && *filter.Status != "" {
		query += ` AND status = ` + args.add(*filter.Status)
	}
	if filter.Line != nil && *filter.Line != "" {
		cleanLine := strings.ToUpper(strings.TrimSpace(*filter.Line))
		cleanLine = strings.TrimPrefix(cleanLine, "LINEA")
		cleanLine = strings.TrimPrefix(cleanLine, "LÍNEA")
		cleanLine = strings.TrimSpace(cleanLine)
		like := "%" + cleanLine + "%"
		query += fmt.Sprintf(` AND (
			EXISTS (
				SELECT 1 FROM routes r
				WHERE r.id = buses."routeId"
				AND (UPPER(r.code) = %s OR UPPER(r.code) ILIKE %s OR UPPER(r.name) ILIKE %s)
			)
			OR UPPER("routeId") ILIKE %s
			OR UPPER(id) ILIKE %s
		)`, args.add(cleanLine), args.add(like), args.add(like), args.add(like), args.add(like))
	}
	query += ` ORDER BY "createdAt" DESC`
	return query, args
}

// FindAll retorna los buses aplicando filtros opcionales de línea, estado, ruta y empresa.
func (r *BusRepository) FindAll(ctx context.Context, filter BusFilter) ([]domain.Bus, error) {
	query, args := buildBusFindAllQuery(filter)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("BusRepository.FindAll: %w", err)
	}
	defer rows.Close()

	var buses []domain.Bus
	for rows.Next() {
		b, err := scanBus(rows)
		if err != nil {
			return nil, err
		}
		buses = append(buses, *b)
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

// FindDetailByID retorna el detalle de un bus junto a su aforo actual y datos de la ruta asociada.
func (r *BusRepository) FindDetailByID(ctx context.Context, id string) (*BusDetail, error) {
	bus, err := r.FindByID(ctx, id)
	if err != nil || bus == nil {
		return nil, err
	}

	occ := 0
	if bus.Capacity > 0 {
		occ = int(float64(bus.CurrentPassengers) / float64(bus.Capacity) * 100)
		if occ > 100 {
			occ = 100
		}
	}

	detail := &BusDetail{
		Bus:                 *bus,
		OccupancyPercentage: occ,
	}

	if bus.RouteID != nil && *bus.RouteID != "" {
		var rt domain.Route
		err := r.pool.QueryRow(ctx, `
			SELECT id, name, code, description, "isActive", "companyId", "createdAt", "updatedAt"
			FROM routes
			WHERE id = $1
		`, *bus.RouteID).Scan(
			&rt.ID, &rt.Name, &rt.Code, &rt.Description, &rt.IsActive, &rt.CompanyID, &rt.CreatedAt, &rt.UpdatedAt,
		)
		if err == nil {
			detail.Route = &rt
		}
	}

	return detail, nil
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

// UpdatePartial actualiza selectivamente campos de un bus.
func (r *BusRepository) UpdatePartial(ctx context.Context, id string, patente *string, capacity *int, status *domain.BusStatus, routeID *string) (*domain.Bus, error) {
	setClauses := []string{`"updatedAt" = NOW()`}
	var args []any
	argIdx := 1

	if patente != nil {
		setClauses = append(setClauses, fmt.Sprintf("patente = $%d", argIdx))
		args = append(args, *patente)
		argIdx++
	}
	if capacity != nil {
		setClauses = append(setClauses, fmt.Sprintf("capacity = $%d", argIdx))
		args = append(args, *capacity)
		argIdx++
	}
	if status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, *status)
		argIdx++
	}
	if routeID != nil {
		setClauses = append(setClauses, fmt.Sprintf("\"routeId\" = $%d", argIdx))
		args = append(args, *routeID)
		argIdx++
	}

	query := fmt.Sprintf(`
		UPDATE buses
		SET %s
		WHERE id = $%d
		RETURNING `+busSelectColumns, strings.Join(setClauses, ", "), argIdx)
	args = append(args, id)

	row := r.pool.QueryRow(ctx, query, args...)
	b, err := scanBus(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("BusRepository.UpdatePartial: %w", err)
	}
	return b, nil
}

// UpdateOccupancyCounters persiste los contadores de aforo (pasajeros a bordo,
// subidas, subidas escolares y bajadas) tras procesar un evento de simulación.
func (r *BusRepository) UpdateOccupancyCounters(ctx context.Context, id string, currentPassengers, boardings, schoolBoardings, alightings int) (*domain.Bus, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE buses
		SET "currentPassengers" = $1, boardings = $2, "schoolBoardings" = $3, alightings = $4, "updatedAt" = NOW()
		WHERE id = $5
		RETURNING `+busSelectColumns,
		currentPassengers, boardings, schoolBoardings, alightings, id,
	)
	b, err := scanBus(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("BusRepository.UpdateOccupancyCounters: %w", err)
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
