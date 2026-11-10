package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"github.com/gin-gonic/gin"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// fakeUniversityMicro reemplaza a micro_service. Incluye MicroRPC sin
// implementar: si el handler llamara a otra función, la prueba fallaría.
type fakeUniversityMicro struct {
	MicroRPC
	routesResponse  *microv1.PlanUniversityRoutesResponse
	responseError   error
	receivedRequest *microv1.PlanUniversityRoutesRequest
	calls           int
}

func (fakeMicro *fakeUniversityMicro) ListCampuses(context.Context) (*microv1.ListCampusesResponse, error) {
	fakeMicro.calls++
	return &microv1.ListCampusesResponse{Campuses: []*microv1.Campus{
		{Id: "san-francisco", Name: "Campus San Francisco", StopIds: []string{"PAR-CSF-01"}},
	}}, fakeMicro.responseError
}

func (fakeMicro *fakeUniversityMicro) PlanUniversityRoutes(_ context.Context, request *microv1.PlanUniversityRoutesRequest) (*microv1.PlanUniversityRoutesResponse, error) {
	fakeMicro.calls++
	fakeMicro.receivedRequest = request
	if fakeMicro.responseError != nil {
		return nil, fakeMicro.responseError
	}
	return fakeMicro.routesResponse, nil
}

func serveUniversityRequest(fakeMicro *fakeUniversityMicro, path string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro)
	engine.GET("/campuses", proxyHandler.ListCampuses)
	engine.GET("/routes/university", proxyHandler.PlanUniversityRoutes)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	return recorder
}

func TestListCampusesReturnsJSON(t *testing.T) {
	recorder := serveUniversityRequest(&fakeUniversityMicro{}, "/campuses")
	var body struct {
		Campuses []campusJSON `json:"campuses"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != http.StatusOK || len(body.Campuses) != 1 || body.Campuses[0].StopIDs[0] != "PAR-CSF-01" {
		t.Errorf("respuesta inesperada: %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestPlanUniversityRoutesForwardsQuery(t *testing.T) {
	fakeMicro := &fakeUniversityMicro{routesResponse: &microv1.PlanUniversityRoutesResponse{}}
	recorder := serveUniversityRequest(fakeMicro, "/routes/university?lat=-38.7&long=-72.6&campus=san-francisco&limit=2")
	if recorder.Code != http.StatusOK {
		t.Fatalf("se esperaba 200: %d %s", recorder.Code, recorder.Body.String())
	}
	request := fakeMicro.receivedRequest
	if request.GetLatitude() != -38.7 || request.GetLongitude() != -72.6 || request.GetCampusId() != "san-francisco" ||
		request.GetLimit() != 2 || request.GetOriginStopId() != "" {
		t.Errorf("petición inesperada: %+v", request)
	}
}

func TestPlanUniversityRoutesKeepsZeroValues(t *testing.T) {
	fakeMicro := &fakeUniversityMicro{routesResponse: &microv1.PlanUniversityRoutesResponse{
		Routes: []*microv1.UniversityRoute{{
			CampusId: "san-francisco", TotalTimeSeconds: 240,
			Movements: []*microv1.Movement{{FromStopId: "PAR-PORTAL-01", ToStopId: "PAR-CSF-01", Mode: "bus", RouteId: "L1C", TimeSeconds: 240}},
		}},
		Total: 1,
	}}
	recorder := serveUniversityRequest(fakeMicro, "/routes/university?from_stop=PAR-PORTAL-01")
	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	firstRoute := body["routes"].([]any)[0].(map[string]any)
	if transfers, present := firstRoute["transfers"]; !present || transfers != float64(0) {
		t.Errorf("transfers debe venir aunque sea 0: %s", recorder.Body.String())
	}
	if body["total"] != float64(1) || fakeMicro.receivedRequest.Latitude != nil {
		t.Errorf("respuesta o petición inesperada: %s", recorder.Body.String())
	}
}

// Recorre la respuesta HTTP completa: el costo que entrega micro_service debe
// llegar a la app con todos sus componentes, incluidos los que valen 0.
func TestPlanUniversityRoutesResponseIncludesCost(t *testing.T) {
	fakeMicro := &fakeUniversityMicro{routesResponse: &microv1.PlanUniversityRoutesResponse{
		Routes: []*microv1.UniversityRoute{
			{CampusId: "san-francisco", TotalTimeSeconds: 240, Cost: &microv1.CostBreakdown{Ride: 240, Wait: 600, Total: 840}},
			{CampusId: "san-francisco", TotalTimeSeconds: 780, Cost: &microv1.CostBreakdown{Walk: 1560, Total: 1560}},
		},
		Total: 2,
	}}
	recorder := serveUniversityRequest(fakeMicro, "/routes/university?from_stop=PAR-PORTAL-01")
	if recorder.Code != http.StatusOK {
		t.Fatalf("se esperaba 200: %d %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Routes []struct {
			Cost map[string]float64 `json:"cost"`
		} `json:"routes"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	expectedCosts := []map[string]float64{
		{"ride": 240, "walk": 0, "wait": 600, "transfer": 0, "total": 840},
		{"ride": 0, "walk": 1560, "wait": 0, "transfer": 0, "total": 1560},
	}
	for routeIndex, expectedCost := range expectedCosts {
		actualCost := body.Routes[routeIndex].Cost
		if len(actualCost) != len(expectedCost) {
			t.Errorf("ruta %d: deben venir los 5 componentes: %v", routeIndex+1, actualCost)
		}
		for component, expectedValue := range expectedCost {
			if value, present := actualCost[component]; !present || value != expectedValue {
				t.Errorf("ruta %d: se esperaba %s = %v y se obtuvo %v", routeIndex+1, component, expectedValue, actualCost)
			}
		}
	}
}

func TestPlanUniversityRoutesResponseIncludesCostWeights(t *testing.T) {
	fakeMicro := &fakeUniversityMicro{routesResponse: &microv1.PlanUniversityRoutesResponse{
		CostWeights: &microv1.CostWeights{RideWeight: 1, WalkWeight: 2, WaitWeight: 2, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600},
	}}
	recorder := serveUniversityRequest(fakeMicro, "/routes/university?from_stop=PAR-PORTAL-01")
	var body struct {
		CostWeights *costWeightsJSON `json:"cost_weights"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	expected := costWeightsJSON{RideWeight: 1, WalkWeight: 2, WaitWeight: 2, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600}
	if body.CostWeights == nil || *body.CostWeights != expected {
		t.Errorf("se esperaban los pesos %+v: %s", expected, recorder.Body.String())
	}
}

func TestPlanUniversityRoutesReturnsEmptyList(t *testing.T) {
	fakeMicro := &fakeUniversityMicro{routesResponse: &microv1.PlanUniversityRoutesResponse{}}
	recorder := serveUniversityRequest(fakeMicro, "/routes/university?from_stop=PAR-CSF-01&campus=san-francisco")
	// micro_service no informó pesos en esta respuesta de prueba: van como null.
	if recorder.Code != http.StatusOK || recorder.Body.String() != `{"cost_weights":null,"routes":[],"total":0}` {
		t.Errorf("se esperaba una lista vacía explícita: %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestPlanUniversityRoutesRejectsMalformedQuery(t *testing.T) {
	for _, query := range []string{"limit=tres", "lat=-38.7", "long=-72.6", "lat=norte&long=-72.6"} {
		fakeMicro := &fakeUniversityMicro{}
		recorder := serveUniversityRequest(fakeMicro, "/routes/university?"+query)
		if recorder.Code != http.StatusBadRequest || fakeMicro.calls != 0 {
			t.Errorf("%s: se esperaba 400 sin consultar a micro_service: %d, %d llamadas", query, recorder.Code, fakeMicro.calls)
		}
	}
}

func TestPlanUniversityRoutesTranslatesErrors(t *testing.T) {
	testCases := []struct {
		grpcCode       codes.Code
		expectedStatus int
	}{
		{codes.InvalidArgument, http.StatusBadRequest},
		{codes.NotFound, http.StatusNotFound},
		{codes.Unavailable, http.StatusServiceUnavailable},
		{codes.DeadlineExceeded, http.StatusServiceUnavailable},
		// Una clave rechazada entre servicios no es un problema de la sesión del usuario.
		{codes.Unauthenticated, http.StatusBadGateway},
	}
	for _, testCase := range testCases {
		fakeMicro := &fakeUniversityMicro{responseError: status.Error(testCase.grpcCode, "error de prueba")}
		recorder := serveUniversityRequest(fakeMicro, "/routes/university?from_stop=PAR-PORTAL-01")
		if recorder.Code != testCase.expectedStatus {
			t.Errorf("%s: se esperaba %d y se obtuvo %d", testCase.grpcCode, testCase.expectedStatus, recorder.Code)
		}
	}
	recorder := serveUniversityRequest(&fakeUniversityMicro{responseError: status.Error(codes.Unauthenticated, "clave")}, "/campuses")
	if recorder.Code != http.StatusBadGateway {
		t.Errorf("campus con clave rechazada: se esperaba 502 y se obtuvo %d", recorder.Code)
	}
}

func TestCostBreakdownJSONKeepsEveryComponent(t *testing.T) {
	costJSON := newCostBreakdownJSON(&microv1.CostBreakdown{Ride: 240, Walk: 0, Wait: 600, Transfer: 0, Total: 840})
	encoded, err := json.Marshal(costJSON)
	if err != nil {
		t.Fatal(err)
	}
	expected := `{"ride":240,"walk":0,"wait":600,"transfer":0,"total":840}`
	if string(encoded) != expected {
		t.Errorf("se esperaba %s y se obtuvo %s", expected, encoded)
	}
}

func TestCostWeightsJSONKeepsEveryWeight(t *testing.T) {
	weightsJSON := newCostWeightsJSON(&microv1.CostWeights{
		RideWeight: 1, WalkWeight: 2, WaitWeight: 2.5, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600,
	})
	encoded, err := json.Marshal(weightsJSON)
	if err != nil {
		t.Fatal(err)
	}
	expected := `{"ride_weight":1,"walk_weight":2,"wait_weight":2.5,"transfer_penalty_seconds":300,"assumed_headway_seconds":600}`
	if string(encoded) != expected {
		t.Errorf("se esperaba %s y se obtuvo %s", expected, encoded)
	}
}

func TestCostWeightsJSONWithoutWeightsIsNull(t *testing.T) {
	encoded, err := json.Marshal(gin.H{"cost_weights": newCostWeightsJSON(nil)})
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"cost_weights":null}` {
		t.Errorf("sin pesos se esperaba null y se obtuvo %s", encoded)
	}
}

func TestUniversityRouteJSONIncludesCost(t *testing.T) {
	routeJSON := newUniversityRouteJSON(&microv1.UniversityRoute{
		CampusId: "san-francisco", TotalTimeSeconds: 240,
		Cost: &microv1.CostBreakdown{Ride: 240, Wait: 600, Total: 840},
	})
	if routeJSON.Cost != (costBreakdownJSON{Ride: 240, Wait: 600, Total: 840}) {
		t.Errorf("costo inesperado: %+v", routeJSON.Cost)
	}
}

func TestUniversityRouteJSONWithoutCost(t *testing.T) {
	routeJSON := newUniversityRouteJSON(&microv1.UniversityRoute{CampusId: "san-francisco", TotalTimeSeconds: 240})
	if routeJSON.Cost != (costBreakdownJSON{}) || routeJSON.TotalTimeSeconds != 240 {
		t.Errorf("sin costo, la ruta debe seguir completa y el costo en 0: %+v", routeJSON)
	}
}

func TestCostBreakdownJSONWithoutCost(t *testing.T) {
	if costJSON := newCostBreakdownJSON(nil); costJSON != (costBreakdownJSON{}) {
		t.Errorf("sin costo, todos los componentes deben ser 0: %+v", costJSON)
	}
}
