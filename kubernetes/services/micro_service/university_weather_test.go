package main

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/protobuf/proto"
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

func TestProtoRequestKeepsWeather(t *testing.T) {
	routeRequest, err := universityRouteRequestFromProto(&microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01",
		Weather:      &microv1.WeatherConditions{TemperatureC: 3, WindSpeedKmh: 35, Pm25: 60},
	})
	expected := WeatherConditions{TemperatureC: 3, WindSpeedKmh: 35, PM25: 60}
	if err != nil || routeRequest.Weather == nil || *routeRequest.Weather != expected {
		t.Errorf("el clima debe pasar a la petición: %+v, %v", routeRequest.Weather, err)
	}
}

// Sin el mensaje, el clima debe quedar en nil y no como 0 °C, que penalizaría
// todas las caminatas por frío intenso.
func TestProtoRequestWithoutWeatherIsNil(t *testing.T) {
	routeRequest, err := universityRouteRequestFromProto(&microv1.PlanUniversityRoutesRequest{OriginStopId: "PAR-PORTAL-01"})
	if err != nil || routeRequest.Weather != nil {
		t.Errorf("sin clima se esperaba nil: %+v, %v", routeRequest.Weather, err)
	}
}

func TestGRPCUniversityRoutesUseWeather(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	_, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01", Limit: 1,
		Weather: &microv1.WeatherConditions{TemperatureC: 15, WindSpeedKmh: -5},
	})
	assertGRPCCode(t, err, codes.InvalidArgument)

	response, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01", Limit: 1,
		Weather: &microv1.WeatherConditions{TemperatureC: 3, Pm25: 60},
	})
	if err != nil || response.GetTotal() != 1 {
		t.Errorf("con un clima válido se esperaba una ruta: %+v, %v", response, err)
	}
}

func TestParseWeatherReadsAllValues(t *testing.T) {
	weather, err := parseWeather("3.5", "35", "60")
	expected := WeatherConditions{TemperatureC: 3.5, WindSpeedKmh: 35, PM25: 60}
	if err != nil || weather == nil || *weather != expected {
		t.Errorf("se esperaba %+v y se obtuvo %+v, %v", expected, weather, err)
	}
	if weather, err := parseWeather("", "", ""); err != nil || weather != nil {
		t.Errorf("sin parámetros no debe haber clima: %+v, %v", weather, err)
	}
}

func TestParseWeatherRequiresAllValues(t *testing.T) {
	incompleteOrInvalid := [][3]string{
		{"3", "", ""},
		{"", "35", "60"},
		{"3", "35", ""},
		{"frío", "35", "60"},
		{"3", "35", "mucho"},
	}
	for _, rawValues := range incompleteOrInvalid {
		if _, err := parseWeather(rawValues[0], rawValues[1], rawValues[2]); !errors.Is(err, errInvalidWeather) {
			t.Errorf("%v: se esperaba errInvalidWeather y se obtuvo %v", rawValues, err)
		}
	}
}

func TestRESTUniversityRoutesUseWeather(t *testing.T) {
	handler := universityTestHandler(t)
	statusCode, body := getUniversityRoutes(t, handler, "from_stop=PAR-PORTAL-01&limit=1&temperature_c=3&wind_speed_kmh=10&pm25=60")
	if statusCode != http.StatusOK || body.Total != 1 {
		t.Errorf("con un clima válido se esperaba una ruta: %d %+v", statusCode, body)
	}
	for _, query := range []string{
		"from_stop=PAR-PORTAL-01&temperature_c=3",
		"from_stop=PAR-PORTAL-01&temperature_c=3&wind_speed_kmh=10&pm25=-1",
	} {
		statusCode, body := getUniversityRoutes(t, handler, query)
		if statusCode != http.StatusBadRequest || body.Error == "" {
			t.Errorf("%s: se esperaba 400: %d %+v", query, statusCode, body)
		}
	}
}

// Desde unos 100 m de PAR-PORTAL-01, con 3 °C (factor 1,2), la caminata inicial
// paga un recargo de 20 %. REST y gRPC deben informar el mismo valor.
func TestUniversityRoutesReportWeather(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	latitude, longitude := locationNearStop(graph, "PAR-PORTAL-01")
	query := fmt.Sprintf("lat=%f&long=%f&campus=san-francisco&limit=1&temperature_c=3&wind_speed_kmh=10&pm25=20", latitude, longitude)
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), query)
	if statusCode != http.StatusOK || body.Total != 1 {
		t.Fatalf("se esperaba una ruta: %d %+v", statusCode, body)
	}
	cost := body.Routes[0].Cost
	initialWalkSeconds := float64(body.Routes[0].Movements[0].TimeSec)
	if cost.Weather != roundToTenth(initialWalkSeconds*2*0.2) {
		t.Errorf("se esperaba un recargo de %v: %+v", roundToTenth(initialWalkSeconds*2*0.2), cost)
	}
	componentsSum := cost.Ride + cost.Walk + cost.Wait + cost.Transfer + cost.Crowding + cost.Weather
	if roundToTenth(componentsSum) != cost.Total {
		t.Errorf("los componentes deben sumar el total: %+v", cost)
	}

	client := startUniversityGRPCClient(t, graph)
	response, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		Latitude: proto.Float64(latitude), Longitude: proto.Float64(longitude), CampusId: "san-francisco", Limit: 1,
		Weather: &microv1.WeatherConditions{TemperatureC: 3, WindSpeedKmh: 10, Pm25: 20},
	})
	if err != nil {
		t.Fatal(err)
	}
	if grpcCost := response.GetRoutes()[0].GetCost(); grpcCost.GetWeather() != cost.Weather || grpcCost.GetTotal() != cost.Total {
		t.Errorf("gRPC debe informar lo mismo que REST: %+v / %+v", grpcCost, cost)
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
