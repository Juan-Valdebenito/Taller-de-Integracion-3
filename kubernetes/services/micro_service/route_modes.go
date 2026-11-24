package main

// Modos de búsqueda "shortest" y "least_walk" de /routes/plan y PlanRoute. Los
// agregó la app móvil (commits 15e6645 y e52353a), pero sus definiciones se
// perdieron al juntar la rama sebastian con main (5db4f3c), y micro_service dejó
// de compilar. Esta es la misma lógica, restaurada con nombres más claros.

import "container/heap"

// shortestPath busca la ruta de menor distancia total, sin importar el tiempo.
// Su resultado se compara con fastest y min_transfers en la app, que finalmente
// ordena las opciones por tiempo.
func shortestPath(graph *TransitGraph, from, to string) ([]pathStep, bool) {
	bestDistance := map[string]int{from: 0}
	previous := make(map[string]pathStep)
	// La cola ordena por transfers y después por time. Aquí transfers queda en 0 y
	// time guarda la distancia, así que entrega primero el paradero más cercano.
	queue := &priorityQueue{&dijkstraItem{stop: from}}
	heap.Init(queue)
	for queue.Len() > 0 {
		item := heap.Pop(queue).(*dijkstraItem)
		if item.time != bestDistance[item.stop] {
			continue
		}
		if item.stop == to {
			return reconstructPath(previous, from, to), true
		}
		for _, edge := range graph.Edges[item.stop] {
			candidateDistance := item.time + edge.DistanceM
			knownDistance, seen := bestDistance[edge.ToStopID]
			if !seen || candidateDistance < knownDistance {
				bestDistance[edge.ToStopID] = candidateDistance
				previous[edge.ToStopID] = pathStep{From: item.stop, Edge: edge}
				heap.Push(queue, &dijkstraItem{stop: edge.ToStopID, time: candidateDistance})
			}
		}
	}
	return nil, false
}

// walkAndTime es el costo de leastWalkingPath: primero los segundos caminando y,
// si empatan, el tiempo total.
type walkAndTime struct {
	walkSeconds, totalSeconds int
}

func (cost walkAndTime) isBetterThan(other walkAndTime) bool {
	if cost.walkSeconds != other.walkSeconds {
		return cost.walkSeconds < other.walkSeconds
	}
	return cost.totalSeconds < other.totalSeconds
}

// leastWalkingPath busca la ruta que menos camina y, si empatan, la más rápida.
func leastWalkingPath(graph *TransitGraph, from, to string) ([]pathStep, bool) {
	bestCost := map[string]walkAndTime{from: {}}
	previous := make(map[string]pathStep)
	// La cola ordena por transfers y después por time. Aquí transfers guarda los
	// segundos caminando y time el tiempo total, que es justo el orden buscado.
	queue := &priorityQueue{&dijkstraItem{stop: from}}
	heap.Init(queue)
	for queue.Len() > 0 {
		item := heap.Pop(queue).(*dijkstraItem)
		currentCost, exists := bestCost[item.stop]
		if !exists || currentCost != (walkAndTime{walkSeconds: item.transfers, totalSeconds: item.time}) {
			continue
		}
		if item.stop == to {
			return reconstructPath(previous, from, to), true
		}
		for _, edge := range graph.Edges[item.stop] {
			edgeWalkSeconds := 0
			if edge.RouteID == walkRouteID {
				edgeWalkSeconds = edge.BaseTimeSec
			}
			candidateCost := walkAndTime{
				walkSeconds:  currentCost.walkSeconds + edgeWalkSeconds,
				totalSeconds: currentCost.totalSeconds + edge.BaseTimeSec,
			}
			knownCost, seen := bestCost[edge.ToStopID]
			if !seen || candidateCost.isBetterThan(knownCost) {
				bestCost[edge.ToStopID] = candidateCost
				previous[edge.ToStopID] = pathStep{From: item.stop, Edge: edge}
				heap.Push(queue, &dijkstraItem{stop: edge.ToStopID, transfers: candidateCost.walkSeconds, time: candidateCost.totalSeconds})
			}
		}
	}
	return nil, false
}
