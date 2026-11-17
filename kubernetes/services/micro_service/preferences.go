package main

// Preferencias del pasajero para recomendar una ruta. Cada preferencia se
// traducirá después en pesos de la función de costo (cost.go).

import (
	"errors"
	"strings"
)

// RoutePriority es lo que el pasajero quiere priorizar al elegir una ruta.
type RoutePriority string

const (
	// priorityBalanced usa los pesos de siempre: equilibra tiempo, caminata,
	// espera y transbordos.
	priorityBalanced RoutePriority = "balanced"
	// priorityFastest prioriza llegar en el menor tiempo.
	priorityFastest RoutePriority = "fastest"
	// priorityFewestTransfers prioriza cambiar de línea la menor cantidad de veces.
	priorityFewestTransfers RoutePriority = "fewest_transfers"
	// priorityLeastWalking prioriza caminar lo menos posible.
	priorityLeastWalking RoutePriority = "least_walking"
)

// defaultRoutePriority se usa cuando la petición no indica una prioridad.
const defaultRoutePriority = priorityBalanced

// errInvalidRoutePriority indica una prioridad que no existe.
var errInvalidRoutePriority = errors.New("priority must be balanced, fastest, fewest_transfers or least_walking")

// routePriorities lista todas las prioridades aceptadas, en el mismo orden del
// mensaje de error.
func routePriorities() []RoutePriority {
	return []RoutePriority{priorityBalanced, priorityFastest, priorityFewestTransfers, priorityLeastWalking}
}

// parseRoutePriority lee la prioridad enviada en la petición. Ignora mayúsculas y
// espacios, y un texto vacío significa la prioridad por defecto.
func parseRoutePriority(text string) (RoutePriority, error) {
	requestedPriority := RoutePriority(strings.ToLower(strings.TrimSpace(text)))
	if requestedPriority == "" {
		return defaultRoutePriority, nil
	}
	for _, priority := range routePriorities() {
		if requestedPriority == priority {
			return priority, nil
		}
	}
	return "", errInvalidRoutePriority
}
