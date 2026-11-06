package main

import (
	"errors"
	"testing"
)

func TestCampusStopsExistInOfficialNetwork(t *testing.T) {
	network := loadSeedNetwork(t)
	networkStops := make(map[string]bool)
	for _, ride := range network.Rides {
		networkStops[ride.FromStopID], networkStops[ride.ToStopID] = true, true
	}
	for _, campus := range universityCampuses {
		if len(campus.StopIDs) == 0 {
			t.Errorf("%s no tiene paraderos", campus.ID)
		}
		for _, stopID := range campus.StopIDs {
			if !networkStops[stopID] {
				t.Errorf("%s usa %s, que no está en la red", campus.ID, stopID)
			}
		}
	}
}

func TestCampusIDsAreUnique(t *testing.T) {
	knownCampusIDs := make(map[string]bool)
	for _, campus := range universityCampuses {
		if knownCampusIDs[campus.ID] {
			t.Errorf("el campus %s está repetido", campus.ID)
		}
		knownCampusIDs[campus.ID] = true
	}
}

func TestSelectCampusesReturnsRequestedCampus(t *testing.T) {
	campuses, err := selectCampuses("san-francisco")
	if err != nil {
		t.Fatal(err)
	}
	if len(campuses) != 1 || campuses[0].ID != "san-francisco" {
		t.Errorf("campus inesperados: %+v", campuses)
	}
}

func TestSelectCampusesWithoutIDReturnsAll(t *testing.T) {
	campuses, err := selectCampuses("")
	if err != nil {
		t.Fatal(err)
	}
	if len(campuses) != len(universityCampuses) {
		t.Errorf("se esperaban %d campus y se obtuvieron %d", len(universityCampuses), len(campuses))
	}
}

func TestSelectCampusesRejectsUnknownCampus(t *testing.T) {
	if _, err := selectCampuses("campus-inexistente"); !errors.Is(err, errUnknownCampus) {
		t.Errorf("se esperaba errUnknownCampus y se obtuvo %v", err)
	}
}

func TestCampusHasStop(t *testing.T) {
	campus := Campus{ID: "test", StopIDs: []string{"STOP-1", "STOP-2"}}
	if !campus.hasStop("STOP-2") {
		t.Error("STOP-2 pertenece al campus")
	}
	if campus.hasStop("STOP-3") {
		t.Error("STOP-3 no pertenece al campus")
	}
}

func campusByID(t *testing.T, campusID string) Campus {
	t.Helper()
	campuses, err := selectCampuses(campusID)
	if err != nil {
		t.Fatal(err)
	}
	return campuses[0]
}

func TestRoutesToCampusStartWithFastestRoute(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes := routesToCampus(graph, "PAR-PORTAL-01", campusByID(t, "san-francisco"), 3)
	if len(routes) == 0 {
		t.Fatal("se esperaba al menos una ruta")
	}
	if pathSeconds(routes[0].Path) != 240 {
		t.Errorf("se esperaban 240 s y se obtuvieron %d s", pathSeconds(routes[0].Path))
	}
	if routes[0].CampusName != "Campus San Francisco" || routes[0].DestinationStopID != "PAR-CSF-01" {
		t.Errorf("destino inesperado: %+v", routes[0])
	}
}

func TestRoutesToCampusUseItsFastestStop(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes := routesToCampus(graph, "PAR-DPORT-01", campusByID(t, "san-juan-pablo-ii"), 3)
	if len(routes) == 0 {
		t.Fatal("se esperaba al menos una ruta")
	}
	if routes[0].DestinationStopID != "PAR-CJP-01" || pathSeconds(routes[0].Path) != 1320 {
		t.Errorf("se esperaba PAR-CJP-01 en 1320 s: %s en %d s", routes[0].DestinationStopID, pathSeconds(routes[0].Path))
	}
}

func TestRoutesToCampusFromEveryStopAreValid(t *testing.T) {
	network := loadSeedNetwork(t)
	graph := network.buildGraph()
	const routeLimit = 3
	for _, campus := range universityCampuses {
		for originStopID := range graph.Edges {
			routes := routesToCampus(graph, originStopID, campus, routeLimit)
			if campus.hasStop(originStopID) {
				if routes != nil {
					t.Errorf("%s ya está en %s y no debe tener rutas", originStopID, campus.ID)
				}
				continue
			}
			if len(routes) == 0 || len(routes) > routeLimit {
				t.Errorf("%s -> %s entregó %d rutas", originStopID, campus.ID, len(routes))
			}
			for routeIndex, route := range routes {
				assertPathIsValid(t, route.Path, originStopID, route.DestinationStopID)
				if campus.isReachedBeforeEnd(route.Path) {
					t.Errorf("%s -> %s pasa por el campus antes de terminar", originStopID, campus.ID)
				}
				if routeIndex > 0 && pathSeconds(routes[routeIndex-1].Path) > pathSeconds(route.Path) {
					t.Errorf("%s -> %s no está ordenado por tiempo", originStopID, campus.ID)
				}
			}
		}
	}
}

func TestIsReachedBeforeEndAllowsArrivalAtLastStep(t *testing.T) {
	campus := Campus{ID: "test", StopIDs: []string{"STOP-1", "STOP-2"}}
	arrivesAtEnd := []pathStep{
		{From: "ORIGIN", Edge: Edge{ToStopID: "MIDDLE"}},
		{From: "MIDDLE", Edge: Edge{ToStopID: "STOP-2"}},
	}
	if campus.isReachedBeforeEnd(arrivesAtEnd) {
		t.Error("llegar en el último tramo es válido")
	}
	passesThroughCampus := []pathStep{
		{From: "ORIGIN", Edge: Edge{ToStopID: "STOP-1"}},
		{From: "STOP-1", Edge: Edge{ToStopID: "STOP-2"}},
	}
	if !campus.isReachedBeforeEnd(passesThroughCampus) {
		t.Error("la ruta ya había llegado al campus")
	}
}
