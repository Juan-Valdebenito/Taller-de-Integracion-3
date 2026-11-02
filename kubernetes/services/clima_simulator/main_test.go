package main

import (
	"reflect"
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

func TestGenerateReadingsIsDeterministic(t *testing.T) {
	manager := NewWeatherManager("http://example.test", "key")
	station := testStation("STATION-01")
	now := time.Date(2026, time.July, 15, 22, 30, 0, 0, time.UTC)

	first := manager.generateReadingsAt(station, now)
	second := manager.generateReadingsAt(station, now)

	if !reflect.DeepEqual(first, second) {
		t.Fatalf("expected equal readings for the same station and time: %#v != %#v", first, second)
	}
}

func TestGenerateReadingsFollowsDailyPattern(t *testing.T) {
	manager := NewWeatherManager("http://example.test", "key")
	station := testStation("STATION-01")

	day := manager.generateReadingsAt(station, time.Date(2026, time.July, 15, 14, 0, 0, 0, time.UTC))
	night := manager.generateReadingsAt(station, time.Date(2026, time.July, 15, 23, 0, 0, 0, time.UTC))

	if day.Readings.TemperatureC <= night.Readings.TemperatureC {
		t.Errorf("expected daytime temperature to exceed nighttime temperature: day=%.2f night=%.2f", day.Readings.TemperatureC, night.Readings.TemperatureC)
	}
	if night.Readings.PM25 <= day.Readings.PM25 {
		t.Errorf("expected nighttime PM2.5 to exceed daytime PM2.5: day=%.2f night=%.2f", day.Readings.PM25, night.Readings.PM25)
	}
}

func TestGenerateReadingsKeepsValuesInContractRange(t *testing.T) {
	manager := NewWeatherManager("http://example.test", "key")
	station := testStation("STATION-01")

	for hour := 0; hour < 24; hour++ {
		reading := manager.generateReadingsAt(station, time.Date(2026, time.July, 15, hour, 0, 0, 0, time.UTC)).Readings
		if reading.HumidityPct < 0 || reading.HumidityPct > 100 {
			t.Errorf("hour %d: humidity out of range: %.2f", hour, reading.HumidityPct)
		}
		if reading.WindSpeedKMH < 0 || reading.PM25 < 0 || reading.PM10 < 0 {
			t.Errorf("hour %d: negative sensor value: %#v", hour, reading)
		}
	}
}

func TestStationsHaveStableProfiles(t *testing.T) {
	manager := NewWeatherManager("http://example.test", "key")
	now := time.Date(2026, time.July, 15, 12, 0, 0, 0, time.UTC)

	first := manager.generateReadingsAt(testStation("STATION-01"), now)
	second := manager.generateReadingsAt(testStation("STATION-02"), now)

	if reflect.DeepEqual(first.Readings, second.Readings) {
		t.Fatal("expected different station profiles at the same time")
	}
}
