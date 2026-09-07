// Package load contiene el script de pruebas de carga para la API REST Go.
// Uso: go run ./tests/load/ --base-url=http://localhost:3001 --email=admin@test.com --password=secret
package load

import (
	"flag"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Phase representa una fase de carga: rate (req/s) y duration.
type Phase struct {
	Name     string
	Rate     uint
	Duration time.Duration
}

// Config contiene toda la configuracion del script de carga.
type Config struct {
	BaseURL    string
	Email      string
	Password   string
	OutputDir  string
	PublicOnly bool
	Timeout    time.Duration
	Phases     []Phase
	Workers    uint
}

// DefaultPhases devuelve las fases predeterminadas de ramp-up.
func DefaultPhases() []Phase {
	return []Phase{
		{Name: "Warm-up",      Rate: 10,  Duration: 15 * time.Second},
		{Name: "Carga normal", Rate: 50,  Duration: 30 * time.Second},
		{Name: "Pico",        Rate: 100, Duration: 20 * time.Second},
		{Name: "Estres",      Rate: 200, Duration: 15 * time.Second},
		{Name: "Cool-down",   Rate: 20,  Duration: 10 * time.Second},
	}
}

// parsePhases parsea el string "10:15,50:30" a []Phase.
// Formato: rate_req_por_s:duracion_en_s separados por coma.
func parsePhases(raw string) ([]Phase, error) {
	if raw == "" {
		return DefaultPhases(), nil
	}
	names := []string{"Warm-up", "Carga normal", "Pico", "Estres", "Cool-down"}
	var phases []Phase
	for i, p := range strings.Split(raw, ",") {
		kv := strings.Split(strings.TrimSpace(p), ":")
		if len(kv) != 2 {
			return nil, fmt.Errorf("fase %d invalida: %q (formato esperado: rate:segundos)", i+1, p)
		}
		rate, err := strconv.ParseUint(strings.TrimSpace(kv[0]), 10, 64)
		if err != nil || rate == 0 {
			return nil, fmt.Errorf("fase %d: rate invalido %q", i+1, kv[0])
		}
		secs, err := strconv.ParseUint(strings.TrimSpace(kv[1]), 10, 64)
		if err != nil || secs == 0 {
			return nil, fmt.Errorf("fase %d: duracion invalida %q", i+1, kv[1])
		}
		name := fmt.Sprintf("Fase %d", i+1)
		if i < len(names) {
			name = names[i]
		}
		phases = append(phases, Phase{
			Name:     name,
			Rate:     uint(rate),
			Duration: time.Duration(secs) * time.Second,
		})
	}
	return phases, nil
}

// ParseFlags parsea los argumentos de linea de comandos y retorna Config.
func ParseFlags() (*Config, error) {
	baseURL    := flag.String("base-url",   "http://localhost:3001", "URL base del servidor (sin barra final)")
	email      := flag.String("email",      "",                      "Email del usuario para login")
	password   := flag.String("password",   "",                      "Contrasena del usuario")
	outputDir  := flag.String("output",     ".",                     "Directorio donde se guardaran los reportes JSON y CSV")
	publicOnly := flag.Bool("public-only",  false,                   "Solo testear endpoints publicos (sin login)")
	timeout    := flag.Duration("timeout",  30*time.Second,          "Timeout por request")
	phasesRaw  := flag.String("phases",     "",                      "Fases custom: 'rate:seg,...' (ej: '10:15,50:30')")
	workers    := flag.Uint("workers",      10,                      "Numero de workers concurrentes de vegeta")
	flag.Parse()

	phases, err := parsePhases(*phasesRaw)
	if err != nil {
		return nil, fmt.Errorf("error parseando fases: %w", err)
	}
	if !*publicOnly && (*email == "" || *password == "") {
		return nil, fmt.Errorf("se requieren --email y --password (o usa --public-only para omitir auth)")
	}
	return &Config{
		BaseURL:    strings.TrimRight(*baseURL, "/"),
		Email:      *email,
		Password:   *password,
		OutputDir:  *outputDir,
		PublicOnly: *publicOnly,
		Timeout:    *timeout,
		Phases:     phases,
		Workers:    *workers,
	}, nil
}
