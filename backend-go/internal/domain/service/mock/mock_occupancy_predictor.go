// Package mock provee implementaciones falsas de service.OccupancyPredictor
// para su uso exclusivo en pruebas unitarias de OccupancyService.
//
// Uso típico en un test:
//
//	predictor := &mock.MockOccupancyPredictor{
//	    PredictFunc: func(input service.OccupancyInput) (service.OccupancyResult, error) {
//	        return service.OccupancyResult{OccupancyLevel: service.OccupancyHigh}, nil
//	    },
//	}
//	svc := service.NewOccupancyService()
//	svc.SetPredictor(predictor)
package mock

import (
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

// MockOccupancyPredictor es una implementación de service.OccupancyPredictor
// controlable en tests mediante funciones inyectables.
type MockOccupancyPredictor struct {
	// PredictFunc es la función que se ejecuta cuando se llama a Predict.
	// Si es nil, Predict devuelve un OccupancyResult con valores cero sin error.
	PredictFunc func(input service.OccupancyInput) (service.OccupancyResult, error)

	// NameFunc es la función que se ejecuta cuando se llama a Name.
	// Si es nil, Name devuelve "mock-predictor".
	NameFunc func() string

	// PredictCallCount registra cuántas veces se llamó a Predict.
	PredictCallCount int

	// LastInput almacena el último OccupancyInput recibido.
	LastInput *service.OccupancyInput
}

// Predict implementa service.OccupancyPredictor.
// Delega en PredictFunc si está definida; de lo contrario devuelve resultado vacío.
func (m *MockOccupancyPredictor) Predict(input service.OccupancyInput) (service.OccupancyResult, error) {
	m.PredictCallCount++
	m.LastInput = &input

	if m.PredictFunc != nil {
		return m.PredictFunc(input)
	}

	return service.OccupancyResult{}, nil
}

// Name implementa service.OccupancyPredictor.
func (m *MockOccupancyPredictor) Name() string {
	if m.NameFunc != nil {
		return m.NameFunc()
	}
	return "mock-predictor"
}

// Reset reinicia los contadores del mock entre subtests.
func (m *MockOccupancyPredictor) Reset() {
	m.PredictCallCount = 0
	m.LastInput = nil
}

// ── Verify compile-time interface satisfaction ────────────────────────────────
var _ service.OccupancyPredictor = (*MockOccupancyPredictor)(nil)
