package main

// Prueba de RecommendRoutes por red sobre toda la red oficial, con cada
// combinación de preferencias. Es la más larga de las pruebas, así que se salta
// con go test -short.

import (
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

// assertRecommendationRules revisa las reglas que cumple toda respuesta válida.
func assertRecommendationRules(t *testing.T, name string, testCase recommendationCase,
	response *microv1.RecommendRoutesResponse, avoidCrowding bool) {
	t.Helper()
	if response.GetTotal() == 0 || int(response.GetTotal()) != len(response.GetRoutes()) {
		t.Fatalf("%s: total = %d with %d routes", name, response.GetTotal(), len(response.GetRoutes()))
	}
	for routeIndex, route := range response.GetRoutes() {
		movements := route.GetMovements()
		if movements[0].GetFromStopId() != testCase.expectedStart || movements[len(movements)-1].GetToStopId() != testCase.expectedEnd {
			t.Fatalf("%s: route %d goes from %s to %s", name, routeIndex, movements[0].GetFromStopId(), movements[len(movements)-1].GetToStopId())
		}
		if routeIndex > 0 && route.GetCost().GetTotal() < response.GetRoutes()[routeIndex-1].GetCost().GetTotal() {
			t.Fatalf("%s: route %d costs less than route %d", name, routeIndex, routeIndex-1)
		}
		if !avoidCrowding && route.GetCost().GetCrowding() != 0 {
			t.Fatalf("%s: route %d has crowding although avoid_crowding is false", name, routeIndex)
		}
	}
}

// Para las 126 consultas de la red oficial, con cada prioridad y con
// avoid_crowding en true y en false, y con micros llenas: la respuesta por red es
// idéntica a la calculada directo, informa las preferencias pedidas y cumple las
// reglas de toda respuesta.
func TestRecommendRoutesOverNetworkWithEveryPreferenceOnOfficialNetwork(t *testing.T) {
	if testing.Short() {
		t.Skip("long test: it runs 1008 requests over the network")
	}
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	occupancy := fullLinesOccupancy(graph, "L1C")
	for _, priority := range routePriorities() {
		for _, avoidCrowding := range []bool{true, false} {
			for _, testCase := range officialNetworkCases(graph) {
				avoidCrowdingValue := avoidCrowding
				// Una sola ruta por consulta: las alternativas ya se prueban en otras
				// pruebas, y pedir 3 triplica el tiempo de esta.
				request := &microv1.RecommendRoutesRequest{
					Origin: pointMessage(testCase.origin), Destination: pointMessage(testCase.destination), Limit: 1,
					Preferences:   &microv1.RoutePreferences{Priority: string(priority), AvoidCrowding: &avoidCrowdingValue},
					LineOccupancy: occupancy,
				}
				name := testCase.name + " with " + string(priority)
				response := recommendOverNetwork(t, client, request)
				expectedResponse, err := answerRecommendRoutes(graph, request)
				if err != nil || !proto.Equal(response, expectedResponse) {
					t.Fatalf("%s: the response changed over the network (err = %v)", name, err)
				}
				reported := response.GetPreferences()
				if reported.GetPriority() != string(priority) || reported.GetAvoidCrowding() != avoidCrowding {
					t.Fatalf("%s: reported preferences = %v", name, reported)
				}
				assertRecommendationRules(t, name, testCase, response, avoidCrowding)
			}
		}
	}
}
