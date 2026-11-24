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
	"google.golang.org/protobuf/proto"
)

const validRecommendationQuery = "origin_stop=PAR-PORTAL-01&destination_stop=PAR-CSF-01"

// serveRecommendation pide rutas recomendadas al handler, sin el router real.
func serveRecommendation(proxyHandler *GRPCProxyHandler, request *http.Request) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.GET("/recommendations/route", proxyHandler.RecommendRoutes)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	return recorder
}

func recommendationHTTPRequest(rawQuery string) *http.Request {
	return httptest.NewRequest(http.MethodGet, "/recommendations/route?"+rawQuery, nil)
}

// La petición llega a micro_service tal como se leyó de la URL, y la app recibe su
// respuesta completa.
func TestRecommendRoutesHandlerAnswersRoutes(t *testing.T) {
	fakeMicro := &fakeRecommendationMicro{response: recommendationSampleResponse()}
	recorder := serveRecommendation(NewGRPCProxyHandler(nil, fakeMicro), recommendationHTTPRequest(
		"origin_stop=PAR-PORTAL-01&destination_lat=-38.74&destination_long=-72.6&limit=2&priority=fastest&avoid_crowding=false"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	expectedRequest := &microv1.RecommendRoutesRequest{
		Origin: stopRoutePoint("PAR-PORTAL-01"), Destination: locationRoutePoint(-38.74, -72.6), Limit: 2,
		Preferences: &microv1.RoutePreferences{Priority: "fastest", AvoidCrowding: proto.Bool(false)},
	}
	if fakeMicro.calls != 1 || !proto.Equal(fakeMicro.receivedRequest, expectedRequest) {
		t.Fatalf("calls = %d, request = %v; want one call with %v", fakeMicro.calls, fakeMicro.receivedRequest, expectedRequest)
	}
	assertJSONText(t, newRecommendationsJSON(recommendationSampleResponse()), recorder.Body.String())
}

// Que no haya rutas no es un error: responde 200 con una lista vacía.
func TestRecommendRoutesHandlerAnswersNoRoutes(t *testing.T) {
	fakeMicro := &fakeRecommendationMicro{response: &microv1.RecommendRoutesResponse{}}
	recorder := serveRecommendation(NewGRPCProxyHandler(nil, fakeMicro), recommendationHTTPRequest(validRecommendationQuery))
	const expectedBody = `{"routes":[],"total":0,"cost_weights":null,"preferences":null}`
	if recorder.Code != http.StatusOK || recorder.Body.String() != expectedBody {
		t.Fatalf("status = %d, body = %s; want 200 %s", recorder.Code, recorder.Body.String(), expectedBody)
	}
}

// Una URL mal escrita responde 400 sin llamar a micro_service.
func TestRecommendRoutesHandlerRejectsBadQuery(t *testing.T) {
	for rawQuery, expectedMessage := range map[string]string{
		validRecommendationQuery + "&limit=tres":         "limit debe ser un número entero",
		validRecommendationQuery + "&avoid_crowding=yes": "avoid_crowding debe ser true o false",
		"origin_lat=-38.7&destination_stop=B":            "origin_lat y origin_long deben enviarse juntos",
		"origin_stop=%FF&destination_stop=B":             "origin_stop tiene caracteres inválidos",
	} {
		fakeMicro := &fakeRecommendationMicro{}
		recorder := serveRecommendation(NewGRPCProxyHandler(nil, fakeMicro), recommendationHTTPRequest(rawQuery))
		var body map[string]string
		if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if recorder.Code != http.StatusBadRequest || body["error"] != expectedMessage || fakeMicro.calls != 0 {
			t.Fatalf("%s: %d %v after %d calls, want 400 %q without calls", rawQuery, recorder.Code, body, fakeMicro.calls, expectedMessage)
		}
	}
}

// Un punto que falta no es un error de formato: lo rechaza micro_service, y la app
// recibe su mensaje.
func TestRecommendRoutesHandlerForwardsMissingPoint(t *testing.T) {
	const missingOrigin = "provide origin_stop, or origin_lat and origin_long"
	fakeMicro := &fakeRecommendationMicro{responseError: status.Error(codes.InvalidArgument, missingOrigin)}
	recorder := serveRecommendation(NewGRPCProxyHandler(nil, fakeMicro), recommendationHTTPRequest("destination_stop=B"))
	if fakeMicro.calls != 1 || fakeMicro.receivedRequest.GetOrigin() != nil {
		t.Fatalf("calls = %d, request = %v; want one call without origin", fakeMicro.calls, fakeMicro.receivedRequest)
	}
	if expectedBody := `{"error":"` + missingOrigin + `"}`; recorder.Code != http.StatusBadRequest || recorder.Body.String() != expectedBody {
		t.Fatalf("status = %d, body = %s; want 400 %s", recorder.Code, recorder.Body.String(), expectedBody)
	}
}

// Cada error de micro_service responde su estado, sin rutas.
func TestRecommendRoutesHandlerAnswersErrors(t *testing.T) {
	for code, expectedStatus := range map[codes.Code]int{
		codes.NotFound: 404, codes.Unauthenticated: 502, codes.Unavailable: 503,
		codes.DeadlineExceeded: 503, codes.Unimplemented: 503, codes.Internal: 500,
	} {
		fakeMicro := &fakeRecommendationMicro{response: recommendationSampleResponse(), responseError: status.Error(code, "detail")}
		recorder := serveRecommendation(NewGRPCProxyHandler(nil, fakeMicro), recommendationHTTPRequest(validRecommendationQuery))
		var body map[string]any
		if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if _, hasError := body["error"]; recorder.Code != expectedStatus || !hasError || len(body) != 1 {
			t.Fatalf("%v: %d %v, want %d with only the error", code, recorder.Code, body, expectedStatus)
		}
	}
}

// contextMicro responde según el contexto que recibe, como el cliente gRPC real.
type contextMicro struct{ MicroRPC }

func (contextMicro) RecommendRoutes(requestContext context.Context, _ *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	return nil, status.FromContextError(requestContext.Err()).Err()
}

// El handler pasa el contexto de la petición HTTP: si el pasajero cierra la app,
// la llamada a micro_service también se cancela.
func TestRecommendRoutesHandlerPassesRequestContext(t *testing.T) {
	canceledContext, cancelRequest := context.WithCancel(context.Background())
	cancelRequest()
	request := recommendationHTTPRequest(validRecommendationQuery).WithContext(canceledContext)
	recorder := serveRecommendation(NewGRPCProxyHandler(nil, contextMicro{}), request)
	if recorder.Code != statusClientClosedRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, statusClientClosedRequest)
	}
}
