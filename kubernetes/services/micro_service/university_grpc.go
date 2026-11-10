package main

// Servidor gRPC de rutas a la universidad. Las reglas están en
// planUniversityRoutes: aquí solo se traducen los mensajes y los errores.

import (
	"context"
	"errors"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (server *microGRPCServer) ListCampuses(_ context.Context, _ *microv1.ListCampusesRequest) (*microv1.ListCampusesResponse, error) {
	response := &microv1.ListCampusesResponse{Campuses: make([]*microv1.Campus, 0, len(universityCampuses))}
	for _, campus := range universityCampuses {
		response.Campuses = append(response.Campuses, &microv1.Campus{Id: campus.ID, Name: campus.Name, StopIds: campus.StopIDs})
	}
	return response, nil
}

func (server *microGRPCServer) PlanUniversityRoutes(_ context.Context, request *microv1.PlanUniversityRoutesRequest) (*microv1.PlanUniversityRoutesResponse, error) {
	graph := server.service.store.Get()
	if graph == nil {
		return nil, status.Error(codes.Unavailable, "graph is not loaded")
	}
	routeRequest, err := universityRouteRequestFromProto(request)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	routes, err := planUniversityRoutes(graph, routeRequest)
	if err != nil {
		return nil, status.Error(universityRouteErrorCode(err), err.Error())
	}
	response := &microv1.PlanUniversityRoutesResponse{
		Routes: make([]*microv1.UniversityRoute, 0, len(routes)),
		Total:  int32(len(routes)),
	}
	for _, route := range routes {
		response.Routes = append(response.Routes, microUniversityRoute(route))
	}
	return response, nil
}

// universityRouteRequestFromProto aplica el límite por defecto cuando no viene:
// en proto3, un entero no enviado se lee como 0.
func universityRouteRequestFromProto(request *microv1.PlanUniversityRoutesRequest) (universityRouteRequest, error) {
	routeRequest := universityRouteRequest{
		OriginStopID: request.GetOriginStopId(),
		CampusID:     request.GetCampusId(),
		Limit:        int(request.GetLimit()),
	}
	if routeRequest.Limit == 0 {
		routeRequest.Limit = defaultUniversityRoutes
	}
	if (request.Latitude == nil) != (request.Longitude == nil) {
		return routeRequest, errInvalidLocation
	}
	if request.Latitude != nil {
		routeRequest.HasLocation = true
		routeRequest.Latitude, routeRequest.Longitude = request.GetLatitude(), request.GetLongitude()
	}
	return routeRequest, nil
}

func universityRouteErrorCode(err error) codes.Code {
	switch {
	case errors.Is(err, errUnknownCampus), errors.Is(err, errUnknownOriginStop), errors.Is(err, errNoNearbyStops):
		return codes.NotFound
	default:
		return codes.InvalidArgument
	}
}

func microUniversityRoute(route UniversityRoute) *microv1.UniversityRoute {
	routeResponse := newUniversityRouteResponse(route, universityRouteWeights())
	message := &microv1.UniversityRoute{
		CampusId:            routeResponse.CampusID,
		CampusName:          routeResponse.CampusName,
		DestinationStopId:   routeResponse.DestinationStopID,
		TotalTimeSeconds:    int32(routeResponse.TotalTimeSec),
		TotalDistanceMeters: int32(routeResponse.TotalDistanceM),
		Transfers:           int32(routeResponse.Transfers),
		Movements:           make([]*microv1.Movement, 0, len(routeResponse.Movements)),
		// Usa el mismo costo redondeado que REST, para que ambas API coincidan.
		Cost: &microv1.CostBreakdown{
			Ride:     routeResponse.Cost.Ride,
			Walk:     routeResponse.Cost.Walk,
			Wait:     routeResponse.Cost.Wait,
			Transfer: routeResponse.Cost.Transfer,
			Total:    routeResponse.Cost.Total,
		},
	}
	for _, movement := range routeResponse.Movements {
		message.Movements = append(message.Movements, &microv1.Movement{
			FromStopId:     movement.FromStopID,
			ToStopId:       movement.ToStopID,
			Mode:           movement.Mode,
			RouteId:        movement.RouteID,
			TripId:         movement.TripID,
			TimeSeconds:    int32(movement.TimeSec),
			DistanceMeters: int32(movement.DistanceM),
		})
	}
	return message
}

// microCostWeights convierte los pesos al mensaje gRPC. Parte del mismo formato
// que REST, para que ambas API informen exactamente lo mismo.
func microCostWeights(weights CostWeights) *microv1.CostWeights {
	weightsResponse := newCostWeightsResponse(weights)
	return &microv1.CostWeights{
		RideWeight:             weightsResponse.RideWeight,
		WalkWeight:             weightsResponse.WalkWeight,
		WaitWeight:             weightsResponse.WaitWeight,
		TransferPenaltySeconds: weightsResponse.TransferPenaltySeconds,
		AssumedHeadwaySeconds:  int32(weightsResponse.AssumedHeadwaySeconds),
	}
}
