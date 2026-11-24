package handler

import (
	"context"
	"sync"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

// recommendationMicroServer responde RecommendRoutes por una conexión gRPC real y
// guarda la última petición y su clave interna, para revisar qué llegó por la
// red. El mutex es necesario porque gRPC atiende cada petición en otra goroutine.
// responseError se configura antes de levantar el servidor.
type recommendationMicroServer struct {
	microv1.UnimplementedMicroServiceServer
	responseError error
	mutex         sync.Mutex
	lastRequest   *microv1.RecommendRoutesRequest
	lastKeys      []string
}

func (server *recommendationMicroServer) RecommendRoutes(requestContext context.Context, request *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	server.mutex.Lock()
	server.lastRequest = request
	server.lastKeys = metadata.ValueFromIncomingContext(requestContext, "x-admin-key")
	server.mutex.Unlock()
	if server.responseError != nil {
		return nil, server.responseError
	}
	return recommendationSampleResponse(), nil
}

func (server *recommendationMicroServer) receivedRequest() *microv1.RecommendRoutesRequest {
	server.mutex.Lock()
	defer server.mutex.Unlock()
	return server.lastRequest
}

func (server *recommendationMicroServer) receivedKeys() []string {
	server.mutex.Lock()
	defer server.mutex.Unlock()
	return server.lastKeys
}

// recommendationSampleResponse es una ruta entre dos coordenadas: caminar 84 s,
// 240 s en la L1C y caminar 46 s, a 3 °C y con la línea llena. Su costo:
//
//	viaje 240, caminata (84 + 46) × 2 = 260, espera 300 × 2 = 600,
//	ocupación 240 × 0,6 = 144, clima 260 × 0,2 = 52; total 1296
func recommendationSampleResponse() *microv1.RecommendRoutesResponse {
	avoidCrowding := true
	return &microv1.RecommendRoutesResponse{
		Routes: []*microv1.RecommendedRoute{{
			TotalTimeSeconds: 370, TotalDistanceMeters: 1105, Transfers: 0,
			Movements: []*microv1.Movement{
				{FromStopId: "USER_LOCATION", ToStopId: "PAR-PORTAL-01", Mode: "walk", TimeSeconds: 84, DistanceMeters: 100},
				{FromStopId: "PAR-PORTAL-01", ToStopId: "PAR-CSF-01", Mode: "bus", RouteId: "L1C", TripId: "L1C-IDA", TimeSeconds: 240, DistanceMeters: 950},
				{FromStopId: "PAR-CSF-01", ToStopId: "DESTINATION_LOCATION", Mode: "walk", TimeSeconds: 46, DistanceMeters: 55},
			},
			Cost: &microv1.CostBreakdown{Ride: 240, Walk: 260, Wait: 600, Transfer: 0, Crowding: 144, Weather: 52, Total: 1296},
		}},
		Total:       1,
		CostWeights: &microv1.CostWeights{RideWeight: 1, WalkWeight: 2, WaitWeight: 2, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600},
		Preferences: &microv1.RoutePreferences{Priority: "balanced", MaxWalkMeters: 1000, AvoidCrowding: &avoidCrowding},
	}
}

// El cliente real llega al servidor falso: la petición y la respuesta cruzan la
// red sin cambios.
func TestRecommendationMicroServerRecordsRequestOverNetwork(t *testing.T) {
	server := &recommendationMicroServer{}
	microClient := startMicroClientWith(t, server)
	avoidCrowding := false
	request := &microv1.RecommendRoutesRequest{
		Origin: &microv1.RoutePoint{Point: &microv1.RoutePoint_StopId{StopId: "PAR-PORTAL-01"}},
		Destination: &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{
			Location: &microv1.Coordinates{Latitude: -38.74, Longitude: -72.6},
		}},
		Limit:       2,
		Preferences: &microv1.RoutePreferences{Priority: "fastest", AvoidCrowding: &avoidCrowding},
	}
	response, err := microClient.RecommendRoutes(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if !proto.Equal(response, recommendationSampleResponse()) {
		t.Fatalf("response changed over the network: %v", response)
	}
	if !proto.Equal(server.receivedRequest(), request) {
		t.Fatalf("received request = %v, want %v", server.receivedRequest(), request)
	}
}

// La respuesta de ejemplo es coherente: sus totales son la suma de sus partes.
func TestRecommendationSampleResponseAddsUp(t *testing.T) {
	route := recommendationSampleResponse().GetRoutes()[0]
	totalSeconds, totalMeters := int32(0), int32(0)
	for _, movement := range route.GetMovements() {
		totalSeconds += movement.GetTimeSeconds()
		totalMeters += movement.GetDistanceMeters()
	}
	if totalSeconds != route.GetTotalTimeSeconds() || totalMeters != route.GetTotalDistanceMeters() {
		t.Fatalf("movements add up to %d s and %d m", totalSeconds, totalMeters)
	}
	cost := route.GetCost()
	componentsSum := cost.GetRide() + cost.GetWalk() + cost.GetWait() + cost.GetTransfer() + cost.GetCrowding() + cost.GetWeather()
	if componentsSum != cost.GetTotal() {
		t.Fatalf("cost components add up to %v, total is %v", componentsSum, cost.GetTotal())
	}
}

// La clave interna llega una sola vez y con el valor configurado en el cliente.
func TestRecommendationMicroServerReceivesInternalKey(t *testing.T) {
	server := &recommendationMicroServer{}
	microClient := startMicroClientWith(t, server)
	if _, err := microClient.RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{}); err != nil {
		t.Fatal(err)
	}
	if keys := server.receivedKeys(); len(keys) != 1 || keys[0] != "clave-de-prueba" {
		t.Fatalf("received %d keys, want only the configured one", len(keys))
	}
}

// El cliente devuelve los errores de micro_service con su código y su mensaje.
func TestRecommendationMicroServerErrorsCrossNetwork(t *testing.T) {
	for _, expectedCode := range []codes.Code{codes.InvalidArgument, codes.NotFound, codes.Unauthenticated, codes.Unavailable, codes.Unimplemented} {
		server := &recommendationMicroServer{responseError: status.Error(expectedCode, "configured error")}
		response, err := startMicroClientWith(t, server).RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{})
		if response != nil || status.Code(err) != expectedCode || status.Convert(err).Message() != "configured error" {
			t.Fatalf("response = %v, err = %v; want only %v", response, err, expectedCode)
		}
	}
}

// Una imagen anterior de micro_service no tiene la función: el cliente recibe
// Unimplemented, que es lo que el handler deberá convertir en 503.
func TestOlderMicroServiceAnswersUnimplemented(t *testing.T) {
	_, err := startMicroClientWith(t, costMicroServer{}).RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{})
	if status.Code(err) != codes.Unimplemented {
		t.Fatalf("err = %v, want Unimplemented", err)
	}
}
