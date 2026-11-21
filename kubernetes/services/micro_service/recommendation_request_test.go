package main

import (
	"errors"
	"math"
	"reflect"
	"testing"
)

// validRecommendationRequest va del Portal a una coordenada cerca del campus San
// Juan Pablo II, con los valores por defecto.
func validRecommendationRequest(graph *TransitGraph) recommendationRequest {
	return recommendationRequest{
		Origin:      stopPoint("PAR-PORTAL-01"),
		Destination: pointNearStop(graph, "PAR-CJP-02"),
		Limit:       defaultRecommendedRoutes,
	}
}

func TestPlanRecommendationsMatchesPlanner(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routeRequest := validRecommendationRequest(graph)
	routes, err := planRecommendations(graph, routeRequest)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectedRoutes, _ := recommendRoutes(graph, routeRequest.Origin, routeRequest.Destination,
		routeRequest.Limit, defaultCostWeights(), maxWalkDistanceMeters)
	if len(routes) == 0 || !reflect.DeepEqual(routes, expectedRoutes) {
		t.Fatalf("routes differ from recommendRoutes with default weights")
	}
}

// Cada error tiene su caso. Si hay varios, gana el primero en el orden de
// validate: límite, puntos, ocupación, clima y preferencias.
func TestPlanRecommendationsReportsEachError(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	testCases := []struct {
		name          string
		change        func(routeRequest *recommendationRequest)
		expectedError error
	}{
		{"limit zero", func(routeRequest *recommendationRequest) { routeRequest.Limit = 0 }, errInvalidRouteLimit},
		{"limit too high", func(routeRequest *recommendationRequest) { routeRequest.Limit = 6 }, errInvalidRouteLimit},
		{"missing origin", func(routeRequest *recommendationRequest) { routeRequest.Origin = RoutePoint{} }, errInvalidRecommendationOrigin},
		{"unknown destination", func(routeRequest *recommendationRequest) { routeRequest.Destination = stopPoint("NOWHERE") }, errUnknownDestinationStop},
		{"same point", func(routeRequest *recommendationRequest) { routeRequest.Destination = routeRequest.Origin }, errSameOriginAndDestination},
		{"invalid occupancy", func(routeRequest *recommendationRequest) {
			routeRequest.LineOccupancy = LineOccupancy{"L7A": math.NaN()}
		}, errInvalidOccupancy},
		{"invalid weather", func(routeRequest *recommendationRequest) {
			routeRequest.Weather = &WeatherConditions{TemperatureC: 99}
		}, errInvalidWeather},
		{"invalid preferences", func(routeRequest *recommendationRequest) {
			routeRequest.Preferences = &RoutePreferences{MaxWalkMeters: 50}
		}, errInvalidMaxWalk},
		{"limit before points", func(routeRequest *recommendationRequest) {
			routeRequest.Limit, routeRequest.Origin = 0, RoutePoint{}
		}, errInvalidRouteLimit},
		{"points before weather", func(routeRequest *recommendationRequest) {
			routeRequest.Origin, routeRequest.Weather = RoutePoint{}, &WeatherConditions{TemperatureC: 99}
		}, errInvalidRecommendationOrigin},
	}
	for _, testCase := range testCases {
		routeRequest := validRecommendationRequest(graph)
		testCase.change(&routeRequest)
		if _, err := planRecommendations(graph, routeRequest); !errors.Is(err, testCase.expectedError) {
			t.Fatalf("%s: error = %v, want %v", testCase.name, err, testCase.expectedError)
		}
	}
}

func TestRecommendationRequestDefaultPreferences(t *testing.T) {
	routeRequest := recommendationRequest{}
	if routeRequest.preferences() != defaultRoutePreferences() {
		t.Fatalf("preferences = %+v, want defaults", routeRequest.preferences())
	}
	partial := recommendationRequest{Preferences: &RoutePreferences{Priority: priorityFastest}}
	expectedPreferences := RoutePreferences{Priority: priorityFastest, MaxWalkMeters: defaultPreferredWalkMeters}
	if partial.preferences() != expectedPreferences {
		t.Fatalf("partial preferences = %+v, want %+v", partial.preferences(), expectedPreferences)
	}
}

// Los pesos usan la prioridad, la ocupación solo si se quieren evitar micros
// llenas, y siempre el clima.
func TestRecommendationRequestCostWeights(t *testing.T) {
	weather := &WeatherConditions{TemperatureC: 3}
	occupancy := LineOccupancy{"L7A": 0.95}
	avoiding := recommendationRequest{
		Preferences:   &RoutePreferences{Priority: priorityLeastWalking, AvoidCrowding: true},
		LineOccupancy: occupancy, Weather: weather,
	}
	weights := avoiding.costWeights()
	if !sameBaseWeights(weights, priorityCostWeights(priorityLeastWalking)) || weights.Occupancy["L7A"] != 0.95 || weights.Weather != weather {
		t.Fatalf("weights = %+v, want least_walking with occupancy and weather", weights)
	}
	ignoring := avoiding
	ignoring.Preferences = &RoutePreferences{Priority: priorityLeastWalking, AvoidCrowding: false}
	if ignoring.costWeights().Occupancy != nil || ignoring.costWeights().Weather != weather {
		t.Fatalf("weights = %+v, want weather without occupancy", ignoring.costWeights())
	}
}

// La caminata máxima de las preferencias llega al planificador.
func TestPlanRecommendationsUsesMaxWalk(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routeRequest := validRecommendationRequest(graph)
	routeRequest.Preferences = &RoutePreferences{MaxWalkMeters: 200, AvoidCrowding: true}
	routes, err := planRecommendations(graph, routeRequest)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(routes) == 0 {
		t.Fatal("no routes found; the test checks nothing")
	}
	for _, route := range routes {
		for _, step := range route {
			if step.Edge.RouteID == walkRouteID && step.Edge.DistanceM > 200 {
				t.Fatalf("walk of %d m exceeds the 200 m preference", step.Edge.DistanceM)
			}
		}
	}
}
