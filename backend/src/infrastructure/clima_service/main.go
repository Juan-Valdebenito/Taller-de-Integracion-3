package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// Estructuras para deserializar el JSON de telemetría del simulador
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

// Configuración básica del servidor
const (
	serverPort = ":8080"
	expectedKey = "temuco_weather_secret_key"
)

// WeatherTelemetryHandler procesa las peticiones POST de los sensores climáticos
func WeatherTelemetryHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Validar que el método sea exclusivamente POST
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	// 2. Validar autenticación mediante el Header X-API-Key
	apiKey := r.Header.Get("X-API-Key")
	if apiKey != expectedKey {
		log.Printf("[AUTH ERROR] Intento de acceso no autorizado desde %s (Key inválda)", r.RemoteAddr)
		http.Error(w, "No autorizado", http.StatusUnauthorized)
		return
	}

	// 3. Leer el cuerpo de la petición HTTP
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[READ ERROR] Error al leer el cuerpo de la petición: %v", err)
		http.Error(w, "Error al leer payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// 4. Deserializar el JSON recibido
	var payload WeatherPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		log.Printf("[JSON ERROR] Formato JSON inválido: %v", err)
		http.Error(w, "Estructura JSON inválida", http.StatusBadRequest)
		return
	}

	// 5. Imprimir en consola la recepción correcta (Simulación de procesamiento)
	readingTime := time.Unix(payload.Timestamp, 0).Format("15:04:05")
	log.Printf("[OK] Telemetría recibida | Estación: %-25s | Sector: %-22s | Temp: %.1f°C | MP2.5: %.1f µg/m³ | Hora Lectura: %s",
		payload.StationID,
		payload.Location.Sector,
		payload.Readings.TemperatureC,
		payload.Readings.PM25,
		readingTime,
	)

	// 6. Responder al cliente/simulador con 202 Accepted
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	fmt.Fprintln(w, `{"status":"success","message":"Telemetria recibida correctamente"}`)
}

func main() {
	// Registro de rutas en el Mux
	http.HandleFunc("/api/v1/telemetry/weather", WeatherTelemetryHandler)

	server := &http.Server{
		Addr:         serverPort,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("[BACKEND] Servidor receptor iniciado en http://localhost%s", serverPort)
	log.Printf("[BACKEND] Esperando datos en /api/v1/telemetry/weather...")

	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Error al iniciar el servidor: %v", err)
	}
}