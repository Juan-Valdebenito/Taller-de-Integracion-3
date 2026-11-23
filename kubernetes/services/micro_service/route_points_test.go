package main

import (
	"errors"
	"math"
	"testing"
)

func stopPoint(stopID string) RoutePoint {
	return RoutePoint{StopID: stopID}
}

func locationPoint(latitude, longitude float64) RoutePoint {
	return RoutePoint{HasLocation: true, Latitude: latitude, Longitude: longitude}
}

func TestValidateRoutePointsAcceptsStopsAndLocations(t *testing.T) {
	graph := arrivalTestGraph()
	validPairs := [][2]RoutePoint{
		{stopPoint("ONLY_DEPARTS"), stopPoint("ONLY_ARRIVES")},
		{locationPoint(destinationTestLatitude, destinationTestLongitude), stopPoint("BOTH")},
		{stopPoint("BOTH"), locationPoint(destinationTestLatitude, destinationTestLongitude)},
		// Una coordenada en 0 es válida: se envió, aunque valga 0.
		{locationPoint(0, 0), locationPoint(destinationTestLatitude, destinationTestLongitude)},
	}
	for _, pair := range validPairs {
		if err := validateRoutePoints(graph, pair[0], pair[1]); err != nil {
			t.Fatalf("validateRoutePoints(%+v, %+v) returned error: %v", pair[0], pair[1], err)
		}
	}
}

func TestValidateRoutePointsReportsEachError(t *testing.T) {
	graph := arrivalTestGraph()
	validPoint := stopPoint("BOTH")
	bothForms := RoutePoint{StopID: "BOTH", HasLocation: true, Latitude: destinationTestLatitude, Longitude: destinationTestLongitude}
	testCases := []struct {
		name          string
		origin        RoutePoint
		destination   RoutePoint
		expectedError error
	}{
		{"origin missing", RoutePoint{}, validPoint, errInvalidRecommendationOrigin},
		{"origin with both forms", bothForms, validPoint, errInvalidRecommendationOrigin},
		{"origin stop unknown", stopPoint("NOWHERE"), validPoint, errUnknownOriginStop},
		{"origin out of range", locationPoint(91, 0), validPoint, errInvalidLocation},
		{"origin not a number", locationPoint(math.NaN(), 0), validPoint, errInvalidLocation},
		{"destination missing", validPoint, RoutePoint{}, errInvalidRecommendationDestination},
		{"destination with both forms", validPoint, bothForms, errInvalidRecommendationDestination},
		{"destination stop unknown", validPoint, stopPoint("NOWHERE"), errUnknownDestinationStop},
		{"destination out of range", validPoint, locationPoint(0, 181), errInvalidLocation},
		{"origin is checked first", RoutePoint{}, RoutePoint{}, errInvalidRecommendationOrigin},
	}
	for _, testCase := range testCases {
		if err := validateRoutePoints(graph, testCase.origin, testCase.destination); !errors.Is(err, testCase.expectedError) {
			t.Fatalf("%s: error = %v, want %v", testCase.name, err, testCase.expectedError)
		}
	}
}

func TestEndpointsFromStopHaveNoWalk(t *testing.T) {
	graph := arrivalTestGraph()
	origins, err := originEndpoints(graph, stopPoint("ONLY_DEPARTS"), maxWalkDistanceMeters)
	if err != nil || len(origins) != 1 || origins[0].StopID != "ONLY_DEPARTS" || origins[0].Walk != nil {
		t.Fatalf("origin endpoints = %+v, %v; want only ONLY_DEPARTS without walk", origins, err)
	}
	destinations, err := destinationEndpoints(graph, stopPoint("ONLY_ARRIVES"), maxWalkDistanceMeters)
	if err != nil || len(destinations) != 1 || destinations[0].StopID != "ONLY_ARRIVES" || destinations[0].Walk != nil {
		t.Fatalf("destination endpoints = %+v, %v; want only ONLY_ARRIVES without walk", destinations, err)
	}
}

func TestOriginEndpointsFromLocationStartWithWalk(t *testing.T) {
	origins, err := originEndpoints(arrivalTestGraph(), locationPoint(destinationTestLatitude, destinationTestLongitude), maxWalkDistanceMeters)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(origins) != 2 || origins[0].StopID != "ONLY_DEPARTS" || origins[1].StopID != "BOTH" {
		t.Fatalf("origin endpoints = %+v, want ONLY_DEPARTS and BOTH", origins)
	}
	for _, origin := range origins {
		if origin.Walk == nil || origin.Walk.From != userLocationID || origin.Walk.Edge.ToStopID != origin.StopID {
			t.Fatalf("%s: walk = %+v, want from %s to the stop", origin.StopID, origin.Walk, userLocationID)
		}
	}
}

func TestDestinationEndpointsFromLocationEndWithWalk(t *testing.T) {
	destinations, err := destinationEndpoints(arrivalTestGraph(), locationPoint(destinationTestLatitude, destinationTestLongitude), maxWalkDistanceMeters)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(destinations) != 2 || destinations[0].StopID != "ONLY_ARRIVES" || destinations[1].StopID != "BOTH" {
		t.Fatalf("destination endpoints = %+v, want ONLY_ARRIVES and BOTH", destinations)
	}
	for _, destination := range destinations {
		if destination.Walk == nil || destination.Walk.From != destination.StopID || destination.Walk.Edge.ToStopID != destinationLocationID {
			t.Fatalf("%s: walk = %+v, want from the stop to %s", destination.StopID, destination.Walk, destinationLocationID)
		}
	}
}

// Sin paraderos a distancia caminable, cada lado informa su propio error.
func TestEndpointsReportNoNearbyStops(t *testing.T) {
	graph := arrivalTestGraph()
	farAway := locationPoint(destinationTestLatitude-0.1, destinationTestLongitude)
	if _, err := originEndpoints(graph, farAway, maxWalkDistanceMeters); !errors.Is(err, errNoNearbyStops) {
		t.Fatalf("origin error = %v, want errNoNearbyStops", err)
	}
	if _, err := destinationEndpoints(graph, farAway, maxWalkDistanceMeters); !errors.Is(err, errNoStopsNearDestination) {
		t.Fatalf("destination error = %v, want errNoStopsNearDestination", err)
	}
}

// La caminata máxima del pasajero también limita los paraderos de cada lado.
func TestEndpointsRespectMaxWalk(t *testing.T) {
	graph := arrivalTestGraph()
	point := locationPoint(destinationTestLatitude, destinationTestLongitude)
	origins, _ := originEndpoints(graph, point, 200)
	if len(origins) != 1 || origins[0].StopID != "ONLY_DEPARTS" {
		t.Fatalf("origins within 200 m = %+v, want only ONLY_DEPARTS", origins)
	}
	if _, err := destinationEndpoints(graph, point, 200); !errors.Is(err, errNoStopsNearDestination) {
		t.Fatalf("destination error within 200 m = %v, want errNoStopsNearDestination", err)
	}
}
