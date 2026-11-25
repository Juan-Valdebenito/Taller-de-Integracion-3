package gpsreport

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

type fakeSender struct {
	mutex    sync.Mutex
	requests []*microv1.ReportPositionsRequest
	err      error
}

func (sender *fakeSender) ReportPositions(_ context.Context, request *microv1.ReportPositionsRequest) (*microv1.ReportPositionsResponse, error) {
	sender.mutex.Lock()
	defer sender.mutex.Unlock()
	sender.requests = append(sender.requests, request)
	return &microv1.ReportPositionsResponse{}, sender.err
}

// translateForTest traduce "route-7B" a "L7B", como el handler.
func translateForTest(routeID string) (string, bool) {
	code, hasPrefix := strings.CutPrefix(routeID, "route-")
	return "L" + code, hasPrefix && code != ""
}

func newTestReporter(sender Sender) *Reporter {
	reporter := NewReporter(sender, NewLineResolver(translateForTest, nil))
	reporter.now = func() time.Time { return time.UnixMilli(1_000_000) }
	return reporter
}

// De cada micro se envía solo la última posición, una vez.
func TestReporterSendsLatestPositionOnce(t *testing.T) {
	sender := &fakeSender{}
	reporter := newTestReporter(sender)
	reporter.RecordPosition("bus-1", "route-7B", 1, 2)
	reporter.RecordPosition("bus-1", "route-7B", -38.7, -72.6)
	reporter.send(context.Background())
	reporter.send(context.Background())
	expected := &microv1.ReportPositionsRequest{Positions: []*microv1.BusPosition{
		{BusId: "bus-1", RouteId: "L7B", Latitude: -38.7, Longitude: -72.6, UnixMillis: 1_000_000},
	}}
	if len(sender.requests) != 1 || !proto.Equal(sender.requests[0], expected) {
		t.Fatalf("requests = %v, want only %v", sender.requests, expected)
	}
}

// Las micros simuladas, los datos incompletos y las líneas desconocidas no se envían.
func TestReporterSkipsUselessPositions(t *testing.T) {
	sender := &fakeSender{}
	reporter := newTestReporter(sender)
	reporter.RecordPosition("sim-route-7B-1", "route-7B", 1, 2)
	reporter.RecordPosition("", "route-7B", 1, 2)
	reporter.RecordPosition("bus-1", "", 1, 2)
	reporter.RecordPosition("bus-2", "otra", 1, 2)
	reporter.send(context.Background())
	if len(sender.requests) != 0 {
		t.Fatalf("requests = %v, want none", sender.requests)
	}
}

// Una falla descarta ese envío y no impide los siguientes.
func TestReporterContinuesAfterFailure(t *testing.T) {
	sender := &fakeSender{err: errors.New("unavailable")}
	reporter := newTestReporter(sender)
	reporter.RecordPosition("bus-1", "route-7B", 1, 2)
	reporter.send(context.Background())
	if !reporter.isFailing {
		t.Fatal("the failure was not noticed")
	}
	sender.err = nil
	reporter.RecordPosition("bus-1", "route-7B", 3, 4)
	reporter.send(context.Background())
	if reporter.isFailing || len(sender.requests) != 2 || sender.requests[1].GetPositions()[0].GetLatitude() != 3 {
		t.Fatalf("requests = %v", sender.requests)
	}
}

func TestReporterLimitsPositions(t *testing.T) {
	sender := &fakeSender{}
	reporter := newTestReporter(sender)
	for busIndex := 0; busIndex < maxPositionsPerReport+50; busIndex++ {
		reporter.RecordPosition(fmt.Sprintf("bus-%d", busIndex), "route-7B", 1, 2)
	}
	reporter.RecordPosition("bus-0", "route-7B", 9, 9)
	reporter.send(context.Background())
	if positions := sender.requests[0].GetPositions(); len(positions) != maxPositionsPerReport {
		t.Fatalf("sent %d positions, want %d", len(positions), maxPositionsPerReport)
	}
}

func TestReporterStopsWithContext(t *testing.T) {
	runContext, cancel := context.WithCancel(context.Background())
	finished := make(chan struct{})
	go func() { newTestReporter(&fakeSender{}).Run(runContext); close(finished) }()
	cancel()
	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		t.Fatal("the reporter did not stop")
	}
}

func TestReporterConcurrentUse(t *testing.T) {
	sender := &fakeSender{}
	reporter := newTestReporter(sender)
	var workers sync.WaitGroup
	for busIndex := 0; busIndex < 20; busIndex++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for reading := 0; reading < 50; reading++ {
				reporter.RecordPosition(fmt.Sprintf("bus-%d", busIndex), "route-7B", 1, 2)
			}
		}()
	}
	for sends := 0; sends < 20; sends++ {
		reporter.send(context.Background())
	}
	workers.Wait()
}

// La ruta de la base se traduce con su código y se recuerda, salvo si la base falla.
func TestLineResolverUsesRouteCode(t *testing.T) {
	calls := map[string]int{}
	resolve := NewLineResolver(translateForTest, func(_ context.Context, routeID string) (string, error) {
		calls[routeID]++
		switch routeID {
		case "uuid-7b":
			return "7B", nil
		case "uuid-empty":
			return "", nil
		}
		return "", errors.New("not found")
	})
	for range 3 {
		for routeID, expected := range map[string]string{"route-1C": "L1C", "uuid-7b": "L7B", "uuid-empty": "", "missing": ""} {
			lineID, known := resolve(context.Background(), routeID)
			if known != (expected != "") || (known && lineID != expected) {
				t.Fatalf("%s = %q, %v; want %q", routeID, lineID, known, expected)
			}
		}
	}
	if calls["uuid-7b"] != 1 || calls["uuid-empty"] != 1 || calls["missing"] != 3 || calls["route-1C"] != 0 {
		t.Fatalf("calls = %v", calls)
	}
}
