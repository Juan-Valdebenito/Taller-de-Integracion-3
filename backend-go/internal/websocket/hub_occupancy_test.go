package websocket

import (
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

type recordedReading struct {
	busID, routeID              string
	currentPassengers, capacity int
}

// channelRecorder entrega cada lectura por un canal, porque el Hub la registra
// desde su propia goroutine.
type channelRecorder struct{ readings chan recordedReading }

func (recorder channelRecorder) Record(busID, routeID string, currentPassengers, capacity int) {
	recorder.readings <- recordedReading{busID, routeID, currentPassengers, capacity}
}

func TestHubRecordsOccupancyOfPublishedBuses(t *testing.T) {
	hub := NewHub(service.NewOccupancyService())
	recorder := channelRecorder{readings: make(chan recordedReading, 1)}
	hub.SetOccupancyRecorder(recorder)
	go hub.Run()

	hub.PublishInternal(BusLocationData{BusID: "bus-7a-01", RouteID: "route-7A", CurrentPassengers: 30, Capacity: 40})

	select {
	case reading := <-recorder.readings:
		expected := recordedReading{"bus-7a-01", "route-7A", 30, 40}
		if reading != expected {
			t.Errorf("se esperaba %+v y se obtuvo %+v", expected, reading)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("el Hub no registró la micro publicada")
	}
}

func TestHubWorksWithoutOccupancyRecorder(t *testing.T) {
	hub := NewHub(service.NewOccupancyService())
	go hub.Run()
	// Sin registro conectado, publicar no debe fallar.
	hub.PublishInternal(BusLocationData{BusID: "bus-7a-01", RouteID: "route-7A", CurrentPassengers: 30, Capacity: 40})
}
