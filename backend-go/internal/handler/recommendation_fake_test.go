package handler

import (
	"context"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// fakeRecommendationMicro reemplaza a micro_service en las pruebas de rutas
// recomendadas. Incluye MicroRPC sin implementar: si el handler llamara a otra
// función, la prueba fallaría.
type fakeRecommendationMicro struct {
	MicroRPC
	response        *microv1.RecommendRoutesResponse
	responseError   error
	receivedRequest *microv1.RecommendRoutesRequest
	calls           int
}

func (fakeMicro *fakeRecommendationMicro) RecommendRoutes(_ context.Context, request *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	fakeMicro.calls++
	fakeMicro.receivedRequest = request
	if fakeMicro.responseError != nil {
		return nil, fakeMicro.responseError
	}
	return fakeMicro.response, nil
}

// El servicio falso se usa a través de MicroRPC, igual que lo hará el handler.
func TestFakeRecommendationMicroRecordsRequest(t *testing.T) {
	fakeMicro := &fakeRecommendationMicro{response: &microv1.RecommendRoutesResponse{Total: 1}}
	var micro MicroRPC = fakeMicro
	request := &microv1.RecommendRoutesRequest{Limit: 2}
	response, err := micro.RecommendRoutes(context.Background(), request)
	if err != nil || response != fakeMicro.response {
		t.Fatalf("response = %v, err = %v; want the configured response", response, err)
	}
	if fakeMicro.calls != 1 || fakeMicro.receivedRequest != request {
		t.Fatalf("calls = %d, request = %v; want one call with the sent request", fakeMicro.calls, fakeMicro.receivedRequest)
	}
}

// Con un error configurado no entrega respuesta, igual que gRPC, y conserva el
// código. La petición se guarda de todos modos.
func TestFakeRecommendationMicroReturnsConfiguredError(t *testing.T) {
	for _, expectedCode := range []codes.Code{codes.InvalidArgument, codes.NotFound, codes.Unauthenticated, codes.Unavailable, codes.Unimplemented} {
		fakeMicro := &fakeRecommendationMicro{
			response:      &microv1.RecommendRoutesResponse{Total: 1},
			responseError: status.Error(expectedCode, "configured error"),
		}
		request := &microv1.RecommendRoutesRequest{}
		response, err := fakeMicro.RecommendRoutes(context.Background(), request)
		if response != nil || status.Code(err) != expectedCode {
			t.Fatalf("response = %v, err = %v; want only %v", response, err, expectedCode)
		}
		if fakeMicro.calls != 1 || fakeMicro.receivedRequest != request {
			t.Fatalf("%v: the request was not recorded", expectedCode)
		}
	}
}
