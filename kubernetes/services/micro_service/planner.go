package main

// Algoritmos que planifican un viaje sobre TransitGraph. Este archivo no depende
// de HTTP ni de gRPC: recibe el grafo y devuelve los tramos del recorrido.

import "container/heap"

// pathStep es un tramo del recorrido: el paradero de origen y la arista usada.
type pathStep struct {
	From string
	Edge Edge
}

// dijkstraItem es un paradero pendiente de explorar y su costo acumulado.
type dijkstraItem struct {
	stop, route                      string
	time, transfers, sequence, index int
}

// priorityQueue entrega primero el paradero con menos cambios de línea y, si
// empatan, el de menor tiempo. sequence mantiene un orden estable.
type priorityQueue []*dijkstraItem

func (queue priorityQueue) Len() int { return len(queue) }
func (queue priorityQueue) Less(firstIndex, secondIndex int) bool {
	first, second := queue[firstIndex], queue[secondIndex]
	if first.transfers != second.transfers {
		return first.transfers < second.transfers
	}
	if first.time != second.time {
		return first.time < second.time
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
func fastestPath(graph *TransitGraph, from, to string) ([]pathStep, bool) {
	bestTimes := map[string]int{from: 0}
	previous := make(map[string]pathStep)
	queue := &priorityQueue{&dijkstraItem{stop: from}}
	heap.Init(queue)
	for queue.Len() > 0 {
		item := heap.Pop(queue).(*dijkstraItem)
		// Una entrada antigua de la cola ya fue mejorada por otro camino.
		if item.time != bestTimes[item.stop] {
			continue
		}
		if item.stop == to {
			return reconstructPath(previous, from, to), true
		}
		for _, edge := range graph.Edges[item.stop] {
			candidateTime := item.time + edge.BaseTimeSec
			bestTime, seen := bestTimes[edge.ToStopID]
			if !seen || candidateTime < bestTime {
				bestTimes[edge.ToStopID] = candidateTime
				previous[edge.ToStopID] = pathStep{From: item.stop, Edge: edge}
				heap.Push(queue, &dijkstraItem{stop: edge.ToStopID, time: candidateTime})
			}
		}
	}
	return nil, false
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
