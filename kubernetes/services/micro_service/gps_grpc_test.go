package main

import (
	"context"
	"math"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

func gpsServer(graph *TransitGraph) *microGRPCServer {
	server := recommendationServerWith(graph)
	server.service.gpsTimes = NewGPSTimes()
	return server
}

func reportedAt(graph *TransitGraph, busID, routeID, stopID string, at time.Time) *microv1.BusPosition {
	stop := graph.Stops[stopID]
	return &microv1.BusPosition{BusId: busID, RouteId: routeID, Latitude: stop.Latitude, Longitude: stop.Longitude, UnixMillis: at.UnixMilli()}
}

// Las posiciones buenas se usan aunque otras de la misma petición no sirvan.
func TestReportPositionsCountsAccepted(t *testing.T) {
	graph, now := gpsLineGraph(), time.Now()
	position := func(busID string, at time.Time) *microv1.BusPosition { return reportedAt(graph, busID, "L1", "A", at) }
	unknownLine, notNumber := position("unknown", now), position("nan", now)
	unknownLine.RouteId, notNumber.Latitude = "L99", math.NaN()
	response, err := gpsServer(graph).ReportPositions(context.Background(), &microv1.ReportPositionsRequest{Positions: []*microv1.BusPosition{
		position("good", now), position("slow clock", now.Add(-4*time.Minute)), position("fast clock", now.Add(30*time.Second)),
		position("too old", now.Add(-6*time.Minute)), position("future", now.Add(2*time.Minute)), position("", now), unknownLine, notNumber, nil,
	}})
	if err != nil || response.GetAccepted() != 3 {
		t.Fatalf("accepted = %d, err = %v; want 3", response.GetAccepted(), err)
	}
}

func TestReportPositionsErrors(t *testing.T) {
	ctx, tooMany := context.Background(), &microv1.ReportPositionsRequest{Positions: make([]*microv1.BusPosition, maxReportedPositions+1)}
	if _, err := gpsServer(gpsLineGraph()).ReportPositions(ctx, tooMany); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("too many: %v", err)
	}
	if _, err := gpsServer(nil).ReportPositions(ctx, &microv1.ReportPositionsRequest{}); status.Code(err) != codes.Unavailable {
		t.Fatalf("without graph: %v", err)
	}
	client := startUniversityGRPCClient(t, gpsLineGraph())
	requestContext, cancel := context.WithTimeout(ctx, testRequestDuration)
	defer cancel()
	_, err := client.ReportPositions(requestContext, &microv1.ReportPositionsRequest{})
	assertGRPCCode(t, err, codes.Unauthenticated)
}

// Con la 7B muy lenta, la recomendación informa el tiempo observado y la nueva
// espera, y la explicación los usa. Sin GPS, la respuesta es la de siempre.
func TestRecommendRoutesUseObservedTimes(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	server := gpsServer(graph)
	request := &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-CSF-01"), Destination: stopMessage("PAR-DPORT-01"), Limit: 1}
	without, err := server.RecommendRoutes(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	expectedWithout, _ := answerRecommendRoutes(graph, request)
	if !proto.Equal(without, expectedWithout) {
		t.Fatal("without GPS the answer changed")
	}

	now := time.Now()
	for _, routeID := range []string{"L7A", "L7B", "L1C"} {
		key := segmentKey{routeID, "PAR-CSF-01", "PAR-DPORT-01"}
		server.service.gpsTimes.segments[key] = []observation{{seconds: 900, at: now}}
		server.service.gpsTimes.headways[routeID] = []observation{{seconds: 120, at: now}}
	}
	with, err := server.RecommendRoutes(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	// Tramo: (300 × 2 + 900) / 3 = 500 s. Intervalo: (600 × 2 + 120) / 3 = 440 s, así
	// que la espera es 220 s y cuesta 440.
	route := with.GetRoutes()[0]
	if route.GetTotalTimeSeconds() != 500 || route.GetCost().GetRide() != 500 || route.GetCost().GetWait() != 440 {
		t.Fatalf("route = %v, want 500 s and a wait cost of 440", route)
	}
	if without.GetRoutes()[0].GetTotalTimeSeconds() != 300 || route.GetExplanation() == without.GetRoutes()[0].GetExplanation() {
		t.Fatalf("explanation = %q", route.GetExplanation())
	}
}

// Las posiciones llegan por red y cambian la recomendación siguiente.
func TestReportedPositionsReachRecommendations(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	server := gpsServer(graph)
	times, now := server.service.gpsTimes, time.Now()
	visits := []struct {
		stopID string
		ago    time.Duration
	}{{"PAR-PORTAL-01", 1000 * time.Second}, {"PAR-CSF-01", 800 * time.Second}, {"PAR-DPORT-01", 200 * time.Second}}
	for visitIndex, visit := range visits {
		at := now.Add(-visit.ago)
		// Cada lectura se recibe en su momento, y hay señal entre los paraderos.
		times.recordReported(graph, []*microv1.BusPosition{reportedAt(graph, "bus", "L7B", visit.stopID, at)}, at)
		if visitIndex+1 < len(visits) {
			for between := at.Add(time.Minute); between.Before(now.Add(-visits[visitIndex+1].ago)); between = between.Add(time.Minute) {
				position := reportedAt(graph, "bus", "L7B", visit.stopID, between)
				position.Latitude += 0.002
				times.recordReported(graph, []*microv1.BusPosition{position}, between)
			}
		}
	}
	// De CSF a DPORT tardó 600 s: (300 × 2 + 600) / 3 = 400.
	observed := server.service.currentObservedTimes(graph)
	if seconds := observed.SegmentSeconds[segmentKey{"L7B", "PAR-CSF-01", "PAR-DPORT-01"}]; seconds != 400 {
		t.Fatalf("observed = %v, want 400 s", observed.SegmentSeconds)
	}
}
