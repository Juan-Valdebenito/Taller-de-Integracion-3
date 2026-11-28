package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func testStation(id string) StationConfig {
	return StationConfig{
		StationID:       id,
		Sector:          "Sector de prueba",
		Latitude:        -38.74,
		Longitude:       -72.62,
		IntervalSeconds: 10,
	}
}

func TestFetchReadingsMapsOpenMeteoResponses(t *testing.T) {
	validAt := time.Now().Add(-time.Minute).Unix()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("expected GET, got %s", r.Method)
		}
		if r.URL.Query().Get("latitude") != "-38.74" || r.URL.Query().Get("longitude") != "-72.62" {
			t.Errorf("unexpected coordinates: %s", r.URL.RawQuery)
		}
		if r.URL.Query().Get("timeformat") != "unixtime" {
			t.Errorf("expected Unix timestamps, got %s", r.URL.Query().Get("timeformat"))
		}
		if r.URL.Path == "/weather" && r.URL.Query().Get("wind_speed_unit") != "kmh" {
			t.Errorf("expected wind speed in km/h, got %s", r.URL.Query().Get("wind_speed_unit"))
		}

		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/weather":
			if got := r.URL.Query().Get("current"); got != "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation" {
				t.Errorf("unexpected weather variables: %s", got)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"current": map[string]any{
				"time": validAt, "temperature_2m": 14.5, "relative_humidity_2m": 67,
				"wind_speed_10m": 9.2, "precipitation": 3.2,
			}})
		case "/air-quality":
			if got := r.URL.Query().Get("current"); got != "pm2_5,pm10" {
				t.Errorf("unexpected air-quality variables: %s", got)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"current": map[string]any{
				"time": validAt - 60, "pm2_5": 8.3, "pm10": 12.7,
			}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	manager := NewWeatherManager("http://example.test", "key")
	manager.weatherAPIURL = server.URL + "/weather"
	manager.airQualityAPIURL = server.URL + "/air-quality"
	station := testStation("STATION-01")

	reading, err := manager.fetchReadings(station)
	if err != nil {
		t.Fatalf("fetchReadings returned an error: %v", err)
	}
	if reading.StationID != station.StationID || reading.Location.Latitude != station.Latitude || reading.Location.Longitude != station.Longitude {
		t.Fatalf("station identity or location changed: %#v", reading)
	}
	if reading.Readings.TemperatureC != 14.5 || reading.Readings.HumidityPct != 67 || reading.Readings.WindSpeedKMH != 9.2 || reading.Readings.Precipitation != 3.2 || reading.Readings.PM25 != 8.3 || reading.Readings.PM10 != 12.7 {
		t.Fatalf("unexpected mapped readings: %#v", reading.Readings)
	}
	if reading.Timestamp != validAt-60 {
		t.Fatalf("expected the oldest source timestamp %d, got %d", validAt-60, reading.Timestamp)
	}
}

func TestFetchReadingsRejectsNegativePrecipitation(t *testing.T) {
	validAt := time.Now().Add(-time.Minute).Unix()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/weather" {
			_ = json.NewEncoder(w).Encode(map[string]any{"current": map[string]any{
				"time": validAt, "temperature_2m": 14.5, "relative_humidity_2m": 67,
				"wind_speed_10m": 9.2, "precipitation": -0.1,
			}})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"current": map[string]any{
			"time": validAt, "pm2_5": 8.3, "pm10": 12.7,
		}})
	}))
	defer server.Close()

	manager := NewWeatherManager("http://example.test", "key")
	manager.weatherAPIURL = server.URL + "/weather"
	manager.airQualityAPIURL = server.URL + "/air-quality"
	if _, err := manager.fetchReadings(testStation("STATION-01")); err == nil {
		t.Fatal("expected negative precipitation to be rejected")
	}
}

func TestFetchReadingsRejectsProviderHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
	}))
	defer server.Close()

	manager := NewWeatherManager("http://example.test", "key")
	manager.weatherAPIURL = server.URL + "/weather"
	manager.airQualityAPIURL = server.URL + "/air-quality"
	if _, err := manager.fetchReadings(testStation("STATION-01")); err == nil {
		t.Fatal("expected provider HTTP error to be returned")
	}
}

func TestFetchReadingsRejectsIncompleteProviderData(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/weather" {
			_, _ = w.Write([]byte(`{"current":{"time":1794744000,"temperature_2m":14.5,"relative_humidity_2m":67,"wind_speed_10m":9.2}}`))
			return
		}
		_, _ = w.Write([]byte(`{"current":{"time":1794743940,"pm2_5":8.3}}`))
	}))
	defer server.Close()

	manager := NewWeatherManager("http://example.test", "key")
	manager.weatherAPIURL = server.URL + "/weather"
	manager.airQualityAPIURL = server.URL + "/air-quality"
	if _, err := manager.fetchReadings(testStation("STATION-01")); err == nil {
		t.Fatal("expected incomplete air-quality data to be rejected")
	}
}

func TestNewWeatherManagerUsesQuotaAwareDefaults(t *testing.T) {
	manager := NewWeatherManager("http://example.test", "key")
	if manager.refreshInterval != 15*time.Minute {
		t.Fatalf("expected 15-minute provider refresh, got %s", manager.refreshInterval)
	}
	if manager.maxStaleness != time.Hour {
		t.Fatalf("expected one-hour maximum staleness, got %s", manager.maxStaleness)
	}
}

func TestStationReadingCacheHonorsMaximumStaleness(t *testing.T) {
	now := time.Date(2026, time.November, 15, 12, 0, 0, 0, time.UTC)
	payload := WeatherPayload{StationID: "STATION-01"}
	cache := stationReadingCache{}
	if _, ok := cache.readingAt(now, time.Hour); ok {
		t.Fatal("expected an empty cache to be unavailable")
	}

	cache.update(payload, now)
	if got, ok := cache.readingAt(now.Add(time.Hour), time.Hour); !ok || got.StationID != payload.StationID {
		t.Fatal("expected cached data to remain available at the freshness limit")
	}
	if _, ok := cache.readingAt(now.Add(time.Hour+time.Second), time.Hour); ok {
		t.Fatal("expected cached data past the freshness limit to be unavailable")
	}
}
