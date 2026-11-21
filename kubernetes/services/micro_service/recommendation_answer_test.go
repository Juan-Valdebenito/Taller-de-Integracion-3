package main

import (
	"context"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

func locationMessage(point RoutePoint) *microv1.RoutePoint {
	return &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{
		Location: &microv1.Coordinates{Latitude: point.Latitude, Longitude: point.Longitude},
	}}
}

// La respuesta es la misma que se arma a mano con el planificador.
func TestAnswerRecommendRoutesMatchesPlanner(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	destination := pointNearStop(graph, "PAR-CJP-02")
	response, err := answerRecommendRoutes(graph, &microv1.RecommendRoutesRequest{
		Origin: stopMessage("PAR-PORTAL-01"), Destination: locationMessage(destination),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	routeRequest := recommendationRequest{Origin: stopPoint("PAR-PORTAL-01"), Destination: destination, Limit: defaultRecommendedRoutes}
	paths, _ := planRecommendations(graph, routeRequest)
	if !proto.Equal(response, microRecommendRoutesResponse(paths, routeRequest)) {
		t.Fatalf("response differs from the planner")
	}
	if response.GetTotal() == 0 {
		t.Fatal("no routes found; the test compares nothing")
	}
}

// Las preferencias llegan al planificador: con least_walking, los pesos
// informados son los de esa prioridad.
func TestAnswerRecommendRoutesUsesPreferences(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	response, err := answerRecommendRoutes(graph, &microv1.RecommendRoutesRequest{
		Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CSF-01"),
		Preferences: &microv1.RoutePreferences{Priority: "least_walking"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if response.GetCostWeights().GetWalkWeight() != leastWalkingWalkWeight || response.GetPreferences().GetPriority() != "least_walking" {
		t.Fatalf("weights = %v and preferences = %v, want least_walking", response.GetCostWeights(), response.GetPreferences())
	}
}

// recommendationServerWith crea el servidor gRPC con el grafo indicado; nil
// significa que todavía no se cargó.
func recommendationServerWith(graph *TransitGraph) *microGRPCServer {
	store := &GraphStore{}
	store.Replace(graph)
	return &microGRPCServer{service: &Server{store: store}}
}

// El método del servidor entrega lo mismo que answerRecommendRoutes con el grafo
// cargado.
func TestRecommendRoutesMethodUsesLoadedGraph(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	request := &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CJP-02")}
	response, err := recommendationServerWith(graph).RecommendRoutes(context.Background(), request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectedResponse, _ := answerRecommendRoutes(graph, request)
	if response.GetTotal() == 0 || !proto.Equal(response, expectedResponse) {
		t.Fatalf("response = %v, want %v", response, expectedResponse)
	}
}

// Sin grafo cargado responde Unavailable, también ante una petición inválida:
// primero hay que saber si el servicio puede responder.
func TestRecommendRoutesMethodRequiresLoadedGraph(t *testing.T) {
	server := recommendationServerWith(nil)
	for _, request := range []*microv1.RecommendRoutesRequest{
		{Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CJP-02")},
		{},
	} {
		_, err := server.RecommendRoutes(context.Background(), request)
		if status.Code(err) != codes.Unavailable {
			t.Fatalf("error = %v, want Unavailable", err)
		}
	}
}

// La función ya no responde Unimplemented: el servidor la implementa.
func TestRecommendRoutesIsImplemented(t *testing.T) {
	_, err := recommendationServerWith(loadSeedNetwork(t).buildGraph()).RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{})
	if status.Code(err) == codes.Unimplemented {
		t.Fatal("RecommendRoutes is still unimplemented")
	}
}

// Cada tipo de error vuelve como status de gRPC con su código y un mensaje que
// dice qué corregir.
func TestAnswerRecommendRoutesReturnsStatusErrors(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	testCases := []struct {
		name            string
		request         *microv1.RecommendRoutesRequest
		expectedCode    codes.Code
		expectedMessage string
	}{
		{"invalid preferences", &microv1.RecommendRoutesRequest{
			Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CSF-01"),
			Preferences: &microv1.RoutePreferences{Priority: "slowest"},
		}, codes.InvalidArgument, errInvalidRoutePriority.Error()},
		{"missing origin", &microv1.RecommendRoutesRequest{Destination: stopMessage("PAR-CSF-01")},
			codes.InvalidArgument, errInvalidRecommendationOrigin.Error()},
		{"same point", &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-CSF-01"), Destination: stopMessage("PAR-CSF-01")},
			codes.InvalidArgument, errSameOriginAndDestination.Error()},
		{"unknown destination", &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("NOWHERE")},
			codes.NotFound, errUnknownDestinationStop.Error()},
	}
	for _, testCase := range testCases {
		response, err := answerRecommendRoutes(graph, testCase.request)
		if response != nil {
			t.Fatalf("%s: response = %v, want nil", testCase.name, response)
		}
		errorStatus, isStatus := status.FromError(err)
		if !isStatus || errorStatus.Code() != testCase.expectedCode || errorStatus.Message() != testCase.expectedMessage {
			t.Fatalf("%s: error = %v, want %v %q", testCase.name, err, testCase.expectedCode, testCase.expectedMessage)
		}
	}
}
