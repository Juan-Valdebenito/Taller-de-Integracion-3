package handler

import (
	"context"
	"testing"

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
