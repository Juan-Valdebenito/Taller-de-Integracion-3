package main

// Destinos universitarios. Un campus puede tener varios paraderos, así que el
// destino es un grupo de paraderos y no uno solo.

import "errors"

// errUnknownCampus indica que se pidió un campus que no existe.
var errUnknownCampus = errors.New("unknown campus")

// Campus es un destino universitario y los paraderos que lo atienden.
type Campus struct {
	ID      string
	Name    string
	StopIDs []string
}

var universityCampuses = []Campus{
	{ID: "san-francisco", Name: "Campus San Francisco", StopIDs: []string{"PAR-CSF-01"}},
	{ID: "san-juan-pablo-ii", Name: "Campus San Juan Pablo II", StopIDs: []string{"PAR-CJP-01", "PAR-CJP-02"}},
}

// selectCampuses entrega el campus pedido. Con campusID vacío entrega todos.
func selectCampuses(campusID string) ([]Campus, error) {
	if campusID == "" {
		return universityCampuses, nil
	}
	for _, campus := range universityCampuses {
		if campus.ID == campusID {
			return []Campus{campus}, nil
		}
	}
	return nil, errUnknownCampus
}

// hasStop indica si un paradero pertenece al campus.
func (campus Campus) hasStop(stopID string) bool {
	for _, campusStopID := range campus.StopIDs {
		if campusStopID == stopID {
			return true
		}
	}
	return false
}
