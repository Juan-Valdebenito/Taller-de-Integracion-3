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

type fakeTelemetryRepository struct {
	inserted []WeatherPayload
	err      error
}

func (f *fakeTelemetryRepository) Insert(_ context.Context, payloads []WeatherPayload) error {
	f.inserted = append(f.inserted, payloads...)
	return f.err
}

type fakeTelemetryPublisher struct {
	published []WeatherPayload
	err       error
}

func (f *fakeTelemetryPublisher) Publish(payload WeatherPayload) error {
	f.published = append(f.published, payload)
	return f.err
}

func validWeatherPayload(stationID string) WeatherPayload {
	return WeatherPayload{
		StationID: stationID,
		Location: Location{
			Latitude:  -38.7397,
			Longitude: -72.5984,
			Sector:    "Centro",
		},
		Readings: SensorReadings{
			TemperatureC: 12,
			HumidityPct:  70,
			WindSpeedKMH: 8,
			PM25:         15,
			PM10:         25,
		},
		Status:    "OPERATIONAL",
		Timestamp: time.Now().Unix(),
	}
}

func newTelemetryRequest(t *testing.T, payload string) *http.Request {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/telemetry/weather", strings.NewReader(payload))
	request.Header.Set("X-API-Key", "test-key")
	request.Header.Set("Content-Type", "application/json")
	return request
}

func TestWeatherTelemetryPersistsAndPublishesEachPayload(t *testing.T) {
	repository := &fakeTelemetryRepository{}
	publisher := &fakeTelemetryPublisher{}
	server := &Server{
		apiKey:     "test-key",
		repository: repository,
		publisher:  publisher,
		maxBody:    1024 * 1024,
	}
	payload := validWeatherPayload("station-1")
	secondPayload := validWeatherPayload("station-2")
	batchData, err := json.Marshal([]WeatherPayload{payload, secondPayload})
	if err != nil {
		t.Fatalf("failed to marshal batch: %v", err)
	}

	response := httptest.NewRecorder()
	server.weatherTelemetry(response, newTelemetryRequest(t, string(batchData)))

	if response.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, response.Code)
	}
	if len(repository.inserted) != 2 || len(publisher.published) != 2 {
		t.Fatalf("expected two persisted and published payloads, got %d and %d", len(repository.inserted), len(publisher.published))
	}
	if publisher.published[0].StationID != "station-1" || publisher.published[1].StationID != "station-2" {
		t.Fatalf("published payloads do not preserve batch order: %#v", publisher.published)
	}
}

func TestWeatherTelemetryDoesNotPublishWhenPersistenceFails(t *testing.T) {
	repository := &fakeTelemetryRepository{err: errors.New("database unavailable")}
	publisher := &fakeTelemetryPublisher{}
	server := &Server{apiKey: "test-key", repository: repository, publisher: publisher, maxBody: 1024}
	payload := validWeatherPayload("station-1")

	response := httptest.NewRecorder()
	server.weatherTelemetry(response, newTelemetryRequest(t, mustMarshalPayload(t, payload)))

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status %d, got %d", http.StatusServiceUnavailable, response.Code)
	}
	if len(publisher.published) != 0 {
		t.Fatalf("expected no published payloads, got %d", len(publisher.published))
	}
}

func TestWeatherTelemetryReturnsErrorWhenPublishingFails(t *testing.T) {
	repository := &fakeTelemetryRepository{}
	publisher := &fakeTelemetryPublisher{err: errors.New("nats unavailable")}
	server := &Server{apiKey: "test-key", repository: repository, publisher: publisher, maxBody: 1024}
	payload := validWeatherPayload("station-1")

	response := httptest.NewRecorder()
	server.weatherTelemetry(response, newTelemetryRequest(t, mustMarshalPayload(t, payload)))

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status %d, got %d", http.StatusServiceUnavailable, response.Code)
	}
	if len(repository.inserted) != 1 || len(publisher.published) != 1 {
		t.Fatalf("expected persistence and one publish attempt, got %d and %d", len(repository.inserted), len(publisher.published))
	}
}

func mustMarshalPayload(t *testing.T, payload WeatherPayload) string {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}
	return string(data)
}
