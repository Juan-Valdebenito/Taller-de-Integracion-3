package router

import (
	"context"
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

func (fakeMicroService) PlanUniversityRoutes(context.Context, *microv1.PlanUniversityRoutesRequest) (*microv1.PlanUniversityRoutesResponse, error) {
	return &microv1.PlanUniversityRoutesResponse{}, nil
}

func universityRoutesEngine() *gin.Engine {
	proxyHandler := handler.NewGRPCProxyHandler(nil, fakeMicroService{})
	return Setup([]string{"http://localhost:5173"}, testSecret, nil, token.NewMemoryStore(),
		nil, nil, nil, nil, nil, nil, nil, nil, proxyHandler)
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
