package currentweather

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	climav1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/clima/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var referenceTime = time.Date(2026, 11, 13, 8, 0, 0, 0, time.UTC)

// fakeClimate reemplaza a clima_service y guarda la ventana de tiempo pedida.
type fakeClimate struct {
	records       []*climav1.TelemetryRecord
	responseError error
	requestedFrom time.Time
	requestedTo   time.Time
}

func (climate *fakeClimate) ListTelemetry(_ context.Context, from, to time.Time, _ string, _ int) (*climav1.ListTelemetryResponse, error) {
	climate.requestedFrom, climate.requestedTo = from, to
	if climate.responseError != nil {
		return nil, climate.responseError
	}
	return &climav1.ListTelemetryResponse{Records: climate.records}, nil
}

func reading(stationID string, minutesAgo int, temperatureC, windSpeedKmh, pm25 float64) *climav1.TelemetryRecord {
	return &climav1.TelemetryRecord{
		StationId:    stationID,
		Time:         timestamppb.New(referenceTime.Add(-time.Duration(minutesAgo) * time.Minute)),
		TemperatureC: temperatureC,
		WindSpeedKmh: windSpeedKmh,
		Pm25UgM3:     pm25,
	}
}

func providerWith(climate *fakeClimate) *Provider {
	provider := NewProvider(climate)
	provider.now = func() time.Time { return referenceTime }
	return provider
}

func TestFetchAveragesLatestReadingOfEachStation(t *testing.T) {
	climate := &fakeClimate{records: []*climav1.TelemetryRecord{
		reading("STATION-A", 10, 20, 50, 100),
		reading("STATION-A", 1, 4, 10, 40),
		reading("STATION-A", 5, 30, 50, 100),
		reading("STATION-B", 2, 6, 20, 60),
	}}
	conditions, err := providerWith(climate).Fetch(context.Background())
	if err != nil || conditions == nil {
		t.Fatalf("se esperaba clima: %+v, %v", conditions, err)
	}
	// Última de A: 4 °C, 10 km/h y 40. Última de B: 6 °C, 20 km/h y 60.
	expected := Conditions{TemperatureC: 5, WindSpeedKmh: 15, PM25: 50}
	if math.Abs(conditions.TemperatureC-expected.TemperatureC) > 1e-9 ||
		math.Abs(conditions.WindSpeedKmh-expected.WindSpeedKmh) > 1e-9 ||
		math.Abs(conditions.PM25-expected.PM25) > 1e-9 {
		t.Errorf("se esperaba %+v y se obtuvo %+v", expected, *conditions)
	}
}

func TestFetchAsksForRecentWindow(t *testing.T) {
	climate := &fakeClimate{}
	if _, err := providerWith(climate).Fetch(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !climate.requestedTo.Equal(referenceTime) || climate.requestedTo.Sub(climate.requestedFrom) != recentWindow {
		t.Errorf("se esperaban los últimos 30 minutos: %v a %v", climate.requestedFrom, climate.requestedTo)
	}
}

func TestFetchWithoutReadingsReturnsNoWeather(t *testing.T) {
	conditions, err := providerWith(&fakeClimate{}).Fetch(context.Background())
	if err != nil || conditions != nil {
		t.Errorf("sin lecturas no debe haber clima: %+v, %v", conditions, err)
	}
}

func TestFetchReportsServiceErrors(t *testing.T) {
	serviceDown := errors.New("clima_service no responde")
	conditions, err := providerWith(&fakeClimate{responseError: serviceDown}).Fetch(context.Background())
	if !errors.Is(err, serviceDown) || conditions != nil {
		t.Errorf("se esperaba el error del servicio: %+v, %v", conditions, err)
	}
}
