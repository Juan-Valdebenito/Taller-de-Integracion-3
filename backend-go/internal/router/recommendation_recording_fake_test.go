package router

import (
	"context"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// recordingMicroService responde igual que fakeMicroService y además guarda las
// peticiones de rutas recomendadas. Las pruebas llaman al router en la misma
// goroutine, así que no necesita un mutex.
type recordingMicroService struct {
	fakeMicroService
	recommendRequests []*microv1.RecommendRoutesRequest
}

func (micro *recordingMicroService) RecommendRoutes(requestContext context.Context, request *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	micro.recommendRequests = append(micro.recommendRequests, request)
	return micro.fakeMicroService.RecommendRoutes(requestContext, request)
}

// engineWithMicro arma el router real con el servicio de micros indicado.
func engineWithMicro(micro handler.MicroRPC) *gin.Engine {
	return Setup([]string{"http://localhost:5173"}, testSecret, nil, token.NewMemoryStore(),
		nil, nil, nil, nil, nil, nil, nil, nil, handler.NewGRPCProxyHandler(nil, micro))
}

// Guarda cada petición en orden y responde lo mismo que fakeMicroService.
func TestRecordingMicroServiceKeepsEveryRequest(t *testing.T) {
	recorder := &recordingMicroService{}
	var micro handler.MicroRPC = recorder
	for _, limit := range []int32{1, 2} {
		response, err := micro.RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{Limit: limit})
		if err != nil || response.GetTotal() != 1 {
			t.Fatalf("total = %d, err = %v; want the fake response", response.GetTotal(), err)
		}
	}
	if len(recorder.recommendRequests) != 2 || recorder.recommendRequests[0].GetLimit() != 1 || recorder.recommendRequests[1].GetLimit() != 2 {
		t.Fatalf("recorded requests = %v, want limits 1 and 2", recorder.recommendRequests)
	}
}
