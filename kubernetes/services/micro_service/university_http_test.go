package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

type universityRoutesBody struct {
	Routes      []universityRouteResponse `json:"routes"`
	Total       int                       `json:"total"`
	CostWeights *costWeightsResponse      `json:"cost_weights"`
	Error       string                    `json:"error"`
}

func universityTestHandler(t *testing.T) http.Handler {
	t.Helper()
	store := &GraphStore{}
	store.Replace(loadSeedNetwork(t).buildGraph())
	return (&Server{store: store}).routes()
}

func getUniversityRoutes(t *testing.T, handler http.Handler, query string) (int, universityRoutesBody) {
	t.Helper()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/routes/university?"+query, nil))
	var body universityRoutesBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("respuesta inválida: %s", recorder.Body.String())
	}
	return recorder.Code, body
}

func TestUniversityRoutesFromStop(t *testing.T) {
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), "from_stop=PAR-PORTAL-01")
	if statusCode != http.StatusOK || body.Total != defaultUniversityRoutes {
		t.Fatalf("respuesta inesperada: %d %+v", statusCode, body)
	}
	firstRoute := body.Routes[0]
	if firstRoute.CampusID != "san-francisco" || firstRoute.TotalTimeSec != 240 || firstRoute.Transfers != 0 {
		t.Errorf("primera ruta inesperada: %+v", firstRoute)
	}
	if len(firstRoute.Movements) != 1 || firstRoute.Movements[0].Mode != "bus" {
		t.Errorf("tramos inesperados: %+v", firstRoute.Movements)
	}
	// 240 s en la 1C y 300 s de espera con peso 2.
	expectedCost := costBreakdownResponse{Ride: 240, Walk: 0, Wait: 600, Transfer: 0, Total: 840}
	if firstRoute.Cost != expectedCost {
		t.Errorf("se esperaba el costo %+v y se obtuvo %+v", expectedCost, firstRoute.Cost)
	}
}

func TestUniversityRoutesReportCostWeights(t *testing.T) {
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), "from_stop=PAR-PORTAL-01")
	if statusCode != http.StatusOK || body.CostWeights == nil {
		t.Fatalf("se esperaban los pesos en la respuesta: %d %+v", statusCode, body)
	}
	expected := costWeightsResponse{
		RideWeight: 1, WalkWeight: 2, WaitWeight: 2, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: defaultHeadwaySeconds,
	}
	if *body.CostWeights != expected {
		t.Errorf("se esperaba %+v y se obtuvo %+v", expected, *body.CostWeights)
	}
}

func TestUniversityRoutesReportWeightsWhenEmpty(t *testing.T) {
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), "from_stop=PAR-CSF-01&campus=san-francisco")
	if statusCode != http.StatusOK || body.Total != 0 || body.CostWeights == nil {
		t.Errorf("una lista vacía también debe informar los pesos: %d %+v", statusCode, body)
	}
}

// Valores calculados a mano con los datos oficiales y los pesos por defecto.
func TestUniversityRoutesRealCostsFromPortal(t *testing.T) {
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), "from_stop=PAR-PORTAL-01&limit=3")
	if statusCode != http.StatusOK || body.Total != 3 {
		t.Fatalf("se esperaban 3 rutas: %d %+v", statusCode, body)
	}
	expectedRoutes := []struct {
		campusID    string
		timeSeconds int
		cost        costBreakdownResponse
	}{
		// Micro a San Francisco: 240 s de viaje y 300 s de espera con peso 2.
		{"san-francisco", 240, costBreakdownResponse{Ride: 240, Wait: 600, Total: 840}},
		// Caminar 780 s con peso 2, sin esperar.
		{"san-francisco", 780, costBreakdownResponse{Walk: 1560, Total: 1560}},
		// La 7B completa: 1860 s de viaje, una sola espera y sin cambios.
		{"san-juan-pablo-ii", 1860, costBreakdownResponse{Ride: 1860, Wait: 600, Total: 2460}},
	}
	for routeIndex, expected := range expectedRoutes {
		route := body.Routes[routeIndex]
		if route.CampusID != expected.campusID || route.TotalTimeSec != expected.timeSeconds || route.Cost != expected.cost {
			t.Errorf("ruta %d: se esperaba %s en %d s con %+v, y se obtuvo %s en %d s con %+v", routeIndex+1,
				expected.campusID, expected.timeSeconds, expected.cost, route.CampusID, route.TotalTimeSec, route.Cost)
		}
	}
}

func TestUniversityRoutesRealCostFromLocation(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	latitude, longitude := locationNearStop(graph, "PAR-PORTAL-01")
	query := fmt.Sprintf("lat=%f&long=%f&campus=san-francisco&limit=1", latitude, longitude)
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), query)
	if statusCode != http.StatusOK || body.Total != 1 {
		t.Fatalf("se esperaba una ruta: %d %+v", statusCode, body)
	}
	route := body.Routes[0]
	initialWalkSeconds := route.Movements[0].TimeSec
	// La misma micro de 840 más la caminata inicial con peso 2.
	expectedCost := costBreakdownResponse{
		Ride: 240, Walk: float64(initialWalkSeconds * 2), Wait: 600, Total: float64(840 + initialWalkSeconds*2),
	}
	if route.Movements[0].Mode != "walk" || route.Cost != expectedCost {
		t.Errorf("se esperaba %+v y se obtuvo %+v", expectedCost, route.Cost)
	}
}

func TestUniversityRoutesCostMatchesOrder(t *testing.T) {
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), "from_stop=PAR-PORTAL-01&limit=5")
	if statusCode != http.StatusOK || body.Total == 0 {
		t.Fatalf("respuesta inesperada: %d %+v", statusCode, body)
	}
	for routeIndex, route := range body.Routes {
		componentsSum := route.Cost.Ride + route.Cost.Walk + route.Cost.Wait + route.Cost.Transfer
		if roundToTenth(componentsSum) != route.Cost.Total {
			t.Errorf("el total %v no coincide con la suma %v", route.Cost.Total, componentsSum)
		}
		if route.Cost.Total < float64(route.TotalTimeSec) {
			t.Errorf("el costo %v no puede ser menor que el tiempo %d", route.Cost.Total, route.TotalTimeSec)
		}
		// Sin campus, la mejor ruta de cada campus va primero; dentro del mismo campus
		// las rutas siguen el orden por costo.
		for previousIndex := 0; previousIndex < routeIndex; previousIndex++ {
			previous := body.Routes[previousIndex]
			if previous.CampusID == route.CampusID && previous.Cost.Total > route.Cost.Total {
				t.Errorf("%s no está ordenado por costo: %v antes de %v", route.CampusID, previous.Cost.Total, route.Cost.Total)
			}
		}
	}
}

func TestUniversityRoutesFromLocationStartWalking(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	latitude, longitude := locationNearStop(graph, "PAR-PORTAL-01")
	query := fmt.Sprintf("lat=%f&long=%f&campus=san-juan-pablo-ii&limit=2", latitude, longitude)
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), query)
	if statusCode != http.StatusOK || body.Total == 0 || body.Total > 2 {
		t.Fatalf("respuesta inesperada: %d %+v", statusCode, body)
	}
	firstMovement := body.Routes[0].Movements[0]
	if firstMovement.FromStopID != userLocationID || firstMovement.Mode != "walk" {
		t.Errorf("la ruta debe partir caminando: %+v", firstMovement)
	}
}

func TestUniversityRoutesFromCampusAreEmptyWhenAlreadyThere(t *testing.T) {
	statusCode, body := getUniversityRoutes(t, universityTestHandler(t), "from_stop=PAR-CSF-01&campus=san-francisco")
	if statusCode != http.StatusOK || body.Total != 0 || body.Routes == nil {
		t.Errorf("se esperaba una lista vacía: %d %+v", statusCode, body)
	}
}

func TestUniversityRoutesRejectInvalidRequests(t *testing.T) {
	handler := universityTestHandler(t)
	testCases := []struct {
		name, query    string
		expectedStatus int
	}{
		{"sin origen", "", http.StatusBadRequest},
		{"dos orígenes", "from_stop=PAR-CSF-01&lat=-38.7&long=-72.6", http.StatusBadRequest},
		{"falta longitud", "lat=-38.7", http.StatusBadRequest},
		{"coordenada de texto", "lat=norte&long=-72.6", http.StatusBadRequest},
		{"coordenada fuera de rango", "lat=-91&long=-72.6", http.StatusBadRequest},
		{"coordenada NaN", "lat=NaN&long=-72.6", http.StatusBadRequest},
		{"límite cero", "from_stop=PAR-CSF-01&limit=0", http.StatusBadRequest},
		{"límite excesivo", "from_stop=PAR-CSF-01&limit=6", http.StatusBadRequest},
		{"límite de texto", "from_stop=PAR-CSF-01&limit=tres", http.StatusBadRequest},
		{"paradero inexistente", "from_stop=NO-EXISTE", http.StatusNotFound},
		{"campus inexistente", "from_stop=PAR-PORTAL-01&campus=otro", http.StatusNotFound},
		{"lejos de la red", "lat=-38.0&long=-72.0", http.StatusNotFound},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			statusCode, body := getUniversityRoutes(t, handler, testCase.query)
			if statusCode != testCase.expectedStatus || body.Error == "" {
				t.Errorf("se esperaba %d con error: %d %+v", testCase.expectedStatus, statusCode, body)
			}
		})
	}
}

func TestUniversityRoutesRequireLoadedGraph(t *testing.T) {
	handler := (&Server{store: &GraphStore{}}).routes()
	statusCode, _ := getUniversityRoutes(t, handler, "from_stop=PAR-CSF-01")
	if statusCode != http.StatusServiceUnavailable {
		t.Errorf("se esperaba 503 y se obtuvo %d", statusCode)
	}
}

func TestCampusesEndpoint(t *testing.T) {
	recorder := httptest.NewRecorder()
	universityTestHandler(t).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/campuses", nil))
	var body struct {
		Campuses []campusResponse `json:"campuses"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != http.StatusOK || len(body.Campuses) != len(universityCampuses) {
		t.Errorf("respuesta inesperada: %d %+v", recorder.Code, body)
	}
}
