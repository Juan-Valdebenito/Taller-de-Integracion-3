package handler

import (
	"context"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

func TestRecommendationRequestFromQueryReadsEverything(t *testing.T) {
	testCases := []struct {
		rawQuery        string
		expectedRequest *microv1.RecommendRoutesRequest
	}{
		{"origin_stop=PAR-PORTAL-01&destination_lat=-38.74&destination_long=-72.6&limit=2&priority=fastest&max_walk_meters=400&avoid_crowding=false",
			&microv1.RecommendRoutesRequest{
				Origin: stopRoutePoint("PAR-PORTAL-01"), Destination: locationRoutePoint(-38.74, -72.6), Limit: 2,
				Preferences: &microv1.RoutePreferences{Priority: "fastest", MaxWalkMeters: 400, AvoidCrowding: proto.Bool(false)},
			}},
		{"origin_stop=A&destination_stop=B", &microv1.RecommendRoutesRequest{Origin: stopRoutePoint("A"), Destination: stopRoutePoint("B")}},
		// Lo que falta o está fuera de rango lo rechaza micro_service.
		{"", &microv1.RecommendRoutesRequest{}},
		{"origin_stop=A&limit=9", &microv1.RecommendRoutesRequest{Origin: stopRoutePoint("A"), Limit: 9}},
		// La app no envía la ocupación ni el clima: si vienen en la URL se ignoran.
		{"origin_stop=A&destination_stop=B&occupancy=L7A:0.9&temperature_c=3&otro=1",
			&microv1.RecommendRoutesRequest{Origin: stopRoutePoint("A"), Destination: stopRoutePoint("B")}},
	}
	for _, testCase := range testCases {
		request, err := recommendationRequestFromQuery(parseTestQuery(t, testCase.rawQuery))
		if err != nil || !proto.Equal(request, testCase.expectedRequest) {
			t.Fatalf("%q: request = %v, err = %v; want %v", testCase.rawQuery, request, err, testCase.expectedRequest)
		}
	}
}

// Con un error no entrega petición. Los últimos casos tienen varios errores y
// comprueban el orden: textos, límite, origen, destino y preferencias.
func TestRecommendationRequestFromQueryReportsFirstError(t *testing.T) {
	const badOrigin, badDestination, badWalk = "origin_lat=1", "destination_lat=2", "max_walk_meters=0"
	for rawQuery, expectedMessage := range map[string]string{
		"limit=tres":                   "limit debe ser un número entero",
		badOrigin:                      "origin_lat y origin_long deben enviarse juntos",
		badDestination:                 "destination_lat y destination_long deben enviarse juntos",
		badWalk:                        "max_walk_meters no puede ser 0",
		"avoid_crowding=yes":           "avoid_crowding debe ser true o false",
		"origin_stop=%FF":              "origin_stop tiene caracteres inválidos",
		"destination_stop=PAR-%C3":     "destination_stop tiene caracteres inválidos",
		"priority=%FE":                 "priority tiene caracteres inválidos",
		badWalk + "&" + badDestination: "destination_lat y destination_long deben enviarse juntos",
		badWalk + "&" + badDestination + "&" + badOrigin:                           "origin_lat y origin_long deben enviarse juntos",
		badWalk + "&" + badDestination + "&" + badOrigin + "&limit=0":              "limit no puede ser 0",
		badWalk + "&" + badDestination + "&" + badOrigin + "&limit=0&priority=%FF": "priority tiene caracteres inválidos",
	} {
		request, err := recommendationRequestFromQuery(parseTestQuery(t, rawQuery))
		if request != nil || err == nil || err.Error() != expectedMessage {
			t.Fatalf("%q: request = %v, err = %v; want %q", rawQuery, request, err, expectedMessage)
		}
	}
}

// Un texto válido con tildes o emojis sí se puede enviar, y lo que se lee de la
// URL llega igual por una conexión gRPC real.
func TestRecommendationRequestFromQueryReachesMicroService(t *testing.T) {
	server := &recommendationMicroServer{}
	microClient := startMicroClientWith(t, server)
	for _, rawQuery := range []string{
		"origin_stop=PAR-PORTAL-01&destination_lat=0&destination_long=0&limit=5&priority=balanced&avoid_crowding=false",
		"origin_stop=Pr%C3%A1ctica%20%F0%9F%9A%8C&destination_stop=B",
		"",
	} {
		request, err := recommendationRequestFromQuery(parseTestQuery(t, rawQuery))
		if err != nil {
			t.Fatalf("%q: %v", rawQuery, err)
		}
		if _, err := microClient.RecommendRoutes(context.Background(), request); err != nil {
			t.Fatalf("%q: %v", rawQuery, err)
		}
		if !proto.Equal(server.receivedRequest(), request) {
			t.Fatalf("%q: received %v, want %v", rawQuery, server.receivedRequest(), request)
		}
	}
}
