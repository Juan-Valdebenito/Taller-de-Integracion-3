package transport_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
)

// ── Helpers ───────────────────────────────────────────────────────────────────

// newTestHTTPClient crea un HTTPPredictionClient apuntando al servidor de test.
func newTestHTTPClient(t *testing.T, serverURL string) *transport.HTTPPredictionClient {
	t.Helper()
	client, err := transport.NewHTTPPredictionClient(serverURL, 2*time.Second)
	if err != nil {
		t.Fatalf("NewHTTPPredictionClient: %v", err)
	}
	return client
}

// successHandler es un handler HTTP que devuelve una predicción exitosa.
func successHandler(ratio float64, level string, confidence float64) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"predicted_ratio":      ratio,
			"predicted_passengers": 35,
			"occupancy_level":      level,
			"confidence":           confidence,
			"predictor_name":       "rf-v2",
			"predicted_at":         "2026-01-01T12:00:00Z",
		})
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// TestHTTPPredictionClient_Predict_Success verifica el flujo feliz:
// el servidor ML responde 200 con un JSON válido.
func TestHTTPPredictionClient_Predict_Success(t *testing.T) {
	srv := httptest.NewServer(successHandler(0.72, "HIGH", 0.91))
	defer srv.Close()

	client := newTestHTTPClient(t, srv.URL)
	defer client.Close()

	hour := 8
	dow := 1
	resp, err := client.Predict(context.Background(), transport.PredictRequest{
		RouteID:           "route-001",
		CurrentPassengers: 40,
		Capacity:          60,
		Hour:              &hour,
		DayOfWeek:         &dow,
	})

	if err != nil {
		t.Fatalf("Predict error inesperado: %v", err)
	}
	if resp == nil {
		t.Fatal("Predict devolvió nil sin error")
	}
	if resp.PredictedRatio != 0.72 {
		t.Errorf("PredictedRatio: got %v, want 0.72", resp.PredictedRatio)
	}
	if resp.OccupancyLevel != "HIGH" {
		t.Errorf("OccupancyLevel: got %q, want \"HIGH\"", resp.OccupancyLevel)
	}
	if resp.Confidence != 0.91 {
		t.Errorf("Confidence: got %v, want 0.91", resp.Confidence)
	}
	if resp.PredictorName != "rf-v2" {
		t.Errorf("PredictorName: got %q, want \"rf-v2\"", resp.PredictorName)
	}
	if resp.Latency <= 0 {
		t.Error("Latency debería ser positiva")
	}
}

// TestHTTPPredictionClient_Predict_ServerError verifica que un status 500
// del servidor ML se propaga como error descriptivo.
func TestHTTPPredictionClient_Predict_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "modelo no disponible",
		})
	}))
	defer srv.Close()

	client := newTestHTTPClient(t, srv.URL)
	defer client.Close()

	_, err := client.Predict(context.Background(), transport.PredictRequest{
		RouteID:  "route-001",
		Capacity: 50,
	})

	if err == nil {
		t.Fatal("Predict debería haber devuelto un error para status 500")
	}
	// El error debe mencionar el status code
	errMsg := err.Error()
	if len(errMsg) == 0 {
		t.Error("El mensaje de error no puede estar vacío")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestHTTPPredictionClient_Predict_NotFound verifica que un 404 se reporta correctamente.
func TestHTTPPredictionClient_Predict_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	client := newTestHTTPClient(t, srv.URL)
	defer client.Close()

	_, err := client.Predict(context.Background(), transport.PredictRequest{
		RouteID:  "route-999",
		Capacity: 50,
	})

	if err == nil {
		t.Fatal("Predict debería haber devuelto error para status 404")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestHTTPPredictionClient_Predict_ContextCancelled verifica que el contexto
// cancelado se propaga como error sin colgar el proceso.
func TestHTTPPredictionClient_Predict_ContextCancelled(t *testing.T) {
	// Servidor que demora 500ms
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		successHandler(0.5, "MEDIUM", 0.8)(w, r)
	}))
	defer srv.Close()

	client := newTestHTTPClient(t, srv.URL)
	defer client.Close()

	// Cancelar el contexto antes del timeout del servidor
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := client.Predict(ctx, transport.PredictRequest{
		RouteID:  "route-001",
		Capacity: 50,
	})

	if err == nil {
		t.Fatal("Predict debería haber devuelto error por contexto cancelado")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestHTTPPredictionClient_Predict_InvalidJSONResponse verifica el manejo
// de respuestas con JSON malformado del servidor.
func TestHTTPPredictionClient_Predict_InvalidJSONResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{ invalid json }`))
	}))
	defer srv.Close()

	client := newTestHTTPClient(t, srv.URL)
	defer client.Close()

	_, err := client.Predict(context.Background(), transport.PredictRequest{
		RouteID:  "route-001",
		Capacity: 50,
	})

	if err == nil {
		t.Fatal("Predict debería fallar con JSON inválido")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestHTTPPredictionClient_Predict_NilHourDayOfWeek verifica que cuando
// Hour y DayOfWeek son nil, el cliente usa la hora/día actuales sin pánico.
func TestHTTPPredictionClient_Predict_NilHourDayOfWeek(t *testing.T) {
	srv := httptest.NewServer(successHandler(0.3, "LOW", 0.85))
	defer srv.Close()

	client := newTestHTTPClient(t, srv.URL)
	defer client.Close()

	// Hour y DayOfWeek son nil — el cliente debe usar time.Now()
	resp, err := client.Predict(context.Background(), transport.PredictRequest{
		RouteID:           "route-002",
		CurrentPassengers: 10,
		Capacity:          50,
	})

	if err != nil {
		t.Fatalf("Predict error inesperado: %v", err)
	}
	if resp.OccupancyLevel != "LOW" {
		t.Errorf("OccupancyLevel: got %q, want \"LOW\"", resp.OccupancyLevel)
	}
}

// TestNewHTTPPredictionClient_EmptyURL verifica que la URL vacía devuelve error.
func TestNewHTTPPredictionClient_EmptyURL(t *testing.T) {
	_, err := transport.NewHTTPPredictionClient("", 5*time.Second)
	if err == nil {
		t.Fatal("NewHTTPPredictionClient con URL vacía debería devolver error")
	}
}

// TestHTTPPredictionClient_Close_IsNoOp verifica que Close() no devuelve error.
func TestHTTPPredictionClient_Close_IsNoOp(t *testing.T) {
	client, _ := transport.NewHTTPPredictionClient("http://localhost:9999", 1*time.Second)
	if err := client.Close(); err != nil {
		t.Errorf("Close() devolvió error inesperado: %v", err)
	}
}

// TestHTTPPredictionClient_Predict_RequestBody verifica que el body enviado
// al servidor contiene los campos correctos.
func TestHTTPPredictionClient_Predict_RequestBody(t *testing.T) {
	var receivedBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Capturar el body de la solicitud para verificación
		if err := json.NewDecoder(r.Body).Decode(&receivedBody); err != nil {
			t.Errorf("Error decodificando body: %v", err)
		}
		successHandler(0.5, "MEDIUM", 0.8)(w, r)
	}))
	defer srv.Close()

	client := newTestHTTPClient(t, srv.URL)
	defer client.Close()

	hour := 14
	dow := 3
	_, err := client.Predict(context.Background(), transport.PredictRequest{
		RouteID:           "route-XYZ",
		CurrentPassengers: 25,
		Capacity:          50,
		Hour:              &hour,
		DayOfWeek:         &dow,
	})
	if err != nil {
		t.Fatalf("Predict error: %v", err)
	}

	// Verificar campos del body enviado
	tests := []struct {
		field string
		want  any
	}{
		{"route_id", "route-XYZ"},
		{"current_passengers", float64(25)}, // JSON numbers son float64
		{"capacity", float64(50)},
		{"hour", float64(14)},
		{"day_of_week", float64(3)},
	}

	for _, tt := range tests {
		got, ok := receivedBody[tt.field]
		if !ok {
			t.Errorf("Campo %q ausente en el body enviado", tt.field)
			continue
		}
		if got != tt.want {
			t.Errorf("Campo %q: got %v, want %v", tt.field, got, tt.want)
		}
	}
}
