// Package transport provee la capa de comunicación desacoplada para la
// integración con microservicios externos, en particular el servidor de
// predicción de ocupación ML.
//
// Arquitectura (patrón Strategy):
//
//	OccupancyService
//	      │
//	      └─► PredictionClient (interfaz)
//	                ├─► GRPCPredictionClient  (google.golang.org/grpc)
//	                └─► HTTPPredictionClient  (net/http estándar)
//
// El transport activo se selecciona mediante la factory NewPredictionClient,
// que lee la variable de entorno PREDICTION_TRANSPORT (grpc | http).
package transport

import (
	"context"
	"time"
)

// ── DTOs desacoplados del transporte ──────────────────────────────────────────
// Estos tipos son independientes del proto generado y de los tipos de dominio.
// Actúan como frontera anti-corrupción entre capas.

// PredictRequest contiene la información necesaria para solicitar
// una predicción de ocupación al microservicio externo.
type PredictRequest struct {
	// RouteID es el identificador de la ruta de transporte.
	RouteID string

	// CurrentPassengers es el número de pasajeros actuales en el bus.
	CurrentPassengers int

	// Capacity es la capacidad máxima del bus.
	Capacity int

	// Hour es la hora del día (0-23). Si es nil se usa la hora actual del sistema.
	Hour *int

	// DayOfWeek es el día de la semana (0=Dom … 6=Sáb).
	// Si es nil se usa el día actual del sistema.
	DayOfWeek *int
}

// PredictResponse contiene el resultado de la predicción devuelto
// por el microservicio externo, normalizado para el dominio Go.
type PredictResponse struct {
	// PredictedRatio es el ratio de ocupación proyectado (0.0–1.0).
	PredictedRatio float64

	// PredictedPassengers es el número de pasajeros proyectados.
	PredictedPassengers int

	// OccupancyLevel clasifica la ocupación: LOW | MEDIUM | HIGH | FULL.
	OccupancyLevel string

	// Confidence es la confianza del modelo (0.0–1.0).
	Confidence float64

	// PredictorName identifica el modelo/versión que produjo la predicción.
	PredictorName string

	// PredictedAt es el timestamp ISO-8601 de cuando se realizó la predicción.
	PredictedAt string

	// Latency es el tiempo de round-trip de la llamada remota (diagnóstico).
	Latency time.Duration
}

// ── Interfaz del cliente (contrato del patrón Strategy) ───────────────────────

// PredictionClient abstrae el transporte subyacente (gRPC o HTTP) para
// comunicarse con el microservicio de predicción de ocupación.
//
// Toda la lógica de negocio que necesite hacer predicciones remotas
// debe depender de esta interfaz, no de una implementación concreta.
//
// Uso típico:
//
//	client, err := transport.NewPredictionClient(cfg)
//	if err != nil { ... }
//	defer client.Close()
//
//	resp, err := client.Predict(ctx, transport.PredictRequest{...})
type PredictionClient interface {
	// Predict envía una solicitud de predicción al microservicio externo
	// y devuelve el resultado normalizado.
	//
	// El contexto permite controlar el timeout y la cancelación de la llamada.
	// Se recomienda usar context.WithTimeout para garantizar SLAs.
	Predict(ctx context.Context, req PredictRequest) (*PredictResponse, error)

	// Close libera los recursos subyacentes (conexión gRPC, pool HTTP, etc.).
	// Debe llamarse al finalizar el uso del cliente, típicamente con defer.
	Close() error
}
