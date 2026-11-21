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
		Routes:      make([]*microv1.UniversityRoute, 0, len(routes)),
		Total:       int32(len(routes)),
		CostWeights: microCostWeights(routeRequest.costWeights()),
	}
	for _, route := range routes {
		response.Routes = append(response.Routes, microUniversityRoute(route, routeRequest.costWeights()))
	}
	return response, nil
}

// universityRouteRequestFromProto aplica el límite por defecto cuando no viene:
// en proto3, un entero no enviado se lee como 0.
func universityRouteRequestFromProto(request *microv1.PlanUniversityRoutesRequest) (universityRouteRequest, error) {
	routeRequest := universityRouteRequest{
		OriginStopID:  request.GetOriginStopId(),
		CampusID:      request.GetCampusId(),
		Limit:         int(request.GetLimit()),
		LineOccupancy: LineOccupancy(request.GetLineOccupancy()),
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
	routeRequest.Weather = weatherFromProto(request.GetWeather())
	return routeRequest, nil
}

// weatherFromProto traduce el clima de una petición. Si el mensaje no viene,
// devuelve nil: sin clima, no 0 °C.
func weatherFromProto(message *microv1.WeatherConditions) *WeatherConditions {
	if message == nil {
		return nil
	}
	return &WeatherConditions{
		TemperatureC: message.GetTemperatureC(),
		WindSpeedKmh: message.GetWindSpeedKmh(),
		PM25:         message.GetPm25(),
	}
}

// routePreferencesFromProto traduce las preferencias de gRPC con las mismas
// reglas que REST: la prioridad ignora mayúsculas y espacios, y lo que no se
// envió toma su valor por defecto. Sin mensaje devuelve nil, y la petición usa
// las preferencias por defecto. avoid_crowding es optional en el proto: si no
// viene, vale true, y no false como un bool de proto3 sin presencia.
func routePreferencesFromProto(message *microv1.RoutePreferences) (*RoutePreferences, error) {
	if message == nil {
		return nil, nil
	}
	priority, err := parseRoutePriority(message.GetPriority())
	if err != nil {
		return nil, err
	}
	maxWalkMeters, err := resolveMaxWalkMeters(int(message.GetMaxWalkMeters()))
	if err != nil {
		return nil, err
	}
	avoidCrowding := defaultAvoidCrowding
	if message.AvoidCrowding != nil {
		avoidCrowding = message.GetAvoidCrowding()
	}
	return &RoutePreferences{Priority: priority, MaxWalkMeters: maxWalkMeters, AvoidCrowding: avoidCrowding}, nil
}

// microRoutePreferences convierte las preferencias usadas al mensaje gRPC de la
// respuesta. Recibe las preferencias ya completas, así que informa los valores
// reales y no ceros. avoid_crowding siempre va presente, también cuando es
// false, para que el cliente no lo confunda con "no enviado".
func microRoutePreferences(preferences RoutePreferences) *microv1.RoutePreferences {
	avoidCrowding := preferences.AvoidCrowding
	return &microv1.RoutePreferences{
		Priority:      string(preferences.Priority),
		MaxWalkMeters: int32(preferences.MaxWalkMeters),
		AvoidCrowding: &avoidCrowding,
	}
}

func universityRouteErrorCode(err error) codes.Code {
	switch {
	case errors.Is(err, errUnknownCampus), errors.Is(err, errUnknownOriginStop), errors.Is(err, errNoNearbyStops):
		return codes.NotFound
	default:
		return codes.InvalidArgument
	}
}

func microUniversityRoute(route UniversityRoute, weights CostWeights) *microv1.UniversityRoute {
	routeResponse := newUniversityRouteResponse(route, weights)
	message := &microv1.UniversityRoute{
		CampusId:            routeResponse.CampusID,
		CampusName:          routeResponse.CampusName,
		DestinationStopId:   routeResponse.DestinationStopID,
		TotalTimeSeconds:    int32(routeResponse.TotalTimeSec),
		TotalDistanceMeters: int32(routeResponse.TotalDistanceM),
		Transfers:           int32(routeResponse.Transfers),
		Movements:           make([]*microv1.Movement, 0, len(routeResponse.Movements)),
		Cost:                microCostBreakdown(routeResponse.Cost),
	}
	for _, movement := range routeResponse.Movements {
		message.Movements = append(message.Movements, microMovement(movement))
	}
	return message
}

// microCostBreakdown convierte el desglose del costo al mensaje gRPC. Recibe el
// costo ya redondeado de REST, para que ambas API informen exactamente lo mismo.
func microCostBreakdown(cost costBreakdownResponse) *microv1.CostBreakdown {
	return &microv1.CostBreakdown{
		Ride:     cost.Ride,
		Walk:     cost.Walk,
		Wait:     cost.Wait,
		Transfer: cost.Transfer,
		Crowding: cost.Crowding,
		Weather:  cost.Weather,
		Total:    cost.Total,
	}
}

// microMovement convierte un tramo al mensaje gRPC. Parte del mismo formato que
// REST: los tramos a pie no traen línea ni viaje.
func microMovement(movement Movement) *microv1.Movement {
	return &microv1.Movement{
		FromStopId:     movement.FromStopID,
		ToStopId:       movement.ToStopID,
		Mode:           movement.Mode,
		RouteId:        movement.RouteID,
		TripId:         movement.TripID,
		TimeSeconds:    int32(movement.TimeSec),
		DistanceMeters: int32(movement.DistanceM),
	}
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
