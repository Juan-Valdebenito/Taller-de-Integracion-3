package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
)

const (
	defaultPort        = "8080"
	defaultMaxBody     = int64(1024 * 1024)
	defaultNATSSubject = "transport.micro.telemetry.state"
	maxBusIDLength     = 64
	maxEventIDLength   = 128
)

type GPSReading struct {
	EventID   string    `json:"event_id"`
	BusID     string    `json:"bus_id"`
	RouteID   string    `json:"route_id,omitempty"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Heading   float64   `json:"heading,omitempty"`
	SpeedKMH  float64   `json:"speed_kmh,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

type PassengerReading struct {
	EventID           string    `json:"event_id"`
	BusID             string    `json:"bus_id"`
	RouteID           string    `json:"route_id,omitempty"`
	CurrentPassengers int       `json:"current_passengers"`
	Capacity          int       `json:"capacity"`
	Boardings         int       `json:"boardings,omitempty"`
	Alightings        int       `json:"alightings,omitempty"`
	Timestamp         time.Time `json:"timestamp"`
}

type TelemetrySnapshot struct {
	BusID              string     `json:"bus_id"`
	RouteID            string     `json:"route_id,omitempty"`
	Latitude           *float64   `json:"latitude,omitempty"`
	Longitude          *float64   `json:"longitude,omitempty"`
	Heading            *float64   `json:"heading,omitempty"`
	SpeedKMH           *float64   `json:"speed_kmh,omitempty"`
	CurrentPassengers  *int       `json:"current_passengers,omitempty"`
	Capacity           *int       `json:"capacity,omitempty"`
	Boardings          *int       `json:"boardings,omitempty"`
	Alightings         *int       `json:"alightings,omitempty"`
	GPSTimestamp       *time.Time `json:"gps_timestamp,omitempty"`
	PassengerTimestamp *time.Time `json:"passenger_timestamp,omitempty"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type TelemetryStore interface {
	SaveGPS(context.Context, GPSReading) (TelemetrySnapshot, error)
	SavePassengers(context.Context, PassengerReading) (TelemetrySnapshot, error)
	Ping(context.Context) error
}

type TelemetryPublisher interface {
	Publish(TelemetrySnapshot) error
}

type NATSPublisher struct {
	connection *nats.Conn
	subject    string
}

func (p *NATSPublisher) Publish(snapshot TelemetrySnapshot) error {
	data, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	return p.connection.Publish(p.subject, data)
}

type Server struct {
	apiKey    string
	store     TelemetryStore
	publisher TelemetryPublisher
	maxBody   int64
	now       func() time.Time
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/ready", s.ready)
	mux.HandleFunc("/api/v1/telemetry/gps", s.gpsTelemetry)
	mux.HandleFunc("/telemetry/gps", s.gpsTelemetry)
	mux.HandleFunc("/api/v1/telemetry/passengers", s.passengerTelemetry)
	mux.HandleFunc("/telemetry/passengers", s.passengerTelemetry)
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	if s.store != nil {
		if err := s.store.Ping(r.Context()); err != nil {
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) gpsTelemetry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var reading GPSReading
	if err := decodeJSON(r, s.maxBody, &reading); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateGPS(reading, s.currentTime()); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	snapshot, err := s.store.SaveGPS(r.Context(), reading)
	if err != nil {
		log.Printf("[DB ERROR] storing GPS telemetry: %v", err)
		http.Error(w, "could not store telemetry", http.StatusServiceUnavailable)
		return
	}
	if err := s.publisher.Publish(snapshot); err != nil {
		log.Printf("[NATS ERROR] publishing telemetry: %v", err)
		http.Error(w, "could not publish telemetry", http.StatusServiceUnavailable)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

func (s *Server) passengerTelemetry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var reading PassengerReading
	if err := decodeJSON(r, s.maxBody, &reading); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validatePassengers(reading, s.currentTime()); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	snapshot, err := s.store.SavePassengers(r.Context(), reading)
	if err != nil {
		log.Printf("[DB ERROR] storing passenger telemetry: %v", err)
		http.Error(w, "could not store telemetry", http.StatusServiceUnavailable)
		return
	}
	if err := s.publisher.Publish(snapshot); err != nil {
		log.Printf("[NATS ERROR] publishing telemetry: %v", err)
		http.Error(w, "could not publish telemetry", http.StatusServiceUnavailable)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

func (s *Server) authorized(r *http.Request) bool {
	return s.apiKey == "" || r.Header.Get("X-API-Key") == s.apiKey
}

func (s *Server) currentTime() time.Time {
	if s.now != nil {
		return s.now().UTC()
	}
	return time.Now().UTC()
}

func decodeJSON(r *http.Request, maxBody int64, target interface{}) error {
	if maxBody <= 0 {
		maxBody = defaultMaxBody
	}
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxBody+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errors.New("invalid JSON payload")
	}
	if extra := decoder.Decode(&struct{}{}); extra != io.EOF {
		return errors.New("request must contain one JSON object")
	}
	return nil
}

func validateGPS(reading GPSReading, now time.Time) error {
	if err := validateIDs(reading.EventID, reading.BusID); err != nil {
		return err
	}
	if reading.Latitude < -90 || reading.Latitude > 90 || reading.Longitude < -180 || reading.Longitude > 180 {
		return errors.New("coordinates are outside valid ranges")
	}
	if reading.Heading < 0 || reading.Heading >= 360 {
		return errors.New("heading must be between 0 and 360 degrees")
	}
	if reading.SpeedKMH < 0 {
		return errors.New("speed_kmh must be non-negative")
	}
	if reading.Timestamp.IsZero() || reading.Timestamp.After(now.Add(5*time.Minute)) {
		return errors.New("timestamp is invalid or too far in the future")
	}
	return nil
}

func validatePassengers(reading PassengerReading, now time.Time) error {
	if err := validateIDs(reading.EventID, reading.BusID); err != nil {
		return err
	}
	if reading.Capacity <= 0 || reading.CurrentPassengers < 0 || reading.CurrentPassengers > reading.Capacity {
		return errors.New("passenger count must be between zero and capacity")
	}
	if reading.Boardings < 0 || reading.Alightings < 0 {
		return errors.New("boardings and alightings must be non-negative")
	}
	if reading.Timestamp.IsZero() || reading.Timestamp.After(now.Add(5*time.Minute)) {
		return errors.New("timestamp is invalid or too far in the future")
	}
	return nil
}

func validateIDs(eventID, busID string) error {
	if strings.TrimSpace(eventID) == "" || len(eventID) > maxEventIDLength {
		return fmt.Errorf("event_id is required and must have at most %d characters", maxEventIDLength)
	}
	if strings.TrimSpace(busID) == "" || len(busID) > maxBusIDLength {
		return fmt.Errorf("bus_id is required and must have at most %d characters", maxBusIDLength)
	}
	return nil
}

type PostgresStore struct {
	pool *pgxpool.Pool
}

func (s *PostgresStore) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func (s *PostgresStore) SaveGPS(ctx context.Context, reading GPSReading) (TelemetrySnapshot, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TelemetrySnapshot{}, err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `
		INSERT INTO gps_telemetry (event_id, bus_id, route_id, time, latitude, longitude, heading, speed_kmh)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (event_id, time) DO NOTHING`, reading.EventID, reading.BusID, reading.RouteID, reading.Timestamp.UTC(), reading.Latitude, reading.Longitude, reading.Heading, reading.SpeedKMH)
	if err != nil {
		return TelemetrySnapshot{}, err
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO micro_current_state (bus_id, route_id, latitude, longitude, heading, speed_kmh, gps_time, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (bus_id) DO UPDATE SET
			route_id = EXCLUDED.route_id, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
			heading = EXCLUDED.heading, speed_kmh = EXCLUDED.speed_kmh, gps_time = EXCLUDED.gps_time,
			updated_at = now()
		WHERE micro_current_state.gps_time IS NULL OR micro_current_state.gps_time <= EXCLUDED.gps_time`, reading.BusID, reading.RouteID, reading.Latitude, reading.Longitude, reading.Heading, reading.SpeedKMH, reading.Timestamp.UTC()); err != nil {
		return TelemetrySnapshot{}, err
	}
	snapshot, err := scanSnapshot(tx.QueryRow(ctx, currentStateQuery, reading.BusID))
	if err != nil {
		return TelemetrySnapshot{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return TelemetrySnapshot{}, err
	}
	return snapshot, nil
}

func (s *PostgresStore) SavePassengers(ctx context.Context, reading PassengerReading) (TelemetrySnapshot, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TelemetrySnapshot{}, err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `
		INSERT INTO passenger_telemetry (event_id, bus_id, route_id, time, current_passengers, capacity, boardings, alightings)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (event_id, time) DO NOTHING`, reading.EventID, reading.BusID, reading.RouteID, reading.Timestamp.UTC(), reading.CurrentPassengers, reading.Capacity, reading.Boardings, reading.Alightings)
	if err != nil {
		return TelemetrySnapshot{}, err
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO micro_current_state (bus_id, route_id, current_passengers, capacity, boardings, alightings, passenger_time, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (bus_id) DO UPDATE SET
			route_id = EXCLUDED.route_id, current_passengers = EXCLUDED.current_passengers, capacity = EXCLUDED.capacity,
			boardings = EXCLUDED.boardings, alightings = EXCLUDED.alightings, passenger_time = EXCLUDED.passenger_time,
			updated_at = now()
		WHERE micro_current_state.passenger_time IS NULL OR micro_current_state.passenger_time <= EXCLUDED.passenger_time`, reading.BusID, reading.RouteID, reading.CurrentPassengers, reading.Capacity, reading.Boardings, reading.Alightings, reading.Timestamp.UTC()); err != nil {
		return TelemetrySnapshot{}, err
	}
	snapshot, err := scanSnapshot(tx.QueryRow(ctx, currentStateQuery, reading.BusID))
	if err != nil {
		return TelemetrySnapshot{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return TelemetrySnapshot{}, err
	}
	return snapshot, nil
}

const currentStateQuery = `
	SELECT bus_id, route_id, latitude, longitude, heading, speed_kmh,
		current_passengers, capacity, boardings, alightings, gps_time, passenger_time, updated_at
	FROM micro_current_state WHERE bus_id = $1`

func scanSnapshot(row pgx.Row) (TelemetrySnapshot, error) {
	var snapshot TelemetrySnapshot
	var routeID string
	var latitude, longitude, heading, speed *float64
	var passengers, capacity, boardings, alightings *int
	var gpsTime, passengerTime *time.Time
	if err := row.Scan(&snapshot.BusID, &routeID, &latitude, &longitude, &heading, &speed, &passengers, &capacity, &boardings, &alightings, &gpsTime, &passengerTime, &snapshot.UpdatedAt); err != nil {
		return snapshot, err
	}
	snapshot.RouteID = routeID
	snapshot.Latitude = latitude
	snapshot.Longitude = longitude
	snapshot.Heading = heading
	snapshot.SpeedKMH = speed
	snapshot.CurrentPassengers = passengers
	snapshot.Capacity = capacity
	snapshot.Boardings = boardings
	snapshot.Alightings = alightings
	snapshot.GPSTimestamp = gpsTime
	snapshot.PassengerTimestamp = passengerTime
	return snapshot, nil
}

func main() {
	ctx := context.Background()
	dbConfig, err := pgxpool.ParseConfig(databaseURL())
	if err != nil {
		log.Fatalf("invalid database configuration: %v", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, dbConfig)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer pool.Close()

	natsConnection, err := nats.Connect(getenv("NATS_URL", "nats://nats-svc:4222"))
	if err != nil {
		log.Fatalf("NATS connection failed: %v", err)
	}
	defer natsConnection.Close()

	server := &Server{
		apiKey:    os.Getenv("MICRO_TELEMETRY_API_KEY"),
		store:     &PostgresStore{pool: pool},
		publisher: &NATSPublisher{connection: natsConnection, subject: getenv("NATS_SUBJECT", defaultNATSSubject)},
		maxBody:   getenvInt64("MAX_BODY_BYTES", defaultMaxBody),
	}
	httpServer := &http.Server{Addr: ":" + getenv("PORT", defaultPort), Handler: server.routes(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("micro_telemetry listening on %s", httpServer.Addr)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func databaseURL() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", getenv("DB_USER", "telemetry_user"), os.Getenv("DB_PASSWORD"), getenv("DB_HOST", "localhost"), getenv("DB_PORT", "5432"), getenv("DB_NAME", "micro_telemetry"), getenv("DB_SSLMODE", "disable"))
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getenvInt64(key string, fallback int64) int64 {
	value, err := strconv.ParseInt(os.Getenv(key), 10, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
