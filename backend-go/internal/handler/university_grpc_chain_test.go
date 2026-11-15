package handler

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"sync"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/currentweather"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/infrastructure/grpcclient"
)

// costMicroServer responde como micro_service por una conexión gRPC real.
// Usa decimales para comprobar que el costo no pierde precisión en el viaje.
type costMicroServer struct {
	microv1.UnimplementedMicroServiceServer
}

func (costMicroServer) PlanUniversityRoutes(context.Context, *microv1.PlanUniversityRoutesRequest) (*microv1.PlanUniversityRoutesResponse, error) {
	return &microv1.PlanUniversityRoutesResponse{
		Routes: []*microv1.UniversityRoute{{
			CampusId: "san-juan-pablo-ii", TotalTimeSeconds: 2280, Transfers: 1,
			// El clima agrega el 20 % de la caminata: 562,5 × 0,2 = 112,5.
			Cost: &microv1.CostBreakdown{Ride: 3060, Walk: 562.5, Wait: 1500, Transfer: 300, Crowding: 612, Weather: 112.5, Total: 6147},
		}},
		Total:       1,
		CostWeights: &microv1.CostWeights{RideWeight: 1.5, WalkWeight: 2.5, WaitWeight: 2.5, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600},
	}, nil
}

func startCostMicroClient(t *testing.T) *grpcclient.MicroClient {
	t.Helper()
	return startMicroClientWith(t, costMicroServer{})
}

// recordingMicroServer responde como costMicroServer y además guarda la última
// petición recibida, para revisar qué llegó por la red.
type recordingMicroServer struct {
	costMicroServer
	mutex       sync.Mutex
	lastRequest *microv1.PlanUniversityRoutesRequest
}

func (server *recordingMicroServer) PlanUniversityRoutes(requestContext context.Context, request *microv1.PlanUniversityRoutesRequest) (*microv1.PlanUniversityRoutesResponse, error) {
	server.mutex.Lock()
	server.lastRequest = request
	server.mutex.Unlock()
	return server.costMicroServer.PlanUniversityRoutes(requestContext, request)
}

func (server *recordingMicroServer) receivedRequest() *microv1.PlanUniversityRoutesRequest {
	server.mutex.Lock()
	defer server.mutex.Unlock()
	return server.lastRequest
}

func startMicroClientWith(t *testing.T, microServer microv1.MicroServiceServer) *grpcclient.MicroClient {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	grpcServer := grpc.NewServer()
	microv1.RegisterMicroServiceServer(grpcServer, microServer)
	go func() { _ = grpcServer.Serve(listener) }()

	microClient, err := grpcclient.NewMicroClient(listener.Addr().String(), "clave-de-prueba", 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = microClient.Close()
		grpcServer.Stop()
	})
	return microClient
}

// Recorre la cadena completa de backend-go: cliente gRPC real, red, handler y
// JSON. Es el camino que sigue el costo desde micro_service hasta la app.
func TestUniversityCostSurvivesGRPCToJSON(t *testing.T) {
	proxyHandler := NewGRPCProxyHandler(nil, startCostMicroClient(t))
	recorder := serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01&campus=san-juan-pablo-ii")
	if recorder.Code != http.StatusOK {
		t.Fatalf("se esperaba 200: %d %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Routes      []universityRouteJSON `json:"routes"`
		CostWeights *costWeightsJSON      `json:"cost_weights"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	expectedCost := costBreakdownJSON{Ride: 3060, Walk: 562.5, Wait: 1500, Transfer: 300, Crowding: 612, Weather: 112.5, Total: 6147}
	if len(body.Routes) != 1 || body.Routes[0].Cost != expectedCost || body.Routes[0].Transfers != 1 {
		t.Errorf("se esperaba el costo %+v: %s", expectedCost, recorder.Body.String())
	}
	expectedWeights := costWeightsJSON{RideWeight: 1.5, WalkWeight: 2.5, WaitWeight: 2.5, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600}
	if body.CostWeights == nil || *body.CostWeights != expectedWeights {
		t.Errorf("se esperaban los pesos %+v: %s", expectedWeights, recorder.Body.String())
	}
}

// El clima y la ocupación de backend-go deben llegar exactos a micro_service por
// una conexión gRPC real, con decimales incluidos.
func TestWeatherAndOccupancyTravelToMicroService(t *testing.T) {
	recordingServer := &recordingMicroServer{}
	weather := fixedWeather{conditions: &currentweather.Conditions{TemperatureC: 3.25, WindSpeedKmh: 35.5, PM25: 62.75}}
	proxyHandler := NewGRPCProxyHandler(nil, startMicroClientWith(t, recordingServer)).
		WithLineOccupancy(fixedOccupancy{"L7B": 0.95, "L1C": 0.4}).
		WithCurrentWeather(weather)
	recorder := serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")
	if recorder.Code != http.StatusOK {
		t.Fatalf("se esperaba 200: %d %s", recorder.Code, recorder.Body.String())
	}

	request := recordingServer.receivedRequest()
	sentWeather := request.GetWeather()
	if sentWeather == nil || sentWeather.GetTemperatureC() != 3.25 || sentWeather.GetWindSpeedKmh() != 35.5 || sentWeather.GetPm25() != 62.75 {
		t.Errorf("el clima no llegó exacto: %+v", sentWeather)
	}
	occupancy := request.GetLineOccupancy()
	if len(occupancy) != 2 || occupancy["L7B"] != 0.95 || occupancy["L1C"] != 0.4 {
		t.Errorf("la ocupación no llegó exacta: %v", occupancy)
	}
}

// Con el clima desconocido, el mensaje no debe viajar. Si viajara con ceros,
// micro_service leería 0 °C y cobraría frío intenso a todas las caminatas.
// Por la red, proto3 distingue un mensaje ausente de uno con ceros.
func TestUnknownWeatherDoesNotTravelToMicroService(t *testing.T) {
	testCases := []struct {
		name           string
		connectWeather func(proxyHandler *GRPCProxyHandler) *GRPCProxyHandler
	}{
		{"clima desconocido", func(proxyHandler *GRPCProxyHandler) *GRPCProxyHandler {
			return proxyHandler.WithCurrentWeather(fixedWeather{conditions: nil})
		}},
		{"sin fuente de clima", func(proxyHandler *GRPCProxyHandler) *GRPCProxyHandler {
			return proxyHandler
		}},
	}
	for _, testCase := range testCases {
		recordingServer := &recordingMicroServer{}
		proxyHandler := testCase.connectWeather(NewGRPCProxyHandler(nil, startMicroClientWith(t, recordingServer)))
		recorder := serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s: se esperaba 200: %d %s", testCase.name, recorder.Code, recorder.Body.String())
		}
		request := recordingServer.receivedRequest()
		if request == nil {
			t.Fatalf("%s: la petición no llegó a micro_service", testCase.name)
		}
		if request.Weather != nil {
			t.Errorf("%s: no debe viajar un mensaje de clima: %+v", testCase.name, request.Weather)
		}
	}
}
