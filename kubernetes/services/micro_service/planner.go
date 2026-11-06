package main

// Algoritmos que planifican un viaje sobre TransitGraph. Este archivo no depende
// de HTTP ni de gRPC: recibe el grafo y devuelve los tramos del recorrido.

import (
	"container/heap"
	"math"
)

// pathStep es un tramo del recorrido: el paradero de origen y la arista usada.
type pathStep struct {
	From string
	Edge Edge
}

// dijkstraItem es un paradero pendiente de explorar y su costo acumulado.
type dijkstraItem struct {
	stop, route                      string
	time, transfers, sequence, index int
	// remainingEstimate es el tiempo que A* estima hasta el destino.
	remainingEstimate int
}

// priorityQueue entrega primero el paradero con menos cambios de línea y, si
// empatan, el de menor tiempo total estimado. sequence mantiene un orden estable.
type priorityQueue []*dijkstraItem

func (queue priorityQueue) Len() int { return len(queue) }
func (queue priorityQueue) Less(firstIndex, secondIndex int) bool {
	first, second := queue[firstIndex], queue[secondIndex]
	if first.transfers != second.transfers {
		return first.transfers < second.transfers
	}
	firstTotal := first.time + first.remainingEstimate
	secondTotal := second.time + second.remainingEstimate
	if firstTotal != secondTotal {
		return firstTotal < secondTotal
	}
	return first.sequence < second.sequence
}
func (queue priorityQueue) Swap(firstIndex, secondIndex int) {
	queue[firstIndex], queue[secondIndex] = queue[secondIndex], queue[firstIndex]
	queue[firstIndex].index = firstIndex
	queue[secondIndex].index = secondIndex
}
func (queue *priorityQueue) Push(item any) {
	entry := item.(*dijkstraItem)
	entry.index = len(*queue)
	*queue = append(*queue, entry)
}
func (queue *priorityQueue) Pop() any {
	currentItems := *queue
	lastIndex := len(currentItems) - 1
	item := currentItems[lastIndex]
	*queue = currentItems[:lastIndex]
	return item
}

// fastestPath usa Dijkstra para encontrar la ruta de menor tiempo total.
// Dijkstra es A* con una estimación igual a cero: explora sin orientarse al destino.
func fastestPath(graph *TransitGraph, from, to string) ([]pathStep, bool) {
	result := searchFastestPath(graph, from, to, noRemainingEstimate)
	return result.Path, result.Found
}

func noRemainingEstimate(string) int { return 0 }

// aStarPath encuentra la misma ruta de menor tiempo que Dijkstra, pero explora
// primero los paraderos que se acercan al destino.
func aStarPath(graph *TransitGraph, from, to string) ([]pathStep, bool) {
	result := searchFastestPath(graph, from, to, aStarEstimate(graph, to))
	return result.Path, result.Found
}

// aStarEstimate prepara la heurística de A* para un destino.
func aStarEstimate(graph *TransitGraph, to string) func(stopID string) int {
	maxSpeedMps := maxStraightSpeedMps(graph)
	return func(stopID string) int {
		return remainingTimeEstimate(graph, stopID, to, maxSpeedMps)
	}
}

// searchResult es la ruta encontrada y cuántos paraderos se exploraron para
// hallarla. Ese número permite comparar el trabajo de Dijkstra y A*.
type searchResult struct {
	Path          []pathStep
	Found         bool
	ExploredStops int
}

// searchFastestPath ordena la exploración por tiempo recorrido más tiempo
// estimado. La estimación nunca debe superar el tiempo real restante; si lo
// hiciera, la búsqueda podría entregar una ruta que no es la más rápida.
func searchFastestPath(graph *TransitGraph, from, to string, estimateRemaining func(stopID string) int) searchResult {
	bestTimes := map[string]int{from: 0}
	previous := make(map[string]pathStep)
	queue := &priorityQueue{&dijkstraItem{stop: from, remainingEstimate: estimateRemaining(from)}}
	heap.Init(queue)
	exploredStops := 0
	for queue.Len() > 0 {
		item := heap.Pop(queue).(*dijkstraItem)
		// Una entrada antigua de la cola ya fue mejorada por otro camino.
		if item.time != bestTimes[item.stop] {
			continue
		}
		exploredStops++
		if item.stop == to {
			return searchResult{Path: reconstructPath(previous, from, to), Found: true, ExploredStops: exploredStops}
		}
		for _, edge := range graph.Edges[item.stop] {
			candidateTime := item.time + edge.BaseTimeSec
			bestTime, seen := bestTimes[edge.ToStopID]
			if !seen || candidateTime < bestTime {
				bestTimes[edge.ToStopID] = candidateTime
				previous[edge.ToStopID] = pathStep{From: item.stop, Edge: edge}
				heap.Push(queue, &dijkstraItem{stop: edge.ToStopID, time: candidateTime, remainingEstimate: estimateRemaining(edge.ToStopID)})
			}
		}
	}
	return searchResult{ExploredStops: exploredStops}
}

// maxStraightSpeedMps es la mayor velocidad en línea recta de todas las aristas.
// Ningún tramo avanza más rápido hacia el destino, y por eso la estimación nunca
// supera el tiempo real. Devuelve 0 si una arista avanza sin consumir tiempo.
func maxStraightSpeedMps(graph *TransitGraph) float64 {
	maxSpeedMps := 0.0
	for fromStopID, edges := range graph.Edges {
		for _, edge := range edges {
			meters := straightMeters(graph, fromStopID, edge.ToStopID)
			if edge.BaseTimeSec <= 0 {
				if meters > 0 {
					return 0
				}
				continue
			}
			maxSpeedMps = math.Max(maxSpeedMps, meters/float64(edge.BaseTimeSec))
		}
	}
	return maxSpeedMps
}

func straightMeters(graph *TransitGraph, fromStopID, toStopID string) float64 {
	fromStop, toStop := graph.Stops[fromStopID], graph.Stops[toStopID]
	return haversineMeters(fromStop.Latitude, fromStop.Longitude, toStop.Latitude, toStop.Longitude)
}

// remainingTimeEstimate es la heurística de A*: los segundos que tardaría ir en
// línea recta a la máxima velocidad. Se redondea hacia abajo para no sobrestimar.
func remainingTimeEstimate(graph *TransitGraph, stopID, destinationStopID string, maxSpeedMps float64) int {
	if maxSpeedMps <= 0 {
		return 0
	}
	return int(math.Floor(straightMeters(graph, stopID, destinationStopID) / maxSpeedMps))
}

// minimumTransferPath busca la ruta con menos cambios de línea y, si empatan, la
// de menor tiempo. El estado incluye la línea actual porque llegar a un paradero
// en una u otra línea cambia si el siguiente tramo cuenta como transbordo.
func minimumTransferPath(graph *TransitGraph, from, to string) ([]pathStep, bool) {
	type state struct{ stop, route string }
	start := state{stop: from}
	best := map[state][2]int{start: {0, 0}}
	previous := make(map[state]struct {
		from state
		edge Edge
	})
	sequence := 0
	queue := &priorityQueue{&dijkstraItem{stop: from}}
	heap.Init(queue)
	var final state
	for queue.Len() > 0 {
		item := heap.Pop(queue).(*dijkstraItem)
		current := state{stop: item.stop, route: item.route}
		cost, ok := best[current]
		if !ok || cost != [2]int{item.transfers, item.time} {
			continue
		}
		if item.stop == to {
			final = current
			break
		}
		for _, edge := range graph.Edges[item.stop] {
			nextRoute, additionalTransfer := item.route, 0
			if edge.RouteID != walkRouteID {
				if nextRoute != "" && nextRoute != edge.RouteID {
					additionalTransfer = 1
				}
				nextRoute = edge.RouteID
			}
			next := state{stop: edge.ToStopID, route: nextRoute}
			candidate := [2]int{item.transfers + additionalTransfer, item.time + edge.BaseTimeSec}
			bestCost, seen := best[next]
			if !seen || candidate[0] < bestCost[0] || (candidate[0] == bestCost[0] && candidate[1] < bestCost[1]) {
				best[next] = candidate
				previous[next] = struct {
					from state
					edge Edge
				}{from: current, edge: edge}
				sequence++
				heap.Push(queue, &dijkstraItem{stop: next.stop, route: next.route, time: candidate[1], transfers: candidate[0], sequence: sequence})
			}
		}
	}
	if final.stop == "" {
		return nil, false
	}
	path := make([]pathStep, 0)
	for final != start {
		step, ok := previous[final]
		if !ok {
			return nil, false
		}
		path = append(path, pathStep{From: step.from.stop, Edge: step.edge})
		final = step.from
	}
	reversePath(path)
	return path, true
}

// reconstructPath recorre los pasos guardados desde el destino hasta el origen.
func reconstructPath(previous map[string]pathStep, from, to string) []pathStep {
	path := make([]pathStep, 0)
	for current := to; current != from; {
		step := previous[current]
		path = append(path, step)
		current = step.From
	}
	reversePath(path)
	return path
}

func reversePath(path []pathStep) {
	for left, right := 0, len(path)-1; left < right; left, right = left+1, right-1 {
		path[left], path[right] = path[right], path[left]
	}
}

// countTransfers cuenta los cambios de línea. Caminar entre micros no es un
// cambio por sí mismo: se cuenta al subir a una línea distinta.
func countTransfers(path []pathStep) int {
	previousRoute, transfers := "", 0
	for _, step := range path {
		if step.Edge.RouteID == walkRouteID {
			continue
		}
		if previousRoute != "" && previousRoute != step.Edge.RouteID {
			transfers++
		}
		previousRoute = step.Edge.RouteID
	}
	return transfers
}
