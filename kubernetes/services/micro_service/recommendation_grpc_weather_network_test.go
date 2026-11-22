package main

// Pruebas del clima en RecommendRoutes por red (bufconn). El clima es un mensaje
// para que "sin clima" no se confunda con un clima a 0 °C: estas pruebas
// comprueban que esa diferencia sobrevive a la serialización.

import (
	"math"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

// weatherTestRequest va entre dos coordenadas cerca del Portal y del campus San
// Juan Pablo II, así cada ruta tiene al menos una caminata al inicio y al final.
func weatherTestRequest(graph *TransitGraph, weather *microv1.WeatherConditions) *microv1.RecommendRoutesRequest {
	return &microv1.RecommendRoutesRequest{
		Origin:      locationMessage(pointNearStop(graph, "PAR-PORTAL-01")),
		Destination: locationMessage(pointNearStop(graph, "PAR-CJP-02")),
		Weather:     weather,
	}
}

// Sin el mensaje de clima no hay recargo: caminar cuesta lo mismo que siempre.
func TestRecommendRoutesOverNetworkWithoutWeather(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	request := weatherTestRequest(graph, nil)
	response := recommendOverNetwork(t, client, request)
	if response.GetTotal() == 0 {
		t.Fatal("no routes; the test checks nothing")
	}
	for routeIndex, route := range response.GetRoutes() {
		if route.GetCost().GetWeather() != 0 {
			t.Fatalf("route %d has a weather surcharge of %v without weather", routeIndex, route.GetCost().GetWeather())
		}
	}
	expectedResponse, _ := answerRecommendRoutes(graph, request)
	if !proto.Equal(response, expectedResponse) {
		t.Fatal("the response changed over the network")
	}
}

// Un clima con todo en 0 sí es un clima enviado: 0 °C está bajo los 5 °C, así que
// cada caminata recibe el recargo moderado de 0,2. Si se leyera como "sin clima",
// el recargo sería 0.
func TestRecommendRoutesOverNetworkZeroWeatherIsSentWeather(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	response := recommendOverNetwork(t, client, weatherTestRequest(graph, &microv1.WeatherConditions{}))
	if response.GetTotal() == 0 {
		t.Fatal("no routes; the test checks nothing")
	}
	for routeIndex, route := range response.GetRoutes() {
		cost := route.GetCost()
		expectedSurcharge := cost.GetWalk() * moderateWeatherSurcharge
		if cost.GetWeather() <= 0 || math.Abs(cost.GetWeather()-expectedSurcharge) > 0.1 {
			t.Fatalf("route %d: weather surcharge = %v, want about %v (walk %v × 0.2)",
				routeIndex, cost.GetWeather(), expectedSurcharge, cost.GetWalk())
		}
	}
}

// El mismo viaje cuesta más con clima a 0 °C que sin clima, y la diferencia es
// justamente el recargo por clima.
func TestRecommendRoutesOverNetworkZeroWeatherCostsMore(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	withoutWeather := recommendOverNetwork(t, client, weatherTestRequest(graph, nil)).GetRoutes()[0]
	withZeroWeather := recommendOverNetwork(t, client, weatherTestRequest(graph, &microv1.WeatherConditions{})).GetRoutes()[0]
	if !sameMovements(withoutWeather, withZeroWeather) {
		t.Skip("the best route changed with the weather; the cost comparison does not apply")
	}
	difference := withZeroWeather.GetCost().GetTotal() - withoutWeather.GetCost().GetTotal()
	if difference <= 0 || math.Abs(difference-withZeroWeather.GetCost().GetWeather()) > 0.1 {
		t.Fatalf("cost difference = %v, want the weather surcharge %v", difference, withZeroWeather.GetCost().GetWeather())
	}
}
