package main

// Búsqueda de la ruta de menor costo. A diferencia del tiempo, el costo de un
// tramo depende de cómo llegó el pasajero al paradero: si venía arriba de la
// misma línea no espera. Por eso cada estado es un paradero más la situación del
// pasajero, y un mismo paradero puede aparecer en varios estados.

import (
	"container/heap"
	"math"
)

type costSearchState struct {
	StopID string
	Ride   rideState
}

type costQueueItem struct {
	state     costSearchState
	cost      float64
	estimate  float64
	sequence  int
	heapIndex int
}

// costQueue entrega primero el estado con menor costo más costo estimado.
// sequence mantiene un orden estable cuando hay empates.
type costQueue []*costQueueItem

func (queue costQueue) Len() int { return len(queue) }
func (queue costQueue) Less(firstIndex, secondIndex int) bool {
	first, second := queue[firstIndex], queue[secondIndex]
	firstTotal, secondTotal := first.cost+first.estimate, second.cost+second.estimate
	if firstTotal != secondTotal {
		return firstTotal < secondTotal
	}
	return first.sequence < second.sequence
}
func (queue costQueue) Swap(firstIndex, secondIndex int) {
	queue[firstIndex], queue[secondIndex] = queue[secondIndex], queue[firstIndex]
	queue[firstIndex].heapIndex = firstIndex
	queue[secondIndex].heapIndex = secondIndex
}
func (queue *costQueue) Push(item any) {
	entry := item.(*costQueueItem)
	entry.heapIndex = len(*queue)
	*queue = append(*queue, entry)
}
func (queue *costQueue) Pop() any {
	currentItems := *queue
	lastIndex := len(currentItems) - 1
	item := currentItems[lastIndex]
	*queue = currentItems[:lastIndex]
	return item
}

// cheapestPath usa Dijkstra para encontrar la ruta de menor costo ponderado.
func cheapestPath(graph *TransitGraph, from, to string, weights CostWeights) ([]pathStep, bool) {
	result := searchCheapestPath(graph, from, to, weights, noCostEstimate)
	return result.Path, result.Found
}

func noCostEstimate(string) float64 { return 0 }

// aStarCheapestPath encuentra la misma ruta de menor costo que cheapestPath, pero
// explora primero los paraderos que se acercan al destino.
func aStarCheapestPath(graph *TransitGraph, from, to string, weights CostWeights) ([]pathStep, bool) {
	result := searchCheapestPath(graph, from, to, weights, aStarCostEstimate(graph, to, weights))
	return result.Path, result.Found
}

// aStarCostEstimate convierte la estimación de tiempo de A* en costo. Cada segundo
// de viaje cuesta al menos el menor de los pesos de micro y caminata, y la espera
// y los transbordos nunca restan. Por eso la estimación no supera el costo real.
func aStarCostEstimate(graph *TransitGraph, to string, weights CostWeights) func(stopID string) float64 {
	estimateRemainingTime := aStarEstimate(graph, to)
	minimumWeight := math.Max(0, math.Min(weights.RideWeight, weights.WalkWeight))
	return func(stopID string) float64 {
		return float64(estimateRemainingTime(stopID)) * minimumWeight
	}
}

// searchCheapestPath recorre los estados de menor a mayor costo. El primer estado
// del destino que sale de la cola es el más barato, porque ningún tramo resta costo.
func searchCheapestPath(graph *TransitGraph, from, to string, weights CostWeights, estimateRemaining func(stopID string) float64) searchResult {
	return searchCheapestPathFrom(graph, costSearchState{StopID: from}, to, weights, estimateRemaining)
}

// searchCheapestPathFrom busca desde una situación dada del pasajero, por ejemplo
// "va arriba de la 7B en PAR-DPORT-01". Así seguir en esa micro no cuesta espera.
// Las rutas alternativas lo necesitan para desviarse a mitad de un viaje.
func searchCheapestPathFrom(graph *TransitGraph, start costSearchState, to string, weights CostWeights, estimateRemaining func(stopID string) float64) searchResult {
	type previousStep struct {
		fromState costSearchState
		edge      Edge
	}
	bestCosts := map[costSearchState]float64{start: 0}
	previous := make(map[costSearchState]previousStep)
	queue := &costQueue{&costQueueItem{state: start, estimate: estimateRemaining(start.StopID)}}
	heap.Init(queue)
	sequence, exploredStates := 0, 0

	for queue.Len() > 0 {
		item := heap.Pop(queue).(*costQueueItem)
		// Una entrada antigua de la cola ya fue mejorada por otro camino.
		if item.cost != bestCosts[item.state] {
			continue
		}
		exploredStates++
		if item.state.StopID == to {
			path := make([]pathStep, 0)
			for current := item.state; current != start; current = previous[current].fromState {
				path = append(path, pathStep{From: previous[current].fromState.StopID, Edge: previous[current].edge})
			}
			reversePath(path)
			return searchResult{Path: path, Found: true, ExploredStops: exploredStates}
		}
		for _, edge := range graph.Edges[item.state.StopID] {
			nextState := costSearchState{StopID: edge.ToStopID, Ride: item.state.Ride.after(edge)}
			candidateCost := item.cost + boardingCost(item.state.Ride, edge, weights) + edgeCost(edge, weights)
			bestCost, seen := bestCosts[nextState]
			if !seen || candidateCost < bestCost {
				bestCosts[nextState] = candidateCost
				previous[nextState] = previousStep{fromState: item.state, edge: edge}
				sequence++
				heap.Push(queue, &costQueueItem{
					state: nextState, cost: candidateCost, estimate: estimateRemaining(edge.ToStopID), sequence: sequence,
				})
			}
		}
	}
	return searchResult{ExploredStops: exploredStates}
}
