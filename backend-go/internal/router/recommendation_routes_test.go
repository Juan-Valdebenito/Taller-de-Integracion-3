package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

const recommendationPath = "/api/v1/recommendations/route?origin_stop=PAR-PORTAL-01&destination_lat=-38.74&destination_long=-72.6&limit=2&priority=least_walking&max_walk_meters=400&avoid_crowding=false"

// requestRecommendation recorre el router real; sin authorization no envía sesión.
func requestRecommendation(micro *recordingMicroService, method, path, authorization string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, nil)
	if authorization != "" {
		request.Header.Set("Authorization", authorization)
	}
	recorder := httptest.NewRecorder()
	engineWithMicro(micro).ServeHTTP(recorder, request)
	return recorder
}

// Con sesión, cualquier rol recibe las rutas, y micro_service recibe lo que venía
// en la URL.
func TestRecommendationRouteAnswersWithSession(t *testing.T) {
	expectedRequest := &microv1.RecommendRoutesRequest{
		Origin: &microv1.RoutePoint{Point: &microv1.RoutePoint_StopId{StopId: "PAR-PORTAL-01"}},
		Destination: &microv1.RoutePoint{Point: &microv1.RoutePoint_Location{
			Location: &microv1.Coordinates{Latitude: -38.74, Longitude: -72.6},
		}},
		Limit:       2,
		Preferences: &microv1.RoutePreferences{Priority: "least_walking", MaxWalkMeters: 400, AvoidCrowding: proto.Bool(false)},
	}
	for _, role := range []string{"PASSENGER", "COMPANY", "ADMIN"} {
		micro := &recordingMicroService{}
		recorder := requestRecommendation(micro, http.MethodGet, recommendationPath, "Bearer "+accessToken(t, "usr-1", role))
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", role, recorder.Code, recorder.Body.String())
		}
		if len(micro.recommendRequests) != 1 || !proto.Equal(micro.recommendRequests[0], expectedRequest) {
			t.Fatalf("%s: requests = %v, want %v", role, micro.recommendRequests, expectedRequest)
		}
		var body struct {
			Routes []struct {
				Cost struct{ Total float64 } `json:"cost"`
			} `json:"routes"`
			Total       int            `json:"total"`
			CostWeights map[string]any `json:"cost_weights"`
			Preferences map[string]any `json:"preferences"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.Total != 1 || len(body.Routes) != 1 || body.Routes[0].Cost.Total != 840 || body.CostWeights == nil || body.Preferences == nil {
			t.Fatalf("%s: body = %s", role, recorder.Body.String())
		}
	}
}

// Sin una sesión válida responde 401 sin llamar a micro_service, también si la URL
// está mal escrita.
func TestRecommendationRouteRequiresSession(t *testing.T) {
	for name, authorization := range map[string]string{
		"no session": "", "invalid token": "Bearer no-es-un-token", "no scheme": accessToken(t, "usr-1", "PASSENGER"),
	} {
		for _, path := range []string{recommendationPath, "/api/v1/recommendations/route?limit=tres"} {
			micro := &recordingMicroService{}
			if recorder := requestRecommendation(micro, http.MethodGet, path, authorization); recorder.Code != http.StatusUnauthorized || len(micro.recommendRequests) != 0 {
				t.Fatalf("%s: status = %d after %d calls, want 401 without calls", name, recorder.Code, len(micro.recommendRequests))
			}
		}
	}
}

// La URL mal escrita responde 400, y la ruta solo existe para GET.
func TestRecommendationRouteRejectsBadRequests(t *testing.T) {
	authorization := "Bearer " + accessToken(t, "usr-1", "PASSENGER")
	micro := &recordingMicroService{}
	if recorder := requestRecommendation(micro, http.MethodGet, "/api/v1/recommendations/route?limit=tres", authorization); recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
	if recorder := requestRecommendation(micro, http.MethodPost, recommendationPath, authorization); recorder.Code != http.StatusNotFound && recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want 404 or 405", recorder.Code)
	}
	if len(micro.recommendRequests) != 0 {
		t.Fatalf("micro_service received %d requests", len(micro.recommendRequests))
	}
}
