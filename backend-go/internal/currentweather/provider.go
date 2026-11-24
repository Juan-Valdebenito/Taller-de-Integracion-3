// Package currentweather obtiene el clima actual de Temuco desde clima_service.
// Las rutas a la universidad lo usan para encarecer las caminatas con mal clima.
package currentweather

import (
	"context"
	"time"

	climav1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/clima/v1"
)

const (
	// recentWindow es cuánto hacia atrás se buscan lecturas. Una estación sin datos
	// más recientes no cuenta.
	recentWindow = 30 * time.Minute
	// maxRecords limita la consulta. Con 4 estaciones que informan cada 10-15 s,
	// alcanza para los últimos 30 minutos.
	maxRecords = 1000
)

// Conditions es el clima de la ciudad: el promedio de las estaciones.
type Conditions struct {
	TemperatureC float64
	WindSpeedKmh float64
	PM25         float64
}

// TelemetryLister lo implementa el cliente gRPC de clima_service.
type TelemetryLister interface {
	ListTelemetry(ctx context.Context, from, to time.Time, stationID string, limit int) (*climav1.ListTelemetryResponse, error)
}

// Provider consulta el clima actual a clima_service.
type Provider struct {
	climate TelemetryLister
	now     func() time.Time
}

func NewProvider(climate TelemetryLister) *Provider {
	return &Provider{climate: climate, now: time.Now}
}

// Fetch entrega el clima actual. Devuelve nil, sin error, si no hay lecturas
// recientes: las rutas se calculan sin clima.
func (provider *Provider) Fetch(requestContext context.Context) (*Conditions, error) {
	to := provider.now()
	response, err := provider.climate.ListTelemetry(requestContext, to.Add(-recentWindow), to, "", maxRecords)
	if err != nil {
		return nil, err
	}
	return cityConditions(response.GetRecords()), nil
}

// cityConditions toma la última lectura de cada estación y promedia. Así una
// estación que informa más seguido no pesa más que otra.
func cityConditions(records []*climav1.TelemetryRecord) *Conditions {
	latestByStation := make(map[string]*climav1.TelemetryRecord)
	for _, record := range records {
		stationID := record.GetStationId()
		latest, seen := latestByStation[stationID]
		if !seen || record.GetTime().AsTime().After(latest.GetTime().AsTime()) {
			latestByStation[stationID] = record
		}
	}
	if len(latestByStation) == 0 {
		return nil
	}
	var totals Conditions
	for _, record := range latestByStation {
		totals.TemperatureC += record.GetTemperatureC()
		totals.WindSpeedKmh += record.GetWindSpeedKmh()
		totals.PM25 += record.GetPm25UgM3()
	}
	stationCount := float64(len(latestByStation))
	return &Conditions{
		TemperatureC: totals.TemperatureC / stationCount,
		WindSpeedKmh: totals.WindSpeedKmh / stationCount,
		PM25:         totals.PM25 / stationCount,
	}
}
