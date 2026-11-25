package handler

import (
	"fmt"
	"math"
	"reflect"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/currentweather"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
)

// Los límites exactos se aceptan; lo imposible se descarta sin perder lo demás.
func TestAcceptedOccupancyDropsOnlyImpossibleLines(t *testing.T) {
	accepted := acceptedOccupancy(map[string]float64{
		"L7A": 0, "L7B": 2, "L1C": 1.2,
		"LX1": 2.01, "LX2": -0.1, "LX3": math.NaN(), "LX4": math.Inf(1), "": 0.5,
	})
	if expected := map[string]float64{"L7A": 0, "L7B": 2, "L1C": 1.2}; !reflect.DeepEqual(accepted, expected) {
		t.Fatalf("accepted = %v, want %v", accepted, expected)
	}
}

func TestAcceptedOccupancyLimitsLines(t *testing.T) {
	occupancy := make(map[string]float64)
	for lineIndex := 0; lineIndex < maxAcceptedOccupancyLines+10; lineIndex++ {
		occupancy[fmt.Sprintf("L%03d", lineIndex)] = 0.5
	}
	first, second := acceptedOccupancy(occupancy), acceptedOccupancy(occupancy)
	if len(first) != maxAcceptedOccupancyLines || !reflect.DeepEqual(first, second) {
		t.Fatalf("kept %d and %d lines, want the same %d", len(first), len(second), maxAcceptedOccupancyLines)
	}
}

func TestIsAcceptedWeather(t *testing.T) {
	for _, conditions := range []currentweather.Conditions{
		{}, {TemperatureC: 60, WindSpeedKmh: 300, PM25: 1000}, {TemperatureC: -50},
	} {
		if !isAcceptedWeather(&conditions) {
			t.Fatalf("%+v should be accepted", conditions)
		}
	}
	for _, conditions := range []currentweather.Conditions{
		{TemperatureC: 60.1}, {TemperatureC: -50.1}, {TemperatureC: math.NaN()},
		{WindSpeedKmh: -1}, {WindSpeedKmh: 301}, {PM25: -1}, {PM25: 1001}, {PM25: math.Inf(1)},
	} {
		if isAcceptedWeather(&conditions) {
			t.Fatalf("%+v should be rejected", conditions)
		}
	}
}

// Una micro con 100 pasajeros y capacidad 40, o un clima imposible, no llegan a
// micro_service en ninguna de las dos rutas, y los datos buenos sí.
func TestImpossibleLiveDataIsNotSent(t *testing.T) {
	tracker := liveoccupancy.NewTracker()
	tracker.Record("bus-raro", "route-7A", 100, 40)
	tracker.Record("bus-bueno", "route-7B", 10, 40)
	impossibleWeather := fixedWeather{conditions: &currentweather.Conditions{TemperatureC: 999}}
	expectedOccupancy := map[string]float64{"L7B": 0.25}

	recommendation := sentRecommendationRequest(t, func(proxyHandler *GRPCProxyHandler) {
		proxyHandler.WithLineOccupancy(tracker).WithCurrentWeather(impossibleWeather)
	}, validRecommendationQuery)
	if !reflect.DeepEqual(recommendation.GetLineOccupancy(), expectedOccupancy) || recommendation.GetWeather() != nil {
		t.Fatalf("recommendation request = %v", recommendation)
	}

	fakeMicro := emptyRoutesMicro()
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro).WithLineOccupancy(tracker).WithCurrentWeather(impossibleWeather)
	serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")
	if !reflect.DeepEqual(fakeMicro.receivedRequest.GetLineOccupancy(), expectedOccupancy) || fakeMicro.receivedRequest.GetWeather() != nil {
		t.Fatalf("university request = %v", fakeMicro.receivedRequest)
	}
}

// Si todo lo que hay es imposible, no se envía ocupación.
func TestOnlyImpossibleOccupancySendsNothing(t *testing.T) {
	tracker := liveoccupancy.NewTracker()
	tracker.Record("bus-raro", "route-7A", 100, 40)
	request := sentRecommendationRequest(t, func(proxyHandler *GRPCProxyHandler) { proxyHandler.WithLineOccupancy(tracker) }, validRecommendationQuery)
	if request.GetLineOccupancy() != nil {
		t.Fatalf("occupancy = %v, want none", request.GetLineOccupancy())
	}
}
