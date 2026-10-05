package main

import (
	"context"
	"strings"
	"time"

	climav1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/clima/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type climateGRPCServer struct {
	climav1.UnimplementedClimateServiceServer
	service *Server
}

func (s *climateGRPCServer) Health(ctx context.Context, _ *climav1.HealthRequest) (*climav1.HealthResponse, error) {
	if repository, ok := s.service.repository.(*PostgresRepository); ok {
		if err := repository.pool.Ping(ctx); err != nil {
			return nil, status.Error(codes.Unavailable, "database unavailable")
		}
	}
	return &climav1.HealthResponse{Status: "ok"}, nil
}

func (s *climateGRPCServer) ListTelemetry(ctx context.Context, request *climav1.ListTelemetryRequest) (*climav1.ListTelemetryResponse, error) {
	if request.GetFrom() == nil || request.GetTo() == nil {
		return nil, status.Error(codes.InvalidArgument, "from and to are required")
	}
	from := request.GetFrom().AsTime().UTC()
	to := request.GetTo().AsTime().UTC()
	if err := request.GetFrom().CheckValid(); err != nil {
		return nil, status.Error(codes.InvalidArgument, "from and to must be valid timestamps")
	}
	if err := request.GetTo().CheckValid(); err != nil {
		return nil, status.Error(codes.InvalidArgument, "from and to must be valid timestamps")
	}
	if !from.Before(to) {
		return nil, status.Error(codes.InvalidArgument, "from must be before to")
	}
	stationID := strings.TrimSpace(request.GetStationId())
	if len(stationID) > 64 {
		return nil, status.Error(codes.InvalidArgument, "station_id must have at most 64 characters")
	}
	limit := int(request.GetLimit())
	if limit == 0 {
		limit = defaultTelemetryReadLimit
	}
	if limit < 1 || limit > maxTelemetryReadLimit {
		return nil, status.Errorf(codes.InvalidArgument, "limit must be between 1 and %d", maxTelemetryReadLimit)
	}
	reader := s.service.reader
	if reader == nil {
		reader, _ = s.service.repository.(TelemetryReader)
	}
	if reader == nil {
		return nil, status.Error(codes.Unavailable, "telemetry reader unavailable")
	}
	records, err := reader.Read(ctx, TelemetryQuery{From: from, To: to, StationID: stationID, Limit: limit})
	if err != nil {
		return nil, status.Error(codes.Unavailable, "could not read telemetry")
	}
	response := &climav1.ListTelemetryResponse{Records: make([]*climav1.TelemetryRecord, 0, len(records))}
	for _, record := range records {
		response.Records = append(response.Records, &climav1.TelemetryRecord{
			Time:         timestamppb.New(record.Time),
			StationId:    record.StationID,
			Sector:       record.Sector,
			TemperatureC: record.TemperatureC,
			HumidityPct:  record.HumidityPct,
			WindSpeedKmh: record.WindSpeedKMH,
			Pm25UgM3:     record.PM25,
			Pm10UgM3:     record.PM10,
			Status:       record.Status,
			Latitude:     record.Latitude,
			Longitude:    record.Longitude,
		})
	}
	return response, nil
}

func climateAuthInterceptor(expected string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, request interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		if expected == "" {
			return handler(ctx, request)
		}
		values := metadata.ValueFromIncomingContext(ctx, "x-api-key")
		if len(values) != 1 || values[0] != expected {
			return nil, status.Error(codes.Unauthenticated, "invalid api key")
		}
		return handler(ctx, request)
	}
}

func validClimateTimestamp(value time.Time) bool {
	return !value.IsZero() && value.Year() >= 1
}
