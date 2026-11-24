package handler

import (
	"context"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

// Las preferencias leídas de la URL llegan a micro_service por una conexión gRPC
// real. Lo más delicado es avoid_crowding: un false no debe llegar como "no
// enviado", y "no enviado" no debe llegar como false.
func TestQueryPreferencesReachMicroService(t *testing.T) {
	server := &recommendationMicroServer{}
	microClient := startMicroClientWith(t, server)
	testCases := []struct {
		rawQuery              string
		expectedPreferences   *microv1.RoutePreferences
		expectedAvoidCrowding *bool
	}{
		{"", nil, nil},
		{"priority=fewest_transfers", &microv1.RoutePreferences{Priority: "fewest_transfers"}, nil},
		{"max_walk_meters=400", &microv1.RoutePreferences{MaxWalkMeters: 400}, nil},
		{"avoid_crowding=false", &microv1.RoutePreferences{AvoidCrowding: proto.Bool(false)}, proto.Bool(false)},
		{"avoid_crowding=true", &microv1.RoutePreferences{AvoidCrowding: proto.Bool(true)}, proto.Bool(true)},
		{"priority=%20Fastest%20&max_walk_meters=-1&avoid_crowding=0",
			&microv1.RoutePreferences{Priority: " Fastest ", MaxWalkMeters: -1, AvoidCrowding: proto.Bool(false)}, proto.Bool(false)},
	}
	for _, testCase := range testCases {
		preferences, err := routePreferencesFromQuery(parseTestQuery(t, testCase.rawQuery))
		if err != nil {
			t.Fatalf("%q: %v", testCase.rawQuery, err)
		}
		if _, err := microClient.RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{Preferences: preferences}); err != nil {
			t.Fatalf("%q: %v", testCase.rawQuery, err)
		}
		received := server.receivedRequest().GetPreferences()
		if (received == nil) != (testCase.expectedPreferences == nil) || !proto.Equal(received, testCase.expectedPreferences) {
			t.Fatalf("%q: received %v, want %v", testCase.rawQuery, received, testCase.expectedPreferences)
		}
		if received == nil {
			continue
		}
		if (received.AvoidCrowding == nil) != (testCase.expectedAvoidCrowding == nil) {
			t.Fatalf("%q: avoid_crowding presence changed over the network: %v", testCase.rawQuery, received.AvoidCrowding)
		}
		if received.AvoidCrowding != nil && *received.AvoidCrowding != *testCase.expectedAvoidCrowding {
			t.Fatalf("%q: avoid_crowding = %v, want %v", testCase.rawQuery, *received.AvoidCrowding, *testCase.expectedAvoidCrowding)
		}
	}
}
