package main

// API REST de rutas a la universidad. planUniversityRoutes valida la petición y
// no depende de HTTP, para que gRPC aplique exactamente las mismas reglas.

import (
	"errors"
	"net/http"
	"strconv"
)

const (
	defaultUniversityRoutes = 3
	maxUniversityRoutes     = 5
)

var (
	errInvalidRouteLimit = errors.New("limit must be between 1 and 5")
	errInvalidOrigin     = errors.New("provide from_stop, or lat and long")
	errInvalidLocation   = errors.New("invalid coordinates")
	errUnknownOriginStop = errors.New("origin stop not found")
	errInvalidOccupancy  = errors.New("occupancy must map line ids to values between 0 and 2")
)

// maxOccupancyLines limita cuántas líneas puede traer una petición, para que una
// petición enorme no consuma memoria.
const maxOccupancyLines = 50

// maxOccupancyRatio acepta micros sobre su capacidad, pero rechaza valores
// absurdos, como una micro al 500 %.
const maxOccupancyRatio = 2.0

// universityRouteRequest indica desde dónde parte el pasajero: un paradero o una
// posición, nunca ambos. Un CampusID vacío significa cualquier campus.
type universityRouteRequest struct {
	OriginStopID string
	HasLocation  bool
	Latitude     float64
	Longitude    float64
	CampusID     string
	Limit        int
	// LineOccupancy es la ocupación de cada línea; puede venir vacía.
	LineOccupancy LineOccupancy
}

// costWeights son los pesos de esta petición: los de siempre más su ocupación.
// Se usan para ordenar las rutas y también para informar su costo, así el costo
// de la respuesta siempre explica el orden.
func (routeRequest universityRouteRequest) costWeights() CostWeights {
	weights := defaultCostWeights()
	weights.Occupancy = routeRequest.LineOccupancy
	return weights
}

// validateOccupancy rechaza IDs vacíos y valores fuera de rango. math.IsNaN no se
// necesita: NaN no cumple la comparación escrita en positivo.
func validateOccupancy(occupancy LineOccupancy) error {
	if len(occupancy) > maxOccupancyLines {
		return errInvalidOccupancy
	}
	for routeID, occupancyRatio := range occupancy {
		if routeID == "" || !(occupancyRatio >= 0 && occupancyRatio <= maxOccupancyRatio) {
			return errInvalidOccupancy
		}
	}
	return nil
}

func planUniversityRoutes(graph *TransitGraph, routeRequest universityRouteRequest) ([]UniversityRoute, error) {
	if routeRequest.Limit < 1 || routeRequest.Limit > maxUniversityRoutes {
		return nil, errInvalidRouteLimit
	}
	if (routeRequest.OriginStopID == "") == !routeRequest.HasLocation {
		return nil, errInvalidOrigin
	}
	if err := validateOccupancy(routeRequest.LineOccupancy); err != nil {
		return nil, err
	}
	if routeRequest.HasLocation {
		if !isValidLocation(routeRequest.Latitude, routeRequest.Longitude) {
			return nil, errInvalidLocation
		}
		return routesFromLocation(graph, routeRequest.Latitude, routeRequest.Longitude, routeRequest.CampusID, routeRequest.Limit, routeRequest.costWeights())
	}
	if _, exists := graph.Stops[routeRequest.OriginStopID]; !exists {
		return nil, errUnknownOriginStop
	}
	return routesToUniversity(graph, routeRequest.OriginStopID, routeRequest.CampusID, routeRequest.Limit, routeRequest.costWeights())
}

// isValidLocation está escrita en positivo para rechazar también NaN, que no es
// menor ni mayor que ningún número.
func isValidLocation(latitude, longitude float64) bool {
	return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

type campusResponse struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	StopIDs []string `json:"stop_ids"`
}

type universityRouteResponse struct {
	CampusID          string     `json:"campus_id"`
	CampusName        string     `json:"campus_name"`
	DestinationStopID string     `json:"destination_stop_id"`
	TotalTimeSec      int        `json:"total_time_seconds"`
	TotalDistanceM    int        `json:"total_distance_meters"`
	Transfers         int        `json:"transfers"`
	Movements         []Movement `json:"movements"`
	// Cost es el costo con que se ordenó la ruta, en segundos equivalentes.
	Cost costBreakdownResponse `json:"cost"`
}

func (server *Server) campuses(writer http.ResponseWriter, _ *http.Request) {
	response := make([]campusResponse, 0, len(universityCampuses))
	for _, campus := range universityCampuses {
		response = append(response, campusResponse{ID: campus.ID, Name: campus.Name, StopIDs: campus.StopIDs})
	}
	writeJSON(writer, http.StatusOK, map[string]any{"campuses": response})
}

func (server *Server) universityRoutes(writer http.ResponseWriter, request *http.Request) {
	graph := server.store.Get()
	if graph == nil {
		writeError(writer, http.StatusServiceUnavailable, "graph is not loaded")
		return
	}
	routeRequest, err := parseUniversityRouteRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	routes, err := planUniversityRoutes(graph, routeRequest)
	if err != nil {
		writeError(writer, universityRouteErrorStatus(err), err.Error())
		return
	}
	weights := routeRequest.costWeights()
	response := make([]universityRouteResponse, 0, len(routes))
	for _, route := range routes {
		response = append(response, newUniversityRouteResponse(route, weights))
	}
	writeJSON(writer, http.StatusOK, map[string]any{
		"routes":       response,
		"total":        len(response),
		"cost_weights": newCostWeightsResponse(weights),
	})
}

func parseUniversityRouteRequest(request *http.Request) (universityRouteRequest, error) {
	query := request.URL.Query()
	routeRequest := universityRouteRequest{
		OriginStopID: query.Get("from_stop"),
		CampusID:     query.Get("campus"),
		Limit:        defaultUniversityRoutes,
	}
	if rawLimit := query.Get("limit"); rawLimit != "" {
		limit, err := strconv.Atoi(rawLimit)
		if err != nil {
			return routeRequest, errInvalidRouteLimit
		}
		routeRequest.Limit = limit
	}
	rawLatitude, rawLongitude := query.Get("lat"), query.Get("long")
	if rawLatitude == "" && rawLongitude == "" {
		return routeRequest, nil
	}
	latitude, latitudeErr := strconv.ParseFloat(rawLatitude, 64)
	longitude, longitudeErr := strconv.ParseFloat(rawLongitude, 64)
	if latitudeErr != nil || longitudeErr != nil {
		return routeRequest, errInvalidLocation
	}
	routeRequest.HasLocation, routeRequest.Latitude, routeRequest.Longitude = true, latitude, longitude
	return routeRequest, nil
}

func universityRouteErrorStatus(err error) int {
	switch {
	case errors.Is(err, errUnknownCampus), errors.Is(err, errUnknownOriginStop), errors.Is(err, errNoNearbyStops):
		return http.StatusNotFound
	default:
		return http.StatusBadRequest
	}
}

func newUniversityRouteResponse(route UniversityRoute, weights CostWeights) universityRouteResponse {
	response := universityRouteResponse{
		CampusID:          route.CampusID,
		CampusName:        route.CampusName,
		DestinationStopID: route.DestinationStopID,
		Transfers:         countTransfers(route.Path),
		Movements:         make([]Movement, 0, len(route.Path)),
		Cost:              newCostBreakdownResponse(pathCostBreakdown(route.Path, weights)),
	}
	for _, step := range route.Path {
		response.TotalTimeSec += step.Edge.BaseTimeSec
		response.TotalDistanceM += step.Edge.DistanceM
		response.Movements = append(response.Movements, movementFromStep(step))
	}
	return response
}
