package handler

import (
	"sort"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/currentweather"
)

// Rangos que acepta micro_service (university_http.go). Si un dato en vivo quedara
// fuera, micro_service rechazaría la petición completa, y la app recibiría un error
// por algo que no envió. Es mejor calcular la ruta sin ese dato.
const (
	maxAcceptedOccupancy      = 2.0
	maxAcceptedOccupancyLines = 50
	minAcceptedTemperatureC   = -50.0
	maxAcceptedTemperatureC   = 60.0
	maxAcceptedWindSpeedKmh   = 300.0
	maxAcceptedPM25           = 1000.0
)

// acceptedOccupancy descarta las ocupaciones imposibles, como una micro con más del
// doble de su capacidad, y conserva las demás líneas. Si hubiera demasiadas líneas,
// conserva siempre las mismas. Las comparaciones están escritas en positivo para
// descartar también NaN.
func acceptedOccupancy(occupancy map[string]float64) map[string]float64 {
	lineIDs := make([]string, 0, len(occupancy))
	for lineID, occupancyRatio := range occupancy {
		if lineID != "" && occupancyRatio >= 0 && occupancyRatio <= maxAcceptedOccupancy {
			lineIDs = append(lineIDs, lineID)
		}
	}
	sort.Strings(lineIDs)
	if len(lineIDs) > maxAcceptedOccupancyLines {
		lineIDs = lineIDs[:maxAcceptedOccupancyLines]
	}
	accepted := make(map[string]float64, len(lineIDs))
	for _, lineID := range lineIDs {
		accepted[lineID] = occupancy[lineID]
	}
	return accepted
}

// isAcceptedWeather indica si el clima completo es posible. Un solo valor imposible
// hace dudar de la medición, así que no se usa a medias.
func isAcceptedWeather(conditions *currentweather.Conditions) bool {
	return conditions.TemperatureC >= minAcceptedTemperatureC && conditions.TemperatureC <= maxAcceptedTemperatureC &&
		conditions.WindSpeedKmh >= 0 && conditions.WindSpeedKmh <= maxAcceptedWindSpeedKmh &&
		conditions.PM25 >= 0 && conditions.PM25 <= maxAcceptedPM25
}
