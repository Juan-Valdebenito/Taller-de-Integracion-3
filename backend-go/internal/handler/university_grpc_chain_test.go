package handler

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc"

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
			Cost: &microv1.CostBreakdown{Ride: 3060, Walk: 562.5, Wait: 1500, Transfer: 300, Total: 5422.5},
		}},
		Total:       1,
		CostWeights: &microv1.CostWeights{RideWeight: 1.5, WalkWeight: 2.5, WaitWeight: 2.5, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600},
	}, nil
}

func startCostMicroClient(t *testing.T) *grpcclient.MicroClient {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	grpcServer := grpc.NewServer()
	microv1.RegisterMicroServiceServer(grpcServer, costMicroServer{})
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
	expectedCost := costBreakdownJSON{Ride: 3060, Walk: 562.5, Wait: 1500, Transfer: 300, Total: 5422.5}
	if len(body.Routes) != 1 || body.Routes[0].Cost != expectedCost || body.Routes[0].Transfers != 1 {
		t.Errorf("se esperaba el costo %+v: %s", expectedCost, recorder.Body.String())
	}
	expectedWeights := costWeightsJSON{RideWeight: 1.5, WalkWeight: 2.5, WaitWeight: 2.5, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600}
	if body.CostWeights == nil || *body.CostWeights != expectedWeights {
		t.Errorf("se esperaban los pesos %+v: %s", expectedWeights, recorder.Body.String())
	}
}
