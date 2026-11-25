package handler

// Cadena completa de backend-go: petición HTTP, handler, cliente gRPC real, red,
// micro_service falso y JSON de vuelta.

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/currentweather"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

// chainHandler conecta el handler a un micro_service falso por gRPC real.
func chainHandler(t *testing.T, server microv1.MicroServiceServer) *GRPCProxyHandler {
	t.Helper()
	return NewGRPCProxyHandler(nil, startMicroClientWith(t, server))
}

// Una micro publicada en el Hub, el clima actual y la URL del pasajero llegan
// juntos a micro_service, con la clave interna. La app recibe la ruta intacta.
func TestRecommendationChain(t *testing.T) {
	tracker := liveoccupancy.NewTracker()
	hub := ws.NewHub(service.NewOccupancyService())
	hub.SetOccupancyRecorder(tracker)
	go hub.Run()
	hub.PublishInternal(ws.BusLocationData{BusID: "bus-1c", RouteID: "route-1c", CurrentPassengers: 38, Capacity: 40})
	waitForBuses(t, tracker, 1)

	server := &recommendationMicroServer{}
	weather := fixedWeather{conditions: &currentweather.Conditions{TemperatureC: 3, WindSpeedKmh: 10, PM25: 20}}
	proxyHandler := chainHandler(t, server).WithLineOccupancy(tracker).WithCurrentWeather(weather)
	recorder := serveRecommendation(proxyHandler, recommendationHTTPRequest(
		"origin_lat=-38.7345&origin_long=-72.6118&destination_stop=PAR-CSF-01&limit=1&priority=%20Balanced&max_walk_meters=500&avoid_crowding=false"))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	assertJSONText(t, newRecommendationsJSON(recommendationSampleResponse()), recorder.Body.String())
	expectedRequest := &microv1.RecommendRoutesRequest{
		Origin: locationRoutePoint(-38.7345, -72.6118), Destination: stopRoutePoint("PAR-CSF-01"), Limit: 1,
		Preferences:   &microv1.RoutePreferences{Priority: " Balanced", MaxWalkMeters: 500, AvoidCrowding: proto.Bool(false)},
		LineOccupancy: map[string]float64{"L1C": 0.95},
		Weather:       &microv1.WeatherConditions{TemperatureC: 3, WindSpeedKmh: 10, Pm25: 20},
	}
	if !proto.Equal(server.receivedRequest(), expectedRequest) {
		t.Fatalf("request = %v, want %v", server.receivedRequest(), expectedRequest)
	}
	if keys := server.receivedKeys(); len(keys) != 1 || keys[0] != "clave-de-prueba" {
		t.Fatalf("received %d keys, want only the configured one", len(keys))
	}
}

// Los errores cruzan la cadena con su estado. Solo los de la petición muestran el
// detalle.
func TestRecommendationChainErrors(t *testing.T) {
	const detail = "detalle de micro_service"
	testCases := map[codes.Code]struct {
		expectedStatus  int
		expectedMessage string
	}{
		codes.InvalidArgument: {400, detail},
		codes.NotFound:        {404, detail},
		codes.Unauthenticated: {502, recommendationFailedMessage},
		codes.Unavailable:     {503, recommendationUnavailableMessage},
		codes.Internal:        {500, recommendationFailedMessage},
	}
	for code, expected := range testCases {
		proxyHandler := chainHandler(t, &recommendationMicroServer{responseError: status.Error(code, detail)})
		assertChainError(t, code.String(), proxyHandler, expected.expectedStatus, expected.expectedMessage)
	}
	assertChainError(t, "older micro_service", chainHandler(t, costMicroServer{}), 503, recommendationUnavailableMessage)
}

func assertChainError(t *testing.T, name string, proxyHandler *GRPCProxyHandler, expectedStatus int, expectedMessage string) {
	t.Helper()
	recorder := serveRecommendation(proxyHandler, recommendationHTTPRequest(validRecommendationQuery))
	var body map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("%s: %v in %s", name, err, recorder.Body.String())
	}
	if recorder.Code != expectedStatus || body["error"] != expectedMessage || len(body) != 1 {
		t.Fatalf("%s: %d %v, want %d %q", name, recorder.Code, body, expectedStatus, expectedMessage)
	}
}

// waitingMicroServer no responde hasta que se cancela la llamada.
type waitingMicroServer struct {
	microv1.UnimplementedMicroServiceServer
	requestArrived, requestCanceled chan struct{}
}

func (server *waitingMicroServer) RecommendRoutes(requestContext context.Context, _ *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	close(server.requestArrived)
	<-requestContext.Done()
	close(server.requestCanceled)
	return nil, status.FromContextError(requestContext.Err()).Err()
}

// Si el pasajero cierra la app, la cancelación llega hasta micro_service, que deja
// de calcular.
func TestRecommendationChainPropagatesCancellation(t *testing.T) {
	server := &waitingMicroServer{requestArrived: make(chan struct{}), requestCanceled: make(chan struct{})}
	proxyHandler := chainHandler(t, server)
	requestContext, cancelRequest := context.WithCancel(context.Background())
	defer cancelRequest()
	responseStatus := make(chan int, 1)
	go func() {
		request := recommendationHTTPRequest(validRecommendationQuery).WithContext(requestContext)
		responseStatus <- serveRecommendation(proxyHandler, request).Code
	}()
	waitForChain := func(signal <-chan struct{}, description string) {
		select {
		case <-signal:
		case <-time.After(3 * time.Second):
			t.Fatalf("timed out waiting for %s", description)
		}
	}
	waitForChain(server.requestArrived, "the request to arrive")
	cancelRequest()
	waitForChain(server.requestCanceled, "the cancellation to arrive")
	if httpStatus := <-responseStatus; httpStatus != statusClientClosedRequest {
		t.Fatalf("status = %d, want %d", httpStatus, statusClientClosedRequest)
	}
}

// Muchos pasajeros a la vez, mientras las micros siguen informando: todos reciben
// la ruta completa.
func TestRecommendationChainWithConcurrentPassengers(t *testing.T) {
	tracker := liveoccupancy.NewTracker()
	proxyHandler := chainHandler(t, &recommendationMicroServer{}).WithLineOccupancy(tracker)
	expectedBody, err := json.Marshal(newRecommendationsJSON(recommendationSampleResponse()))
	if err != nil {
		t.Fatal(err)
	}
	const passengers, requestsPerPassenger = 20, 10
	var workers sync.WaitGroup
	failures := make(chan string, passengers*requestsPerPassenger)
	for passenger := 0; passenger < passengers; passenger++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for requestIndex := 0; requestIndex < requestsPerPassenger; requestIndex++ {
				tracker.Record("bus-1c", "route-1C", requestIndex, 40)
				recorder := serveRecommendation(proxyHandler, recommendationHTTPRequest(validRecommendationQuery))
				if recorder.Code != http.StatusOK || recorder.Body.String() != string(expectedBody) {
					failures <- recorder.Body.String()
				}
			}
		}()
	}
	workers.Wait()
	close(failures)
	for failure := range failures {
		t.Fatalf("unexpected answer: %s", failure)
	}
}
