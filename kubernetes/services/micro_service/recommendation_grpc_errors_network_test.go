package main

// Pruebas de los errores de RecommendRoutes por red (bufconn). Cada error debe
// llegar con el código que documenta el proto y un mensaje que diga qué corregir,
// sin una respuesta parcial.

import (
	"context"
	"fmt"
	"math"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// assertRecommendError pide rutas por red y revisa el código y el mensaje exacto
// del error, y que no llegue respuesta.
func assertRecommendError(t *testing.T, client microv1.MicroServiceClient, name string,
	request *microv1.RecommendRoutesRequest, expectedCode codes.Code, expectedMessage string) {
	t.Helper()
	response, err := client.RecommendRoutes(authorizedContext(t), request)
	if response != nil {
		t.Fatalf("%s: got a response %v together with the error", name, response)
	}
	errorStatus, isStatus := status.FromError(err)
	if !isStatus || errorStatus.Code() != expectedCode || errorStatus.Message() != expectedMessage {
		t.Fatalf("%s: error = %v, want %v %q", name, err, expectedCode, expectedMessage)
	}
}

// validErrorTestRequest es una petición válida, que cada caso modifica en un
// solo campo para que solo falle ese campo.
func validErrorTestRequest() *microv1.RecommendRoutesRequest {
	return &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CJP-02")}
}

// tooManyOccupancyLines tiene una línea más de las que acepta una petición.
func tooManyOccupancyLines() map[string]float64 {
	occupancy := make(map[string]float64, maxOccupancyLines+1)
	for lineIndex := 0; lineIndex <= maxOccupancyLines; lineIndex++ {
		occupancy[fmt.Sprintf("L%d", lineIndex)] = 0.5
	}
	return occupancy
}

// Cada dato inválido responde InvalidArgument con el mensaje de lo que hay que
// corregir. Varios valores, como NaN, se prueban por red porque así llegan desde
// otro servicio.
func TestRecommendRoutesOverNetworkInvalidArguments(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	testCases := []struct {
		name            string
		change          func(request *microv1.RecommendRoutesRequest)
		expectedMessage string
	}{
		{"negative limit", func(request *microv1.RecommendRoutesRequest) { request.Limit = -1 }, errInvalidRouteLimit.Error()},
		{"limit too high", func(request *microv1.RecommendRoutesRequest) { request.Limit = maxRecommendedRoutes + 1 }, errInvalidRouteLimit.Error()},
		{"missing origin", func(request *microv1.RecommendRoutesRequest) { request.Origin = nil }, errInvalidRecommendationOrigin.Error()},
		{"origin without point", func(request *microv1.RecommendRoutesRequest) { request.Origin = &microv1.RoutePoint{} },
			errInvalidRecommendationOrigin.Error()},
		{"missing destination", func(request *microv1.RecommendRoutesRequest) { request.Destination = nil },
			errInvalidRecommendationDestination.Error()},
		{"destination with empty stop", func(request *microv1.RecommendRoutesRequest) { request.Destination = stopMessage("") },
			errInvalidRecommendationDestination.Error()},
		{"latitude out of range", func(request *microv1.RecommendRoutesRequest) {
			request.Origin = locationMessage(locationPoint(91, 0))
		}, errInvalidLocation.Error()},
		{"longitude not a number", func(request *microv1.RecommendRoutesRequest) {
			request.Destination = locationMessage(locationPoint(0, math.NaN()))
		}, errInvalidLocation.Error()},
		{"same origin and destination", func(request *microv1.RecommendRoutesRequest) { request.Destination = stopMessage("PAR-PORTAL-01") },
			errSameOriginAndDestination.Error()},
		{"occupancy not a number", func(request *microv1.RecommendRoutesRequest) {
			request.LineOccupancy = map[string]float64{"L7A": math.NaN()}
		}, errInvalidOccupancy.Error()},
		{"negative occupancy", func(request *microv1.RecommendRoutesRequest) {
			request.LineOccupancy = map[string]float64{"L7A": -0.1}
		}, errInvalidOccupancy.Error()},
		{"occupancy without line", func(request *microv1.RecommendRoutesRequest) {
			request.LineOccupancy = map[string]float64{"": 0.5}
		}, errInvalidOccupancy.Error()},
		{"too many occupancy lines", func(request *microv1.RecommendRoutesRequest) { request.LineOccupancy = tooManyOccupancyLines() },
			errInvalidOccupancy.Error()},
		{"temperature too high", func(request *microv1.RecommendRoutesRequest) {
			request.Weather = &microv1.WeatherConditions{TemperatureC: maxTemperatureC + 1}
		}, errInvalidWeather.Error()},
		{"negative wind", func(request *microv1.RecommendRoutesRequest) {
			request.Weather = &microv1.WeatherConditions{TemperatureC: 18, WindSpeedKmh: -1}
		}, errInvalidWeather.Error()},
		{"air quality not a number", func(request *microv1.RecommendRoutesRequest) {
			request.Weather = &microv1.WeatherConditions{TemperatureC: 18, Pm25: math.NaN()}
		}, errInvalidWeather.Error()},
		{"unknown priority", func(request *microv1.RecommendRoutesRequest) {
			request.Preferences = &microv1.RoutePreferences{Priority: "cheapest"}
		}, errInvalidRoutePriority.Error()},
		{"max walk too short", func(request *microv1.RecommendRoutesRequest) {
			request.Preferences = &microv1.RoutePreferences{MaxWalkMeters: minPreferredWalkMeters - 1}
		}, errInvalidMaxWalk.Error()},
		{"max walk too long", func(request *microv1.RecommendRoutesRequest) {
			request.Preferences = &microv1.RoutePreferences{MaxWalkMeters: maxPreferredWalkMeters + 1}
		}, errInvalidMaxWalk.Error()},
		{"negative max walk", func(request *microv1.RecommendRoutesRequest) {
			request.Preferences = &microv1.RoutePreferences{MaxWalkMeters: -1}
		}, errInvalidMaxWalk.Error()},
	}
	for _, testCase := range testCases {
		request := validErrorTestRequest()
		testCase.change(request)
		assertRecommendError(t, client, testCase.name, request, codes.InvalidArgument, testCase.expectedMessage)
	}
}

// farFromNetwork está a unos 80 km de cualquier paradero.
var farFromNetwork = locationPoint(-38.0, -72.0)

// Lo que no existe o no tiene paraderos cerca responde NotFound, con el mensaje
// del lado que corresponde: el cliente sabe si corregir el origen o el destino.
func TestRecommendRoutesOverNetworkNotFound(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	testCases := []struct {
		name            string
		change          func(request *microv1.RecommendRoutesRequest)
		expectedMessage string
	}{
		{"unknown origin stop", func(request *microv1.RecommendRoutesRequest) { request.Origin = stopMessage("PAR-NOWHERE-01") },
			errUnknownOriginStop.Error()},
		{"unknown destination stop", func(request *microv1.RecommendRoutesRequest) { request.Destination = stopMessage("PAR-NOWHERE-01") },
			errUnknownDestinationStop.Error()},
		// Los ID de paradero distinguen mayúsculas, igual que en el resto de la API.
		{"stop in lowercase", func(request *microv1.RecommendRoutesRequest) { request.Origin = stopMessage("par-portal-01") },
			errUnknownOriginStop.Error()},
		{"no stops near origin", func(request *microv1.RecommendRoutesRequest) { request.Origin = locationMessage(farFromNetwork) },
			errNoNearbyStops.Error()},
		{"no stops near destination", func(request *microv1.RecommendRoutesRequest) { request.Destination = locationMessage(farFromNetwork) },
			errNoStopsNearDestination.Error()},
		// Si los dos lados fallan, se informa el origen, que se revisa primero.
		{"both stops unknown", func(request *microv1.RecommendRoutesRequest) {
			request.Origin, request.Destination = stopMessage("PAR-NOWHERE-01"), stopMessage("PAR-NOWHERE-02")
		}, errUnknownOriginStop.Error()},
		{"unknown origin and far destination", func(request *microv1.RecommendRoutesRequest) {
			request.Origin, request.Destination = stopMessage("PAR-NOWHERE-01"), locationMessage(farFromNetwork)
		}, errUnknownOriginStop.Error()},
	}
	for _, testCase := range testCases {
		request := validErrorTestRequest()
		testCase.change(request)
		assertRecommendError(t, client, testCase.name, request, codes.NotFound, testCase.expectedMessage)
	}
}

// Un dato inválido se informa antes que un paradero inexistente: primero se
// revisa que la petición esté bien escrita, después si lo pedido existe.
func TestRecommendRoutesOverNetworkInvalidArgumentBeforeNotFound(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	request := &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-NOWHERE-01"), Destination: stopMessage("PAR-CJP-02"), Limit: 9}
	assertRecommendError(t, client, "invalid limit and unknown stop", request, codes.InvalidArgument, errInvalidRouteLimit.Error())
}

// Si los paraderos existen, pero la red no los conecta, no es un error: llega
// routes vacío y total 0, como dice el proto. En el grafo del ejemplo la micro
// solo va de A a B, así que de B a A no hay ruta.
func TestRecommendRoutesOverNetworkUnconnectedStopsAreNotAnError(t *testing.T) {
	client := startUniversityGRPCClient(t, weatherExampleGraph())
	response := recommendOverNetwork(t, client, &microv1.RecommendRoutesRequest{Origin: stopMessage("B"), Destination: stopMessage("A")})
	if response.GetTotal() != 0 || len(response.GetRoutes()) != 0 {
		t.Fatalf("response = %v, want no routes", response)
	}
	if response.GetCostWeights() == nil || response.GetPreferences() == nil {
		t.Fatalf("response = %v, want the weights and preferences even without routes", response)
	}
}

// Sin grafo cargado responde Unavailable, también ante una petición inválida o
// con un paradero inexistente: sin grafo no se puede saber si existe.
func TestRecommendRoutesOverNetworkWithoutGraph(t *testing.T) {
	client := startUniversityGRPCClient(t, nil)
	invalidLimit := validErrorTestRequest()
	invalidLimit.Limit = 9
	unknownStop := validErrorTestRequest()
	unknownStop.Origin = stopMessage("PAR-NOWHERE-01")
	for name, request := range map[string]*microv1.RecommendRoutesRequest{
		"valid request": validErrorTestRequest(),
		"invalid limit": invalidLimit,
		"unknown stop":  unknownStop,
		"empty request": {},
	} {
		assertRecommendError(t, client, name, request, codes.Unavailable, "graph is not loaded")
	}
}

// requestWithoutKey pide rutas sin la clave interna, o con una incorrecta.
func requestWithoutKey(t *testing.T, client microv1.MicroServiceClient, request *microv1.RecommendRoutesRequest, wrongKey bool) error {
	t.Helper()
	requestContext, cancel := context.WithTimeout(context.Background(), testRequestDuration)
	t.Cleanup(cancel)
	if wrongKey {
		requestContext = metadata.AppendToOutgoingContext(requestContext, "x-admin-key", "clave-incorrecta")
	}
	_, err := client.RecommendRoutes(requestContext, request)
	return err
}

// El orden de las revisiones es: primero la clave, después el grafo y al final la
// petición. Sin la clave correcta siempre responde Unauthenticated, haya o no
// grafo y sea o no válida la petición: quien no tiene la clave no recibe pistas.
func TestRecommendRoutesOverNetworkCheckOrder(t *testing.T) {
	withGraph := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	withoutGraph := startUniversityGRPCClient(t, nil)
	invalidRequest := &microv1.RecommendRoutesRequest{Limit: 9}
	testCases := []struct {
		name     string
		client   microv1.MicroServiceClient
		request  *microv1.RecommendRoutesRequest
		wrongKey bool
	}{
		{"no key, no graph", withoutGraph, validErrorTestRequest(), false},
		{"wrong key, no graph", withoutGraph, validErrorTestRequest(), true},
		{"no key, invalid request", withGraph, invalidRequest, false},
		{"wrong key, invalid request", withGraph, invalidRequest, true},
		{"no key, no graph, invalid request", withoutGraph, invalidRequest, false},
	}
	for _, testCase := range testCases {
		err := requestWithoutKey(t, testCase.client, testCase.request, testCase.wrongKey)
		if status.Code(err) != codes.Unauthenticated {
			t.Fatalf("%s: error = %v, want Unauthenticated", testCase.name, err)
		}
	}
}

// Por red, una location vacía viaja igual que una location en 0,0: en proto3 un
// mensaje vacío y uno con todo en 0 se codifican igual. Por eso no es un punto que
// falta, sino la coordenada 0,0, que está lejos de la red. routePointFromProto
// trata una location sin mensaje como punto vacío, pero eso solo ocurre dentro del
// mismo proceso, nunca después de la red.
func TestRecommendRoutesOverNetworkEmptyLocationIsZeroCoordinate(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	emptyLocation := validErrorTestRequest()
	emptyLocation.Origin = &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{}}
	zeroLocation := validErrorTestRequest()
	zeroLocation.Origin = locationMessage(locationPoint(0, 0))
	for name, request := range map[string]*microv1.RecommendRoutesRequest{"empty location": emptyLocation, "location at 0,0": zeroLocation} {
		assertRecommendError(t, client, name, request, codes.NotFound, errNoNearbyStops.Error())
	}
}

// La petición válida de la que parten los casos sí responde: así cada error se
// debe solo al campo que se cambió.
func TestRecommendRoutesOverNetworkErrorBaseRequestIsValid(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	if response := recommendOverNetwork(t, client, validErrorTestRequest()); response.GetTotal() == 0 {
		t.Fatal("the base request has no routes")
	}
}
