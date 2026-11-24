package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// writeTestError responde un error y devuelve lo que recibiría la app y lo que
// quedó en el log.
func writeTestError(t *testing.T, err error) (recorder *httptest.ResponseRecorder, logText string) {
	t.Helper()
	var logBuffer bytes.Buffer
	previousLogger := log.Logger
	log.Logger = zerolog.New(&logBuffer)
	defer func() { log.Logger = previousLogger }()
	gin.SetMode(gin.TestMode)
	recorder = httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	writeRecommendationError(ginContext, err)
	return recorder, logBuffer.String()
}

const internalDetail = "dial tcp 10.0.0.7:50051: refused"

// Cada código llega con su estado y su mensaje. Solo los errores de la petición
// muestran el detalle, y solo las fallas del servidor quedan en el log.
func TestWriteRecommendationError(t *testing.T) {
	testCases := []struct {
		err             error
		expectedStatus  int
		expectedMessage string
		expectedLogged  bool
	}{
		{status.Error(codes.InvalidArgument, "limit must be between 1 and 5"), 400, "limit must be between 1 and 5", false},
		{status.Error(codes.NotFound, "origin stop not found"), 404, "origin stop not found", false},
		{status.Error(codes.Unauthenticated, internalDetail), 502, recommendationFailedMessage, true},
		{status.Error(codes.Unimplemented, internalDetail), 503, recommendationUnavailableMessage, true},
		{status.Error(codes.Unavailable, internalDetail), 503, recommendationUnavailableMessage, true},
		{status.Error(codes.DeadlineExceeded, internalDetail), 503, recommendationUnavailableMessage, true},
		{status.Error(codes.Canceled, internalDetail), 499, "La petición se canceló", false},
		{status.Error(codes.Internal, internalDetail), 500, recommendationFailedMessage, true},
		{errors.New(internalDetail), 500, recommendationFailedMessage, true},
	}
	for _, testCase := range testCases {
		recorder, logText := writeTestError(t, testCase.err)
		var body map[string]string
		if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if recorder.Code != testCase.expectedStatus || len(body) != 1 || body["error"] != testCase.expectedMessage {
			t.Fatalf("%v: %d %v, want %d %q", testCase.err, recorder.Code, body, testCase.expectedStatus, testCase.expectedMessage)
		}
		if strings.Contains(recorder.Body.String(), internalDetail) {
			t.Fatalf("%v: the response shows internal details", testCase.err)
		}
		isLogged := strings.Contains(logText, `"event":"recommend_routes_failed"`) && strings.Contains(logText, internalDetail)
		if isLogged != testCase.expectedLogged || (!testCase.expectedLogged && logText != "") {
			t.Fatalf("%v: log = %q, want logged = %v", testCase.err, logText, testCase.expectedLogged)
		}
	}
}

// Nunca responde 401, que cerraría la sesión del usuario en la app.
func TestRecommendationHTTPErrorNeverIsUnauthorized(t *testing.T) {
	for code := codes.Canceled; code <= codes.Unauthenticated; code++ {
		if httpStatus, _ := recommendationHTTPError(status.Error(code, "detail")); httpStatus == http.StatusUnauthorized || httpStatus < 400 {
			t.Fatalf("%v: status = %d", code, httpStatus)
		}
	}
}

// Un error envuelto conserva su estado, y uno que cruzó la red también: una imagen
// anterior de micro_service responde 503.
func TestRecommendationHTTPErrorOfRealErrors(t *testing.T) {
	wrapped := fmt.Errorf("calling: %w", status.Error(codes.NotFound, "origin stop not found"))
	if httpStatus, _ := recommendationHTTPError(wrapped); httpStatus != http.StatusNotFound {
		t.Fatalf("wrapped error: status = %d, want 404", httpStatus)
	}
	_, err := startMicroClientWith(t, costMicroServer{}).RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{})
	if httpStatus, _ := recommendationHTTPError(err); httpStatus != http.StatusServiceUnavailable {
		t.Fatalf("older micro_service: status = %d, want 503 (%v)", httpStatus, err)
	}
}
