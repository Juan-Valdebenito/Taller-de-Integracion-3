package main

// Rutas alternativas por costo, con el algoritmo de Yen. A diferencia de la
// versión por tiempo, cada desviación parte desde la situación del pasajero en
// ese paradero: si venía arriba de una micro, seguir en ella no cuesta espera.

import (
	"fmt"
	"sort"
	"strings"
)

// maxRankedPathsPerAlternative limita cuántas rutas revisa Yen por cada
// alternativa pedida. Varias pueden ser el mismo recorrido en otra línea y se
// descartan, así que Yen necesita revisar más rutas de las que se entregan.
const maxRankedPathsPerAlternative = 10

// cheapestAlternativePaths entrega hasta limit rutas distintas para el pasajero,
// de menor a mayor costo. De cada recorrido conserva la variante más barata.
func cheapestAlternativePaths(graph *TransitGraph, from, to string, limit int, weights CostWeights) [][]pathStep {
	if limit <= 0 || from == to {
		return nil
	}
	rankedPaths := costYenPaths(withoutLongWalks(graph), from, to, limit*maxRankedPathsPerAlternative, weights)
	alternatives := make([][]pathStep, 0, limit)
	knownSequences := make(map[string]bool)
	for _, path := range rankedPaths {
		sequenceKey := connectionSequenceKey(path)
		if knownSequences[sequenceKey] {
			continue
		}
		knownSequences[sequenceKey] = true
		alternatives = append(alternatives, path)
		if len(alternatives) == limit {
			break
		}
	}
	return alternatives
}

// costYenPaths entrega hasta limit rutas sin paraderos repetidos en sus inicios,
// de menor a mayor costo. La primera es siempre la más barata.
func costYenPaths(graph *TransitGraph, from, to string, limit int, weights CostWeights) [][]pathStep {
	if limit <= 0 || from == to {
		return nil
	}
	cheapest := searchCheapestPathFrom(graph, costSearchState{StopID: from}, to, weights, aStarCostEstimate(graph, to, weights))
	if !cheapest.Found {
		return nil
	}
	paths := [][]pathStep{cheapest.Path}
	knownPaths := map[string]bool{pathKey(cheapest.Path): true}
	candidates := make([][]pathStep, 0)

	for len(paths) < limit {
		lastPath := paths[len(paths)-1]
		for spurIndex := range lastPath {
			rootPath := lastPath[:spurIndex]
			searchGraph := restrictedGraph(graph, blockedEdges(paths, rootPath), rootStops(rootPath))
			spurStart := costSearchState{StopID: lastPath[spurIndex].From, Ride: rideStateAfter(rootPath)}
			spur := searchCheapestPathFrom(searchGraph, spurStart, to, weights, aStarCostEstimate(searchGraph, to, weights))
			if !spur.Found {
				continue
			}
			candidate := append(append([]pathStep{}, rootPath...), spur.Path...)
			if candidateKey := pathKey(candidate); !knownPaths[candidateKey] {
				knownPaths[candidateKey] = true
				candidates = append(candidates, candidate)
			}
		}
		if len(candidates) == 0 {
			break
		}
		sortPathsByCost(candidates, weights)
		paths = append(paths, candidates[0])
		candidates = candidates[1:]
	}
	return paths
}

// rideStateAfter es la situación del pasajero al terminar los tramos indicados.
func rideStateAfter(path []pathStep) rideState {
	var state rideState
	for _, step := range path {
		state = state.after(step.Edge)
	}
	return state
}

// withoutLongWalks quita las caminatas que superan el máximo de un transbordo.
func withoutLongWalks(graph *TransitGraph) *TransitGraph {
	filtered := &TransitGraph{Stops: graph.Stops, Edges: make(map[string][]Edge, len(graph.Edges))}
	for fromStopID, edges := range graph.Edges {
		for _, edge := range edges {
			if edge.RouteID == walkRouteID && edge.DistanceM > maxWalkDistanceMeters {
				continue
			}
			filtered.Edges[fromStopID] = append(filtered.Edges[fromStopID], edge)
		}
	}
	return filtered
}

// connectionSequenceKey describe la ruta como la ve el pasajero: paraderos y
// modo de cada tramo, sin importar la línea.
func connectionSequenceKey(path []pathStep) string {
	var key strings.Builder
	for _, step := range path {
		fmt.Fprintf(&key, "%s>%+v|", step.From, connectionKeyOf(step.Edge))
	}
	return key.String()
}

// sortPathsByCost ordena por costo. Los empates se resuelven por la clave de la
// ruta para que el resultado sea siempre el mismo.
func sortPathsByCost(paths [][]pathStep, weights CostWeights) {
	sort.Slice(paths, func(firstIndex, secondIndex int) bool {
		firstCost, secondCost := pathCost(paths[firstIndex], weights), pathCost(paths[secondIndex], weights)
		if firstCost != secondCost {
			return firstCost < secondCost
		}
		return pathKey(paths[firstIndex]) < pathKey(paths[secondIndex])
	})
}
