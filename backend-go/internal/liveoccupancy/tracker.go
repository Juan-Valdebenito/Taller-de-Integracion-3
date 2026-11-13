// Package liveoccupancy recuerda los pasajeros de cada micro en vivo. El Hub del
// WebSocket solo reenvía las posiciones; este registro guarda la última lectura
// de cada micro para calcular cuán llenas van las líneas.
package liveoccupancy

import (
	"sync"
	"time"
)

// defaultMaxReadingAge es cuánto vale una lectura. Una micro que dejó de informar
// hace más tiempo probablemente ya no está en servicio y no debe contar.
const defaultMaxReadingAge = 2 * time.Minute

// BusReading es la última lectura de una micro.
type BusReading struct {
	BusID             string
	RouteID           string
	CurrentPassengers int
	Capacity          int
	UpdatedAt         time.Time
}

// Tracker guarda la última lectura de cada micro. El Hub escribe desde su
// goroutine y los handlers leen desde otras, por eso usa un RWMutex.
type Tracker struct {
	mutex         sync.RWMutex
	readings      map[string]BusReading
	maxReadingAge time.Duration
	now           func() time.Time
}

func NewTracker() *Tracker {
	return &Tracker{
		readings:      make(map[string]BusReading),
		maxReadingAge: defaultMaxReadingAge,
		now:           time.Now,
	}
}

// Record guarda la lectura de una micro y reemplaza la anterior. Ignora las
// lecturas sin micro, sin línea o sin capacidad, porque con ellas no se puede
// calcular una ocupación.
func (tracker *Tracker) Record(busID, routeID string, currentPassengers, capacity int) {
	if busID == "" || routeID == "" || capacity <= 0 || currentPassengers < 0 {
		return
	}
	tracker.mutex.Lock()
	defer tracker.mutex.Unlock()
	tracker.readings[busID] = BusReading{
		BusID:             busID,
		RouteID:           routeID,
		CurrentPassengers: currentPassengers,
		Capacity:          capacity,
		UpdatedAt:         tracker.now(),
	}
}

// FreshReadings entrega las lecturas recientes. De paso olvida las vencidas, así
// el registro no crece con micros que ya no circulan.
func (tracker *Tracker) FreshReadings() []BusReading {
	tracker.mutex.Lock()
	defer tracker.mutex.Unlock()
	oldestAllowed := tracker.now().Add(-tracker.maxReadingAge)
	freshReadings := make([]BusReading, 0, len(tracker.readings))
	for busID, reading := range tracker.readings {
		if reading.UpdatedAt.Before(oldestAllowed) {
			delete(tracker.readings, busID)
			continue
		}
		freshReadings = append(freshReadings, reading)
	}
	return freshReadings
}
