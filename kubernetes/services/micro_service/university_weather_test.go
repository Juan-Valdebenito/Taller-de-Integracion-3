package main

import (
	"errors"
	"math"
	"testing"
)

func TestValidateWeatherAcceptsValidValues(t *testing.T) {
	validConditions := []*WeatherConditions{
		nil,
		{TemperatureC: 15, WindSpeedKmh: 10, PM25: 20},
		{TemperatureC: 0, WindSpeedKmh: 0, PM25: 0},
		{TemperatureC: minTemperatureC, WindSpeedKmh: maxWindSpeedKmh, PM25: maxPM25},
		{TemperatureC: maxTemperatureC},
	}
	for _, conditions := range validConditions {
		if err := validateWeather(conditions); err != nil {
			t.Errorf("%+v debe ser válido: %v", conditions, err)
		}
	}
}

func TestValidateWeatherRejectsImpossibleValues(t *testing.T) {
	invalidConditions := map[string]*WeatherConditions{
		"demasiado frío":   {TemperatureC: minTemperatureC - 1},
		"demasiado calor":  {TemperatureC: maxTemperatureC + 1},
		"viento negativo":  {TemperatureC: 15, WindSpeedKmh: -1},
		"viento imposible": {TemperatureC: 15, WindSpeedKmh: maxWindSpeedKmh + 1},
		"PM2.5 negativo":   {TemperatureC: 15, PM25: -1},
		"PM2.5 imposible":  {TemperatureC: 15, PM25: maxPM25 + 1},
		"temperatura NaN":  {TemperatureC: math.NaN()},
		"viento infinito":  {TemperatureC: 15, WindSpeedKmh: math.Inf(1)},
	}
	for caseName, conditions := range invalidConditions {
		if err := validateWeather(conditions); !errors.Is(err, errInvalidWeather) {
			t.Errorf("%s: se esperaba errInvalidWeather y se obtuvo %v", caseName, err)
		}
	}
}

func TestRouteRequestCostWeightsIncludeWeather(t *testing.T) {
	conditions := &WeatherConditions{TemperatureC: 3}
	weights := universityRouteRequest{Weather: conditions}.costWeights()
	if weights.Weather != conditions || walkWeatherFactor(weights.Weather) != 1.2 {
		t.Errorf("los pesos deben incluir el clima: %+v", weights)
	}
	if withoutWeather := (universityRouteRequest{}).costWeights(); withoutWeather.Weather != nil {
		t.Errorf("sin clima, los pesos no deben tenerlo: %+v", withoutWeather)
	}
}

func TestPlanUniversityRoutesRejectsInvalidWeather(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routeRequest := universityRouteRequest{
		OriginStopID: "PAR-PORTAL-01", Limit: 3, Weather: &WeatherConditions{TemperatureC: math.NaN()},
	}
	if _, err := planUniversityRoutes(graph, routeRequest); !errors.Is(err, errInvalidWeather) {
		t.Errorf("se esperaba errInvalidWeather y se obtuvo %v", err)
	}
}

// Desde unos 100 m de PAR-CSF-01 hay dos opciones a San Francisco: caminar hasta
// el paradero, o caminar a otro y tomar una micro. El mal clima encarece toda
// caminata, así que la más corta sigue siendo la mejor, pero su costo sube.
func TestPlanUniversityRoutesChargeWeather(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	latitude, longitude := locationNearStop(graph, "PAR-CSF-01")
	routeRequest := universityRouteRequest{
		HasLocation: true, Latitude: latitude, Longitude: longitude, CampusID: "san-francisco", Limit: 1,
	}
	goodWeatherRoutes, err := planUniversityRoutes(graph, routeRequest)
	if err != nil || len(goodWeatherRoutes) != 1 {
		t.Fatalf("se esperaba una ruta: %+v, %v", goodWeatherRoutes, err)
	}
	routeRequest.Weather = &WeatherConditions{TemperatureC: 3, PM25: 60}
	badWeatherRoutes, err := planUniversityRoutes(graph, routeRequest)
	if err != nil || len(badWeatherRoutes) != 1 {
		t.Fatalf("se esperaba una ruta: %+v, %v", badWeatherRoutes, err)
	}
	goodCost := pathCostBreakdown(goodWeatherRoutes[0].Path, universityRouteRequest{}.costWeights())
	badCost := pathCostBreakdown(badWeatherRoutes[0].Path, routeRequest.costWeights())
	if goodCost.Weather != 0 || badCost.Weather <= 0 || badCost.Total <= goodCost.Total {
		t.Errorf("con mal clima la caminata debe costar más: bueno %+v, malo %+v", goodCost, badCost)
	}
}
