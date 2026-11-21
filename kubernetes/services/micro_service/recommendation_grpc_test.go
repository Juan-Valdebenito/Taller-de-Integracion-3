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

func TestWeatherFromProto(t *testing.T) {
	if weatherFromProto(nil) != nil {
		t.Fatal("missing weather should be nil, not 0 °C")
	}
	weather := weatherFromProto(&microv1.WeatherConditions{})
	if weather == nil || *weather != (WeatherConditions{}) {
		t.Fatalf("weather at 0 = %+v, want a sent weather at 0 °C", weather)
	}
}
