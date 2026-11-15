package main

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
)

func TestValidateOccupancyAcceptsValidValues(t *testing.T) {
	validOccupancies := []LineOccupancy{
		nil,
		{},
		{"L7A": 0, "L7B": 0.5, "L1C": 1},
		{"L7A": maxOccupancyRatio},
	}
	for _, occupancy := range validOccupancies {
		if err := validateOccupancy(occupancy); err != nil {
			t.Errorf("%v debe ser válida: %v", occupancy, err)
		}
	}
}

func TestValidateOccupancyRejectsInvalidValues(t *testing.T) {
	tooManyLines := make(LineOccupancy, maxOccupancyLines+1)
	for lineIndex := 0; lineIndex <= maxOccupancyLines; lineIndex++ {
		tooManyLines[fmt.Sprintf("L%d", lineIndex)] = 0.5
	}
	invalidOccupancies := map[string]LineOccupancy{
		"línea sin ID":      {"": 0.5},
		"negativa":          {"L7A": -0.1},
		"sobre el máximo":   {"L7A": maxOccupancyRatio + 0.1},
		"NaN":               {"L7A": math.NaN()},
		"infinita":          {"L7A": math.Inf(1)},
		"demasiadas líneas": tooManyLines,
	}
	for caseName, occupancy := range invalidOccupancies {
		if err := validateOccupancy(occupancy); !errors.Is(err, errInvalidOccupancy) {
			t.Errorf("%s: se esperaba errInvalidOccupancy y se obtuvo %v", caseName, err)
		}
	}
}

func TestParseOccupancyReadsEveryLine(t *testing.T) {
	occupancy, err := parseOccupancy("L7A:0.95,L7B:0.3")
	if err != nil {
		t.Fatal(err)
	}
	if len(occupancy) != 2 || occupancy["L7A"] != 0.95 || occupancy["L7B"] != 0.3 {
		t.Errorf("ocupación inesperada: %v", occupancy)
	}
	if occupancy, err := parseOccupancy(""); err != nil || occupancy != nil {
		t.Errorf("sin parámetro no debe haber ocupación: %v, %v", occupancy, err)
	}
}

func TestParseOccupancyRejectsMalformedValues(t *testing.T) {
	for _, rawOccupancy := range []string{"L7A", "L7A:llena", "L7A:0.9,", "L7A:0.9,L7A:0.2", ",L7A:0.9"} {
		if _, err := parseOccupancy(rawOccupancy); !errors.Is(err, errInvalidOccupancy) {
			t.Errorf("%q: se esperaba errInvalidOccupancy y se obtuvo %v", rawOccupancy, err)
		}
	}
}

func TestRESTUniversityRoutesUseOccupancy(t *testing.T) {
	handler := universityTestHandler(t)
	statusCode, body := getUniversityRoutes(t, handler, "from_stop=PAR-PORTAL-01&campus=san-francisco&limit=1&occupancy=L7B:0.95")
	if statusCode != http.StatusOK || body.Total != 1 || body.Routes[0].Movements[0].RouteID != "L1C" {
		t.Errorf("con la 7B llena se esperaba la 1C: %d %+v", statusCode, body)
	}
	statusCode, body = getUniversityRoutes(t, handler, "from_stop=PAR-PORTAL-01&occupancy=L7B:mucha")
	if statusCode != http.StatusBadRequest || body.Error == "" {
		t.Errorf("una ocupación mal escrita debe responder 400: %d %+v", statusCode, body)
	}
}

func TestProtoRequestKeepsOccupancy(t *testing.T) {
	routeRequest, err := universityRouteRequestFromProto(&microv1.PlanUniversityRoutesRequest{
		OriginStopId:  "PAR-PORTAL-01",
		LineOccupancy: map[string]float64{"L7B": 0.95},
	})
	if err != nil || routeRequest.LineOccupancy["L7B"] != 0.95 {
		t.Errorf("la ocupación debe pasar a la petición: %+v, %v", routeRequest, err)
	}
}

func TestGRPCUniversityRoutesUseOccupancy(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	response, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01", CampusId: "san-francisco", Limit: 1,
		LineOccupancy: map[string]float64{"L7B": 0.95},
	})
	if err != nil {
		t.Fatal(err)
	}
	if line := response.GetRoutes()[0].GetMovements()[0].GetRouteId(); line != "L1C" {
		t.Errorf("con la 7B llena se esperaba la 1C, y se obtuvo %s", line)
	}
	_, err = client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01", LineOccupancy: map[string]float64{"L7B": -1},
	})
	assertGRPCCode(t, err, codes.InvalidArgument)
}

// Con la 7B y la 1C llenas no hay cómo evitarlo: la ruta sigue en micro y paga el
// recargo. 240 s de viaje con factor 1,6 agregan 144.
func TestUniversityRoutesReportCrowding(t *testing.T) {
	query := "from_stop=PAR-PORTAL-01&campus=san-francisco&limit=1&occupancy=L7B:0.95,L1C:0.95"
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), query)
	if statusCode != http.StatusOK || body.Total != 1 {
		t.Fatalf("se esperaba una ruta: %d %+v", statusCode, body)
	}
	expectedCost := costBreakdownResponse{Ride: 240, Wait: 600, Crowding: 144, Total: 984}
	if body.Routes[0].Cost != expectedCost {
		t.Errorf("se esperaba %+v y se obtuvo %+v", expectedCost, body.Routes[0].Cost)
	}

	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	response, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01", CampusId: "san-francisco", Limit: 1,
		LineOccupancy: map[string]float64{"L7B": 0.95, "L1C": 0.95},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cost := response.GetRoutes()[0].GetCost(); cost.GetCrowding() != 144 || cost.GetTotal() != 984 {
		t.Errorf("gRPC debe informar el mismo recargo: %+v", cost)
	}
}

func TestRouteRequestCostWeightsIncludeOccupancy(t *testing.T) {
	routeRequest := universityRouteRequest{LineOccupancy: LineOccupancy{"L7B": 0.95}}
	weights := routeRequest.costWeights()
	if weights.Occupancy.factorFor("L7B") != fullCrowdingFactor || weights.WalkWeight != defaultCostWeights().WalkWeight {
		t.Errorf("los pesos deben ser los de siempre más la ocupación: %+v", weights)
	}
}

func TestPlanUniversityRoutesRejectsInvalidOccupancy(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routeRequest := universityRouteRequest{OriginStopID: "PAR-PORTAL-01", Limit: 3, LineOccupancy: LineOccupancy{"L7A": -1}}
	if _, err := planUniversityRoutes(graph, routeRequest); !errors.Is(err, errInvalidOccupancy) {
		t.Errorf("se esperaba errInvalidOccupancy y se obtuvo %v", err)
	}
}

// De PAR-PORTAL-01 a San Francisco, la 7B y la 1C tardan lo mismo. Si la 7B va
// llena, la ruta debe usar la 1C.
func TestPlanUniversityRoutesAvoidsFullLine(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	firstLine := func(occupancy LineOccupancy) string {
		routes, err := planUniversityRoutes(graph, universityRouteRequest{
			OriginStopID: "PAR-PORTAL-01", CampusID: "san-francisco", Limit: 1, LineOccupancy: occupancy,
		})
		if err != nil || len(routes) != 1 {
			t.Fatalf("se esperaba una ruta: %+v, %v", routes, err)
		}
		return routes[0].Path[0].Edge.RouteID
	}
	if line := firstLine(LineOccupancy{"L7B": 0.95}); line != "L1C" {
		t.Errorf("con la 7B llena se esperaba la 1C, y se obtuvo %s", line)
	}
	if line := firstLine(LineOccupancy{"L1C": 0.95}); line != "L7B" {
		t.Errorf("con la 1C llena se esperaba la 7B, y se obtuvo %s", line)
	}
}
