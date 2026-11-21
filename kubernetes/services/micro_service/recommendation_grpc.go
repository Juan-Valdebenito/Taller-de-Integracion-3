package main

// Traducción de la API gRPC de rutas recomendadas a los tipos del planificador.

import microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"

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

// microRecommendedRoute convierte una ruta recomendada al mensaje gRPC, con sus
// totales, sus transbordos y sus tramos. Usa las mismas funciones que las rutas a
// la universidad, así que ambas informan lo mismo para una misma ruta.
func microRecommendedRoute(path []pathStep) *microv1.RecommendedRoute {
	return &microv1.RecommendedRoute{
		TotalTimeSeconds:    int32(pathTotalSeconds(path)),
		TotalDistanceMeters: int32(pathTotalMeters(path)),
		Transfers:           int32(countTransfers(path)),
		Movements:           microMovements(path),
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
