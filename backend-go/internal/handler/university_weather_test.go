package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/currentweather"
)

// fixedWeather entrega siempre el mismo clima, o nil si se desconoce.
type fixedWeather struct {
	conditions *currentweather.Conditions
}

func (weather fixedWeather) Current(context.Context) *currentweather.Conditions {
	return weather.conditions
}

func TestPlanUniversityRoutesSendsCurrentWeather(t *testing.T) {
	fakeMicro := emptyRoutesMicro()
	weather := fixedWeather{conditions: &currentweather.Conditions{TemperatureC: 3, WindSpeedKmh: 35, PM25: 60}}
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro).WithCurrentWeather(weather)
	serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")

	sentWeather := fakeMicro.receivedRequest.GetWeather()
	if sentWeather == nil || sentWeather.GetTemperatureC() != 3 || sentWeather.GetWindSpeedKmh() != 35 || sentWeather.GetPm25() != 60 {
		t.Errorf("se esperaba enviar 3 °C, 35 km/h y PM2.5 de 60: %+v", sentWeather)
	}
}

func TestPlanUniversityRoutesWithoutWeatherSource(t *testing.T) {
	fakeMicro := emptyRoutesMicro()
	serveUniversityRequestWith(NewGRPCProxyHandler(nil, fakeMicro), "/routes/university?from_stop=PAR-PORTAL-01")
	if fakeMicro.receivedRequest.GetWeather() != nil {
		t.Errorf("sin fuente no debe enviar clima: %+v", fakeMicro.receivedRequest.GetWeather())
	}
}

// Con el clima desconocido, el mensaje no debe enviarse: un mensaje con ceros
// haría que micro_service cobrara frío intenso a todas las caminatas.
func TestPlanUniversityRoutesWithUnknownWeather(t *testing.T) {
	fakeMicro := emptyRoutesMicro()
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro).WithCurrentWeather(fixedWeather{conditions: nil})
	serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")
	if fakeMicro.receivedRequest.GetWeather() != nil {
		t.Errorf("con el clima desconocido no debe enviarse el mensaje: %+v", fakeMicro.receivedRequest.GetWeather())
	}
}

// Recorre la respuesta HTTP completa: el recargo por clima que calcula
// micro_service debe llegar a la app con su valor exacto.
func TestPlanUniversityRoutesResponseIncludesWeather(t *testing.T) {
	fakeMicro := &fakeUniversityMicro{routesResponse: &microv1.PlanUniversityRoutesResponse{
		Routes: []*microv1.UniversityRoute{{
			CampusId: "san-francisco", TotalTimeSeconds: 324,
			Cost: &microv1.CostBreakdown{Ride: 240, Walk: 168, Wait: 600, Weather: 33.6, Total: 1041.6},
		}},
		Total: 1,
	}}
	recorder := serveUniversityRequest(fakeMicro, "/routes/university?lat=-38.73&long=-72.61&campus=san-francisco")
	if recorder.Code != http.StatusOK {
		t.Fatalf("se esperaba 200: %d %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Routes []struct {
			Cost map[string]float64 `json:"cost"`
		} `json:"routes"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	weather, present := body.Routes[0].Cost["weather"]
	if !present || weather != 33.6 || body.Routes[0].Cost["total"] != 1041.6 {
		t.Errorf("se esperaba weather = 33.6 y total = 1041.6: %s", recorder.Body.String())
	}
}

// El clima y la ocupación se envían juntos cuando ambas fuentes están conectadas.
func TestPlanUniversityRoutesSendsWeatherAndOccupancy(t *testing.T) {
	fakeMicro := emptyRoutesMicro()
	occupancy := fixedOccupancy{"L7B": 0.95}
	weather := fixedWeather{conditions: &currentweather.Conditions{TemperatureC: 3}}
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro).WithLineOccupancy(occupancy).WithCurrentWeather(weather)
	serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")
	request := fakeMicro.receivedRequest
	if request.GetLineOccupancy()["L7B"] != 0.95 || request.GetWeather().GetTemperatureC() != 3 {
		t.Errorf("se esperaban la ocupación y el clima: %+v", request)
	}
}

// fixedOccupancy entrega siempre la misma ocupación, ya con IDs de micro_service.
type fixedOccupancy map[string]float64

func (occupancy fixedOccupancy) LineOccupancyBy(func(routeID string) (string, bool)) map[string]float64 {
	return occupancy
}
