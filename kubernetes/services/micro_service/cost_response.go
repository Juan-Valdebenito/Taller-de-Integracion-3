package main

// Formato del costo en las respuestas de la API.

import "math"

// costBreakdownResponse es el costo de una ruta en segundos equivalentes, por
// componente. Total es la suma de los demás.
type costBreakdownResponse struct {
	Ride     float64 `json:"ride"`
	Walk     float64 `json:"walk"`
	Wait     float64 `json:"wait"`
	Transfer float64 `json:"transfer"`
	// Crowding es el recargo por viajar en micros llenas.
	Crowding float64 `json:"crowding"`
	// Weather es el recargo por caminar con mal clima.
	Weather float64 `json:"weather"`
	Total   float64 `json:"total"`
}

func newCostBreakdownResponse(breakdown CostBreakdown) costBreakdownResponse {
	return costBreakdownResponse{
		Ride:     roundToTenth(breakdown.Ride),
		Walk:     roundToTenth(breakdown.Walk),
		Wait:     roundToTenth(breakdown.Wait),
		Transfer: roundToTenth(breakdown.Transfer),
		Crowding: roundToTenth(breakdown.Crowding),
		Weather:  roundToTenth(breakdown.Weather),
		Total:    roundToTenth(breakdown.Total),
	}
}

// costWeightsResponse informa con qué pesos se calcularon los costos, para que
// quien use la API sepa cómo interpretarlos.
type costWeightsResponse struct {
	RideWeight             float64 `json:"ride_weight"`
	WalkWeight             float64 `json:"walk_weight"`
	WaitWeight             float64 `json:"wait_weight"`
	TransferPenaltySeconds float64 `json:"transfer_penalty_seconds"`
	// AssumedHeadwaySeconds es el intervalo supuesto entre micros de las líneas
	// sin frecuencia conocida. La espera de esas líneas es una estimación.
	AssumedHeadwaySeconds int `json:"assumed_headway_seconds"`
}

func newCostWeightsResponse(weights CostWeights) costWeightsResponse {
	return costWeightsResponse{
		RideWeight:             weights.RideWeight,
		WalkWeight:             weights.WalkWeight,
		WaitWeight:             weights.WaitWeight,
		TransferPenaltySeconds: weights.TransferPenaltySeconds,
		AssumedHeadwaySeconds:  defaultHeadwaySeconds,
	}
}

// roundToTenth redondea a un decimal. Las operaciones con decimales dejan
// diferencias mínimas, como 1140.0000000002, que no aportan nada a la app.
func roundToTenth(value float64) float64 {
	return math.Round(value*10) / 10
}
