package main

import (
	"container/heap"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const walkRouteID = "WALK"

type Config struct{ Port, DatabaseURL, AdminKey string }

type Stop struct {
	ID        string  `json:"stop_id"`
	Name      string  `json:"stop_name"`
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"long"`
}

type Edge struct {
	ToStopID    string
	RouteID     string
	TripID      string
	BaseTimeSec int
	DistanceM   int
}

type TransitGraph struct {
	Stops map[string]Stop
	Edges map[string][]Edge
}

func NewTransitGraph() *TransitGraph {
	return &TransitGraph{Stops: make(map[string]Stop), Edges: make(map[string][]Edge)}
}

func (g *TransitGraph) EdgeCount() int {
	total := 0
	for _, edges := range g.Edges {
		total += len(edges)
	}
	return total
}

func (g *TransitGraph) LoadFromDB(ctx context.Context, pool *pgxpool.Pool) error {
	next := NewTransitGraph()
	stopRows, err := pool.Query(ctx, `SELECT stop_id, stop_name, ST_Y(location), ST_X(location) FROM stops ORDER BY stop_id`)
	if err != nil {
		return fmt.Errorf("query stops: %w", err)
	}
	defer stopRows.Close()
	for stopRows.Next() {
		var stop Stop
		if err := stopRows.Scan(&stop.ID, &stop.Name, &stop.Latitude, &stop.Longitude); err != nil {
			return fmt.Errorf("scan stop: %w", err)
		}
		next.Stops[stop.ID] = stop
	}
	if err := stopRows.Err(); err != nil {
		return fmt.Errorf("read stops: %w", err)
	}

	routeRows, err := pool.Query(ctx, `
		SELECT rs.from_stop_id, rs.to_stop_id, r.route_id, rs.trip_id,
		       rs.base_travel_time_seconds, rs.distance_meters
		FROM route_stops rs
		JOIN trips t ON t.trip_id = rs.trip_id
		JOIN routes r ON r.route_id = t.route_id
		ORDER BY rs.from_stop_id, rs.stop_sequence`)
	if err != nil {
		return fmt.Errorf("query route edges: %w", err)
	}
	defer routeRows.Close()
	for routeRows.Next() {
		var fromID string
		var edge Edge
		if err := routeRows.Scan(&fromID, &edge.ToStopID, &edge.RouteID, &edge.TripID, &edge.BaseTimeSec, &edge.DistanceM); err != nil {
			return fmt.Errorf("scan route edge: %w", err)
		}
		if err := validateEdge(next, fromID, edge); err != nil {
			return err
		}
		next.Edges[fromID] = append(next.Edges[fromID], edge)
	}
	if err := routeRows.Err(); err != nil {
		return fmt.Errorf("read route edges: %w", err)
	}

	transferRows, err := pool.Query(ctx, `SELECT from_stop_id, to_stop_id, walk_time_seconds FROM transfers ORDER BY from_stop_id, to_stop_id`)
	if err != nil {
		return fmt.Errorf("query transfers: %w", err)
	}
	defer transferRows.Close()
	for transferRows.Next() {
		var fromID string
		edge := Edge{RouteID: walkRouteID}
		if err := transferRows.Scan(&fromID, &edge.ToStopID, &edge.BaseTimeSec); err != nil {
			return fmt.Errorf("scan transfer: %w", err)
		}
		if err := validateEdge(next, fromID, edge); err != nil {
			return err
		}
		next.Edges[fromID] = append(next.Edges[fromID], edge)
	}
	if err := transferRows.Err(); err != nil {
		return fmt.Errorf("read transfers: %w", err)
	}
	*g = *next
	return nil
}

func validateEdge(graph *TransitGraph, fromID string, edge Edge) error {
	if _, ok := graph.Stops[fromID]; !ok {
		return fmt.Errorf("edge references unknown origin stop %q", fromID)
	}
	if _, ok := graph.Stops[edge.ToStopID]; !ok {
		return fmt.Errorf("edge references unknown destination stop %q", edge.ToStopID)
	}
	if edge.BaseTimeSec < 0 || edge.DistanceM < 0 {
		return fmt.Errorf("edge %q -> %q has negative cost", fromID, edge.ToStopID)
	}
	return nil
}

type GraphStore struct {
	mu    sync.RWMutex
	graph *TransitGraph
}

func (s *GraphStore) Get() *TransitGraph          { s.mu.RLock(); defer s.mu.RUnlock(); return s.graph }
func (s *GraphStore) Replace(graph *TransitGraph) { s.mu.Lock(); s.graph = graph; s.mu.Unlock() }

type Server struct {
	pool  *pgxpool.Pool
	store *GraphStore
	admin string
}
type errorResponse struct {
	Error string `json:"error"`
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /stops", s.stops)
	mux.HandleFunc("GET /stops/", s.stopByID)
	mux.HandleFunc("GET /routes", s.routesList)
	mux.HandleFunc("GET /routes/plan", s.routePlan)
	mux.HandleFunc("POST /admin/reload-graph", s.reloadGraph)
	return loggingMiddleware(mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	graph := s.store.Get()
	response := map[string]any{"status": "unhealthy", "graph_loaded": false, "total_stops": 0, "total_edges": 0}
	status := http.StatusServiceUnavailable
	if graph != nil {
		response["status"] = "ok"
		response["graph_loaded"] = true
		response["total_stops"] = len(graph.Stops)
		response["total_edges"] = graph.EdgeCount()
		status = http.StatusOK
	}
	writeJSON(w, status, response)
}

func (s *Server) stops(w http.ResponseWriter, r *http.Request) {
	graph := s.store.Get()
	if graph == nil {
		writeError(w, http.StatusServiceUnavailable, "graph is not loaded")
		return
	}
	query := r.URL.Query()
	limit, err := positiveInt(query.Get("limit"), 50)
	if err != nil {
		writeError(w, http.StatusBadRequest, "limit must be a positive integer")
		return
	}
	coordinatesProvided := query.Get("lat") != "" || query.Get("long") != "" || query.Get("radius_m") != ""
	filtered := make([]Stop, 0, len(graph.Stops))
	var originLat, originLong, radius float64
	if coordinatesProvided {
		var parseErr error
		originLat, parseErr = strconv.ParseFloat(query.Get("lat"), 64)
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "lat, long and radius_m must all be provided and numeric")
			return
		}
		originLong, parseErr = strconv.ParseFloat(query.Get("long"), 64)
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "lat, long and radius_m must all be provided and numeric")
			return
		}
		radius, parseErr = strconv.ParseFloat(query.Get("radius_m"), 64)
		if parseErr != nil || radius <= 0 || originLat < -90 || originLat > 90 || originLong < -180 || originLong > 180 {
			writeError(w, http.StatusBadRequest, "invalid coordinates or radius_m")
			return
		}
	}
	for _, stop := range graph.Stops {
		if coordinatesProvided && haversineMeters(originLat, originLong, stop.Latitude, stop.Longitude) > radius {
			continue
		}
		filtered = append(filtered, stop)
	}
	total := len(filtered)
	if coordinatesProvided {
		sort.Slice(filtered, func(i, j int) bool {
			left := haversineMeters(originLat, originLong, filtered[i].Latitude, filtered[i].Longitude)
			right := haversineMeters(originLat, originLong, filtered[j].Latitude, filtered[j].Longitude)
			if left == right {
				return filtered[i].ID < filtered[j].ID
			}
			return left < right
		})
	} else {
		sort.Slice(filtered, func(i, j int) bool { return filtered[i].ID < filtered[j].ID })
	}
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}
	writeJSON(w, http.StatusOK, map[string]any{"stops": filtered, "total": total})
}

func (s *Server) stopByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/stops/")
	graph := s.store.Get()
	if graph == nil {
		writeError(w, http.StatusServiceUnavailable, "graph is not loaded")
		return
	}
	stop, ok := graph.Stops[id]
	if !ok || id == "" {
		writeError(w, http.StatusNotFound, "stop not found")
		return
	}
	writeJSON(w, http.StatusOK, stop)
}

func (s *Server) routesList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `SELECT route_id, route_short_name, route_long_name, color_hex FROM routes ORDER BY route_id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not query routes")
		return
	}
	defer rows.Close()
	type route struct {
		ID        string `json:"route_id"`
		ShortName string `json:"route_short_name"`
		LongName  string `json:"route_long_name"`
		ColorHex  string `json:"color_hex"`
	}
	result := make([]route, 0)
	for rows.Next() {
		var item route
		if err := rows.Scan(&item.ID, &item.ShortName, &item.LongName, &item.ColorHex); err != nil {
			writeError(w, http.StatusInternalServerError, "could not read routes")
			return
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not read routes")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"routes": result, "total": len(result)})
}

type Movement struct {
	FromStopID string `json:"from_stop_id"`
	ToStopID   string `json:"to_stop_id"`
	Mode       string `json:"mode"`
	RouteID    string `json:"route_id,omitempty"`
	TripID     string `json:"trip_id,omitempty"`
	TimeSec    int    `json:"time_seconds"`
	DistanceM  int    `json:"distance_meters"`
}
type routePlanResponse struct {
	OriginStopID      string     `json:"origin_stop_id"`
	DestinationStopID string     `json:"destination_stop_id"`
	TotalTimeSec      int        `json:"total_time_seconds"`
	TotalDistanceM    int        `json:"total_distance_meters"`
	Transfers         int        `json:"transfers"`
	Movements         []Movement `json:"movements"`
}

func (s *Server) routePlan(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	from, to, preference := query.Get("from_stop"), query.Get("to_stop"), query.Get("preference")
	if from == "" || to == "" || (preference != "fastest" && preference != "min_transfers") {
		writeError(w, http.StatusBadRequest, "from_stop, to_stop and preference=fastest|min_transfers are required")
		return
	}
	graph := s.store.Get()
	if graph == nil {
		writeError(w, http.StatusServiceUnavailable, "graph is not loaded")
		return
	}
	if _, ok := graph.Stops[from]; !ok {
		writeError(w, http.StatusNotFound, "origin stop not found")
		return
	}
	if _, ok := graph.Stops[to]; !ok {
		writeError(w, http.StatusNotFound, "destination stop not found")
		return
	}
	var path []pathStep
	if from != to {
		var found bool
		if preference == "fastest" {
			path, found = fastestPath(graph, from, to)
		} else {
			path, found = minimumTransferPath(graph, from, to)
		}
		if !found {
			writeError(w, http.StatusNotFound, "no route found between stops")
			return
		}
	}
	response := routePlanResponse{OriginStopID: from, DestinationStopID: to, Movements: make([]Movement, 0, len(path))}
	for _, step := range path {
		response.TotalTimeSec += step.Edge.BaseTimeSec
		response.TotalDistanceM += step.Edge.DistanceM
		movement := Movement{FromStopID: step.From, ToStopID: step.Edge.ToStopID, TimeSec: step.Edge.BaseTimeSec, DistanceM: step.Edge.DistanceM}
		if step.Edge.RouteID == walkRouteID {
			movement.Mode = "walk"
		} else {
			movement.Mode = "bus"
			movement.RouteID = step.Edge.RouteID
			movement.TripID = step.Edge.TripID
		}
		response.Movements = append(response.Movements, movement)
	}
	response.Transfers = countTransfers(path)
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) reloadGraph(w http.ResponseWriter, r *http.Request) {
	provided := r.Header.Get("X-Admin-Key")
	if s.admin == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(s.admin)) != 1 {
		writeError(w, http.StatusUnauthorized, "invalid admin key")
		return
	}
	graph := NewTransitGraph()
	if err := graph.LoadFromDB(r.Context(), s.pool); err != nil {
		writeError(w, http.StatusInternalServerError, "could not reload graph: "+err.Error())
		return
	}
	s.store.Replace(graph)
	writeJSON(w, http.StatusOK, map[string]any{"graph_loaded": true, "total_stops": len(graph.Stops), "total_edges": graph.EdgeCount()})
}

type pathStep struct {
	From string
	Edge Edge
}
type dijkstraItem struct {
	stop, route                      string
	time, transfers, sequence, index int
}
type priorityQueue []*dijkstraItem

func (q priorityQueue) Len() int { return len(q) }
func (q priorityQueue) Less(i, j int) bool {
	if q[i].transfers != q[j].transfers {
		return q[i].transfers < q[j].transfers
	}
	if q[i].time != q[j].time {
		return q[i].time < q[j].time
	}
	return q[i].sequence < q[j].sequence
}
func (q priorityQueue) Swap(i, j int) { q[i], q[j] = q[j], q[i]; q[i].index = i; q[j].index = j }
func (q *priorityQueue) Push(item any) {
	entry := item.(*dijkstraItem)
	entry.index = len(*q)
	*q = append(*q, entry)
}
func (q *priorityQueue) Pop() any {
	old := *q
	n := len(old)
	item := old[n-1]
	*q = old[:n-1]
	return item
}

func fastestPath(graph *TransitGraph, from, to string) ([]pathStep, bool) {
	dist := map[string]int{from: 0}
	previous := make(map[string]pathStep)
	queue := &priorityQueue{&dijkstraItem{stop: from}}
	heap.Init(queue)
	for queue.Len() > 0 {
		item := heap.Pop(queue).(*dijkstraItem)
		if item.time != dist[item.stop] {
			continue
		}
		if item.stop == to {
			return reconstructPath(previous, from, to), true
		}
		for _, edge := range graph.Edges[item.stop] {
			candidate := item.time + edge.BaseTimeSec
			best, seen := dist[edge.ToStopID]
			if !seen || candidate < best {
				dist[edge.ToStopID] = candidate
				previous[edge.ToStopID] = pathStep{From: item.stop, Edge: edge}
				heap.Push(queue, &dijkstraItem{stop: edge.ToStopID, time: candidate})
			}
		}
	}
	return nil, false
}

func minimumTransferPath(graph *TransitGraph, from, to string) ([]pathStep, bool) {
	type state struct{ stop, route string }
	start := state{stop: from}
	best := map[state][2]int{start: {0, 0}}
	previous := make(map[state]struct {
		from state
		edge Edge
	})
	sequence := 0
	queue := &priorityQueue{&dijkstraItem{stop: from}}
	heap.Init(queue)
	var final state
	for queue.Len() > 0 {
		item := heap.Pop(queue).(*dijkstraItem)
		current := state{stop: item.stop, route: item.route}
		cost, ok := best[current]
		if !ok || cost != [2]int{item.transfers, item.time} {
			continue
		}
		if item.stop == to {
			final = current
			break
		}
		for _, edge := range graph.Edges[item.stop] {
			nextRoute, additionalTransfer := item.route, 0
			if edge.RouteID != walkRouteID {
				if nextRoute != "" && nextRoute != edge.RouteID {
					additionalTransfer = 1
				}
				nextRoute = edge.RouteID
			}
			next := state{stop: edge.ToStopID, route: nextRoute}
			candidate := [2]int{item.transfers + additionalTransfer, item.time + edge.BaseTimeSec}
			old, seen := best[next]
			if !seen || candidate[0] < old[0] || (candidate[0] == old[0] && candidate[1] < old[1]) {
				best[next] = candidate
				previous[next] = struct {
					from state
					edge Edge
				}{from: current, edge: edge}
				sequence++
				heap.Push(queue, &dijkstraItem{stop: next.stop, route: next.route, time: candidate[1], transfers: candidate[0], sequence: sequence})
			}
		}
	}
	if final.stop == "" {
		return nil, false
	}
	path := make([]pathStep, 0)
	for final != start {
		step, ok := previous[final]
		if !ok {
			return nil, false
		}
		path = append(path, pathStep{From: step.from.stop, Edge: step.edge})
		final = step.from
	}
	reversePath(path)
	return path, true
}

func reconstructPath(previous map[string]pathStep, from, to string) []pathStep {
	path := make([]pathStep, 0)
	for current := to; current != from; {
		step := previous[current]
		path = append(path, step)
		current = step.From
	}
	reversePath(path)
	return path
}
func reversePath(path []pathStep) {
	for left, right := 0, len(path)-1; left < right; left, right = left+1, right-1 {
		path[left], path[right] = path[right], path[left]
	}
}
func countTransfers(path []pathStep) int {
	previousRoute, transfers := "", 0
	for _, step := range path {
		if step.Edge.RouteID == walkRouteID {
			continue
		}
		if previousRoute != "" && previousRoute != step.Edge.RouteID {
			transfers++
		}
		previousRoute = step.Edge.RouteID
	}
	return transfers
}

func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadius = 6371000.0
	latitudeDelta := (lat2 - lat1) * math.Pi / 180
	longitudeDelta := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(latitudeDelta/2)*math.Sin(latitudeDelta/2) + math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*math.Sin(longitudeDelta/2)*math.Sin(longitudeDelta/2)
	return earthRadius * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
func positiveInt(value string, fallback int) (int, error) {
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 || parsed > 1000 {
		return 0, errors.New("invalid positive integer")
	}
	return parsed, nil
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(started))
	})
}

func loadConfig() Config {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", env("DB_USER", "micros_user"), env("DB_PASSWORD", "micros_pass"), env("DB_HOST", "localhost"), env("DB_PORT", "5432"), env("DB_NAME", "micros_db"))
	}
	return Config{Port: env("PORT", "3001"), DatabaseURL: databaseURL, AdminKey: os.Getenv("ADMIN_KEY")}
}
func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	config := loadConfig()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		log.Fatalf("could not create database pool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	store := &GraphStore{}
	graph := NewTransitGraph()
	if err := graph.LoadFromDB(ctx, pool); err != nil {
		log.Printf("initial graph load failed: %v", err)
	} else {
		store.Replace(graph)
		log.Printf("graph loaded: %d stops, %d edges", len(graph.Stops), graph.EdgeCount())
	}
	server := &http.Server{Addr: ":" + config.Port, Handler: (&Server{pool: pool, store: store, admin: config.AdminKey}).routes(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("transit service listening on port %s", config.Port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
