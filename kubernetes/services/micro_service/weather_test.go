package main

import (
	"math"
	"testing"
)

func assertFactor(t *testing.T, label string, conditions *WeatherConditions, expectedFactor float64) {
	t.Helper()
	if factor := walkWeatherFactor(conditions); math.Abs(factor-expectedFactor) > 1e-9 {
		t.Errorf("%s: se esperaba %v y se obtuvo %v", label, expectedFactor, factor)
	}
}

func TestWalkWeatherFactorWithoutWeather(t *testing.T) {
	assertFactor(t, "sin clima", nil, 1)
	assertFactor(t, "día templado", &WeatherConditions{TemperatureC: 15, WindSpeedKmh: 10, PM25: 20}, 1)
}

func TestWalkWeatherFactorByTemperature(t *testing.T) {
	assertFactor(t, "frío", &WeatherConditions{TemperatureC: 3}, 1.2)
	assertFactor(t, "frío intenso", &WeatherConditions{TemperatureC: -2}, 1.4)
	assertFactor(t, "calor", &WeatherConditions{TemperatureC: 32}, 1.2)
	assertFactor(t, "justo en 5 °C", &WeatherConditions{TemperatureC: 5}, 1)
	assertFactor(t, "justo en 30 °C", &WeatherConditions{TemperatureC: 30}, 1)
}

func TestWalkWeatherFactorByWind(t *testing.T) {
	assertFactor(t, "viento", &WeatherConditions{TemperatureC: 15, WindSpeedKmh: 35}, 1.2)
	assertFactor(t, "viento fuerte", &WeatherConditions{TemperatureC: 15, WindSpeedKmh: 60}, 1.4)
}

func TestWalkWeatherFactorByAirQuality(t *testing.T) {
	assertFactor(t, "aire sobre la norma", &WeatherConditions{TemperatureC: 15, PM25: 60}, 1.2)
	assertFactor(t, "aire en alerta", &WeatherConditions{TemperatureC: 15, PM25: 90}, 1.4)
}

func TestWalkWeatherFactorAddsConditions(t *testing.T) {
	// Frío y aire sobre la norma, algo típico de un invierno en Temuco.
	assertFactor(t, "frío y mal aire", &WeatherConditions{TemperatureC: 3, PM25: 60}, 1.4)
}

func TestWalkWeatherFactorHasMaximum(t *testing.T) {
	// 0,4 + 0,4 + 0,4 = 1,2 de recargo, pero el factor no pasa de 2.
	assertFactor(t, "todo extremo", &WeatherConditions{TemperatureC: -5, WindSpeedKmh: 70, PM25: 150}, maxWalkWeatherFactor)
}

func TestWalkWeatherFactorIgnoresImpossibleValues(t *testing.T) {
	assertFactor(t, "valores NaN", &WeatherConditions{TemperatureC: math.NaN(), WindSpeedKmh: math.NaN(), PM25: math.NaN()}, 1)
}

func weightsWithWeather(conditions *WeatherConditions) CostWeights {
	weights := defaultCostWeights()
	weights.Weather = conditions
	return weights
}

func TestPathCostAddsWeatherToWalking(t *testing.T) {
	path := []pathStep{
		{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L7A", BaseTimeSec: 300}},
		{From: "B", Edge: Edge{ToStopID: "C", RouteID: walkRouteID, BaseTimeSec: 120}},
	}
	breakdown := pathCostBreakdown(path, weightsWithWeather(&WeatherConditions{TemperatureC: 3, PM25: 60}))
	// Caminar 120 s con peso 2 cuesta 240; con factor 1,4 se agregan 96. La micro no
	// cambia: el clima solo afecta a caminar.
	if breakdown.Walk != 240 || math.Abs(breakdown.Weather-96) > 1e-9 || breakdown.Ride != 300 {
		t.Errorf("desglose inesperado: %+v", breakdown)
	}
	if math.Abs(breakdown.Total-(300+600+240+96)) > 1e-9 {
		t.Errorf("el total debe incluir el recargo por clima: %+v", breakdown)
	}
}

// Caminar 420 s cuesta 840, y la micro de 300 s cuesta 900 con la espera. Con buen
// clima conviene caminar; con frío y mal aire, caminar cuesta 1176 y conviene la micro.
func TestCheapestPathAvoidsWalkingInBadWeather(t *testing.T) {
	graph := NewTransitGraph()
	graph.Stops["ORIGIN"] = Stop{ID: "ORIGIN", Latitude: -38.70, Longitude: -72.60}
	graph.Stops["DESTINATION"] = Stop{ID: "DESTINATION", Latitude: -38.703, Longitude: -72.60}
	graph.Edges["ORIGIN"] = []Edge{
		{ToStopID: "DESTINATION", RouteID: walkRouteID, BaseTimeSec: 420},
		{ToStopID: "DESTINATION", RouteID: "L1", BaseTimeSec: 300},
	}
	goodWeather, _ := cheapestPath(graph, "ORIGIN", "DESTINATION", weightsWithWeather(&WeatherConditions{TemperatureC: 15}))
	if goodWeather[0].Edge.RouteID != walkRouteID {
		t.Errorf("con buen clima debe convenir caminar: %+v", goodWeather)
	}
	badWeatherWeights := weightsWithWeather(&WeatherConditions{TemperatureC: 3, PM25: 60})
	badWeather, _ := cheapestPath(graph, "ORIGIN", "DESTINATION", badWeatherWeights)
	if badWeather[0].Edge.RouteID != "L1" {
		t.Errorf("con frío y mal aire debe convenir la micro: %+v", badWeather)
	}
	aStarRoute, _ := aStarCheapestPath(graph, "ORIGIN", "DESTINATION", badWeatherWeights)
	if aStarRoute[0].Edge.RouteID != "L1" {
		t.Errorf("A* debe elegir lo mismo que Dijkstra: %+v", aStarRoute)
	}
}

func TestAStarMatchesDijkstraWithWeather(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := weightsWithWeather(&WeatherConditions{TemperatureC: -2, WindSpeedKmh: 40, PM25: 90})
	weights.Occupancy = LineOccupancy{"L7A": 0.95}
	assertAStarMatchesCheapest(t, graph, weights)
}

func TestInitialWalkPaysWeather(t *testing.T) {
	routes := routesFromTestOrigin(t, weightsWithWeather(&WeatherConditions{TemperatureC: 3}))
	for _, route := range routes {
		breakdown := pathCostBreakdown(route.Path, weightsWithWeather(&WeatherConditions{TemperatureC: 3}))
		if breakdown.Weather <= 0 {
			t.Errorf("la caminata inicial también debe pagar el clima: %+v", breakdown)
		}
	}
}

func TestWalkWeatherFactorNeverBelowOne(t *testing.T) {
	for temperatureC := -20.0; temperatureC <= 45; temperatureC += 2.5 {
		for windSpeedKmh := 0.0; windSpeedKmh <= 90; windSpeedKmh += 10 {
			conditions := &WeatherConditions{TemperatureC: temperatureC, WindSpeedKmh: windSpeedKmh, PM25: windSpeedKmh * 2}
			if factor := walkWeatherFactor(conditions); factor < 1 || factor > maxWalkWeatherFactor {
				t.Fatalf("%+v: el factor %v está fuera de [1, %v]", conditions, factor, maxWalkWeatherFactor)
			}
		}
	}
}
