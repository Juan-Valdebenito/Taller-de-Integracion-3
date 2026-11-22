package main

// Pruebas de las preferencias de RecommendRoutes por red (bufconn). Comprueban
// que las preferencias enviadas por gRPC llegan, se aplican y se informan.

import (
	"errors"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

// preferencesTestRequest va entre dos coordenadas cerca del Portal y del campus
// San Juan Pablo II, con las preferencias indicadas.
func preferencesTestRequest(graph *TransitGraph, preferences *microv1.RoutePreferences) *microv1.RecommendRoutesRequest {
	return &microv1.RecommendRoutesRequest{
		Origin:      locationMessage(pointNearStop(graph, "PAR-PORTAL-01")),
		Destination: locationMessage(pointNearStop(graph, "PAR-CJP-02")),
		Preferences: preferences,
	}
}

// Con cada prioridad, la respuesta informa esa prioridad y sus pesos, y es
// idéntica a la calculada directo.
func TestRecommendRoutesOverNetworkWithEveryPriority(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	for _, priority := range routePriorities() {
		request := preferencesTestRequest(graph, &microv1.RoutePreferences{Priority: string(priority)})
		response := recommendOverNetwork(t, client, request)
		if response.GetPreferences().GetPriority() != string(priority) {
			t.Fatalf("%s: reported priority = %q", priority, response.GetPreferences().GetPriority())
		}
		if !proto.Equal(response.GetCostWeights(), microCostWeights(priorityCostWeights(priority))) {
			t.Fatalf("%s: cost weights = %v, want the weights of the priority", priority, response.GetCostWeights())
		}
		expectedResponse, _ := answerRecommendRoutes(graph, request)
		if response.GetTotal() == 0 || !proto.Equal(response, expectedResponse) {
			t.Fatalf("%s: the response changed over the network or is empty", priority)
		}
	}
}

// La prioridad se lee sin importar mayúsculas ni espacios, y la respuesta la
// informa ya normalizada.
func TestRecommendRoutesOverNetworkNormalizePriority(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	response := recommendOverNetwork(t, client, preferencesTestRequest(graph, &microv1.RoutePreferences{Priority: "  Fewest_Transfers "}))
	if response.GetPreferences().GetPriority() != string(priorityFewestTransfers) {
		t.Fatalf("reported priority = %q, want %q", response.GetPreferences().GetPriority(), priorityFewestTransfers)
	}
}

// Sin preferencias se informa balanced, con los pesos de siempre.
func TestRecommendRoutesOverNetworkWithoutPreferences(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	response := recommendOverNetwork(t, client, preferencesTestRequest(graph, nil))
	if !proto.Equal(response.GetPreferences(), microRoutePreferences(defaultRoutePreferences())) {
		t.Fatalf("preferences = %v, want the defaults", response.GetPreferences())
	}
	if !proto.Equal(response.GetCostWeights(), microCostWeights(defaultCostWeights())) {
		t.Fatalf("cost weights = %v, want the default weights", response.GetCostWeights())
	}
}

// Con cada caminata máxima, en las 126 consultas de la red oficial, ninguna
// caminata la supera, ni al inicio, ni al final, ni entre paraderos, y la
// respuesta informa el valor usado. Con un máximo corto, algunos puntos no tienen
// paraderos cerca y responden NotFound: eso se prueba en otra parte.
func TestRecommendRoutesOverNetworkRespectMaxWalk(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	for _, maxWalkMeters := range []int32{minPreferredWalkMeters, 300, 600, maxPreferredWalkMeters} {
		answeredRequests := 0
		for _, testCase := range officialNetworkCases(graph) {
			response, err := client.RecommendRoutes(authorizedContext(t), &microv1.RecommendRoutesRequest{
				Origin: pointMessage(testCase.origin), Destination: pointMessage(testCase.destination),
				Preferences: &microv1.RoutePreferences{MaxWalkMeters: maxWalkMeters},
			})
			if status.Code(err) == codes.NotFound {
				continue
			}
			if err != nil {
				t.Fatalf("%s with %d m: unexpected error: %v", testCase.name, maxWalkMeters, err)
			}
			answeredRequests++
			if response.GetPreferences().GetMaxWalkMeters() != maxWalkMeters {
				t.Fatalf("%s: reported max walk = %d, want %d", testCase.name, response.GetPreferences().GetMaxWalkMeters(), maxWalkMeters)
			}
			for _, route := range response.GetRoutes() {
				for _, movement := range route.GetMovements() {
					if movement.GetMode() == "walk" && movement.GetDistanceMeters() > maxWalkMeters {
						t.Fatalf("%s: walk of %d m exceeds %d m", testCase.name, movement.GetDistanceMeters(), maxWalkMeters)
					}
				}
			}
		}
		// Si ninguna consulta respondiera, la prueba no estaría revisando nada.
		if answeredRequests == 0 {
			t.Fatalf("with %d m no request was answered", maxWalkMeters)
		}
	}
}

// En proto3 un entero no enviado llega como 0, así que en gRPC max_walk_meters en
// 0 significa el valor por defecto. La respuesta es la misma que sin preferencias
// y que pedir 1000 m, e informa 1000.
func TestRecommendRoutesOverNetworkZeroMaxWalkMeansDefault(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	withZero := recommendOverNetwork(t, client, preferencesTestRequest(graph, &microv1.RoutePreferences{MaxWalkMeters: 0}))
	withoutPreferences := recommendOverNetwork(t, client, preferencesTestRequest(graph, nil))
	withDefault := recommendOverNetwork(t, client, preferencesTestRequest(graph, &microv1.RoutePreferences{MaxWalkMeters: defaultPreferredWalkMeters}))
	if withZero.GetPreferences().GetMaxWalkMeters() != defaultPreferredWalkMeters {
		t.Fatalf("reported max walk = %d, want %d", withZero.GetPreferences().GetMaxWalkMeters(), defaultPreferredWalkMeters)
	}
	if withZero.GetTotal() == 0 || !proto.Equal(withZero, withoutPreferences) || !proto.Equal(withZero, withDefault) {
		t.Fatal("max walk 0 should answer the same as no preferences and as 1000 m")
	}
}

// La diferencia con REST es a propósito: en la URL, un "0" escrito sí se envió,
// así que REST lo rechaza; en gRPC no se distingue de "no enviado".
func TestZeroMaxWalkDiffersBetweenRESTAndGRPC(t *testing.T) {
	if _, err := parseMaxWalkMeters("0"); !errors.Is(err, errInvalidMaxWalk) {
		t.Fatalf("REST \"0\" error = %v, want errInvalidMaxWalk", err)
	}
	preferences, err := routePreferencesFromProto(&microv1.RoutePreferences{MaxWalkMeters: 0})
	if err != nil || preferences.MaxWalkMeters != defaultPreferredWalkMeters {
		t.Fatalf("gRPC 0 = %+v, err = %v; want the default", preferences, err)
	}
}

// La caminata máxima decide si hay ruta. El punto está unos 400 m al norte del
// Portal. La prueba calcula a qué distancia queda el paradero útil más cercano,
// y pide un máximo un poco menor y otro un poco mayor: con el menor no hay
// paraderos a distancia caminable, y con el mayor sí hay rutas.
func TestRecommendRoutesOverNetworkMaxWalkDecidesIfThereAreRoutes(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	portal := graph.Stops["PAR-PORTAL-01"]
	farPoint := locationPoint(portal.Latitude+0.0036, portal.Longitude)
	testCases := []struct {
		side          string
		nearestStops  []NearbyStop
		request       func(maxWalkMeters int32) *microv1.RecommendRoutesRequest
		expectedError error
	}{
		{"origin", nearbyNetworkStops(graph, farPoint.Latitude, farPoint.Longitude, 1, maxPreferredWalkMeters),
			func(maxWalkMeters int32) *microv1.RecommendRoutesRequest {
				return &microv1.RecommendRoutesRequest{Origin: locationMessage(farPoint), Destination: stopMessage("PAR-CJP-02"),
					Preferences: &microv1.RoutePreferences{MaxWalkMeters: maxWalkMeters}}
			}, errNoNearbyStops},
		{"destination", nearbyArrivalStops(graph, farPoint.Latitude, farPoint.Longitude, 1, maxPreferredWalkMeters),
			func(maxWalkMeters int32) *microv1.RecommendRoutesRequest {
				return &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-CJP-02"), Destination: locationMessage(farPoint),
					Preferences: &microv1.RoutePreferences{MaxWalkMeters: maxWalkMeters}}
			}, errNoStopsNearDestination},
	}
	for _, testCase := range testCases {
		if len(testCase.nearestStops) != 1 || testCase.nearestStops[0].DistanceMeters < 150 || testCase.nearestStops[0].DistanceMeters > 900 {
			t.Fatalf("%s: nearest stops = %+v; the test point must be between 150 and 900 m from a stop", testCase.side, testCase.nearestStops)
		}
		nearestMeters := int32(testCase.nearestStops[0].DistanceMeters)

		_, err := client.RecommendRoutes(authorizedContext(t), testCase.request(nearestMeters-20))
		errorStatus, _ := status.FromError(err)
		if errorStatus.Code() != codes.NotFound || errorStatus.Message() != testCase.expectedError.Error() {
			t.Fatalf("%s with %d m: error = %v, want NotFound %q", testCase.side, nearestMeters-20, err, testCase.expectedError)
		}

		response := recommendOverNetwork(t, client, testCase.request(nearestMeters+20))
		if response.GetTotal() == 0 {
			t.Fatalf("%s with %d m: no routes", testCase.side, nearestMeters+20)
		}
		for _, route := range response.GetRoutes() {
			for _, movement := range route.GetMovements() {
				if movement.GetMode() == "walk" && movement.GetDistanceMeters() > nearestMeters+20 {
					t.Fatalf("%s: walk of %d m exceeds %d m", testCase.side, movement.GetDistanceMeters(), nearestMeters+20)
				}
			}
		}
	}
}

// sameMovements indica si dos rutas recorren los mismos tramos. El costo no se
// compara: cambia con los pesos aunque la ruta sea la misma.
func sameMovements(firstRoute, secondRoute *microv1.RecommendedRoute) bool {
	firstMovements, secondMovements := firstRoute.GetMovements(), secondRoute.GetMovements()
	if len(firstMovements) != len(secondMovements) {
		return false
	}
	for movementIndex := range firstMovements {
		if !proto.Equal(firstMovements[movementIndex], secondMovements[movementIndex]) {
			return false
		}
	}
	return true
}

// La prioridad cambia de verdad las rutas por red: en la red oficial, con
// least_walking, al menos una consulta recibe otra mejor ruta que con balanced.
func TestRecommendRoutesOverNetworkPriorityChangesRoutes(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	changedRoutes := 0
	for _, testCase := range officialNetworkCases(graph) {
		bestRoute := func(priority RoutePriority) *microv1.RecommendedRoute {
			response := recommendOverNetwork(t, client, &microv1.RecommendRoutesRequest{
				Origin: pointMessage(testCase.origin), Destination: pointMessage(testCase.destination), Limit: 1,
				Preferences: &microv1.RoutePreferences{Priority: string(priority)},
			})
			return response.GetRoutes()[0]
		}
		if !sameMovements(bestRoute(priorityBalanced), bestRoute(priorityLeastWalking)) {
			changedRoutes++
		}
	}
	if changedRoutes == 0 {
		t.Fatal("least_walking never changed the best route over the network")
	}
	t.Logf("least_walking changed the best route in %d of %d requests", changedRoutes, len(officialNetworkCases(graph)))
}
