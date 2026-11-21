package main

// Traducción de la API gRPC de rutas recomendadas a los tipos del planificador.

import microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"

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
