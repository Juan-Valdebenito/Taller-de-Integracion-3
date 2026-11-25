package handler

import (
	"context"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/metadata"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/gpsreport"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

type receivedReport struct {
	request *microv1.ReportPositionsRequest
	keys    []string
}

type gpsMicroServer struct {
	microv1.UnimplementedMicroServiceServer
	reports chan receivedReport
}

func (server *gpsMicroServer) ReportPositions(requestContext context.Context, request *microv1.ReportPositionsRequest) (*microv1.ReportPositionsResponse, error) {
	server.reports <- receivedReport{request, metadata.ValueFromIncomingContext(requestContext, "x-admin-key")}
	return &microv1.ReportPositionsResponse{Accepted: int32(len(request.GetPositions()))}, nil
}

// Las micros publicadas en el Hub llegan a micro_service por gRPC real, con la clave
// interna y la línea traducida. Las simuladas no.
func TestGPSReportChain(t *testing.T) {
	server := &gpsMicroServer{reports: make(chan receivedReport, 1)}
	routeCode := func(_ context.Context, routeID string) (string, error) {
		return map[string]string{"id-de-la-base": "7B"}[routeID], nil
	}
	reporter := gpsreport.NewReporter(startMicroClientWith(t, server), gpsreport.NewLineResolver(MicroLineID, routeCode))
	hub := ws.NewHub(service.NewOccupancyService())
	hub.SetPositionRecorder(reporter)
	go hub.Run()
	runContext, cancel := context.WithCancel(context.Background())
	defer cancel()
	go reporter.Run(runContext)
	hub.PublishInternal(ws.BusLocationData{BusID: "sim-1", RouteID: "route-7B", Latitude: -38.7, Longitude: -72.6})
	hub.PublishInternal(ws.BusLocationData{BusID: "bus-1", RouteID: "id-de-la-base", Latitude: -38.71, Longitude: -72.61})

	select {
	case report := <-server.reports:
		positions := report.request.GetPositions()
		if len(positions) != 1 || positions[0].GetBusId() != "bus-1" || positions[0].GetRouteId() != "L7B" ||
			positions[0].GetLatitude() != -38.71 || positions[0].GetLongitude() != -72.61 ||
			time.Since(time.UnixMilli(positions[0].GetUnixMillis())) > time.Minute {
			t.Fatalf("positions = %v", positions)
		}
		if len(report.keys) != 1 || report.keys[0] != "clave-de-prueba" {
			t.Fatalf("received %d keys, want only the configured one", len(report.keys))
		}
	case <-time.After(3 * gpsreport.SendInterval):
		t.Fatal("no report arrived")
	}
}
