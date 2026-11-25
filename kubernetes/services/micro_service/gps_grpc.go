package main

// Recepción de posiciones por gRPC y uso de los tiempos observados.

import (
	"context"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	// maxReportedPositions limita una petición, para que no consuma memoria ni CPU.
	maxReportedPositions = 500
	// maxFutureGPS tolera relojes algo adelantados.
	maxFutureGPS = time.Minute
)

// ReportPositions registra posiciones de micros. Las que no sirven se ignoran sin
// rechazar las demás, y la respuesta dice cuántas se usaron.
func (server *microGRPCServer) ReportPositions(_ context.Context, request *microv1.ReportPositionsRequest) (*microv1.ReportPositionsResponse, error) {
	graph := server.service.store.Get()
	if graph == nil || server.service.gpsTimes == nil {
		return nil, status.Error(codes.Unavailable, "graph is not loaded")
	}
	if len(request.GetPositions()) > maxReportedPositions {
		return nil, status.Error(codes.InvalidArgument, "too many positions")
	}
	return &microv1.ReportPositionsResponse{
		Accepted: server.service.gpsTimes.recordReported(graph, request.GetPositions(), time.Now()),
	}, nil
}

// recordReported registra las posiciones recientes. Una hora futura bloquearía a la
// micro, porque sus lecturas siguientes parecerían antiguas.
func (times *GPSTimes) recordReported(graph *TransitGraph, positions []*microv1.BusPosition, now time.Time) int32 {
	accepted := int32(0)
	for _, position := range positions {
		positionTime := time.UnixMilli(position.GetUnixMillis())
		if positionTime.After(now.Add(maxFutureGPS)) || now.Sub(positionTime) > maxGPSGap {
			continue
		}
		if times.Record(graph, GPSPosition{
			BusID: position.GetBusId(), RouteID: position.GetRouteId(),
			Latitude: position.GetLatitude(), Longitude: position.GetLongitude(), Time: positionTime,
		}) {
			accepted++
		}
	}
	return accepted
}

// currentObservedTimes son los tiempos del GPS en este momento. Sin registro no hay
// correcciones.
func (service *Server) currentObservedTimes(graph *TransitGraph) ObservedTimes {
	if service.gpsTimes == nil {
		return ObservedTimes{}
	}
	return service.gpsTimes.Observed(graph, time.Now())
}
