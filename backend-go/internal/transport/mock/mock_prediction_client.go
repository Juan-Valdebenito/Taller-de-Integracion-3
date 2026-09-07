// Package mock provee implementaciones falsas de transport.PredictionClient
// para su uso exclusivo en pruebas unitarias.
//
// Uso típico en un test:
//
//	mock := &mock.MockPredictionClient{
//	    PredictFunc: func(ctx context.Context, req transport.PredictRequest) (*transport.PredictResponse, error) {
//	        return &transport.PredictResponse{
//	            PredictedRatio: 0.75,
//	            OccupancyLevel: "HIGH",
//	        }, nil
//	    },
//	}
//	svc := service.NewOccupancyService()
//	svc.SetPredictor(service.NewMLRemotePredictor(mock))
package mock

import (
	"context"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
)

// MockPredictionClient es una implementación de transporte.PredictionClient
// controlable en tests mediante funciones inyectables.
//
// Patrón: función-como-campo (functional mock) — sin dependencia de testify/mock.
// Esto mantiene los tests ligeros y sin frameworks externos.
type MockPredictionClient struct {
	// PredictFunc es la función que se ejecuta cuando se llama a Predict.
	// Si es nil, Predict devuelve un PredictResponse vacío sin error.
	PredictFunc func(ctx context.Context, req transport.PredictRequest) (*transport.PredictResponse, error)

	// CloseFunc es la función que se ejecuta cuando se llama a Close.
	// Si es nil, Close devuelve nil.
	CloseFunc func() error

	// PredictCallCount registra cuántas veces se llamó a Predict.
	// Útil para verificar que el cliente fue invocado el número esperado de veces.
	PredictCallCount int

	// LastPredictRequest almacena el último PredictRequest recibido.
	// Permite verificar los argumentos de la llamada sin captura de closures.
	LastPredictRequest *transport.PredictRequest
}

// Predict implementa transport.PredictionClient.
// Delega en PredictFunc si está definida; de lo contrario devuelve respuesta vacía.
func (m *MockPredictionClient) Predict(ctx context.Context, req transport.PredictRequest) (*transport.PredictResponse, error) {
	m.PredictCallCount++
	m.LastPredictRequest = &req

	if m.PredictFunc != nil {
		return m.PredictFunc(ctx, req)
	}

	// Respuesta por defecto: ocupación media del 50%
	return &transport.PredictResponse{
		PredictedRatio:      0.5,
		PredictedPassengers: req.Capacity / 2,
		OccupancyLevel:      "MEDIUM",
		Confidence:          0.8,
		PredictorName:       "mock-predictor",
		PredictedAt:         "2026-01-01T00:00:00Z",
	}, nil
}

// Close implementa transport.PredictionClient.
// Delega en CloseFunc si está definida; de lo contrario devuelve nil.
func (m *MockPredictionClient) Close() error {
	if m.CloseFunc != nil {
		return m.CloseFunc()
	}
	return nil
}

// Reset reinicia los contadores y el estado del mock entre subtests.
func (m *MockPredictionClient) Reset() {
	m.PredictCallCount = 0
	m.LastPredictRequest = nil
}

// ── Verify que MockPredictionClient implementa la interfaz ───────────────────
// Esta línea no compila si MockPredictionClient no satisface PredictionClient,
// lo que garantiza que el mock permanece sincronizado con la interfaz real.
var _ transport.PredictionClient = (*MockPredictionClient)(nil)
