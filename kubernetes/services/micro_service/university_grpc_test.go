package main

import (
	"context"
	"errors"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/protobuf/proto"
)

func TestListCampusesReturnsCatalog(t *testing.T) {
	response, err := (&microGRPCServer{}).ListCampuses(context.Background(), &microv1.ListCampusesRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if len(response.GetCampuses()) != len(universityCampuses) {
		t.Fatalf("se esperaban %d campus y se obtuvieron %d", len(universityCampuses), len(response.GetCampuses()))
	}
	for campusIndex, campus := range universityCampuses {
		message := response.GetCampuses()[campusIndex]
		if message.GetId() != campus.ID || message.GetName() != campus.Name || len(message.GetStopIds()) != len(campus.StopIDs) {
			t.Errorf("campus inesperado: %+v", message)
		}
	}
}

func TestProtoRequestUsesDefaultLimit(t *testing.T) {
	routeRequest, err := universityRouteRequestFromProto(&microv1.PlanUniversityRoutesRequest{OriginStopId: "PAR-PORTAL-01"})
	if err != nil {
		t.Fatal(err)
	}
	if routeRequest.Limit != defaultUniversityRoutes || routeRequest.HasLocation {
		t.Errorf("petición inesperada: %+v", routeRequest)
	}
}

func TestProtoRequestKeepsLocationAndCampus(t *testing.T) {
	routeRequest, err := universityRouteRequestFromProto(&microv1.PlanUniversityRoutesRequest{
		Latitude:  proto.Float64(-38.7),
		Longitude: proto.Float64(-72.6),
		CampusId:  "san-francisco",
		Limit:     2,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !routeRequest.HasLocation || routeRequest.Latitude != -38.7 || routeRequest.Longitude != -72.6 ||
		routeRequest.CampusID != "san-francisco" || routeRequest.Limit != 2 {
		t.Errorf("petición inesperada: %+v", routeRequest)
	}
}

// Una coordenada en 0 es un valor enviado, no una coordenada ausente.
func TestProtoRequestTreatsZeroAsSentCoordinate(t *testing.T) {
	routeRequest, err := universityRouteRequestFromProto(&microv1.PlanUniversityRoutesRequest{
		Latitude:  proto.Float64(0),
		Longitude: proto.Float64(0),
	})
	if err != nil || !routeRequest.HasLocation {
		t.Errorf("la posición 0, 0 debe contar como enviada: %+v, %v", routeRequest, err)
	}
}

func TestProtoRequestRejectsHalfLocation(t *testing.T) {
	_, err := universityRouteRequestFromProto(&microv1.PlanUniversityRoutesRequest{Latitude: proto.Float64(-38.7)})
	if !errors.Is(err, errInvalidLocation) {
		t.Errorf("se esperaba errInvalidLocation y se obtuvo %v", err)
	}
}

func TestUniversityRouteErrorCodes(t *testing.T) {
	testCases := []struct {
		err          error
		expectedCode codes.Code
	}{
		{errUnknownCampus, codes.NotFound},
		{errUnknownOriginStop, codes.NotFound},
		{errNoNearbyStops, codes.NotFound},
		{errInvalidRouteLimit, codes.InvalidArgument},
		{errInvalidOrigin, codes.InvalidArgument},
		{errInvalidLocation, codes.InvalidArgument},
	}
	for _, testCase := range testCases {
		if code := universityRouteErrorCode(testCase.err); code != testCase.expectedCode {
			t.Errorf("%v: se esperaba %s y se obtuvo %s", testCase.err, testCase.expectedCode, code)
		}
	}
}

func TestMicroUniversityRouteKeepsTotals(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-PORTAL-01", "san-juan-pablo-ii", 1)
	if err != nil || len(routes) != 1 {
		t.Fatalf("se esperaba una ruta: %+v, %v", routes, err)
	}
	message := microUniversityRoute(routes[0])
	if message.GetCampusId() != "san-juan-pablo-ii" || int(message.GetTotalTimeSeconds()) != pathSeconds(routes[0].Path) {
		t.Errorf("mensaje inesperado: %+v", message)
	}
	if len(message.GetMovements()) != len(routes[0].Path) || message.GetMovements()[0].GetMode() != "bus" {
		t.Errorf("tramos inesperados: %+v", message.GetMovements())
	}
}
