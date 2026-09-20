package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Estructuras para leer el GeoJSON
type GeoJSON struct {
	Features []Feature `json:"features"`
}

type Feature struct {
	Geometry struct {
		Coordinates []float64 `json:"coordinates"` // [lng, lat]
	} `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

// Estructura para leer la respuesta de Nominatim
type NominatimResponse struct {
	DisplayName string `json:"display_name"`
}

func main() {
	// 1. Leer el archivo GeoJSON local
	geojsonData, err := os.ReadFile("paraderos.geojson")
	if err != nil {
		log.Fatalf("Error al leer el archivo GeoJSON: %v", err)
	}

	var geojson GeoJSON
	if err := json.Unmarshal(geojsonData, &geojson); err != nil {
		log.Fatalf("Error al parsear GeoJSON: %v", err)
	}

	// 2. Crear o sobrescribir el archivo seed.sql
	sqlFile, err := os.Create("02_seed_stops.sql")
	if err != nil {
		log.Fatalf("Error al crear el archivo SQL: %v", err)
	}
	defer sqlFile.Close()

	// Escribir cabecera
	sqlFile.WriteString("-- Archivo autogenerado para importar paraderos\n")
	sqlFile.WriteString("INSERT INTO stops (stop_id, stop_name, location) VALUES\n")

	client := &http.Client{Timeout: 10 * time.Second}
	total := len(geojson.Features)

	for i, feature := range geojson.Features {
		lng := feature.Geometry.Coordinates[0]
		lat := feature.Geometry.Coordinates[1]

		// Verificar si existía la propiedad "name" en OSM
		_, hasNameProp := feature.Properties["name"]

		// Consultar a Nominatim
		displayName, err := fetchNominatimName(client, lat, lng)
		if err != nil {
			log.Printf("[%d/%d] Error en coordenadas (%.4f, %.4f): %v", i+1, total, lat, lng, err)
			displayName = "Paradero Sin Nombre"
		}

		// Procesar el display_name según las reglas
		stopName := parseDisplayName(displayName, hasNameProp)

		// Formatear el stop_id (ej: PAR-001, PAR-002...)
		stopID := fmt.Sprintf("PAR-%03d", i+1)

		// Formatear la instrucción SQL
		comma := ","
		if i == total-1 {
			comma = ";" // El último elemento lleva punto y coma
		}

		// Escapar comillas simples en los nombres para evitar errores en SQL (ej: D'Orbigny -> D''Orbigny)
		cleanStopName := strings.ReplaceAll(stopName, "'", "''")

		sqlLine := fmt.Sprintf("('%s', '%s', ST_SetSRID(ST_MakePoint(%.6f, %.6f), 4326))%s\n",
			stopID, cleanStopName, lng, lat, comma)

		sqlFile.WriteString(sqlLine)
		fmt.Printf("[%d/%d] Procesado: %s -> %s\n", i+1, total, stopID, cleanStopName)

		// RESPETAR REGLA DE NOMINATIM: Esperar 1.1 segundos entre peticiones
		time.Sleep(1100 * time.Millisecond)
	}

	fmt.Println("\n Generación completada con éxito en '02_seed_stops.sql'")
}

// fetchNominatimName realiza la consulta HTTP Reverse Geocoding
func fetchNominatimName(client *http.Client, lat, lng float64) (string, error) {
	url := fmt.Sprintf("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=%.6f&lon=%.6f", lat, lng)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}

	// Cargar .env
	err = godotenv.Load("../.env")
	if err != nil {
		log.Println("Advertencia: No se pudo cargar el archivo .env. Asegúrese de que la variable NOMINATIM_EMAIL esté configurada en el entorno.")
		return "", fmt.Errorf("no se pudo cargar el archivo .env: %v", err)
	}

	// Requisito obligatorio de Nominatim: User-Agent personalizado
	email := os.Getenv("NOMINATIM_EMAIL")
	if email == "" {
		log.Println("Advertencia: No se ha configurado la variable de entorno NOMINATIM_EMAIL. Se recomienda establecerla para cumplir con las políticas de Nominatim.")
		// Parar la ejecución si no se proporciona un email, ya que Nominatim puede bloquear solicitudes sin un User-Agent adecuado.
		return "", fmt.Errorf("no se ha configurado la variable de entorno NOMINATIM_EMAIL")
	} else {
		req.Header.Set("User-Agent", fmt.Sprintf("TemucoStopsApp/1.0 (%s)", email))
	}
	req.Header.Set("User-Agent", "TemucoStopsApp/1.0 ()")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("código de respuesta HTTP: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var nomResp NominatimResponse
	if err := json.Unmarshal(body, &nomResp); err != nil {
		return "", err
	}

	return nomResp.DisplayName, nil
}

// parseDisplayName aplica la lógica de separación de comas
func parseDisplayName(displayName string, hasNameProp bool) string {
	parts := strings.Split(displayName, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}

	if hasNameProp {
		// Si tenía la propiedad "name", tomar elementos 2 y 3 (índices 1 y 2)
		if len(parts) >= 3 {
			return fmt.Sprintf("%s, %s", parts[1], parts[2])
		} else if len(parts) == 2 {
			return parts[1]
		}
	} else {
		// Si NO tenía "name", tomar los primeros dos elementos (índices 0 y 1)
		if len(parts) >= 2 {
			return fmt.Sprintf("%s, %s", parts[0], parts[1])
		}
	}

	return displayName // Respaldo por si devuelve menos partes de las esperadas
}