package simulation

import (
	"context"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

func TestRoutesHaveCircularSimulationData(t *testing.T) {
	want := map[string]struct {
		name     string
		buses    int
		capacity int
	}{
		"route-7A": {name: "7A", buses: 1, capacity: 45},
		"route-7B": {name: "7B", buses: 1, capacity: 45},
		"route-1C": {name: "1C", buses: 1, capacity: 40},
	}

	if len(Routes) != len(want) {
		t.Fatalf("expected %d routes, got %d", len(want), len(Routes))
	}

	for _, route := range Routes {
		expected, ok := want[route.ID]
		if !ok {
			t.Fatalf("unexpected route %q", route.ID)
		}
		if len(route.Waypoints) < 2 || route.BusCount != expected.buses || route.Capacity != expected.capacity {
			t.Fatalf("invalid definition for %s: %+v", expected.name, route)
		}
	}
}

func TestBusSimulatorPublishesAndWrapsWaypoints(t *testing.T) {
	route := &RouteDefinition{
		ID:        "test-route",
		Capacity:  20,
		Waypoints: []Waypoint{{Lat: 1, Lng: 2}, {Lat: 3, Lng: 4}},
	}
	simulator := NewBusSimulator("test-bus", route, 0, nil, time.Millisecond)
	var updates []ws.BusLocationData
	simulator.publish = func(data ws.BusLocationData) {
		updates = append(updates, data)
	}

	simulator.tick()
	simulator.tick()
	simulator.tick()

	if len(updates) != 3 {
		t.Fatalf("expected 3 updates, got %d", len(updates))
	}
	if updates[0].Latitude != 1 || updates[1].Latitude != 3 || updates[2].Latitude != 1 {
		t.Fatalf("expected circular positions 1, 3, 1; got %.0f, %.0f, %.0f",
			updates[0].Latitude, updates[1].Latitude, updates[2].Latitude)
	}
	if updates[0].RouteID != route.ID || updates[0].BusID != "test-bus" {
		t.Fatalf("update identity mismatch: %+v", updates[0])
	}
}

func TestBusSimulatorRunPublishesPeriodically(t *testing.T) {
	route := &RouteDefinition{
		ID:        "periodic-route",
		Capacity:  20,
		Waypoints: []Waypoint{{Lat: 1, Lng: 2}, {Lat: 3, Lng: 4}},
	}
	simulator := NewBusSimulator("periodic-bus", route, 0, nil, 5*time.Millisecond)
	updates := make(chan ws.BusLocationData, 8)
	simulator.publish = func(data ws.BusLocationData) {
		updates <- data
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	simulator.Run(ctx)

	if len(updates) < 2 {
		t.Fatalf("expected initial and periodic updates, got %d", len(updates))
	}
}

func TestInvalidTickDurationUsesDefault(t *testing.T) {
	runner := NewRunner(nil, RunnerConfig{})
	if runner.config.TickDuration != defaultTickDuration {
		t.Fatalf("expected default tick duration %s, got %s", defaultTickDuration, runner.config.TickDuration)
	}
}

func TestRunnerStopsBeforeDelayedBusStarts(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan struct{})
	go func() {
		hub := ws.NewHub(service.NewOccupancyService())
		NewRunner(hub, RunnerConfig{TickDuration: time.Millisecond}).Start(ctx)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("runner did not stop after context cancellation")
	}
}
