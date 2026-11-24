package handler

import (
	"net/http"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/currentweather"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
)

// sentRecommendationRequest pide rutas al handler y devuelve lo que recibió el
// servicio falso.
func sentRecommendationRequest(t *testing.T, connectSources func(*GRPCProxyHandler), rawQuery string) *microv1.RecommendRoutesRequest {
	t.Helper()
	fakeMicro := &fakeRecommendationMicro{response: &microv1.RecommendRoutesResponse{}}
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro)
	connectSources(proxyHandler)
	if recorder := serveRecommendation(proxyHandler, recommendationHTTPRequest(rawQuery)); recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	return fakeMicro.receivedRequest
}

// trackerWithBuses tiene dos micros de la 7A, con su ID escrito de dos formas, una
// de la 7B y una de una línea que micro_service no conoce.
func trackerWithBuses() *liveoccupancy.Tracker {
	tracker := liveoccupancy.NewTracker()
	tracker.Record("bus-7a-grande", "route-7A", 30, 40)
	tracker.Record("bus-7a-chica", "route-7a", 6, 20)
	tracker.Record("bus-7b", "route-7B", 10, 40)
	tracker.Record("bus-otra", "linea-sin-formato", 40, 40)
	return tracker
}

// La ocupación y el clima en vivo se agregan a lo leído de la URL, con los IDs de
// micro_service. 7A: (30 + 6) / (40 + 20) = 0,6. 7B: 10 / 40 = 0,25.
func TestRecommendRoutesHandlerSendsLiveData(t *testing.T) {
	weather := fixedWeather{conditions: &currentweather.Conditions{TemperatureC: 3, WindSpeedKmh: 35, PM25: 60}}
	request := sentRecommendationRequest(t, func(proxyHandler *GRPCProxyHandler) {
		proxyHandler.WithLineOccupancy(trackerWithBuses()).WithCurrentWeather(weather)
	}, validRecommendationQuery+"&limit=2&avoid_crowding=false")
	expectedRequest := &microv1.RecommendRoutesRequest{
		Origin: stopRoutePoint("PAR-PORTAL-01"), Destination: stopRoutePoint("PAR-CSF-01"), Limit: 2,
		Preferences:   &microv1.RoutePreferences{AvoidCrowding: proto.Bool(false)},
		LineOccupancy: map[string]float64{"L7A": 0.6, "L7B": 0.25},
		Weather:       &microv1.WeatherConditions{TemperatureC: 3, WindSpeedKmh: 35, Pm25: 60},
	}
	if !proto.Equal(request, expectedRequest) {
		t.Fatalf("request = %v, want %v", request, expectedRequest)
	}
}

// Sin fuentes, sin micros en vivo o con el clima desconocido no se envía nada. Un
// clima con ceros se cobraría como frío en todas las caminatas.
func TestRecommendRoutesHandlerWithoutLiveData(t *testing.T) {
	for name, connectSources := range map[string]func(*GRPCProxyHandler){
		"without sources": func(*GRPCProxyHandler) {},
		"without data": func(proxyHandler *GRPCProxyHandler) {
			proxyHandler.WithLineOccupancy(liveoccupancy.NewTracker()).WithCurrentWeather(fixedWeather{})
		},
	} {
		request := sentRecommendationRequest(t, connectSources, validRecommendationQuery)
		if request.GetLineOccupancy() != nil || request.GetWeather() != nil {
			t.Fatalf("%s: request = %v, want no occupancy and no weather", name, request)
		}
	}
}

// Un clima real de 0 °C sí se envía: no es lo mismo que no conocerlo.
func TestRecommendRoutesHandlerSendsZeroDegrees(t *testing.T) {
	request := sentRecommendationRequest(t, func(proxyHandler *GRPCProxyHandler) {
		proxyHandler.WithCurrentWeather(fixedWeather{conditions: &currentweather.Conditions{}})
	}, validRecommendationQuery)
	if request.GetWeather() == nil || request.GetWeather().GetTemperatureC() != 0 {
		t.Fatalf("weather = %v, want 0 °C", request.GetWeather())
	}
}

// Cada fuente funciona sin la otra.
func TestRecommendRoutesHandlerSourcesAreIndependent(t *testing.T) {
	onlyOccupancy := sentRecommendationRequest(t, func(proxyHandler *GRPCProxyHandler) {
		proxyHandler.WithLineOccupancy(trackerWithBuses())
	}, validRecommendationQuery)
	if len(onlyOccupancy.GetLineOccupancy()) != 2 || onlyOccupancy.GetWeather() != nil {
		t.Fatalf("request = %v, want only occupancy", onlyOccupancy)
	}
	onlyWeather := sentRecommendationRequest(t, func(proxyHandler *GRPCProxyHandler) {
		proxyHandler.WithCurrentWeather(fixedWeather{conditions: &currentweather.Conditions{TemperatureC: 18}})
	}, validRecommendationQuery)
	if onlyWeather.GetLineOccupancy() != nil || onlyWeather.GetWeather().GetTemperatureC() != 18 {
		t.Fatalf("request = %v, want only weather", onlyWeather)
	}
}
