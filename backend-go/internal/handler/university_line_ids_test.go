package handler

import (
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
)

func TestMicroLineIDTranslatesBothSpellings(t *testing.T) {
	testCases := map[string]string{
		"route-7A": "L7A",
		"route-7a": "L7A",
		"route-7B": "L7B",
		"route-1c": "L1C",
	}
	for backendRouteID, expectedLineID := range testCases {
		lineID, recognized := microLineID(backendRouteID)
		if !recognized || lineID != expectedLineID {
			t.Errorf("%s: se esperaba %s y se obtuvo %q (%v)", backendRouteID, expectedLineID, lineID, recognized)
		}
	}
}

func TestMicroLineIDRejectsUnknownFormats(t *testing.T) {
	for _, backendRouteID := range []string{"", "route-", "7A", "L7A", "bus-7a-01", "route-7 A", "route-7A/1"} {
		if lineID, recognized := microLineID(backendRouteID); recognized {
			t.Errorf("%q no debe reconocerse, y se obtuvo %s", backendRouteID, lineID)
		}
	}
}

// Una micro de la simulación ("route-7A") y otra de la base ("route-7a") son de la
// misma línea: deben combinarse ponderadas por su capacidad.
func TestLineOccupancyCombinesBothSpellings(t *testing.T) {
	tracker := liveoccupancy.NewTracker()
	tracker.Record("bus-sim-7a", "route-7A", 30, 40)
	tracker.Record("bus-7a-01", "route-7a", 6, 20)
	tracker.Record("bus-demo", "otra-linea", 10, 10)
	occupancy := tracker.LineOccupancyBy(microLineID)
	if len(occupancy) != 1 || occupancy["L7A"] != 0.6 {
		t.Errorf("se esperaba solo L7A con (30 + 6) / (40 + 20) = 0,6: %v", occupancy)
	}
}
