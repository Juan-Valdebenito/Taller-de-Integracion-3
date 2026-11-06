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
