package main

// Este script lee "paraderos.geojson", aplica las reglas de selección de
// MODELO_GRAFO.md y genera el SQL del catálogo de paraderos. Los nombres salen
// de OpenStreetMap cuando son útiles; si no, se consultan a Nominatim.

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const (
	minServiceLatitude  = -38.80
	maxServiceLatitude  = -38.66
	minServiceLongitude = -72.79
	maxServiceLongitude = -72.47

	maxStopNameLength = 150
	// La política de Nominatim permite como máximo una petición por segundo.
	nominatimRequestDelay = 1100 * time.Millisecond
	baseUserAgent         = "TransitHub-UCT/1.0 (+https://github.com/Juan-Valdebenito/Taller-de-Integracion-3"
)

// loadedStopNodes son los nodos que ya están en 02_seed_stops.sql con ID propio.
var loadedStopNodes = map[string]string{
	"node/5849666578":  "PAR-CJP-01",
	"node/13236477179": "PAR-CJP-02",
	"node/13525059616": "PAR-BARROS-01",
	"node/1225240352":  "PAR-MRODRI-01",
	"node/1744986737":  "PAR-DPORT-01",
	"node/1095184204":  "PAR-CSF-01",
	"node/943207384":   "PAR-PORTAL-01",
}

// genericStopNames son nombres de OpenStreetMap que no identifican un paradero.
var genericStopNames = map[string]bool{
	"caseta amarilla":  true,
	"colectivos":       true,
	"parada":           true,
	"paradero":         true,
	"paradero autobús": true,
}

// Estructuras para leer el GeoJSON
type GeoJSON struct {
	Features []Feature `json:"features"`
}

type Feature struct {
	Geometry struct {
		Coordinates []float64 `json:"coordinates"` // [longitud, latitud]
	} `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

// NominatimAddress contiene las partes de la dirección que usa el nombre.
type NominatimAddress struct {
	Road          string `json:"road"`
	Neighbourhood string `json:"neighbourhood"`
	Suburb        string `json:"suburb"`
	City          string `json:"city"`
	Town          string `json:"town"`
	Village       string `json:"village"`
}

// Estructura para leer la respuesta de Nominatim
type NominatimResponse struct {
	Address NominatimAddress `json:"address"`
}

func main() {
	inputPath := flag.String("input", "paraderos.geojson", "archivo GeoJSON de origen")
	outputPath := flag.String("output", "03_seed_catalog.sql", "archivo SQL de salida")
	flag.Parse()

	geojsonData, err := os.ReadFile(*inputPath)
	if err != nil {
		log.Fatalf("Error al leer el archivo GeoJSON: %v", err)
	}
	var geojson GeoJSON
	if err := json.Unmarshal(geojsonData, &geojson); err != nil {
		log.Fatalf("Error al parsear el GeoJSON: %v", err)
	}

	// El archivo .env es opcional: solo agrega un correo de contacto al User-Agent.
	_ = godotenv.Load("../.env")
	userAgent := buildUserAgent(os.Getenv("NOMINATIM_EMAIL"))
	client := &http.Client{Timeout: 10 * time.Second}

	var sqlRows []string
	osmNames, nominatimNames, fallbackNames := 0, 0, 0
	for _, feature := range geojson.Features {
		osmID, _ := feature.Properties["@id"].(string)
		longitude, latitude := feature.Geometry.Coordinates[0], feature.Geometry.Coordinates[1]
		if _, alreadyLoaded := loadedStopNodes[osmID]; alreadyLoaded || !isInServiceArea(latitude, longitude) {
			continue
		}

		osmName, _ := feature.Properties["name"].(string)
		stopName := strings.TrimSpace(osmName)
		if isUsefulStopName(stopName) {
			osmNames++
		} else {
			stopName, err = fetchNominatimName(client, userAgent, latitude, longitude)
			time.Sleep(nominatimRequestDelay)
			if err != nil {
				log.Printf("Sin nombre para %s: %v", osmID, err)
			}
			if stopName == "" {
				stopName = fallbackStopName(osmID)
				fallbackNames++
			} else {
				nominatimNames++
			}
		}

		sqlRows = append(sqlRows, formatStopRow(stableStopID(osmID), stopName, latitude, longitude))
		fmt.Printf("[%d] %s -> %s\n", len(sqlRows), osmID, stopName)
	}

	if err := os.WriteFile(*outputPath, []byte(buildCatalogSQL(sqlRows)), 0o644); err != nil {
		log.Fatalf("Error al escribir el archivo SQL: %v", err)
	}
	fmt.Printf("Paraderos: %d. Nombres de OSM: %d, de Nominatim: %d, genéricos: %d\n",
		len(sqlRows), osmNames, nominatimNames, fallbackNames)
}

func isInServiceArea(latitude, longitude float64) bool {
	return latitude >= minServiceLatitude && latitude <= maxServiceLatitude &&
		longitude >= minServiceLongitude && longitude <= maxServiceLongitude
}

func isUsefulStopName(stopName string) bool {
	normalizedName := strings.ToLower(strings.TrimSpace(stopName))
	return normalizedName != "" && !genericStopNames[normalizedName]
}

// stableStopID usa el nodo de OpenStreetMap: no depende del orden del archivo.
func stableStopID(osmID string) string {
	return "PAR-OSM-" + strings.TrimPrefix(osmID, "node/")
}

func fallbackStopName(osmID string) string {
	return "Paradero " + strings.TrimPrefix(osmID, "node/")
}

func buildUserAgent(contactEmail string) string {
	if contactEmail == "" {
		return baseUserAgent + ")"
	}
	return fmt.Sprintf("%s; %s)", baseUserAgent, contactEmail)
}

// fetchNominatimName obtiene la calle y el sector de unas coordenadas.
func fetchNominatimName(client *http.Client, userAgent string, latitude, longitude float64) (string, error) {
	query := url.Values{}
	query.Set("format", "jsonv2")
	query.Set("lat", fmt.Sprintf("%.6f", latitude))
	query.Set("lon", fmt.Sprintf("%.6f", longitude))
	query.Set("zoom", "17") // Nivel de calle: evita números de casa en el nombre.

	request, err := http.NewRequest(http.MethodGet, "https://nominatim.openstreetmap.org/reverse?"+query.Encode(), nil)
	if err != nil {
		return "", err
	}
	request.Header.Set("User-Agent", userAgent)

	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("código de respuesta HTTP: %d", response.StatusCode)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return "", err
	}
	var nominatimResponse NominatimResponse
	if err := json.Unmarshal(body, &nominatimResponse); err != nil {
		return "", err
	}
	return buildStopName(nominatimResponse.Address), nil
}

// buildStopName arma "Calle, Sector". Si falta una parte, usa la disponible.
func buildStopName(address NominatimAddress) string {
	sector := firstNonEmpty(address.Neighbourhood, address.Suburb, address.City, address.Town, address.Village)
	if address.Road == "" {
		return sector
	}
	if sector == "" {
		return address.Road
	}
	return address.Road + ", " + sector
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func formatStopRow(stopID, stopName string, latitude, longitude float64) string {
	nameCharacters := []rune(stopName)
	if len(nameCharacters) > maxStopNameLength {
		stopName = string(nameCharacters[:maxStopNameLength])
	}
	// Escapa comillas simples para SQL (ej: D'Orbigny -> D''Orbigny).
	escapedName := strings.ReplaceAll(stopName, "'", "''")
	return fmt.Sprintf("('%s', '%s', ST_SetSRID(ST_MakePoint(%.6f, %.6f), 4326))", stopID, escapedName, longitude, latitude)
}

func buildCatalogSQL(sqlRows []string) string {
	return "-- Catálogo de paraderos generado por generator/generator.go\n" +
		"INSERT INTO stops (stop_id, stop_name, location) VALUES\n" +
		strings.Join(sqlRows, ",\n") +
		"\nON CONFLICT (stop_id) DO NOTHING;\n"
}
