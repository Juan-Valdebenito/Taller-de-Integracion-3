package main

import (
	"math"
	"sync"
	"testing"
	"time"
)

var gpsTestStart = time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)

// gpsLineGraph es un circuito A → B → C → A de la L1, con 300 s por tramo y
// paraderos a más de 1 km.
func gpsLineGraph() *TransitGraph {
	graph := NewTransitGraph()
	graph.Stops["A"] = Stop{ID: "A", Latitude: -38.700, Longitude: -72.600}
	graph.Stops["B"] = Stop{ID: "B", Latitude: -38.710, Longitude: -72.600}
	graph.Stops["C"] = Stop{ID: "C", Latitude: -38.710, Longitude: -72.590}
	for fromStopID, toStopID := range map[string]string{"A": "B", "B": "C", "C": "A"} {
		graph.Edges[fromStopID] = []Edge{{ToStopID: toStopID, RouteID: "L1", BaseTimeSec: 300, DistanceM: 1200}}
	}
	return graph
}

func recordAtStop(times *GPSTimes, graph *TransitGraph, busID, stopID string, secondsFromStart int) bool {
	stop := graph.Stops[stopID]
	return times.Record(graph, GPSPosition{BusID: busID, RouteID: "L1", Latitude: stop.Latitude, Longitude: stop.Longitude,
		Time: gpsTestStart.Add(time.Duration(secondsFromStart) * time.Second)})
}

func observedAt(times *GPSTimes, graph *TransitGraph, secondsFromStart int) ObservedTimes {
	return times.Observed(graph, gpsTestStart.Add(time.Duration(secondsFromStart)*time.Second))
}

// El primer tramo solo confirma el recorrido. Los otros se promedian con el tiempo
// oficial: (300 × 2 + 270) / 3 = 290 y (300 × 2 + 290) / 3 = 297.
func TestGPSTimesCorrectSegment(t *testing.T) {
	graph, times := gpsLineGraph(), NewGPSTimes()
	recordAtStop(times, graph, "bus", "A", 0)
	recordAtStop(times, graph, "bus", "B", 290)
	recordAtStop(times, graph, "bus", "C", 290+270)
	recordAtStop(times, graph, "bus", "A", 290+540+20)
	observed := observedAt(times, graph, 900)
	expected := map[segmentKey]int{{"L1", "B", "C"}: 290, {"L1", "C", "A"}: 297}
	if len(observed.SegmentSeconds) != len(expected) {
		t.Fatalf("observed = %v, want %v", observed.SegmentSeconds, expected)
	}
	for key, seconds := range expected {
		if observed.SegmentSeconds[key] != seconds {
			t.Fatalf("%v = %d s, want %d", key, observed.SegmentSeconds[key], seconds)
		}
	}
}

// Mientras más micros tardan lo mismo, más se acerca al tiempo observado.
func TestGPSTimesApproachObservedTime(t *testing.T) {
	observations := []observation{}
	previousSeconds := 300
	for count := 1; count <= 20; count++ {
		observations = addObservation(observations, 600, gpsTestStart)
		seconds, _ := blendWithOfficial(observations, 300, gpsTestStart)
		if seconds <= previousSeconds || seconds >= 600 {
			t.Fatalf("with %d observations: %d s after %d", count, seconds, previousSeconds)
		}
		previousSeconds = seconds
	}
	if previousSeconds < 560 {
		t.Fatalf("with 20 observations: %d s, want close to 600", previousSeconds)
	}
}

// Sin observaciones, o cuando vencen, no se corrige nada.
func TestGPSTimesExpire(t *testing.T) {
	graph, times := gpsLineGraph(), NewGPSTimes()
	if observed := observedAt(times, graph, 0); len(observed.SegmentSeconds)+len(observed.HeadwaySeconds) != 0 {
		t.Fatalf("observed = %v without positions", observed)
	}
	recordAtStop(times, graph, "bus", "A", 0)
	recordAtStop(times, graph, "bus", "B", 280)
	recordAtStop(times, graph, "bus", "C", 560)
	if len(observedAt(times, graph, 560+3600).SegmentSeconds) != 1 {
		t.Fatal("an observation of one hour should still count")
	}
	if len(observedAt(times, graph, 560+3601).SegmentSeconds) != 0 {
		t.Fatal("an older observation should not count")
	}
}

// Un tramo imposible, un corte de señal, un salto de paradero o un cambio de línea
// no generan observaciones.
func TestGPSTimesIgnoreUnreliableTrips(t *testing.T) {
	type visit struct {
		stopID  string
		seconds int
	}
	for name, visits := range map[string][]visit{
		"too fast":       {{"A", 0}, {"B", 250}, {"C", 250 + 119}},
		"signal lost":    {{"A", 0}, {"B", 250}, {"C", 250 + 301}},
		"skipped a stop": {{"A", 0}, {"C", 250}},
		"stays at stop":  {{"A", 0}, {"A", 100}, {"A", 200}},
	} {
		graph, times := gpsLineGraph(), NewGPSTimes()
		for _, item := range visits {
			recordAtStop(times, graph, "bus", item.stopID, item.seconds)
		}
		if observed := observedAt(times, graph, 1000); len(observed.SegmentSeconds) != 0 {
			t.Fatalf("%s: observed = %v", name, observed.SegmentSeconds)
		}
	}
	for elapsed, isPlausible := range map[float64]bool{119: false, 120: true, 900: true, 901: false} {
		if isPlausibleSegment(elapsed, 300) != isPlausible {
			t.Fatalf("%v s for 300 s: plausible = %v", elapsed, !isPlausible)
		}
	}
}

// La señal intermedia mantiene viva a la micro: un tramo lento se mide completo,
// desde que llegó a un paradero hasta que llegó al otro.
func TestGPSTimesMeasureSlowSegment(t *testing.T) {
	graph, times := gpsLineGraph(), NewGPSTimes()
	recordAtStop(times, graph, "bus", "A", 0)
	recordAtStop(times, graph, "bus", "B", 280)
	for second := 290; second < 880; second += 60 {
		times.Record(graph, GPSPosition{BusID: "bus", RouteID: "L1", Latitude: -38.710, Longitude: -72.595, Time: gpsTestStart.Add(time.Duration(second) * time.Second)})
	}
	recordAtStop(times, graph, "bus", "C", 880)
	// 600 s observados: (300 × 2 + 600) / 3 = 400.
	if seconds := observedAt(times, graph, 900).SegmentSeconds[segmentKey{"L1", "B", "C"}]; seconds != 400 {
		t.Fatalf("B -> C = %d s, want 400", seconds)
	}
}

// Dos micros pasan por el mismo tramo con 240 s de diferencia. Con el intervalo
// supuesto de 600: (600 × 2 + 240) / 3 = 480, en los dos tramos.
func TestGPSTimesMeasureHeadway(t *testing.T) {
	graph, times := gpsLineGraph(), NewGPSTimes()
	for busIndex, busID := range []string{"first", "second"} {
		recordAtStop(times, graph, busID, "A", 240*busIndex)
		recordAtStop(times, graph, busID, "B", 240*busIndex+280)
	}
	observed := observedAt(times, graph, 900)
	if observed.HeadwaySeconds["L1"] != 480 {
		t.Fatalf("headway = %d s, want 480", observed.HeadwaySeconds["L1"])
	}
	weights := defaultCostWeights()
	weights.HeadwaySeconds = observed.HeadwaySeconds
	if wait := weights.waitSeconds("L1"); wait != 240 {
		t.Fatalf("wait = %d s, want half of 480", wait)
	}
	if wait := weights.waitSeconds("L2"); wait != expectedWaitSeconds("L2") {
		t.Fatalf("wait of a line without GPS = %d s", wait)
	}
}

// Una micro junto a un paradero que no es el siguiente no cambia su recorrido.
func TestGPSTimesIgnoreWrongStopWhenConfirmed(t *testing.T) {
	graph, times := gpsLineGraph(), NewGPSTimes()
	recordAtStop(times, graph, "bus", "A", 0)
	recordAtStop(times, graph, "bus", "B", 280)
	recordAtStop(times, graph, "bus", "A", 400)
	recordAtStop(times, graph, "bus", "C", 580)
	if seconds := observedAt(times, graph, 900).SegmentSeconds[segmentKey{"L1", "B", "C"}]; seconds != 300 {
		t.Fatalf("B -> C = %d s, want 300", seconds)
	}
}

func TestGPSTimesRejectInvalidPositions(t *testing.T) {
	graph, times := gpsLineGraph(), NewGPSTimes()
	valid := GPSPosition{BusID: "bus", RouteID: "L1", Latitude: -38.700, Longitude: -72.600, Time: gpsTestStart}
	if !times.Record(graph, valid) {
		t.Fatal("a valid position was rejected")
	}
	for name, change := range map[string]func(position *GPSPosition){
		"without bus":   func(position *GPSPosition) { position.BusID = "" },
		"without time":  func(position *GPSPosition) { position.Time = time.Time{} },
		"unknown line":  func(position *GPSPosition) { position.RouteID = "L99" },
		"walking":       func(position *GPSPosition) { position.RouteID = walkRouteID },
		"out of range":  func(position *GPSPosition) { position.Latitude = 91 },
		"not a number":  func(position *GPSPosition) { position.Longitude = math.NaN() },
		"repeated":      func(*GPSPosition) {},
		"older reading": func(position *GPSPosition) { position.Time = gpsTestStart.Add(-time.Second) },
	} {
		position := valid
		if name != "repeated" {
			position.Time = gpsTestStart.Add(time.Minute)
		}
		change(&position)
		if times.Record(graph, position) {
			t.Fatalf("%s: the position was accepted", name)
		}
	}
}

// Los tiempos corregidos cambian las rutas sin tocar el grafo original, y la
// búsqueda sigue dando lo mismo que la fuerza bruta.
func TestObservedTimesKeepSearchOptimal(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	observed := ObservedTimes{SegmentSeconds: make(map[segmentKey]int)}
	for fromStopID, edges := range graph.Edges {
		for edgeIndex, edge := range edges {
			if edge.RouteID != walkRouteID {
				factor := []float64{minObservedFactor, 1, maxObservedFactor}[edgeIndex%3]
				observed.SegmentSeconds[segmentKey{edge.RouteID, fromStopID, edge.ToStopID}] = int(float64(edge.BaseTimeSec) * factor)
			}
		}
	}
	originalSeconds := graph.Edges["PAR-PORTAL-01"][0].BaseTimeSec
	corrected := withObservedTimes(graph, observed)
	weights := defaultCostWeights()
	for _, stopPair := range allStopPairs(corrected) {
		assertCheapestPath(t, corrected, stopPair[0], stopPair[1], weights)
	}
	assertAStarMatchesCheapest(t, corrected, weights)
	if graph.Edges["PAR-PORTAL-01"][0].BaseTimeSec != originalSeconds {
		t.Fatal("the original graph changed")
	}
	if withObservedTimes(graph, ObservedTimes{}) != graph {
		t.Fatal("without observations the same graph should be used")
	}
}

// La espera observada entra en el costo y en la explicación.
func TestObservedHeadwayChangesCostAndExplanation(t *testing.T) {
	weights := defaultCostWeights()
	weights.HeadwaySeconds = map[string]int{"L1C": 240}
	path := []pathStep{busStep("L1C", 600)}
	if wait := pathCostBreakdown(path, weights).Wait; wait != 240 {
		t.Fatalf("wait cost = %v, want 120 s × 2", wait)
	}
	if text := explainRoute(path, weights); text != "1C tarda 10 min, más unos 2 min de espera, y no requiere caminar." {
		t.Fatalf("text = %q", text)
	}
}

// Muchas micros informan mientras se consultan los tiempos.
func TestGPSTimesConcurrentUse(t *testing.T) {
	graph, times := gpsLineGraph(), NewGPSTimes()
	var workers sync.WaitGroup
	for busIndex := 0; busIndex < 20; busIndex++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			busID := string(rune('a' + busIndex))
			for visit := 0; visit < 30; visit++ {
				recordAtStop(times, graph, busID, []string{"A", "B", "C"}[visit%3], visit*280)
				observedAt(times, graph, visit*280)
			}
		}()
	}
	workers.Wait()
	if len(observedAt(times, graph, 30*280).SegmentSeconds) != 3 {
		t.Fatal("the three segments should be observed")
	}
}
