package main

// RecommendRoutes expone por gRPC el planificador de rutas entre cualquier
// origen y destino. La autenticación x-admin-key se aplica en el interceptor.

import (
	"context"
	"errors"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (server *microGRPCServer) RecommendRoutes(_ context.Context, request *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	if request == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}

	graph := server.service.store.Get()
	if graph == nil {
		return nil, status.Error(codes.Unavailable, "graph is not loaded")
	}

	routeRequest, err := recommendationRequestFromProto(request)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	weights := preferenceCostWeights(routeRequest.Preferences, routeRequest.LineOccupancy, routeRequest.Weather)
	routes, err := recommendRoutes(graph, routeRequest.Origin, routeRequest.Destination, routeRequest.Limit, weights, routeRequest.Preferences.MaxWalkMeters)
	if err != nil {
		return nil, status.Error(recommendationRouteErrorCode(err), err.Error())
	}

	preferences := routeRequest.Preferences.withDefaults()
	response := &microv1.RecommendRoutesResponse{
		Routes:      make([]*microv1.RecommendedRoute, 0, len(routes)),
		Total:       int32(len(routes)),
		CostWeights: microCostWeights(weights),
		Preferences: &microv1.RoutePreferences{
			Priority:      string(preferences.Priority),
			MaxWalkMeters: int32(preferences.MaxWalkMeters),
			AvoidCrowding: &preferences.AvoidCrowding,
		},
	}
	for _, route := range routes {
		response.Routes = append(response.Routes, microRecommendedRoute(route, weights))
	}
	return response, nil
}

type recommendationRouteRequest struct {
	Origin        RoutePoint
	Destination   RoutePoint
	Limit         int
	Preferences   RoutePreferences
	LineOccupancy LineOccupancy
	Weather       *WeatherConditions
}

func recommendationRequestFromProto(request *microv1.RecommendRoutesRequest) (recommendationRouteRequest, error) {
	routeRequest := recommendationRouteRequest{
		Origin:        routePointFromProto(request.GetOrigin()),
		Destination:   routePointFromProto(request.GetDestination()),
		Limit:         int(request.GetLimit()),
		Preferences:   defaultRoutePreferences(),
		LineOccupancy: LineOccupancy(request.GetLineOccupancy()),
	}
	if routeRequest.Limit == 0 {
		routeRequest.Limit = defaultUniversityRoutes
	}
	if routeRequest.Limit < 1 || routeRequest.Limit > maxUniversityRoutes {
		return routeRequest, errInvalidRouteLimit
	}
	if request.GetPreferences() != nil {
		preferences, err := routePreferencesFromProto(request.GetPreferences())
		if err != nil {
			return routeRequest, err
		}
		if preferences != nil {
			routeRequest.Preferences = *preferences
		}
	}
	if err := validateOccupancy(routeRequest.LineOccupancy); err != nil {
		return routeRequest, err
	}
	if weather := request.GetWeather(); weather != nil {
		routeRequest.Weather = &WeatherConditions{
			TemperatureC: weather.GetTemperatureC(),
			WindSpeedKmh: weather.GetWindSpeedKmh(),
			PM25:         weather.GetPm25(),
		}
	}
	if err := validateWeather(routeRequest.Weather); err != nil {
		return routeRequest, err
	}
	return routeRequest, nil
}

func routePointFromProto(point *microv1.RoutePoint) RoutePoint {
	if point == nil {
		return RoutePoint{}
	}
	if stopID := point.GetStopId(); stopID != "" {
		return RoutePoint{StopID: stopID}
	}
	if coordinates := point.GetLocation(); coordinates != nil {
		return RoutePoint{HasLocation: true, Latitude: coordinates.GetLatitude(), Longitude: coordinates.GetLongitude()}
	}
	// Preserve a malformed location oneof (with a nil message) as an invalid
	// coordinate point so validation returns InvalidArgument.
	if _, isLocation := point.GetPoint().(*microv1.RoutePoint_Location); isLocation {
		return RoutePoint{HasLocation: true}
	}
	return RoutePoint{}
}

func microRecommendedRoute(path []pathStep, weights CostWeights) *microv1.RecommendedRoute {
	route := &microv1.RecommendedRoute{
		TotalTimeSeconds: int32(pathSeconds(path)),
		Transfers:        int32(countTransfers(path)),
		Movements:        make([]*microv1.Movement, 0, len(path)),
	}
	for _, step := range path {
		movement := movementFromStep(step)
		route.TotalDistanceMeters += int32(movement.DistanceM)
		route.Movements = append(route.Movements, &microv1.Movement{
			FromStopId:     movement.FromStopID,
			ToStopId:       movement.ToStopID,
			Mode:           movement.Mode,
			RouteId:        movement.RouteID,
			TripId:         movement.TripID,
			TimeSeconds:    int32(movement.TimeSec),
			DistanceMeters: int32(movement.DistanceM),
		})
	}
	cost := newCostBreakdownResponse(pathCostBreakdown(path, weights))
	route.Cost = &microv1.CostBreakdown{
		Ride: cost.Ride, Walk: cost.Walk, Wait: cost.Wait, Transfer: cost.Transfer,
		Crowding: cost.Crowding, Weather: cost.Weather, Total: cost.Total,
	}
	return route
}

func recommendationRouteErrorCode(err error) codes.Code {
	switch {
	case errors.Is(err, errUnknownOriginStop), errors.Is(err, errUnknownDestinationStop),
		errors.Is(err, errNoNearbyStops), errors.Is(err, errNoStopsNearDestination):
		return codes.NotFound
	default:
		return codes.InvalidArgument
	}
}
