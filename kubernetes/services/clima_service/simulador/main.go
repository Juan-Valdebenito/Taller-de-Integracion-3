package main

import (
	"bytes"
	"encoding/json"
	//"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
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
	TemperatureC float64 `json:"temperature_c"`
	HumidityPct  float64 `json:"humidity_pct"`
	WindSpeedKMH float64 `json:"wind_speed_kmh"`
	PM25         float64 `json:"pm25_ug_m3"`
	PM10         float64 `json:"pm10_ug_m3"`
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
	apiEndpoint string
	apiKey      string
	httpClient  *http.Client
}

func NewWeatherManager(endpoint, apiKey string) *WeatherManager {
	return &WeatherManager{
		apiEndpoint: endpoint,
		apiKey:      apiKey,
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

// StartStation ejecuta la simulación continua de una estación
func (m *WeatherManager) StartStation(config StationConfig, stopChan <-chan struct{}) {
	ticker := time.NewTicker(time.Duration(config.IntervalSeconds) * time.Second)
	defer ticker.Stop()

	log.Printf("[MANAGER] Iniciado sensor %s (%s) cada %ds", config.StationID, config.Sector, config.IntervalSeconds)

	for {
		select {
		case <-ticker.C:
			// Generar lectura simulated
			payload := m.generateReadings(config)
			// Enviar al backend HTTP
			m.sendTelemetry(payload)
		case <-stopChan:
			log.Printf("[MANAGER] Deteniendo sensor %s", config.StationID)
			return
		}
	}
}

// Generador temporal de lecturas (se mejorará con el algoritmo de humo de Temuco)
func (m *WeatherManager) generateReadings(config StationConfig) WeatherPayload {
	now := time.Now()
	hour := now.Hour()

	// Simulación básica de humo MP2.5 en horas frías (18:00 - 23:00)
	basePM25 := 25.0
	if hour >= 18 || hour <= 2 {
		basePM25 = 85.0 + rand.Float64()*40.0 // Pico por humo de leña
	}

	return WeatherPayload{
		StationID: config.StationID,
		Location: Location{
			Latitude:  config.Latitude,
			Longitude: config.Longitude,
			Sector:    config.Sector,
		},
		Readings: SensorReadings{
			TemperatureC: 8.0 + rand.Float64()*4.0,
			HumidityPct:  85.0 + rand.Float64()*10.0,
			WindSpeedKMH: 5.0 + rand.Float64()*15.0,
			PM25:         basePM25,
			PM10:         basePM25 * 1.4,
		},
		Status:    "OPERATIONAL",
		Timestamp: now.Unix(),
	}
}

// Envió HTTP POST
func (m *WeatherManager) sendTelemetry(payload WeatherPayload) {
	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[ERROR] Serializando JSON: %v", err)
		return
	}

	req, err := http.NewRequest("POST", m.apiEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("[ERROR] Creando request: %v", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", m.apiKey)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		log.Printf("[HTTP ERROR] %s: No se pudo conectar con el backend (%v)", payload.StationID, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusAccepted || resp.StatusCode == http.StatusOK {
		log.Printf("[HTTP %d] Telemetría enviada -> %s (MP2.5: %.1f µg/m³)", resp.StatusCode, payload.StationID, payload.Readings.PM25)
	} else {
		log.Printf("[HTTP %d] Error en respuesta del servidor para %s", resp.StatusCode, payload.StationID)
	}
}

func main() {
	// Cargar archivo de configuración
	configFile, err := os.ReadFile("config.json")
	if err != nil {
		log.Fatalf("No se pudo leer config.json: %v", err)
	}

	var stations []StationConfig
	if err := json.Unmarshal(configFile, &stations); err != nil {
		log.Fatalf("Error al parsear config.json: %v", err)
	}

	// Inicializar Manager
	apiURL := "http://localhost:8080/api/v1/telemetry/weather"
	apiKey := "temuco_weather_secret_key"
	manager := NewWeatherManager(apiURL, apiKey)

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
	time.Sleep(1 * time.Second) // Tiempo para limpiar goroutines
}