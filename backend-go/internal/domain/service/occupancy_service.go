package service

import (
	"math"
	"math/rand"
	"time"
)

// ── Tipos de ocupación ────────────────────────────────────────────────────────

// OccupancyLevel clasifica el nivel de ocupación de un bus.
type OccupancyLevel string

const (
	OccupancyLow    OccupancyLevel = "LOW"    // < 40 %
	OccupancyMedium OccupancyLevel = "MEDIUM" // 40–70 %
	OccupancyHigh   OccupancyLevel = "HIGH"   // 70–90 %
	OccupancyFull   OccupancyLevel = "FULL"   // > 90 %
)

// ── Contratos (gancho para Opción B/C) ───────────────────────────────────────

// OccupancyInput es la entrada para cualquier predictor de ocupación.
type OccupancyInput struct {
	CurrentPassengers int     // Pasajeros actuales en el bus
	Capacity          int     // Capacidad máxima
	RouteID           string  // ID de la ruta (usado por el predictor ML)
	Hour              *int    // Hora del día 0–23 (nil → hora actual del sistema)
	DayOfWeek         *int    // Día de la semana 0=Dom…6=Sáb (nil → hoy)
}

// OccupancyResult contiene la predicción de ocupación y su metadata.
type OccupancyResult struct {
	CurrentRatio           float64        `json:"currentRatio"`           // Ratio actual 0.0–1.0
	CurrentPassengers      int            `json:"currentPassengers"`      // Pasajeros actuales
	PredictedRatio         float64        `json:"predictedRatio"`         // Ratio proyectado 0.0–1.0
	PredictedPassengers    int            `json:"predictedPassengers"`    // Pasajeros proyectados
	OccupancyLevel         OccupancyLevel `json:"occupancyLevel"`         // LOW | MEDIUM | HIGH | FULL
	OccupancyText          string         `json:"occupancyText"`          // Texto legible con emoji
	OccupancyColor         string         `json:"occupancyColor"`         // Color hex para el frontend
	Confidence             float64        `json:"confidence"`             // Confianza 0.0–1.0
	IsSimulated            bool           `json:"isSimulated"`            // true = heurístico; false = modelo ML
	PredictorName          string         `json:"predictorName"`          // Nombre del predictor activo
	PredictedAt            string         `json:"predictedAt"`            // ISO timestamp
}

// OccupancyPredictor es la interfaz que cualquier predictor debe implementar.
//
// Punto de migración al clúster ML (Opción C):
// Crear MLClusterPredictor que implemente esta interfaz y delegar en
// OccupancyService.SetPredictor(mlPredictor).
// El handler y el router no cambian.
type OccupancyPredictor interface {
	Predict(input OccupancyInput) (OccupancyResult, error)
	Name() string
}

// ── Servicio principal ────────────────────────────────────────────────────────

// OccupancyService orquesta la predicción de ocupación.
// Delega en el predictor activo; si no hay uno configurado usa HeuristicPredictor.
type OccupancyService struct {
	predictor OccupancyPredictor
}

// NewOccupancyService crea el servicio con el predictor heurístico por defecto.
func NewOccupancyService() *OccupancyService {
	return &OccupancyService{
		predictor: &HeuristicPredictor{},
	}
}

// SetPredictor reemplaza el predictor activo en caliente.
// Úsalo cuando conectes el clúster ML:
//   svc.SetPredictor(NewMLClusterPredictor(clusterURL, apiKey))
func (s *OccupancyService) SetPredictor(p OccupancyPredictor) {
	s.predictor = p
}

// Predict ejecuta la predicción usando el predictor activo.
func (s *OccupancyService) Predict(input OccupancyInput) (OccupancyResult, error) {
	return s.predictor.Predict(input)
}

// ── Predictor heurístico (Opción A) ──────────────────────────────────────────

// HeuristicPredictor implementa OccupancyPredictor con lógica de franjas horarias
// y factores por día de semana — sin necesidad de BD ni clúster externo.
type HeuristicPredictor struct{}

func (p *HeuristicPredictor) Name() string { return "heuristic-v1" }

// peakHour define una franja horaria punta con su multiplicador.
type peakHour struct {
	start      int
	end        int
	multiplier float64
}

// Franjas horarias punta en Chile (hora local).
var peakHours = []peakHour{
	{7, 9, 1.30},   // Mañana
	{12, 14, 1.15}, // Mediodía
	{17, 19, 1.35}, // Tarde (hora punta principal)
}

// Multiplicador por día de la semana (0=Dom … 6=Sáb).
var dayMultipliers = map[int]float64{
	0: 0.65, // Domingo
	1: 1.00, // Lunes
	2: 1.00, // Martes
	3: 0.95, // Miércoles
	4: 1.00, // Jueves
	5: 0.90, // Viernes
	6: 0.60, // Sábado
}

const (
	noiseFactor         = 0.08  // Variación aleatoria máxima ±8 %
	simulatedConfidence = 0.75  // Confianza base mientras no hay modelo ML
)

// Predict calcula el nivel de ocupación proyectado para el próximo tramo.
func (p *HeuristicPredictor) Predict(input OccupancyInput) (OccupancyResult, error) {
	now := time.Now()

	hour := now.Hour()
	if input.Hour != nil {
		hour = *input.Hour
	}

	dow := int(now.Weekday())
	if input.DayOfWeek != nil {
		dow = *input.DayOfWeek
	}

	// Ratio actual
	currentRatio := float64(input.CurrentPassengers) / float64(input.Capacity)

	// Multiplicador por hora punta
	peakMultiplier := peakHourMultiplier(hour, dow)

	// Ruido aleatorio ±noiseFactor para simular incertidumbre del modelo
	noise := 1 + (rand.Float64()*2-1)*noiseFactor

	// Ratio predicho, acotado a [0, 1]
	predictedRatio := math.Min(1.0, math.Max(0.0, currentRatio*peakMultiplier*noise))
	predictedRatio = math.Round(predictedRatio*1000) / 1000

	predictedPassengers := int(math.Round(predictedRatio * float64(input.Capacity)))

	level := classifyLevel(predictedRatio)

	return OccupancyResult{
		CurrentRatio:        math.Round(currentRatio*1000) / 1000,
		CurrentPassengers:   input.CurrentPassengers,
		PredictedRatio:      predictedRatio,
		PredictedPassengers: predictedPassengers,
		OccupancyLevel:      level,
		OccupancyText:       levelText(level),
		OccupancyColor:      levelColor(level),
		Confidence:          simulatedConfidence,
		IsSimulated:         true,
		PredictorName:       p.Name(),
		PredictedAt:         now.UTC().Format(time.RFC3339),
	}, nil
}

// ── Helpers internos ──────────────────────────────────────────────────────────

func peakHourMultiplier(hour, dow int) float64 {
	dayMult, ok := dayMultipliers[dow]
	if !ok {
		dayMult = 1.0
	}

	hourMult := 1.0
	for _, ph := range peakHours {
		if hour >= ph.start && hour < ph.end {
			hourMult = ph.multiplier
			break
		}
	}

	return dayMult * hourMult
}

func classifyLevel(ratio float64) OccupancyLevel {
	switch {
	case ratio < 0.4:
		return OccupancyLow
	case ratio < 0.7:
		return OccupancyMedium
	case ratio < 0.9:
		return OccupancyHigh
	default:
		return OccupancyFull
	}
}

func levelText(level OccupancyLevel) string {
	switch level {
	case OccupancyLow:
		return "🟢 Disponible"
	case OccupancyMedium:
		return "🟡 Moderado"
	case OccupancyHigh:
		return "🔴 Muy ocupado"
	default:
		return "⛔ Lleno"
	}
}

func levelColor(level OccupancyLevel) string {
	switch level {
	case OccupancyLow:
		return "#22c55e"
	case OccupancyMedium:
		return "#f59e0b"
	case OccupancyHigh:
		return "#ef4444"
	default:
		return "#7f1d1d"
	}
}
