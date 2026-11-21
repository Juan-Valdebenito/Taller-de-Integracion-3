package main

import (
	"errors"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
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
