package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// RecaudoRepository maneja la persistencia de transacciones de validación y cobro de tarifa.
type RecaudoRepository struct {
	pool *pgxpool.Pool
}

func NewRecaudoRepository(pool *pgxpool.Pool) *RecaudoRepository {
	return &RecaudoRepository{pool: pool}
}

// RecaudoFilter define los criterios de filtrado para transacciones de recaudo.
type RecaudoFilter struct {
	BusID     *string
	FareType  *string
	StartDate *time.Time
	EndDate   *time.Time
	Limit     int
	Offset    int
}

// RecaudoSummary consolida las métricas de recaudo por tarifa.
type RecaudoSummary struct {
	TotalAmount       int `json:"totalAmount"`       // CLP
	TotalTransactions int `json:"totalTransactions"` // Total validaciones
	NormalCount       int `json:"normalCount"`       // Pasaje Bipay Normal
	NormalAmount      int `json:"normalAmount"`
	EscolarCount      int `json:"escolarCount"`      // Pase Escolar TNE
	EscolarAmount     int `json:"escolarAmount"`
	AdultoMayorCount  int `json:"adultoMayorCount"`  // Adulto Mayor
	AdultoMayorAmount int `json:"adultoMayorAmount"`
}

// Create inserta una nueva transacción de recaudo en la base de datos.
func (r *RecaudoRepository) Create(ctx context.Context, tx *domain.RecaudoTransaction) (*domain.RecaudoTransaction, error) {
	query := `
		INSERT INTO recaudo_transactions (
			"busId", "cardUid", "fareType", amount, status, "routeId", "tripId", latitude, longitude, "createdAt"
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
		) RETURNING id, "createdAt"
	`
	err := r.pool.QueryRow(ctx, query,
		tx.BusID,
		tx.CardUID,
		string(tx.FareType),
		tx.Amount,
		tx.Status,
		tx.RouteID,
		tx.TripID,
		tx.Latitude,
		tx.Longitude,
	).Scan(&tx.ID, &tx.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("error al persistir transacción de recaudo: %w", err)
	}

	return tx, nil
}

// FindAll consulta las transacciones registradas con filtros opcionales.
func (r *RecaudoRepository) FindAll(ctx context.Context, filter RecaudoFilter) ([]domain.RecaudoTransaction, error) {
	query := `
		SELECT id, "busId", "cardUid", "fareType", amount, status, "routeId", "tripId", latitude, longitude, "createdAt"
		FROM recaudo_transactions
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	if filter.BusID != nil && *filter.BusID != "" {
		query += fmt.Sprintf(` AND "busId" = $%d`, argIdx)
		args = append(args, *filter.BusID)
		argIdx++
	}

	if filter.FareType != nil && *filter.FareType != "" {
		query += fmt.Sprintf(` AND "fareType" = $%d`, argIdx)
		args = append(args, *filter.FareType)
		argIdx++
	}

	query += ` ORDER BY "createdAt" DESC`

	limit := 50
	if filter.Limit > 0 {
		limit = filter.Limit
	}
	query += fmt.Sprintf(` LIMIT $%d`, argIdx)
	args = append(args, limit)
	argIdx++

	if filter.Offset > 0 {
		query += fmt.Sprintf(` OFFSET $%d`, argIdx)
		args = append(args, filter.Offset)
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("error al listar transacciones de recaudo: %w", err)
	}
	defer rows.Close()

	var list []domain.RecaudoTransaction
	for rows.Next() {
		var tx domain.RecaudoTransaction
		var fareTypeStr string
		err := rows.Scan(
			&tx.ID,
			&tx.BusID,
			&tx.CardUID,
			&fareTypeStr,
			&tx.Amount,
			&tx.Status,
			&tx.RouteID,
			&tx.TripID,
			&tx.Latitude,
			&tx.Longitude,
			&tx.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("error al escanear fila de recaudo: %w", err)
		}
		tx.FareType = domain.FareType(fareTypeStr)
		list = append(list, tx)
	}

	if list == nil {
		list = []domain.RecaudoTransaction{}
	}

	return list, nil
}

// GetSummary obtiene métricas consolidadas de recaudación financiera y conteo por tipo de tarifa.
func (r *RecaudoRepository) GetSummary(ctx context.Context, busID *string) (*RecaudoSummary, error) {
	query := `
		SELECT 
			COALESCE(SUM(amount), 0) AS total_amount,
			COUNT(*) AS total_txs,
			COALESCE(SUM(CASE WHEN "fareType" = 'BIPAY_NORMAL' THEN 1 ELSE 0 END), 0) AS normal_count,
			COALESCE(SUM(CASE WHEN "fareType" = 'BIPAY_NORMAL' THEN amount ELSE 0 END), 0) AS normal_amount,
			COALESCE(SUM(CASE WHEN "fareType" = 'BIPAY_ESCOLAR' THEN 1 ELSE 0 END), 0) AS escolar_count,
			COALESCE(SUM(CASE WHEN "fareType" = 'BIPAY_ESCOLAR' THEN amount ELSE 0 END), 0) AS escolar_amount,
			COALESCE(SUM(CASE WHEN "fareType" = 'BIPAY_ADULTO_MAYOR' THEN 1 ELSE 0 END), 0) AS am_count,
			COALESCE(SUM(CASE WHEN "fareType" = 'BIPAY_ADULTO_MAYOR' THEN amount ELSE 0 END), 0) AS am_amount
		FROM recaudo_transactions
		WHERE status = 'APPROVED'
	`
	args := []interface{}{}
	if busID != nil && *busID != "" {
		query += ` AND "busId" = $1`
		args = append(args, *busID)
	}

	var sum RecaudoSummary
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&sum.TotalAmount,
		&sum.TotalTransactions,
		&sum.NormalCount,
		&sum.NormalAmount,
		&sum.EscolarCount,
		&sum.EscolarAmount,
		&sum.AdultoMayorCount,
		&sum.AdultoMayorAmount,
	)
	if err != nil {
		return nil, fmt.Errorf("error al calcular resumen de recaudo: %w", err)
	}

	return &sum, nil
}
