package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/occupancyforecast"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
)

// fakeOccupancyModel responde como services/prediction_service y guarda lo recibido.
func fakeOccupancyModel(t *testing.T) (string, func() []map[string]any) {
	var mutex sync.Mutex
	var received []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var body map[string]any
		if request.URL.Path != "/predict" || json.NewDecoder(request.Body).Decode(&body) != nil {
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		mutex.Lock()
		received = append(received, body)
		mutex.Unlock()
		_ = json.NewEncoder(writer).Encode(map[string]any{"predicted_ratio": 0.95, "occupancy_level": "FULL", "confidence": 0.9})
	}))
	t.Cleanup(server.Close)
	return server.URL, func() []map[string]any {
		mutex.Lock()
		defer mutex.Unlock()
		return received
	}
}

// La ocupación que llega a micro_service es la que predijo el modelo por HTTP, con
// la línea traducida. Con PREDICTION_TEST_URL se usa el modelo real:
//
//	cd kubernetes/services/prediction_service && python server.py
//	PREDICTION_TEST_URL=http://127.0.0.1:8000 go test ./internal/handler -run Forecast
func TestOccupancyForecastChain(t *testing.T) {
	modelURL, receivedByModel := os.Getenv("PREDICTION_TEST_URL"), func() []map[string]any { return nil }
	if modelURL == "" {
		modelURL, receivedByModel = fakeOccupancyModel(t)
	}
	client, err := transport.NewHTTPPredictionClient(modelURL, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	tracker := liveoccupancy.NewTracker()
	tracker.Record("bus-7b", "route-7B", 10, 40)
	forecaster := occupancyforecast.New(tracker, service.NewMLRemotePredictor(client, 2*time.Second), MicroLineID)
	forecaster.Refresh()

	request := sentRecommendationRequest(t, func(proxyHandler *GRPCProxyHandler) {
		proxyHandler.WithLineOccupancy(forecaster)
	}, "origin_stop=PAR-CSF-01&destination_stop=PAR-DPORT-01")
	predicted, sent := request.GetLineOccupancy()["L7B"]
	if !sent || predicted == 0.25 || !(predicted >= 0 && predicted <= 1.5) {
		t.Fatalf("L7B = %v, %v; want a prediction instead of the current 0.25", predicted, sent)
	}
	if received := receivedByModel(); received != nil {
		if len(received) != 1 || received[0]["route_id"] != "L7B" || received[0]["current_passengers"] != 10.0 || received[0]["capacity"] != 40.0 {
			t.Fatalf("the model received %v", received)
		}
		if predicted != 0.95 {
			t.Fatalf("L7B = %v, want 0.95", predicted)
		}
	}
	t.Logf("L7B: current 0.25, predicted %v", predicted)
}
