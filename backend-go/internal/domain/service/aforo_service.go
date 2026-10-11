package service

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AforoStatus clasifica el estado de ocupación física del vehículo de transporte.
type AforoStatus string

const (
	AforoStatusLow          AforoStatus = "LOW"           // < 40 %
	AforoStatusMedium       AforoStatus = "MEDIUM"        // 40 % – 69.9 %
	AforoStatusHigh         AforoStatus = "HIGH"          // 70 % – 89.9 %
	AforoStatusFull         AforoStatus = "FULL"          // 90 % – 100 %
	AforoStatusOverCapacity AforoStatus = "OVER_CAPACITY" // > 100 % (Alerta de seguridad operacional)
)

// Errores de cálculo estricto de aforo vehicular
var (
	ErrInvalidCapacity            = errors.New("la capacidad vehicular debe ser un entero estrictamente mayor a 0")
	ErrNegativePassengers         = errors.New("la cantidad de pasajeros, subidas o bajadas no puede ser negativa")
	ErrAlightingsExceedPassengers = errors.New("las bajadas no pueden superar la cantidad total de pasajeros en el vehículo")
)

// AforoCalculationInput representa la entrada para el cálculo estricto de aforo.
type AforoCalculationInput struct {
	Capacity          int `json:"capacity"`
	CurrentPassengers int `json:"currentPassengers"`
	Boardings         int `json:"boardings"`
	Alightings        int `json:"alightings"`
}

// AforoCalculationResult contiene los resultados del cálculo estricto de aforo.
type AforoCalculationResult struct {
	Capacity            int         `json:"capacity"`
	CurrentPassengers   int         `json:"currentPassengers"`
	OccupancyRatio      float64     `json:"occupancyRatio"`      // 0.0 - 1.0+
	OccupancyPercentage float64     `json:"occupancyPercentage"` // 0.0 - 100.0%+
	AvailableCapacity   int         `json:"availableCapacity"`   // Asientos/plazas libres (>= 0)
	ExcessPassengers    int         `json:"excessPassengers"`    // Pasajeros en exceso (> 0 si sobrecupo)
	IsFull              bool        `json:"isFull"`              // true si llegó al 100% o más
	IsOverCapacity      bool        `json:"isOverCapacity"`      // true si superó el 100%
	Status              AforoStatus `json:"status"`              // LOW | MEDIUM | HIGH | FULL | OVER_CAPACITY
	StatusText          string      `json:"statusText"`
	WarningMessage      string      `json:"warningMessage,omitempty"`
}

// AforoService gestiona el cálculo estricto y control de ocupación vehicular en tiempo real.
type AforoService struct {
	db *pgxpool.Pool
}

// NewAforoService inicializa el servicio de aforo. El parámetro pool es opcional si solo se usa para cálculo puro.
func NewAforoService(pool *pgxpool.Pool) *AforoService {
	return &AforoService{db: pool}
}

// CalculateStrictAforo ejecuta el cálculo estricto de aforo vehicular con validación de invariantes.
func (s *AforoService) CalculateStrictAforo(input AforoCalculationInput) (*AforoCalculationResult, error) {
	// 1. Invariante: Capacidad debe ser estrictamente positiva
	if input.Capacity <= 0 {
		return nil, ErrInvalidCapacity
	}

	// 2. Invariante: No se permiten valores negativos
	if input.CurrentPassengers < 0 || input.Boardings < 0 || input.Alightings < 0 {
		return nil, ErrNegativePassengers
	}

	// 3. Invariante: Bajadas no pueden superar los pasajeros disponibles a bordo + nuevas subidas
	totalAvailableOnBoard := input.CurrentPassengers + input.Boardings
	if input.Alightings > totalAvailableOnBoard {
		return nil, fmt.Errorf("%w: bajadas solicitadas (%d) > disponibles (%d)",
			ErrAlightingsExceedPassengers, input.Alightings, totalAvailableOnBoard)
	}

	// 4. Cálculo estricto del nuevo aforo
	newCount := totalAvailableOnBoard - input.Alightings

	// 5. Ratios y porcentajes con redondeo a 2 decimales
	ratio := float64(newCount) / float64(input.Capacity)
	percentage := math.Round(ratio*10000) / 100 // Redondeo a 2 decimales

	// 6. Plazas disponibles y exceso
	available := input.Capacity - newCount
	if available < 0 {
		available = 0
	}

	excess := newCount - input.Capacity
	if excess < 0 {
		excess = 0
	}

	isFull := newCount >= input.Capacity
	isOver := newCount > input.Capacity

	// 7. Clasificación estricta de estado
	status := classifyAforoStatus(percentage)
	statusText := getAforoStatusText(status)

	var warning string
	if isOver {
		warning = fmt.Sprintf("⚠️ ALERTA OPERACIONAL: Exceso de aforo de %d pasajeros sobre capacidad máxima legal (%d)", excess, input.Capacity)
	} else if isFull {
		warning = "Capacidad máxima completada. No se admiten nuevos ascensos."
	}

	return &AforoCalculationResult{
		Capacity:            input.Capacity,
		CurrentPassengers:   newCount,
		OccupancyRatio:      math.Round(ratio*1000) / 1000,
		OccupancyPercentage: percentage,
		AvailableCapacity:   available,
		ExcessPassengers:    excess,
		IsFull:              isFull,
		IsOverCapacity:      isOver,
		Status:              status,
		StatusText:          statusText,
		WarningMessage:      warning,
	}, nil
}

// CanAcceptBoarding evalúa si un microbús puede admitir una cantidad dada de pasajeros sin sobrecupo.
// Retorna si se acepta la totalidad y cuántos pueden abordar efectivamente.
func (s *AforoService) CanAcceptBoarding(currentPassengers, capacity, requested int) (bool, int, error) {
	if capacity <= 0 {
		return false, 0, ErrInvalidCapacity
	}
	if currentPassengers < 0 || requested < 0 {
		return false, 0, ErrNegativePassengers
	}

	available := capacity - currentPassengers
	if available <= 0 {
		return false, 0, nil
	}

	if requested <= available {
		return true, requested, nil
	}

	return false, available, nil
}

// ProcessBusFlow actualiza el aforo de un bus en la base de datos de manera atómica con control estricto.
func (s *AforoService) ProcessBusFlow(ctx context.Context, busID string, boardings, alightings, schoolBoardings int) (*AforoCalculationResult, error) {
	if s.db == nil {
		return nil, errors.New("conexión a base de datos no configurada en AforoService")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("error iniciando transacción: %w", err)
	}
	defer tx.Rollback(ctx)

	var capacity, currentPassengers, totalBoardings, totalAlightings, totalSchool int
	query := `
		SELECT capacity, "currentPassengers", boardings, alightings, "schoolBoardings"
		FROM buses
		WHERE id = $1
		FOR UPDATE
	`
	err = tx.QueryRow(ctx, query, busID).Scan(&capacity, &currentPassengers, &totalBoardings, &totalAlightings, &totalSchool)
	if err != nil {
		return nil, fmt.Errorf("bus no encontrado o no disponible: %w", err)
	}

	result, err := s.CalculateStrictAforo(AforoCalculationInput{
		Capacity:          capacity,
		CurrentPassengers: currentPassengers,
		Boardings:         boardings,
		Alightings:        alightings,
	})
	if err != nil {
		return nil, err
	}

	// Actualizar en base de datos
	updateQuery := `
		UPDATE buses
		SET "currentPassengers" = $1,
		    boardings = boardings + $2,
		    alightings = alightings + $3,
		    "schoolBoardings" = "schoolBoardings" + $4,
		    "updatedAt" = NOW()
		WHERE id = $5
	`
	_, err = tx.Exec(ctx, updateQuery, result.CurrentPassengers, boardings, alightings, schoolBoardings, busID)
	if err != nil {
		return nil, fmt.Errorf("error al actualizar aforo del bus: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("error comprometiendo transacción: %w", err)
	}

	return result, nil
}

// GetBusAforo consulta el aforo actual de un bus desde la base de datos.
func (s *AforoService) GetBusAforo(ctx context.Context, busID string) (*AforoCalculationResult, error) {
	if s.db == nil {
		return nil, errors.New("conexión a base de datos no configurada en AforoService")
	}

	var capacity, currentPassengers int
	query := `SELECT capacity, "currentPassengers" FROM buses WHERE id = $1`
	err := s.db.QueryRow(ctx, query, busID).Scan(&capacity, &currentPassengers)
	if err != nil {
		return nil, fmt.Errorf("bus no encontrado: %w", err)
	}

	return s.CalculateStrictAforo(AforoCalculationInput{
		Capacity:          capacity,
		CurrentPassengers: currentPassengers,
		Boardings:         0,
		Alightings:        0,
	})
}

func classifyAforoStatus(percentage float64) AforoStatus {
	switch {
	case percentage < 40.0:
		return AforoStatusLow
	case percentage < 70.0:
		return AforoStatusMedium
	case percentage < 90.0:
		return AforoStatusHigh
	case percentage <= 100.0:
		return AforoStatusFull
	default:
		return AforoStatusOverCapacity
	}
}

func getAforoStatusText(status AforoStatus) string {
	switch status {
	case AforoStatusLow:
		return "🟢 Baja Ocupación (Asientos disponibles)"
	case AforoStatusMedium:
		return "🟡 Ocupación Media"
	case AforoStatusHigh:
		return "🟠 Alta Ocupación (Próximo a capacidad)"
	case AforoStatusFull:
		return "🔴 Capacidad Completa"
	case AforoStatusOverCapacity:
		return "⛔ Sobrecupo Crítico (Capacidad excedida)"
	default:
		return "Desconocido"
	}
}
