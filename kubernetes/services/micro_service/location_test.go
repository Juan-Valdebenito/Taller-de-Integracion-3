package main

import (
	"math"
	"testing"
)

const (
	testOriginLatitude  = -38.7400
	testOriginLongitude = -72.6000
	// Una centésima de grado de latitud mide cerca de 1112 m.
	degreesPerHundredMeters = 0.0009
)

func nearbyTestGraph() *TransitGraph {
	graph := NewTransitGraph()
	addStop := func(stopID string, hundredsOfMeters float64, hasEdges bool) {
		graph.Stops[stopID] = Stop{
			ID:        stopID,
			Latitude:  testOriginLatitude + hundredsOfMeters*degreesPerHundredMeters,
			Longitude: testOriginLongitude,
		}
		if hasEdges {
			graph.Edges[stopID] = []Edge{{ToStopID: "FAR", RouteID: "L1", BaseTimeSec: 60}}
		}
	}
	addStop("MIDDLE", 5, true)
	addStop("NEAR", 1, true)
	addStop("CATALOG-ONLY", 0.5, false)
	addStop("FAR", 20, true)
	return graph
}

func TestNearbyStopsAreSortedByDistance(t *testing.T) {
	nearbyStops := nearbyNetworkStops(nearbyTestGraph(), testOriginLatitude, testOriginLongitude, 3)
	if len(nearbyStops) != 2 || nearbyStops[0].StopID != "NEAR" || nearbyStops[1].StopID != "MIDDLE" {
		t.Fatalf("paraderos inesperados: %+v", nearbyStops)
	}
}

func TestNearbyStopsSkipCatalogOnlyAndFarStops(t *testing.T) {
	for _, nearbyStop := range nearbyNetworkStops(nearbyTestGraph(), testOriginLatitude, testOriginLongitude, 10) {
		if nearbyStop.StopID == "CATALOG-ONLY" {
			t.Error("un paradero sin aristas no sirve para iniciar un viaje")
		}
		if nearbyStop.StopID == "FAR" {
			t.Error("un paradero a más de 1000 m no es caminable")
		}
	}
}

func TestNearbyStopsRespectLimit(t *testing.T) {
	graph := nearbyTestGraph()
	nearbyStops := nearbyNetworkStops(graph, testOriginLatitude, testOriginLongitude, 1)
	if len(nearbyStops) != 1 || nearbyStops[0].StopID != "NEAR" {
		t.Errorf("debe quedar solo el más cercano: %+v", nearbyStops)
	}
	if nearbyStops := nearbyNetworkStops(graph, testOriginLatitude, testOriginLongitude, 0); nearbyStops != nil {
		t.Errorf("con límite 0 no debe haber paraderos: %+v", nearbyStops)
	}
}

func TestNearbyStopEstimatesWalk(t *testing.T) {
	nearbyStops := nearbyNetworkStops(nearbyTestGraph(), testOriginLatitude, testOriginLongitude, 1)
	if len(nearbyStops) != 1 {
		t.Fatalf("se esperaba un paradero: %+v", nearbyStops)
	}
	nearbyStop := nearbyStops[0]
	if nearbyStop.DistanceMeters < 95 || nearbyStop.DistanceMeters > 105 {
		t.Errorf("se esperaban cerca de 100 m y se obtuvieron %d", nearbyStop.DistanceMeters)
	}
	expectedSeconds := float64(nearbyStop.DistanceMeters) / walkingSpeedMps
	if math.Abs(float64(nearbyStop.WalkSeconds)-expectedSeconds) > 2 {
		t.Errorf("se esperaban cerca de %.0f s y se obtuvieron %d", expectedSeconds, nearbyStop.WalkSeconds)
	}
}

func TestNearbyStopsOnOfficialNetwork(t *testing.T) {
	network := loadSeedNetwork(t)
	graph := network.buildGraph()
	campusStop := graph.Stops["PAR-CSF-01"]
	nearbyStops := nearbyNetworkStops(graph, campusStop.Latitude, campusStop.Longitude, 1)
	if len(nearbyStops) != 1 || nearbyStops[0].StopID != "PAR-CSF-01" || nearbyStops[0].DistanceMeters != 0 {
		t.Errorf("sobre un paradero, ese debe ser el más cercano: %+v", nearbyStops)
	}
}

func TestNearbyStopsFarFromNetwork(t *testing.T) {
	const distantLatitude, distantLongitude = -38.0, -72.0
	if nearbyStops := nearbyNetworkStops(nearbyTestGraph(), distantLatitude, distantLongitude, 3); len(nearbyStops) != 0 {
		t.Errorf("no debe haber paraderos cercanos: %+v", nearbyStops)
	}
}
