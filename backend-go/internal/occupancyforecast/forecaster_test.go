package occupancyforecast

import (
	"errors"
	"math"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
)

type fakePredictor struct {
	mutex  sync.Mutex
	inputs []service.OccupancyInput
	ratios map[string]float64
	err    error
}

func (predictor *fakePredictor) Predict(input service.OccupancyInput) (service.OccupancyResult, error) {
	predictor.mutex.Lock()
	defer predictor.mutex.Unlock()
	predictor.inputs = append(predictor.inputs, input)
	return service.OccupancyResult{PredictedRatio: predictor.ratios[input.RouteID]}, predictor.err
}

// lineForTest traduce "route-7B" a "L7B", como el handler.
func lineForTest(routeID string) (string, bool) {
	code, hasPrefix := strings.CutPrefix(routeID, "route-")
	return "L" + strings.ToUpper(code), hasPrefix && code != ""
}

// Lunes 30 de noviembre a las 21:00 UTC: en Chile son las 18:00.
var mondayEvening = time.Date(2026, 11, 30, 21, 0, 0, 0, time.UTC)

func newTestForecaster(predictor *fakePredictor) (*Forecaster, *liveoccupancy.Tracker, *time.Time) {
	tracker := liveoccupancy.NewTracker()
	tracker.Record("bus-7b-1", "route-7B", 30, 40)
	tracker.Record("bus-7b-2", "route-7b", 10, 20)
	tracker.Record("bus-1c", "route-1C", 8, 40)
	tracker.Record("bus-otra", "otra", 40, 40)
	now := mondayEvening
	forecaster := New(tracker, predictor, lineForTest)
	forecaster.now = func() time.Time { return now }
	return forecaster, tracker, &now
}

// Cada línea se consulta una vez, con sus micros sumadas y la hora de Chile.
func TestRefreshAsksEachLineOnce(t *testing.T) {
	predictor := &fakePredictor{ratios: map[string]float64{"L7B": 0.9, "L1C": 0.4}}
	forecaster, _, _ := newTestForecaster(predictor)
	forecaster.Refresh()
	if len(predictor.inputs) != 2 {
		t.Fatalf("asked %d times, want 2", len(predictor.inputs))
	}
	for _, input := range predictor.inputs {
		if *input.Hour != 18 || *input.DayOfWeek != 1 {
			t.Errorf("%s at hour %d day %d, want 18 and 1", input.RouteID, *input.Hour, *input.DayOfWeek)
		}
		if input.RouteID == "L7B" && (input.CurrentPassengers != 40 || input.Capacity != 60) {
			t.Errorf("L7B = %d of %d, want 40 of 60", input.CurrentPassengers, input.Capacity)
		}
	}
}

// La predicción reemplaza a la ocupación actual. Sin predicción, se usa la actual.
func TestPredictionReplacesCurrentOccupancy(t *testing.T) {
	predictor := &fakePredictor{ratios: map[string]float64{"L7B": 0.9}, err: nil}
	forecaster, _, _ := newTestForecaster(predictor)
	if occupancy := forecaster.LineOccupancyBy(lineForTest); math.Abs(occupancy["L7B"]-40.0/60) > 1e-9 {
		t.Fatalf("before refreshing L7B = %v, want the current 0.67", occupancy["L7B"])
	}
	forecaster.Refresh()
	occupancy := forecaster.LineOccupancyBy(lineForTest)
	if occupancy["L7B"] != 0.9 || occupancy["L1C"] != 0 || len(occupancy) != 2 {
		t.Fatalf("occupancy = %v, want L7B 0.9 and L1C as predicted", occupancy)
	}
}

// Si el modelo falla, se conserva lo anterior hasta que vence.
func TestFailingModelFallsBackToCurrentOccupancy(t *testing.T) {
	predictor := &fakePredictor{ratios: map[string]float64{"L7B": 0.9, "L1C": 0.5}}
	forecaster, tracker, now := newTestForecaster(predictor)
	forecaster.Refresh()
	predictor.err = errors.New("unavailable")
	*now = now.Add(time.Minute)
	refreshLive(tracker)
	forecaster.Refresh()
	if !forecaster.isFailing || forecaster.LineOccupancyBy(lineForTest)["L7B"] != 0.9 {
		t.Fatal("a recent prediction was dropped")
	}
	*now = now.Add(maxForecastAge)
	refreshLive(tracker)
	forecaster.Refresh()
	if occupancy := forecaster.LineOccupancyBy(lineForTest); occupancy["L1C"] != 0.2 {
		t.Fatalf("occupancy = %v, want the current 0.2 for L1C", occupancy)
	}
}

// Una predicción imposible no se usa.
func TestImpossiblePredictionsAreIgnored(t *testing.T) {
	for _, ratio := range []float64{-0.1, 2.5, math.NaN()} {
		forecaster, _, _ := newTestForecaster(&fakePredictor{ratios: map[string]float64{"L1C": ratio}})
		forecaster.Refresh()
		if occupancy := forecaster.LineOccupancyBy(lineForTest)["L1C"]; occupancy != 0.2 {
			t.Errorf("with %v, L1C = %v; want the current 0.2", ratio, occupancy)
		}
	}
}

func TestConcurrentUse(t *testing.T) {
	forecaster, _, _ := newTestForecaster(&fakePredictor{ratios: map[string]float64{"L7B": 0.9}})
	var workers sync.WaitGroup
	for range 8 {
		workers.Add(2)
		go func() { defer workers.Done(); forecaster.Refresh() }()
		go func() { defer workers.Done(); forecaster.LineOccupancyBy(lineForTest) }()
	}
	workers.Wait()
}

// refreshLive vuelve a informar las micros, como harían en vivo, para que el
// tracker no las olvide mientras avanza el reloj de la prueba.
func refreshLive(tracker *liveoccupancy.Tracker) {
	tracker.Record("bus-7b-1", "route-7B", 30, 40)
	tracker.Record("bus-7b-2", "route-7b", 10, 20)
	tracker.Record("bus-1c", "route-1C", 8, 40)
}
