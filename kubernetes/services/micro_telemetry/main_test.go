package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeStore struct {
	gps        []GPSReading
	passengers []PassengerReading
	snapshot   TelemetrySnapshot
	err        error
}

func (f *fakeStore) SaveGPS(_ context.Context, reading GPSReading) (TelemetrySnapshot, error) {
	if f.err != nil {
		return TelemetrySnapshot{}, f.err
	}
	f.gps = append(f.gps, reading)
	return f.snapshotFor(reading.BusID), nil
}

func (f *fakeStore) SavePassengers(_ context.Context, reading PassengerReading) (TelemetrySnapshot, error) {
	if f.err != nil {
		return TelemetrySnapshot{}, f.err
	}
	f.passengers = append(f.passengers, reading)
	return f.snapshotFor(reading.BusID), nil
}

func (f *fakeStore) snapshotFor(busID string) TelemetrySnapshot {
	snapshot := f.snapshot
	snapshot.BusID = busID
	return snapshot
}

func (f *fakeStore) Ping(context.Context) error { return f.err }

type fakePublisher struct {
	snapshots []TelemetrySnapshot
	err       error
}

func (f *fakePublisher) Publish(snapshot TelemetrySnapshot) error {
	f.snapshots = append(f.snapshots, snapshot)
	return f.err
}

func validGPS() GPSReading {
	return GPSReading{EventID: "gps-event-1", BusID: "B-7B-01", RouteID: "7B", Latitude: -38.7397, Longitude: -72.5984, SpeedKMH: 25, Timestamp: time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)}
}

func validPassengers() PassengerReading {
	return PassengerReading{EventID: "passenger-event-1", BusID: "B-7B-01", RouteID: "7B", CurrentPassengers: 18, Capacity: 35, Boardings: 2, Alightings: 1, Timestamp: time.Date(2026, 10, 3, 12, 0, 1, 0, time.UTC)}
}

func newRequest(t *testing.T, method, path string, value interface{}) *http.Request {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	request := httptest.NewRequest(method, path, strings.NewReader(string(body)))
	request.Header.Set("X-API-Key", "test-key")
	request.Header.Set("Content-Type", "application/json")
	return request
}

func testServer(store *fakeStore, publisher *fakePublisher) *Server {
	return &Server{apiKey: "test-key", store: store, publisher: publisher, maxBody: 1024 * 1024, now: func() time.Time { return time.Date(2026, 10, 3, 12, 1, 0, 0, time.UTC) }}
}

func TestGPSTelemetryPersistsAndPublishesSnapshot(t *testing.T) {
	store := &fakeStore{}
	publisher := &fakePublisher{}
	server := testServer(store, publisher)
	response := httptest.NewRecorder()
	server.gpsTelemetry(response, newRequest(t, http.MethodPost, "/telemetry/gps", validGPS()))

	if response.Code != http.StatusAccepted {
		t.Fatalf("expected %d, got %d", http.StatusAccepted, response.Code)
	}
	if len(store.gps) != 1 || len(publisher.snapshots) != 1 {
		t.Fatalf("expected one store and publish call")
	}
	if publisher.snapshots[0].BusID != "B-7B-01" {
		t.Fatalf("unexpected snapshot: %#v", publisher.snapshots[0])
	}
}

func TestPassengerTelemetryUsesSeparateEndpoint(t *testing.T) {
	store := &fakeStore{}
	publisher := &fakePublisher{}
	server := testServer(store, publisher)
	response := httptest.NewRecorder()
	server.passengerTelemetry(response, newRequest(t, http.MethodPost, "/telemetry/passengers", validPassengers()))

	if response.Code != http.StatusAccepted {
		t.Fatalf("expected %d, got %d", http.StatusAccepted, response.Code)
	}
	if len(store.passengers) != 1 || publisher.snapshots[0].BusID != "B-7B-01" {
		t.Fatalf("passenger reading was not handled")
	}
}

func TestTelemetryDoesNotPublishWhenStoreFails(t *testing.T) {
	store := &fakeStore{err: errors.New("database unavailable")}
	publisher := &fakePublisher{}
	server := testServer(store, publisher)
	response := httptest.NewRecorder()
	server.gpsTelemetry(response, newRequest(t, http.MethodPost, "/telemetry/gps", validGPS()))

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected %d, got %d", http.StatusServiceUnavailable, response.Code)
	}
	if len(publisher.snapshots) != 0 {
		t.Fatal("publisher should not be called when storage fails")
	}
}

func TestTelemetryReturnsErrorWhenNATSFails(t *testing.T) {
	store := &fakeStore{}
	publisher := &fakePublisher{err: errors.New("nats unavailable")}
	server := testServer(store, publisher)
	response := httptest.NewRecorder()
	server.gpsTelemetry(response, newRequest(t, http.MethodPost, "/telemetry/gps", validGPS()))

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected %d, got %d", http.StatusServiceUnavailable, response.Code)
	}
}

func TestPassengerValidation(t *testing.T) {
	reading := validPassengers()
	reading.CurrentPassengers = reading.Capacity + 1
	if err := validatePassengers(reading, time.Now()); err == nil {
		t.Fatal("expected passenger capacity validation error")
	}
}

func TestTelemetryRequiresAPIKey(t *testing.T) {
	server := testServer(&fakeStore{}, &fakePublisher{})
	request := newRequest(t, http.MethodPost, "/telemetry/gps", validGPS())
	request.Header.Del("X-API-Key")
	response := httptest.NewRecorder()
	server.gpsTelemetry(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, response.Code)
	}
}
