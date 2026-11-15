package router

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// fakeMicroService solo implementa lo que usan las rutas a la universidad.
type fakeMicroService struct{ handler.MicroRPC }

func (fakeMicroService) ListCampuses(context.Context) (*microv1.ListCampusesResponse, error) {
	return &microv1.ListCampusesResponse{}, nil
}

// PlanUniversityRoutes responde una ruta con costo y los pesos, como lo haría
// micro_service desde PAR-PORTAL-01 hacia San Francisco.
func (fakeMicroService) PlanUniversityRoutes(context.Context, *microv1.PlanUniversityRoutesRequest) (*microv1.PlanUniversityRoutesResponse, error) {
	return &microv1.PlanUniversityRoutesResponse{
		Routes: []*microv1.UniversityRoute{
			{
				CampusId: "san-francisco", TotalTimeSeconds: 240,
				Cost: &microv1.CostBreakdown{Ride: 240, Wait: 600, Total: 840},
			},
			// La misma micro, partiendo con una caminata de 84 s en un día de 3 °C.
			{
				CampusId: "san-francisco", TotalTimeSeconds: 324,
				Cost: &microv1.CostBreakdown{Ride: 240, Walk: 168, Wait: 600, Weather: 33.6, Total: 1041.6},
			},
		},
		Total:       2,
		CostWeights: &microv1.CostWeights{RideWeight: 1, WalkWeight: 2, WaitWeight: 2, TransferPenaltySeconds: 300, AssumedHeadwaySeconds: 600},
	}, nil
}

func universityRoutesEngine() *gin.Engine {
	proxyHandler := handler.NewGRPCProxyHandler(nil, fakeMicroService{})
	return Setup([]string{"http://localhost:5173"}, testSecret, nil, token.NewMemoryStore(),
		nil, nil, nil, nil, nil, nil, nil, nil, proxyHandler)
}

// Recorre el router real con una sesión de pasajero: autenticación, handler y
// JSON. El costo y los pesos deben llegar como los entregó micro_service.
func TestUniversityRoutesDeliverCostThroughRouter(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/integrations/micro/routes/university?from_stop=PAR-PORTAL-01", nil)
	request.Header.Set("Authorization", "Bearer "+accessToken(t, "usr-pass", "PASSENGER"))
	recorder := httptest.NewRecorder()
	universityRoutesEngine().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("se esperaba 200: %d %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Routes []struct {
			Cost struct {
				Ride, Walk, Wait, Transfer, Total float64
			} `json:"cost"`
		} `json:"routes"`
		CostWeights *struct {
			WalkWeight            float64 `json:"walk_weight"`
			AssumedHeadwaySeconds int     `json:"assumed_headway_seconds"`
		} `json:"cost_weights"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Routes) != 2 || body.Routes[0].Cost.Total != 840 || body.Routes[0].Cost.Wait != 600 {
		t.Errorf("costo inesperado: %s", recorder.Body.String())
	}
	if body.CostWeights == nil || body.CostWeights.WalkWeight != 2 || body.CostWeights.AssumedHeadwaySeconds != 600 {
		t.Errorf("pesos inesperados: %s", recorder.Body.String())
	}
}

// Recorre el router real con una sesión de pasajero: el recargo por clima de la
// segunda ruta debe llegar a la app con su valor exacto.
func TestUniversityRoutesDeliverWeatherThroughRouter(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/integrations/micro/routes/university?lat=-38.73&long=-72.61", nil)
	request.Header.Set("Authorization", "Bearer "+accessToken(t, "usr-pass", "PASSENGER"))
	recorder := httptest.NewRecorder()
	universityRoutesEngine().ServeHTTP(recorder, request)
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
	if len(body.Routes) != 2 {
		t.Fatalf("se esperaban 2 rutas: %s", recorder.Body.String())
	}
	if weather, present := body.Routes[0].Cost["weather"]; !present || weather != 0 {
		t.Errorf("la ruta sin caminar debe traer weather = 0: %v", body.Routes[0].Cost)
	}
	if body.Routes[1].Cost["weather"] != 33.6 || body.Routes[1].Cost["total"] != 1041.6 {
		t.Errorf("se esperaba weather = 33.6 y total = 1041.6: %v", body.Routes[1].Cost)
	}
}

func TestUniversityRoutesRequireSession(t *testing.T) {
	engine := universityRoutesEngine()
	for _, path := range []string{"/api/v1/integrations/micro/campuses", "/api/v1/integrations/micro/routes/university?from_stop=PAR-PORTAL-01"} {
		withoutSession := httptest.NewRecorder()
		engine.ServeHTTP(withoutSession, httptest.NewRequest(http.MethodGet, path, nil))
		if withoutSession.Code != http.StatusUnauthorized {
			t.Errorf("%s sin sesión: se esperaba 401 y se obtuvo %d", path, withoutSession.Code)
		}

		withSession := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Authorization", "Bearer "+accessToken(t, "usr-pass", "PASSENGER"))
		engine.ServeHTTP(withSession, request)
		if withSession.Code != http.StatusOK {
			t.Errorf("%s con sesión: se esperaba 200 y se obtuvo %d %s", path, withSession.Code, withSession.Body.String())
		}
	}
}
