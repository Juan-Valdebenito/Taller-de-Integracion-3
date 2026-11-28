// Package occupancyforecast pide al modelo de ocupación (services/prediction_service)
// qué tan llena irá cada línea en 15 minutos, para que las rutas recomendadas
// usen esa predicción en vez de la ocupación de este momento.
package occupancyforecast

import (
	"context"
	"sync"
	"time"
	// La imagen de backend-go no trae zonas horarias: sin esto, la hora sería UTC y
	// el modelo vería las horas punta corridas.
	_ "time/tzdata"

	"github.com/rs/zerolog/log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
)

const (
	// RefreshInterval es cada cuánto se piden predicciones nuevas.
	RefreshInterval = 30 * time.Second
	// maxForecastAge es cuánto vale una predicción. Si el modelo deja de responder,
	// después de este tiempo se vuelve a la ocupación actual.
	maxForecastAge = 2 * time.Minute
	// maxForecastLines es el mismo límite de líneas que acepta micro_service.
	maxForecastLines  = 50
	passengerTimeZone = "America/Santiago"
)

// Predictor lo implementa service.MLRemotePredictor.
type Predictor interface {
	Predict(input service.OccupancyInput) (service.OccupancyResult, error)
}

// LiveOccupancy lo implementa liveoccupancy.Tracker.
type LiveOccupancy interface {
	FreshReadings() []liveoccupancy.BusReading
	LineOccupancyBy(lineKey func(routeID string) (string, bool)) map[string]float64
}

type lineForecast struct {
	ratio       float64
	predictedAt time.Time
}

// Forecaster guarda la última predicción de cada línea. Es seguro usarlo desde
// varias goroutines.
type Forecaster struct {
	live      LiveOccupancy
	predictor Predictor
	lineKey   func(routeID string) (string, bool)
	location  *time.Location
	now       func() time.Time
	mutex     sync.Mutex
	forecasts map[string]lineForecast
	isFailing bool
}

// New crea el pronóstico. lineKey traduce el ID de ruta de backend-go a la línea
// de micro_service, el mismo que usa el handler de rutas.
func New(live LiveOccupancy, predictor Predictor, lineKey func(routeID string) (string, bool)) *Forecaster {
	location, err := time.LoadLocation(passengerTimeZone)
	if err != nil {
		location = time.UTC
	}
	return &Forecaster{
		live: live, predictor: predictor, lineKey: lineKey, location: location,
		now: time.Now, forecasts: make(map[string]lineForecast),
	}
}

// Run actualiza las predicciones hasta que se cancela el contexto.
func (forecaster *Forecaster) Run(runContext context.Context) {
	ticker := time.NewTicker(RefreshInterval)
	defer ticker.Stop()
	for {
		forecaster.Refresh()
		select {
		case <-runContext.Done():
			return
		case <-ticker.C:
		}
	}
}

// Refresh suma los pasajeros y la capacidad de las micros de cada línea y le pide
// al modelo su ocupación en 15 minutos. Una línea sin respuesta conserva su
// predicción anterior mientras no venza.
func (forecaster *Forecaster) Refresh() {
	passengersByLine, capacityByLine := map[string]int{}, map[string]int{}
	for _, reading := range forecaster.live.FreshReadings() {
		lineID, known := forecaster.lineKey(reading.RouteID)
		if !known || (len(capacityByLine) >= maxForecastLines && capacityByLine[lineID] == 0) {
			continue
		}
		passengersByLine[lineID] += reading.CurrentPassengers
		capacityByLine[lineID] += reading.Capacity
	}
	localTime := forecaster.now().In(forecaster.location)
	hour, dayOfWeek := localTime.Hour(), int(localTime.Weekday())
	predicted, failed := make(map[string]lineForecast, len(capacityByLine)), 0
	for lineID, capacity := range capacityByLine {
		result, err := forecaster.predictor.Predict(service.OccupancyInput{
			CurrentPassengers: passengersByLine[lineID], Capacity: capacity, RouteID: lineID, Hour: &hour, DayOfWeek: &dayOfWeek,
		})
		// La comparación en positivo descarta también NaN.
		if err != nil || !(result.PredictedRatio >= 0 && result.PredictedRatio <= 2) {
			failed++
			continue
		}
		predicted[lineID] = lineForecast{ratio: result.PredictedRatio, predictedAt: forecaster.now()}
	}
	forecaster.store(predicted, failed > 0 && len(predicted) == 0)
}

func (forecaster *Forecaster) store(predicted map[string]lineForecast, isFailing bool) {
	forecaster.mutex.Lock()
	defer forecaster.mutex.Unlock()
	for lineID, forecast := range predicted {
		forecaster.forecasts[lineID] = forecast
	}
	for lineID, forecast := range forecaster.forecasts {
		if forecaster.now().Sub(forecast.predictedAt) > maxForecastAge {
			delete(forecaster.forecasts, lineID)
		}
	}
	// Solo se registra el cambio: un aviso cada 30 segundos taparía los demás logs.
	if isFailing && !forecaster.isFailing {
		log.Warn().Str("event", "occupancy_forecast_failed").Msg("Occupancy model did not answer; routes use the current occupancy")
	} else if !isFailing && forecaster.isFailing {
		log.Info().Str("event", "occupancy_forecast_recovered").Msg("Occupancy model is answering again")
	}
	forecaster.isFailing = isFailing
}

// LineOccupancyBy entrega la ocupación de cada línea con micros en vivo: la
// predicha si hay una vigente, y si no la actual. Cumple la misma interfaz que
// liveoccupancy.Tracker, así el handler de rutas no cambia.
func (forecaster *Forecaster) LineOccupancyBy(lineKey func(routeID string) (string, bool)) map[string]float64 {
	occupancy := forecaster.live.LineOccupancyBy(lineKey)
	forecaster.mutex.Lock()
	defer forecaster.mutex.Unlock()
	for lineID := range occupancy {
		if forecast, found := forecaster.forecasts[lineID]; found && forecaster.now().Sub(forecast.predictedAt) <= maxForecastAge {
			occupancy[lineID] = forecast.ratio
		}
	}
	return occupancy
}
