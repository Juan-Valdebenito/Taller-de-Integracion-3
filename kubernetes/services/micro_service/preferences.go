package main

// Preferencias del pasajero para recomendar una ruta. Cada preferencia se
// traducirá después en pesos de la función de costo (cost.go).

import (
	"errors"
	"fmt"
	"strconv"
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

// Límites de la caminata máxima que el pasajero acepta, en metros. El máximo es
// el mismo de los transbordos a pie: la preferencia puede acortar la caminata,
// pero no alargarla más allá de lo que la red considera caminable.
const (
	minPreferredWalkMeters     = 100
	maxPreferredWalkMeters     = maxWalkDistanceMeters
	defaultPreferredWalkMeters = maxWalkDistanceMeters
)

// errInvalidMaxWalk indica una caminata máxima fuera de los límites.
var errInvalidMaxWalk = fmt.Errorf("max_walk_meters must be between %d and %d", minPreferredWalkMeters, maxPreferredWalkMeters)

// resolveMaxWalkMeters devuelve la caminata máxima que se usará. Cero significa
// que la petición no la indicó, y se usa el valor por defecto.
func resolveMaxWalkMeters(requestedMeters int) (int, error) {
	if requestedMeters == 0 {
		return defaultPreferredWalkMeters, nil
	}
	if requestedMeters < minPreferredWalkMeters || requestedMeters > maxPreferredWalkMeters {
		return 0, errInvalidMaxWalk
	}
	return requestedMeters, nil
}

// parseMaxWalkMeters lee la caminata máxima enviada como texto, por ejemplo en
// la URL. Un texto vacío significa que no se indicó. A diferencia de
// resolveMaxWalkMeters, un "0" escrito sí se envió, así que se rechaza.
func parseMaxWalkMeters(text string) (int, error) {
	trimmedText := strings.TrimSpace(text)
	if trimmedText == "" {
		return defaultPreferredWalkMeters, nil
	}
	requestedMeters, err := strconv.Atoi(trimmedText)
	if err != nil || requestedMeters == 0 {
		return 0, errInvalidMaxWalk
	}
	return resolveMaxWalkMeters(requestedMeters)
}
