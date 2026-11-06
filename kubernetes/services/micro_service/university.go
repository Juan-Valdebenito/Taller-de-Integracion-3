package main

// Destinos universitarios. Un campus puede tener varios paraderos, así que el
// destino es un grupo de paraderos y no uno solo.

import (
	"errors"
	"sort"
)

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

// UniversityRoute es una ruta y el campus al que llega.
type UniversityRoute struct {
	CampusID          string
	CampusName        string
	DestinationStopID string
	Path              []pathStep
}

// routesToCampus entrega hasta limit rutas hacia cualquiera de los paraderos del
// campus, de la más rápida a la más lenta. Si el origen ya es un paradero del
// campus, el pasajero ya llegó y no hay ruta que entregar.
func routesToCampus(graph *TransitGraph, originStopID string, campus Campus, limit int) []UniversityRoute {
	if limit <= 0 || campus.hasStop(originStopID) {
		return nil
	}
	routes := make([]UniversityRoute, 0, limit)
	for _, destinationStopID := range campus.StopIDs {
		for _, path := range alternativePaths(graph, originStopID, destinationStopID, limit) {
			if campus.isReachedBeforeEnd(path) {
				continue
			}
			routes = append(routes, UniversityRoute{
				CampusID: campus.ID, CampusName: campus.Name, DestinationStopID: destinationStopID, Path: path,
			})
		}
	}
	sortUniversityRoutes(routes)
	if len(routes) > limit {
		routes = routes[:limit]
	}
	return routes
}

// isReachedBeforeEnd detecta rutas que pasan por un paradero del campus y siguen
// hacia otro: el pasajero ya había llegado.
func (campus Campus) isReachedBeforeEnd(path []pathStep) bool {
	for _, step := range path[:len(path)-1] {
		if campus.hasStop(step.Edge.ToStopID) {
			return true
		}
	}
	return false
}

// sortUniversityRoutes ordena por tiempo. Los empates se resuelven por la clave de
// la ruta para que el resultado sea siempre el mismo.
func sortUniversityRoutes(routes []UniversityRoute) {
	sort.Slice(routes, func(firstIndex, secondIndex int) bool {
		firstSeconds, secondSeconds := pathSeconds(routes[firstIndex].Path), pathSeconds(routes[secondIndex].Path)
		if firstSeconds != secondSeconds {
			return firstSeconds < secondSeconds
		}
		return pathKey(routes[firstIndex].Path) < pathKey(routes[secondIndex].Path)
	})
}
