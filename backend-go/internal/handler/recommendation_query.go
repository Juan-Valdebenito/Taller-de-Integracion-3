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

// routeLimitFromQuery lee cuántas rutas se piden. El rango lo revisa micro_service.
func routeLimitFromQuery(query url.Values) (int32, error) {
	return optionalIntegerFromQuery(query, "limit")
}

// priorityFromQuery entrega la prioridad tal como viene. micro_service ignora
// mayúsculas y espacios, usa balanced si está vacía y rechaza las que no existen,
// así que la lista de prioridades se mantiene en un solo lugar.
func priorityFromQuery(query url.Values) string {
	return query.Get("priority")
}

// maxWalkMetersFromQuery lee la caminata máxima, en metros. El rango lo revisa
// micro_service.
func maxWalkMetersFromQuery(query url.Values) (int32, error) {
	return optionalIntegerFromQuery(query, "max_walk_meters")
}

// optionalIntegerFromQuery lee un entero opcional. Sin el parámetro devuelve 0, que
// en gRPC significa el valor por defecto. Por eso un "0" escrito se rechaza aquí:
// micro_service no podría distinguirlo de uno que no se envió.
func optionalIntegerFromQuery(query url.Values, name string) (int32, error) {
	rawValue := query.Get(name)
	if rawValue == "" {
		return 0, nil
	}
	value, err := strconv.ParseInt(rawValue, 10, 32)
	if err != nil {
		return 0, &queryError{name + " debe ser un número entero"}
	}
	if value == 0 {
		return 0, &queryError{name + " no puede ser 0"}
	}
	return int32(value), nil
}
