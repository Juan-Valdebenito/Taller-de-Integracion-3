package router

import (
	"context"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
)

// RecommendRoutes responde una ruta como lo haría micro_service: 240 s en la L7B
// de PAR-PORTAL-01 a PAR-CSF-01, con 300 s de espera por su peso de 2.
func (fakeMicroService) RecommendRoutes(context.Context, *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	avoidCrowding := true
	return &microv1.RecommendRoutesResponse{
		Routes: []*microv1.RecommendedRoute{{
			TotalTimeSeconds: 240, TotalDistanceMeters: 950,
			Movements: []*microv1.Movement{{
				FromStopId: "PAR-PORTAL-01", ToStopId: "PAR-CSF-01", Mode: "bus",
				RouteId: "L7B", TripId: "L7B-IDA", TimeSeconds: 240, DistanceMeters: 950,
			}},
			Cost: &microv1.CostBreakdown{Ride: 240, Wait: 600, Total: 840},
		}},
		Total:       1,
		CostWeights: &microv1.CostWeights{RideWeight: 1, WalkWeight: 2, WaitWeight: 2, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600},
		Preferences: &microv1.RoutePreferences{Priority: "balanced", MaxWalkMeters: 1000, AvoidCrowding: &avoidCrowding},
	}, nil
}

// El router recibe el servicio falso como MicroRPC, así que se prueba igual.
func TestFakeMicroServiceAnswersRecommendations(t *testing.T) {
	var micro handler.MicroRPC = fakeMicroService{}
	response, err := micro.RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetTotal() != 1 || len(response.GetRoutes()) != 1 {
		t.Fatalf("total = %d with %d routes, want 1", response.GetTotal(), len(response.GetRoutes()))
	}
	cost := response.GetRoutes()[0].GetCost()
	if cost.GetRide()+cost.GetWait() != cost.GetTotal() {
		t.Fatalf("cost = %v, want ride plus wait", cost)
	}
	if response.GetCostWeights() == nil || response.GetPreferences() == nil {
		t.Fatalf("response = %v, want weights and preferences", response)
	}
}
