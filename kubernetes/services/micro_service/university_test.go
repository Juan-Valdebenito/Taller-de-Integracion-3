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

func campusesInRoutes(routes []UniversityRoute) map[string]bool {
	campusIDs := make(map[string]bool)
	for _, route := range routes {
		campusIDs[route.CampusID] = true
	}
	return campusIDs
}

func TestRoutesToUniversityIncludeEveryCampus(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-PORTAL-01", "", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(routes) != 3 {
		t.Fatalf("se esperaban 3 rutas y se obtuvieron %d", len(routes))
	}
	if campusIDs := campusesInRoutes(routes); !campusIDs["san-francisco"] || !campusIDs["san-juan-pablo-ii"] {
		t.Errorf("deben aparecer ambos campus: %v", campusIDs)
	}
	for routeIndex := 1; routeIndex < len(routes); routeIndex++ {
		if pathSeconds(routes[routeIndex-1].Path) > pathSeconds(routes[routeIndex].Path) {
			t.Error("las rutas deben estar ordenadas por tiempo")
		}
	}
}

func TestRoutesToUniversityFilterByCampus(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-PORTAL-01", "san-juan-pablo-ii", 3)
	if err != nil {
		t.Fatal(err)
	}
	if campusIDs := campusesInRoutes(routes); len(routes) == 0 || len(campusIDs) != 1 || !campusIDs["san-juan-pablo-ii"] {
		t.Errorf("solo debe aparecer San Juan Pablo II: %v", campusIDs)
	}
}

func TestRoutesToUniversityFromCampusGoToOtherCampus(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-CSF-01", "", 3)
	if err != nil {
		t.Fatal(err)
	}
	if campusIDs := campusesInRoutes(routes); len(routes) == 0 || campusIDs["san-francisco"] {
		t.Errorf("desde San Francisco solo debe ofrecer el otro campus: %v", campusIDs)
	}
}

func TestRoutesToUniversityRespectLimit(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-PORTAL-01", "", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(routes) != 1 || pathSeconds(routes[0].Path) != 240 {
		t.Errorf("con límite 1 debe quedar la ruta más rápida: %+v", routes)
	}
	routes, err = routesToUniversity(graph, "PAR-PORTAL-01", "", 0)
	if err != nil || len(routes) != 0 {
		t.Errorf("con límite 0 no debe haber rutas: %+v, %v", routes, err)
	}
}

func TestRoutesToUniversityRejectUnknownCampus(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	if _, err := routesToUniversity(graph, "PAR-PORTAL-01", "campus-inexistente", 3); !errors.Is(err, errUnknownCampus) {
		t.Errorf("se esperaba errUnknownCampus y se obtuvo %v", err)
	}
}

func TestMergeCampusRoutesKeepsBestOfEachCampus(t *testing.T) {
	routeWithTime := func(campusID string, seconds int) UniversityRoute {
		return UniversityRoute{CampusID: campusID, Path: []pathStep{{Edge: Edge{BaseTimeSec: seconds}}}}
	}
	nearCampusRoutes := []UniversityRoute{routeWithTime("near", 100), routeWithTime("near", 200), routeWithTime("near", 300)}
	farCampusRoutes := []UniversityRoute{routeWithTime("far", 900)}
	routes := mergeCampusRoutes([][]UniversityRoute{nearCampusRoutes, farCampusRoutes}, 3)
	assertTimes(t, []int{pathSeconds(routes[0].Path), pathSeconds(routes[1].Path), pathSeconds(routes[2].Path)}, []int{100, 200, 900})
}
