package main

// Pruebas de RecommendRoutes por red (bufconn), con la clave interna. Comprueban
// que la respuesta llega igual después de serializarse: los costos viajan como
// double y las listas vacías deben seguir vacías.

import (
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

// recommendOverNetwork pide rutas por red y falla si hay error.
func recommendOverNetwork(t *testing.T, client microv1.MicroServiceClient, request *microv1.RecommendRoutesRequest) *microv1.RecommendRoutesResponse {
	t.Helper()
	response, err := client.RecommendRoutes(authorizedContext(t), request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return response
}

// Para cada par de paraderos de la red oficial, la respuesta por red es idéntica
// a la calculada directo, con rutas, costos, pesos y preferencias.
func TestRecommendRoutesOverNetworkBetweenStops(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	for _, stopPair := range allStopPairs(graph) {
		request := &microv1.RecommendRoutesRequest{Origin: stopMessage(stopPair[0]), Destination: stopMessage(stopPair[1])}
		response := recommendOverNetwork(t, client, request)
		expectedResponse, err := answerRecommendRoutes(graph, request)
		if err != nil {
			t.Fatalf("%s -> %s: unexpected error: %v", stopPair[0], stopPair[1], err)
		}
		if response.GetTotal() == 0 {
			t.Fatalf("%s -> %s: no routes over the network", stopPair[0], stopPair[1])
		}
		if !proto.Equal(response, expectedResponse) {
			t.Fatalf("%s -> %s: the response changed over the network", stopPair[0], stopPair[1])
		}
	}
}

// Entre paraderos, cada ruta empieza en el origen y termina en el destino pedidos,
// sin caminatas desde una coordenada ni hasta ella.
func TestRecommendRoutesOverNetworkStartAndEndAtStops(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	response := recommendOverNetwork(t, client, &microv1.RecommendRoutesRequest{
		Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CJP-02"),
	})
	for routeIndex, route := range response.GetRoutes() {
		movements := route.GetMovements()
		if movements[0].GetFromStopId() != "PAR-PORTAL-01" || movements[len(movements)-1].GetToStopId() != "PAR-CJP-02" {
			t.Fatalf("route %d goes from %s to %s", routeIndex, movements[0].GetFromStopId(), movements[len(movements)-1].GetToStopId())
		}
		for _, movement := range movements {
			if movement.GetFromStopId() == userLocationID || movement.GetToStopId() == destinationLocationID {
				t.Fatalf("route %d has a walk from or to a coordinate: %v", routeIndex, movement)
			}
		}
	}
}

// pointMessage convierte un punto del planificador al mensaje gRPC.
func pointMessage(point RoutePoint) *microv1.RoutePoint {
	if point.HasLocation {
		return locationMessage(point)
	}
	return stopMessage(point.StopID)
}

// Las 126 consultas con coordenadas de la red oficial (coordenada a coordenada,
// paradero a coordenada y coordenada a paradero) llegan por red iguales a las
// calculadas directo, y cada ruta empieza y termina donde corresponde.
func TestRecommendRoutesOverNetworkWithLocations(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	for _, testCase := range officialNetworkCases(graph) {
		request := &microv1.RecommendRoutesRequest{Origin: pointMessage(testCase.origin), Destination: pointMessage(testCase.destination)}
		response := recommendOverNetwork(t, client, request)
		expectedResponse, _ := answerRecommendRoutes(graph, request)
		if response.GetTotal() == 0 || !proto.Equal(response, expectedResponse) {
			t.Fatalf("%s: the response changed over the network or is empty", testCase.name)
		}
		for routeIndex, route := range response.GetRoutes() {
			movements := route.GetMovements()
			if movements[0].GetFromStopId() != testCase.expectedStart || movements[len(movements)-1].GetToStopId() != testCase.expectedEnd {
				t.Fatalf("%s: route %d goes from %s to %s", testCase.name, routeIndex,
					movements[0].GetFromStopId(), movements[len(movements)-1].GetToStopId())
			}
		}
	}
}

// Las caminatas desde una coordenada y hasta ella llegan como tramos a pie, sin
// línea ni viaje, con su tiempo y su distancia.
func TestRecommendRoutesOverNetworkReportWalks(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	response := recommendOverNetwork(t, client, &microv1.RecommendRoutesRequest{
		Origin:      locationMessage(pointNearStop(graph, "PAR-PORTAL-01")),
		Destination: locationMessage(pointNearStop(graph, "PAR-CJP-02")),
	})
	for routeIndex, route := range response.GetRoutes() {
		movements := route.GetMovements()
		for _, walk := range []*microv1.Movement{movements[0], movements[len(movements)-1]} {
			if walk.GetMode() != "walk" || walk.GetRouteId() != "" || walk.GetTripId() != "" {
				t.Fatalf("route %d: end movement %v is not a plain walk", routeIndex, walk)
			}
			if walk.GetTimeSeconds() <= 0 || walk.GetDistanceMeters() <= 0 {
				t.Fatalf("route %d: walk %v has no time or distance", routeIndex, walk)
			}
		}
	}
}

// Una coordenada en 0,0 es una coordenada enviada, no un punto que falta. Lejos de
// la red, entre dos puntos a unos 222 m, la única ruta es caminar.
func TestRecommendRoutesOverNetworkKeepZeroCoordinates(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	response := recommendOverNetwork(t, client, &microv1.RecommendRoutesRequest{
		Origin:      locationMessage(locationPoint(0, 0)),
		Destination: locationMessage(locationPoint(0.002, 0)),
	})
	if response.GetTotal() != 1 {
		t.Fatalf("total = %d, want only the direct walk", response.GetTotal())
	}
	walk := response.GetRoutes()[0].GetMovements()
	if len(walk) != 1 || walk[0].GetFromStopId() != userLocationID || walk[0].GetToStopId() != destinationLocationID {
		t.Fatalf("movements = %v, want one walk from the user to the destination", walk)
	}
}

// Los costos y los pesos llegan con sus decimales, y el total de cada ruta es la
// suma de sus componentes, redondeada como en REST.
func TestRecommendRoutesOverNetworkKeepCosts(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	response := recommendOverNetwork(t, client, &microv1.RecommendRoutesRequest{
		Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CJP-02"),
	})
	if !proto.Equal(response.GetCostWeights(), microCostWeights(defaultCostWeights())) {
		t.Fatalf("cost weights = %v, want the default weights", response.GetCostWeights())
	}
	for routeIndex, route := range response.GetRoutes() {
		cost := route.GetCost()
		componentsSum := cost.GetRide() + cost.GetWalk() + cost.GetWait() + cost.GetTransfer() + cost.GetCrowding() + cost.GetWeather()
		if roundToTenth(componentsSum) != cost.GetTotal() {
			t.Fatalf("route %d: components add up to %v, total is %v", routeIndex, componentsSum, cost.GetTotal())
		}
	}
}
