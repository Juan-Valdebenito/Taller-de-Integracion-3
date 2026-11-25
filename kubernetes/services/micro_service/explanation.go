package main

// Explicación de una ruta recomendada, en una frase para el pasajero. Por ejemplo:
// "1C tarda 20 min, más unos 5 min de espera, y requiere caminar 4 cuadras."

import (
	"fmt"
	"math"
	"strings"
)

// metersPerBlock es el largo de una cuadra: una medida habitual en Chile, no la de
// cada calle.
const metersPerBlock = 100.0

// routeSummary es lo que se necesita para explicar una ruta.
type routeSummary struct {
	// lineNames son las líneas en orden, sin repetir la misma seguida.
	lineNames   []string
	waitSeconds int
	walkMeters  int
	// fullLineNames son las líneas usadas que van llenas en esta consulta.
	fullLineNames []string
}

func summarizeRoute(path []pathStep, weights CostWeights) routeSummary {
	summary := routeSummary{}
	passenger := rideState{}
	for _, step := range path {
		if step.Edge.RouteID == walkRouteID {
			summary.walkMeters += step.Edge.DistanceM
		} else if needsBoarding(passenger, step.Edge) {
			summary.waitSeconds += weights.waitSeconds(step.Edge.RouteID)
			lineName := passengerLineName(step.Edge.RouteID)
			if lineCount := len(summary.lineNames); lineCount == 0 || summary.lineNames[lineCount-1] != lineName {
				summary.lineNames = append(summary.lineNames, lineName)
			}
			if weights.Occupancy.factorFor(step.Edge.RouteID) >= fullCrowdingFactor && !containsText(summary.fullLineNames, lineName) {
				summary.fullLineNames = append(summary.fullLineNames, lineName)
			}
		}
		passenger = passenger.after(step.Edge)
	}
	return summary
}

// explainRoute arma la explicación. weights deben ser los de la consulta: de ellos
// salen la ocupación y el clima, y si el pasajero no quiso evitar micros llenas, la
// ocupación no se menciona.
func explainRoute(path []pathStep, weights CostWeights) string {
	if len(path) == 0 {
		return ""
	}
	summary := summarizeRoute(path, weights)
	duration := describeDuration(pathTotalSeconds(path))
	var sentences []string
	if len(summary.lineNames) == 0 {
		sentences = append(sentences, fmt.Sprintf("A pie tarda %s: %s.", duration, describeBlocks(summary.walkMeters)))
	} else {
		sentences = append(sentences, explainBusRoute(summary, duration, countTransfers(path)))
	}
	for _, lineName := range summary.fullLineNames {
		sentences = append(sentences, fmt.Sprintf("La %s va llena.", lineName))
	}
	if summary.walkMeters > 0 && walkWeatherFactor(weights.Weather) > 1 {
		sentences = append(sentences, "El clima hace menos cómodo caminar.")
	}
	return strings.Join(sentences, " ")
}

func explainBusRoute(summary routeSummary, duration string, transfers int) string {
	takesVerb, requiresVerb := "tarda", "requiere"
	if len(summary.lineNames) > 1 {
		takesVerb, requiresVerb = "tardan", "requieren"
	}
	sentence := fmt.Sprintf("%s %s %s, más unos %s de espera",
		strings.Join(summary.lineNames, " y después "), takesVerb, duration, describeDuration(summary.waitSeconds))
	switch {
	case transfers == 1:
		sentence += ", con 1 transbordo"
	case transfers > 1:
		sentence += fmt.Sprintf(", con %d transbordos", transfers)
	}
	if summary.walkMeters == 0 {
		return sentence + ", y no " + requiresVerb + " caminar."
	}
	return sentence + ", y " + requiresVerb + " caminar " + describeBlocks(summary.walkMeters) + "."
}

// passengerLineName es el nombre que ve el pasajero: "1C" para la línea "L1C".
func passengerLineName(routeID string) string {
	return strings.TrimPrefix(routeID, "L")
}

// describeDuration redondea hacia arriba: es mejor que el pasajero llegue antes de
// lo que espera.
func describeDuration(seconds int) string {
	minutes := int(math.Ceil(float64(seconds) / 60))
	if minutes < 1 {
		minutes = 1
	}
	if minutes < 60 {
		return fmt.Sprintf("%d min", minutes)
	}
	if minutes%60 == 0 {
		return fmt.Sprintf("%d h", minutes/60)
	}
	return fmt.Sprintf("%d h %d min", minutes/60, minutes%60)
}

func describeBlocks(meters int) string {
	blocks := int(math.Round(float64(meters) / metersPerBlock))
	switch blocks {
	case 0:
		return "menos de 1 cuadra"
	case 1:
		return "1 cuadra"
	default:
		return fmt.Sprintf("%d cuadras", blocks)
	}
}

func containsText(texts []string, wantedText string) bool {
	for _, text := range texts {
		if text == wantedText {
			return true
		}
	}
	return false
}
