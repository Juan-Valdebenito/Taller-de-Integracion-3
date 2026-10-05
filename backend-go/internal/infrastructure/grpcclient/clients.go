package grpcclient

import (
	"context"
	"time"

	climav1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/clima/v1"
	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ClimateClient struct {
	connection *grpc.ClientConn
	client     climav1.ClimateServiceClient
	key        string
	timeout    time.Duration
}

func NewClimateClient(target, key string, timeout time.Duration) (*ClimateClient, error) {
	connection, err := grpc.Dial(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	return &ClimateClient{connection: connection, client: climav1.NewClimateServiceClient(connection), key: key, timeout: timeout}, nil
}

func (c *ClimateClient) Close() error { return c.connection.Close() }

func (c *ClimateClient) ListTelemetry(ctx context.Context, from, to time.Time, stationID string, limit int) (*climav1.ListTelemetryResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()
	ctx = metadata.AppendToOutgoingContext(ctx, "x-api-key", c.key)
	return c.client.ListTelemetry(ctx, &climav1.ListTelemetryRequest{
		From:      timestamppb.New(from),
		To:        timestamppb.New(to),
		StationId: stationID,
		Limit:     uint32(limit),
	})
}

type MicroClient struct {
	connection *grpc.ClientConn
	client     microv1.MicroServiceClient
	key        string
	timeout    time.Duration
}

func NewMicroClient(target, key string, timeout time.Duration) (*MicroClient, error) {
	connection, err := grpc.Dial(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	return &MicroClient{connection: connection, client: microv1.NewMicroServiceClient(connection), key: key, timeout: timeout}, nil
}

func (c *MicroClient) Close() error { return c.connection.Close() }

func (c *MicroClient) withContext(ctx context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	return metadata.AppendToOutgoingContext(ctx, "x-admin-key", c.key), cancel
}

func (c *MicroClient) ListStops(ctx context.Context, request *microv1.ListStopsRequest) (*microv1.ListStopsResponse, error) {
	ctx, cancel := c.withContext(ctx)
	defer cancel()
	return c.client.ListStops(ctx, request)
}

func (c *MicroClient) GetStop(ctx context.Context, request *microv1.GetStopRequest) (*microv1.Stop, error) {
	ctx, cancel := c.withContext(ctx)
	defer cancel()
	return c.client.GetStop(ctx, request)
}

func (c *MicroClient) ListRoutes(ctx context.Context) (*microv1.ListRoutesResponse, error) {
	ctx, cancel := c.withContext(ctx)
	defer cancel()
	return c.client.ListRoutes(ctx, &microv1.ListRoutesRequest{})
}

func (c *MicroClient) PlanRoute(ctx context.Context, request *microv1.PlanRouteRequest) (*microv1.RoutePlan, error) {
	ctx, cancel := c.withContext(ctx)
	defer cancel()
	return c.client.PlanRoute(ctx, request)
}
