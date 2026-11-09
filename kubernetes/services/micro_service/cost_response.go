package main

// Formato del costo en las respuestas de la API.

import "math"

// costBreakdownResponse es el costo de una ruta en segundos equivalentes, por
// componente. Total es la suma de los otros cuatro.
type costBreakdownResponse struct {
	Ride     float64 `json:"ride"`
	Walk     float64 `json:"walk"`
	Wait     float64 `json:"wait"`
	Transfer float64 `json:"transfer"`
	Total    float64 `json:"total"`
}

func newCostBreakdownResponse(breakdown CostBreakdown) costBreakdownResponse {
	return costBreakdownResponse{
		Ride:     roundToTenth(breakdown.Ride),
		Walk:     roundToTenth(breakdown.Walk),
		Wait:     roundToTenth(breakdown.Wait),
		Transfer: roundToTenth(breakdown.Transfer),
		Total:    roundToTenth(breakdown.Total),
	}
}

// roundToTenth redondea a un decimal. Las operaciones con decimales dejan
// diferencias mínimas, como 1140.0000000002, que no aportan nada a la app.
func roundToTenth(value float64) float64 {
	return math.Round(value*10) / 10
}
