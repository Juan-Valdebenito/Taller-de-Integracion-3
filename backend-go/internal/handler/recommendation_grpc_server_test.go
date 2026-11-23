package handler

import (
	"context"
	"sync"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

// recommendationMicroServer responde RecommendRoutes por una conexión gRPC real y
// guarda la última petición, para revisar qué llegó por la red. El mutex es
// necesario porque gRPC atiende cada petición en otra goroutine.
type recommendationMicroServer struct {
	microv1.UnimplementedMicroServiceServer
	mutex       sync.Mutex
	lastRequest *microv1.RecommendRoutesRequest
}

func (server *recommendationMicroServer) RecommendRoutes(_ context.Context, request *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	server.mutex.Lock()
	server.lastRequest = request
	server.mutex.Unlock()
	return recommendationSampleResponse(), nil
}

func (server *recommendationMicroServer) receivedRequest() *microv1.RecommendRoutesRequest {
	server.mutex.Lock()
	defer server.mutex.Unlock()
	return server.lastRequest
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
