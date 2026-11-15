package handler

import (
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

func emptyRoutesMicro() *fakeUniversityMicro {
	return &fakeUniversityMicro{routesResponse: &microv1.PlanUniversityRoutesResponse{}}
}

// waitForBuses espera a que el Hub registre las micros, porque lo hace desde su
// propia goroutine.
func waitForBuses(t *testing.T, tracker *liveoccupancy.Tracker, expectedBuses int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for len(tracker.FreshReadings()) < expectedBuses {
		if time.Now().After(deadline) {
			t.Fatalf("el Hub no registró las %d micros", expectedBuses)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// Recorre la cadena real de backend-go: las micros se publican en el Hub, el
// registro guarda sus pasajeros y el handler envía la ocupación traducida.
func TestPublishedBusesReachRouteRequest(t *testing.T) {
	tracker := liveoccupancy.NewTracker()
	hub := ws.NewHub(service.NewOccupancyService())
	hub.SetOccupancyRecorder(tracker)
	go hub.Run()

	hub.PublishInternal(ws.BusLocationData{BusID: "bus-sim-7a", RouteID: "route-7A", CurrentPassengers: 30, Capacity: 40})
	hub.PublishInternal(ws.BusLocationData{BusID: "bus-7a-01", RouteID: "route-7a", CurrentPassengers: 6, Capacity: 20})
	hub.PublishInternal(ws.BusLocationData{BusID: "bus-7b-01", RouteID: "route-7B", CurrentPassengers: 10, Capacity: 40})
	waitForBuses(t, tracker, 3)

	fakeMicro := emptyRoutesMicro()
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro).WithLineOccupancy(tracker)
	serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")

	occupancy := fakeMicro.receivedRequest.GetLineOccupancy()
	// 7A: (30 + 6) / (40 + 20) = 0,6, combinando sus dos IDs. 7B: 10 / 40 = 0,25.
	if len(occupancy) != 2 || occupancy["L7A"] != 0.6 || occupancy["L7B"] != 0.25 {
		t.Errorf("ocupación enviada inesperada: %v", occupancy)
	}
}

func TestRouteRequestWithoutOccupancySource(t *testing.T) {
	fakeMicro := emptyRoutesMicro()
	serveUniversityRequestWith(NewGRPCProxyHandler(nil, fakeMicro), "/routes/university?from_stop=PAR-PORTAL-01")
	if fakeMicro.receivedRequest.GetLineOccupancy() != nil {
		t.Errorf("sin fuente no debe enviar ocupación: %v", fakeMicro.receivedRequest.GetLineOccupancy())
	}
}

func TestRouteRequestWithoutLiveBuses(t *testing.T) {
	fakeMicro := emptyRoutesMicro()
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro).WithLineOccupancy(liveoccupancy.NewTracker())
	serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")
	if fakeMicro.receivedRequest.GetLineOccupancy() != nil {
		t.Errorf("sin micros en vivo no debe enviar ocupación: %v", fakeMicro.receivedRequest.GetLineOccupancy())
	}
}

// Las micros de líneas que micro_service no conoce no se envían.
func TestRouteRequestSkipsUnrecognizedLines(t *testing.T) {
	tracker := liveoccupancy.NewTracker()
	tracker.Record("bus-x", "linea-sin-formato", 10, 40)
	fakeMicro := emptyRoutesMicro()
	proxyHandler := NewGRPCProxyHandler(nil, fakeMicro).WithLineOccupancy(tracker)
	serveUniversityRequestWith(proxyHandler, "/routes/university?from_stop=PAR-PORTAL-01")
	if fakeMicro.receivedRequest.GetLineOccupancy() != nil {
		t.Errorf("una línea sin formato conocido no debe enviarse: %v", fakeMicro.receivedRequest.GetLineOccupancy())
	}
}
