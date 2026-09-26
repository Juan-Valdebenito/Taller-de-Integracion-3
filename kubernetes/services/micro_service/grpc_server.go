package main

import (
	"context"
	"crypto/subtle"
	"sort"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type microGRPCServer struct {
	microv1.UnimplementedMicroServiceServer
	service *Server
}

func (s *microGRPCServer) Health(_ context.Context, _ *microv1.HealthRequest) (*microv1.HealthResponse, error) {
	graph := s.service.store.Get()
	if graph == nil {
		return nil, status.Error(codes.Unavailable, "graph is not loaded")
	}
	return &microv1.HealthResponse{Status: "ok", GraphLoaded: true, TotalStops: int32(len(graph.Stops)), TotalEdges: int32(graph.EdgeCount())}, nil
}

func (s *microGRPCServer) ListStops(_ context.Context, request *microv1.ListStopsRequest) (*microv1.ListStopsResponse, error) {
	graph := s.service.store.Get()
	if graph == nil {
		return nil, status.Error(codes.Unavailable, "graph is not loaded")
	}
	limit := int(request.GetLimit())
	if limit == 0 {
		limit = 50
	}
	if limit < 1 {
		return nil, status.Error(codes.InvalidArgument, "limit must be positive")
	}
	coordinatesProvided := request.Latitude != nil || request.Longitude != nil || request.RadiusMeters != nil
	if coordinatesProvided && (request.Latitude == nil || request.Longitude == nil || request.RadiusMeters == nil) {
		return nil, status.Error(codes.InvalidArgument, "latitude, longitude and radius_meters must be provided together")
	}
	filtered := make([]Stop, 0, len(graph.Stops))
	if coordinatesProvided {
		if *request.Latitude < -90 || *request.Latitude > 90 || *request.Longitude < -180 || *request.Longitude > 180 || *request.RadiusMeters <= 0 {
			return nil, status.Error(codes.InvalidArgument, "invalid coordinates or radius_meters")
		}
		for _, stop := range graph.Stops {
			if haversineMeters(*request.Latitude, *request.Longitude, stop.Latitude, stop.Longitude) <= *request.RadiusMeters {
				filtered = append(filtered, stop)
			}
		}
		sort.Slice(filtered, func(i, j int) bool {
			left := haversineMeters(*request.Latitude, *request.Longitude, filtered[i].Latitude, filtered[i].Longitude)
			right := haversineMeters(*request.Latitude, *request.Longitude, filtered[j].Latitude, filtered[j].Longitude)
			if left == right {
				return filtered[i].ID < filtered[j].ID
			}
			return left < right
		})
	} else {
		for _, stop := range graph.Stops {
			filtered = append(filtered, stop)
		}
		sort.Slice(filtered, func(i, j int) bool { return filtered[i].ID < filtered[j].ID })
	}
	total := len(filtered)
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}
	response := &microv1.ListStopsResponse{Total: int32(total), Stops: make([]*microv1.Stop, 0, len(filtered))}
	for _, stop := range filtered {
		response.Stops = append(response.Stops, microStop(stop))
	}
	return response, nil
}

func (s *microGRPCServer) GetStop(_ context.Context, request *microv1.GetStopRequest) (*microv1.Stop, error) {
	graph := s.service.store.Get()
	if graph == nil {
		return nil, status.Error(codes.Unavailable, "graph is not loaded")
	}
	stop, ok := graph.Stops[request.GetStopId()]
	if !ok || request.GetStopId() == "" {
		return nil, status.Error(codes.NotFound, "stop not found")
	}
	return microStop(stop), nil
}

func (s *microGRPCServer) ListRoutes(ctx context.Context, _ *microv1.ListRoutesRequest) (*microv1.ListRoutesResponse, error) {
	rows, err := s.service.pool.Query(ctx, `SELECT route_id, route_short_name, route_long_name, color_hex FROM routes ORDER BY route_id`)
	if err != nil {
		return nil, status.Error(codes.Unavailable, "could not query routes")
	}
	defer rows.Close()
	response := &microv1.ListRoutesResponse{Routes: make([]*microv1.Route, 0)}
	for rows.Next() {
		var route microv1.Route
		if err := rows.Scan(&route.Id, &route.ShortName, &route.LongName, &route.ColorHex); err != nil {
			return nil, status.Error(codes.Unavailable, "could not read routes")
		}
		response.Routes = append(response.Routes, &route)
	}
	if err := rows.Err(); err != nil {
		return nil, status.Error(codes.Unavailable, "could not read routes")
	}
	response.Total = int32(len(response.Routes))
	return response, nil
}

func (s *microGRPCServer) PlanRoute(_ context.Context, request *microv1.PlanRouteRequest) (*microv1.RoutePlan, error) {
	from, to, mode := request.GetOriginStopId(), request.GetDestinationStopId(), request.GetMode()
	if from == "" || to == "" || (mode != "fastest" && mode != "min_transfers") {
		return nil, status.Error(codes.InvalidArgument, "origin_stop_id, destination_stop_id and mode=fastest|min_transfers are required")
	}
	graph := s.service.store.Get()
	if graph == nil {
		return nil, status.Error(codes.Unavailable, "graph is not loaded")
	}
	if _, ok := graph.Stops[from]; !ok {
		return nil, status.Error(codes.NotFound, "origin stop not found")
	}
	if _, ok := graph.Stops[to]; !ok {
		return nil, status.Error(codes.NotFound, "destination stop not found")
	}
	var path []pathStep
	var found bool
	if from != to {
		if mode == "fastest" {
			path, found = fastestPath(graph, from, to)
		} else {
			path, found = minimumTransferPath(graph, from, to)
		}
		if !found {
			return nil, status.Error(codes.NotFound, "no route found between stops")
		}
	}
	response := &microv1.RoutePlan{OriginStopId: from, DestinationStopId: to, Movements: make([]*microv1.Movement, 0, len(path))}
	for _, step := range path {
		movement := &microv1.Movement{FromStopId: step.From, ToStopId: step.Edge.ToStopID, TimeSeconds: int32(step.Edge.BaseTimeSec), DistanceMeters: int32(step.Edge.DistanceM)}
		response.TotalTimeSeconds += movement.TimeSeconds
		response.TotalDistanceMeters += movement.DistanceMeters
		if step.Edge.RouteID == walkRouteID {
			movement.Mode = "walk"
		} else {
			movement.Mode = "bus"
			movement.RouteId = step.Edge.RouteID
			movement.TripId = step.Edge.TripID
		}
		response.Movements = append(response.Movements, movement)
	}
	response.Transfers = int32(countTransfers(path))
	return response, nil
}

func microStop(stop Stop) *microv1.Stop {
	return &microv1.Stop{Id: stop.ID, Name: stop.Name, Latitude: stop.Latitude, Longitude: stop.Longitude}
}

func microAuthInterceptor(expected string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, request interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		if expected == "" {
			return handler(ctx, request)
		}
		values := metadata.ValueFromIncomingContext(ctx, "x-admin-key")
		if len(values) != 1 || subtle.ConstantTimeCompare([]byte(values[0]), []byte(expected)) != 1 {
			return nil, status.Error(codes.Unauthenticated, "invalid admin key")
		}
		return handler(ctx, request)
	}
}
