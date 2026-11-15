package liveoccupancy

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

// trackerWithClock usa un reloj controlado para probar el vencimiento.
func trackerWithClock() (*Tracker, *time.Time) {
	currentTime := time.Date(2026, 11, 12, 8, 0, 0, 0, time.UTC)
	tracker := NewTracker()
	tracker.now = func() time.Time { return currentTime }
	return tracker, &currentTime
}

func TestRecordKeepsLatestReadingPerBus(t *testing.T) {
	tracker, _ := trackerWithClock()
	tracker.Record("bus-7a-01", "route-7A", 10, 40)
	tracker.Record("bus-7a-01", "route-7A", 30, 40)
	readings := tracker.FreshReadings()
	if len(readings) != 1 || readings[0].CurrentPassengers != 30 {
		t.Errorf("debe quedar solo la última lectura: %+v", readings)
	}
}

func TestRecordIgnoresUnusableReadings(t *testing.T) {
	tracker, _ := trackerWithClock()
	tracker.Record("", "route-7A", 10, 40)
	tracker.Record("bus-7a-01", "", 10, 40)
	tracker.Record("bus-7a-02", "route-7A", 10, 0)
	tracker.Record("bus-7a-03", "route-7A", -1, 40)
	if readings := tracker.FreshReadings(); len(readings) != 0 {
		t.Errorf("no debe guardar lecturas sin micro, línea o capacidad: %+v", readings)
	}
}

func TestFreshReadingsForgetStaleBuses(t *testing.T) {
	tracker, currentTime := trackerWithClock()
	tracker.Record("bus-old", "route-7A", 10, 40)
	*currentTime = currentTime.Add(90 * time.Second)
	tracker.Record("bus-new", "route-7B", 20, 40)
	*currentTime = currentTime.Add(time.Minute)

	readings := tracker.FreshReadings()
	if len(readings) != 1 || readings[0].BusID != "bus-new" {
		t.Errorf("la micro sin datos hace 2,5 minutos no debe contar: %+v", readings)
	}
	if _, remembered := tracker.readings["bus-old"]; remembered {
		t.Error("la lectura vencida debe olvidarse")
	}
}

func TestLineOccupancyWeighsBusesByCapacity(t *testing.T) {
	tracker, _ := trackerWithClock()
	tracker.Record("bus-7a-01", "route-7A", 30, 40)
	tracker.Record("bus-7a-02", "route-7A", 6, 20)
	tracker.Record("bus-7b-01", "route-7B", 10, 40)
	occupancy := tracker.LineOccupancy()
	// 7A: (30 + 6) / (40 + 20) = 0,6. Un promedio simple daría (0,75 + 0,3) / 2.
	if len(occupancy) != 2 || occupancy["route-7A"] != 0.6 || occupancy["route-7B"] != 0.25 {
		t.Errorf("ocupación inesperada: %v", occupancy)
	}
}

func TestLineOccupancyIgnoresStaleBuses(t *testing.T) {
	tracker, currentTime := trackerWithClock()
	tracker.Record("bus-7a-01", "route-7A", 40, 40)
	*currentTime = currentTime.Add(3 * time.Minute)
	if occupancy := tracker.LineOccupancy(); len(occupancy) != 0 {
		t.Errorf("sin lecturas recientes no debe haber ocupación: %v", occupancy)
	}
}

// El Hub escribe y los handlers leen al mismo tiempo. Con go test -race, esta
// prueba detecta accesos sin protección.
func TestTrackerSupportsConcurrentAccess(t *testing.T) {
	tracker := NewTracker()
	var workers sync.WaitGroup
	for workerIndex := 0; workerIndex < 8; workerIndex++ {
		workers.Add(2)
		go func(busID string) {
			defer workers.Done()
			for readingIndex := 0; readingIndex < 100; readingIndex++ {
				tracker.Record(busID, "route-7A", readingIndex%40, 40)
			}
		}(fmt.Sprintf("bus-%d", workerIndex))
		go func() {
			defer workers.Done()
			for readIndex := 0; readIndex < 100; readIndex++ {
				tracker.FreshReadings()
			}
		}()
	}
	workers.Wait()
	if readings := tracker.FreshReadings(); len(readings) != 8 {
		t.Errorf("se esperaban 8 micros y hay %d", len(readings))
	}
}
