package handler

// Lectura de la URL de GET /api/v1/recommendations/route. Aquí solo se revisa el
// formato: las reglas, como el rango de las coordenadas o que el paradero exista,
// las valida micro_service.

import (
	"fmt"
	"net/url"
	"strconv"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
)

// routePointFromQuery lee un punto cuyos parámetros empiezan con prefix: con
// "origin" son origin_stop, o bien origin_lat y origin_long. Si no viene ninguno
// devuelve nil, y micro_service responde que falta ese punto.
//
// Un paradero y una coordenada a la vez se rechazan aquí: el oneof del proto solo
// puede llevar uno, así que el otro se perdería sin que el cliente lo supiera.
func routePointFromQuery(query url.Values, prefix string) (*microv1.RoutePoint, error) {
	stopName, latitudeName, longitudeName := prefix+"_stop", prefix+"_lat", prefix+"_long"
	stopID, rawLatitude, rawLongitude := query.Get(stopName), query.Get(latitudeName), query.Get(longitudeName)
	hasLocation := rawLatitude != "" || rawLongitude != ""
	if stopID != "" && hasLocation {
		return nil, &queryError{fmt.Sprintf("envía %s, o bien %s y %s, pero no ambos", stopName, latitudeName, longitudeName)}
	}
	if stopID != "" {
		return &microv1.RoutePoint{Point: &microv1.RoutePoint_StopId{StopId: stopID}}, nil
	}
	if !hasLocation {
		return nil, nil
	}
	if rawLatitude == "" || rawLongitude == "" {
		return nil, &queryError{fmt.Sprintf("%s y %s deben enviarse juntos", latitudeName, longitudeName)}
	}
	latitude, latitudeErr := strconv.ParseFloat(rawLatitude, 64)
	longitude, longitudeErr := strconv.ParseFloat(rawLongitude, 64)
	if latitudeErr != nil || longitudeErr != nil {
		return nil, &queryError{fmt.Sprintf("%s y %s deben ser números", latitudeName, longitudeName)}
	}
	return &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{
		Location: &microv1.Coordinates{Latitude: latitude, Longitude: longitude},
	}}, nil
}

// routePointsFromQuery lee el origen y el destino. Si los dos tienen errores
// informa el del origen, en el mismo orden en que los revisa micro_service.
func routePointsFromQuery(query url.Values) (origin, destination *microv1.RoutePoint, err error) {
	if origin, err = routePointFromQuery(query, "origin"); err != nil {
		return nil, nil, err
	}
	if destination, err = routePointFromQuery(query, "destination"); err != nil {
		return nil, nil, err
	}
	return origin, destination, nil
}
