package telemetry

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestSendGPS(t *testing.T) {
	var mu sync.Mutex
	var got []map[string]any
	var keys []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		got = append(got, body)
		keys = append(keys, r.Header.Get("X-API-Key"))
		mu.Unlock()
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	reading := GPSReading{EventID: "gps-bus-1-1", BusID: "bus-1", RouteID: "7B", Latitude: -38.7, Longitude: -72.6, Heading: 90, SpeedKMH: 25, Timestamp: time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)}
	if err := NewClient(srv.URL, "clave-secreta").SendGPS(context.Background(), reading); err != nil {
		t.Fatal(err)
	}
	// Mismos nombres de campo que espera micro_telemetry (snake_case).
	if len(got) != 1 || got[0]["event_id"] != "gps-bus-1-1" || got[0]["bus_id"] != "bus-1" || got[0]["route_id"] != "7B" || got[0]["speed_kmh"] != 25.0 || got[0]["timestamp"] != "2026-11-01T12:00:00Z" {
		t.Errorf("cuerpo = %v", got)
	}
	if keys[0] != "clave-secreta" {
		t.Errorf("X-API-Key = %q", keys[0])
	}

	// El Forwarder envía en segundo plano.
	f := NewForwarder(NewClient(srv.URL, "clave-secreta"))
	f.Forward(reading)
	f.Wait()
	if len(got) != 2 {
		t.Errorf("el Forwarder no envió: %d", len(got))
	}
	var nilForwarder *Forwarder
	nilForwarder.Forward(reading) // sin micro_telemetry configurado: no hace nada
}

func TestSendGPSErrors(t *testing.T) {
	unauthorized := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer unauthorized.Close()
	if err := NewClient(unauthorized.URL, "mala").SendGPS(context.Background(), GPSReading{BusID: "b"}); err == nil {
		t.Error("un 401 debía ser error")
	}
	if err := NewClient("http://127.0.0.1:1/no-existe", "").SendGPS(context.Background(), GPSReading{BusID: "b"}); err == nil {
		t.Error("sin servidor debía ser error")
	}
}
