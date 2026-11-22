package main

// Pruebas de las preferencias del pasajero en /routes/university: se leen de la
// URL, cambian los pesos del costo y se informan en la respuesta.

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type preferenceRoutesBody struct {
	Routes      []universityRouteResponse `json:"routes"`
	CostWeights *costWeightsResponse      `json:"cost_weights"`
	Preferences *preferencesResponse      `json:"preferences"`
	Error       string                    `json:"error"`
}

func getPreferenceRoutes(t *testing.T, query string) (int, preferenceRoutesBody) {
	t.Helper()
	recorder := httptest.NewRecorder()
	universityTestHandler(t).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/routes/university?"+query, nil))
	var body preferenceRoutesBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("respuesta inválida: %s", recorder.Body.String())
	}
	return recorder.Code, body
}

// Sin preferencias, la respuesta informa las de por defecto.
func TestUniversityRoutesReportDefaultPreferences(t *testing.T) {
	statusCode, body := getPreferenceRoutes(t, "from_stop=PAR-PORTAL-01")
	if statusCode != http.StatusOK || body.Preferences == nil {
		t.Fatalf("se esperaban las preferencias en la respuesta: %d %+v", statusCode, body)
	}
	expected := preferencesResponse{Priority: priorityBalanced, MaxWalkMeters: defaultPreferredWalkMeters, AvoidCrowding: true}
	if *body.Preferences != expected {
		t.Errorf("se esperaba %+v y se obtuvo %+v", expected, *body.Preferences)
	}
}

func TestUniversityRoutesReportRequestedPreferences(t *testing.T) {
	statusCode, body := getPreferenceRoutes(t, "from_stop=PAR-PORTAL-01&priority=Least_Walking&max_walk_meters=400&avoid_crowding=0")
	if statusCode != http.StatusOK || body.Preferences == nil {
		t.Fatalf("respuesta inesperada: %d %+v", statusCode, body)
	}
	expected := preferencesResponse{Priority: priorityLeastWalking, MaxWalkMeters: 400, AvoidCrowding: false}
	if *body.Preferences != expected {
		t.Errorf("se esperaba %+v y se obtuvo %+v", expected, *body.Preferences)
	}
}

// Cada prioridad informa sus propios pesos.
func TestUniversityRoutesUsePriorityWeights(t *testing.T) {
	for _, priority := range routePriorities() {
		statusCode, body := getPreferenceRoutes(t, "from_stop=PAR-PORTAL-01&priority="+string(priority))
		if statusCode != http.StatusOK || body.CostWeights == nil {
			t.Fatalf("%s: respuesta inesperada: %d %+v", priority, statusCode, body)
		}
		expected := newCostWeightsResponse(priorityCostWeights(priority))
		if *body.CostWeights != expected {
			t.Errorf("%s: se esperaban los pesos %+v y se obtuvo %+v", priority, expected, *body.CostWeights)
		}
	}
}

// Con fastest, el costo de la primera ruta es su tiempo real: 240 s en la 1C más
// 300 s de espera, sin multiplicar.
func TestUniversityRoutesFastestCostIsRealTime(t *testing.T) {
	statusCode, body := getPreferenceRoutes(t, "from_stop=PAR-PORTAL-01&priority=fastest")
	if statusCode != http.StatusOK || len(body.Routes) == 0 {
		t.Fatalf("respuesta inesperada: %d %+v", statusCode, body)
	}
	expectedCost := costBreakdownResponse{Ride: 240, Wait: 300, Total: 540}
	if body.Routes[0].Cost != expectedCost {
		t.Errorf("se esperaba el costo %+v y se obtuvo %+v", expectedCost, body.Routes[0].Cost)
	}
}

// totalCrowding suma el recargo por ocupación de todas las rutas.
func totalCrowding(routes []universityRouteResponse) float64 {
	total := 0.0
	for _, route := range routes {
		total += route.Cost.Crowding
	}
	return total
}

// Con avoid_crowding=false, las micros llenas no se penalizan aunque la petición
// traiga su ocupación.
func TestUniversityRoutesIgnoreCrowdingWhenNotAvoiding(t *testing.T) {
	const fullLines = "from_stop=PAR-PORTAL-01&occupancy=L1C:0.95,L7B:0.95"
	_, avoiding := getPreferenceRoutes(t, fullLines)
	if totalCrowding(avoiding.Routes) == 0 {
		t.Fatalf("por defecto se esperaba recargo por micros llenas: %+v", avoiding.Routes)
	}
	statusCode, notAvoiding := getPreferenceRoutes(t, fullLines+"&avoid_crowding=false")
	if statusCode != http.StatusOK {
		t.Fatalf("respuesta inesperada: %d %+v", statusCode, notAvoiding)
	}
	if crowding := totalCrowding(notAvoiding.Routes); crowding != 0 {
		t.Errorf("con avoid_crowding=false no debe haber recargo, y hay %v", crowding)
	}
}

func TestUniversityRoutesRejectInvalidPreferences(t *testing.T) {
	invalidQueries := map[string]string{
		"from_stop=PAR-PORTAL-01&priority=slowest":       errInvalidRoutePriority.Error(),
		"from_stop=PAR-PORTAL-01&max_walk_meters=50":     errInvalidMaxWalk.Error(),
		"from_stop=PAR-PORTAL-01&max_walk_meters=0":      errInvalidMaxWalk.Error(),
		"from_stop=PAR-PORTAL-01&max_walk_meters=lejos":  errInvalidMaxWalk.Error(),
		"from_stop=PAR-PORTAL-01&avoid_crowding=a-veces": errInvalidAvoidCrowding.Error(),
	}
	for query, expectedError := range invalidQueries {
		statusCode, body := getPreferenceRoutes(t, query)
		if statusCode != http.StatusBadRequest || body.Error != expectedError {
			t.Errorf("%s: se esperaba 400 %q y se obtuvo %d %q", query, expectedError, statusCode, body.Error)
		}
	}
}

// Las preferencias armadas sin pasar por la URL, como las de gRPC, también se
// revisan.
func TestPlanUniversityRoutesRejectsInvalidPreferences(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	invalidPreferences := map[RoutePreferences]error{
		{Priority: "slowest"}:                          errInvalidRoutePriority,
		{MaxWalkMeters: 50}:                            errInvalidMaxWalk,
		{MaxWalkMeters: 5000}:                          errInvalidMaxWalk,
		{Priority: priorityFastest, MaxWalkMeters: -1}: errInvalidMaxWalk,
	}
	for preferences, expectedErr := range invalidPreferences {
		routeRequest := universityRouteRequest{OriginStopID: "PAR-PORTAL-01", Limit: 3, Preferences: &preferences}
		if _, err := planUniversityRoutes(graph, routeRequest); !errors.Is(err, expectedErr) {
			t.Errorf("%+v: se esperaba %v y se obtuvo %v", preferences, expectedErr, err)
		}
	}
}

// Una prioridad vacía o una caminata 0 significan "no se indicó".
func TestRequestPreferencesFillDefaults(t *testing.T) {
	routeRequest := universityRouteRequest{Preferences: &RoutePreferences{AvoidCrowding: false}}
	preferences := routeRequest.preferences()
	if preferences.Priority != defaultRoutePriority || preferences.MaxWalkMeters != defaultPreferredWalkMeters || preferences.AvoidCrowding {
		t.Errorf("preferencias inesperadas: %+v", preferences)
	}
	if defaults := (universityRouteRequest{}).preferences(); defaults != defaultRoutePreferences() {
		t.Errorf("sin preferencias se esperaban las de por defecto: %+v", defaults)
	}
}

// longestWalk devuelve la caminata más larga de las rutas, en metros.
func longestWalk(routes []UniversityRoute) int {
	longest := 0
	for _, route := range routes {
		for _, step := range route.Path {
			if step.Edge.RouteID == walkRouteID && step.Edge.DistanceM > longest {
				longest = step.Edge.DistanceM
			}
		}
	}
	return longest
}

// Ningún transbordo a pie supera la caminata máxima del pasajero. Desde
// PAR-DPORT-01 hay caminatas de 180, 600 y 950 m; con 300 m solo queda la de 180.
func TestPlanUniversityRoutesRespectMaxWalkInTransfers(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	for _, originStopID := range []string{"PAR-PORTAL-01", "PAR-DPORT-01", "PAR-MRODRI-01"} {
		for _, maxWalkMeters := range []int{minPreferredWalkMeters, 300, 500, maxPreferredWalkMeters} {
			routes, err := planUniversityRoutes(graph, universityRouteRequest{
				OriginStopID: originStopID, Limit: maxUniversityRoutes,
				Preferences: &RoutePreferences{MaxWalkMeters: maxWalkMeters, AvoidCrowding: true},
			})
			if err != nil || len(routes) == 0 {
				t.Fatalf("%s, %d m: se esperaban rutas: %+v, %v", originStopID, maxWalkMeters, routes, err)
			}
			if walk := longestWalk(routes); walk > maxWalkMeters {
				t.Errorf("%s, %d m: hay una caminata de %d m", originStopID, maxWalkMeters, walk)
			}
		}
	}
}

// Bajar la caminata máxima quita rutas que antes sí aparecían.
func TestPlanUniversityRoutesDropLongWalksOnlyWhenAsked(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	plan := func(preferences *RoutePreferences) []UniversityRoute {
		routes, err := planUniversityRoutes(graph, universityRouteRequest{
			OriginStopID: "PAR-DPORT-01", Limit: maxUniversityRoutes, Preferences: preferences,
		})
		if err != nil {
			t.Fatal(err)
		}
		return routes
	}
	if walk := longestWalk(plan(nil)); walk <= 300 {
		t.Fatalf("sin preferencias se esperaba alguna caminata de más de 300 m, y la mayor es de %d m", walk)
	}
	if walk := longestWalk(plan(&RoutePreferences{MaxWalkMeters: 300, AvoidCrowding: true})); walk > 300 {
		t.Errorf("con 300 m hay una caminata de %d m", walk)
	}
}

// Desde una posición, la caminata inicial tampoco supera el máximo. En
// twoStopsTestGraph, NEAR está a unos 100 m y FAR a unos 900 m.
func TestPlanUniversityRoutesRespectMaxWalkFromLocation(t *testing.T) {
	graph, campus := twoStopsTestGraph()
	previousCampuses := universityCampuses
	t.Cleanup(func() { universityCampuses = previousCampuses })
	universityCampuses = []Campus{campus}
	plan := func(maxWalkMeters int) ([]UniversityRoute, error) {
		return planUniversityRoutes(graph, universityRouteRequest{
			HasLocation: true, Latitude: testOriginLatitude, Longitude: testOriginLongitude, Limit: 2,
			Preferences: &RoutePreferences{MaxWalkMeters: maxWalkMeters, AvoidCrowding: true},
		})
	}
	startStops := func(routes []UniversityRoute) map[string]bool {
		stops := make(map[string]bool)
		for _, route := range routes {
			stops[route.Path[0].Edge.ToStopID] = true
		}
		return stops
	}

	routes, err := plan(maxPreferredWalkMeters)
	if err != nil || !startStops(routes)["NEAR"] || !startStops(routes)["FAR"] {
		t.Fatalf("con 1000 m se esperaba partir desde NEAR y FAR: %+v, %v", routes, err)
	}
	routes, err = plan(500)
	if err != nil || len(routes) != 1 || !startStops(routes)["NEAR"] {
		t.Fatalf("con 500 m solo se puede partir desde NEAR: %+v, %v", routes, err)
	}
	if _, err := plan(minPreferredWalkMeters); !errors.Is(err, errNoNearbyStops) {
		t.Errorf("con 100 m no hay paraderos al alcance; se esperaba errNoNearbyStops y se obtuvo %v", err)
	}
}

// Por HTTP: desde PAR-DPORT-01, con 300 m ningún tramo a pie supera ese largo.
func TestUniversityRoutesRespectMaxWalkParameter(t *testing.T) {
	statusCode, body := getPreferenceRoutes(t, "from_stop=PAR-DPORT-01&limit=5&max_walk_meters=300")
	if statusCode != http.StatusOK || len(body.Routes) == 0 {
		t.Fatalf("respuesta inesperada: %d %+v", statusCode, body)
	}
	for _, route := range body.Routes {
		for _, movement := range route.Movements {
			if movement.Mode == "walk" && movement.DistanceM > 300 {
				t.Errorf("hay una caminata de %d m: %+v", movement.DistanceM, movement)
			}
		}
	}
}

// Filtrar las caminatas no debe cambiar el grafo compartido entre peticiones.
func TestMaxWalkDoesNotChangeSharedGraph(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	edgesBefore := len(graph.Edges["PAR-DPORT-01"])
	if graphWithMaxWalk(graph, maxWalkDistanceMeters) != graph {
		t.Error("con la caminata máxima de la red no se debe copiar el grafo")
	}
	filtered := graphWithMaxWalk(graph, 300)
	if len(filtered.Edges["PAR-DPORT-01"]) >= edgesBefore {
		t.Errorf("el grafo filtrado debe tener menos aristas: %d de %d", len(filtered.Edges["PAR-DPORT-01"]), edgesBefore)
	}
	if len(graph.Edges["PAR-DPORT-01"]) != edgesBefore {
		t.Error("el grafo original cambió")
	}
}
