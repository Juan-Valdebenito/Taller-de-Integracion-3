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
		if len(route.Nodes) != 7 || len(route.Segments) == 0 {
			t.Fatalf("route %s is missing seeded graph data", route.ID)
		}
	}
}

func TestBusSimulatorPublishesAndWrapsWaypoints(t *testing.T) {
	route := &RouteDefinition{
		ID:        "test-route",
		Capacity:  20,
		Waypoints: []Waypoint{{Lat: 1, Lng: 2}, {Lat: 3, Lng: 4}},
	}
	route.SegmentTravelSeconds = []int{10, 10}
	simulator := NewBusSimulator("test-bus", route, 0, nil, time.Second)
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
	if updates[0].Latitude != 1 || updates[1].Latitude != 1.2 || updates[2].Latitude != 1.4 {
		t.Fatalf("expected interpolated positions 1, 1.2, 1.4; got %.2f, %.2f, %.2f",
			updates[0].Latitude, updates[1].Latitude, updates[2].Latitude)
	}
	if updates[0].RouteID != route.ID || updates[0].BusID != "test-bus" {
		t.Fatalf("update identity mismatch: %+v", updates[0])
	}
}

func TestBusSimulatorUsesConfiguredSegmentDuration(t *testing.T) {
	route := &RouteDefinition{
		ID:                   "timed-route",
		Capacity:             20,
		Waypoints:            []Waypoint{{Lat: 0, Lng: 0}, {Lat: 0, Lng: 1}},
		SegmentTravelSeconds: []int{100, 100},
	}
	simulator := NewBusSimulator("timed-bus", route, 0, nil, 10*time.Second)
	if got := simulator.segmentDurationSeconds(0); got != 100 {
		t.Fatalf("expected configured segment duration 100s, got %.0fs", got)
	}
	if got := simulator.segmentDurationSeconds(1); got != 100 {
		t.Fatalf("expected configured return duration 100s, got %.0fs", got)
	}
}

func TestBusSimulatorUsesGraphSegmentDuration(t *testing.T) {
	route := &RouteDefinition{
		ID:        "graph-route",
		Capacity:  20,
		Waypoints: []Waypoint{{Lat: 0, Lng: 0}, {Lat: 0, Lng: 1}},
		Segments: []RouteSegment{
			{FromStopID: "A", ToStopID: "B", TravelSeconds: 37, DistanceMeters: 1000},
			{FromStopID: "B", ToStopID: "A", TravelSeconds: 41, DistanceMeters: 1000},
		},
	}
	simulator := NewBusSimulator("graph-bus", route, 0, nil, time.Second)
	if got := simulator.segmentDurationSeconds(0); got != 37 {
		t.Fatalf("expected graph segment duration 37s, got %.0fs", got)
	}
	if got := simulator.segmentDurationSeconds(1); got != 41 {
		t.Fatalf("expected graph return duration 41s, got %.0fs", got)
	}
}

func TestBusSimulatorPublishesPassengerFlowAfterStop(t *testing.T) {
	route := &RouteDefinition{
		ID:                   "flow-route",
		Capacity:             20,
		Waypoints:            []Waypoint{{Lat: 0, Lng: 0}, {Lat: 0, Lng: 1}},
		SegmentTravelSeconds: []int{1, 1},
	}
	simulator := NewBusSimulator("flow-bus", route, 0, nil, time.Second)
	simulator.passengerFlow = service.NewPassengerFlowService()
	updates := make([]ws.BusLocationData, 0, 3)
	simulator.publish = func(data ws.BusLocationData) {
		updates = append(updates, data)
	}

	simulator.tick()
	simulator.tick()
	simulator.tick()

	if len(updates) != 3 {
		t.Fatalf("expected 3 updates, got %d", len(updates))
	}
	if updates[2].Boardings == 0 || updates[2].Alightings == 0 {
		t.Fatalf("expected passenger flow after stop, got %+v", updates[2])
	}
	if updates[2].TotalBoardings < updates[2].Boardings || updates[2].TotalAlightings < updates[2].Alightings {
		t.Fatalf("expected accumulated totals to include the latest event, got %+v", updates[2])
	}
}

func TestBusSimulatorProfilesPartialGraphAcrossDetailedWaypoints(t *testing.T) {
	route := &RouteDefinition{
		ID:        "profile-route",
		Capacity:  20,
		Waypoints: []Waypoint{{Lat: 0, Lng: 0}, {Lat: 0, Lng: 1}, {Lat: 0, Lng: 3}},
		Segments: []RouteSegment{
			{TravelSeconds: 60},
			{TravelSeconds: 60},
		},
	}
	simulator := NewBusSimulator("profile-bus", route, 0, nil, time.Second)
	first := simulator.segmentDurationSeconds(0)
	second := simulator.segmentDurationSeconds(1)
	if first <= 0 || second <= 0 || first == second {
		t.Fatalf("expected distance-weighted durations, got %.2fs and %.2fs", first, second)
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
