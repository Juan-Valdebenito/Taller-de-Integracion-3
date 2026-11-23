package handler

import (
	"net/url"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

func parseTestQuery(t *testing.T, rawQuery string) url.Values {
	t.Helper()
	query, err := url.ParseQuery(rawQuery)
	if err != nil {
		t.Fatal(err)
	}
	return query
}

func stopRoutePoint(stopID string) *microv1.RoutePoint {
	return &microv1.RoutePoint{Point: &microv1.RoutePoint_StopId{StopId: stopID}}
}

func locationRoutePoint(latitude, longitude float64) *microv1.RoutePoint {
	return &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{
		Location: &microv1.Coordinates{Latitude: latitude, Longitude: longitude},
	}}
}

// Cada prefijo lee solo sus parámetros. Una coordenada en 0,0 es una coordenada
// enviada, y el rango lo revisa micro_service.
func TestRoutePointFromQueryReadsPoint(t *testing.T) {
	testCases := []struct {
		rawQuery, prefix string
		expectedPoint    *microv1.RoutePoint
	}{
		{"origin_stop=PAR-PORTAL-01", "origin", stopRoutePoint("PAR-PORTAL-01")},
		{"destination_stop=PAR-CSF-01", "destination", stopRoutePoint("PAR-CSF-01")},
		{"origin_lat=-38.735&origin_long=-72.612", "origin", locationRoutePoint(-38.735, -72.612)},
		{"destination_lat=0&destination_long=0", "destination", locationRoutePoint(0, 0)},
		{"origin_lat=91&origin_long=0", "origin", locationRoutePoint(91, 0)},
		{"origin_stop=A&destination_lat=1&destination_long=2", "origin", stopRoutePoint("A")},
		{"origin_stop=A&destination_lat=1&destination_long=2", "destination", locationRoutePoint(1, 2)},
	}
	for _, testCase := range testCases {
		point, err := routePointFromQuery(parseTestQuery(t, testCase.rawQuery), testCase.prefix)
		if err != nil || !proto.Equal(point, testCase.expectedPoint) {
			t.Fatalf("%s (%s): point = %v, err = %v; want %v", testCase.rawQuery, testCase.prefix, point, err, testCase.expectedPoint)
		}
	}
}

// Sin parámetros, o con todos vacíos, el punto queda en nil: micro_service
// responde que falta.
func TestRoutePointFromQueryLeavesMissingPointNil(t *testing.T) {
	for _, rawQuery := range []string{"", "origin_stop=", "origin_lat=&origin_long=", "destination_stop=PAR-CSF-01"} {
		point, err := routePointFromQuery(parseTestQuery(t, rawQuery), "origin")
		if err != nil || point != nil {
			t.Fatalf("%q: point = %v, err = %v; want nil", rawQuery, point, err)
		}
	}
}

// Cada error nombra los parámetros de su lado, para saber cuál corregir.
func TestRoutePointFromQueryRejectsInvalidFormat(t *testing.T) {
	testCases := []struct{ rawQuery, prefix, expectedMessage string }{
		{"origin_lat=-38.7", "origin", "origin_lat y origin_long deben enviarse juntos"},
		{"destination_long=-72.6", "destination", "destination_lat y destination_long deben enviarse juntos"},
		{"origin_lat=norte&origin_long=-72.6", "origin", "origin_lat y origin_long deben ser números"},
		{"destination_lat=-38,7&destination_long=-72.6", "destination", "destination_lat y destination_long deben ser números"},
		{"origin_lat=1e999&origin_long=0", "origin", "origin_lat y origin_long deben ser números"},
		{"origin_stop=A&origin_lat=1&origin_long=2", "origin", "envía origin_stop, o bien origin_lat y origin_long, pero no ambos"},
		{"destination_stop=A&destination_lat=1", "destination", "envía destination_stop, o bien destination_lat y destination_long, pero no ambos"},
	}
	for _, testCase := range testCases {
		point, err := routePointFromQuery(parseTestQuery(t, testCase.rawQuery), testCase.prefix)
		if point != nil || err == nil || err.Error() != testCase.expectedMessage {
			t.Fatalf("%s: point = %v, err = %v; want %q", testCase.rawQuery, point, err, testCase.expectedMessage)
		}
	}
}

// El origen y el destino se leen por separado, en cualquier combinación. Que
// falte alguno, o que sean iguales, lo rechaza micro_service.
func TestRoutePointsFromQueryReadsBothPoints(t *testing.T) {
	testCases := []struct {
		rawQuery                            string
		expectedOrigin, expectedDestination *microv1.RoutePoint
	}{
		{"origin_stop=A&destination_stop=B", stopRoutePoint("A"), stopRoutePoint("B")},
		{"origin_lat=1&origin_long=2&destination_stop=B", locationRoutePoint(1, 2), stopRoutePoint("B")},
		{"origin_stop=A&destination_lat=3&destination_long=4", stopRoutePoint("A"), locationRoutePoint(3, 4)},
		{"origin_lat=1&origin_long=2&destination_lat=3&destination_long=4", locationRoutePoint(1, 2), locationRoutePoint(3, 4)},
		{"origin_stop=A&destination_stop=A", stopRoutePoint("A"), stopRoutePoint("A")},
		{"origin_stop=A", stopRoutePoint("A"), nil},
		{"destination_stop=B", nil, stopRoutePoint("B")},
		{"", nil, nil},
	}
	for _, testCase := range testCases {
		origin, destination, err := routePointsFromQuery(parseTestQuery(t, testCase.rawQuery))
		if err != nil || !proto.Equal(origin, testCase.expectedOrigin) || !proto.Equal(destination, testCase.expectedDestination) {
			t.Fatalf("%q: %v -> %v, err = %v", testCase.rawQuery, origin, destination, err)
		}
	}
}

// Con un error no entrega ningún punto, y si fallan los dos informa el origen.
func TestRoutePointsFromQueryReportsOriginFirst(t *testing.T) {
	const originError, destinationError = "origin_lat y origin_long deben enviarse juntos", "destination_lat y destination_long deben ser números"
	for rawQuery, expectedMessage := range map[string]string{
		"origin_lat=1&destination_stop=B":                          originError,
		"origin_stop=A&destination_lat=sur&destination_long=4":     destinationError,
		"origin_lat=1&destination_lat=sur&destination_long=4":      originError,
		"destination_lat=sur&destination_long=4&origin_long=-72.6": originError,
	} {
		origin, destination, err := routePointsFromQuery(parseTestQuery(t, rawQuery))
		if origin != nil || destination != nil || err == nil || err.Error() != expectedMessage {
			t.Fatalf("%q: %v -> %v, err = %v; want only %q", rawQuery, origin, destination, err, expectedMessage)
		}
	}
}

// Los valores fuera de rango pasan tal cual: los rechaza micro_service.
func TestRouteLimitFromQueryReadsLimit(t *testing.T) {
	for rawQuery, expectedLimit := range map[string]int32{
		"": 0, "limit=": 0, "limit=1": 1, "limit=5": 5, "limit=6": 6, "limit=-1": -1,
	} {
		limit, err := routeLimitFromQuery(parseTestQuery(t, rawQuery))
		if err != nil || limit != expectedLimit {
			t.Fatalf("%q: limit = %d, err = %v; want %d", rawQuery, limit, err, expectedLimit)
		}
	}
}

// 4294967297 no cabe en un int32: sin revisarlo se convertiría en 1.
func TestRouteLimitFromQueryRejectsInvalidText(t *testing.T) {
	const notInteger, notZero = "limit debe ser un número entero", "limit no puede ser 0"
	for rawQuery, expectedMessage := range map[string]string{
		"limit=tres": notInteger, "limit=2.5": notInteger, "limit=%202": notInteger, "limit=4294967297": notInteger,
		"limit=0": notZero, "limit=-0": notZero, "limit=00": notZero,
	} {
		limit, err := routeLimitFromQuery(parseTestQuery(t, rawQuery))
		if limit != 0 || err == nil || err.Error() != expectedMessage {
			t.Fatalf("%q: limit = %d, err = %v; want %q", rawQuery, limit, err, expectedMessage)
		}
	}
}

// La prioridad pasa sin cambios, también si no existe: la revisa micro_service.
func TestPriorityFromQueryKeepsText(t *testing.T) {
	for rawQuery, expectedPriority := range map[string]string{
		"": "", "priority=": "", "priority=fastest": "fastest", "priority=%20Least_Walking%20": " Least_Walking ", "priority=cheapest": "cheapest",
	} {
		if priority := priorityFromQuery(parseTestQuery(t, rawQuery)); priority != expectedPriority {
			t.Fatalf("%q: priority = %q, want %q", rawQuery, priority, expectedPriority)
		}
	}
}

func TestMaxWalkMetersFromQueryReadsMeters(t *testing.T) {
	for rawQuery, expectedMeters := range map[string]int32{
		"": 0, "max_walk_meters=": 0, "max_walk_meters=400": 400, "max_walk_meters=50": 50, "max_walk_meters=5000": 5000, "max_walk_meters=-1": -1, "limit=3": 0,
	} {
		meters, err := maxWalkMetersFromQuery(parseTestQuery(t, rawQuery))
		if err != nil || meters != expectedMeters {
			t.Fatalf("%q: meters = %d, err = %v; want %d", rawQuery, meters, err, expectedMeters)
		}
	}
}

func TestMaxWalkMetersFromQueryRejectsInvalidText(t *testing.T) {
	const notInteger, notZero = "max_walk_meters debe ser un número entero", "max_walk_meters no puede ser 0"
	for rawQuery, expectedMessage := range map[string]string{
		"max_walk_meters=lejos": notInteger, "max_walk_meters=400.5": notInteger, "max_walk_meters=400m": notInteger,
		"max_walk_meters=4294967696": notInteger, "max_walk_meters=0": notZero,
	} {
		meters, err := maxWalkMetersFromQuery(parseTestQuery(t, rawQuery))
		if meters != 0 || err == nil || err.Error() != expectedMessage {
			t.Fatalf("%q: meters = %d, err = %v; want %q", rawQuery, meters, err, expectedMessage)
		}
	}
}

// Un false y "no enviado" son distintos: el primero es un puntero a false y el
// segundo es nil.
func TestAvoidCrowdingFromQueryReadsValue(t *testing.T) {
	for rawQuery, expectedValue := range map[string]*bool{
		"": nil, "avoid_crowding=": nil, "avoid_crowding=%20": nil,
		"avoid_crowding=true": proto.Bool(true), "avoid_crowding=1": proto.Bool(true), "avoid_crowding=%20TRUE%20": proto.Bool(true),
		"avoid_crowding=false": proto.Bool(false), "avoid_crowding=0": proto.Bool(false), "avoid_crowding=False": proto.Bool(false),
	} {
		avoidCrowding, err := avoidCrowdingFromQuery(parseTestQuery(t, rawQuery))
		if err != nil || (avoidCrowding == nil) != (expectedValue == nil) {
			t.Fatalf("%q: value = %v, err = %v", rawQuery, avoidCrowding, err)
		}
		if expectedValue != nil && *avoidCrowding != *expectedValue {
			t.Fatalf("%q: value = %v, want %v", rawQuery, *avoidCrowding, *expectedValue)
		}
	}
}

func TestAvoidCrowdingFromQueryRejectsOtherText(t *testing.T) {
	for _, rawQuery := range []string{"avoid_crowding=yes", "avoid_crowding=no", "avoid_crowding=2", "avoid_crowding=verdadero", "avoid_crowding=t"} {
		avoidCrowding, err := avoidCrowdingFromQuery(parseTestQuery(t, rawQuery))
		if avoidCrowding != nil || err == nil || err.Error() != "avoid_crowding debe ser true o false" {
			t.Fatalf("%q: value = %v, err = %v; want only the error", rawQuery, avoidCrowding, err)
		}
	}
}
