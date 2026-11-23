package main

import (
	"errors"
	"testing"
)

func TestRecommendRoutesRejectsSameOriginAndDestination(t *testing.T) {
	graph := arrivalTestGraph()
	point := locationPoint(destinationTestLatitude, destinationTestLongitude)
	samePairs := [][2]RoutePoint{
		{stopPoint("BOTH"), stopPoint("BOTH")},
		{point, point},
	}
	for _, pair := range samePairs {
		if _, err := recommendRoutes(graph, pair[0], pair[1], 3, defaultCostWeights(), maxWalkDistanceMeters); !errors.Is(err, errSameOriginAndDestination) {
			t.Fatalf("%+v -> %+v: error = %v, want errSameOriginAndDestination", pair[0], pair[1], err)
		}
	}
}

// Un paradero y una coordenada encima de él no son el mismo punto: se camina 0 m.
func TestStopAndLocationOnItAreNotSamePoint(t *testing.T) {
	graph := arrivalTestGraph()
	stop := graph.Stops["BOTH"]
	if isSamePoint(stopPoint("BOTH"), locationPoint(stop.Latitude, stop.Longitude)) {
		t.Fatal("a stop and a location are reported as the same point")
	}
}

// Entre dos paraderos no se agrega una caminata en línea recta: el grafo ya
// tiene sus transbordos a pie.
func TestDirectWalkIsNotAddedBetweenStops(t *testing.T) {
	if walk := directWalkRoute(arrivalTestGraph(), stopPoint("ONLY_DEPARTS"), stopPoint("BOTH"), maxWalkDistanceMeters); walk != nil {
		t.Fatalf("walk between stops = %+v, want nil", walk)
	}
}

func TestDirectWalkUsesPointIDs(t *testing.T) {
	graph := arrivalTestGraph()
	point := locationPoint(destinationTestLatitude, destinationTestLongitude)
	fromStop := directWalkRoute(graph, stopPoint("ONLY_ARRIVES"), point, maxWalkDistanceMeters)
	if len(fromStop) != 1 || fromStop[0].From != "ONLY_ARRIVES" || fromStop[0].Edge.ToStopID != destinationLocationID {
		t.Fatalf("walk from stop = %+v, want ONLY_ARRIVES -> %s", fromStop, destinationLocationID)
	}
	toStop := directWalkRoute(graph, point, stopPoint("ONLY_ARRIVES"), maxWalkDistanceMeters)
	if len(toStop) != 1 || toStop[0].From != userLocationID || toStop[0].Edge.ToStopID != "ONLY_ARRIVES" {
		t.Fatalf("walk to stop = %+v, want %s -> ONLY_ARRIVES", toStop, userLocationID)
	}
	// 0,002 grados de latitud son unos 222 m, que a 1,2 m/s toman unos 186 s.
	if toStop[0].Edge.DistanceM < 220 || toStop[0].Edge.DistanceM > 225 || toStop[0].Edge.BaseTimeSec < 183 || toStop[0].Edge.BaseTimeSec > 188 {
		t.Fatalf("walk = %d m and %d s, want about 222 m and 186 s", toStop[0].Edge.DistanceM, toStop[0].Edge.BaseTimeSec)
	}
}

func TestDirectWalkRespectsMaxWalk(t *testing.T) {
	graph := arrivalTestGraph()
	origin := locationPoint(destinationTestLatitude, destinationTestLongitude)
	destination := locationPoint(destinationTestLatitude+0.003, destinationTestLongitude)
	if walk := directWalkRoute(graph, origin, destination, 400); len(walk) != 1 {
		t.Fatalf("walk of about 333 m within 400 m = %+v, want one step", walk)
	}
	if walk := directWalkRoute(graph, origin, destination, 300); walk != nil {
		t.Fatalf("walk of about 333 m within 300 m = %+v, want nil", walk)
	}
}

// Lejos de todo paradero, pero a pocos metros del destino: la única opción es
// caminar, y no debe responder "no hay paraderos cerca".
func TestRecommendRoutesWalksWhenNoStopsNearby(t *testing.T) {
	graph := arrivalTestGraph()
	origin := locationPoint(destinationTestLatitude-0.1, destinationTestLongitude)
	destination := locationPoint(destinationTestLatitude-0.1+0.002, destinationTestLongitude)
	routes, err := recommendRoutes(graph, origin, destination, 3, defaultCostWeights(), maxWalkDistanceMeters)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(routes) != 1 || len(routes[0]) != 1 || routes[0][0].Edge.RouteID != walkRouteID {
		t.Fatalf("routes = %+v, want only the direct walk", routes)
	}
}

// Si el destino tampoco está a distancia caminable, se mantiene el error.
func TestRecommendRoutesKeepsErrorWhenWalkIsTooLong(t *testing.T) {
	graph := arrivalTestGraph()
	origin := locationPoint(destinationTestLatitude-0.1, destinationTestLongitude)
	destination := locationPoint(destinationTestLatitude, destinationTestLongitude)
	if _, err := recommendRoutes(graph, origin, destination, 3, defaultCostWeights(), maxWalkDistanceMeters); !errors.Is(err, errNoNearbyStops) {
		t.Fatalf("error = %v, want errNoNearbyStops", err)
	}
}

// En la red oficial, entre dos puntos a unos 111 m, caminar cuesta unos 186 y
// cualquier micro cuesta al menos 600 de espera: caminar es la mejor opción.
func TestRecommendRoutesPrefersShortWalkOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	portal := graph.Stops["PAR-PORTAL-01"]
	origin := locationPoint(portal.Latitude+0.0005, portal.Longitude)
	destination := locationPoint(portal.Latitude-0.0005, portal.Longitude)
	routes, err := recommendRoutes(graph, origin, destination, 3, defaultCostWeights(), maxWalkDistanceMeters)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	best := routes[0]
	if len(best) != 1 || best[0].From != userLocationID || best[0].Edge.ToStopID != destinationLocationID {
		t.Fatalf("best route = %+v, want the direct walk", best)
	}
	assertSortedByCost(t, routes, defaultCostWeights())
}
