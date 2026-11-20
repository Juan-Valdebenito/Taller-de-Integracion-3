package main

import (
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
)

func TestGRPCRecommendRoutesBetweenStops(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())

	response, err := client.RecommendRoutes(authorizedContext(t), &microv1.RecommendRoutesRequest{
		Origin: &microv1.RoutePoint{
			Point: &microv1.RoutePoint_StopId{StopId: "PAR-PORTAL-01"},
		},
		Destination: &microv1.RoutePoint{
			Point: &microv1.RoutePoint_StopId{StopId: "PAR-CJP-02"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetTotal() == 0 || len(response.GetRoutes()) == 0 {
		t.Fatalf("se esperaba al menos una ruta: %+v", response)
	}
	if response.GetRoutes()[0].GetCost() == nil {
		t.Fatal("la ruta debe incluir su costo")
	}
}