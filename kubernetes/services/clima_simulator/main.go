package main

// Productor de datos de clima de desarrollo. Consulta Open-Meteo y publica las
// lecturas con el esquema del servicio para probar la API y la persistencia.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

// StationConfig define la configuración inicial de cada sensor
type StationConfig struct {
	StationID       string  `json:"station_id"`
	Sector          string  `json:"sector"`
	Latitude        float64 `json:"latitude"`
	Longitude       float64 `json:"longitude"`
	IntervalSeconds int     `json:"interval_seconds"`
}

// Location DTO para la API
type Location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Sector    string  `json:"sector"`
}

// SensorReadings DTO para la API
type SensorReadings struct {
	TemperatureC  float64 `json:"temperature_c"`
	HumidityPct   float64 `json:"humidity_pct"`
	WindSpeedKMH  float64 `json:"wind_speed_kmh"`
	Precipitation float64 `json:"precipitation_mm"`
	PM25          float64 `json:"pm25_ug_m3"`
	PM10          float64 `json:"pm10_ug_m3"`
}

// WeatherPayload representa el JSON enviado al backend
type WeatherPayload struct {
	StationID string         `json:"station_id"`
	Location  Location       `json:"location"`
	Readings  SensorReadings `json:"sensor_readings"`
	Status    string         `json:"status"`
	Timestamp int64          `json:"timestamp"`
}

// WeatherManager orquesta las estaciones concurrentes
type WeatherManager struct {
	apiEndpoint      string
	apiKey           string
	weatherAPIURL    string
	airQualityAPIURL string
	refreshInterval  time.Duration
	maxStaleness     time.Duration
	httpClient       *http.Client
}

func NewWeatherManager(endpoint, apiKey string) *WeatherManager {
	return &WeatherManager{
		apiEndpoint:      endpoint,
		apiKey:           apiKey,
		weatherAPIURL:    "https://api.open-meteo.com/v1/forecast",
		airQualityAPIURL: "https://air-quality-api.open-meteo.com/v1/air-quality",
		refreshInterval:  15 * time.Minute,
		maxStaleness:     time.Hour,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

type openMeteoCurrent struct {
	Time          *int64   `json:"time"`
	TemperatureC  *float64 `json:"temperature_2m"`
	HumidityPct   *float64 `json:"relative_humidity_2m"`
	WindSpeedKMH  *float64 `json:"wind_speed_10m"`
	Precipitation *float64 `json:"precipitation"`
	PM25          *float64 `json:"pm2_5"`
	PM10          *float64 `json:"pm10"`
}

type openMeteoResponse struct {
	Current openMeteoCurrent `json:"current"`
}

type stationReadingCache struct {
	payload   WeatherPayload
	fetchedAt time.Time
}

func (c *stationReadingCache) update(payload WeatherPayload, fetchedAt time.Time) {
	c.payload = payload
	c.fetchedAt = fetchedAt
}

func (c stationReadingCache) readingAt(now time.Time, maxStaleness time.Duration) (WeatherPayload, bool) {
	if c.fetchedAt.IsZero() || maxStaleness <= 0 || now.Before(c.fetchedAt) || now.Sub(c.fetchedAt) > maxStaleness {
		return WeatherPayload{}, false
	}
	return c.payload, true
}

// StartStation publica los datos cacheados de una estación.
func (m *WeatherManager) StartStation(config StationConfig, stopChan <-chan struct{}) {
	if config.IntervalSeconds <= 0 {
		log.Printf("[MANAGER] Intervalo inválido para %s: %d", config.StationID, config.IntervalSeconds)
		return
	}
	if m.refreshInterval <= 0 || m.maxStaleness <= 0 {
		log.Printf("[MANAGER] Intervalo Open-Meteo inválido para %s", config.StationID)
		return
	}

	ticker := time.NewTicker(time.Duration(config.IntervalSeconds) * time.Second)
	defer ticker.Stop()
	refreshTicker := time.NewTicker(m.refreshInterval)
	defer refreshTicker.Stop()

	log.Printf("[MANAGER] Iniciado sensor %s (%s) cada %ds", config.StationID, config.Sector, config.IntervalSeconds)
	cache := stationReadingCache{}
	staleWarningLogged := false
	refresh := func() {
		payload, err := m.fetchReadings(config)
		if err != nil {
			log.Printf("[OPEN-METEO] No se pudo actualizar %s: %v", config.StationID, err)
			return
		}
		cache.update(payload, time.Now())
		staleWarningLogged = false
	}
	refresh()

	for {
		select {
		case <-ticker.C:
			payload, ok := cache.readingAt(time.Now(), m.maxStaleness)
			if !ok {
				if !cache.fetchedAt.IsZero() && !staleWarningLogged {
					log.Printf("[OPEN-METEO] Datos vencidos para %s; se omite telemetría hasta actualizar", config.StationID)
					staleWarningLogged = true
				}
				continue
			}
			m.sendTelemetry(payload)
		case <-refreshTicker.C:
			refresh()
		case <-stopChan:
			log.Printf("[MANAGER] Deteniendo sensor %s", config.StationID)
			return
		}
	}
}

func (m *WeatherManager) fetchReadings(config StationConfig) (WeatherPayload, error) {
	weather, err := m.fetchCurrent(m.weatherAPIURL, config, "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation")
	if err != nil {
		return WeatherPayload{}, fmt.Errorf("consultando clima: %w", err)
	}
	airQuality, err := m.fetchCurrent(m.airQualityAPIURL, config, "pm2_5,pm10")
	if err != nil {
		return WeatherPayload{}, fmt.Errorf("consultando calidad del aire: %w", err)
	}
	current := weather.Current
	air := airQuality.Current
	if current.Time == nil || current.TemperatureC == nil || current.HumidityPct == nil || current.WindSpeedKMH == nil || current.Precipitation == nil {
		return WeatherPayload{}, fmt.Errorf("respuesta de clima incompleta")
	}
	if air.Time == nil || air.PM25 == nil || air.PM10 == nil {
		return WeatherPayload{}, fmt.Errorf("respuesta de calidad del aire incompleta")
	}
	if *current.Time <= 0 || *air.Time <= 0 {
		return WeatherPayload{}, fmt.Errorf("respuesta contiene timestamps inválidos")
	}
	if *current.HumidityPct < 0 || *current.HumidityPct > 100 || *current.WindSpeedKMH < 0 || *current.Precipitation < 0 || *air.PM25 < 0 || *air.PM10 < 0 {
		return WeatherPayload{}, fmt.Errorf("respuesta contiene métricas fuera del contrato")
	}

	validAt := time.Unix(*current.Time, 0)
	if airValidAt := time.Unix(*air.Time, 0); airValidAt.Before(validAt) {
		validAt = airValidAt
	}
	if validAt.After(time.Now().Add(5 * time.Minute)) {
		return WeatherPayload{}, fmt.Errorf("respuesta contiene un timestamp futuro")
	}
	return WeatherPayload{
		StationID: config.StationID,
		Location: Location{
			Latitude:  config.Latitude,
			Longitude: config.Longitude,
			Sector:    config.Sector,
		},
		Readings: SensorReadings{
			TemperatureC:  *current.TemperatureC,
			HumidityPct:   *current.HumidityPct,
			WindSpeedKMH:  *current.WindSpeedKMH,
			Precipitation: *current.Precipitation,
			PM25:          *air.PM25,
			PM10:          *air.PM10,
		},
		Status:    "OPERATIONAL",
		Timestamp: validAt.Unix(),
	}, nil
}

func (m *WeatherManager) fetchCurrent(endpoint string, config StationConfig, variables string) (openMeteoResponse, error) {
	parsedURL, err := url.Parse(endpoint)
	if err != nil {
		return openMeteoResponse{}, fmt.Errorf("URL inválida: %w", err)
	}
	query := parsedURL.Query()
	query.Set("latitude", strconv.FormatFloat(config.Latitude, 'f', -1, 64))
	query.Set("longitude", strconv.FormatFloat(config.Longitude, 'f', -1, 64))
	query.Set("current", variables)
	query.Set("temperature_unit", "celsius")
	query.Set("wind_speed_unit", "kmh")
	query.Set("timeformat", "unixtime")
	parsedURL.RawQuery = query.Encode()

	resp, err := m.httpClient.Get(parsedURL.String())
	if err != nil {
		return openMeteoResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return openMeteoResponse{}, fmt.Errorf("HTTP %d desde %s", resp.StatusCode, parsedURL.Host)
	}

	var response openMeteoResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&response); err != nil {
		return openMeteoResponse{}, fmt.Errorf("JSON inválido: %w", err)
	}
	return response, nil
}

// Envió HTTP POST
func (m *WeatherManager) sendTelemetry(payload WeatherPayload) {
	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[ERROR] Serializando JSON: %v", err)
		return
	}

	for attempt := 1; attempt <= 3; attempt++ {
		req, err := http.NewRequest(http.MethodPost, m.apiEndpoint, bytes.NewReader(jsonData))
		if err != nil {
			log.Printf("[ERROR] Creando request: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-API-Key", m.apiKey)

		resp, err := m.httpClient.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusAccepted || resp.StatusCode == http.StatusOK {
				log.Printf("[HTTP %d] Telemetría enviada -> %s (PM2.5: %.1f)", resp.StatusCode, payload.StationID, payload.Readings.PM25)
				return
			}
			if resp.StatusCode < http.StatusInternalServerError {
				log.Printf("[HTTP %d] Error permanente para %s", resp.StatusCode, payload.StationID)
				return
			}
			log.Printf("[HTTP %d] Error temporal para %s, intento %d/3", resp.StatusCode, payload.StationID, attempt)
		} else {
			log.Printf("[HTTP ERROR] %s: intento %d/3: %v", payload.StationID, attempt, err)
		}

		if attempt < 3 {
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
		}
	}
}

func main() {
	configPath := env("STATIONS_CONFIG", "config.json")
	configFile, err := os.ReadFile(configPath)
	if err != nil {
		log.Fatalf("No se pudo leer config.json: %v", err)
	}

	var stations []StationConfig
	if err := json.Unmarshal(configFile, &stations); err != nil {
		log.Fatalf("Error al parsear config.json: %v", err)
	}
	if len(stations) == 0 {
		log.Fatal("La configuración no contiene estaciones")
	}

	apiURL := env("WEATHER_API_URL", "http://localhost:8080/api/v1/telemetry/weather")
	apiKey := env("WEATHER_API_KEY", "temuco_weather_secret_key")
	manager := NewWeatherManager(apiURL, apiKey)
	manager.weatherAPIURL = env("OPEN_METEO_WEATHER_URL", manager.weatherAPIURL)
	manager.airQualityAPIURL = env("OPEN_METEO_AIR_QUALITY_URL", manager.airQualityAPIURL)
	manager.refreshInterval = durationSecondsFromEnv("OPEN_METEO_REFRESH_INTERVAL_SECONDS", manager.refreshInterval)
	manager.maxStaleness = durationSecondsFromEnv("OPEN_METEO_MAX_STALENESS_SECONDS", manager.maxStaleness)

	stopChan := make(chan struct{})

	// Lanzar una Goroutine por cada estación de la lista
	for _, station := range stations {
		go manager.StartStation(station, stopChan)
	}

	// Manejo de apagado controlado mediante señales del SO (SIGINT, SIGTERM)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("[MANAGER] Cerrando simulador de estaciones climáticas...")
	close(stopChan)
	time.Sleep(1 * time.Second)
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func durationSecondsFromEnv(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		log.Fatalf("%s debe ser un entero positivo: %q", key, value)
	}
	return time.Duration(seconds) * time.Second
}
