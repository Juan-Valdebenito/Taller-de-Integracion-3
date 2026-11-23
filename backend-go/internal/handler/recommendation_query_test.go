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
