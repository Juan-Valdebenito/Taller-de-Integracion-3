package load

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ─── Tipos de reporte ────────────────────────────────────────────────────────

// PhaseJSON es la representacion serializable de los resultados de una fase.
type PhaseJSON struct {
	Phase        string            `json:"phase"`
	RateTarget   uint              `json:"rateTarget"`
	DurationSecs float64           `json:"durationSecs"`
	Requests     uint64            `json:"requests"`
	SuccessRate  float64           `json:"successRate"`
	P50Ms        float64           `json:"p50Ms"`
	P95Ms        float64           `json:"p95Ms"`
	P99Ms        float64           `json:"p99Ms"`
	MaxMs        float64           `json:"maxMs"`
	MeanMs       float64           `json:"meanMs"`
	RPS          float64           `json:"rps"`
	ThroughputKB float64           `json:"throughputKB"`
	StatusCodes  map[string]int    `json:"statusCodes"`
	Errors       []string          `json:"errors,omitempty"`
}

// ReportJSON es la estructura completa del reporte exportado.
type ReportJSON struct {
	GeneratedAt string      `json:"generatedAt"`
	BaseURL     string      `json:"baseURL"`
	TotalReqs   uint64      `json:"totalRequests"`
	TotalOK     uint64      `json:"totalSuccess"`
	SuccessRate float64     `json:"overallSuccessRate"`
	Phases      []PhaseJSON `json:"phases"`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func msFloat(d time.Duration) float64 { return float64(d) / float64(time.Millisecond) }

func toPhaseJSON(r PhaseResult) PhaseJSON {
	m := r.Metrics
	codes := make(map[string]int)
	for code, cnt := range m.StatusCodes {
		codes[code] = cnt // code ya es string en vegeta
	}
	// m.Errors es []string en vegeta v12 (mensajes de error de red)
	errors := make([]string, 0, len(m.Errors))
	for _, errMsg := range m.Errors {
		errors = append(errors, errMsg)
	}
	return PhaseJSON{
		Phase:        r.Phase.Name,
		RateTarget:   r.Phase.Rate,
		DurationSecs: r.Phase.Duration.Seconds(),
		Requests:     m.Requests,
		SuccessRate:  m.Success * 100,
		P50Ms:        msFloat(m.Latencies.P50),
		P95Ms:        msFloat(m.Latencies.P95),
		P99Ms:        msFloat(m.Latencies.P99),
		MaxMs:        msFloat(m.Latencies.Max),
		MeanMs:       msFloat(m.Latencies.Mean),
		RPS:          m.Rate,
		ThroughputKB: m.Throughput / 1024,
		StatusCodes:  codes,
		Errors:       errors,
	}
}

// ─── Consola ─────────────────────────────────────────────────────────────────

func sep(ch string, n int) string { return strings.Repeat(ch, n) }

// PrintConsoleReport imprime el reporte final formateado en consola.
func PrintConsoleReport(results []PhaseResult, cfg *Config) {
	width := 65
	line := sep("=", width)
	thin := sep("-", width)

	fmt.Printf("\n%s\n", line)
	fmt.Printf("  REPORTE DE CARGA — API Go\n")
	fmt.Printf("  URL: %s\n", cfg.BaseURL)
	fmt.Printf("  Fecha: %s\n", time.Now().Format("2006-01-02 15:04:05"))
	fmt.Printf("%s\n", line)

	for _, r := range results {
		m := r.Metrics

		symbol := "OK"
		if m.Success < 0.95 {
			symbol = "!!"
		}

		fmt.Printf("\n  [%s] Fase: %-14s  (%d req/s x %s)\n",
			symbol, r.Phase.Name, r.Phase.Rate, r.Phase.Duration)
		fmt.Printf("  %s\n", thin)
		fmt.Printf("  %-22s %d\n", "Requests totales:", m.Requests)
		fmt.Printf("  %-22s %.2f%%\n", "Success rate:", m.Success*100)
		fmt.Printf("  %-22s %s\n", "Latencia p50:", m.Latencies.P50.Round(time.Millisecond))
		fmt.Printf("  %-22s %s\n", "Latencia p95:", m.Latencies.P95.Round(time.Millisecond))
		fmt.Printf("  %-22s %s\n", "Latencia p99:", m.Latencies.P99.Round(time.Millisecond))
		fmt.Printf("  %-22s %s\n", "Latencia maxima:", m.Latencies.Max.Round(time.Millisecond))
		fmt.Printf("  %-22s %.1f req/s\n", "RPS real:", m.Rate)
		fmt.Printf("  %-22s %.1f KB/s\n", "Throughput:", m.Throughput/1024)

		if len(m.StatusCodes) > 0 {
			fmt.Printf("  %-22s", "Status codes:")
			for code, cnt := range m.StatusCodes {
				fmt.Printf(" [%s]=%d", code, cnt) // code es string en vegeta
			}
			fmt.Println()
		}
		// m.Errors es []string (solo mensajes de errores de red, no HTTP)
		if len(m.Errors) > 0 {
			fmt.Printf("  %-22s\n", "Errores de red:")
			for _, errMsg := range m.Errors {
				fmt.Printf("    - %s\n", errMsg)
			}
		}
	}

	// Calcular totales
	var totalPhaseReqs uint64
	var totalPhaseOK uint64
	for _, r := range results {
		m := r.Metrics
		totalPhaseReqs += m.Requests
		totalPhaseOK += uint64(float64(m.Requests) * m.Success)
	}

	fmt.Printf("\n%s\n", line)
	fmt.Printf("  RESUMEN TOTAL\n")
	fmt.Printf("  %s\n", thin)
	fmt.Printf("  %-22s %d\n", "Requests totales:", totalPhaseReqs)
	fmt.Printf("  %-22s %d (%.2f%%)\n", "Exitosos (2xx):", totalPhaseOK,
		func() float64 {
			if totalPhaseReqs == 0 {
				return 0
			}
			return float64(totalPhaseOK) / float64(totalPhaseReqs) * 100
		}())
	fmt.Printf("  %-22s %d\n", "Fallidos:", totalPhaseReqs-totalPhaseOK)
	fmt.Printf("%s\n\n", line)
}

// ─── Exportar JSON ────────────────────────────────────────────────────────────

// ExportJSON escribe el reporte en formato JSON al directorio de salida.
func ExportJSON(results []PhaseResult, cfg *Config) (string, error) {
	phases := make([]PhaseJSON, len(results))
	var totalReqs, totalOK uint64
	for i, r := range results {
		phases[i] = toPhaseJSON(r)
		totalReqs += r.Metrics.Requests
		totalOK += uint64(float64(r.Metrics.Requests) * r.Metrics.Success)
	}

	var sr float64
	if totalReqs > 0 {
		sr = float64(totalOK) / float64(totalReqs) * 100
	}

	report := ReportJSON{
		GeneratedAt: time.Now().Format(time.RFC3339),
		BaseURL:     cfg.BaseURL,
		TotalReqs:   totalReqs,
		TotalOK:     totalOK,
		SuccessRate: sr,
		Phases:      phases,
	}

	path := filepath.Join(cfg.OutputDir, "load_report.json")
	f, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("no se pudo crear %s: %w", path, err)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(report); err != nil {
		return "", fmt.Errorf("error escribiendo JSON: %w", err)
	}
	return path, nil
}

// ─── Exportar CSV ─────────────────────────────────────────────────────────────

// ExportCSV escribe el reporte en formato CSV al directorio de salida.
func ExportCSV(results []PhaseResult, cfg *Config) (string, error) {
	path := filepath.Join(cfg.OutputDir, "load_report.csv")
	f, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("no se pudo crear %s: %w", path, err)
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	header := []string{
		"Fase", "Rate objetivo (req/s)", "Duracion (s)",
		"Requests", "Success rate (%)",
		"p50 (ms)", "p95 (ms)", "p99 (ms)", "Max (ms)", "Media (ms)",
		"RPS real", "Throughput (KB/s)",
	}
	if err := w.Write(header); err != nil {
		return "", err
	}

	for _, r := range results {
		pj := toPhaseJSON(r)
		row := []string{
			pj.Phase,
			fmt.Sprintf("%d", pj.RateTarget),
			fmt.Sprintf("%.0f", pj.DurationSecs),
			fmt.Sprintf("%d", pj.Requests),
			fmt.Sprintf("%.2f", pj.SuccessRate),
			fmt.Sprintf("%.1f", pj.P50Ms),
			fmt.Sprintf("%.1f", pj.P95Ms),
			fmt.Sprintf("%.1f", pj.P99Ms),
			fmt.Sprintf("%.1f", pj.MaxMs),
			fmt.Sprintf("%.1f", pj.MeanMs),
			fmt.Sprintf("%.1f", pj.RPS),
			fmt.Sprintf("%.1f", pj.ThroughputKB),
		}
		if err := w.Write(row); err != nil {
			return "", err
		}
	}
	return path, nil
}
