package main

import (
	"reflect"
	"testing"
)

// arrivalTestGraph tiene paraderos hacia el norte del destino, a unos 111 m por
// cada 0,001 grados de latitud:
//   - ONLY_DEPARTS (~111 m): solo salen aristas, no se puede terminar ahí.
//   - ONLY_ARRIVES (~222 m): solo llegan aristas, como el final de una línea.
//   - BOTH (~333 m): llegan y salen aristas.
//   - FAR (~2220 m): demasiado lejos para caminar.
//   - ISOLATED (~150 m): sin aristas.
const (
	destinationTestLatitude  = -38.7400
	destinationTestLongitude = -72.6000
)

func arrivalTestGraph() *TransitGraph {
	graph := NewTransitGraph()
	stopLatitudes := map[string]float64{
		"ONLY_DEPARTS": destinationTestLatitude + 0.001,
		"ONLY_ARRIVES": destinationTestLatitude + 0.002,
		"BOTH":         destinationTestLatitude + 0.003,
		"FAR":          destinationTestLatitude + 0.020,
		"ISOLATED":     destinationTestLatitude + 0.00135,
	}
	for stopID, latitude := range stopLatitudes {
		graph.Stops[stopID] = Stop{ID: stopID, Latitude: latitude, Longitude: destinationTestLongitude}
	}
	graph.Edges["ONLY_DEPARTS"] = []Edge{{ToStopID: "BOTH", RouteID: "L1", BaseTimeSec: 60}}
	graph.Edges["BOTH"] = []Edge{
		{ToStopID: "ONLY_ARRIVES", RouteID: "L1", BaseTimeSec: 60},
		{ToStopID: "FAR", RouteID: "L1", BaseTimeSec: 300},
	}
	return graph
}

func nearbyStopIDs(nearbyStops []NearbyStop) []string {
	stopIDs := make([]string, 0, len(nearbyStops))
	for _, nearbyStop := range nearbyStops {
		stopIDs = append(stopIDs, nearbyStop.StopID)
	}
	return stopIDs
}

func TestNearbyArrivalStopsOnlyIncludeStopsWithArrivals(t *testing.T) {
	nearbyStops := nearbyArrivalStops(arrivalTestGraph(), destinationTestLatitude, destinationTestLongitude, 5, maxWalkDistanceMeters)
	expectedStopIDs := []string{"ONLY_ARRIVES", "BOTH"}
	if !reflect.DeepEqual(nearbyStopIDs(nearbyStops), expectedStopIDs) {
		t.Fatalf("stops = %v, want %v", nearbyStopIDs(nearbyStops), expectedStopIDs)
	}
}

// Al revés que en el origen: un paradero donde solo terminan líneas sirve para
// llegar, pero no para salir.
func TestNearbyStopsDifferForOriginAndDestination(t *testing.T) {
	graph := arrivalTestGraph()
	originStops := nearbyNetworkStops(graph, destinationTestLatitude, destinationTestLongitude, 5, maxWalkDistanceMeters)
	expectedOriginStopIDs := []string{"ONLY_DEPARTS", "BOTH"}
	if !reflect.DeepEqual(nearbyStopIDs(originStops), expectedOriginStopIDs) {
		t.Fatalf("origin stops = %v, want %v", nearbyStopIDs(originStops), expectedOriginStopIDs)
	}
}

func TestNearbyArrivalStopsRespectMaxWalkAndLimit(t *testing.T) {
	graph := arrivalTestGraph()
	withinShortWalk := nearbyArrivalStops(graph, destinationTestLatitude, destinationTestLongitude, 5, 250)
	if !reflect.DeepEqual(nearbyStopIDs(withinShortWalk), []string{"ONLY_ARRIVES"}) {
		t.Fatalf("stops within 250 m = %v, want [ONLY_ARRIVES]", nearbyStopIDs(withinShortWalk))
	}
	onlyClosest := nearbyArrivalStops(graph, destinationTestLatitude, destinationTestLongitude, 1, maxWalkDistanceMeters)
	if !reflect.DeepEqual(nearbyStopIDs(onlyClosest), []string{"ONLY_ARRIVES"}) {
		t.Fatalf("closest stop = %v, want [ONLY_ARRIVES]", nearbyStopIDs(onlyClosest))
	}
	if stops := nearbyArrivalStops(graph, destinationTestLatitude, destinationTestLongitude, 0, maxWalkDistanceMeters); stops != nil {
		t.Fatalf("limit 0 returned %v, want nil", stops)
	}
}

func TestNearbyArrivalStopsEstimateWalk(t *testing.T) {
	nearbyStops := nearbyArrivalStops(arrivalTestGraph(), destinationTestLatitude, destinationTestLongitude, 1, maxWalkDistanceMeters)
	closest := nearbyStops[0]
	// 0,002 grados de latitud son unos 222 m, que a 1,2 m/s toman unos 186 s.
	if closest.DistanceMeters < 220 || closest.DistanceMeters > 225 {
		t.Fatalf("distance = %d m, want about 222", closest.DistanceMeters)
	}
	if closest.WalkSeconds < 183 || closest.WalkSeconds > 188 {
		t.Fatalf("walk = %d s, want about 186", closest.WalkSeconds)
	}
}

func TestFinalWalkStepEndsAtDestination(t *testing.T) {
	step := finalWalkStep(NearbyStop{StopID: "BOTH", DistanceMeters: 333, WalkSeconds: 278})
	expectedStep := pathStep{From: "BOTH", Edge: Edge{
		ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: 278, DistanceM: 333,
	}}
	if !reflect.DeepEqual(step, expectedStep) {
		t.Fatalf("step = %+v, want %+v", step, expectedStep)
	}
}

// En la red oficial, cada paradero con aristas de llegada debe poder ser un
// destino si se está justo encima de él.
func TestEveryArrivalStopIsReachableAsDestination(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	for stopID := range stopsWithArrivals(graph) {
		stop := graph.Stops[stopID]
		nearbyStops := nearbyArrivalStops(graph, stop.Latitude, stop.Longitude, 1, maxWalkDistanceMeters)
		if len(nearbyStops) != 1 || nearbyStops[0].StopID != stopID || nearbyStops[0].DistanceMeters != 0 {
			t.Fatalf("%s: nearest arrival stop = %+v, want itself at 0 m", stopID, nearbyStops)
		}
	}
}
