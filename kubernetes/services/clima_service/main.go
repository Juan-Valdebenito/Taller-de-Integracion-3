package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
)

type Location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Sector    string  `json:"sector"`
}

type SensorReadings struct {
	TemperatureC float64 `json:"temperature_c"`
	HumidityPct  float64 `json:"humidity_pct"`
	WindSpeedKMH float64 `json:"wind_speed_kmh"`
	PM25         float64 `json:"pm25_ug_m3"`
	PM10         float64 `json:"pm10_ug_m3"`
}

type WeatherPayload struct {
	StationID string         `json:"station_id"`
	Location  Location       `json:"location"`
	Readings  SensorReadings `json:"sensor_readings"`
	Status    string         `json:"status"`
	Timestamp int64          `json:"timestamp"`
}

type TelemetryRepository interface {
	Insert(ctx context.Context, payloads []WeatherPayload) error
}

type TelemetryQuery struct {
	From      time.Time
	To        time.Time
	StationID string
	Limit     int
}

type TelemetryRecord struct {
	Time         time.Time `json:"time"`
	StationID    string    `json:"station_id"`
	Sector       string    `json:"sector"`
	TemperatureC float64   `json:"temperature_c"`
	HumidityPct  float64   `json:"humidity_pct"`
	WindSpeedKMH float64   `json:"wind_speed_kmh"`
	PM25         float64   `json:"pm25_ug_m3"`
	PM10         float64   `json:"pm10_ug_m3"`
	Status       string    `json:"status"`
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
}

type TelemetryReader interface {
	Read(ctx context.Context, query TelemetryQuery) ([]TelemetryRecord, error)
}

type TelemetryPublisher interface {
	Publish(payload WeatherPayload) error
}

type NATSPublisher struct {
	connection *nats.Conn
	subject    string
}

func (p *NATSPublisher) Publish(payload WeatherPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return p.connection.Publish(p.subject, data)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func (r *PostgresRepository) Insert(ctx context.Context, payloads []WeatherPayload) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, payload := range payloads {
		_, err := tx.Exec(ctx, `
			INSERT INTO weather_telemetry (
				time, station_id, sector, temperature_c, humidity_pct,
				wind_speed_kmh, pm25, pm10, status, location
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9,
				ST_SetSRID(ST_MakePoint($10, $11), 4326)
			)`,
			time.Unix(payload.Timestamp, 0).UTC(),
			payload.StationID,
			payload.Location.Sector,
			payload.Readings.TemperatureC,
			payload.Readings.HumidityPct,
			payload.Readings.WindSpeedKMH,
			payload.Readings.PM25,
			payload.Readings.PM10,
			payload.Status,
			payload.Location.Longitude,
			payload.Location.Latitude,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) Read(ctx context.Context, query TelemetryQuery) ([]TelemetryRecord, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT time, station_id, sector, temperature_c, humidity_pct,
			wind_speed_kmh, pm25, pm10, status, ST_Y(location), ST_X(location)
		FROM weather_telemetry
		WHERE time >= $1 AND time < $2
			AND ($3 = '' OR station_id = $3)
		ORDER BY time DESC, station_id DESC
		LIMIT $4`, query.From, query.To, query.StationID, query.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]TelemetryRecord, 0)
	for rows.Next() {
		var record TelemetryRecord
		if err := rows.Scan(
			&record.Time,
			&record.StationID,
			&record.Sector,
			&record.TemperatureC,
			&record.HumidityPct,
			&record.WindSpeedKMH,
			&record.PM25,
			&record.PM10,
			&record.Status,
			&record.Latitude,
			&record.Longitude,
		); err != nil {
			return nil, err
		}
		record.Time = record.Time.UTC()
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

type Server struct {
	apiKey     string
	repository TelemetryRepository
	reader     TelemetryReader
	publisher  TelemetryPublisher
	maxBody    int64
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	if repository, ok := s.repository.(*PostgresRepository); ok {
		if err := repository.pool.Ping(r.Context()); err != nil {
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) weatherTelemetry(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.weatherTelemetryRead(w, r)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	if r.Header.Get("X-API-Key") != s.apiKey {
		log.Printf("[AUTH ERROR] unauthorized request from %s", r.RemoteAddr)
		http.Error(w, "No autorizado", http.StatusUnauthorized)
		return
	}

	decoder := json.NewDecoder(io.LimitReader(r.Body, s.maxBody+1))
	decoder.DisallowUnknownFields()
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		http.Error(w, "Estructura JSON inválida", http.StatusBadRequest)
		return
	}
	var extra interface{}
	if err := decoder.Decode(&extra); err != io.EOF {
		http.Error(w, "Estructura JSON inválida", http.StatusBadRequest)
		return
	}
	if int64(len(raw)) > s.maxBody {
		http.Error(w, "Payload demasiado grande", http.StatusRequestEntityTooLarge)
		return
	}

	payloads, err := decodePayloads(raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	for _, payload := range payloads {
		if err := validatePayload(payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	if err := s.repository.Insert(r.Context(), payloads); err != nil {
		log.Printf("[DB ERROR] storing telemetry: %v", err)
		http.Error(w, "No se pudo guardar la telemetría", http.StatusServiceUnavailable)
		return
	}
	for _, payload := range payloads {
		if err := s.publisher.Publish(payload); err != nil {
			log.Printf("[NATS ERROR] publishing telemetry: %v", err)
			http.Error(w, "No se pudo publicar la telemetría", http.StatusServiceUnavailable)
			return
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"status":  "success",
		"message": "Telemetría guardada correctamente",
		"count":   len(payloads),
	})
}

const (
	defaultTelemetryReadLimit = 500
	maxTelemetryReadLimit     = 1000
)

func (s *Server) weatherTelemetryRead(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-API-Key") != s.apiKey {
		log.Printf("[AUTH ERROR] unauthorized request from %s", r.RemoteAddr)
		http.Error(w, "No autorizado", http.StatusUnauthorized)
		return
	}

	from, err := time.Parse(time.RFC3339, r.URL.Query().Get("from"))
	if err != nil {
		http.Error(w, "from debe ser una fecha RFC3339 válida", http.StatusBadRequest)
		return
	}
	to, err := time.Parse(time.RFC3339, r.URL.Query().Get("to"))
	if err != nil {
		http.Error(w, "to debe ser una fecha RFC3339 válida", http.StatusBadRequest)
		return
	}
	if !from.Before(to) {
		http.Error(w, "from debe ser anterior a to", http.StatusBadRequest)
		return
	}

	stationID := strings.TrimSpace(r.URL.Query().Get("station_id"))
	if len(stationID) > 64 {
		http.Error(w, "station_id debe tener como máximo 64 caracteres", http.StatusBadRequest)
		return
	}

	limit := defaultTelemetryReadLimit
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		limit, err = strconv.Atoi(rawLimit)
		if err != nil || limit <= 0 || limit > maxTelemetryReadLimit {
			http.Error(w, fmt.Sprintf("limit debe estar entre 1 y %d", maxTelemetryReadLimit), http.StatusBadRequest)
			return
		}
	}

	reader := s.reader
	if reader == nil {
		reader, _ = s.repository.(TelemetryReader)
	}
	if reader == nil {
		http.Error(w, "lectura de telemetría no disponible", http.StatusServiceUnavailable)
		return
	}
	records, err := reader.Read(r.Context(), TelemetryQuery{
		From:      from.UTC(),
		To:        to.UTC(),
		StationID: stationID,
		Limit:     limit,
	})
	if err != nil {
		log.Printf("[DB ERROR] reading telemetry: %v", err)
		http.Error(w, "No se pudo consultar la telemetría", http.StatusServiceUnavailable)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data":        records,
		"limit":       limit,
		"next_cursor": nil,
	})
}

func decodePayloads(raw json.RawMessage) ([]WeatherPayload, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return nil, fmt.Errorf("payload vacío")
	}

	if strings.HasPrefix(trimmed, "[") {
		var payloads []WeatherPayload
		if err := json.Unmarshal(raw, &payloads); err != nil {
			return nil, fmt.Errorf("estructura JSON inválida")
		}
		if len(payloads) == 0 {
			return nil, fmt.Errorf("el batch no puede estar vacío")
		}
		return payloads, nil
	}

	var payload WeatherPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("estructura JSON inválida")
	}
	return []WeatherPayload{payload}, nil
}

func validatePayload(payload WeatherPayload) error {
	if strings.TrimSpace(payload.StationID) == "" || len(payload.StationID) > 64 {
		return fmt.Errorf("station_id es requerido y debe tener como máximo 64 caracteres")
	}
	if strings.TrimSpace(payload.Location.Sector) == "" || len(payload.Location.Sector) > 64 {
		return fmt.Errorf("location.sector es requerido y debe tener como máximo 64 caracteres")
	}
	if payload.Location.Latitude < -90 || payload.Location.Latitude > 90 || payload.Location.Longitude < -180 || payload.Location.Longitude > 180 {
		return fmt.Errorf("coordenadas fuera de rango")
	}
	if payload.Timestamp <= 0 || time.Unix(payload.Timestamp, 0).After(time.Now().Add(5*time.Minute)) {
		return fmt.Errorf("timestamp inválido o futuro")
	}
	if strings.TrimSpace(payload.Status) == "" || len(payload.Status) > 32 {
		return fmt.Errorf("status es requerido y debe tener como máximo 32 caracteres")
	}
	if payload.Readings.HumidityPct < 0 || payload.Readings.HumidityPct > 100 || payload.Readings.WindSpeedKMH < 0 || payload.Readings.PM25 < 0 || payload.Readings.PM10 < 0 {
		return fmt.Errorf("las métricas no pueden tener valores negativos o humedad mayor a 100")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func databaseURL() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		url.QueryEscape(env("DB_USER", "climate_user")),
		url.QueryEscape(env("DB_PASSWORD", "climate_pass")),
		env("DB_HOST", "localhost"),
		env("DB_PORT", "5432"),
		env("DB_NAME", "climate_db"),
		env("DB_SSLMODE", "disable"),
	)
}

func natsURL() string {
	value := env("NATS_URL", "nats://localhost:4222")
	if !strings.Contains(value, "://") {
		return "nats://" + value
	}
	return value
}

func main() {
	ctx := context.Background()
	dbConfig, err := pgxpool.ParseConfig(databaseURL())
	if err != nil {
		log.Fatalf("invalid database configuration: %v", err)
	}
	dbConfig.MaxConns = 10
	dbConfig.MinConns = 1
	pool, err := pgxpool.NewWithConfig(ctx, dbConfig)
	if err != nil {
		log.Fatalf("could not create database pool: %v", err)
	}
	defer pool.Close()

	natsConnection, err := nats.Connect(natsURL())
	if err != nil {
		log.Fatalf("could not connect to NATS: %v", err)
	}
	defer natsConnection.Drain()

	server := &Server{
		apiKey:     env("WEATHER_API_KEY", "temuco_weather_secret_key"),
		repository: &PostgresRepository{pool: pool},
		reader:     &PostgresRepository{pool: pool},
		publisher:  &NATSPublisher{connection: natsConnection, subject: "weather.telemetry"},
		maxBody:    parseBodyLimit(),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", server.health)
	mux.HandleFunc("/ready", server.ready)
	mux.HandleFunc("/telemetry/weather", server.weatherTelemetry)
	mux.HandleFunc("/api/v1/telemetry/weather", server.weatherTelemetry)

	httpServer := &http.Server{
		Addr:         ":" + env("PORT", "8080"),
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("[BACKEND] climate service listening on %s", httpServer.Addr)

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Error al iniciar el servidor: %v", err)
	}
}

func parseBodyLimit() int64 {
	value, err := strconv.ParseInt(env("MAX_BODY_BYTES", "1048576"), 10, 64)
	if err != nil || value <= 0 {
		return 1048576
	}
	return value
}
