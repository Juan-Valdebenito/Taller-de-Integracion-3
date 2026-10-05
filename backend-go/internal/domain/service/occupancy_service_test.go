package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	servicemock "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service/mock"
	transportmock "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport/mock"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
)

// ── OccupancyService tests ────────────────────────────────────────────────────

// TestOccupancyService_DefaultPredictor_IsHeuristic verifica que el predictor
// por defecto es el heurístico y devuelve resultados válidos.
func TestOccupancyService_DefaultPredictor_IsHeuristic(t *testing.T) {
	svc := service.NewOccupancyService()

	hour := 8
	dow := 1
	result, err := svc.Predict(service.OccupancyInput{
		CurrentPassengers: 30,
		Capacity:          50,
		RouteID:           "route-001",
		Hour:              &hour,
		DayOfWeek:         &dow,
	})

	if err != nil {
		t.Fatalf("Predict (heurístico) error: %v", err)
	}
	if result.PredictorName != "heuristic-v1" {
		t.Errorf("PredictorName: got %q, want \"heuristic-v1\"", result.PredictorName)
	}
	if !result.IsSimulated {
		t.Error("IsSimulated debería ser true para el predictor heurístico")
	}
	if result.OccupancyLevel == "" {
		t.Error("OccupancyLevel no puede estar vacío")
	}
}

// TestOccupancyService_SetPredictor_UsesMock verifica que SetPredictor reemplaza
// el predictor activo y que las llamadas se delegan al mock.
func TestOccupancyService_SetPredictor_UsesMock(t *testing.T) {
	svc := service.NewOccupancyService()

	mockPredictor := &servicemock.MockOccupancyPredictor{
		PredictFunc: func(input service.OccupancyInput) (service.OccupancyResult, error) {
			return service.OccupancyResult{
				OccupancyLevel: service.OccupancyHigh,
				PredictorName:  "test-predictor",
				PredictedRatio: 0.80,
				IsSimulated:    false,
			}, nil
		},
	}

	svc.SetPredictor(mockPredictor)

	result, err := svc.Predict(service.OccupancyInput{
		CurrentPassengers: 45,
		Capacity:          60,
		RouteID:           "route-002",
	})

	if err != nil {
		t.Fatalf("Predict con mock: %v", err)
	}
	if mockPredictor.PredictCallCount != 1 {
		t.Errorf("PredictCallCount: got %d, want 1", mockPredictor.PredictCallCount)
	}
	if result.OccupancyLevel != service.OccupancyHigh {
		t.Errorf("OccupancyLevel: got %v, want HIGH", result.OccupancyLevel)
	}
	if result.PredictorName != "test-predictor" {
		t.Errorf("PredictorName: got %q, want \"test-predictor\"", result.PredictorName)
	}
}

// TestOccupancyService_SetPredictor_PropagatesError verifica que los errores
// del predictor se propagan correctamente al llamador.
func TestOccupancyService_SetPredictor_PropagatesError(t *testing.T) {
	svc := service.NewOccupancyService()
	expectedErr := errors.New("predictor no disponible")

	mockPredictor := &servicemock.MockOccupancyPredictor{
		PredictFunc: func(input service.OccupancyInput) (service.OccupancyResult, error) {
			return service.OccupancyResult{}, expectedErr
		},
	}

	svc.SetPredictor(mockPredictor)

	_, err := svc.Predict(service.OccupancyInput{
		CurrentPassengers: 10,
		Capacity:          50,
	})

	if !errors.Is(err, expectedErr) {
		t.Errorf("Error: got %v, want %v", err, expectedErr)
	}
}

// TestOccupancyService_HeuristicPredictor_Ratios verifica que el predictor
// heurístico calcula ratios correctamente en distintos escenarios.
func TestOccupancyService_HeuristicPredictor_Ratios(t *testing.T) {
	svc := service.NewOccupancyService()

	testCases := []struct {
		name              string
		currentPassengers int
		capacity          int
		wantCurrentRatio  float64
	}{
		{"vacío", 0, 50, 0.0},
		{"mitad", 25, 50, 0.5},
		{"lleno", 50, 50, 1.0},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := svc.Predict(service.OccupancyInput{
				CurrentPassengers: tc.currentPassengers,
				Capacity:          tc.capacity,
			})
			if err != nil {
				t.Fatalf("Predict: %v", err)
			}
			if result.CurrentRatio != tc.wantCurrentRatio {
				t.Errorf("CurrentRatio: got %v, want %v", result.CurrentRatio, tc.wantCurrentRatio)
			}
			if result.CurrentPassengers != tc.currentPassengers {
				t.Errorf("CurrentPassengers: got %d, want %d", result.CurrentPassengers, tc.currentPassengers)
			}
		})
	}
}

// ── MLRemotePredictor tests ───────────────────────────────────────────────────

// TestMLRemotePredictor_Predict_Success verifica el flujo completo:
// OccupancyService → MLRemotePredictor → MockPredictionClient.
func TestMLRemotePredictor_Predict_Success(t *testing.T) {
	mockClient := &transportmock.MockPredictionClient{
		PredictFunc: func(ctx context.Context, req transport.PredictRequest) (*transport.PredictResponse, error) {
			// Verificar que el contexto tiene timeout
			deadline, ok := ctx.Deadline()
			if !ok {
				t.Error("ctx debería tener deadline (timeout)")
			} else {
				remaining := time.Until(deadline)
				if remaining <= 0 || remaining > 10*time.Second {
					t.Errorf("Timeout fuera de rango: %v", remaining)
				}
			}

			// Verificar campos del request
			if req.RouteID != "route-ML" {
				t.Errorf("RouteID: got %q, want \"route-ML\"", req.RouteID)
			}
			if req.CurrentPassengers != 40 {
				t.Errorf("CurrentPassengers: got %d, want 40", req.CurrentPassengers)
			}
			if req.Capacity != 60 {
				t.Errorf("Capacity: got %d, want 60", req.Capacity)
			}

			return &transport.PredictResponse{
				PredictedRatio:      0.78,
				PredictedPassengers: 47,
				OccupancyLevel:      "HIGH",
				Confidence:          0.93,
				PredictorName:       "gradient-boost-v3",
				PredictedAt:         "2026-01-15T08:00:00Z",
			}, nil
		},
	}

	predictor := service.NewMLRemotePredictor(mockClient, 5*time.Second)
	svc := service.NewOccupancyService()
	svc.SetPredictor(predictor)

	result, err := svc.Predict(service.OccupancyInput{
		CurrentPassengers: 40,
		Capacity:          60,
		RouteID:           "route-ML",
	})

	if err != nil {
		t.Fatalf("Predict con MLRemotePredictor: %v", err)
	}
	if result.IsSimulated {
		t.Error("IsSimulated debería ser false para el predictor remoto")
	}
	if result.PredictorName != "gradient-boost-v3" {
		t.Errorf("PredictorName: got %q, want \"gradient-boost-v3\"", result.PredictorName)
	}
	if result.OccupancyLevel != service.OccupancyHigh {
		t.Errorf("OccupancyLevel: got %v, want HIGH", result.OccupancyLevel)
	}
	if result.Confidence != 0.93 {
		t.Errorf("Confidence: got %v, want 0.93", result.Confidence)
	}
	if result.OccupancyText == "" {
		t.Error("OccupancyText no puede estar vacío")
	}
	if result.OccupancyColor == "" {
		t.Error("OccupancyColor no puede estar vacío")
	}
	if mockClient.PredictCallCount != 1 {
		t.Errorf("PredictCallCount: got %d, want 1", mockClient.PredictCallCount)
	}
}

// TestMLRemotePredictor_Predict_ClientError verifica que los errores del
// cliente de transporte se propagan correctamente.
func TestMLRemotePredictor_Predict_ClientError(t *testing.T) {
	expectedErr := errors.New("servidor ML no disponible")

	mockClient := &transportmock.MockPredictionClient{
		PredictFunc: func(ctx context.Context, req transport.PredictRequest) (*transport.PredictResponse, error) {
			return nil, expectedErr
		},
	}

	predictor := service.NewMLRemotePredictor(mockClient, 5*time.Second)
	svc := service.NewOccupancyService()
	svc.SetPredictor(predictor)

	_, err := svc.Predict(service.OccupancyInput{
		CurrentPassengers: 10,
		Capacity:          50,
		RouteID:           "route-err",
	})

	if err == nil {
		t.Fatal("Predict debería haber devuelto error")
	}
	// El error debe envolver el original
	if !errors.Is(err, expectedErr) {
		t.Errorf("Error no envuelve el original: got %v", err)
	}
}

// TestMLRemotePredictor_Predict_NilClient verifica que un cliente nil
// devuelve un error descriptivo en lugar de pánico.
func TestMLRemotePredictor_Predict_NilClient(t *testing.T) {
	predictor := service.NewMLRemotePredictor(nil, 5*time.Second)

	_, err := predictor.Predict(service.OccupancyInput{
		CurrentPassengers: 10,
		Capacity:          50,
	})

	if err == nil {
		t.Fatal("Predict con cliente nil debería devolver error")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestMLRemotePredictor_Name verifica el identificador del predictor.
func TestMLRemotePredictor_Name(t *testing.T) {
	predictor := service.NewMLRemotePredictor(&transportmock.MockPredictionClient{}, 5*time.Second)
	if name := predictor.Name(); name != "ml-remote" {
		t.Errorf("Name(): got %q, want \"ml-remote\"", name)
	}
}

// TestMLRemotePredictor_DefaultTimeout verifica que un timeout de 0 usa el default.
func TestMLRemotePredictor_DefaultTimeout(t *testing.T) {
	var capturedDeadline time.Time

	mockClient := &transportmock.MockPredictionClient{
		PredictFunc: func(ctx context.Context, req transport.PredictRequest) (*transport.PredictResponse, error) {
			deadline, ok := ctx.Deadline()
			if !ok {
				t.Error("ctx debería tener deadline")
			} else {
				capturedDeadline = deadline
			}
			return &transport.PredictResponse{OccupancyLevel: "LOW"}, nil
		},
	}

	// Timeout 0 → debe usar 5s por defecto
	predictor := service.NewMLRemotePredictor(mockClient, 0)
	_, err := predictor.Predict(service.OccupancyInput{Capacity: 50})
	if err != nil {
		t.Fatalf("Predict: %v", err)
	}

	// El deadline debe ser aproximadamente 5s desde ahora
	remaining := time.Until(capturedDeadline)
	if remaining <= 0 || remaining > 6*time.Second {
		t.Errorf("Timeout default fuera de rango esperado (0–6s): %v", remaining)
	}
}

// TestMLRemotePredictor_CurrentRatio_Calculation verifica el cálculo del
// currentRatio a partir de los datos de entrada (no viene del servidor ML).
func TestMLRemotePredictor_CurrentRatio_Calculation(t *testing.T) {
	mockClient := &transportmock.MockPredictionClient{
		PredictFunc: func(ctx context.Context, req transport.PredictRequest) (*transport.PredictResponse, error) {
			return &transport.PredictResponse{
				PredictedRatio: 0.5,
				OccupancyLevel: "MEDIUM",
			}, nil
		},
	}

	predictor := service.NewMLRemotePredictor(mockClient, 5*time.Second)

	result, err := predictor.Predict(service.OccupancyInput{
		CurrentPassengers: 20,
		Capacity:          40,
		RouteID:           "route-ratio",
	})
	if err != nil {
		t.Fatalf("Predict: %v", err)
	}

	// 20/40 = 0.5
	if result.CurrentRatio != 0.5 {
		t.Errorf("CurrentRatio: got %v, want 0.5", result.CurrentRatio)
	}
	if result.CurrentPassengers != 20 {
		t.Errorf("CurrentPassengers: got %d, want 20", result.CurrentPassengers)
	}
}
