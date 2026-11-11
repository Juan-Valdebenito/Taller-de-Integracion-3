package main

import (
	"errors"
	"fmt"
	"math"
	"testing"
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
