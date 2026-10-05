package service

import (
	"sync"
	"testing"
)

func TestPassengerFlowServiceProcessesAndRegistersStop(t *testing.T) {
	svc := NewPassengerFlowService()

	result := svc.ProcessStop(PassengerFlowInput{
		BusID:             "sim-route-7A-1",
		RouteID:           "route-7A",
		StopIndex:         4,
		CurrentPassengers: 20,
		Capacity:          45,
	})

	if result.Alightings == 0 || result.Boardings == 0 {
		t.Fatalf("expected both alightings and boardings, got %+v", result)
	}
	if result.CurrentPassengers < 0 || result.CurrentPassengers > 45 {
		t.Fatalf("passenger count out of bounds: %d", result.CurrentPassengers)
	}
	if result.TotalBoardings != result.Boardings || result.TotalAlightings != result.Alightings {
		t.Fatalf("first event was not registered: %+v", result)
	}

	snapshot := svc.Snapshot("sim-route-7A-1")
	if snapshot.TotalBoardings != result.Boardings || snapshot.TotalAlightings != result.Alightings {
		t.Fatalf("snapshot mismatch: %+v", snapshot)
	}
}

func TestPassengerFlowServiceNeverExceedsCapacity(t *testing.T) {
	svc := NewPassengerFlowService()
	result := svc.ProcessStop(PassengerFlowInput{
		BusID:             "full-bus",
		RouteID:           "route-7B",
		StopIndex:         1,
		CurrentPassengers: 100,
		Capacity:          10,
	})

	if result.CurrentPassengers > 10 || result.CurrentPassengers < 0 {
		t.Fatalf("passenger count out of bounds: %d", result.CurrentPassengers)
	}
	if result.RejectedBoardings == 0 {
		t.Fatal("expected excess demand to be registered as rejected boardings")
	}
}

func TestPassengerFlowServiceIsSafeForConcurrentBuses(t *testing.T) {
	svc := NewPassengerFlowService()
	var wait sync.WaitGroup
	for busIndex := 0; busIndex < 3; busIndex++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			for stopIndex := 0; stopIndex < 20; stopIndex++ {
				svc.ProcessStop(PassengerFlowInput{
					BusID:             string(rune('A' + index)),
					RouteID:           "route-1C",
					StopIndex:         stopIndex,
					CurrentPassengers: 15,
					Capacity:          40,
				})
			}
		}(busIndex)
	}
	wait.Wait()

	for busIndex := 0; busIndex < 3; busIndex++ {
		if snapshot := svc.Snapshot(string(rune('A' + busIndex))); snapshot.TotalBoardings == 0 {
			t.Fatalf("bus %d has no registered boardings", busIndex)
		}
	}
}
