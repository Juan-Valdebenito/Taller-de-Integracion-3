package main

// Pruebas de las preferencias en PlanUniversityRoutes por red (bufconn). Hasta
// ahora gRPC traducía las preferencias, pero no las aplicaba: estas pruebas
// confirman que se aplican igual que en REST.

import (
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

func planUniversityOverNetwork(t *testing.T, client microv1.MicroServiceClient, request *microv1.PlanUniversityRoutesRequest) *microv1.PlanUniversityRoutesResponse {
	t.Helper()
	response, err := client.PlanUniversityRoutes(authorizedContext(t), request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return response
}

// Con cada prioridad, los pesos informados son los de esa prioridad, y la
// respuesta informa las preferencias usadas.
func TestPlanUniversityRoutesOverNetworkAppliesPriority(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	for _, priority := range routePriorities() {
		response := planUniversityOverNetwork(t, client, &microv1.PlanUniversityRoutesRequest{
			OriginStopId: "PAR-PORTAL-01", Preferences: &microv1.RoutePreferences{Priority: string(priority)},
		})
		if !proto.Equal(response.GetCostWeights(), microCostWeights(priorityCostWeights(priority))) {
			t.Fatalf("%s: cost weights = %v, want the weights of the priority", priority, response.GetCostWeights())
		}
		if response.GetPreferences().GetPriority() != string(priority) {
			t.Fatalf("%s: reported priority = %q", priority, response.GetPreferences().GetPriority())
		}
	}
}

// Sin preferencias, todo sigue como antes: los pesos de siempre, y ahora también
// se informan las preferencias por defecto.
func TestPlanUniversityRoutesOverNetworkWithoutPreferences(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	response := planUniversityOverNetwork(t, client, &microv1.PlanUniversityRoutesRequest{OriginStopId: "PAR-PORTAL-01"})
	if !proto.Equal(response.GetCostWeights(), microCostWeights(defaultCostWeights())) {
		t.Fatalf("cost weights = %v, want the default weights", response.GetCostWeights())
	}
	if !proto.Equal(response.GetPreferences(), microRoutePreferences(defaultRoutePreferences())) {
		t.Fatalf("preferences = %v, want the defaults", response.GetPreferences())
	}
}

// gRPC y REST dan lo mismo con las mismas preferencias: el mismo orden, los
// mismos costos y las mismas preferencias informadas.
func TestPlanUniversityRoutesOverNetworkMatchesREST(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	notAvoiding := false
	response := planUniversityOverNetwork(t, client, &microv1.PlanUniversityRoutesRequest{
		OriginStopId:  "PAR-PORTAL-01",
		LineOccupancy: map[string]float64{"L7B": 0.95},
		Preferences:   &microv1.RoutePreferences{Priority: "least_walking", MaxWalkMeters: 400, AvoidCrowding: &notAvoiding},
	})
	preferences := RoutePreferences{Priority: priorityLeastWalking, MaxWalkMeters: 400, AvoidCrowding: false}
	routeRequest := universityRouteRequest{
		OriginStopID: "PAR-PORTAL-01", Limit: defaultUniversityRoutes,
		LineOccupancy: LineOccupancy{"L7B": 0.95}, Preferences: &preferences,
	}
	expectedRoutes, err := planUniversityRoutes(graph, routeRequest)
	if err != nil || len(expectedRoutes) != len(response.GetRoutes()) {
		t.Fatalf("got %d routes, want %d (err = %v)", len(response.GetRoutes()), len(expectedRoutes), err)
	}
	for routeIndex, expectedRoute := range expectedRoutes {
		if !proto.Equal(response.GetRoutes()[routeIndex], microUniversityRoute(expectedRoute, routeRequest.costWeights())) {
			t.Fatalf("route %d differs from the direct planner", routeIndex)
		}
	}
	if response.GetPreferences().GetMaxWalkMeters() != 400 || response.GetPreferences().GetAvoidCrowding() {
		t.Fatalf("preferences = %v, want 400 m and avoid_crowding false", response.GetPreferences())
	}
}

// Con avoid_crowding en false, una micro llena no recibe recargo.
func TestPlanUniversityRoutesOverNetworkIgnoreCrowdingWhenNotAvoiding(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	notAvoiding := false
	response := planUniversityOverNetwork(t, client, &microv1.PlanUniversityRoutesRequest{
		OriginStopId:  "PAR-PORTAL-01",
		LineOccupancy: fullLinesOccupancy(loadSeedNetwork(t).buildGraph(), ""),
		Preferences:   &microv1.RoutePreferences{AvoidCrowding: &notAvoiding},
	})
	for routeIndex, route := range response.GetRoutes() {
		if route.GetCost().GetCrowding() != 0 {
			t.Fatalf("route %d has a crowding surcharge of %v", routeIndex, route.GetCost().GetCrowding())
		}
	}
}

// Una preferencia inválida responde InvalidArgument con su mensaje.
func TestPlanUniversityRoutesOverNetworkRejectsInvalidPreferences(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	testCases := map[string]struct {
		preferences     *microv1.RoutePreferences
		expectedMessage string
	}{
		"unknown priority":  {&microv1.RoutePreferences{Priority: "slowest"}, errInvalidRoutePriority.Error()},
		"max walk too long": {&microv1.RoutePreferences{MaxWalkMeters: 5000}, errInvalidMaxWalk.Error()},
	}
	for name, testCase := range testCases {
		_, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
			OriginStopId: "PAR-PORTAL-01", Preferences: testCase.preferences,
		})
		errorStatus, _ := status.FromError(err)
		if errorStatus.Code() != codes.InvalidArgument || errorStatus.Message() != testCase.expectedMessage {
			t.Fatalf("%s: error = %v, want InvalidArgument %q", name, err, testCase.expectedMessage)
		}
	}
}
