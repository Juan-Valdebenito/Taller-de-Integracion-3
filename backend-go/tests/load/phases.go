package load

import (
	"fmt"
	"time"

	vegeta "github.com/tsenart/vegeta/v12/lib"
)

// PhaseResult almacena las metricas de una fase de carga completada.
type PhaseResult struct {
	Phase    Phase
	Metrics  vegeta.Metrics
	Duration time.Duration
}

// RunPhase ejecuta una sola fase de carga y retorna sus metricas.
func RunPhase(phase Phase, targeter vegeta.Targeter, workers uint, timeout time.Duration) PhaseResult {
	rate := vegeta.Rate{Freq: int(phase.Rate), Per: time.Second}
	attacker := vegeta.NewAttacker(
		vegeta.Workers(uint64(workers)),
		vegeta.Timeout(timeout),
		vegeta.KeepAlive(true),
	)

	var metrics vegeta.Metrics
	start := time.Now()

	for res := range attacker.Attack(targeter, rate, phase.Duration, phase.Name) {
		metrics.Add(res)
	}
	metrics.Close()

	return PhaseResult{
		Phase:    phase,
		Metrics:  metrics,
		Duration: time.Since(start),
	}
}

// RunAllPhases ejecuta todas las fases secuencialmente con una pausa entre ellas.
// Imprime progreso en tiempo real.
func RunAllPhases(cfg *Config, targeter vegeta.Targeter) []PhaseResult {
	results := make([]PhaseResult, 0, len(cfg.Phases))
	total := len(cfg.Phases)

	for i, phase := range cfg.Phases {
		fmt.Printf("\n[%d/%d] Ejecutando fase: %s (rate=%d req/s, duracion=%s)\n",
			i+1, total, phase.Name, phase.Rate, phase.Duration)
		fmt.Print("  Progreso: ")

		// Ticker visual de progreso
		done := make(chan struct{})
		go func() {
			ticker := time.NewTicker(2 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					fmt.Print(".")
				}
			}
		}()

		result := RunPhase(phase, targeter, cfg.Workers, cfg.Timeout)
		close(done)
		fmt.Println(" hecho!")

		// Resumen rapido en tiempo real
		m := result.Metrics
		fmt.Printf("  Success: %.2f%% | p50: %s | p95: %s | p99: %s | RPS: %.1f\n",
			m.Success*100,
			m.Latencies.P50.Round(time.Millisecond),
			m.Latencies.P95.Round(time.Millisecond),
			m.Latencies.P99.Round(time.Millisecond),
			m.Rate,
		)

		results = append(results, result)

		// Pausa de 2s entre fases (excepto despues de la ultima)
		if i < total-1 {
			fmt.Printf("  Pausa de 2s antes de la siguiente fase...\n")
			time.Sleep(2 * time.Second)
		}
	}

	return results
}
