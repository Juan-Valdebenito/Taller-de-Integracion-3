package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

type universityRoutesBody struct {
	Routes []universityRouteResponse `json:"routes"`
	Total  int                       `json:"total"`
	Error  string                    `json:"error"`
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
