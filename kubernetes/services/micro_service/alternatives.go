package main

// Rutas alternativas con el algoritmo de Yen. A partir de la mejor ruta, Yen
// prueba desviarse en cada paradero: bloquea el tramo ya usado y busca otro
// camino al destino. La mejor desviación pasa a ser la siguiente alternativa.

import (
	"fmt"
	"sort"
	"strings"
)

// maxWalkDistanceMeters es la caminata máxima de un transbordo (MODELO_GRAFO.md).
const maxWalkDistanceMeters = 1000

// edgeKey identifica una arista: entre dos paraderos puede haber varias líneas.
type edgeKey struct {
	FromStopID, ToStopID, RouteID, TripID string
}

func edgeKeyOf(step pathStep) edgeKey {
	return edgeKey{FromStopID: step.From, ToStopID: step.Edge.ToStopID, RouteID: step.Edge.RouteID, TripID: step.Edge.TripID}
}

func pathKey(path []pathStep) string {
	var key strings.Builder
	for _, step := range path {
		fmt.Fprintf(&key, "%+v|", edgeKeyOf(step))
	}
	return key.String()
}

// alternativePaths entrega hasta limit rutas realmente distintas para el pasajero.
// Yen trabaja sobre un grafo con una sola arista por conexión, porque con varias
// líneas en un tramo compartido entregaría la misma ruta con otra línea. Después se
// eligen las líneas que evitan cambios innecesarios.
func alternativePaths(graph *TransitGraph, from, to string, limit int) [][]pathStep {
	paths := yenPaths(distinctConnectionGraph(graph), from, to, limit)
	for pathIndex, path := range paths {
		paths[pathIndex] = assignFewestTransfers(graph, path)
	}
	return paths
}

// yenPaths entrega hasta limit rutas sin paraderos repetidos, de menor a mayor
// tiempo. La primera es siempre la ruta más rápida.
func yenPaths(graph *TransitGraph, from, to string, limit int) [][]pathStep {
	if limit <= 0 || from == to {
		return nil
	}
	bestPath, found := aStarPath(graph, from, to)
	if !found {
		return nil
	}
	paths := [][]pathStep{bestPath}
	knownPaths := map[string]bool{pathKey(bestPath): true}
	candidates := make([][]pathStep, 0)

	for len(paths) < limit {
		lastPath := paths[len(paths)-1]
		for spurIndex := range lastPath {
			rootPath := lastPath[:spurIndex]
			spurStopID := lastPath[spurIndex].From
			searchGraph := restrictedGraph(graph, blockedEdges(paths, rootPath), rootStops(rootPath))
			spurPath, spurFound := aStarPath(searchGraph, spurStopID, to)
			if !spurFound {
				continue
			}
			candidate := append(append([]pathStep{}, rootPath...), spurPath...)
			candidateKey := pathKey(candidate)
			if !knownPaths[candidateKey] {
				knownPaths[candidateKey] = true
				candidates = append(candidates, candidate)
			}
		}
		if len(candidates) == 0 {
			break
		}
		sortPathsByTime(candidates)
		paths = append(paths, candidates[0])
		candidates = candidates[1:]
	}
	return paths
}

// blockedEdges son los tramos que ya usaron las rutas con este mismo inicio.
// Bloquearlos obliga a la búsqueda a tomar un camino nuevo desde ese paradero.
func blockedEdges(paths [][]pathStep, rootPath []pathStep) map[edgeKey]bool {
	blocked := make(map[edgeKey]bool)
	rootKey := pathKey(rootPath)
	for _, path := range paths {
		if len(path) > len(rootPath) && pathKey(path[:len(rootPath)]) == rootKey {
			blocked[edgeKeyOf(path[len(rootPath)])] = true
		}
	}
	return blocked
}

// rootStops son los paraderos ya recorridos. Se bloquean para no volver a pasar
// por ellos.
func rootStops(rootPath []pathStep) map[string]bool {
	stops := make(map[string]bool, len(rootPath))
	for _, step := range rootPath {
		stops[step.From] = true
	}
	return stops
}

// restrictedGraph copia las aristas permitidas. El grafo original se comparte
// entre peticiones, por lo que nunca se modifica.
func restrictedGraph(graph *TransitGraph, blocked map[edgeKey]bool, blockedStops map[string]bool) *TransitGraph {
	restricted := &TransitGraph{Stops: graph.Stops, Edges: make(map[string][]Edge, len(graph.Edges))}
	for fromStopID, edges := range graph.Edges {
		if blockedStops[fromStopID] {
			continue
		}
		for _, edge := range edges {
			if blockedStops[edge.ToStopID] || blocked[edgeKeyOf(pathStep{From: fromStopID, Edge: edge})] {
				continue
			}
			restricted.Edges[fromStopID] = append(restricted.Edges[fromStopID], edge)
		}
	}
	return restricted
}

// sortPathsByTime ordena por tiempo. Los empates se resuelven por la clave de la
// ruta para que el resultado sea siempre el mismo.
func sortPathsByTime(paths [][]pathStep) {
	sort.Slice(paths, func(firstIndex, secondIndex int) bool {
		firstSeconds, secondSeconds := pathSeconds(paths[firstIndex]), pathSeconds(paths[secondIndex])
		if firstSeconds != secondSeconds {
			return firstSeconds < secondSeconds
		}
		return pathKey(paths[firstIndex]) < pathKey(paths[secondIndex])
	})
}

func pathSeconds(path []pathStep) int {
	totalSeconds := 0
	for _, step := range path {
		totalSeconds += step.Edge.BaseTimeSec
	}
	return totalSeconds
}

// connectionKey agrupa las aristas que el pasajero percibe como la misma conexión:
// mismo destino y mismo modo de transporte.
type connectionKey struct {
	ToStopID string
	IsWalk   bool
}

func connectionKeyOf(edge Edge) connectionKey {
	return connectionKey{ToStopID: edge.ToStopID, IsWalk: edge.RouteID == walkRouteID}
}

// distinctConnectionGraph deja la arista más rápida de cada conexión y quita las
// caminatas que superan el máximo de un transbordo.
func distinctConnectionGraph(graph *TransitGraph) *TransitGraph {
	distinct := &TransitGraph{Stops: graph.Stops, Edges: make(map[string][]Edge, len(graph.Edges))}
	for fromStopID, edges := range graph.Edges {
		edgeIndexByConnection := make(map[connectionKey]int)
		for _, edge := range edges {
			if edge.RouteID == walkRouteID && edge.DistanceM > maxWalkDistanceMeters {
				continue
			}
			connection := connectionKeyOf(edge)
			edgeIndex, seen := edgeIndexByConnection[connection]
			if !seen {
				edgeIndexByConnection[connection] = len(distinct.Edges[fromStopID])
				distinct.Edges[fromStopID] = append(distinct.Edges[fromStopID], edge)
			} else if edge.BaseTimeSec < distinct.Edges[fromStopID][edgeIndex].BaseTimeSec {
				distinct.Edges[fromStopID][edgeIndex] = edge
			}
		}
	}
	return distinct
}

// lineChoice es una forma de recorrer los tramos revisados hasta ahora.
type lineChoice struct {
	Steps     []pathStep
	Transfers int
}

func (choice lineChoice) isBetterThan(other lineChoice) bool {
	if choice.Transfers != other.Transfers {
		return choice.Transfers < other.Transfers
	}
	return pathKey(choice.Steps) < pathKey(other.Steps)
}

// assignFewestTransfers mantiene los paraderos y el tiempo de la ruta, y elige las
// líneas con menos cambios. Avanza tramo a tramo guardando la mejor opción para
// cada línea en la que el pasajero podría ir.
func assignFewestTransfers(graph *TransitGraph, path []pathStep) []pathStep {
	choicesByRoute := map[string]lineChoice{"": {}}
	for _, step := range path {
		nextChoices := make(map[string]lineChoice)
		for _, edge := range equivalentEdges(graph, step) {
			for currentRoute, choice := range choicesByRoute {
				nextRoute, addedTransfers := currentRoute, 0
				if edge.RouteID != walkRouteID {
					if currentRoute != "" && currentRoute != edge.RouteID {
						addedTransfers = 1
					}
					nextRoute = edge.RouteID
				}
				candidate := lineChoice{
					Steps:     append(append([]pathStep{}, choice.Steps...), pathStep{From: step.From, Edge: edge}),
					Transfers: choice.Transfers + addedTransfers,
				}
				if best, seen := nextChoices[nextRoute]; !seen || candidate.isBetterThan(best) {
					nextChoices[nextRoute] = candidate
				}
			}
		}
		choicesByRoute = nextChoices
	}
	var bestChoice lineChoice
	hasChoice := false
	for _, choice := range choicesByRoute {
		if !hasChoice || choice.isBetterThan(bestChoice) {
			bestChoice, hasChoice = choice, true
		}
	}
	return bestChoice.Steps
}

// equivalentEdges son las aristas que hacen la misma conexión en el mismo tiempo.
func equivalentEdges(graph *TransitGraph, step pathStep) []Edge {
	equivalent := make([]Edge, 0, 1)
	for _, edge := range graph.Edges[step.From] {
		if connectionKeyOf(edge) == connectionKeyOf(step.Edge) && edge.BaseTimeSec == step.Edge.BaseTimeSec {
			equivalent = append(equivalent, edge)
		}
	}
	return equivalent
}
