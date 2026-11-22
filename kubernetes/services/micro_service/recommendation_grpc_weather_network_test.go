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

// Con un clima templado se envía clima, pero no hay recargo: la respuesta es
// idéntica a no enviarlo. También en los valores límite, porque las reglas
// penalizan solo lo que pasa el umbral: 5 °C no es frío, 30 °C no es calor, 30
// km/h no es viento fuerte y 50 de PM2.5 no es mal aire.
func TestRecommendRoutesOverNetworkMildWeatherHasNoSurcharge(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	withoutWeather := recommendOverNetwork(t, client, weatherTestRequest(graph, nil))
	mildWeathers := map[string]*microv1.WeatherConditions{
		"mild day":         {TemperatureC: 18, WindSpeedKmh: 10, Pm25: 20},
		"lowest mild":      {TemperatureC: coldTemperatureC, WindSpeedKmh: 0, Pm25: 0},
		"highest mild":     {TemperatureC: hotTemperatureC, WindSpeedKmh: strongWindKmh, Pm25: poorAirPM25},
		"between extremes": {TemperatureC: 12.5, WindSpeedKmh: 29.9, Pm25: 49.9},
	}
	for name, weather := range mildWeathers {
		response := recommendOverNetwork(t, client, weatherTestRequest(graph, weather))
		for routeIndex, route := range response.GetRoutes() {
			if route.GetCost().GetWeather() != 0 {
				t.Fatalf("%s: route %d has a weather surcharge of %v", name, routeIndex, route.GetCost().GetWeather())
			}
		}
		if response.GetTotal() == 0 || !proto.Equal(response, withoutWeather) {
			t.Fatalf("%s: the response differs from the one without weather", name)
		}
	}
}

// Justo pasando cada umbral sí hay recargo: así se confirma que la prueba
// anterior usa los límites correctos.
func TestRecommendRoutesOverNetworkJustPastThresholdsHaveSurcharge(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	pastThresholds := map[string]*microv1.WeatherConditions{
		"cold":     {TemperatureC: coldTemperatureC - 0.1, WindSpeedKmh: 0, Pm25: 0},
		"hot":      {TemperatureC: hotTemperatureC + 0.1, WindSpeedKmh: 0, Pm25: 0},
		"windy":    {TemperatureC: 18, WindSpeedKmh: strongWindKmh + 0.1, Pm25: 0},
		"poor air": {TemperatureC: 18, WindSpeedKmh: 0, Pm25: poorAirPM25 + 0.1},
	}
	for name, weather := range pastThresholds {
		response := recommendOverNetwork(t, client, weatherTestRequest(graph, weather))
		if response.GetTotal() == 0 || response.GetRoutes()[0].GetCost().GetWeather() <= 0 {
			t.Fatalf("%s: best route = %v, want a weather surcharge", name, response.GetRoutes())
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

// assertWeatherSurcharge revisa que cada ruta reciba, por clima, la fracción
// indicada de su costo de caminar.
func assertWeatherSurcharge(t *testing.T, name string, response *microv1.RecommendRoutesResponse, expectedSurchargeRate float64) {
	t.Helper()
	if response.GetTotal() == 0 {
		t.Fatalf("%s: no routes; the test checks nothing", name)
	}
	for routeIndex, route := range response.GetRoutes() {
		cost := route.GetCost()
		expectedSurcharge := cost.GetWalk() * expectedSurchargeRate
		if math.Abs(cost.GetWeather()-expectedSurcharge) > 0.1 {
			t.Fatalf("%s: route %d weather surcharge = %v, want %v (walk %v × %v)",
				name, routeIndex, cost.GetWeather(), expectedSurcharge, cost.GetWalk(), expectedSurchargeRate)
		}
	}
}

// Cada factor severo suma 0,4 por separado: helada bajo 0 °C, viento sobre 50
// km/h y aire en alerta sobre 80 de PM2.5. Los demás valores son templados, para
// que solo cuente el factor probado.
func TestRecommendRoutesOverNetworkSevereWeatherSurcharges(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	severeWeathers := map[string]*microv1.WeatherConditions{
		"freezing":          {TemperatureC: freezingTemperatureC - 0.1, WindSpeedKmh: 0, Pm25: 0},
		"very strong wind":  {TemperatureC: 18, WindSpeedKmh: veryStrongWindKmh + 0.1, Pm25: 0},
		"alert air quality": {TemperatureC: 18, WindSpeedKmh: 0, Pm25: alertAirPM25 + 0.1},
	}
	for name, weather := range severeWeathers {
		response := recommendOverNetwork(t, client, weatherTestRequest(graph, weather))
		assertWeatherSurcharge(t, name, response, severeWeatherSurcharge)
	}
}

// Justo en cada umbral severo el recargo sigue siendo moderado: exactamente 0 °C,
// 50 km/h o 80 de PM2.5 todavía no son severos.
func TestRecommendRoutesOverNetworkSevereThresholdsAreModerate(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	atSevereThresholds := map[string]*microv1.WeatherConditions{
		"exactly 0 °C":       {TemperatureC: freezingTemperatureC, WindSpeedKmh: 0, Pm25: 0},
		"exactly 50 km/h":    {TemperatureC: 18, WindSpeedKmh: veryStrongWindKmh, Pm25: 0},
		"exactly 80 of PM25": {TemperatureC: 18, WindSpeedKmh: 0, Pm25: alertAirPM25},
	}
	for name, weather := range atSevereThresholds {
		response := recommendOverNetwork(t, client, weatherTestRequest(graph, weather))
		assertWeatherSurcharge(t, name, response, moderateWeatherSurcharge)
	}
}

// Los recargos de cada factor se suman. El factor de la caminata tiene un máximo
// de 2,0, así que el recargo nunca pasa de 1,0, aunque los factores sumen más.
func TestRecommendRoutesOverNetworkWeatherSurchargesAddUp(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	maxSurcharge := maxWalkWeatherFactor - 1
	testCases := []struct {
		name                  string
		weather               *microv1.WeatherConditions
		expectedSurchargeRate float64
	}{
		{"cold and windy", &microv1.WeatherConditions{TemperatureC: 3, WindSpeedKmh: 40, Pm25: 0}, 0.4},
		{"hot with poor air", &microv1.WeatherConditions{TemperatureC: 33, WindSpeedKmh: 0, Pm25: 60}, 0.4},
		{"three moderate", &microv1.WeatherConditions{TemperatureC: 3, WindSpeedKmh: 40, Pm25: 60}, 0.6},
		{"freezing and very windy", &microv1.WeatherConditions{TemperatureC: -3, WindSpeedKmh: 60, Pm25: 0}, 0.8},
		{"two severe and one moderate", &microv1.WeatherConditions{TemperatureC: -3, WindSpeedKmh: 60, Pm25: 60}, maxSurcharge},
		{"three severe, capped", &microv1.WeatherConditions{TemperatureC: -3, WindSpeedKmh: 60, Pm25: 90}, maxSurcharge},
	}
	for _, testCase := range testCases {
		response := recommendOverNetwork(t, client, weatherTestRequest(graph, testCase.weather))
		assertWeatherSurcharge(t, testCase.name, response, testCase.expectedSurchargeRate)
	}
}

// Con el máximo, caminar cuesta a lo más el doble que sin clima: el recargo nunca
// supera el costo de caminar.
func TestRecommendRoutesOverNetworkWeatherNeverMoreThanDoublesWalk(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	worstWeather := &microv1.WeatherConditions{TemperatureC: minTemperatureC, WindSpeedKmh: maxWindSpeedKmh, Pm25: maxPM25}
	response := recommendOverNetwork(t, client, weatherTestRequest(graph, worstWeather))
	assertWeatherSurcharge(t, "worst accepted weather", response, maxWalkWeatherFactor-1)
	for routeIndex, route := range response.GetRoutes() {
		if route.GetCost().GetWeather() > route.GetCost().GetWalk()+0.1 {
			t.Fatalf("route %d: weather surcharge %v exceeds the walk cost %v", routeIndex, route.GetCost().GetWeather(), route.GetCost().GetWalk())
		}
	}
}
