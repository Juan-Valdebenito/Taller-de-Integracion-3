package main

import (
	"errors"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

func TestRoutePointFromProtoReadsStop(t *testing.T) {
	message := &microv1.RoutePoint{Point: &microv1.RoutePoint_StopId{StopId: "PAR-PORTAL-01"}}
	point := routePointFromProto(message)
	if point != (RoutePoint{StopID: "PAR-PORTAL-01"}) {
		t.Fatalf("point = %+v, want the stop", point)
	}
}

func TestRoutePointFromProtoReadsLocation(t *testing.T) {
	message := &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{
		Location: &microv1.Coordinates{Latitude: -38.735, Longitude: -72.612},
	}}
	point := routePointFromProto(message)
	expectedPoint := RoutePoint{HasLocation: true, Latitude: -38.735, Longitude: -72.612}
	if point != expectedPoint {
		t.Fatalf("point = %+v, want %+v", point, expectedPoint)
	}
}

// Una coordenada en 0,0 se envió, aunque valga 0: no es lo mismo que no enviarla.
func TestRoutePointFromProtoKeepsZeroLocation(t *testing.T) {
	message := &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{Location: &microv1.Coordinates{}}}
	point := routePointFromProto(message)
	if point != (RoutePoint{HasLocation: true}) {
		t.Fatalf("point = %+v, want a location at 0,0", point)
	}
}

// Todo lo que no trae un punto real queda vacío, para que la validación lo
// rechace con el error del lado que corresponda.
func TestRoutePointFromProtoLeavesMissingPointsEmpty(t *testing.T) {
	missingPoints := map[string]*microv1.RoutePoint{
		"no message":          nil,
		"no point":            {},
		"empty stop":          {Point: &microv1.RoutePoint_StopId{StopId: ""}},
		"location no message": {Point: &microv1.RoutePoint_Location{Location: nil}},
	}
	for name, message := range missingPoints {
		if point := routePointFromProto(message); point != (RoutePoint{}) {
			t.Fatalf("%s: point = %+v, want empty", name, point)
		}
	}
}

// Los puntos traducidos se validan con las mismas reglas que el planificador:
// un punto vacío como origen da el error del origen, y como destino, el del
// destino.
func TestTranslatedMissingPointsReportTheirSide(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	validPoint := routePointFromProto(&microv1.RoutePoint{Point: &microv1.RoutePoint_StopId{StopId: "PAR-PORTAL-01"}})
	missingPoint := routePointFromProto(nil)
	if err := validateRoutePoints(graph, missingPoint, validPoint); !errors.Is(err, errInvalidRecommendationOrigin) {
		t.Fatalf("missing origin error = %v, want errInvalidRecommendationOrigin", err)
	}
	if err := validateRoutePoints(graph, validPoint, missingPoint); !errors.Is(err, errInvalidRecommendationDestination) {
		t.Fatalf("missing destination error = %v, want errInvalidRecommendationDestination", err)
	}
}

func stopMessage(stopID string) *microv1.RoutePoint {
	return &microv1.RoutePoint{Point: &microv1.RoutePoint_StopId{StopId: stopID}}
}

func TestRecommendationRequestFromProtoReadsEveryField(t *testing.T) {
	avoidCrowding := false
	request, err := recommendationRequestFromProto(&microv1.RecommendRoutesRequest{
		Origin: stopMessage("PAR-PORTAL-01"),
		Destination: &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{
			Location: &microv1.Coordinates{Latitude: -38.74, Longitude: -72.6},
		}},
		Limit:         5,
		Preferences:   &microv1.RoutePreferences{Priority: "least_walking", MaxWalkMeters: 400, AvoidCrowding: &avoidCrowding},
		LineOccupancy: map[string]float64{"L7A": 0.9},
		Weather:       &microv1.WeatherConditions{TemperatureC: 3, WindSpeedKmh: 10, Pm25: 60},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if request.Origin != stopPoint("PAR-PORTAL-01") || request.Destination != locationPoint(-38.74, -72.6) {
		t.Fatalf("points = %+v -> %+v", request.Origin, request.Destination)
	}
	if request.Limit != 5 {
		t.Fatalf("limit = %d, want 5", request.Limit)
	}
	expectedPreferences := RoutePreferences{Priority: priorityLeastWalking, MaxWalkMeters: 400, AvoidCrowding: false}
	if request.Preferences == nil || *request.Preferences != expectedPreferences {
		t.Fatalf("preferences = %+v, want %+v", request.Preferences, expectedPreferences)
	}
	if request.LineOccupancy["L7A"] != 0.9 {
		t.Fatalf("occupancy = %v, want L7A at 0.9", request.LineOccupancy)
	}
	expectedWeather := WeatherConditions{TemperatureC: 3, WindSpeedKmh: 10, PM25: 60}
	if request.Weather == nil || *request.Weather != expectedWeather {
		t.Fatalf("weather = %+v, want %+v", request.Weather, expectedWeather)
	}
}

// Lo que no se envía toma su valor por defecto: 3 rutas, preferencias por
// defecto (nil) y sin clima (nil, no 0 °C).
func TestRecommendationRequestFromProtoUsesDefaults(t *testing.T) {
	request, err := recommendationRequestFromProto(&microv1.RecommendRoutesRequest{
		Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CSF-01"),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if request.Limit != defaultRecommendedRoutes {
		t.Fatalf("limit = %d, want %d", request.Limit, defaultRecommendedRoutes)
	}
	if request.Preferences != nil || request.Weather != nil || len(request.LineOccupancy) != 0 {
		t.Fatalf("request = %+v, want no preferences, weather or occupancy", request)
	}
}

// El límite se traduce tal cual: si está fuera de rango, lo rechaza la validación
// común, igual que en las demás API.
func TestRecommendationRequestFromProtoKeepsOutOfRangeLimit(t *testing.T) {
	for _, limit := range []int32{-1, 6} {
		request, err := recommendationRequestFromProto(&microv1.RecommendRoutesRequest{Limit: limit})
		if err != nil || request.Limit != int(limit) {
			t.Fatalf("limit %d: request limit = %d, err = %v", limit, request.Limit, err)
		}
	}
}

func TestRecommendationRequestFromProtoRejectsInvalidPreferences(t *testing.T) {
	_, err := recommendationRequestFromProto(&microv1.RecommendRoutesRequest{
		Preferences: &microv1.RoutePreferences{Priority: "slowest"},
	})
	if !errors.Is(err, errInvalidRoutePriority) {
		t.Fatalf("error = %v, want errInvalidRoutePriority", err)
	}
}

// Una ruta desde una coordenada hasta otra: caminata inicial, micro y caminata
// final. Los tramos a pie no traen línea ni viaje.
func TestMicroMovementsKeepEveryStepInOrder(t *testing.T) {
	path := []pathStep{
		{From: userLocationID, Edge: Edge{ToStopID: "A", RouteID: walkRouteID, BaseTimeSec: 84, DistanceM: 100}},
		{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L1C", TripID: "L1C-IDA", BaseTimeSec: 240, DistanceM: 950}},
		{From: "B", Edge: Edge{ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: 46, DistanceM: 55}},
	}
	movements := microMovements(path)
	expectedMovements := []*microv1.Movement{
		{FromStopId: userLocationID, ToStopId: "A", Mode: "walk", TimeSeconds: 84, DistanceMeters: 100},
		{FromStopId: "A", ToStopId: "B", Mode: "bus", RouteId: "L1C", TripId: "L1C-IDA", TimeSeconds: 240, DistanceMeters: 950},
		{FromStopId: "B", ToStopId: destinationLocationID, Mode: "walk", TimeSeconds: 46, DistanceMeters: 55},
	}
	if len(movements) != len(expectedMovements) {
		t.Fatalf("got %d movements, want %d", len(movements), len(expectedMovements))
	}
	for movementIndex, expectedMovement := range expectedMovements {
		if !proto.Equal(movements[movementIndex], expectedMovement) {
			t.Fatalf("movement %d = %v, want %v", movementIndex, movements[movementIndex], expectedMovement)
		}
	}
}

// Las rutas a la universidad y las recomendadas convierten los tramos igual.
func TestMicroMovementsMatchUniversityRoutes(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-PORTAL-01", "", 3, defaultCostWeights())
	if err != nil || len(routes) == 0 {
		t.Fatalf("routes = %v, err = %v", routes, err)
	}
	for _, route := range routes {
		universityMovements := microUniversityRoute(route, defaultCostWeights()).GetMovements()
		recommendedMovements := microMovements(route.Path)
		if len(universityMovements) != len(recommendedMovements) {
			t.Fatalf("got %d and %d movements", len(universityMovements), len(recommendedMovements))
		}
		for movementIndex := range universityMovements {
			if !proto.Equal(universityMovements[movementIndex], recommendedMovements[movementIndex]) {
				t.Fatalf("movement %d differs: %v and %v", movementIndex, universityMovements[movementIndex], recommendedMovements[movementIndex])
			}
		}
	}
}

// Caminata, L1C, cambio a L7A y caminata: 1 transbordo. Las caminatas no cuentan
// como cambio de línea.
func TestMicroRecommendedRouteReportsTotals(t *testing.T) {
	path := []pathStep{
		{From: userLocationID, Edge: Edge{ToStopID: "A", RouteID: walkRouteID, BaseTimeSec: 84, DistanceM: 100}},
		{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L1C", BaseTimeSec: 240, DistanceM: 950}},
		{From: "B", Edge: Edge{ToStopID: "C", RouteID: "L7A", BaseTimeSec: 1500, DistanceM: 6000}},
		{From: "C", Edge: Edge{ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: 46, DistanceM: 55}},
	}
	route := microRecommendedRoute(path, defaultCostWeights())
	if route.GetTotalTimeSeconds() != 1870 || route.GetTotalDistanceMeters() != 7105 {
		t.Fatalf("totals = %d s and %d m, want 1870 s and 7105 m", route.GetTotalTimeSeconds(), route.GetTotalDistanceMeters())
	}
	if route.GetTransfers() != 1 {
		t.Fatalf("transfers = %d, want 1", route.GetTransfers())
	}
	if len(route.GetMovements()) != len(path) {
		t.Fatalf("got %d movements, want %d", len(route.GetMovements()), len(path))
	}
}

// Caminar todo el trayecto es una ruta de un solo tramo, sin transbordos.
func TestMicroRecommendedRouteOfDirectWalk(t *testing.T) {
	path := []pathStep{{From: userLocationID, Edge: Edge{
		ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: 93, DistanceM: 111,
	}}}
	route := microRecommendedRoute(path, defaultCostWeights())
	if route.GetTotalTimeSeconds() != 93 || route.GetTotalDistanceMeters() != 111 || route.GetTransfers() != 0 {
		t.Fatalf("route = %v, want 93 s, 111 m and no transfers", route)
	}
	if len(route.GetMovements()) != 1 || route.GetMovements()[0].GetMode() != "walk" {
		t.Fatalf("movements = %v, want one walk", route.GetMovements())
	}
}

// Para una misma ruta, las rutas a la universidad y las recomendadas informan los
// mismos totales, transbordos y costo.
func TestMicroRecommendedRouteMatchesUniversityRoute(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-PORTAL-01", "", 3, defaultCostWeights())
	if err != nil || len(routes) == 0 {
		t.Fatalf("routes = %v, err = %v", routes, err)
	}
	for _, universityRoute := range routes {
		expected := microUniversityRoute(universityRoute, defaultCostWeights())
		recommended := microRecommendedRoute(universityRoute.Path, defaultCostWeights())
		if recommended.GetTotalTimeSeconds() != expected.GetTotalTimeSeconds() ||
			recommended.GetTotalDistanceMeters() != expected.GetTotalDistanceMeters() ||
			recommended.GetTransfers() != expected.GetTransfers() ||
			!proto.Equal(recommended.GetCost(), expected.GetCost()) {
			t.Fatalf("recommended %v differs from university %v", recommended, expected)
		}
	}
}

// Caminata de 84 s, L1C de 240 s y caminata de 46 s, con los pesos por defecto:
// caminar 130 × 2 = 260, viajar 240 y esperar 300 × 2 = 600. Total 1100.
func TestMicroRecommendedRouteReportsCost(t *testing.T) {
	path := []pathStep{
		{From: userLocationID, Edge: Edge{ToStopID: "A", RouteID: walkRouteID, BaseTimeSec: 84}},
		{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L1C", BaseTimeSec: 240}},
		{From: "B", Edge: Edge{ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: 46}},
	}
	cost := microRecommendedRoute(path, defaultCostWeights()).GetCost()
	expectedCost := &microv1.CostBreakdown{Ride: 240, Walk: 260, Wait: 600, Total: 1100}
	if !proto.Equal(cost, expectedCost) {
		t.Fatalf("cost = %v, want %v", cost, expectedCost)
	}
}

// El costo usa los pesos recibidos: con fastest, el costo es el tiempo real con
// la espera, 370 + 300 = 670.
func TestMicroRecommendedRouteCostUsesWeights(t *testing.T) {
	path := []pathStep{
		{From: userLocationID, Edge: Edge{ToStopID: "A", RouteID: walkRouteID, BaseTimeSec: 84}},
		{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L1C", BaseTimeSec: 240}},
		{From: "B", Edge: Edge{ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: 46}},
	}
	cost := microRecommendedRoute(path, priorityCostWeights(priorityFastest)).GetCost()
	if cost.GetTotal() != 670 {
		t.Fatalf("total = %v, want 670", cost.GetTotal())
	}
}

// microCostBreakdown copia cada componente sin cambiarlo.
func TestMicroCostBreakdownCopiesEveryComponent(t *testing.T) {
	cost := microCostBreakdown(costBreakdownResponse{
		Ride: 1, Walk: 2, Wait: 3, Transfer: 4, Crowding: 5, Weather: 6, Total: 21,
	})
	expectedCost := &microv1.CostBreakdown{Ride: 1, Walk: 2, Wait: 3, Transfer: 4, Crowding: 5, Weather: 6, Total: 21}
	if !proto.Equal(cost, expectedCost) {
		t.Fatalf("cost = %v, want %v", cost, expectedCost)
	}
}

func TestWeatherFromProto(t *testing.T) {
	if weatherFromProto(nil) != nil {
		t.Fatal("missing weather should be nil, not 0 °C")
	}
	weather := weatherFromProto(&microv1.WeatherConditions{})
	if weather == nil || *weather != (WeatherConditions{}) {
		t.Fatalf("weather at 0 = %+v, want a sent weather at 0 °C", weather)
	}
}
