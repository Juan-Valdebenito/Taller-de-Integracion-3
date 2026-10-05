// Script de pruebas de carga para la API REST Go.
// Uso: go run ./tests/load/ --base-url=http://localhost:3001 --email=admin@test.com --password=secret
package load

import (
	"fmt"
	"os"
)

// Run es el punto de entrada del script de carga.
// Se llama desde cmd/loadtest/main.go.
func Run() {
	cfg, err := ParseFlags()
	if err != nil {
		fmt.Fprintf(os.Stderr, "\nError de configuracion: %s\n\n", err)
		fmt.Fprintln(os.Stderr, "Uso:")
		fmt.Fprintln(os.Stderr, "  go run ./tests/load/cmd/ --base-url=http://localhost:3001 --email=admin@test.com --password=secret")
		fmt.Fprintln(os.Stderr, "  go run ./tests/load/cmd/ --public-only")
		os.Exit(1)
	}

	printBanner(cfg)

	// ── Login ──────────────────────────────────────────────────────────────
	var token string
	if !cfg.PublicOnly {
		fmt.Printf("Haciendo login como %s...\n", cfg.Email)
		token, err = Login(cfg.BaseURL, cfg.Email, cfg.Password)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error en login: %s\n", err)
			fmt.Fprintln(os.Stderr, "Tip: usa --public-only para testear solo endpoints publicos.")
			os.Exit(1)
		}
		fmt.Printf("Login exitoso. JWT obtenido (primeros 30 chars): %s...\n\n", token[:min(30, len(token))])
	} else {
		fmt.Println("Modo publico: solo se testean endpoints sin autenticacion.\n")
	}

	// ── Targets ───────────────────────────────────────────────────────────
	targeter := BuildTargets(cfg, token)

	// ── Fases ─────────────────────────────────────────────────────────────
	fmt.Printf("Ejecutando %d fases de carga...\n", len(cfg.Phases))
	results := RunAllPhases(cfg, targeter)

	// ── Reporte consola ───────────────────────────────────────────────────
	PrintConsoleReport(results, cfg)

	// ── Exportar JSON ─────────────────────────────────────────────────────
	jsonPath, err := ExportJSON(results, cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Aviso: no se pudo exportar JSON: %s\n", err)
	} else {
		fmt.Printf("Reporte JSON exportado: %s\n", jsonPath)
	}

	// ── Exportar CSV ──────────────────────────────────────────────────────
	csvPath, err := ExportCSV(results, cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Aviso: no se pudo exportar CSV: %s\n", err)
	} else {
		fmt.Printf("Reporte CSV exportado:  %s\n", csvPath)
	}

	fmt.Println("\nPrueba de carga completada.")
}

func printBanner(cfg *Config) {
	fmt.Println()
	fmt.Println("================================================================")
	fmt.Println("  SCRIPT DE PRUEBAS DE CARGA — API REST Go")
	fmt.Println("================================================================")
	fmt.Printf("  URL base  : %s\n", cfg.BaseURL)
	fmt.Printf("  Workers   : %d\n", cfg.Workers)
	fmt.Printf("  Timeout   : %s\n", cfg.Timeout)
	if cfg.PublicOnly {
		fmt.Printf("  Modo      : Solo endpoints publicos\n")
	} else {
		fmt.Printf("  Modo      : Publicos + Autenticados (JWT)\n")
	}
	fmt.Printf("  Fases     : %d\n", len(cfg.Phases))
	for i, p := range cfg.Phases {
		fmt.Printf("    %d. %-14s %3d req/s x %s\n", i+1, p.Name, p.Rate, p.Duration)
	}
	fmt.Println("================================================================")
	fmt.Println()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
