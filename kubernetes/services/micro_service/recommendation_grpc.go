package main

// Traducción de la API gRPC de rutas recomendadas a los tipos del planificador.

import (
	"errors"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
)

// recommendationErrorCode traduce un error de la petición al código gRPC que
// documenta el proto. NotFound es para lo que no existe o no tiene paraderos
// cerca; todo lo demás es un dato de la petición que hay que corregir.
func recommendationErrorCode(err error) codes.Code {
	switch {
	case errors.Is(err, errUnknownOriginStop), errors.Is(err, errUnknownDestinationStop),
		errors.Is(err, errNoNearbyStops), errors.Is(err, errNoStopsNearDestination):
		return codes.NotFound
	default:
		return codes.InvalidArgument
	}
}

// defaultRecommendedRoutes es cuántas rutas se entregan si la petición no lo
// indica, igual que en las rutas a la universidad.
const defaultRecommendedRoutes = defaultUniversityRoutes

// recommendationRequest es una petición de rutas recomendadas, ya traducida y sin
// depender de gRPC ni de HTTP.
type recommendationRequest struct {
	Origin      RoutePoint
	Destination RoutePoint
	Limit       int
	// Preferences son las del pasajero; nil significa las de por defecto.
	Preferences *RoutePreferences
	// LineOccupancy es la ocupación de cada línea; puede venir vacía.
	LineOccupancy LineOccupancy
	// Weather es el clima de la consulta; nil significa sin clima.
	Weather *WeatherConditions
}

// recommendationRequestFromProto traduce la petición gRPC. Solo falla si las
// preferencias no son válidas; el resto se valida después, con las mismas reglas
// para cualquier API. En proto3 un límite no enviado se lee como 0, y significa
// el valor por defecto.
func recommendationRequestFromProto(request *microv1.RecommendRoutesRequest) (recommendationRequest, error) {
	preferences, err := routePreferencesFromProto(request.GetPreferences())
	if err != nil {
		return recommendationRequest{}, err
	}
	routeRequest := recommendationRequest{
		Origin:        routePointFromProto(request.GetOrigin()),
		Destination:   routePointFromProto(request.GetDestination()),
		Limit:         int(request.GetLimit()),
		Preferences:   preferences,
		LineOccupancy: LineOccupancy(request.GetLineOccupancy()),
		Weather:       weatherFromProto(request.GetWeather()),
	}
	if routeRequest.Limit == 0 {
		routeRequest.Limit = defaultRecommendedRoutes
	}
	return routeRequest, nil
}

// microRecommendRoutesResponse arma la respuesta de una petición ya planificada.
// Los pesos y las preferencias salen de la misma petición que ordenó las rutas,
// así que el costo informado explica el orden, y las preferencias muestran los
// valores por defecto que se aplicaron.
func microRecommendRoutesResponse(paths [][]pathStep, routeRequest recommendationRequest) *microv1.RecommendRoutesResponse {
	weights := routeRequest.costWeights()
	routes := microRecommendedRoutes(paths, weights)
	return &microv1.RecommendRoutesResponse{
		Routes:      routes,
		Total:       int32(len(routes)),
		CostWeights: microCostWeights(weights),
		Preferences: microRoutePreferences(routeRequest.preferences()),
	}
}

// microRecommendedRoutes convierte las rutas en el mismo orden en que llegan, de
// la más barata a la más cara, todas con los mismos pesos. Sin rutas devuelve una
// lista vacía.
func microRecommendedRoutes(paths [][]pathStep, weights CostWeights) []*microv1.RecommendedRoute {
	routes := make([]*microv1.RecommendedRoute, 0, len(paths))
	for _, path := range paths {
		routes = append(routes, microRecommendedRoute(path, weights))
	}
	return routes
}

// microRecommendedRoute convierte una ruta recomendada al mensaje gRPC, con sus
// totales, sus transbordos, sus tramos y su costo. Usa las mismas funciones que
// las rutas a la universidad, así que ambas informan lo mismo para una misma ruta.
// weights deben ser los mismos con que se ordenaron las rutas, para que el costo
// explique el orden.
func microRecommendedRoute(path []pathStep, weights CostWeights) *microv1.RecommendedRoute {
	return &microv1.RecommendedRoute{
		TotalTimeSeconds:    int32(pathTotalSeconds(path)),
		TotalDistanceMeters: int32(pathTotalMeters(path)),
		Transfers:           int32(countTransfers(path)),
		Movements:           microMovements(path),
		Cost:                microCostBreakdown(newCostBreakdownResponse(pathCostBreakdown(path, weights))),
	}
}

// microMovements convierte los tramos de una ruta recomendada, en orden. Incluye
// las caminatas desde USER_LOCATION y hasta DESTINATION_LOCATION.
func microMovements(path []pathStep) []*microv1.Movement {
	movements := make([]*microv1.Movement, 0, len(path))
	for _, step := range path {
		movements = append(movements, microMovement(movementFromStep(step)))
	}
	return movements
}

// routePointFromProto traduce un origen o un destino. Si el mensaje falta, no trae
// ninguna de las dos formas, o trae una coordenada sin contenido, devuelve un punto
// vacío: la validación lo rechaza con el error del lado que corresponda. El oneof
// del proto ya impide que lleguen ambas formas a la vez.
func routePointFromProto(message *microv1.RoutePoint) RoutePoint {
	switch point := message.GetPoint().(type) {
	case *microv1.RoutePoint_StopId:
		return RoutePoint{StopID: point.StopId}
	case *microv1.RoutePoint_Location:
		if point.Location == nil {
			return RoutePoint{}
		}
		return RoutePoint{
			HasLocation: true,
			Latitude:    point.Location.GetLatitude(),
			Longitude:   point.Location.GetLongitude(),
		}
	}
	return RoutePoint{}
}
